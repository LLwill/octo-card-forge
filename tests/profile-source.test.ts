import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInProject } from "../src/fs.js";
import { loadRenderProfileForReference } from "../src/profile-source.js";

describe("render profile source resolution", () => {
  it("prefers the checked-in profile when running from the forge workspace", async () => {
    const profile = await loadRenderProfileForReference("octo-chat@1.2.0-rc.1");

    expect(profile.root).toBe(
      path.resolve(resolveInProject("render-profiles", "octo-chat"))
    );
    expect(profile.reference).toBe("octo-chat@1.2.0-rc.1");
  });
});
