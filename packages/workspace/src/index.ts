import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  decodeCardSourceManifest,
  decodeResolvedCardSourceV1,
  type CardSourceManifestV2,
  type JsonObject,
  type ResolvedCardSourceV1,
} from "@mlt-org/octo-card-spec";

export interface LoadedCardSource {
  root: string;
  manifest: CardSourceManifestV2;
  source: ResolvedCardSourceV1;
}

export class WorkspaceLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceLoadError";
  }
}

function resolveAsset(root: string, relativePath: string, label: string): string {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new WorkspaceLoadError(`${root}/manifest.json: ${label} must stay inside the card package`);
  }
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new WorkspaceLoadError(`${root}/manifest.json: ${label} must stay inside the card package`);
  }
  return resolvedPath;
}

async function readJson(filePath: string): Promise<JsonObject> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as JsonObject;
  } catch (error) {
    throw new WorkspaceLoadError(`${filePath}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

async function assertFile(root: string, filePath: string, label: string): Promise<void> {
  try {
    const realRoot = await realpath(root);
    const realFile = await realpath(filePath);
    const relative = path.relative(realRoot, realFile);
    if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new WorkspaceLoadError(`${label} must resolve inside the card package: ${filePath}`);
    }
    const information = await stat(filePath);
    if (!information.isFile()) throw new WorkspaceLoadError(`${label} must point to a file: ${filePath}`);
  } catch (error) {
    if (error instanceof WorkspaceLoadError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new WorkspaceLoadError(`${label} does not exist: ${filePath}`);
    throw error;
  }
}

function formatIssues(prefix: string, issues: Array<{ path: string; message: string }>): string {
  return `${prefix}: ${issues.map((item) => `${item.path || "$"}: ${item.message}`).join("; ")}`;
}

/** Load a card directory into the path-free Source contract consumed by Core. */
export async function loadResolvedCardSource(cardRoot: string): Promise<LoadedCardSource> {
  const root = path.resolve(cardRoot);
  const manifestPath = path.join(root, "manifest.json");
  await assertFile(root, manifestPath, "manifest");
  const rawManifest = await readJson(manifestPath);
  const manifestResult = decodeCardSourceManifest(rawManifest);
  if (!manifestResult.ok) throw new WorkspaceLoadError(formatIssues(manifestPath, manifestResult.issues));
  const manifest = manifestResult.value;

  const dataSchemaPath = resolveAsset(root, manifest.dataSchema, "dataSchema");
  await assertFile(root, dataSchemaPath, "dataSchema");
  const views: ResolvedCardSourceV1["views"] = {};
  for (const [viewName, view] of Object.entries(manifest.views)) {
    const templatePath = resolveAsset(root, view.template, `views.${viewName}.template`);
    await assertFile(root, templatePath, `views.${viewName}.template`);
    const samples: Array<{ name: string; data: JsonObject }> = [];
    for (const samplePath of view.samples) {
      const resolvedSamplePath = resolveAsset(root, samplePath, `views.${viewName}.samples`);
      await assertFile(root, resolvedSamplePath, `views.${viewName}.samples`);
      samples.push({ name: path.basename(samplePath, path.extname(samplePath)), data: await readJson(resolvedSamplePath) });
    }
    views[viewName] = {
      wireProfile: view.wireProfile,
      ...(view.states ? { states: view.states } : {}),
      ...(view.submit_actions ? { submit_actions: view.submit_actions } : {}),
      template: await readJson(templatePath),
      samples,
    };
  }

  const idParts = manifest.id.split(".");
  const sourceResult = decodeResolvedCardSourceV1({
    formatVersion: 1,
    card: {
      id: manifest.id,
      namespace: idParts[0],
      key: idParts.slice(1).join("."),
      name: manifest.name,
      version: manifest.version,
      contractVersion: manifest.contractVersion,
      adaptiveCardVersion: manifest.adaptiveCardVersion,
      defaultLocale: manifest.defaultLocale,
    },
    dataContract: await readJson(dataSchemaPath),
    views,
  });
  if (!sourceResult.ok) throw new WorkspaceLoadError(formatIssues(manifestPath, sourceResult.issues));
  return { root, manifest, source: sourceResult.value };
}

export { resolveAsset as resolveWorkspaceAssetPath };
