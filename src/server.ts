import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import {
  compileCard,
  compileCardPackage,
  compileSample,
  compileSampleFromPackage,
} from "./compiler.js";
import {
  buildComponentBaseline,
  buildComponentBaselineGroups,
} from "./component-baseline.js";
import { readJson, readText, resolveInProject } from "./fs.js";
import { buildHandoffArchive, buildHandoffArchiveForCard } from "./handoff.js";
import { loadRenderProfileForReference } from "./profile-source.js";
import {
  getCard,
  getCurrentRenderProfile,
  getRenderProfile,
  loadCardPackage,
  listCards,
} from "./registry.js";
import type { CardPackage, JsonObject, RenderProfileSource } from "./types.js";

interface ServerContext {
  card?: CardPackage;
  profile?: RenderProfileSource;
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value, null, 2));
}

function sendBinaryDownload(
  res: ServerResponse,
  fileName: string,
  contentType: string,
  value: Buffer
): void {
  res.writeHead(200, {
    "content-type": contentType,
    "content-disposition": `attachment; filename="${fileName}"`,
    "content-length": value.byteLength,
    "cache-control": "no-store",
  });
  res.end(value);
}

function sendText(
  res: ServerResponse,
  status: number,
  contentType: string,
  value: string
): void {
  res.writeHead(status, { "content-type": `${contentType}; charset=utf-8` });
  res.end(value);
}

async function readBody(req: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 256 * 1024) throw new Error("Request body exceeds 256 KiB");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonObject;
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ServerContext
): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/api/cards") {
    const cards = context.card ? [context.card] : await listCards();
    sendJson(
      res,
      200,
      cards.map(({ reference, manifest }) => ({
        reference,
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        contractVersion: manifest.contractVersion,
        renderProfile: manifest.renderProfile,
        samples: Object.fromEntries(
          Object.entries(manifest.views).map(([view, definition]) => [
            view,
            definition.samples.map((sample) => path.basename(sample, ".json")),
          ])
        ),
      }))
    );
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/component-baseline") {
    const profile = context.profile ?? await getCurrentRenderProfile();
    sendJson(res, 200, {
      reference: profile.reference,
      renderProfile: profile.manifest,
      hostConfig: profile.hostConfig,
      capabilities: profile.capabilities,
      stylesheetUrl: `/api/render-styles/${encodeURIComponent(profile.reference)}`,
      sections: buildComponentBaseline(profile.capabilities),
      groups: buildComponentBaselineGroups(profile.capabilities),
    });
    return true;
  }

  const handoffMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/handoff$/);
  if (req.method === "GET" && handoffMatch) {
    const cardId = decodeURIComponent(handoffMatch[1]);
    const archive = context.card
      ? await buildHandoffArchiveForCard(context.card, context.profile)
      : await buildHandoffArchive(cardId);
    sendBinaryDownload(
      res,
      archive.fileName,
      "application/zip",
      archive.buffer
    );
    return true;
  }

  const cardMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/(contract|context)$/);
  if (req.method === "GET" && cardMatch) {
    const cardReference = decodeURIComponent(cardMatch[1]);
    const card = context.card ?? await getCard(cardReference);
    if (cardMatch[2] === "contract") {
      const interactionReports = [];
      for (const [view, definition] of Object.entries(card.manifest.views)) {
        for (const samplePath of definition.samples) {
          const sample = path.basename(samplePath, path.extname(samplePath));
          const result = context.card
            ? await compileSampleFromPackage({ card, sample, profile: context.profile })
            : await compileSample({ cardId: card.reference, sample });
          interactionReports.push({
            sample,
            view,
            wireProfile: definition.wireProfile,
            inspection: result.inspection,
          });
        }
      }
      sendJson(res, 200, {
        cardId: card.manifest.id,
        cardReference: card.reference,
        cardVersion: card.manifest.version,
        contractVersion: card.manifest.contractVersion,
        schema: await readJson(path.join(card.root, card.manifest.dataSchema)),
        interactionReports,
      });
    } else {
      const profile =
        context.profile ?? await getRenderProfile(card.manifest.renderProfile);
      sendJson(res, 200, {
        card: card.manifest,
        renderProfile: profile.manifest,
        hostConfig: profile.hostConfig,
        stylesheetUrl: `/api/render-styles/${encodeURIComponent(profile.reference)}`,
      });
    }
    return true;
  }

  const sampleMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/samples\/([^/]+)$/);
  if (req.method === "GET" && sampleMatch) {
    const sample = decodeURIComponent(sampleMatch[2]);
    const result = context.card
      ? await compileSampleFromPackage({
          card: context.card,
          sample,
          profile: context.profile,
        })
      : await compileSample({
          cardId: decodeURIComponent(sampleMatch[1]),
          sample,
        });
    sendJson(res, 200, result);
    return true;
  }

  const templateMatch = url.pathname.match(
    /^\/api\/cards\/([^/]+)\/views\/([^/]+)\/template$/
  );
  if (req.method === "GET" && templateMatch) {
    const card = context.card ?? await getCard(decodeURIComponent(templateMatch[1]));
    const viewName = decodeURIComponent(templateMatch[2]);
    const view = card.manifest.views[viewName];
    if (!view) {
      sendJson(res, 404, { code: "view_not_found", message: `Unknown view: ${viewName}` });
      return true;
    }
    sendJson(res, 200, {
      cardId: card.manifest.id,
      cardReference: card.reference,
      view: viewName,
      wireProfile: view.wireProfile,
      template: await readJson(path.join(card.root, view.template)),
    });
    return true;
  }

  const styleMatch = url.pathname.match(/^\/api\/render-styles\/(.+)$/);
  if (req.method === "GET" && styleMatch) {
    const requested = decodeURIComponent(styleMatch[1]);
    const profile =
      context.profile && requested === context.profile.reference
        ? context.profile
        : await getRenderProfile(requested);
    const stylesheets = profile.stylesheets ?? [
      profile.manifest.theme
        ? await readText(path.join(profile.root, profile.manifest.theme))
        : "",
      await readText(path.join(profile.root, profile.manifest.stylesheet)),
    ].filter(Boolean);
    sendText(
      res,
      200,
      "text/css",
      stylesheets.join("\n")
    );
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/render") {
    const body = await readBody(req);
    if (
      typeof body.cardId !== "string" ||
      typeof body.view !== "string" ||
      typeof body.data !== "object" ||
      body.data === null ||
      Array.isArray(body.data)
    ) {
      sendJson(res, 400, {
        code: "invalid_request",
        message: "cardId, view and object data are required",
      });
      return true;
    }
    const result = context.card
      ? await compileCardPackage({
          card: context.card,
          view: body.view,
          data: body.data as JsonObject,
          profile: context.profile,
        })
      : await compileCard({
          cardId: body.cardId,
          view: body.view,
          data: body.data as JsonObject,
        });
    const valid = !result.issues.some((issue) => issue.severity === "error");
    sendJson(res, valid ? 200 : 422, { valid, ...result });
    return true;
  }
  return false;
}

export async function startServer(options: {
  port?: number;
  host?: string;
  cardRoot?: string;
  profile?: RenderProfileSource;
} = {}): Promise<void> {
  const port = options.port ?? 4318;
  const host = options.host ?? "127.0.0.1";
  const card = options.cardRoot ? await loadCardPackage(options.cardRoot) : undefined;
  const profile = card
    ? await loadRenderProfileForReference(card.manifest.renderProfile, options.profile)
    : options.profile;
  const context: ServerContext = { card, profile };
  const webRoot = resolveInProject("web");
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);
      if (await handleApi(req, res, url, context)) return;
      const files: Record<string, [string, string]> = {
        "/": ["index.html", "text/html"],
        "/components": ["components.html", "text/html"],
        "/components/": ["components.html", "text/html"],
        "/app.js": ["app.js", "text/javascript"],
        "/components.js": ["components.js", "text/javascript"],
        "/styles.css": ["styles.css", "text/css"],
      };
      const file = files[url.pathname];
      if (req.method === "GET" && file) {
        sendText(res, 200, file[1], await readText(path.join(webRoot, file[0])));
        return;
      }
      sendJson(res, 404, { code: "not_found" });
    } catch (error) {
      sendJson(res, 500, {
        code: "internal_error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const label = card ? ` (${card.manifest.id})` : "";
  console.log(`Octo Card Forge${label}: http://${host}:${port}`);
}
