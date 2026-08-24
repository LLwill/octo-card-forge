import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileSampleFromPackage } from "../packages/cli/src/compiler.js";
import { listCards } from "../packages/cli/src/registry.js";
import type { JsonObject } from "../packages/cli/src/types.js";

describe("draft Card goldens", () => {
  it("matches every draft sample to a committed compiled Card", async () => {
    const drafts = (await listCards()).filter((card) => card.kind === "draft");
    let sampleCount = 0;

    for (const card of drafts) {
      for (const [view, definition] of Object.entries(card.manifest.views)) {
        for (const samplePath of definition.samples) {
          const sample = path.basename(samplePath, path.extname(samplePath));
          const result = await compileSampleFromPackage({ card, view, sample });
          const goldenPath = path.join(card.root, "goldens", `${sample}.card.json`);
          const golden = JSON.parse(await readFile(goldenPath, "utf8")) as JsonObject;

          expect(result.issues, `${card.reference}:${sample}`).toEqual([]);
          expect(result.payload, `${card.reference}:${sample}`).toEqual(golden);
          sampleCount++;
        }
      }
    }

    expect(sampleCount).toBe(12);
  });
});
