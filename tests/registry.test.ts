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
    expect(latest.manifest.version).toBe("1.2.0-rc.1");
  });
});

describe("versioned Card Package registry", () => {
  it("keeps published base packages and exposes explicit new versions", async () => {
    const cards = await listCards();
    expect(cards.map((card) => card.reference)).toEqual([
      "ai.decision-action",
      "ai.decision-action@0.2.0",
      "ai.reasoning-process",
      "docs.access-request",
      "docs.access-request@0.3.0",
    ]);
  });

  it("does not implicitly replace a base package with a newer version", async () => {
    await expect(getCard("docs.access-request")).resolves.toMatchObject({
      manifest: { version: "0.2.0" },
    });
    await expect(getCard("docs.access-request@0.3.0")).resolves.toMatchObject({
      manifest: { version: "0.3.0" },
    });
  });
});
