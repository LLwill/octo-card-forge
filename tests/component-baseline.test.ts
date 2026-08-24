import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildComponentBaseline,
  buildComponentBaselineGroups,
} from "../packages/cli/src/component-baseline.js";
import {
  CURRENT_RENDER_PROFILE,
  getCurrentRenderProfile,
} from "../packages/cli/src/registry.js";
import { validateCompiledCard } from "../packages/cli/src/validate.js";

describe("component baseline", () => {
  it("is pinned to the repository's single current HostConfig", async () => {
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
      expect(section.card, section.id).toBeDefined();
      expect(
        validateCompiledCard(section.card!, profile.capabilities, "octo/v2"),
        section.id
      ).toEqual([]);
    }
  });

  it("splits style system content into planned sections", async () => {
    const profile = await getCurrentRenderProfile();
    const groups = buildComponentBaselineGroups(profile.capabilities);

    expect(groups.map((group) => group.id)).toEqual([
      "foundation",
      "adaptive-card-components",
      "octo-utility-tokens",
      "composition-patterns",
    ]);
    expect(groups[0].sections.map((section) => section.id)).toEqual([
      "foundation-typography",
      "foundation-colors",
      "foundation-layout",
    ]);
    expect(groups[1].sections.map((section) => section.id)).toEqual([
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
    expect(groups[2].sections.map((section) => section.id)).toEqual([
      "utility-surface",
      "utility-badge",
      "utility-inset",
      "utility-line",
      "utility-motion",
    ]);
    expect(groups[3].sections.map((section) => section.id)).toEqual([
      "pattern-skeleton-preview",
      "pattern-status-block",
    ]);
    for (const section of groups[3].sections) {
      expect(section.card, section.id).toBeDefined();
      expect(
        validateCompiledCard(section.card!, profile.capabilities, "octo/v2"),
        section.id
      ).toEqual([]);
    }
  });

  it("shows every declared utility token with a valid preview card", async () => {
    const profile = await getCurrentRenderProfile();
    const utilityGroup = buildComponentBaselineGroups(profile.capabilities).find(
      (group) => group.id === "octo-utility-tokens"
    );
    const specimens = utilityGroup?.sections.flatMap(
      (section) => section.utilityTokens ?? []
    );

    expect(specimens?.map((specimen) => specimen.token).sort()).toEqual(
      Object.keys(profile.capabilities.utilities ?? {}).sort()
    );
    for (const specimen of specimens ?? []) {
      expect(
        validateCompiledCard(specimen.card, profile.capabilities, "octo/v2"),
        specimen.token
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
    expect(stylesheet).toContain('[id^="octo--"][id*="--line-skeleton--"]');
    expect(stylesheet).not.toContain(":first-child");
    expect(stylesheet).not.toContain(":last-child");
    expect(stylesheet).not.toContain("#preview");
    expect(stylesheet).not.toContain("#deny_panel");
  });
});
