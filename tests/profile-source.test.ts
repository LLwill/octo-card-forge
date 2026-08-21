import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInProject } from "../src/fs.js";
import {
  loadRenderProfileForReference,
  loadRenderProfileFromDirectory,
} from "../src/profile-source.js";

describe("render profile source resolution", () => {
  it("prefers the built workspace package when running from the forge workspace", async () => {
    const profile = await loadRenderProfileForReference("octo-chat@1.2.0-rc.3");

    expect(profile.root).toBe(
      path.resolve(resolveInProject("packages/profile-octo-chat/dist"))
    );
    expect(profile.reference).toBe("octo-chat@1.2.0-rc.3");
    expect(profile.source).toBe("workspace");
  });

  it("loads from a raw directory via loadRenderProfileFromDirectory", async () => {
    const profile = await loadRenderProfileFromDirectory(
      path.resolve(resolveInProject("render-profiles", "octo-chat"))
    );
    expect(profile.reference).toBe("octo-chat@1.2.0-rc.3");
  });
});
