import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bundleRenderProfile,
  packRenderProfile,
  validateRenderProfile,
} from "../src/profile.js";

const REFERENCE = "octo-chat@1.2.0-rc.1";

describe("render profile bundle", () => {
  it("validates a profile without creating a bundle", async () => {
    await expect(validateRenderProfile(REFERENCE)).resolves.toMatchObject({
      reference: REFERENCE,
      packageName: "@mlt-org/octo-card-profile-octo-chat",
      version: "1.2.0-rc.1",
      compatibility: "octo-chat/v1",
    });
  });

  it("creates a scoped, immutable package layout", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "octo-profile-bundle-"));
    const result = await bundleRenderProfile(REFERENCE, output);
    const packageJson = JSON.parse(
      await readFile(path.join(result.packageRoot, "package.json"), "utf8")
    ) as {
      name: string;
      version: string;
      exports: Record<string, string>;
      publishConfig: { access: string; registry: string };
      repository: { type: string; url: string; directory: string };
    };
    const stylesheet = await readFile(
      path.join(result.packageRoot, "dist/styles.css"),
      "utf8"
    );
    const bundleManifest = JSON.parse(
      await readFile(path.join(result.packageRoot, "dist/bundle-manifest.json"), "utf8")
    ) as { profile: string; compatibility: string; files: Record<string, string> };

    expect(packageJson).toMatchObject({
      name: "@mlt-org/octo-card-profile-octo-chat",
      version: "1.2.0-rc.1",
      publishConfig: {
        access: "public",
        registry: "https://registry.npmjs.org/",
      },
      repository: {
        type: "git",
        url: "git+https://github.com/LLwill/octo-card-forge.git",
        directory: "render-profiles/octo-chat",
      },
    });
    expect(packageJson.exports["./host-config.json"]).toBe("./dist/host-config.json");
    expect(stylesheet).toContain(".octo-card-profile .ac-adaptiveCard");
    expect(stylesheet).toContain(".octo-card-profile {");
    expect(stylesheet).not.toContain("#preview");
    expect(bundleManifest).toMatchObject({
      profile: REFERENCE,
      compatibility: "octo-chat/v1",
    });
    expect(Object.keys(bundleManifest.files).sort()).toEqual([
      "dist/capabilities.json",
      "dist/host-config.json",
      "dist/manifest.json",
      "dist/styles.css",
      "dist/theme.css",
      "dist/tokens.json",
    ]);
  });

  it("packs an installable tgz", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "octo-profile-pack-"));
    const result = await packRenderProfile(REFERENCE, output);
    expect(result.tarball).toMatch(/\.tgz$/);
    expect(await readFile(result.tarball)).not.toHaveLength(0);
  });
});
