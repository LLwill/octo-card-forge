import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CURRENT_RENDER_PROFILE } from "../packages/cli/src/registry.js";

const execFileAsync = promisify(execFile);

async function currentVersions(): Promise<{ cli: string; skill: string }> {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
  const skillManifest = JSON.parse(
    await readFile("skills/octo-design-cards/skill-manifest.json", "utf8")
  ) as { skill: { version: string } };
  return { cli: packageJson.version, skill: skillManifest.skill.version };
}

describe("agent lifecycle bootstrap", () => {
  it("initializes idempotently, diagnoses, and performs a read-only upgrade check", async () => {
    const versions = await currentVersions();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "octo-card-agent-"));
    const agentsPath = path.join(workspace, "AGENTS.md");
    await writeFile(agentsPath, "# Consumer workspace\n\nKeep this instruction.\n");

    const init = await execFileAsync("pnpm", [
      "--silent", "cli", "agent", "init", "--workspace", workspace, "--format", "json",
    ]);
    const initReport = JSON.parse(init.stdout) as {
      state: { skill: { version: string }; cli: { version: string }; renderProfile: { reference: string } };
    };
    expect(initReport.state).toMatchObject({
      skill: { version: versions.skill },
      cli: { version: versions.cli },
      renderProfile: { reference: CURRENT_RENDER_PROFILE },
    });
    const firstAgents = await readFile(agentsPath, "utf8");
    expect(firstAgents).toContain("Keep this instruction.");
    expect(firstAgents).toContain("octo-card:managed:start");

    const secondInit = await execFileAsync("pnpm", [
      "--silent", "cli", "agent", "init", "--workspace", workspace, "--format", "json",
    ]);
    const secondReport = JSON.parse(secondInit.stdout) as { created: string[] };
    expect(secondReport.created).toEqual([]);
    expect(await readFile(agentsPath, "utf8")).toBe(firstAgents);

    const doctor = await execFileAsync("pnpm", [
      "--silent", "cli", "agent", "doctor", "--workspace", workspace, "--format", "json",
    ]);
    expect(JSON.parse(doctor.stdout)).toMatchObject({ valid: true, workspace });

    const upgrade = await execFileAsync("pnpm", [
      "--silent", "cli", "agent", "upgrade", "--check", "--workspace", workspace, "--format", "json",
    ]);
    expect(JSON.parse(upgrade.stdout)).toMatchObject({
      valid: true,
      checkOnly: true,
      needsUpgrade: false,
      changes: [],
    });

    const statePath = path.join(workspace, ".octo-card", "agent.json");
    const state = JSON.parse(await readFile(statePath, "utf8")) as { skill: { path: string } };
    state.skill.path = "missing/SKILL.md";
    await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
    await expect(execFileAsync("pnpm", [
      "--silent", "cli", "agent", "doctor", "--workspace", workspace, "--format", "json",
    ])).rejects.toMatchObject({ code: 1 });
  }, 15_000);

  it("returns a non-zero result when the workspace is not initialized", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "octo-card-agent-empty-"));
    await expect(execFileAsync("pnpm", [
      "--silent", "cli", "agent", "doctor", "--workspace", workspace, "--format", "json",
    ])).rejects.toMatchObject({ code: 1 });
  });

  it("detects an exact CLI version mismatch in a lockfile", async () => {
    const versions = await currentVersions();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "octo-card-agent-lockfile-"));
    await writeFile(
      path.join(workspace, "package.json"),
      `${JSON.stringify({
        private: true,
        devDependencies: { "@mlt-org/octo-card-cli": versions.cli },
      }, null, 2)}\n`
    );
    await writeFile(
      path.join(workspace, "pnpm-lock.yaml"),
      `lockfileVersion: '9.0'\n\npackages:\n\n  '@mlt-org/octo-card-cli@${versions.cli}':\n    resolution: {}\n`
    );
    await execFileAsync("pnpm", [
      "--silent", "cli", "agent", "init", "--workspace", workspace, "--format", "json",
    ]);
    const valid = await execFileAsync("pnpm", [
      "--silent", "cli", "agent", "doctor", "--workspace", workspace, "--format", "json",
    ]);
    expect(JSON.parse(valid.stdout)).toMatchObject({ valid: true });

    await writeFile(
      path.join(workspace, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n\npackages:\n\n  '@mlt-org/octo-card-cli@0.0.9':\n    resolution: {}\n"
    );
    await expect(execFileAsync("pnpm", [
      "--silent", "cli", "agent", "doctor", "--workspace", workspace, "--format", "json",
    ])).rejects.toMatchObject({ code: 1 });
  }, 15_000);
});
