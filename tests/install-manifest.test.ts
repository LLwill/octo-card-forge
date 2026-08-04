import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("install manifest", () => {
  it("ships self-contained Skill Bundle metadata without a remote manifest dependency", async () => {
    const manifest = JSON.parse(await readFile("web/install-manifest.json", "utf8")) as {
      skill: { bundleUrl: string; releaseUrl: string; sha256: string };
    };
    const skill = JSON.parse(await readFile("skills/octo-design-cards/skill-manifest.json", "utf8")) as {
      skill: { version: string };
    };
    expect(manifest.skill.bundleUrl).toContain("/releases/latest/download/");
    expect(manifest.skill.bundleUrl).toContain(`octo-design-cards-skill-${skill.skill.version}.tgz`);
    expect(manifest.skill.releaseUrl).toContain("/releases/latest");
    expect(manifest.skill.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
