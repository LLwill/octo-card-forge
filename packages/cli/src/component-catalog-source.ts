import path from "node:path";
import { readJson } from "./fs.js";
import {
  decodeComponentCatalogV1,
  type ComponentCatalogV1,
} from "@mlt-org/octo-card-spec";
import type { RenderProfileManifest } from "./types.js";

/**
 * Loads and validates the static Component Catalog a render profile declares.
 * Returns undefined when the manifest has no componentCatalog field so callers
 * can fall back to runtime generation for legacy profiles. Fails closed (throws)
 * when the declared file is present but does not satisfy ComponentCatalogV1.
 */
export async function loadProfileComponentCatalog(
  assetRoot: string,
  manifest: Pick<RenderProfileManifest, "id" | "version" | "componentCatalog">
): Promise<ComponentCatalogV1 | undefined> {
  if (!manifest.componentCatalog) return undefined;
  const resolvedRoot = path.resolve(assetRoot);
  const catalogPath = path.resolve(resolvedRoot, manifest.componentCatalog);
  const relative = path.relative(resolvedRoot, catalogPath);
  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `${assetRoot}/manifest.json: Profile resource must stay inside the package`
    );
  }
  const raw = await readJson<unknown>(catalogPath);
  const decoded = decodeComponentCatalogV1(raw);
  if (!decoded.ok) {
    const detail = decoded.issues
      .map((issue) => `${issue.path || "/"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${catalogPath}: ${detail}`);
  }
  const expectedReference = `${manifest.id}@${manifest.version}`;
  if (decoded.value.profileReference !== expectedReference) {
    throw new Error(
      `${catalogPath}: /profileReference: expected ${expectedReference}, got ${decoded.value.profileReference}`
    );
  }
  return decoded.value;
}
