import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { readJson, readText, resolveInProject } from "./fs.js";
import {
  getRenderProfile,
  parseRenderProfileReference,
  resolveRenderProfileReference,
} from "./registry.js";
import type {
  RenderCapabilities,
  RenderProfileManifest,
  RenderProfileSource,
} from "./types.js";

const require = createRequire(import.meta.url);
const DEFAULT_RENDER_PROFILE_PACKAGES: Record<string, string> = {
  "octo-chat": "@mlt-org/octo-card-profile-octo-chat",
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function referenceForManifest(manifest: RenderProfileManifest): string {
  return `${manifest.id}@${manifest.version}`;
}

function resolveProfileAssetPath(root: string, relativePath: string): string {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).some((segment) => segment === "..")
  ) {
    throw new Error(`${root}/manifest.json: Profile resource must stay inside the package`);
  }
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${root}/manifest.json: Profile resource must stay inside the package`);
  }
  return resolvedPath;
}

async function loadFromRoot(
  root: string,
  source: "workspace" | "package" | "directory" = "directory"
): Promise<RenderProfileSource> {
  const resolvedRoot = path.resolve(root);
  const sourceManifestPath = path.join(resolvedRoot, "manifest.json");
  const packageManifestPath = path.join(resolvedRoot, "dist", "manifest.json");
  const manifestPath = await exists(sourceManifestPath)
    ? sourceManifestPath
    : packageManifestPath;

  if (!(await exists(manifestPath))) {
    throw new Error(`${resolvedRoot}: manifest.json or dist/manifest.json is required`);
  }

  const manifest = await readJson<RenderProfileManifest>(manifestPath);
  const readProfileJson = <T>(file: string) =>
    readJson<T>(resolveProfileAssetPath(resolvedRoot, file));
  const readProfileText = (file: string) =>
    readText(resolveProfileAssetPath(resolvedRoot, file));

  const [capabilities, hostConfig, theme, stylesheet] = await Promise.all([
    readProfileJson<RenderCapabilities>(manifest.capabilities),
    readProfileJson<Record<string, unknown>>(manifest.hostConfig),
    manifest.theme ? readProfileText(manifest.theme) : Promise.resolve(""),
    readProfileText(manifest.stylesheet),
  ]);

  return {
    root: resolvedRoot,
    reference: referenceForManifest(manifest),
    source,
    manifest,
    capabilities,
    hostConfig,
    stylesheets: [theme, stylesheet].filter(Boolean),
  };
}

export async function loadRenderProfileFromDirectory(
  root: string
): Promise<RenderProfileSource> {
  return loadFromRoot(root, "directory");
}

export async function loadRenderProfileFromPackage(
  packageNameOrRoot: string
): Promise<RenderProfileSource> {
  if (
    path.isAbsolute(packageNameOrRoot) ||
    packageNameOrRoot.startsWith(".") ||
    (await exists(packageNameOrRoot))
  ) {
    return loadFromRoot(packageNameOrRoot, "package");
  }

  const manifestPath = require.resolve(`${packageNameOrRoot}/manifest.json`);
  const manifestDir = path.dirname(manifestPath);
  const packageRoot =
    path.basename(manifestDir) === "dist"
      ? path.dirname(manifestDir)
      : manifestDir;
  return loadFromRoot(packageRoot, "package");
}

function isModuleNotFound(error: unknown, packageName: string): boolean {
  return (
    (error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND" &&
    error instanceof Error &&
    error.message.includes(packageName)
  );
}

function assertProfileMatchesRequest(
  profile: RenderProfileSource,
  reference?: string
): void {
  if (!reference) return;
  const requested = parseRenderProfileReference(reference);
  if (requested.id !== profile.manifest.id) {
    throw new Error(
      `${reference}: loaded profile package ${profile.reference} belongs to ${profile.manifest.id}`
    );
  }
  if (requested.version !== "latest" && requested.version !== profile.manifest.version) {
    throw new Error(
      `${reference}: loaded profile package is ${profile.reference}`
    );
  }
}

export async function loadRenderProfileForReference(
  reference?: string,
  explicitSource?: RenderProfileSource
): Promise<RenderProfileSource> {
  if (explicitSource) {
    assertProfileMatchesRequest(explicitSource, reference);
    return explicitSource;
  }

  const requested = reference
    ? parseRenderProfileReference(reference)
    : parseRenderProfileReference(resolveRenderProfileReference());
  const localRoot = resolveInProject("render-profiles", requested.id);
  if (await exists(path.join(localRoot, "manifest.json"))) {
    const profile = await getRenderProfile(reference);
    assertProfileMatchesRequest(profile, reference);
    return profile;
  }

  const packageName = DEFAULT_RENDER_PROFILE_PACKAGES[requested.id];
  if (packageName) {
    try {
      const profile = await loadRenderProfileFromPackage(packageName);
      assertProfileMatchesRequest(profile, reference);
      return profile;
    } catch (error) {
      if (!isModuleNotFound(error, packageName)) throw error;
    }
  }

  return getRenderProfile(reference);
}
