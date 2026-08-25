import type { IncomingMessage, ServerResponse } from "node:http";
import type { ForgeRuntimeDescriptorV1 } from "@mlt-org/octo-card-spec";
import { sendJson } from "./http.js";
import type { ServerContext } from "./types.js";

export function handleRuntimeApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ServerContext,
): boolean {
  if (req.method !== "GET" || url.pathname !== "/api/v1/runtime") return false;

  const descriptor: ForgeRuntimeDescriptorV1 = {
    schemaVersion: 1,
    mode: context.mode,
    capabilities: context.mode === "workspace"
      ? {
          cardCatalog: true,
          componentCatalog: Boolean(context.profile?.componentCatalog),
          templateDataPreview: true,
          rawCardPreview: false,
          handoffDownload: true,
        }
      : {
          cardCatalog: true,
          componentCatalog: false,
          templateDataPreview: false,
          rawCardPreview: false,
          handoffDownload: false,
        },
  };
  sendJson(res, 200, descriptor);
  return true;
}
