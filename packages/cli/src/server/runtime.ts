import type { IncomingMessage, ServerResponse } from "node:http";
import type { ForgeRuntimeDescriptorV1 } from "@mlt-org/octo-card-spec";
import { loadRenderProfileForReference } from "../profile-source.js";
import { sendJson } from "./http.js";
import type { ServerContext } from "./types.js";

export async function handleRuntimeApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ServerContext,
): Promise<boolean> {
  if (req.method !== "GET" || url.pathname !== "/api/v1/runtime") return false;

  if (!context.profile) {
    try {
      context.profile = await loadRenderProfileForReference();
    } catch {
      // Published card browsing remains available when no profile package is installed.
    }
  }

  const descriptor: ForgeRuntimeDescriptorV1 = {
    schemaVersion: 1,
    mode: context.mode,
    capabilities: context.mode === "workspace"
      ? {
          cardCatalog: true,
          componentCatalog: Boolean(context.profile?.componentCatalog),
          templateDataPreview: true,
          rawCardPreview: Boolean(context.profile),
          handoffDownload: true,
        }
      : {
          cardCatalog: true,
          componentCatalog: Boolean(context.profile?.componentCatalog),
          templateDataPreview: false,
          rawCardPreview: Boolean(context.profile),
          handoffDownload: true,
        },
    ...(context.mode === "published" && context.publishedCatalog?.root
      ? {
          deployment: {
            ready: context.publishedCatalog.ready,
            catalogSource: context.publishedCatalog.root ? "local" as const : "remote" as const,
            ...(context.forgeRevision ? { forgeRevision: context.forgeRevision } : {}),
            ...(context.publishedCatalog.bundle
              ? {
                  catalogRevision: context.publishedCatalog.bundle.release.catalogRevision,
                  cards: context.publishedCatalog.bundle.release.cards,
                  versions: context.publishedCatalog.bundle.release.versions,
                }
              : {}),
            ...(context.catalogImageDigest ? { catalogImageDigest: context.catalogImageDigest } : {}),
          },
        }
      : {}),
  };
  sendJson(res, 200, descriptor);
  return true;
}
