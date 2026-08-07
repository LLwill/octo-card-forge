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
    expect(latest.manifest.version).toBe("1.2.0-rc.3");
  });

  it("does not load historical profile artifacts from the workspace", async () => {
    await expect(getRenderProfile("octo-chat@1.0.0")).rejects.toThrow(
      "use the artifact registry"
    );
  });
});

describe("versioned Card Package registry", () => {
  it("exposes only packages renderable by the current workspace profile", async () => {
    const cards = await listCards();
    expect(cards.map((card) => card.reference)).toEqual([
      "ai.decision-action@0.2.0",
      "ai.reasoning-process@0.2.0",
      "ai.reasoning-process",
      "ai.reasoning-process@0.3.0",
      "docs.access-request@0.3.0",
    ]);
    expect(cards.find((card) => card.reference === "ai.reasoning-process")).toMatchObject({
      kind: "draft",
      mutable: true,
    });
    expect(cards.find((card) => card.reference === "ai.reasoning-process@0.3.0")).toMatchObject({
      kind: "release",
      mutable: false,
    });
  });

  it("leaves historical card packages to artifacts instead of local preview", async () => {
    await expect(getCard("docs.access-request")).rejects.toThrow(
      "historical packages are rendered from artifacts"
    );
    await expect(getCard("docs.access-request@0.3.0")).resolves.toMatchObject({
      manifest: { version: "0.3.0" },
    });
  });
});
