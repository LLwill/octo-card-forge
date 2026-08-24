import { describe, expect, it } from "vitest";
import {
  CURRENT_RENDER_PROFILE,
  getCard,
  getRenderProfile,
  listCards,
  resolveRenderProfileReference,
} from "../src/registry.js";


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

describe("versioned Card Package registry", () => {
  it("always exposes editable drafts and only locally renderable releases", async () => {
    const cards = await listCards();
    expect(cards.map((card) => card.reference)).toEqual([
      "ai.decision-action",
      "ai.decision-action@0.2.0",
      "ai.reasoning-process",
      "ai.reasoning-process@0.2.0",
      "ai.reasoning-process@0.3.1",
      "docs.access-request",
      "docs.access-request@0.3.0",
    ]);
    expect(cards.find((card) => card.reference === "ai.reasoning-process")).toMatchObject({
      kind: "draft",
      mutable: true,
    });
    expect(cards.find((card) => card.reference === "ai.reasoning-process@0.3.1")).toMatchObject({
      kind: "release",
      mutable: false,
    });
  });

  it("loads current drafts by stable id and leaves historical releases to artifacts", async () => {
    await expect(getCard("docs.access-request")).resolves.toMatchObject({
      reference: "docs.access-request",
      kind: "draft",
      mutable: true,
      manifest: { renderProfile: "octo-chat@latest" },
    });
    await expect(getCard("docs.access-request@0.3.0")).resolves.toMatchObject({
      manifest: { version: "0.3.0" },
    });
    await expect(getCard("docs.access-request@0.2.0")).rejects.toThrow(
      "historical packages are rendered from artifacts"
    );
  });
});
