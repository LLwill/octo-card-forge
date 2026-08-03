import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("octo-design-cards skill", () => {
  it("defaults new card authoring to the repo-free octo-card workflow", async () => {
    const skill = await readFile("skills/octo-design-cards/SKILL.md", "utf8");
    const openaiAgent = await readFile(
      "skills/octo-design-cards/agents/openai.yaml",
      "utf8"
    );

    expect(skill).toContain("Default to repo-free card authoring");
    expect(skill).toContain("Read screenshots and fuzzy requests");
    expect(skill).toContain("octo-card verify --card ./<card-id> --emit-dir compiled --handoff handoff --format json");
    expect(skill).toContain("Ask only about missing decisions that change the data contract");
    expect(skill).toContain("octo-card presets --format json");
    expect(skill).toContain(
      'octo-card init <card-id> --name "<display-name>" --out ./<card-id> [--preset <preset-id>]'
    );
    expect(skill).toContain("octo-card emit --card ./<card-id> --sample <sample-name>");
    expect(skill).toContain("octo-card dev --card ./<card-id>");
    expect(skill).not.toContain("Work from the Octo Card Forge repository root.");
    expect(openaiAgent).toContain("Default to repo-free authoring with the octo-card CLI");
    expect(openaiAgent).toContain("ask only blocking contract/interaction/security questions");
    expect(openaiAgent).toContain("run octo-card verify");
    expect(openaiAgent).toContain("emit final Adaptive Card JSON");
  });
});
