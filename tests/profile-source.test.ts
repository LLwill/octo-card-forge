import path from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENT_RENDER_PROFILE } from "../packages/cli/src/registry.js";
import { resolveInProject } from "../packages/cli/src/fs.js";
import {
  loadRenderProfileForReference,
  loadRenderProfileFromDirectory,
} from "../packages/cli/src/profile-source.js";

describe("render profile source resolution", () => {
  it("prefers the built workspace package when running from the forge workspace", async () => {
    const profile = await loadRenderProfileForReference(CURRENT_RENDER_PROFILE);

    expect(profile.root).toBe(
      path.resolve(resolveInProject("packages/profile-octo-chat/dist"))
    );
    expect(profile.reference).toBe(CURRENT_RENDER_PROFILE);
    expect(profile.source).toBe("workspace");
  });

  it("loads from a raw directory via loadRenderProfileFromDirectory", async () => {
    const profile = await loadRenderProfileFromDirectory(
      path.resolve(resolveInProject("render-profiles", "octo-chat"))
    );
    expect(profile.reference).toBe(CURRENT_RENDER_PROFILE);
  });
});
