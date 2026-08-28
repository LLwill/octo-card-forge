import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "./http.js";
import type { ServerContext } from "./types.js";

export function handleHealthApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ServerContext,
): boolean {
  if (req.method === "GET" && url.pathname === "/healthz") {
    sendJson(res, 200, { status: "ok" });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/readyz") {
    const ready = context.mode !== "published" || context.publishedCatalog?.ready === true;
    sendJson(res, ready ? 200 : 503, {
      status: ready ? "ready" : "not_ready",
      ...(ready || !context.publishedCatalog?.error ? {} : { message: context.publishedCatalog.error }),
    });
    return true;
  }

  return false;
}
