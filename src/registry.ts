import { readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { projectRoot, readJson, resolveInProject } from "./fs.js";
import type {
  CardManifest,
  CardPackage,
  RenderCapabilities,
  RenderProfileManifest,
  RenderProfileSource,
} from "./types.js";

const ACTIVE_RENDER_PROFILE_ROOT = "render-profiles";

/**
 * 基线在发布产物中不携带 `render-profiles/` 源码时的内嵌回退值。
 * 由 `render-profiles/octo-chat/manifest.json` 派生，并有守卫测试保证两者一致，
 * 因此升级基线仍只需修改该 manifest 一处。
 */
export const BASELINE_RENDER_PROFILE_FALLBACK = "octo-chat@1.2.0-rc.4";

/**
 * 仓库当前唯一的组件基线。优先从活跃 Profile 的 manifest 派生，避免版本号双写；
 * 当运行在不携带 `render-profiles/` 源码的发布环境时，回退到内嵌基线值。
 * 历史 Profile 由制品库负责复现。
 */
function resolveActiveProfileReference(): string {
  const manifestPath = path.join(
    projectRoot(),
    ACTIVE_RENDER_PROFILE_ROOT,
    "octo-chat",
    "manifest.json"
  );
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      id?: unknown;
      version?: unknown;
    };
    if (typeof manifest.id === "string" && typeof manifest.version === "string") {
      return `${manifest.id}@${manifest.version}`;
    }
  } catch {
    // 发布产物不含 Profile 源码，使用内嵌基线值。
  }
  return BASELINE_RENDER_PROFILE_FALLBACK;
}

export const CURRENT_RENDER_PROFILE = resolveActiveProfileReference();

const RENDER_PROFILE_REFERENCE =
  /^([a-z][a-z0-9.-]*)@(latest|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const CARD_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

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
  if (!value.id || !value.name || !value.version || !value.contractVersion || !value.dataSchema) {
    throw new Error(
      `${filePath}: id, name, version, contractVersion and dataSchema are required`
    );
  }
  if (!CARD_VERSION.test(value.version) || !CARD_VERSION.test(value.contractVersion)) {
    throw new Error(`${filePath}: version and contractVersion must use x.y.z format`);
  }
  if (!/^\d+\.\d+$/.test(value.adaptiveCardVersion)) {
    throw new Error(`${filePath}: adaptiveCardVersion must use x.y format`);
  }
  if (value.renderProfile !== undefined && value.renderProfile !== "") {
    parseRenderProfileReference(value.renderProfile);
  }
  if (!value.views || Object.keys(value.views).length === 0) {
    throw new Error(`${filePath}: at least one view is required`);
  }
  const sampleOwners = new Map<string, string>();
  for (const [viewName, view] of Object.entries(value.views)) {
    if (view.wireProfile !== "octo/v1" && view.wireProfile !== "octo/v2") {
      throw new Error(`${filePath}: view ${viewName} has an invalid wireProfile`);
    }
    if (view.states !== undefined &&
      (!Array.isArray(view.states) || view.states.length === 0 ||
        view.states.some((state) => typeof state !== "string" || state.length === 0))) {
      throw new Error(`${filePath}: view ${viewName} states must be a non-empty string array`);
    }
    if (view.submit_actions !== undefined &&
      (!Array.isArray(view.submit_actions) ||
        view.submit_actions.some((action) => typeof action !== "string" || action.length === 0))) {
      throw new Error(`${filePath}: view ${viewName} submit_actions must be a string array`);
    }
    for (const sample of view.samples) {
      const sampleName = path.basename(sample, path.extname(sample));
      const owner = sampleOwners.get(sampleName);
      if (owner) {
        throw new Error(
          `${filePath}: sample name ${sampleName} must be unique across views (${owner}, ${viewName})`
        );
      }
      sampleOwners.set(sampleName, viewName);
    }
  }
}

function packageKind(root: string): "draft" | "release" {
  return path.basename(path.dirname(root)) === "versions" ? "release" : "draft";
}

/** Resolve a manifest-owned file without allowing paths to escape the package. */
export function resolveCardAssetPath(
  root: string,
  relativePath: string,
  label: string
): string {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).some((segment) => segment === "..")
  ) {
    throw new Error(`${root}/manifest.json: ${label} must stay inside the card package`);
  }
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${root}/manifest.json: ${label} must stay inside the card package`);
  }
  return resolvedPath;
}

async function assertCardPackageAssets(root: string, manifest: CardManifest): Promise<void> {
  const assets = new Map<string, string>();
  const add = (relativePath: string, label: string) => {
    const resolved = resolveCardAssetPath(root, relativePath, label);
    assets.set(resolved, label);
    return resolved;
  };

  add(manifest.dataSchema, "dataSchema");
  for (const [viewName, view] of Object.entries(manifest.views)) {
    add(view.template, `views.${viewName}.template`);
    for (const [index, sample] of view.samples.entries()) {
      add(sample, `views.${viewName}.samples[${index}]`);
    }
  }

  for (const [filePath, label] of assets) {
    let information;
    try {
      information = await stat(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`${root}/manifest.json: ${label} does not exist: ${filePath}`);
      }
      throw error;
    }
    if (!information.isFile()) {
      throw new Error(`${root}/manifest.json: ${label} must point to a file: ${filePath}`);
    }
  }
}

export async function loadCardPackage(root: string): Promise<CardPackage> {
  const resolvedRoot = path.resolve(root);
  const manifestPath = path.join(resolvedRoot, "manifest.json");
  const manifest = await readJson<CardManifest>(manifestPath);
  assertCardManifest(manifest, manifestPath);
  const kind = packageKind(resolvedRoot);
  if (kind === "release") {
    if (path.basename(resolvedRoot) !== manifest.version) {
      throw new Error(`${manifestPath}: release directory must match version ${manifest.version}`);
    }
    if (!manifest.renderProfile || manifest.renderProfile.endsWith("@latest")) {
      throw new Error(`${manifestPath}: a release must pin a concrete renderProfile version`);
    }
  }
  await assertCardPackageAssets(resolvedRoot, manifest);
  return {
    reference: kind === "release" ? `${manifest.id}@${manifest.version}` : manifest.id,
    root: resolvedRoot,
    kind,
    mutable: kind === "draft",
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
    const draft = await loadCardPackage(root);
    const manifest = draft.manifest;
    // The root package is the current editable source and must remain
    // discoverable. Drafts normally follow @latest; check/compile surfaces an
    // explicit profile error instead of silently removing a stale draft.
    cards.push(draft);

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
      const version = await loadCardPackage(versionRoot);
      const versionManifest = version.manifest;
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
        cards.push(version);
      }
    }
  }
  return cards.sort((a, b) =>
    a.manifest.id.localeCompare(b.manifest.id) ||
    (a.kind === b.kind ? 0 : a.kind === "draft" ? -1 : 1) ||
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
      `Unknown card reference: ${cardId} (historical packages are rendered from artifacts, not this workspace)`
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
    return { root, reference: resolved, source: "workspace", manifest, capabilities, hostConfig };
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
