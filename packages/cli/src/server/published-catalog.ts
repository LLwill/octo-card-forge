import type { IncomingMessage, ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { verifyCardArtifact } from "@mlt-org/octo-card-artifact";
import {
  parseCatalogSnapshot,
  type CatalogSnapshotV1,
} from "@mlt-org/octo-card-catalog-snapshot";
import { sendBinaryDownload, sendJson } from "./http.js";
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

export async function handlePublishedCatalogApi(
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

    const handoffMatch = url.pathname.match(/^\/forge\/api\/handoffs\/([^/]+)$/);
    if (req.method === "GET" && handoffMatch) {
      const reference = decodeURIComponent(handoffMatch[1]);
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
      const buffer = Buffer.from(await response.arrayBuffer());
      const actualSha256 = createHash("sha256").update(buffer).digest("hex");
      if (actualSha256 !== version.handoff.sha256) {
        throw new PublishedCatalogError(
          502,
          "catalog.handoff_digest_mismatch",
          `Backend handoff digest mismatch for ${reference}`,
        );
      }
      sendBinaryDownload(res, `${reference}.handoff.zip`, "application/zip", buffer);
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
