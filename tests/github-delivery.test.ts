import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("GitHub Delivery Actions", () => {
  it("pins published Forge tools and keeps release publication explicit", async () => {
    const checkAction = await readFile("actions/card-check/action.yml", "utf8");
    const releaseAction = await readFile("actions/card-release/action.yml", "utf8");
    const checkRun = await readFile("actions/card-check/run.sh", "utf8");

    for (const action of [checkAction, releaseAction]) {
      expect(action).toContain('default: "0.2.4"');
      expect(action).toContain('default: "1.2.0-rc.4"');
      expect(action).toContain("../_shared/install-tools.sh");
      expect(action).toContain("package-manager-cache: false");
      expect(action).not.toContain("packages/cli");
      expect(action).not.toContain("pnpm cli");
    }

    expect(checkAction).toContain("actions/upload-artifact@v4");
    expect(checkAction).toContain("preview-snapshot-sha256");
    expect(checkRun).toContain("snapshot build");
    expect(checkRun).toContain("--channel preview");
    expect(checkRun).toContain("embed-preview.mjs");
    expect(checkRun).toContain("pull_request?.head?.sha");
    expect(checkRun).toContain("pull_request?.head?.repo?.full_name");
    expect(checkRun).toContain('"$forge_web_root/assets/*.js"');
    expect(checkRun).toContain('"$forge_web_root/assets/*.css"');
    expect(checkRun).not.toContain('"$forge_web_root/app.js"');
    expect(checkRun).not.toContain('"$forge_web_root/styles.css"');
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
