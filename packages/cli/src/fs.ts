import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonObject } from "./types.js";

// Locate the repository root by walking up from this module until a workspace
// marker is found. This keeps project-relative reads (render-profiles/, cards/,
// web/, skills/) stable regardless of where the compiled runtime lives
// (root dist/, packages/cli/dist/ or ts source), instead of assuming a fixed
// number of directory levels above the source file.
// Markers that identify a usable project root:
// - pnpm-workspace.yaml: the monorepo root during development/source runs.
// - deployment-manifest.json: the extracted deploy bundle root (which does not
//   ship the workspace file). The bundled dist/*.js sits one level below it.
const ROOT_MARKERS = ["pnpm-workspace.yaml", "deployment-manifest.json"];

function findRepositoryRoot(startDir: string): string {
  let current = startDir;
  for (;;) {
    if (ROOT_MARKERS.some((marker) => existsSync(path.join(current, marker)))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      // No marker found (e.g. an isolated published install). The bundled
      // entrypoints live in <root>/dist, so fall back to one level up.
      return path.resolve(startDir, "..");
    }
    current = parent;
  }
}

const SOURCE_ROOT = findRepositoryRoot(
  path.dirname(fileURLToPath(import.meta.url))
);

export function projectRoot(): string {
  return process.env.OCTO_CARD_FORGE_ROOT
    ? path.resolve(process.env.OCTO_CARD_FORGE_ROOT)
    : SOURCE_ROOT;
}

export async function readJson<T = JsonObject>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export function resolveInProject(...segments: string[]): string {
  return path.join(projectRoot(), ...segments);
}
