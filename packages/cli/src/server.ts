import {
  createServer,
  type Server,
} from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { loadCardPackage } from "./registry.js";
import { loadRenderProfileForReference } from "./profile-source.js";
import { resolveInProject } from "./fs.js";
import type { CardPackage } from "./types.js";
import {
  normalizeBasePath,
  publicPath,
  sendJson,
  stripBasePath,
} from "./server/http.js";
import {
  DEFAULT_CATALOG_SNAPSHOT_URL,
  handlePublishedCatalogApi,
} from "./server/published-catalog.js";
import { handleRuntimeApi } from "./server/runtime.js";
import { handlePreviewApi } from "./server/preview.js";
import { handleLegacyApi } from "./server/legacy-api.js";
import { handleStaticAsset } from "./server/static-assets.js";
import { handleV1Api } from "./server/v1-api.js";
import type {
  ForgeServerOptions,
  PublishedCatalogContext,
  ServerContext,
} from "./server/types.js";

export { normalizeBasePath } from "./server/http.js";
export { DEFAULT_CATALOG_SNAPSHOT_URL } from "./server/published-catalog.js";
export type { ForgeServerOptions } from "./server/types.js";

async function prepareForgeServer(options: ForgeServerOptions = {}): Promise<{
  server: Server;
  card?: CardPackage;
  basePath: string;
}> {
  const host = options.host ?? "127.0.0.1";
  const basePath = normalizeBasePath(options.basePath);
  const card = options.cardRoot ? await loadCardPackage(options.cardRoot) : undefined;
  const profile = card
    ? await loadRenderProfileForReference(card.manifest.renderProfile, options.profile)
    : options.profile;
  const context: ServerContext = {
    mode: card ? "workspace" : "published",
    card,
    profile,
  };
  const publishedCatalog: PublishedCatalogContext = {
    snapshotUrl: options.catalogSnapshotUrl ?? DEFAULT_CATALOG_SNAPSHOT_URL,
    fetch: options.catalogFetch ?? fetch,
  };
  const webRoot = resolveInProject("web");
  const forgeWebRoot = options.forgeWebRoot
    ? path.resolve(options.forgeWebRoot)
    : resolveInProject("apps", "forge-web", "dist");
  const server = createServer(async (req, res) => {
    res.setHeader("x-request-id", randomUUID());
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "content-security-policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; connect-src 'self' https:; frame-src 'self'",
    );
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? host}`);
      if (basePath && url.pathname === basePath) {
        res.writeHead(308, { location: `${basePath}/${url.search}` });
        res.end();
        return;
      }
      const routePath = stripBasePath(url.pathname, basePath);
      if (routePath === undefined) {
        sendJson(res, 404, { code: "not_found" });
        return;
      }
      const routeUrl = new URL(url);
      routeUrl.pathname = routePath;
      if (routePath === "/forge") {
        res.writeHead(308, { location: publicPath(basePath, `/forge/${url.search}`) });
        res.end();
        return;
      }
      if (await handlePublishedCatalogApi(req, res, routeUrl, publishedCatalog)) return;
      if (await handlePreviewApi(req, res, routeUrl, context)) return;
      if (await handleRuntimeApi(req, res, routeUrl, context)) return;
      if (await handleV1Api(req, res, routeUrl, context, publishedCatalog, basePath)) return;
      if (await handleLegacyApi(req, res, routeUrl, context, basePath)) return;
      if (await handleStaticAsset(req, res, routePath, { basePath, forgeWebRoot, webRoot })) return;
      sendJson(res, 404, { code: "not_found" });
    } catch (error) {
      sendJson(res, 500, {
        code: "internal_error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return { server, card, basePath };
}

export async function createForgeServer(
  options: ForgeServerOptions = {}
): Promise<Server> {
  return (await prepareForgeServer(options)).server;
}

export async function startServer(options: ForgeServerOptions = {}): Promise<void> {
  const port = options.port ?? 4318;
  const host = options.host ?? "127.0.0.1";
  const { server, card, basePath } = await prepareForgeServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const label = card ? ` (${card.manifest.id})` : "";
  console.log(`Octo Card Forge${label}: http://${host}:${port}${basePath || "/"}`);
}
