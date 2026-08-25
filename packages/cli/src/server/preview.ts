import type { IncomingMessage, ServerResponse } from "node:http";
import { compileLoadedCard, loadCardRuntime } from "../core-adapter.js";
import { buildPreviewRenderResponse, buildPreviewSession } from "../preview.js";
import { getCard } from "../registry.js";
import { loadRenderProfileForReference } from "../profile-source.js";
import type { CardPackage, JsonObject, RenderProfileSource } from "../types.js";
import { isJsonObject, readBody, sendJson, sendText } from "./http.js";
import type { ServerContext } from "./types.js";

class PreviewHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PreviewHttpError";
  }
}

async function resolvePreviewCard(
  context: ServerContext,
  requestedReference: string | undefined,
): Promise<CardPackage> {
  if (context.card) {
    if (
      requestedReference &&
      requestedReference !== context.card.reference &&
      requestedReference !== context.card.manifest.id
    ) {
      throw new PreviewHttpError(
        409,
        "preview.card_mismatch",
        "The requested card does not match this preview session",
      );
    }
    return context.card;
  }
  if (!requestedReference) {
    throw new PreviewHttpError(
      400,
      "preview.card_required",
      "cardId is required for a catalog preview session",
    );
  }
  try {
    return await getCard(requestedReference);
  } catch {
    throw new PreviewHttpError(404, "preview.card_not_found", "Card was not found");
  }
}

async function resolvePreviewProfile(
  context: ServerContext,
  requestedReference: string | undefined,
): Promise<RenderProfileSource> {
  if (requestedReference) {
    const card = await resolvePreviewCard(context, requestedReference);
    return (await loadCardRuntime(card, context.profile)).profile;
  }
  if (context.profile) return context.profile;
  return loadRenderProfileForReference();
}

async function readPreviewBody(req: IncomingMessage): Promise<JsonObject> {
  try {
    const body = await readBody(req);
    if (!isJsonObject(body)) throw new Error("body must be an object");
    return body;
  } catch {
    throw new PreviewHttpError(
      400,
      "preview.invalid_request",
      "A JSON object request body is required",
    );
  }
}

export async function handlePreviewApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ServerContext,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/preview/v1/")) return false;

  try {
    if (req.method === "GET" && url.pathname === "/api/preview/v1/session") {
      const card = await resolvePreviewCard(context, url.searchParams.get("cardId") ?? undefined);
      const runtime = await loadCardRuntime(card, context.profile);
      sendJson(res, 200, buildPreviewSession(runtime));
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/preview/v1/profile/host-config.json") {
      const profile = await resolvePreviewProfile(
        context,
        url.searchParams.get("cardId") ?? undefined,
      );
      sendJson(res, 200, profile.hostConfig);
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/preview/v1/profile/styles.css") {
      const profile = await resolvePreviewProfile(
        context,
        url.searchParams.get("cardId") ?? undefined,
      );
      sendText(res, 200, "text/css", (profile.stylesheets ?? []).join("\n"));
      return true;
    }

    if (req.method === "POST" && url.pathname === "/api/preview/v1/render") {
      const body = await readPreviewBody(req);
      if (
        typeof body.cardId !== "string" ||
        typeof body.revision !== "string" ||
        typeof body.view !== "string" ||
        !isJsonObject(body.data)
      ) {
        throw new PreviewHttpError(
          400,
          "preview.invalid_request",
          "cardId, revision, view and object data are required",
        );
      }
      const card = await resolvePreviewCard(context, body.cardId);
      const runtime = await loadCardRuntime(card, context.profile);
      if (body.revision !== runtime.revision) {
        throw new PreviewHttpError(
          409,
          "preview.stale_revision",
          "The preview revision is stale; request a new session",
        );
      }
      let result;
      try {
        result = compileLoadedCard(runtime, body.view, body.data);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Unknown view ")) {
          throw new PreviewHttpError(404, "preview.view_not_found", "View was not found");
        }
        throw new PreviewHttpError(
          422,
          "preview.render_failed",
          "The card could not be rendered",
        );
      }
      const response = buildPreviewRenderResponse(runtime, result);
      sendJson(res, response.valid ? 200 : 422, response);
      return true;
    }

    sendJson(res, 404, { code: "preview.not_found", message: "Preview endpoint was not found" });
    return true;
  } catch (error) {
    if (error instanceof PreviewHttpError) {
      sendJson(res, error.status, { code: error.code, message: error.message });
      return true;
    }
    sendJson(res, 500, {
      code: "preview.internal_error",
      message: "Preview request could not be completed",
    });
    return true;
  }
}
