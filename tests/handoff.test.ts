import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildCardArtifactForCard } from "../packages/cli/src/artifact.js";
import {
  buildHandoffArchiveForCard,
  buildHandoffPackageForCard,
  writeHandoffPackageForCard,
} from "../packages/cli/src/handoff.js";
import { CURRENT_RENDER_PROFILE } from "../packages/cli/src/registry.js";
import type { JsonObject } from "../packages/cli/src/types.js";
import { loadChoiceCard, loadNoticeCard } from "./card-fixtures.js";

describe("backend handoff package", () => {
  it("projects handoff content from the canonical artifact", async () => {
    const card = await loadChoiceCard();
    const [artifact, handoff] = await Promise.all([
      buildCardArtifactForCard(card),
      buildHandoffPackageForCard(card),
    ]);
    const handoffViews = handoff.views as JsonObject;

    expect(handoff.dataContract).toEqual(artifact.dataContract);
    expect((handoff.renderProfile as JsonObject).resolved).toBe(artifact.profile.reference);
    for (const [viewName, artifactView] of Object.entries(artifact.views)) {
      const handoffView = handoffViews[viewName] as JsonObject;
      expect(handoffView.template).toEqual(artifactView.template);
      expect(handoffView.samples).toEqual(
        expect.arrayContaining(
          artifactView.samples.map((sample) => expect.objectContaining({
            name: sample.name,
            data: sample.data,
            card: sample.card,
            inspection: sample.inspection,
          })),
        ),
      );
    }
  });

  it("contains the contract, templates, samples and compiled cards", async () => {
    const card = await loadNoticeCard();
    const handoff = await buildHandoffPackageForCard(card);
    expect(handoff).toMatchObject({
      formatVersion: 1,
      generatedBy: "octo-card-forge",
      card: { id: "example.notice", version: "0.1.0", schemaVersion: 2 },
      renderProfile: {
        requested: "octo-chat@latest",
        resolved: CURRENT_RENDER_PROFILE,
        server: { required: true },
        web: { required: true },
      },
      dataContract: { type: "object" },
    });
    expect((handoff.views as JsonObject).default).toMatchObject({
      wireProfile: "octo/v1",
      template: { type: "AdaptiveCard", version: "1.5" },
      samples: [expect.objectContaining({ name: "default" })],
    });
  });

  it("writes the same ZIP archive used by page export", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "octo-card-handoff-"));
    try {
      const card = await loadChoiceCard();
      const result = await writeHandoffPackageForCard(card, output);
      expect(path.basename(result.filePath)).toBe("example.choice@0.1.0.handoff.zip");
      const zip = await JSZip.loadAsync(await readFile(result.filePath));
      const prefix = "example.choice@0.1.0/";
      expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([
        `${prefix}README.md`,
        `${prefix}manifest.json`,
        `${prefix}render-profile/manifest.json`,
        `${prefix}render-profile/capabilities.json`,
        `${prefix}contract/data.schema.json`,
        `${prefix}templates/default.template.json`,
        `${prefix}samples/default.json`,
        `${prefix}goldens/default.card.json`,
        `${prefix}reports/default.interaction.json`,
      ]));
      expect(result.bytes).toBeGreaterThan(0);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });

  it("creates deterministic archive names", async () => {
    const archive = await buildHandoffArchiveForCard(await loadNoticeCard());
    expect(archive.fileName).toBe("example.notice@0.1.0.handoff.zip");
    expect(archive.buffer.byteLength).toBeGreaterThan(0);
  });
});
