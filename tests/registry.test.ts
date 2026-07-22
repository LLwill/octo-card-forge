import { describe, expect, it } from "vitest";
import { getCard, listCards } from "../src/registry.js";

describe("versioned Card Package registry", () => {
  it("keeps published base packages and exposes explicit new versions", async () => {
    const cards = await listCards();
    expect(cards.map((card) => card.reference)).toEqual([
      "ai.decision-action",
      "ai.decision-action@0.2.0",
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
