import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("octo-design-cards skill", () => {
  it("defaults new card authoring to the repo-free octo-card workflow", async () => {
    const skill = await readFile("skills/octo-design-cards/SKILL.md", "utf8");
    const workflow = await readFile(
      "skills/octo-design-cards/references/card-package-workflow.md",
      "utf8"
    );
    const openaiAgent = await readFile(
      "skills/octo-design-cards/agents/openai.yaml",
      "utf8"
    );

    expect(skill).toContain("Default to repo-free work");
    expect(skill).toContain("## Capability modes");
    expect(skill).toContain("Skill-only");
    expect(skill).toContain("Mark output");
    expect(skill).toContain("Without a Profile, use Tier 0 only");
    expect(skill).toContain("not discover");
    expect(skill).toContain("remote releases");
    expect(skill).toContain("**Quick Card**");
    expect(skill).toContain("Adaptive Card JSON payload");
    expect(skill).toContain("Do not create a manifest");
    expect(skill).toContain("octo-card validate --input ./card.json");
    expect(skill).toContain("references/component-system.md");
    expect(skill).toContain("references/card-package-workflow.md");
    expect(workflow).toContain("## Handoff");
    expect(workflow).toContain("## Render Profiles");
    expect(skill.split(/\r?\n/).length).toBeLessThan(180);
    expect(skill).toContain("## Route the task");
    expect(skill).not.toContain("../../docs/cli-skill-and-component-system.md");
    expect(skill).toContain("For screenshots, treat visible layout as evidence");
    expect(workflow).toContain("octo-card verify --card ./<card-id> --emit-dir compiled --handoff handoff --format json");
    expect(skill).toContain("missing decisions that affect");
    expect(skill).toContain("octo-card presets --format json");
    expect(skill).toContain("## Draft and Release");
    expect(skill).toContain("octo-card verify --card ./<card-id>/versions/<version> --release --format json");
    expect(skill).toContain("Remove contract fields");
    expect(openaiAgent).toContain("versions/<version> as immutable Release");
    expect(openaiAgent).toContain("never modify a shared Profile for a single card");
    expect(skill).toContain(
      'octo-card init <card-id> --name "<display-name>" --out ./<card-id> [--preset <preset-id>]'
    );
    expect(workflow).toContain("octo-card emit --card ./<card-id> --sample <sample-name>");
    expect(workflow).toContain("octo-card dev --card ./<card-id>");
    expect(skill).not.toContain("Work from the Octo Card Forge repository root.");
    expect(openaiAgent).toContain("Default to repo-free authoring");
    expect(openaiAgent).toContain("choosing Quick Card mode for one-time messages");
    expect(openaiAgent).toContain("CLI plus a resolved Profile enables discover, validate, verify, and preview");
    expect(openaiAgent).toContain("ask only blocking contract/interaction/security questions");
    expect(openaiAgent).toContain("verify, and preview");
    expect(openaiAgent).toContain("emit final Adaptive Card JSON");
  });

  it("ships a self-contained manifest for portable Skill consumers", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { version: string };
    const manifest = JSON.parse(
      await readFile("skills/octo-design-cards/skill-manifest.json", "utf8")
    ) as {
      skill: { name: string; version: string; entry: string };
      cli: { package: string; recommendedVersion: string };
      renderProfiles: unknown[];
    };
    expect(manifest).toMatchObject({
      skill: { name: "octo-design-cards", entry: "SKILL.md" },
      cli: { package: "@mlt-org/octo-card-cli" },
    });
    expect(manifest.skill.version).toBe(packageJson.version);
    expect(manifest.cli.recommendedVersion).toBe(packageJson.version);
    expect(manifest.renderProfiles).toHaveLength(1);
  });

  it("builds a deterministic portable Skill archive", async () => {
    const firstOutput = await mkdtemp(path.join(os.tmpdir(), "octo-skill-first-"));
    const secondOutput = await mkdtemp(path.join(os.tmpdir(), "octo-skill-second-"));

    const build = async (output: string) => {
      const { stdout } = await execFileAsync(process.execPath, [
        "scripts/package-skill.mjs",
        output,
      ]);
      return JSON.parse(stdout) as {
        artifact: string;
        manifest: string;
        sha256: string;
      };
    };

    const first = await build(firstOutput);
    const second = await build(secondOutput);
    expect(first.sha256).toBe(second.sha256);

    const publishedManifest = JSON.parse(
      await readFile(first.manifest, "utf8")
    ) as { sha256: string; files: string[] };
    const installManifest = JSON.parse(
      await readFile("web/install-manifest.json", "utf8")
    ) as { skill: { sha256: string } };
    expect(publishedManifest.sha256).toBe(first.sha256);
    expect(installManifest.skill.sha256).toBe(first.sha256);
    expect(publishedManifest.files).toEqual([
      "SKILL.md",
      "agents/openai.yaml",
      "references/card-package-workflow.md",
      "references/component-system.md",
      "skill-manifest.json",
    ]);
  });
});
