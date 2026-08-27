import { describe, expect, it } from "vitest";
import {
  CURRENT_RENDER_PROFILE,
  getRenderProfile,
  loadCardPackage,
  resolveRenderProfileReference,
} from "../packages/cli/src/registry.js";
import { CHOICE_CARD_ROOT, NOTICE_CARD_ROOT } from "./card-fixtures.js";


describe("render profile resolution", () => {
  it("maps @latest and omitted refs to CURRENT_RENDER_PROFILE", async () => {
    expect(resolveRenderProfileReference(undefined)).toBe(CURRENT_RENDER_PROFILE);
    expect(resolveRenderProfileReference("octo-chat@latest")).toBe(CURRENT_RENDER_PROFILE);
    expect(resolveRenderProfileReference("octo-chat@1.0.0")).toBe("octo-chat@1.0.0");
    const latest = await getRenderProfile("octo-chat@latest");
    expect(latest.reference).toBe(CURRENT_RENDER_PROFILE);
    expect(`${latest.manifest.id}@${latest.manifest.version}`).toBe(CURRENT_RENDER_PROFILE);
  });

  it("does not load historical profile artifacts from the workspace", async () => {
    await expect(getRenderProfile("octo-chat@1.0.0")).rejects.toThrow(
      "use the artifact registry"
    );
  });
});

describe("explicit Card Package loading", () => {
  it("loads standalone card directories without a repository registry", async () => {
    await expect(loadCardPackage(NOTICE_CARD_ROOT)).resolves.toMatchObject({
      reference: "example.notice",
      kind: "draft",
      mutable: true,
      manifest: { id: "example.notice", renderProfile: "octo-chat@latest" },
    });
    await expect(loadCardPackage(CHOICE_CARD_ROOT)).resolves.toMatchObject({
      reference: "example.choice",
      manifest: { id: "example.choice" },
    });
  });

  it("fails when the explicit directory does not contain a manifest", async () => {
    await expect(loadCardPackage("tests/fixtures/cards/missing")).rejects.toThrow();
  });
});
