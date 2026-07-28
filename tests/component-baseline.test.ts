import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildComponentBaseline } from "../src/component-baseline.js";
import {
  CURRENT_RENDER_PROFILE,
  getCurrentRenderProfile,
} from "../src/registry.js";
import { validateCompiledCard } from "../src/validate.js";

describe("component baseline", () => {
  it("is pinned to the repository's single current HostConfig", async () => {
    expect(CURRENT_RENDER_PROFILE).toBe("octo-chat@1.2.0-rc.1");
    const profile = await getCurrentRenderProfile();
    expect(`${profile.manifest.id}@${profile.manifest.version}`).toBe(
      CURRENT_RENDER_PROFILE
    );
    expect(profile.manifest.hostConfig).toBe("host-config.json");
  });

  it("covers every supported component family with valid standard cards", async () => {
    const profile = await getCurrentRenderProfile();
    const sections = buildComponentBaseline(profile.capabilities);

    expect(sections.map((section) => section.id)).toEqual([
      "typography",
      "containers",
      "semantic-primitives",
      "layout",
      "media-facts",
      "table",
      "inputs-basic",
      "inputs-choice",
      "actions",
    ]);
    for (const section of sections) {
      expect(
        validateCompiledCard(section.card, profile.capabilities, "octo/v2"),
        section.id
      ).toEqual([]);
    }
  });

  it("keeps the baseline free of business Card and Action selectors", async () => {
    const profile = await getCurrentRenderProfile();
    const serialized = JSON.stringify(buildComponentBaseline(profile.capabilities));

    expect(serialized).not.toContain("docs.access-request");
    expect(serialized).not.toContain("ai.decision-action");
    expect(serialized).not.toContain("deny_panel");
  });

  it("uses explicit public semantics instead of guessing Header and Footer positions", async () => {
    const profile = await getCurrentRenderProfile();
    const stylesheet = await readFile(
      path.join(profile.root, profile.manifest.stylesheet),
      "utf8"
    );

    expect(stylesheet).toContain('[id^="octo-surface-accent-"]');
    expect(stylesheet).toContain('[id^="octo-surface-header-accent-"]');
    expect(stylesheet).toContain('[id^="octo-surface-footer-default-"]');
    expect(stylesheet).toContain('[id^="octo-badge-"]');
    expect(stylesheet).not.toContain(":first-child");
    expect(stylesheet).not.toContain(":last-child");
    expect(stylesheet).not.toContain("#preview");
    expect(stylesheet).not.toContain("#deny_panel");
  });
});
