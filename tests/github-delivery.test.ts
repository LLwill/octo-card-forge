import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("GitHub Delivery Actions", () => {
  it("pins published Forge tools and keeps release publication explicit", async () => {
    const checkAction = await readFile("actions/card-check/action.yml", "utf8");
    const releaseAction = await readFile("actions/card-release/action.yml", "utf8");

    for (const action of [checkAction, releaseAction]) {
      expect(action).toContain('default: "0.2.2"');
      expect(action).toContain('default: "1.2.0-rc.4"');
      expect(action).toContain("../_shared/install-tools.sh");
      expect(action).toContain("package-manager-cache: false");
      expect(action).not.toContain("packages/cli");
      expect(action).not.toContain("pnpm cli");
    }

    expect(checkAction).toContain("actions/upload-artifact@v4");
    expect(releaseAction).toContain("github-token:");
    expect(releaseAction).toContain("inputs.publish == 'true'");
  });

  it("defines stable Card Release tag and asset names", async () => {
    const prepare = await readFile("actions/card-release/prepare.sh", "utf8");
    const publish = await readFile("actions/card-release/publish.sh", "utf8");

    expect(prepare).toContain('release_tag="card/$card_id/v$card_version"');
    expect(prepare).toContain(".artifact.json");
    expect(prepare).toContain(".artifact.sha256");
    expect(prepare).toContain(".handoff.zip");
    expect(prepare).toContain(".handoff.sha256");
    expect(publish).toContain("already exists and cannot be overwritten");
    expect(publish).toContain('gh release create "$RELEASE_TAG"');
  });
});
