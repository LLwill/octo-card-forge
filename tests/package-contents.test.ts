import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

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
    expect(files.some((file) => file.endsWith(".handoff.zip"))).toBe(false);
    expect(files.some((file) => file.startsWith("package/cards/"))).toBe(false);
    expect(files.some((file) => file.startsWith("package/render-profiles/"))).toBe(false);
  });
});
