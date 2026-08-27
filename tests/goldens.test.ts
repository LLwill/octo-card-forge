import { describe, expect, it } from "vitest";
import { compileSampleFromDirectory } from "../packages/cli/src/compiler.js";
import { CARD_FIXTURE_ROOTS } from "./card-fixtures.js";

describe("Card fixture compilation", () => {
  it("compiles every dedicated fixture deterministically", async () => {
    for (const cardRoot of CARD_FIXTURE_ROOTS) {
      const first = await compileSampleFromDirectory({ cardRoot, sample: "default" });
      const second = await compileSampleFromDirectory({ cardRoot, sample: "default" });

      expect(first.issues, cardRoot).toEqual([]);
      expect(first.payload, cardRoot).toEqual(second.payload);
      expect(JSON.stringify(first.payload), cardRoot).not.toContain("${");
    }
  });
});
