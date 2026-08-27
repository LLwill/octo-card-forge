import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  canonicalCatalogSnapshotBytes,
  parseCatalogSnapshot,
  type CatalogSnapshotV1,
} from "@mlt-org/octo-card-catalog-snapshot";
import { verifyCardArtifact } from "@mlt-org/octo-card-artifact";
import { resolveInProject } from "../fs.js";

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
interface ForgeCatalogCompatibilityV1 {
  schemaVersion: 1;
  supports: {
    catalogSnapshot: number[];
    cardArtifact: number[];
    handoffLayout: number[];
    profileBundle: number[];
    features: string[];
  };
}

export interface CatalogBundleReleaseV1 {
  formatVersion: 1;
  catalogRevision: string;
  snapshotSha256: string;
  requires: {
    catalogSnapshot: 1;
    cardArtifact: number[];
    handoffLayout: number;
    profileBundle: number;
    features: string[];
  };
  builtWith: {
    forgeCli: string;
    forgeRevision: string;
    builderImageDigest: string;
  };
  cards: number;
  versions: number;
}

export interface CatalogBundleManifestV1 {
  formatVersion: 1;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}

export interface LoadedCatalogBundle {
  root: string;
  release: CatalogBundleReleaseV1;
  manifest: CatalogBundleManifestV1;
  snapshot: CatalogSnapshotV1;
}

export interface CatalogHandoffIndexV1 {
  formatVersion: 1;
  reference: string;
  fileName: string;
  sha256: string;
  bytes: number;
  files: Array<{ path: string; group: string; previewable: boolean }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value as number;
}

function requireRelativePath(value: unknown, field: string): string {
  const candidate = requireString(value, field);
  if (
    candidate.startsWith("/") ||
    candidate.includes("\\") ||
    candidate.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`${field} must be a safe POSIX relative path`);
  }
  return candidate;
}

function parseRelease(input: unknown): CatalogBundleReleaseV1 {
  if (!isObject(input) || input.formatVersion !== 1) {
    throw new Error("release.json must use formatVersion 1");
  }
  const catalogRevision = requireString(input.catalogRevision, "release.catalogRevision");
  if (!COMMIT_SHA.test(catalogRevision)) {
    throw new Error("release.catalogRevision must be a lowercase 40-character commit SHA");
  }
  const snapshotSha256 = requireString(input.snapshotSha256, "release.snapshotSha256");
  if (!SHA256.test(snapshotSha256)) throw new Error("release.snapshotSha256 must be a SHA-256 digest");
  if (!isObject(input.requires)) throw new Error("release.requires must be an object");
  if (input.requires.catalogSnapshot !== 1) throw new Error("Catalog snapshot format 1 is required");
  if (!Array.isArray(input.requires.cardArtifact) || input.requires.cardArtifact.some((item) => !Number.isInteger(item))) {
    throw new Error("release.requires.cardArtifact must be an integer array");
  }
  if (!Array.isArray(input.requires.features) || input.requires.features.some((item) => typeof item !== "string")) {
    throw new Error("release.requires.features must be a string array");
  }
  if (!isObject(input.builtWith)) throw new Error("release.builtWith must be an object");
  const builderImageDigest = requireString(input.builtWith.builderImageDigest, "release.builtWith.builderImageDigest");
  if (!/^sha256:[a-f0-9]{64}$/.test(builderImageDigest)) {
    throw new Error("release.builtWith.builderImageDigest must be an immutable sha256 digest");
  }
  return {
    formatVersion: 1,
    catalogRevision,
    snapshotSha256,
    requires: {
      catalogSnapshot: 1,
      cardArtifact: input.requires.cardArtifact as number[],
      handoffLayout: requirePositiveInteger(input.requires.handoffLayout, "release.requires.handoffLayout"),
      profileBundle: requirePositiveInteger(input.requires.profileBundle, "release.requires.profileBundle"),
      features: input.requires.features as string[],
    },
    builtWith: {
      forgeCli: requireString(input.builtWith.forgeCli, "release.builtWith.forgeCli"),
      forgeRevision: requireString(input.builtWith.forgeRevision, "release.builtWith.forgeRevision"),
      builderImageDigest,
    },
    cards: requirePositiveInteger(input.cards, "release.cards"),
    versions: requirePositiveInteger(input.versions, "release.versions"),
  };
}

function parseManifest(input: unknown): CatalogBundleManifestV1 {
  if (!isObject(input) || input.formatVersion !== 1 || !Array.isArray(input.files)) {
    throw new Error("bundle-manifest.json must use formatVersion 1 and contain files");
  }
  const seen = new Set<string>();
  const files = input.files.map((entry, index) => {
    if (!isObject(entry)) throw new Error(`bundle-manifest.files[${index}] must be an object`);
    const filePath = requireRelativePath(entry.path, `bundle-manifest.files[${index}].path`);
    const sha256 = requireString(entry.sha256, `bundle-manifest.files[${index}].sha256`);
    if (!SHA256.test(sha256)) throw new Error(`bundle-manifest.files[${index}].sha256 must be a SHA-256 digest`);
    if (seen.has(filePath)) throw new Error(`bundle-manifest contains duplicate path ${filePath}`);
    seen.add(filePath);
    return {
      path: filePath,
      bytes: requirePositiveInteger(entry.bytes, `bundle-manifest.files[${index}].bytes`),
      sha256,
    };
  });
  return { formatVersion: 1, files };
}

export function catalogArtifactPath(reference: string): string {
  const separator = reference.lastIndexOf("@");
  if (separator <= 0 || separator === reference.length - 1) throw new Error(`Invalid Card reference: ${reference}`);
  return `artifacts/${reference.slice(0, separator)}/${reference.slice(separator + 1)}.artifact.json`;
}

export function catalogHandoffPath(reference: string): string {
  const separator = reference.lastIndexOf("@");
  if (separator <= 0 || separator === reference.length - 1) throw new Error(`Invalid Card reference: ${reference}`);
  return `handoffs/${reference.slice(0, separator)}/${reference.slice(separator + 1)}.handoff.zip`;
}

export function catalogHandoffIndexPath(reference: string): string {
  const separator = reference.lastIndexOf("@");
  if (separator <= 0 || separator === reference.length - 1) throw new Error(`Invalid Card reference: ${reference}`);
  return `handoff-indexes/${reference.slice(0, separator)}/${reference.slice(separator + 1)}.json`;
}

export function catalogHandoffFilePath(reference: string, resourcePath: string): string {
  const separator = reference.lastIndexOf("@");
  if (separator <= 0 || separator === reference.length - 1) throw new Error(`Invalid Card reference: ${reference}`);
  return `handoff-files/${reference.slice(0, separator)}/${reference.slice(separator + 1)}/${requireRelativePath(resourcePath, "Handoff file path")}`;
}

export function catalogProfilePath(reference: string, resourcePath: string): string {
  const separator = reference.lastIndexOf("@");
  if (separator <= 0 || separator === reference.length - 1) throw new Error(`Invalid Profile reference: ${reference}`);
  const safeResource = requireRelativePath(resourcePath, "profile resource path");
  return `profiles/${reference.slice(0, separator)}/${reference.slice(separator + 1)}/${safeResource}`;
}

export async function readCatalogBundleFile(root: string, relativePath: string): Promise<Buffer> {
  const safePath = requireRelativePath(relativePath, "Catalog bundle path");
  const resolvedRoot = await realpath(path.resolve(root));
  const resolvedPath = path.resolve(resolvedRoot, safePath);
  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`Catalog bundle path escapes root: ${safePath}`);
  const info = await lstat(resolvedPath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Catalog bundle entry is not a regular file: ${safePath}`);
  const actualPath = await realpath(resolvedPath);
  if (!actualPath.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`Catalog bundle entry escapes root: ${safePath}`);
  return readFile(actualPath);
}

export async function loadCatalogHandoffIndex(root: string, reference: string): Promise<CatalogHandoffIndexV1> {
  const input = JSON.parse((await readCatalogBundleFile(root, catalogHandoffIndexPath(reference))).toString("utf8")) as unknown;
  if (!isObject(input) || input.formatVersion !== 1 || input.reference !== reference || !Array.isArray(input.files)) {
    throw new Error(`Invalid Handoff index for ${reference}`);
  }
  const indexSha256 = requireString(input.sha256, `Handoff index ${reference} sha256`);
  if (!SHA256.test(indexSha256)) throw new Error(`Invalid Handoff index digest for ${reference}`);
  const files = input.files.map((file, index) => {
    if (!isObject(file) || typeof file.previewable !== "boolean") {
      throw new Error(`Invalid Handoff index entry ${index} for ${reference}`);
    }
    return {
      path: requireRelativePath(file.path, `Handoff index ${reference} files[${index}].path`),
      group: requireString(file.group, `Handoff index ${reference} files[${index}].group`),
      previewable: file.previewable,
    };
  });
  return {
    formatVersion: 1,
    reference,
    fileName: requireString(input.fileName, `Handoff index ${reference} fileName`),
    sha256: indexSha256,
    bytes: requirePositiveInteger(input.bytes, `Handoff index ${reference} bytes`),
    files,
  };
}

export async function loadCatalogBundle(root: string): Promise<LoadedCatalogBundle> {
  const release = parseRelease(JSON.parse((await readCatalogBundleFile(root, "release.json")).toString("utf8")));
  const compatibility = JSON.parse(
    await readFile(resolveInProject("compatibility", "forge-runtime.v1.json"), "utf8"),
  ) as ForgeCatalogCompatibilityV1;
  if (compatibility.schemaVersion !== 1 || !compatibility.supports.catalogSnapshot.includes(release.requires.catalogSnapshot)) {
    throw new Error("Catalog bundle requires an unsupported Snapshot format");
  }
  if (release.requires.cardArtifact.some((version) => !compatibility.supports.cardArtifact.includes(version))) {
    throw new Error("Catalog bundle requires an unsupported Card Artifact format");
  }
  if (!compatibility.supports.handoffLayout.includes(release.requires.handoffLayout)) {
    throw new Error("Catalog bundle requires an unsupported Handoff layout");
  }
  if (!compatibility.supports.profileBundle.includes(release.requires.profileBundle)) {
    throw new Error("Catalog bundle requires an unsupported Profile bundle format");
  }
  const unsupportedFeature = release.requires.features.find((feature) => !compatibility.supports.features.includes(feature));
  if (unsupportedFeature) throw new Error(`Catalog bundle requires unsupported feature ${unsupportedFeature}`);
  const manifest = parseManifest(JSON.parse((await readCatalogBundleFile(root, "bundle-manifest.json")).toString("utf8")));
  const entries = new Map(manifest.files.map((entry) => [entry.path, entry]));
  for (const entry of manifest.files) {
    const bytes = await readCatalogBundleFile(root, entry.path);
    if (bytes.byteLength !== entry.bytes) throw new Error(`Catalog bundle size mismatch for ${entry.path}`);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== entry.sha256) throw new Error(`Catalog bundle digest mismatch for ${entry.path}`);
  }
  const snapshotBytes = await readCatalogBundleFile(root, "catalog-snapshot.v1.json");
  const snapshot = parseCatalogSnapshot(snapshotBytes);
  const snapshotDigest = createHash("sha256").update(canonicalCatalogSnapshotBytes(snapshot)).digest("hex");
  if (snapshotDigest !== release.snapshotSha256) throw new Error("Catalog snapshot digest does not match release.json");
  if (snapshot.revision !== release.catalogRevision) throw new Error("Catalog snapshot revision does not match release.json");
  const versions = snapshot.cards.flatMap((card) => card.versions);
  if (snapshot.cards.length !== release.cards || versions.length !== release.versions) {
    throw new Error("Catalog bundle counts do not match release.json");
  }
  for (const version of versions) {
    const artifactPath = catalogArtifactPath(version.reference);
    for (const requiredPath of [
      artifactPath,
      ...(version.handoff ? [catalogHandoffPath(version.reference), catalogHandoffIndexPath(version.reference)] : []),
    ]) {
      if (!entries.has(requiredPath)) throw new Error(`Catalog bundle manifest is missing ${requiredPath}`);
    }
    const artifactBytes = await readCatalogBundleFile(root, artifactPath);
    const verification = verifyCardArtifact(artifactBytes, version.artifact.sha256);
    if (!verification.valid || !verification.artifact) {
      throw new Error(`Catalog bundle contains an invalid Artifact for ${version.reference}`);
    }
    if (`${verification.artifact.card.id}@${verification.artifact.card.version}` !== version.reference) {
      throw new Error(`Catalog bundle Artifact identity mismatch for ${version.reference}`);
    }
    const profile = verification.artifact.profile;
    const profileResources = [
      "manifest.json",
      profile.manifest.hostConfig,
      profile.manifest.stylesheet,
      profile.manifest.capabilities,
      "adaptivecards.min.js",
      ...(profile.manifest.theme ? [profile.manifest.theme] : []),
      ...(profile.manifest.tokens ? [profile.manifest.tokens] : []),
      ...(profile.manifest.componentCatalog ? [profile.manifest.componentCatalog] : []),
    ];
    for (const resource of profileResources) {
      const profilePath = catalogProfilePath(profile.reference, resource);
      if (!entries.has(profilePath)) throw new Error(`Catalog bundle manifest is missing ${profilePath}`);
    }
    if (version.handoff) {
      const handoff = await readCatalogBundleFile(root, catalogHandoffPath(version.reference));
      const digest = createHash("sha256").update(handoff).digest("hex");
      if (digest !== version.handoff.sha256) throw new Error(`Catalog bundle contains an invalid Handoff for ${version.reference}`);
      const index = await loadCatalogHandoffIndex(root, version.reference);
      if (index.sha256 !== digest || index.bytes !== handoff.byteLength) {
        throw new Error(`Catalog bundle Handoff index does not match ${version.reference}`);
      }
      for (const file of index.files.filter((candidate) => candidate.previewable)) {
        const filePath = catalogHandoffFilePath(version.reference, file.path);
        if (!entries.has(filePath)) throw new Error(`Catalog bundle manifest is missing ${filePath}`);
      }
    }
  }
  return { root: path.resolve(root), release, manifest, snapshot };
}
