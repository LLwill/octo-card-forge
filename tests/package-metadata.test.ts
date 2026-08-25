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
    expect(manifest.files).toEqual([
      "dist/cli.js",
      "dist/cli.js.map",
      "web",
      "apps/forge-web/dist",
      "skills",
      "README.md",
    ]);
    expect(manifest.files).not.toContain("cards");
    expect(manifest.files).not.toContain("render-profiles");
    expect(manifest.scripts?.prebuild).toBe("node scripts/clean-build-output.mjs");
    expect(manifest.scripts?.build).toBe(
      "pnpm run workspace:check && pnpm run build:packages && pnpm run build:entries"
    );
    expect(manifest.scripts?.["build:legacy"]).toBeUndefined();
    expect(manifest.scripts?.["build:entries"]).toBe(
      "node scripts/bundle-entrypoints.mjs"
    );
    expect(manifest.scripts?.["workspace:check"]).toBe(
      "node scripts/check-workspace-dependencies.mjs"
    );
    expect(manifest.scripts?.["test:legacy"]).toBe(
      "vitest run --config vitest.legacy.config.ts"
    );
    expect(manifest.scripts?.["prepare:agent-validation"]).toBe(
      "node scripts/create-agent-validation-workspace.mjs"
    );
    expect(manifest.scripts?.["smoke:repo-free-agent"]).toBe(
      "node scripts/smoke-repo-free-agent.mjs"
    );
    expect(manifest.scripts?.["smoke:published-consumer"]).toBe(
      "node scripts/smoke-published-consumer.mjs"
    );
    expect(manifest.scripts?.["skill:pack"]).toBe("node scripts/package-skill.mjs");
    expect(manifest.dependencies).not.toHaveProperty("tsx");
    expect(manifest.devDependencies).toHaveProperty("tsx");
    expect(manifest.devDependencies).toHaveProperty("esbuild");
    expect(manifest.devDependencies).toHaveProperty(
      "@mlt-org/octo-card-core",
      "workspace:*"
    );
    expect(manifest.devDependencies).toHaveProperty(
      "@mlt-org/octo-card-workspace",
      "workspace:*"
    );
  });
});
