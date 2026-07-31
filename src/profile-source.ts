import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { readJson, readText } from "./fs.js";
import type {
  RenderCapabilities,
  RenderProfileManifest,
  RenderProfileSource,
} from "./types.js";

const require = createRequire(import.meta.url);

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

async function loadFromRoot(root: string): Promise<RenderProfileSource> {
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
    readJson<T>(path.join(resolvedRoot, file));
  const readProfileText = (file: string) =>
    readText(path.join(resolvedRoot, file));

  const [capabilities, hostConfig, theme, stylesheet] = await Promise.all([
    readProfileJson<RenderCapabilities>(manifest.capabilities),
    readProfileJson<Record<string, unknown>>(manifest.hostConfig),
    manifest.theme ? readProfileText(manifest.theme) : Promise.resolve(""),
    readProfileText(manifest.stylesheet),
  ]);

  return {
    root: resolvedRoot,
    reference: referenceForManifest(manifest),
    manifest,
    capabilities,
    hostConfig,
    stylesheets: [theme, stylesheet].filter(Boolean),
  };
}

export async function loadRenderProfileFromDirectory(
  root: string
): Promise<RenderProfileSource> {
  return loadFromRoot(root);
}

export async function loadRenderProfileFromPackage(
  packageNameOrRoot: string
): Promise<RenderProfileSource> {
  if (
    path.isAbsolute(packageNameOrRoot) ||
    packageNameOrRoot.startsWith(".") ||
    (await exists(packageNameOrRoot))
  ) {
    return loadFromRoot(packageNameOrRoot);
  }

  const manifestPath = require.resolve(`${packageNameOrRoot}/manifest.json`);
  const manifestDir = path.dirname(manifestPath);
  const packageRoot =
    path.basename(manifestDir) === "dist"
      ? path.dirname(manifestDir)
      : manifestDir;
  return loadFromRoot(packageRoot);
}
