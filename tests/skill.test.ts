import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("octo-design-cards skill", () => {
  it("defaults new card authoring to the repo-free octo-card workflow", async () => {
    const skill = await readFile("skills/octo-design-cards/SKILL.md", "utf8");

    expect(skill).toContain("Default to repo-free card authoring");
    expect(skill).toContain("octo-card init <card-id> --name \"<display-name>\" --out ./<card-id>");
    expect(skill).toContain("octo-card check --card ./<card-id> --format json");
    expect(skill).toContain("octo-card emit --card ./<card-id> --sample <sample-name>");
    expect(skill).toContain("octo-card dev --card ./<card-id>");
    expect(skill).not.toContain("Work from the Octo Card Forge repository root.");
  });
});
