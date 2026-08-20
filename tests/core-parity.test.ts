import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileCardSource } from "../packages/core/src/index.js";
import type { RenderCapabilities as CoreRenderCapabilities, ResolvedCardSource } from "../packages/core/src/index.js";
import { compileSampleFromPackage } from "../src/compiler.js";
import { resolveCardAssetPath, listCards } from "../src/registry.js";
import { getCurrentRenderProfile } from "../src/registry.js";
import type { JsonObject } from "../src/types.js";

async function readJson(filePath: string): Promise<JsonObject> {
  return JSON.parse(await readFile(filePath, "utf8")) as JsonObject;
}

async function resolveSource(cardRoot: string): Promise<{ source: ResolvedCardSource; profile: CoreRenderCapabilities; reference: string }> {
  const manifest = await readJson(path.join(cardRoot, "manifest.json"));
  const profile = await getCurrentRenderProfile();
  const views: ResolvedCardSource["views"] = {};
  for (const [viewName, viewValue] of Object.entries(manifest.views as Record<string, JsonObject>)) {
    const template = await readJson(resolveCardAssetPath(cardRoot, String(viewValue.template), `views.${viewName}.template`));
    const samples = [];
    for (const samplePath of (viewValue.samples as string[])) {
      samples.push({
        name: path.basename(samplePath, path.extname(samplePath)),
        data: await readJson(resolveCardAssetPath(cardRoot, samplePath, `views.${viewName}.samples`)),
      });
    }
    views[viewName] = {
      wireProfile: viewValue.wireProfile as "octo/v1" | "octo/v2",
      ...(Array.isArray(viewValue.states) ? { states: viewValue.states as string[] } : {}),
      ...(Array.isArray(viewValue.submit_actions) ? { submit_actions: viewValue.submit_actions as string[] } : {}),
      template,
      samples,
    };
  }
  const idParts = String(manifest.id).split(".");
  const source = {
    formatVersion: 1 as const,
    card: {
      id: manifest.id,
      namespace: idParts[0],
      key: idParts.slice(1).join("."),
      name: manifest.name,
      version: manifest.version,
      contractVersion: manifest.contractVersion,
      adaptiveCardVersion: manifest.adaptiveCardVersion,
      defaultLocale: manifest.defaultLocale,
    },
    dataContract: await readJson(resolveCardAssetPath(cardRoot, String(manifest.dataSchema), "dataSchema")),
    views,
  } as unknown as ResolvedCardSource;
  return {
    source,
    profile: profile.capabilities as unknown as CoreRenderCapabilities,
    reference: profile.reference,
  };
}

describe("legacy/Core compile parity", () => {
  it("keeps every current draft sample byte-equivalent", async () => {
    const drafts = (await listCards()).filter((card) => card.kind === "draft");
    for (const card of drafts) {
      const resolved = await resolveSource(card.root);
      for (const [viewName, view] of Object.entries(card.manifest.views)) {
        for (const samplePath of view.samples) {
          const sample = path.basename(samplePath, path.extname(samplePath));
          const legacy = await compileSampleFromPackage({ card, view: viewName, sample });
          const core = compileCardSource({
            source: resolved.source,
            view: viewName,
            data: legacy.data,
            profile: { reference: resolved.reference, capabilities: resolved.profile },
          });
          expect(core.payload, `${card.reference}/${viewName}/${sample}`).toEqual(legacy.payload);
          expect(core.issues, `${card.reference}/${viewName}/${sample}`).toEqual(legacy.issues);
          expect(core.inspection, `${card.reference}/${viewName}/${sample}`).toEqual(legacy.inspection);
        }
      }
    }
  });
});
