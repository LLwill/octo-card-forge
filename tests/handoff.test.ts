import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildHandoffArchive,
  buildHandoffArchiveForCard,
  buildHandoffPackage,
  buildHandoffPackageForCard,
  writeHandoffPackage,
} from "../src/handoff.js";
import { initCard } from "../src/init.js";
import { loadCardPackage } from "../src/registry.js";
import type { JsonObject } from "../src/types.js";

describe("backend handoff package", () => {
  it("contains the contract, templates, samples and compiled cards", async () => {
    const handoff = await buildHandoffPackage("docs.access-request@0.3.0");
    expect(handoff).toMatchObject({
      formatVersion: 1,
      generatedBy: "octo-card-forge",
      card: {
        id: "docs.access-request",
        version: "0.3.0",
        schemaVersion: 2,
      },
      renderProfile: {
        requested: "octo-chat@1.2.0-rc.1",
        resolved: "octo-chat@1.2.0-rc.1",
        server: { required: true },
        web: { required: true },
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
      const result = await writeHandoffPackage("docs.access-request@0.3.0", output);
      expect(path.basename(result.filePath)).toBe(
        "docs.access-request@0.3.0.handoff.zip"
      );
      const written = await readFile(result.filePath);
      const zip = await JSZip.loadAsync(written);
      const prefix = "docs.access-request@0.3.0/";
      expect(Object.keys(zip.files)).toEqual(
        expect.arrayContaining([
          `${prefix}README.md`,
          `${prefix}manifest.json`,
          `${prefix}render-profile/manifest.json`,
          `${prefix}render-profile/capabilities.json`,
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
      expect(manifest).toMatchObject({ id: "docs.access-request", version: "0.3.0" });
      expect(result.bytes).toBeGreaterThan(0);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });

  it("creates deterministic archive names", async () => {
    const archive = await buildHandoffArchive("docs.access-request@0.3.0");
    expect(archive.fileName).toBe("docs.access-request@0.3.0.handoff.zip");
    expect(archive.buffer.byteLength).toBeGreaterThan(0);
  });

  it("builds a handoff archive from a standalone card directory", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "octo-card-standalone-"));
    try {
      const cardRoot = path.join(output, "docs.repo-free-handoff");
      await initCard({
        cardId: "docs.repo-free-handoff",
        name: "Repo Free Handoff",
        outputRoot: cardRoot,
      });
      const card = await loadCardPackage(cardRoot);
      const handoff = await buildHandoffPackageForCard(card);
      expect(handoff).toMatchObject({
        card: {
          id: "docs.repo-free-handoff",
          version: "0.1.0",
        },
        renderProfile: {
          resolved: "octo-chat@1.2.0-rc.1",
        },
      });

      const archive = await buildHandoffArchiveForCard(card);
      expect(archive.fileName).toBe("docs.repo-free-handoff@0.1.0.handoff.zip");
      const zip = await JSZip.loadAsync(archive.buffer);
      expect(Object.keys(zip.files)).toEqual(
        expect.arrayContaining([
          "docs.repo-free-handoff@0.1.0/manifest.json",
          "docs.repo-free-handoff@0.1.0/goldens/default.card.json",
        ])
      );
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
});
