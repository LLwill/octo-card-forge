import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildHandoffArchive,
  buildHandoffPackage,
  writeHandoffPackage,
} from "../src/handoff.js";
import type { JsonObject } from "../src/types.js";

describe("backend handoff package", () => {
  it("contains the contract, templates, samples and compiled cards", async () => {
    const handoff = await buildHandoffPackage("docs.access-request");
    expect(handoff).toMatchObject({
      formatVersion: 1,
      generatedBy: "octo-card-forge",
      card: {
        id: "docs.access-request",
        version: "0.2.0",
        schemaVersion: 2,
      },
      dataContract: { type: "object" },
    });

    const views = handoff.views as JsonObject;
    const pending = views.pending as JsonObject;
    expect(pending).toMatchObject({ wireProfile: "octo/v2" });
    expect(pending.template).toMatchObject({ type: "AdaptiveCard", version: "1.5" });
    expect(pending.samples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "pending",
          card: expect.objectContaining({ type: "AdaptiveCard", version: "1.5" }),
          inspection: expect.objectContaining({ actions: expect.any(Array) }),
        }),
      ])
    );
  });

  it("writes the same ZIP archive used by the page export", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "octo-card-handoff-"));
    try {
      const result = await writeHandoffPackage("docs.access-request", output);
      expect(path.basename(result.filePath)).toBe(
        "docs.access-request@0.2.0.handoff.zip"
      );
      const written = await readFile(result.filePath);
      const zip = await JSZip.loadAsync(written);
      const prefix = "docs.access-request@0.2.0/";
      expect(Object.keys(zip.files)).toEqual(
        expect.arrayContaining([
          `${prefix}README.md`,
          `${prefix}manifest.json`,
          `${prefix}contract/data.schema.json`,
          `${prefix}templates/pending.template.json`,
          `${prefix}samples/pending.json`,
          `${prefix}goldens/pending.card.json`,
          `${prefix}reports/pending.interaction.json`,
        ])
      );
      const manifest = JSON.parse(
        await zip.file(`${prefix}manifest.json`)!.async("string")
      );
      expect(manifest).toMatchObject({ id: "docs.access-request", version: "0.2.0" });
      expect(result.bytes).toBeGreaterThan(0);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });

  it("creates deterministic archive names", async () => {
    const archive = await buildHandoffArchive("docs.access-request");
    expect(archive.fileName).toBe("docs.access-request@0.2.0.handoff.zip");
    expect(archive.buffer.byteLength).toBeGreaterThan(0);
  });
});
