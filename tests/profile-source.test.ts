import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
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
    expect(profile.componentCatalog?.profileReference).toBe(CURRENT_RENDER_PROFILE);
  });

  it("rejects a catalog whose profileReference does not match its manifest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-profile-source-"));
    await cp(resolveInProject("render-profiles", "octo-chat"), root, {
      recursive: true,
    });
    const catalogPath = path.join(root, "component-catalog.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
      profileReference: string;
    };
    catalog.profileReference = "octo-chat@9.9.9";
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);

    await expect(loadRenderProfileFromDirectory(root)).rejects.toThrow(
      `/profileReference: expected ${CURRENT_RENDER_PROFILE}, got octo-chat@9.9.9`
    );
  });
});
