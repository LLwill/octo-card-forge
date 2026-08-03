import { readdir } from "node:fs/promises";
import path from "node:path";
import { readJson, resolveInProject } from "./fs.js";
import type {
  CardManifest,
  CardPackage,
  RenderCapabilities,
  RenderProfileManifest,
  RenderProfileSource,
} from "./types.js";

/** 仓库当前唯一的组件基线。历史 Profile 由制品库负责复现。 */
export const CURRENT_RENDER_PROFILE = "octo-chat@1.2.0-rc.2";
const ACTIVE_RENDER_PROFILE_ROOT = "render-profiles";

const RENDER_PROFILE_REFERENCE =
  /^([a-z][a-z0-9.-]*)@(latest|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export function parseRenderProfileReference(reference: string): {
  id: string;
  version: string;
} {
  const match = RENDER_PROFILE_REFERENCE.exec(reference.trim());
  if (!match) {
    throw new Error(
      `Invalid render profile reference: ${reference} (use id@x.y.z or id@latest)`
    );
  }
  return { id: match[1], version: match[2] };
}

/**
 * Resolve a profile reference to a concrete version.
 * - omitted / empty / `id@latest` → `CURRENT_RENDER_PROFILE` (repo baseline)
 * - `id@x.y.z` → unchanged pin (history / freeze)
 */
export function resolveRenderProfileReference(reference?: string): string {
  const raw = reference?.trim();
  if (!raw) return CURRENT_RENDER_PROFILE;
  const { id, version } = parseRenderProfileReference(raw);
  if (version === "latest") {
    const current = parseRenderProfileReference(CURRENT_RENDER_PROFILE);
    if (id !== current.id) {
      throw new Error(
        `Unknown render profile family for @latest: ${id} (current is ${current.id})`
      );
    }
    return CURRENT_RENDER_PROFILE;
  }
  return `${id}@${version}`;
}

export function assertCardManifest(value: CardManifest, filePath: string): void {
  if (value.schemaVersion !== 2) {
    throw new Error(`${filePath}: unsupported schemaVersion ${String(value.schemaVersion)}`);
  }
  if (!value.id || !value.dataSchema) {
    throw new Error(`${filePath}: id and dataSchema are required`);
  }
  if (value.renderProfile !== undefined && value.renderProfile !== "") {
    parseRenderProfileReference(value.renderProfile);
  }
  if (!value.views || Object.keys(value.views).length === 0) {
    throw new Error(`${filePath}: at least one view is required`);
  }
  for (const [viewName, view] of Object.entries(value.views)) {
    if (view.wireProfile !== "octo/v1" && view.wireProfile !== "octo/v2") {
      throw new Error(`${filePath}: view ${viewName} has an invalid wireProfile`);
    }
  }
}

export async function loadCardPackage(root: string): Promise<CardPackage> {
  const resolvedRoot = path.resolve(root);
  const manifestPath = path.join(resolvedRoot, "manifest.json");
  const manifest = await readJson<CardManifest>(manifestPath);
  assertCardManifest(manifest, manifestPath);
  return {
    reference: manifest.id,
    root: resolvedRoot,
    manifest,
  };
}

function isCurrentRenderProfile(manifest: CardManifest): boolean {
  return resolveRenderProfileReference(manifest.renderProfile) === CURRENT_RENDER_PROFILE;
}

export async function listCards(): Promise<CardPackage[]> {
  const cardsRoot = resolveInProject("cards");
  const entries = await readdir(cardsRoot, { withFileTypes: true });
  const cards: CardPackage[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const root = path.join(cardsRoot, entry.name);
    const manifestPath = path.join(root, "manifest.json");
    const manifest = await readJson<CardManifest>(manifestPath);
    assertCardManifest(manifest, manifestPath);
    if (isCurrentRenderProfile(manifest)) {
      cards.push({ reference: manifest.id, root, manifest });
    }

    const versionsRoot = path.join(root, "versions");
    let versions: import("node:fs").Dirent[] = [];
    try {
      versions = await readdir(versionsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    for (const versionEntry of versions) {
      if (!versionEntry.isDirectory()) continue;
      const versionRoot = path.join(versionsRoot, versionEntry.name);
      const versionManifestPath = path.join(versionRoot, "manifest.json");
      const versionManifest = await readJson<CardManifest>(versionManifestPath);
      assertCardManifest(versionManifest, versionManifestPath);
      if (versionManifest.id !== manifest.id) {
        throw new Error(
          `${versionManifestPath}: version package id must be ${manifest.id}`
        );
      }
      if (versionManifest.version !== versionEntry.name) {
        throw new Error(
          `${versionManifestPath}: version must match directory ${versionEntry.name}`
        );
      }
      if (isCurrentRenderProfile(versionManifest)) {
        cards.push({
          reference: `${versionManifest.id}@${versionManifest.version}`,
          root: versionRoot,
          manifest: versionManifest,
        });
      }
    }
  }
  return cards.sort((a, b) =>
    a.manifest.id.localeCompare(b.manifest.id) ||
    a.manifest.version.localeCompare(b.manifest.version, undefined, {
      numeric: true,
    })
  );
}

export async function getCard(cardId: string): Promise<CardPackage> {
  const cards = await listCards();
  const card = cards.find((item) => item.reference === cardId);
  if (!card) {
    throw new Error(
      `Unknown current card: ${cardId} (historical packages are rendered from artifacts, not this workspace)`
    );
  }
  return card;
}

export async function getRenderProfile(reference?: string): Promise<RenderProfileSource> {
  const resolved = resolveRenderProfileReference(reference);
  const { id, version } = parseRenderProfileReference(resolved);
  const current = parseRenderProfileReference(CURRENT_RENDER_PROFILE);
  if (id !== current.id) {
    throw new Error(`Unknown render profile: ${resolved}`);
  }
  if (version !== current.version) {
    throw new Error(
      `Historical render profile ${resolved} is not available in this workspace; use the artifact registry`
    );
  }
  const root = resolveInProject(ACTIVE_RENDER_PROFILE_ROOT, id);
  try {
    const manifest = await readJson<RenderProfileManifest>(path.join(root, "manifest.json"));
    if (manifest.id !== id || manifest.version !== version) {
      throw new Error(
        `${path.join(root, "manifest.json")}: expected ${resolved}, got ${manifest.id}@${manifest.version}`
      );
    }
    const [capabilities, hostConfig] = await Promise.all([
      readJson<RenderCapabilities>(path.join(root, manifest.capabilities)),
      readJson<Record<string, unknown>>(path.join(root, manifest.hostConfig)),
    ]);
    return { root, reference: resolved, manifest, capabilities, hostConfig };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Unknown render profile: ${resolved}`);
    }
    throw error;
  }
}

export function getCurrentRenderProfile(): Promise<RenderProfileSource> {
  return getRenderProfile(CURRENT_RENDER_PROFILE);
}
