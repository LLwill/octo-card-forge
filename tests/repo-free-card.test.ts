import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CURRENT_RENDER_PROFILE } from "../packages/cli/src/registry.js";
import { lintCardPackageForAgent } from "../packages/cli/src/agent.js";
import { checkCardPackage } from "../packages/cli/src/check.js";
import { compileSampleFromDirectory } from "../packages/cli/src/compiler.js";
import { bundleRenderProfile } from "../packages/cli/src/profile.js";
import { loadRenderProfileFromPackage } from "../packages/cli/src/profile-source.js";

async function copyCardFixture(cardId: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "octo-card-package-"));
  const target = path.join(root, cardId);
  await cp(path.resolve("tests", "fixtures", "cards", cardId), target, { recursive: true });
  return target;
}

describe("repo-free card package authoring", () => {
  it("checks, lints and renders an explicit card directory", async () => {
    const cardRoot = await copyCardFixture("example.choice");
    const profileOutput = await mkdtemp(path.join(os.tmpdir(), "octo-profile-package-"));
    const profileBundle = await bundleRenderProfile("octo-chat@latest", profileOutput);
    const profile = await loadRenderProfileFromPackage(profileBundle.packageRoot);

    await expect(checkCardPackage(cardRoot, profile)).resolves.toMatchObject({
      valid: true,
      cards: [
        {
          cardId: "example.choice",
          version: "0.1.0",
        },
      ],
    });

    await expect(lintCardPackageForAgent(cardRoot, profile)).resolves.toMatchObject({
      valid: true,
      summary: {
        cards: 1,
        errors: 0,
      },
    });

    const result = await compileSampleFromDirectory({
      cardRoot,
      sample: "default",
      profile,
    });
    expect(result.cardId).toBe("example.choice");
    expect(result.renderProfile).toBe(CURRENT_RENDER_PROFILE);
    expect(result.payload.type).toBe("AdaptiveCard");
    expect(result.issues).toEqual([]);
  });
});
