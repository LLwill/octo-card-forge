import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("agent lifecycle bootstrap", () => {
  it("initializes idempotently, diagnoses, and performs a read-only upgrade check", async () => {
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
      skill: { version: "0.1.0" },
      cli: { version: "0.1.0" },
      renderProfile: { reference: "octo-chat@1.2.0-rc.2" },
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
  });

  it("returns a non-zero result when the workspace is not initialized", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "octo-card-agent-empty-"));
    await expect(execFileAsync("pnpm", [
      "--silent", "cli", "agent", "doctor", "--workspace", workspace, "--format", "json",
    ])).rejects.toMatchObject({ code: 1 });
  });
});
