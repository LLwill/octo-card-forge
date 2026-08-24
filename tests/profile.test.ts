import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bundleRenderProfile,
  packRenderProfile,
  validateRenderProfileCss,
  validateRenderProfile,
} from "../src/profile.js";
import type { RenderCapabilities } from "../src/types.js";
import {
  CURRENT_RENDER_PROFILE,
  parseRenderProfileReference,
} from "../src/registry.js";

const REFERENCE = CURRENT_RENDER_PROFILE;
const VERSION = parseRenderProfileReference(REFERENCE).version;

describe("render profile bundle", () => {
  it("validates a profile without creating a bundle", async () => {
    await expect(validateRenderProfile(REFERENCE)).resolves.toMatchObject({
      reference: REFERENCE,
      packageName: "@mlt-org/octo-card-profile-octo-chat",
      version: VERSION,
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
      version: VERSION,
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
      "capabilities.json",
      "host-config.json",
      "manifest.json",
      "styles.css",
      "theme.css",
      "tokens.json",
    ]);
  });

  it("packs an installable tgz that can be extracted and loaded as a package", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "octo-profile-pack-"));
    const result = await packRenderProfile(REFERENCE, output);
    expect(result.tarball).toMatch(/\.tgz$/);
    expect(await readFile(result.tarball)).not.toHaveLength(0);

    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const extractDir = path.join(output, "extracted");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("tar", ["-xzf", result.tarball, "-C", extractDir]);

    const { loadRenderProfileFromPackage } = await import("../src/profile-source.js");
    const pkgDir = path.join(extractDir, "package");
    const profile = await loadRenderProfileFromPackage(pkgDir);
    expect(profile.reference).toBe(REFERENCE);
    expect(profile.manifest.id).toBe("octo-chat");
    expect(profile.capabilities.allowedElements).toContain("TextBlock");
    const stylesheets = profile.stylesheets;
    expect(stylesheets).toBeDefined();
    expect(stylesheets!.length).toBeGreaterThan(0);
  });
});

describe("render profile utility CSS validation", () => {
  const utilityCapabilities: RenderCapabilities = {
    maxAdaptiveCardVersion: "1.5",
    allowedElements: ["Container", "TextBlock"],
    allowedActions: [],
    utilities: {
      "surface-subtle": {
        group: "surface",
        appliesTo: ["Container"],
        fallback: { style: "emphasis" },
        description: "Subtle surface",
      },
      "inset-md": {
        group: "inset",
        appliesTo: ["Container"],
        description: "Medium inset",
      },
      "semantic-only": {
        group: "semantic",
        appliesTo: ["*"],
        description: "Semantic marker without CSS",
        cssRequired: false,
      },
    },
    utilityRules: {
      maxTokensPerElement: 3,
    },
    maxNodes: 20,
    maxDepth: 20,
    maxPayloadBytes: 10_000,
    imageUrlSchemes: ["https"],
    openUrlSchemes: ["https"],
  };

  it("accepts declared utility selectors and skips the octo-- namespace for legacy component checks", () => {
    expect(() =>
      validateRenderProfileCss(
        utilityCapabilities,
        `
          .octo-card-profile [id^="octo--"][id*="--surface-subtle--"] {}
          .octo-card-profile [id^="octo--"][id*="--inset-md--"] {}
        `,
        "styles.css"
      )
    ).not.toThrow();
  });

  it("rejects utility selectors that are not declared by capabilities", () => {
    expect(() =>
      validateRenderProfileCss(
        utilityCapabilities,
        `
          .octo-card-profile [id^="octo--"][id*="--surface-subtle--"] {}
          .octo-card-profile [id^="octo--"][id*="--inset-md--"] {}
          .octo-card-profile [id^="octo--"][id*="--surface-magic--"] {}
        `,
        "styles.css"
      )
    ).toThrow(/surface-magic is not declared/);
  });

  it("rejects utility capabilities without required CSS", () => {
    expect(() =>
      validateRenderProfileCss(
        utilityCapabilities,
        '.octo-card-profile [id^="octo--"][id*="--surface-subtle--"] {}',
        "styles.css"
      )
    ).toThrow(/missing CSS rule for utility token inset-md/);
  });

  it("rejects invalid utility capability declarations", () => {
    const invalidCapabilities: RenderCapabilities = {
      ...utilityCapabilities,
      utilities: {
        ...utilityCapabilities.utilities,
        "surface": {
          group: "surface",
          appliesTo: ["Container"],
          description: "Prefix-compatible token",
        },
      },
    };

    expect(() =>
      validateRenderProfileCss(
        invalidCapabilities,
        `
          .octo-card-profile [id^="octo--"][id*="--surface--"] {}
          .octo-card-profile [id^="octo--"][id*="--surface-subtle--"] {}
          .octo-card-profile [id^="octo--"][id*="--inset-md--"] {}
        `,
        "styles.css"
      )
    ).toThrow(/prefix-compatible/);
  });
});
