// Generates the static Component Catalog document for the active render
// profile. The specimen content is derived from the capabilities-driven
// builders in packages/cli, then frozen into
// render-profiles/octo-chat/component-catalog.json so the Profile is the single
// source of truth at runtime (no server-side generation on request).
//
// A guard test (tests/component-catalog-generated.test.ts) asserts the checked
// in document stays byte-identical to a fresh generation, so a specimen change
// must regenerate this file.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildComponentBaselineGroups } from "../packages/cli/src/component-baseline.js";
import type { RenderCapabilities } from "../packages/cli/src/types.js";
import {
  COMPONENT_CATALOG_MEDIA_TYPE,
  decodeComponentCatalogV1,
  decodeRenderCapabilities,
  decodeRenderProfileManifest,
} from "../packages/card-spec/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profileRoot = path.resolve(
  __dirname,
  "..",
  "render-profiles",
  "octo-chat"
);
const outputPath = path.resolve(
  profileRoot,
  "component-catalog.json"
);

export async function buildComponentCatalogDocument() {
  const rawManifest = JSON.parse(
    await readFile(path.join(profileRoot, "manifest.json"), "utf8")
  );
  const manifestResult = decodeRenderProfileManifest(rawManifest);
  if (!manifestResult.ok) {
    const detail = manifestResult.issues
      .map((issue) => `${issue.path || "/"}: ${issue.message}`)
      .join("; ");
    throw new Error(`render profile manifest is invalid: ${detail}`);
  }

  const manifest = manifestResult.value;
  const rawCapabilities = JSON.parse(
    await readFile(path.join(profileRoot, manifest.capabilities), "utf8")
  );
  const capabilitiesResult = decodeRenderCapabilities(rawCapabilities);
  if (!capabilitiesResult.ok) {
    const detail = capabilitiesResult.issues
      .map((issue) => `${issue.path || "/"}: ${issue.message}`)
      .join("; ");
    throw new Error(`render profile capabilities are invalid: ${detail}`);
  }

  const groups = buildComponentBaselineGroups(
    capabilitiesResult.value as RenderCapabilities
  );
  const document = {
    formatVersion: 1 as const,
    mediaType: COMPONENT_CATALOG_MEDIA_TYPE,
    profileReference: `${manifest.id}@${manifest.version}`,
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
