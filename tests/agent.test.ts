import { describe, expect, it } from "vitest";
import { CURRENT_RENDER_PROFILE } from "../packages/cli/src/registry.js";
import {
  discoverUtilities,
  explainUtility,
  lintCardPackageForAgent,
} from "../packages/cli/src/agent.js";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bundleRenderProfile } from "../packages/cli/src/profile.js";
import { loadRenderProfileFromPackage } from "../packages/cli/src/profile-source.js";
import { CHOICE_CARD_ROOT } from "./card-fixtures.js";

describe("agent utility discovery", () => {
  it("groups declared utility tokens for agent lookup", async () => {
    const report = await discoverUtilities({ query: "skeleton" });

    expect(report.profile).toBe(CURRENT_RENDER_PROFILE);
    expect(report.idSyntax).toBe("octo--<token>--<token>--uid-<unique-name>");
    expect(report.maxTokensPerElement).toBe(3);
    expect(report.groups.map((group) => group.group)).toEqual(["line", "motion"]);
    expect(report.groups.flatMap((group) => group.tokens.map((token) => token.token))).toEqual([
      "line-skeleton",
      "motion-shimmer",
    ]);
  });

  it("explains a utility with fallback and a valid card-shaped example", async () => {
    const report = await explainUtility({ token: "surface-warning" });

    expect(report).toMatchObject({
      profile: CURRENT_RENDER_PROFILE,
      token: "surface-warning",
      group: "surface",
      fallback: { style: "warning" },
      idExample: "octo--surface-warning--inset-md--uid-example",
    });
    expect(report.recommendedCombinations).toContain("inset-md");
    expect(report.cardExample).toMatchObject({
      type: "Container",
      id: "octo--surface-warning--inset-md--uid-example",
      style: "warning",
    });
  });

  it("can discover utilities from a bundled profile package", async () => {
    const output = await mkdtemp(path.join(os.tmpdir(), "octo-agent-profile-"));
    const bundle = await bundleRenderProfile("octo-chat@latest", output);
    const profileSource = await loadRenderProfileFromPackage(bundle.packageRoot);
    const report = await discoverUtilities({ query: "warning", profileSource });

    expect(report.profile).toBe(CURRENT_RENDER_PROFILE);
    expect(report.groups.flatMap((group) => group.tokens.map((token) => token.token))).toContain(
      "surface-warning"
    );
  });
});

describe("agent lint", () => {
  it("returns an agent-readable lint report", async () => {
    const report = await lintCardPackageForAgent(CHOICE_CARD_ROOT);

    expect(report.valid).toBe(true);
    expect(report.summary.cards).toBe(1);
    expect(report.summary.samples).toBeGreaterThan(0);
    expect(report.summary.errors).toBe(0);
    expect(report.cards[0]).toMatchObject({
      reference: "example.choice",
      cardId: "example.choice",
      kind: "draft",
      mutable: true,
    });
    expect(report.cards[0].samples[0]).toHaveProperty("utilities");
  });
});
