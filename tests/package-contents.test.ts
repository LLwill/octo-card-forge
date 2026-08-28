import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CURRENT_RENDER_PROFILE } from "../packages/cli/src/registry.js";

const execFileAsync = promisify(execFile);

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to reserve test port");
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}

async function waitForJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

describe("CLI package contents", () => {
  it("keeps the private Core package boundary explicit", async () => {
    const manifest = JSON.parse(await readFile("packages/core/package.json", "utf8")) as {
      private?: boolean;
      version?: string;
      files?: string[];
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(manifest.private).toBe(true);
    expect(manifest.version).toBe("0.0.0");
    expect(manifest.files).toEqual(["dist"]);
    expect(manifest.dependencies).not.toHaveProperty("@mlt-org/octo-card-spec");
    expect(manifest.devDependencies).toHaveProperty("@mlt-org/octo-card-spec", "workspace:*");
  });

  it("does not publish generated cards, handoff zips or profile source", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "octo-card-pack-"));
    await execFileAsync("pnpm", ["build"]);
    const { stdout } = await execFileAsync("pnpm", [
      "pack",
      "--pack-destination",
      output,
    ]);
    const tarball = stdout.trim().split(/\r?\n/).at(-1);
    expect(tarball).toMatch(/\.tgz$/);

    const packed = path.isAbsolute(tarball!)
      ? tarball!
      : path.join(output, tarball!);
    const { stdout: listing } = await execFileAsync("tar", ["-tzf", packed]);
    const files = listing.trim().split(/\r?\n/).sort();
    const { stdout: packedManifestText } = await execFileAsync("tar", [
      "-xOf",
      packed,
      "package/package.json",
    ]);
    const packedManifest = JSON.parse(packedManifestText) as {
      dependencies?: Record<string, string>;
    };
    const { stdout: bundledCli } = await execFileAsync("tar", [
      "-xOf",
      packed,
      "package/dist/cli.js",
    ]);
    const bundledServer = await readFile("dist/server.js", "utf8");

    expect(files).toContain("package/dist/cli.js");
    expect(files.filter((file) => file.startsWith("package/dist/"))).toEqual([
      "package/dist/cli.js",
      "package/dist/cli.js.map",
    ]);
    expect(files).toContain("package/skills/octo-design-cards/SKILL.md");
    expect(files).toContain("package/skills/octo-design-cards/skill-manifest.json");
    expect(files).toContain("package/skills/octo-design-cards/references/card-package-workflow.md");
    expect(files).toContain("package/skills/octo-design-cards/references/component-system.md");
    expect(files).toContain("package/web/install-manifest.json");
    expect(files).toContain("package/web/preview-kit.js");
    expect(files).toContain("package/apps/forge-web/dist/index.html");
    expect(files.some((file) => file.startsWith("package/apps/forge-web/dist/assets/index-") && file.endsWith(".js"))).toBe(true);
    expect(files.some((file) => file.endsWith(".handoff.zip"))).toBe(false);
    expect(files.some((file) => file.startsWith("package/cards/"))).toBe(false);
    expect(files.some((file) => file.startsWith("package/render-profiles/"))).toBe(false);
    for (const packageName of [
      "@mlt-org/octo-card-core",
      "@mlt-org/octo-card-spec",
      "@mlt-org/octo-card-workspace",
    ]) {
      expect(packedManifest.dependencies).not.toHaveProperty(packageName);
      expect(bundledCli).not.toContain(packageName);
      expect(bundledServer).not.toContain(packageName);
    }
  }, 60_000);

  it("builds the production image from the deploy artifact", async () => {
    const dockerfile = await readFile("Dockerfile.ci", "utf8");
    expect(dockerfile).toContain("COPY compatibility ./compatibility");
    expect(dockerfile).toContain("pnpm package:deploy /release");
    expect(dockerfile).not.toContain("COPY --chown=octo:octo cards ./cards");
  });

  it("builds the characterized deploy bundle", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "octo-card-deploy-"));
    try {
      const { stdout } = await execFileAsync("pnpm", ["package:deploy", output]);
      const result = JSON.parse(stdout.slice(stdout.indexOf("{"))) as {
        artifact: string;
        manifest: string;
        sha256: string;
      };
      const { stdout: listing } = await execFileAsync("tar", [
        "-tzf",
        result.artifact,
      ]);
      const files = listing.trim().split(/\r?\n/).sort();
      const manifest = JSON.parse(await readFile(result.manifest, "utf8")) as {
        entrypoint: string;
        renderProfile: string;
        sha256: string;
      };
      const actualSha256 = createHash("sha256")
        .update(await readFile(result.artifact))
        .digest("hex");

      expect(files).toEqual(
        expect.arrayContaining([
          "./deployment-manifest.json",
          "./dist/server.js",
          "./scripts/start-service.mjs",
          "./apps/forge-web/dist/index.html",
          "./skills/octo-design-cards/skill-manifest.json",
        ])
      );
      expect(files.some((file) => file.startsWith("./cards/"))).toBe(false);
      expect(manifest).toMatchObject({
        entrypoint: "pnpm start",
        renderProfile: CURRENT_RENDER_PROFILE,
        sha256: actualSha256,
      });
      expect(result.sha256).toBe(actualSha256);

      const runtime = path.join(output, "runtime");
      await mkdir(runtime);
      await execFileAsync("tar", ["-xzf", result.artifact, "-C", runtime]);
      await execFileAsync(
        "pnpm",
        ["install", "--prod", "--frozen-lockfile", "--prefer-offline"],
        { cwd: runtime }
      );

      const port = await availablePort();
      const service = spawn("pnpm", ["start"], {
        cwd: runtime,
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: String(port),
          BASE_PATH: "/phase1",
        },
        stdio: "ignore",
      });
      try {
        await expect(
          waitForJson(`http://127.0.0.1:${port}/healthz`)
        ).resolves.toEqual({ status: "ok" });
        await expect(
          waitForJson(`http://127.0.0.1:${port}/phase1/healthz`)
        ).resolves.toEqual({ status: "ok" });
        await expect(
          waitForJson(`http://127.0.0.1:${port}/phase1/api/v1/runtime`),
        ).resolves.toMatchObject({ mode: "published" });
      } finally {
        service.kill("SIGTERM");
        await new Promise<void>((resolve) => {
          service.once("close", () => resolve());
          setTimeout(resolve, 2_000);
        });
      }
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  }, 120_000);
});
