import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { resolveInProject } from "../src/fs.js";
import {
  BASELINE_RENDER_PROFILE_FALLBACK,
  CURRENT_RENDER_PROFILE,
} from "../src/registry.js";

async function readReference(relativeManifest: string): Promise<string> {
  const raw = await readFile(resolveInProject(relativeManifest), "utf8");
  const manifest = JSON.parse(raw) as { id: string; version: string };
  return `${manifest.id}@${manifest.version}`;
}

describe("render profile baseline is single-sourced", () => {
  it("keeps the active profile, the workspace package and the CLI baseline in lockstep", async () => {
    const active = await readReference("render-profiles/octo-chat/manifest.json");
    const workspacePackage = await readReference(
      "packages/profile-octo-chat/manifest.json"
    );

    // The active source manifest is the single source of truth. Everything that
    // encodes the baseline elsewhere must derive from the same id@version.
    expect(CURRENT_RENDER_PROFILE).toBe(active);
    expect(workspacePackage).toBe(active);

    // The published CLI does not ship render-profiles/ source, so it falls back
    // to an embedded baseline. Keep that fallback in lockstep with the manifest.
    expect(BASELINE_RENDER_PROFILE_FALLBACK).toBe(active);
  });

  it("keeps the workspace package.json version aligned with its manifest", async () => {
    const manifestRaw = await readFile(
      resolveInProject("packages/profile-octo-chat/manifest.json"),
      "utf8"
    );
    const packageRaw = await readFile(
      resolveInProject("packages/profile-octo-chat/package.json"),
      "utf8"
    );
    const manifestVersion = (JSON.parse(manifestRaw) as { version: string }).version;
    const packageVersion = (JSON.parse(packageRaw) as { version: string }).version;
    expect(packageVersion).toBe(manifestVersion);
  });
});
