import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { JsonObject } from "./types.js";

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
