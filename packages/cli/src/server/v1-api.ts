import type { IncomingMessage, ServerResponse } from "node:http";
import { handleLegacyApi } from "./legacy-api.js";
import { handlePreviewApi } from "./preview.js";
import { handlePublishedCatalogApi } from "./published-catalog.js";
import type { PublishedCatalogContext, ServerContext } from "./types.js";

function withPath(url: URL, pathname: string): URL {
  const mapped = new URL(url);
  mapped.pathname = pathname;
  return mapped;
}

export async function handleV1Api(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ServerContext,
  publishedCatalog: PublishedCatalogContext,
  basePath: string,
): Promise<boolean> {
  if (!url.pathname.startsWith("/api/v1/")) return false;

  if (url.pathname === "/api/v1/cards") {
    if (context.mode === "published") {
      return handlePublishedCatalogApi(
        req,
        res,
        withPath(url, "/forge/api/catalog-snapshot"),
        publishedCatalog,
      );
    }
    return handleLegacyApi(req, res, withPath(url, "/api/cards"), context, basePath);
  }

  const artifactMatch = url.pathname.match(/^\/api\/v1\/cards\/([^/]+)\/artifact$/);
  if (artifactMatch && context.mode === "published") {
    return handlePublishedCatalogApi(
      req,
      res,
      withPath(url, `/forge/api/artifacts/${artifactMatch[1]}`),
      publishedCatalog,
    );
  }

  const workspaceCardMatch = url.pathname.match(/^\/api\/v1\/cards\/([^/]+)\/(context|contract|handoff)$/);
  if (workspaceCardMatch && context.mode === "workspace") {
    return handleLegacyApi(
      req,
      res,
      withPath(url, `/api/cards/${workspaceCardMatch[1]}/${workspaceCardMatch[2]}`),
      context,
      basePath,
    );
  }

  const sampleMatch = url.pathname.match(/^\/api\/v1\/cards\/([^/]+)\/samples\/([^/]+)$/);
  if (sampleMatch && context.mode === "workspace") {
    return handleLegacyApi(
      req,
      res,
      withPath(url, `/api/cards/${sampleMatch[1]}/samples/${sampleMatch[2]}`),
      context,
      basePath,
    );
  }

  if (url.pathname === "/api/v1/components") {
    return handleLegacyApi(req, res, withPath(url, "/api/component-baseline"), context, basePath);
  }
  if (url.pathname === "/api/v1/install") {
    return handleLegacyApi(req, res, withPath(url, "/api/install"), context, basePath);
  }
  if (url.pathname === "/api/v1/preview/session") {
    return handlePreviewApi(req, res, withPath(url, "/api/preview/v1/session"), context);
  }
  if (url.pathname === "/api/v1/preview/compile") {
    return handlePreviewApi(req, res, withPath(url, "/api/preview/v1/render"), context);
  }
  if (url.pathname === "/api/v1/profiles/host-config") {
    return handlePreviewApi(req, res, withPath(url, "/api/preview/v1/profile/host-config.json"), context);
  }
  if (url.pathname === "/api/v1/profiles/styles.css") {
    return handlePreviewApi(req, res, withPath(url, "/api/preview/v1/profile/styles.css"), context);
  }
  return false;
}
