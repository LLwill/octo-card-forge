import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileCardSource,
  inspectCard as inspectCardCore,
  validateCompiledCard as validateCompiledCardCore,
} from "../packages/core/src/index.js";
import { loadResolvedCardSource } from "../packages/workspace/src/index.js";
import { compileCardPackage, compileSampleFromPackage } from "../src/compiler.js";
import { inspectCard as inspectCardFacade } from "../src/inspect.js";
import { listCards } from "../src/registry.js";
import { getCurrentRenderProfile } from "../src/registry.js";
import { validateCompiledCard as validateCompiledCardFacade } from "../src/validate.js";

async function resolveSource(cardRoot: string) {
  const [loaded, profile] = await Promise.all([
    loadResolvedCardSource(cardRoot),
    getCurrentRenderProfile(),
  ]);
  return {
    source: loaded.source,
    profile: profile.capabilities,
    reference: profile.reference,
  };
}

describe("compiler facade/Core parity", () => {
  it("keeps legacy validation and inspection entrypoints as exact Core aliases", () => {
    expect(validateCompiledCardFacade).toBe(validateCompiledCardCore);
    expect(inspectCardFacade).toBe(inspectCardCore);
  });

  it("keeps every current draft sample byte-equivalent", async () => {
    const drafts = (await listCards()).filter((card) => card.kind === "draft");
    for (const card of drafts) {
      const resolved = await resolveSource(card.root);
      for (const [viewName, view] of Object.entries(card.manifest.views)) {
        for (const samplePath of view.samples) {
          const sample = path.basename(samplePath, path.extname(samplePath));
          const facade = await compileSampleFromPackage({ card, view: viewName, sample });
          const core = compileCardSource({
            source: resolved.source,
            view: viewName,
            data: facade.data,
            profile: { reference: resolved.reference, capabilities: resolved.profile },
          });
          expect(core.payload, `${card.reference}/${viewName}/${sample}`).toEqual(facade.payload);
          expect(core.issues, `${card.reference}/${viewName}/${sample}`).toEqual(facade.issues);
          expect(core.inspection, `${card.reference}/${viewName}/${sample}`).toEqual(facade.inspection);
        }
      }
    }
  });

  it("keeps invalid data contract diagnostics equivalent", async () => {
    const card = (await listCards()).find(
      (candidate) => candidate.kind === "draft" && candidate.manifest.id === "docs.access-request"
    );
    expect(card).toBeDefined();
    const resolved = await resolveSource(card!.root);
    const view = Object.keys(card!.manifest.views)[0];
    const facade = await compileCardPackage({ card: card!, view, data: {} });
    const core = compileCardSource({
      source: resolved.source,
      view,
      data: {},
      profile: { reference: resolved.reference, capabilities: resolved.profile },
    });

    expect(core).toEqual(facade);
    expect(core.payload).toEqual({});
    expect(core.issues.some((issue) => issue.code.startsWith("contract."))).toBe(true);
  });

  it("keeps unknown view failures equivalent", async () => {
    const card = (await listCards()).find((candidate) => candidate.kind === "draft");
    expect(card).toBeDefined();
    const resolved = await resolveSource(card!.root);
    const message = `Unknown view missing for ${card!.reference}`;

    await expect(
      compileCardPackage({ card: card!, view: "missing", data: {} })
    ).rejects.toThrow(message);
    expect(() =>
      compileCardSource({
        source: resolved.source,
        view: "missing",
        data: {},
        profile: { reference: resolved.reference, capabilities: resolved.profile },
      })
    ).toThrow(message);
  });
});
