import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import path from "node:path";
import { verifyCardArtifact } from "@mlt-org/octo-card-artifact";
import {
  parseCatalogSnapshot,
  type CatalogSnapshotV1,
} from "@mlt-org/octo-card-catalog-snapshot";
import type {
  ForgeRuntimeDescriptorV1,
  ForgeRuntimeMode,
} from "@mlt-org/octo-card-spec";
import {
  buildHandoffArchive,
  buildHandoffArchiveForCard,
} from "./handoff.js";
import {
  compileCard,
  compileCardPackage,
  compileSample,
  compileSampleFromPackage,
} from "./compiler.js";
import { compileLoadedCard, loadCardRuntime } from "./core-adapter.js";
import {
  getCard,
  getCurrentRenderProfile,
  getRenderProfile,
  listCards,
  loadCardPackage,
  resolveCardAssetPath,
} from "./registry.js";
import { loadRenderProfileForReference } from "./profile-source.js";
import { readJson, readText, resolveInProject } from "./fs.js";
import type {
  CardPackage,
  JsonObject,
  RenderProfileSource,
} from "./types.js";
import {
  buildPreviewRenderResponse,
  buildPreviewSession,
} from "./preview.js";

interface ServerContext {
  mode: ForgeRuntimeMode;
  card?: CardPackage;
  profile?: RenderProfileSource;
}

class PreviewHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PreviewHttpError";
  }
}

export interface ForgeServerOptions {
  port?: number;
  host?: string;
  cardRoot?: string;
  profile?: RenderProfileSource;
  basePath?: string;
  catalogSnapshotUrl?: string;
  catalogFetch?: typeof fetch;
  forgeWebRoot?: string;
}

export const DEFAULT_CATALOG_SNAPSHOT_URL =
  "https://github.com/LLwill/octo-card-catalog/releases/download/catalog-snapshot/6b7623cfb919eb737e7cb1bce91195749f30c9b7/catalog-snapshot.v1.json";

interface PublishedCatalogContext {
  snapshotUrl: string;
  fetch: typeof fetch;
  snapshot?: Promise<CatalogSnapshotV1>;
}

class PublishedCatalogError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PublishedCatalogError";
  }
}

export function normalizeBasePath(value = "/"): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/+$/, "");
  const segments = normalized.split("/").slice(1);
  if (
    !normalized ||
    segments.some((segment) => segment === "." || segment === "..") ||
    !/^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+$/.test(normalized)
  ) {
    throw new Error(`Invalid BASE_PATH: ${value}`);
  }
  return normalized;
}

function publicPath(basePath: string, pathname: string): string {
  return `${basePath}${pathname}` || "/";
}

function stripBasePath(pathname: string, basePath: string): string | undefined {
  if (!basePath) return pathname;
  if (pathname === basePath || pathname === `${basePath}/`) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  return undefined;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function escapeInlineScript(value: string): string {
  return value
    .replaceAll("<", "\\u003C")
    .replaceAll(">", "\\u003E")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function renderHtml(value: string, basePath: string): string {
  const baseHref = `${basePath || ""}/`;
  const runtimePath = escapeInlineScript(JSON.stringify(basePath));
  return value.replace(
    "<head>",
    `<head>\n    <base href="${escapeHtmlAttribute(baseHref)}" />\n    <script>window.__OCTO_BASE_PATH__ = ${runtimePath};</script>`,
  );
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

async function loadPublishedCatalogSnapshot(
  context: PublishedCatalogContext,
): Promise<CatalogSnapshotV1> {
  if (!context.snapshot) {
    context.snapshot = (async () => {
      const response = await context.fetch(context.snapshotUrl, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new PublishedCatalogError(
          502,
          "catalog.snapshot_unavailable",
          `Catalog snapshot request failed (${response.status})`,
        );
      }
      try {
        return parseCatalogSnapshot(new Uint8Array(await response.arrayBuffer()));
      } catch (error) {
        throw new PublishedCatalogError(
          502,
          "catalog.snapshot_invalid",
          error instanceof Error ? error.message : "Catalog snapshot is invalid",
        );
      }
    })().catch((error) => {
      context.snapshot = undefined;
      throw error;
    });
  }
  return context.snapshot;
}

async function handlePublishedCatalogApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: PublishedCatalogContext,
): Promise<boolean> {
  if (!url.pathname.startsWith("/forge/api/")) return false;

  try {
    if (req.method === "GET" && url.pathname === "/forge/api/catalog-snapshot") {
      sendJson(res, 200, await loadPublishedCatalogSnapshot(context));
      return true;
    }

    const artifactMatch = url.pathname.match(/^\/forge\/api\/artifacts\/([^/]+)$/);
    if (req.method === "GET" && artifactMatch) {
      const reference = decodeURIComponent(artifactMatch[1]);
      const snapshot = await loadPublishedCatalogSnapshot(context);
      const version = snapshot.cards
        .flatMap((card) => card.versions)
        .find((candidate) => candidate.reference === reference);
      if (!version) {
        throw new PublishedCatalogError(
          404,
          "catalog.artifact_not_found",
          `Card artifact ${reference} is not present in the active snapshot`,
        );
      }
      const response = await context.fetch(version.artifact.url, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new PublishedCatalogError(
          502,
          "catalog.artifact_unavailable",
          `Card artifact request failed (${response.status})`,
        );
      }
      const verification = verifyCardArtifact(
        new Uint8Array(await response.arrayBuffer()),
        version.artifact.sha256,
      );
      if (!verification.valid || !verification.artifact) {
        throw new PublishedCatalogError(
          502,
          "catalog.artifact_invalid",
          verification.issues.map((issue) => issue.message).join("; ") || "Card artifact is invalid",
        );
      }
      const actualReference = `${verification.artifact.card.id}@${verification.artifact.card.version}`;
      if (actualReference !== reference) {
        throw new PublishedCatalogError(
          502,
          "catalog.artifact_identity_mismatch",
          `Card artifact identity mismatch: expected ${reference}, received ${actualReference}`,
        );
      }
      sendJson(res, 200, verification.artifact);
      return true;
    }

    sendJson(res, 404, { code: "catalog.not_found", message: "Catalog endpoint was not found" });
    return true;
  } catch (error) {
    if (error instanceof PublishedCatalogError) {
      sendJson(res, error.status, { code: error.code, message: error.message });
      return true;
    }
    sendJson(res, 502, {
      code: "catalog.upstream_error",
      message: error instanceof Error ? error.message : "Published catalog request failed",
    });
    return true;
  }
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

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolvePreviewCard(
  context: ServerContext,
  requestedReference: string | undefined
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
        "The requested card does not match this preview session"
      );
    }
    return context.card;
  }
  if (!requestedReference) {
    throw new PreviewHttpError(
      400,
      "preview.card_required",
      "cardId is required for a catalog preview session"
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
  requestedReference: string | undefined
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
      "A JSON object request body is required"
    );
  }
}

async function handlePreviewApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ServerContext
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
        url.searchParams.get("cardId") ?? undefined
      );
      sendJson(res, 200, profile.hostConfig);
      return true;
    }

    if (req.method === "GET" && url.pathname === "/api/preview/v1/profile/styles.css") {
      const profile = await resolvePreviewProfile(
        context,
        url.searchParams.get("cardId") ?? undefined
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
          "cardId, revision, view and object data are required"
        );
      }
      const card = await resolvePreviewCard(context, body.cardId);
      const runtime = await loadCardRuntime(card, context.profile);
      if (body.revision !== runtime.revision) {
        throw new PreviewHttpError(
          409,
          "preview.stale_revision",
          "The preview revision is stale; request a new session"
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
          "The card could not be rendered"
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

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ServerContext,
  basePath: string,
): Promise<boolean> {
  if (await handlePreviewApi(req, res, url, context)) return true;

  if (req.method === "GET" && url.pathname === "/api/v1/runtime") {
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

  if (req.method === "GET" && url.pathname === "/healthz") {
    sendJson(res, 200, { status: "ok" });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/cards") {
    const cards = context.card ? [context.card] : await listCards();
    sendJson(
      res,
      200,
      cards.map((card) => ({
        reference: card.reference,
        id: card.manifest.id,
        name: card.manifest.name,
        kind: card.kind,
        mutable: card.mutable,
        version: card.manifest.version,
        contractVersion: card.manifest.contractVersion,
        renderProfile: card.manifest.renderProfile,
        samples: Object.fromEntries(
          Object.entries(card.manifest.views).map(([view, definition]) => [
            view,
            definition.samples.map((sample) => path.basename(sample, ".json")),
          ])
        ),
      }))
    );
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/install") {
    const packageManifest = await readJson<{
      name: string;
      version: string;
    }>(resolveInProject("package.json"));
    const skillManifest = await readJson<{
      skill: { name: string; version: string; entry: string };
      cli: { package: string; compatibleRange: string; recommendedVersion: string };
      renderProfiles: Array<{
        id: string;
        package: string;
        compatibleRange: string;
        recommendedVersion: string;
      }>;
    }>(resolveInProject("skills", "octo-design-cards", "skill-manifest.json"));
    const installManifest = await readJson<{
      skill: { bundleUrl: string; releaseUrl: string; sha256: string };
    }>(resolveInProject("web", "install-manifest.json"));
    const profile = context.profile ?? await getCurrentRenderProfile();
    const profileManifest = skillManifest.renderProfiles.find(
      (candidate) => candidate.id === profile.manifest.id
    ) ?? skillManifest.renderProfiles[0];
    sendJson(res, 200, {
      cli: {
        package: packageManifest.name,
        version: packageManifest.version,
        compatibleRange: skillManifest.cli.compatibleRange,
        npmUrl: `https://www.npmjs.com/package/${packageManifest.name}/v/${packageManifest.version}`,
        installCommand: `npm install --save-dev ${packageManifest.name}@${packageManifest.version} ${profile.manifest.packageName}@${profile.manifest.version}`,
        initCommand: "npx --no-install octo-card agent init --target generic",
      },
      skill: {
        name: skillManifest.skill.name,
        version: skillManifest.skill.version,
        entry: skillManifest.skill.entry,
        bundleUrl: installManifest.skill.bundleUrl,
        releaseUrl: installManifest.skill.releaseUrl,
        sha256: installManifest.skill.sha256,
      },
      renderProfile: {
        id: profile.manifest.id,
        version: profile.manifest.version,
        source: profile.source ?? "workspace",
        package: profile.manifest.packageName,
        compatibility: profile.manifest.compatibility,
        compatibleRange: profileManifest?.compatibleRange,
      },
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/component-baseline") {
    const profile = context.profile ?? await getCurrentRenderProfile();
    if (!profile.componentCatalog) {
      sendJson(res, 500, {
        code: "component_catalog_missing",
        message: `Render profile ${profile.reference} does not carry a static component catalog`,
      });
      return true;
    }
    sendJson(res, 200, {
      reference: profile.reference,
      renderProfile: profile.manifest,
      hostConfig: profile.hostConfig,
      capabilities: profile.capabilities,
      stylesheetUrl: publicPath(basePath, `/api/render-styles/${encodeURIComponent(profile.reference)}`),
      catalog: profile.componentCatalog,
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
            ? await compileSampleFromPackage({
                card,
                sample,
                view,
                profile: context.profile,
              })
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
        schema: await readJson(
          resolveCardAssetPath(card.root, card.manifest.dataSchema, "dataSchema")
        ),
        interactionReports,
      });
    } else {
      const profile =
        context.profile ?? await getRenderProfile(card.manifest.renderProfile);
      sendJson(res, 200, {
        card: card.manifest,
        package: {
          reference: card.reference,
          kind: card.kind,
          mutable: card.mutable,
        },
        renderProfile: profile.manifest,
        renderProfileSource: profile.source ?? "workspace",
        hostConfig: profile.hostConfig,
        stylesheetUrl: publicPath(basePath, `/api/render-styles/${encodeURIComponent(profile.reference)}`),
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
          view: url.searchParams.get("view") ?? undefined,
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
      template: await readJson(
        resolveCardAssetPath(card.root, view.template, `views.${viewName}.template`)
      ),
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
    mode: card || profile ? "workspace" : "published",
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
      if (await handleApi(req, res, routeUrl, context, basePath)) return;
      const forgeFiles: Record<string, [string, string]> = {
        "/forge/": ["index.html", "text/html"],
        "/forge/app.js": ["app.js", "text/javascript"],
        "/forge/app.js.map": ["app.js.map", "application/json"],
        "/forge/styles.css": ["styles.css", "text/css"],
      };
      const forgeFile = forgeFiles[routePath];
      if (req.method === "GET" && forgeFile) {
        const content = await readText(path.join(forgeWebRoot, forgeFile[0]));
        sendText(res, 200, forgeFile[1], content);
        return;
      }
      const files: Record<string, [string, string]> = {
        "/": ["index.html", "text/html"],
        "/components": ["components.html", "text/html"],
        "/components/": ["components.html", "text/html"],
        "/install": ["install.html", "text/html"],
        "/install/": ["install.html", "text/html"],
        "/app.js": ["app.js", "text/javascript"],
        "/preview-kit.js": ["preview-kit.js", "text/javascript"],
        "/components.js": ["components.js", "text/javascript"],
        "/install.js": ["install.js", "text/javascript"],
        "/styles.css": ["styles.css", "text/css"],
      };
      const file = files[routePath];
      if (req.method === "GET" && file) {
        const content = await readText(path.join(webRoot, file[0]));
        sendText(res, 200, file[1], file[1] === "text/html" ? renderHtml(content, basePath) : content);
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
