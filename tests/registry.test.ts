import { describe, expect, it } from "vitest";
import { listRenderProfiles } from "../src/registry.js";

describe("render profile registry", () => {
  it("lists all versioned render profiles in stable order", async () => {
    const profiles = await listRenderProfiles();
    expect(profiles.map((profile) => profile.reference)).toEqual([
      "octo-chat@1.0.0",
      "octo-chat@1.1.0",
    ]);
    expect(profiles[0].manifest.hostConfig).toBe("host-config.json");
  });
});
