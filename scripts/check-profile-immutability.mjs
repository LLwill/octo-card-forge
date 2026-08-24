#!/usr/bin/env node

// Enforces that changes to the active Render Profile's *rendering* assets bump
// the profile version (published render behavior is immutable), while allowing
// purely derived assets to change without a version bump:
//
//   - render-profiles/octo-chat/component-catalog.json is a derived view of the
//     capabilities-driven specimen builders. Its byte-for-byte consistency with
//     a fresh generation is enforced by tests/component-catalog-generated.test.ts,
//     so it does not represent an independent, hand-editable render contract.
//   - The manifest field that merely *declares* that derived asset
//     (componentCatalog) is likewise non-semantic: adding it does not change how
//     any card renders.
//
// Any change to a real rendering asset (capabilities/host-config/styles/theme/
// tokens or a semantic manifest field) still requires a version bump.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const profileDir = "render-profiles/octo-chat";
const manifestPath = `${profileDir}/manifest.json`;
const derivedAssets = new Set([`${profileDir}/component-catalog.json`]);

const baseSha = process.argv[2] ?? process.env.BASE_SHA;
if (!baseSha) {
  console.error("check-profile-immutability: missing base SHA (argv[2] or BASE_SHA)");
  process.exit(2);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

const changed = git(["diff", "--name-only", `${baseSha}...HEAD`, "--", "render-profiles"])
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (changed.length === 0) {
  process.exit(0);
}

const protectedChanged = changed.filter((file) => !derivedAssets.has(file));
if (protectedChanged.length === 0) {
  console.log("Render Profile: only derived assets changed; no version bump required");
  process.exit(0);
}

const baseManifest = JSON.parse(git(["show", `${baseSha}:${manifestPath}`]));
const headManifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function canonicalWithoutDerived(manifest) {
  const clone = { ...manifest };
  delete clone.componentCatalog;
  return JSON.stringify(clone, Object.keys(clone).sort());
}

if (
  protectedChanged.length === 1 &&
  protectedChanged[0] === manifestPath &&
  canonicalWithoutDerived(baseManifest) === canonicalWithoutDerived(headManifest)
) {
  console.log(
    "Render Profile: manifest only declares a derived componentCatalog; no version bump required"
  );
  process.exit(0);
}

if (!protectedChanged.includes(manifestPath)) {
  console.error("Render Profile changes must include a versioned manifest update");
  process.exit(1);
}

if (baseManifest.version === headManifest.version) {
  console.error(`Existing Render Profile version is immutable: ${baseManifest.version}`);
  process.exit(1);
}

console.log(`Render Profile version changed: ${baseManifest.version} -> ${headManifest.version}`);
