import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { resolveInProject } from "../packages/cli/src/fs.js";
import {
  BASELINE_RENDER_PROFILE_FALLBACK,
  CURRENT_RENDER_PROFILE,
} from "../packages/cli/src/registry.js";

async function readManifest(
  relativeManifest: string
): Promise<{ id: string; version: string }> {
  const raw = await readFile(resolveInProject(relativeManifest), "utf8");
  return JSON.parse(raw) as { id: string; version: string };
}

describe("render profile baseline is single-sourced", () => {
  it("keeps the active profile, the embedded fallback and the CLI baseline in lockstep", async () => {
    const active = await readManifest("render-profiles/octo-chat/manifest.json");
    const activeReference = `${active.id}@${active.version}`;

    // render-profiles/octo-chat/manifest.json is the single source of truth.
    // The runtime baseline derives from it at load time; the published CLI
    // (which does not ship render-profiles/) falls back to an embedded const.
    // Both must resolve to the same id@version.
    expect(CURRENT_RENDER_PROFILE).toBe(activeReference);
    expect(BASELINE_RENDER_PROFILE_FALLBACK).toBe(activeReference);
  });

  it("keeps the workspace package.json version synced from the source manifest", async () => {
    // The workspace package no longer stores its own copy of the profile
    // manifest; it re-packages render-profiles/ at build time. npm still needs
    // a literal version, which scripts/sync-version.mjs derives from the same
    // manifest, so the two must always match in a synced tree.
    const active = await readManifest("render-profiles/octo-chat/manifest.json");
    const packageRaw = await readFile(
      resolveInProject("packages/profile-octo-chat/package.json"),
      "utf8"
    );
    const packageVersion = (JSON.parse(packageRaw) as { version: string }).version;
    expect(packageVersion).toBe(active.version);
  });
});
