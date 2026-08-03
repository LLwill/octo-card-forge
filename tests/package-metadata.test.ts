import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("CLI package metadata", () => {
  it("publishes a buildable octo-card command without requiring tsx at runtime", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
      name: string;
      repository?: string;
      bin?: Record<string, string>;
      files?: string[];
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(manifest.name).toBe("@mlt-org/octo-card-cli");
    expect(manifest.repository).toBe("https://github.com/LLwill/octo-card-forge");
    expect(manifest.bin).toEqual({ "octo-card": "./dist/cli.js" });
    expect(manifest.files).toContain("dist");
    expect(manifest.files).not.toContain("cards");
    expect(manifest.files).not.toContain("render-profiles");
    expect(manifest.scripts?.prebuild).toBe("node scripts/clean-build-output.mjs");
    expect(manifest.scripts?.build).toBe("tsc -p tsconfig.build.json");
    expect(manifest.scripts?.["prepare:agent-validation"]).toBe(
      "node scripts/create-agent-validation-workspace.mjs"
    );
    expect(manifest.scripts?.["smoke:repo-free-agent"]).toBe(
      "node scripts/smoke-repo-free-agent.mjs"
    );
    expect(manifest.dependencies).not.toHaveProperty("tsx");
    expect(manifest.devDependencies).toHaveProperty("tsx");
  });
});
