import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

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
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

describe("CLI package contents", () => {
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

    expect(files).toContain("package/dist/cli.js");
    expect(files).toContain("package/skills/octo-design-cards/SKILL.md");
    expect(files).toContain("package/skills/octo-design-cards/skill-manifest.json");
    expect(files).toContain("package/skills/octo-design-cards/references/card-package-workflow.md");
    expect(files).toContain("package/skills/octo-design-cards/references/component-system.md");
    expect(files).toContain("package/web/install.html");
    expect(files).toContain("package/web/install.js");
    expect(files).toContain("package/web/install-manifest.json");
    expect(files.some((file) => file.endsWith(".handoff.zip"))).toBe(false);
    expect(files.some((file) => file.startsWith("package/cards/"))).toBe(false);
    expect(files.some((file) => file.startsWith("package/render-profiles/"))).toBe(false);
  }, 15_000);

  it("copies the Skill manifest into the production image", async () => {
    const dockerfile = await readFile("Dockerfile.ci", "utf8");
    expect(dockerfile).toContain("COPY --chown=octo:octo skills ./skills");
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
          "./web/index.html",
          "./cards/docs.access-request/goldens/pending.card.json",
          "./skills/octo-design-cards/skill-manifest.json",
        ])
      );
      expect(manifest).toMatchObject({
        entrypoint: "pnpm start",
        renderProfile: "octo-chat@1.2.0-rc.3",
        sha256: actualSha256,
      });
      expect(result.sha256).toBe(actualSha256);

      const runtime = path.join(output, "runtime");
      await mkdir(runtime);
      await execFileAsync("tar", ["-xzf", result.artifact, "-C", runtime]);
      await execFileAsync(
        "pnpm",
        ["install", "--prod", "--frozen-lockfile", "--offline"],
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
          waitForJson(`http://127.0.0.1:${port}/phase1/healthz`)
        ).resolves.toEqual({ status: "ok" });
        const cards = await waitForJson(
          `http://127.0.0.1:${port}/phase1/api/cards`
        ) as Array<{ reference: string }>;
        expect(cards.map((card) => card.reference)).toContain("docs.access-request");
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
  }, 40_000);
});
