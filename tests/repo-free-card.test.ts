import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lintCardPackageForAgent } from "../src/agent.js";
import { checkCardPackage } from "../src/check.js";
import { compileSampleFromDirectory } from "../src/compiler.js";
import { bundleRenderProfile } from "../src/profile.js";
import { loadRenderProfileFromPackage } from "../src/profile-source.js";

async function copyCardFixture(cardId: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "octo-card-package-"));
  const target = path.join(root, cardId);
  await cp(path.resolve("cards", cardId), target, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}versions${path.sep}`),
  });
  return target;
}

describe("repo-free card package authoring", () => {
  it("checks, lints and renders an explicit card directory", async () => {
    const cardRoot = await copyCardFixture("ai.reasoning-process");
    const profileOutput = await mkdtemp(path.join(os.tmpdir(), "octo-profile-package-"));
    const profileBundle = await bundleRenderProfile("octo-chat@latest", profileOutput);
    const profile = await loadRenderProfileFromPackage(profileBundle.packageRoot);

    await expect(checkCardPackage(cardRoot, profile)).resolves.toMatchObject({
      valid: true,
      cards: [
        {
          cardId: "ai.reasoning-process",
          version: "0.3.0",
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
      sample: "reasoning",
      profile,
    });
    expect(result.cardId).toBe("ai.reasoning-process");
    expect(result.renderProfile).toBe("octo-chat@1.2.0-rc.3");
    expect(result.payload.type).toBe("AdaptiveCard");
    expect(result.issues).toEqual([]);
  });
});
