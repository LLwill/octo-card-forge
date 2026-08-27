import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { verifyCardArtifact } from "@mlt-org/octo-card-artifact";
import JSZip from "jszip";
import {
  parseCatalogSnapshot,
  type CatalogSnapshotV1,
} from "@mlt-org/octo-card-catalog-snapshot";
import {
  catalogArtifactPath,
  catalogHandoffFilePath,
  catalogHandoffPath,
  catalogProfilePath,
  loadCatalogBundle,
  loadCatalogHandoffIndex,
  readCatalogBundleFile,
} from "./catalog-bundle.js";
import { sendBinaryDownload, sendBuffer, sendJson, sendText } from "./http.js";
import type { PublishedCatalogContext } from "./types.js";

export const DEFAULT_CATALOG_SNAPSHOT_URL =
  "https://github.com/LLwill/octo-card-catalog/releases/download/catalog-snapshot/6b7623cfb919eb737e7cb1bce91195749f30c9b7/catalog-snapshot.v1.json";

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

const MAX_HANDOFF_BYTES = 10 * 1024 * 1024;
const MAX_HANDOFF_FILE_BYTES = 1024 * 1024;
const MAX_HANDOFF_FILES = 200;
const MAX_HANDOFF_EXPANDED_BYTES = 40 * 1024 * 1024;

export async function initializePublishedCatalog(context: PublishedCatalogContext): Promise<void> {
  if (!context.root) {
    context.ready = true;
    return;
  }
  try {
    context.bundle = await loadCatalogBundle(context.root);
    context.snapshot = Promise.resolve(context.bundle.snapshot);
    context.ready = true;
  } catch (error) {
    context.ready = false;
    context.error = error instanceof Error ? error.message : String(error);
  }
}

function requireReady(context: PublishedCatalogContext): void {
  if (!context.ready) {
    throw new PublishedCatalogError(
      503,
      "catalog.not_ready",
      context.error ?? "Catalog is not ready",
    );
  }
}

async function loadPublishedHandoff(
  context: PublishedCatalogContext,
  reference: string,
): Promise<{ buffer: Buffer; sha256: string }> {
  const snapshot = await loadPublishedCatalogSnapshot(context);
  const version = snapshot.cards
    .flatMap((card) => card.versions)
    .find((candidate) => candidate.reference === reference);
  if (!version?.handoff) {
    throw new PublishedCatalogError(
      404,
      "catalog.handoff_not_found",
      `Backend handoff ${reference} is not present in the active snapshot`,
    );
  }
  if (context.root) {
    const buffer = await readCatalogBundleFile(context.root, catalogHandoffPath(reference));
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    if (actualSha256 !== version.handoff.sha256) {
      throw new PublishedCatalogError(502, "catalog.handoff_digest_mismatch", `Backend handoff digest mismatch for ${reference}`);
    }
    return { buffer, sha256: actualSha256 };
  }
  if (!context.snapshotUrl) throw new PublishedCatalogError(503, "catalog.not_configured", "Catalog source is not configured");
  const response = await context.fetch(version.handoff.url, {
    headers: { accept: "application/zip" },
  });
  if (!response.ok) {
    throw new PublishedCatalogError(
      502,
      "catalog.handoff_unavailable",
      `Backend handoff request failed (${response.status})`,
    );
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_HANDOFF_BYTES) {
    throw new PublishedCatalogError(502, "catalog.handoff_too_large", "Backend handoff exceeds the size limit");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_HANDOFF_BYTES) {
    throw new PublishedCatalogError(502, "catalog.handoff_too_large", "Backend handoff exceeds the size limit");
  }
  const actualSha256 = createHash("sha256").update(buffer).digest("hex");
  if (actualSha256 !== version.handoff.sha256) {
    throw new PublishedCatalogError(
      502,
      "catalog.handoff_digest_mismatch",
      `Backend handoff digest mismatch for ${reference}`,
    );
  }
  return { buffer, sha256: actualSha256 };
}

function handoffRelativePath(reference: string, archivePath: string): string {
  const root = `${reference}/`;
  if (!archivePath.startsWith(root)) {
    throw new PublishedCatalogError(502, "catalog.handoff_invalid", "Backend handoff contains an unexpected root directory");
  }
  const relativePath = archivePath.slice(root.length);
  if (!relativePath || relativePath.startsWith("/") || relativePath.split("/").some((part) => part === "..")) {
    throw new PublishedCatalogError(502, "catalog.handoff_invalid", "Backend handoff contains an invalid file path");
  }
  return relativePath;
}

function previewableHandoffFile(path: string): boolean {
  return /\.(?:css|json|md|txt)$/i.test(path);
}

async function loadSafeHandoffEntries(reference: string, buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_HANDOFF_FILES) {
    throw new PublishedCatalogError(502, "catalog.handoff_too_many_files", "Backend handoff contains too many files");
  }
  let expandedBytes = 0;
  const files = [];
  for (const entry of entries) {
    const relativePath = handoffRelativePath(reference, entry.name);
    const content = await entry.async("nodebuffer");
    if (content.byteLength > MAX_HANDOFF_FILE_BYTES) {
      throw new PublishedCatalogError(502, "catalog.handoff_file_too_large", `Backend handoff file is too large: ${relativePath}`);
    }
    expandedBytes += content.byteLength;
    if (expandedBytes > MAX_HANDOFF_EXPANDED_BYTES) {
      throw new PublishedCatalogError(502, "catalog.handoff_expanded_too_large", "Backend handoff expands beyond the size limit");
    }
    files.push({ entry, path: relativePath, content });
  }
  return files;
}

async function loadPublishedCatalogSnapshot(
  context: PublishedCatalogContext,
): Promise<CatalogSnapshotV1> {
  requireReady(context);
  if (!context.snapshot) {
    context.snapshot = (async () => {
      if (!context.snapshotUrl) throw new PublishedCatalogError(503, "catalog.not_configured", "Catalog source is not configured");
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

export async function handlePublishedCatalogApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: PublishedCatalogContext,
): Promise<boolean> {
  if (!url.pathname.startsWith("/forge/api/")) return false;

  try {
    requireReady(context);
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
      const artifactBytes = context.root
        ? await readCatalogBundleFile(context.root, catalogArtifactPath(reference))
        : await (async () => {
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
            return new Uint8Array(await response.arrayBuffer());
          })();
      const verification = verifyCardArtifact(
        artifactBytes,
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

    const profileAssetMatch = url.pathname.match(/^\/forge\/api\/profiles\/([^/]+)\/(.+)$/);
    if (req.method === "GET" && profileAssetMatch) {
      if (!context.root) {
        throw new PublishedCatalogError(404, "catalog.profile_not_local", "Local Profile assets are not available");
      }
      const reference = decodeURIComponent(profileAssetMatch[1]);
      const resourcePath = decodeURIComponent(profileAssetMatch[2]);
      const bundlePath = catalogProfilePath(reference, resourcePath);
      if (!context.bundle?.manifest.files.some((file) => file.path === bundlePath)) {
        throw new PublishedCatalogError(404, "catalog.profile_asset_not_found", `Profile asset ${resourcePath} was not found`);
      }
      const buffer = await readCatalogBundleFile(context.root, bundlePath);
      const contentType = resourcePath.endsWith(".json")
        ? "application/json; charset=utf-8"
        : resourcePath.endsWith(".css")
          ? "text/css; charset=utf-8"
          : resourcePath.endsWith(".js")
            ? "text/javascript; charset=utf-8"
            : "application/octet-stream";
      sendBuffer(res, 200, contentType, buffer);
      return true;
    }

    const handoffMatch = url.pathname.match(/^\/forge\/api\/handoffs\/([^/]+)$/);
    if (req.method === "GET" && handoffMatch) {
      const reference = decodeURIComponent(handoffMatch[1]);
      const { buffer } = await loadPublishedHandoff(context, reference);
      sendBinaryDownload(res, `${reference}.handoff.zip`, "application/zip", buffer);
      return true;
    }

    const handoffContentsMatch = url.pathname.match(/^\/forge\/api\/handoffs\/([^/]+)\/contents$/);
    if (req.method === "GET" && handoffContentsMatch) {
      const reference = decodeURIComponent(handoffContentsMatch[1]);
      const { buffer, sha256 } = await loadPublishedHandoff(context, reference);
      if (context.root) {
        const index = await loadCatalogHandoffIndex(context.root, reference);
        sendJson(res, 200, {
          reference,
          fileName: index.fileName,
          sha256,
          bytes: buffer.byteLength,
          files: index.files,
        });
        return true;
      }
      const files = (await loadSafeHandoffEntries(reference, buffer))
        .map(({ path }) => {
          return {
            path,
            group: path.includes("/") ? path.split("/", 1)[0] : "root",
            previewable: previewableHandoffFile(path),
          };
        })
        .sort((left, right) => left.path.localeCompare(right.path));
      sendJson(res, 200, {
        reference,
        fileName: `${reference}.handoff.zip`,
        sha256,
        bytes: buffer.byteLength,
        files,
      });
      return true;
    }

    const handoffFileMatch = url.pathname.match(/^\/forge\/api\/handoffs\/([^/]+)\/file$/);
    if (req.method === "GET" && handoffFileMatch) {
      const reference = decodeURIComponent(handoffFileMatch[1]);
      const requestedPath = url.searchParams.get("path") ?? "";
      if (!requestedPath || requestedPath.startsWith("/") || requestedPath.split("/").some((part) => part === "..")) {
        throw new PublishedCatalogError(400, "catalog.handoff_file_invalid", "A valid handoff file path is required");
      }
      if (!previewableHandoffFile(requestedPath)) {
        throw new PublishedCatalogError(415, "catalog.handoff_file_unsupported", "This handoff file cannot be previewed as text");
      }
      if (context.root) {
        const bundlePath = catalogHandoffFilePath(reference, requestedPath);
        if (!context.bundle?.manifest.files.some((file) => file.path === bundlePath)) {
          throw new PublishedCatalogError(404, "catalog.handoff_file_not_found", `Handoff file ${requestedPath} was not found`);
        }
        const content = await readCatalogBundleFile(context.root, bundlePath);
        sendText(res, 200, "text/plain", content.toString("utf8"));
        return true;
      }
      const { buffer } = await loadPublishedHandoff(context, reference);
      const entry = (await loadSafeHandoffEntries(reference, buffer))
        .find((candidate) => candidate.path === requestedPath);
      if (!entry) {
        throw new PublishedCatalogError(404, "catalog.handoff_file_not_found", `Handoff file ${requestedPath} was not found`);
      }
      sendText(res, 200, "text/plain", entry.content.toString("utf8"));
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
