// Generates the static Component Catalog document for the active render
// profile. The specimen content is derived from the capabilities-driven
// builders in packages/cli, then frozen into
// render-profiles/octo-chat/component-catalog.json so the Profile is the single
// source of truth at runtime (no server-side generation on request).
//
// A guard test (tests/component-catalog-generated.test.ts) asserts the checked
// in document stays byte-identical to a fresh generation, so a specimen change
// must regenerate this file.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComponentBaselineGroups } from "../packages/cli/src/component-baseline.js";
import { getCurrentRenderProfile } from "../packages/cli/src/registry.js";
import {
  COMPONENT_CATALOG_MEDIA_TYPE,
  decodeComponentCatalogV1,
} from "../packages/card-spec/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(
  __dirname,
  "..",
  "render-profiles",
  "octo-chat",
  "component-catalog.json"
);

export async function buildComponentCatalogDocument() {
  const profile = await getCurrentRenderProfile();
  const groups = buildComponentBaselineGroups(profile.capabilities);
  const document = {
    formatVersion: 1 as const,
    mediaType: COMPONENT_CATALOG_MEDIA_TYPE,
    profileReference: profile.reference,
    groups,
  };
  const decoded = decodeComponentCatalogV1(document);
  if (!decoded.ok) {
    const detail = decoded.issues
      .map((issue) => `${issue.path || "/"}: ${issue.message}`)
      .join("; ");
    throw new Error(`generated component catalog fails ComponentCatalogV1: ${detail}`);
  }
  return document;
}

export function serializeComponentCatalog(document: unknown): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

async function main() {
  const document = await buildComponentCatalogDocument();
  await writeFile(outputPath, serializeComponentCatalog(document), "utf8");
  console.log(`Wrote ${path.relative(path.resolve(__dirname, ".."), outputPath)}`);
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await main();
}
