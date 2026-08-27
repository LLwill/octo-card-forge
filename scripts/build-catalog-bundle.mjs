#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  canonicalCardArtifactBytes,
  canonicalCatalogSnapshotBytes,
  parseCardArtifact,
  parseCatalogSnapshot,
} from "@mlt-org/octo-card-catalog-snapshot";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
const args = process.argv.slice(2);

function flag(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function required(name, fallback) {
  const value = flag(name, fallback);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeSegment(value, label) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error(`${label} contains unsafe characters: ${value}`);
  return value;
}

const allowedOrigins = new Set(
  (process.env.CATALOG_ALLOWED_ORIGINS ?? "https://github.com,https://objects.githubusercontent.com,https://release-assets.githubusercontent.com")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function assertAllowedUrl(location) {
  const url = new URL(location);
  if (!allowedOrigins.has(url.origin)) throw new Error(`Resource origin is not allowed: ${url.origin}`);
  return url;
}

async function readLocation(location, maximumBytes) {
  if (/^https:\/\//.test(location)) {
    assertAllowedUrl(location);
    const response = await fetch(location, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${location}`);
    assertAllowedUrl(response.url);
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > maximumBytes) throw new Error(`Resource exceeds size limit: ${location}`);
    if (!response.body) return Buffer.alloc(0);
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > maximumBytes) throw new Error(`Resource exceeds size limit: ${location}`);
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  }
  if (/^[a-z]+:/i.test(location)) throw new Error(`Unsupported resource URL: ${location}`);
  const bytes = await readFile(path.resolve(location));
  if (bytes.byteLength > maximumBytes) throw new Error(`Resource exceeds size limit: ${location}`);
  return bytes;
}

async function verifyHandoffArchive(reference, bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  if (files.length > 200) throw new Error(`Handoff contains too many files for ${reference}`);
  let total = 0;
  const inspected = [];
  for (const entry of files) {
    if (!entry.name.startsWith(`${reference}/`)) throw new Error(`Handoff contains an unexpected root for ${reference}`);
    const relativePath = entry.name.slice(reference.length + 1);
    if (!relativePath || relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.split("/").some((part) => part === "." || part === "..")) {
      throw new Error(`Handoff contains an unsafe path for ${reference}: ${entry.name}`);
    }
    const content = await entry.async("uint8array");
    if (content.byteLength > 1024 * 1024) throw new Error(`Handoff file exceeds 1 MiB for ${reference}: ${relativePath}`);
    total += content.byteLength;
    if (total > 40 * 1024 * 1024) throw new Error(`Handoff expands beyond 40 MiB for ${reference}`);
    inspected.push({
      path: relativePath,
      group: relativePath.includes("/") ? relativePath.split("/", 1)[0] : "root",
      previewable: /\.(?:css|json|md|txt)$/i.test(relativePath),
      content,
    });
  }
  return inspected.sort((left, right) => left.path.localeCompare(right.path));
}

async function writeBundleFile(outputRoot, relativePath, bytes, entries) {
  const target = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  entries.push({ path: relativePath, bytes: bytes.byteLength, sha256: digest(bytes) });
}

async function unpackNpmPackage(spec, cache) {
  const existing = cache.get(spec);
  if (existing) return existing;
  const work = await mkdtemp(path.join(os.tmpdir(), "octo-catalog-package-"));
  const result = JSON.parse(execFileSync("npm", [
    "pack",
    spec,
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    work,
  ], { cwd: repositoryRoot, encoding: "utf8" }));
  const fileName = result[0]?.filename;
  if (!fileName) throw new Error(`npm pack did not return a file for ${spec}`);
  execFileSync("tar", ["-xzf", path.join(work, fileName), "-C", work]);
  const packageRoot = path.join(work, "package");
  cache.set(spec, packageRoot);
  return packageRoot;
}

async function readPackageFile(packageRoot, relativePath) {
  if (!relativePath || relativePath.includes("\\") || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe package resource path: ${relativePath}`);
  }
  const root = await realpath(packageRoot);
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Package resource escapes root: ${relativePath}`);
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Package resource is not a regular file: ${relativePath}`);
  const actual = await realpath(target);
  if (!actual.startsWith(`${root}${path.sep}`)) throw new Error(`Package resource escapes root: ${relativePath}`);
  return readFile(actual);
}

const snapshotLocation = required("--snapshot", process.env.CATALOG_SNAPSHOT);
const outputRoot = path.resolve(required("--output", process.env.CATALOG_BUNDLE_OUTPUT ?? ".release/catalog"));
const catalogRevision = required("--catalog-revision", process.env.CATALOG_REVISION);
const forgeRevision = required("--forge-revision", process.env.FORGE_REVISION);
const builderImageDigest = required("--builder-image-digest", process.env.BUILDER_IMAGE_DIGEST);
if (!/^[a-f0-9]{40}$/.test(catalogRevision)) throw new Error("Catalog revision must be a lowercase 40-character SHA");
if (!/^[a-f0-9]{40}$/.test(forgeRevision)) throw new Error("Forge revision must be a lowercase 40-character SHA");
if (!/^sha256:[a-f0-9]{64}$/.test(builderImageDigest)) throw new Error("Builder image must be pinned by sha256 digest");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const snapshot = parseCatalogSnapshot(await readLocation(snapshotLocation, 2 * 1024 * 1024));
if (snapshot.revision !== catalogRevision) {
  throw new Error(`Snapshot revision ${snapshot.revision} does not match ${catalogRevision}`);
}
if (snapshot.cards.length === 0 || snapshot.cards.every((card) => card.versions.length === 0)) {
  throw new Error("Catalog Snapshot must contain at least one published Card version");
}
const entries = [];
await writeBundleFile(outputRoot, "catalog-snapshot.v1.json", canonicalCatalogSnapshotBytes(snapshot), entries);

const profiles = new Map();
for (const version of snapshot.cards.flatMap((card) => card.versions)) {
  const artifactBytes = await readLocation(version.artifact.url, 5 * 1024 * 1024);
  const artifact = parseCardArtifact(artifactBytes);
  const canonicalArtifact = Buffer.from(canonicalCardArtifactBytes(artifact));
  if (digest(canonicalArtifact) !== version.artifact.sha256) throw new Error(`Artifact digest mismatch for ${version.reference}`);
  if (`${artifact.card.id}@${artifact.card.version}` !== version.reference) throw new Error(`Artifact identity mismatch for ${version.reference}`);
  await writeBundleFile(
    outputRoot,
    `artifacts/${safeSegment(artifact.card.id, "Card ID")}/${safeSegment(artifact.card.version, "Card version")}.artifact.json`,
    canonicalArtifact,
    entries,
  );
  profiles.set(artifact.profile.reference, artifact.profile);
  if (version.handoff) {
    const handoff = await readLocation(version.handoff.url, 10 * 1024 * 1024);
    if (digest(handoff) !== version.handoff.sha256) throw new Error(`Handoff digest mismatch for ${version.reference}`);
    const handoffFiles = await verifyHandoffArchive(version.reference, handoff);
    await writeBundleFile(
      outputRoot,
      `handoffs/${safeSegment(artifact.card.id, "Card ID")}/${safeSegment(artifact.card.version, "Card version")}.handoff.zip`,
      handoff,
      entries,
    );
    await writeBundleFile(
      outputRoot,
      `handoff-indexes/${safeSegment(artifact.card.id, "Card ID")}/${safeSegment(artifact.card.version, "Card version")}.json`,
      Buffer.from(`${JSON.stringify({
        formatVersion: 1,
        reference: version.reference,
        fileName: `${version.reference}.handoff.zip`,
        sha256: version.handoff.sha256,
        bytes: handoff.byteLength,
        files: handoffFiles.map(({ content: _content, ...file }) => file),
      }, null, 2)}\n`),
      entries,
    );
    for (const file of handoffFiles.filter((candidate) => candidate.previewable)) {
      await writeBundleFile(
        outputRoot,
        `handoff-files/${safeSegment(artifact.card.id, "Card ID")}/${safeSegment(artifact.card.version, "Card version")}/${file.path}`,
        file.content,
        entries,
      );
    }
  }
}

const packageCache = new Map();
for (const [reference, profile] of [...profiles.entries()].sort(([left], [right]) => left.localeCompare(right))) {
  const packageName = profile.manifest.packageName;
  if (!packageName) throw new Error(`Profile ${reference} does not declare packageName`);
  const packageRoot = await unpackNpmPackage(`${packageName}@${profile.manifest.version}`, packageCache);
  const distRoot = path.join(packageRoot, "dist");
  const publishedManifest = JSON.parse((await readPackageFile(distRoot, "manifest.json")).toString("utf8"));
  if (`${publishedManifest.id}@${publishedManifest.version}` !== reference) {
    throw new Error(`Published Profile package identity does not match ${reference}`);
  }
  const profileOutput = `profiles/${safeSegment(profile.manifest.id, "Profile ID")}/${safeSegment(profile.manifest.version, "Profile version")}`;
  const resources = [
    "manifest.json",
    profile.manifest.hostConfig,
    profile.manifest.stylesheet,
    profile.manifest.capabilities,
    ...(profile.manifest.theme ? [profile.manifest.theme] : []),
    ...(profile.manifest.tokens ? [profile.manifest.tokens] : []),
    ...(profile.manifest.componentCatalog ? [profile.manifest.componentCatalog] : []),
  ];
  for (const resource of [...new Set(resources)].sort()) {
    const bytes = await readPackageFile(distRoot, resource);
    await writeBundleFile(outputRoot, `${profileOutput}/${resource}`, bytes, entries);
  }
  const adaptiveCardsRoot = await unpackNpmPackage(`adaptivecards@${profile.manifest.adaptiveCardsSdkVersion}`, packageCache);
  await writeBundleFile(
    outputRoot,
    `${profileOutput}/adaptivecards.min.js`,
    await readPackageFile(adaptiveCardsRoot, "dist/adaptivecards.min.js"),
    entries,
  );
}

entries.sort((left, right) => left.path.localeCompare(right.path));
const totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
if (totalBytes > 200 * 1024 * 1024) throw new Error("Catalog bundle exceeds the 200 MiB size limit");
await writeFile(path.join(outputRoot, "bundle-manifest.json"), `${JSON.stringify({ formatVersion: 1, files: entries }, null, 2)}\n`);
await writeFile(path.join(outputRoot, "release.json"), `${JSON.stringify({
  formatVersion: 1,
  catalogRevision,
  snapshotSha256: digest(canonicalCatalogSnapshotBytes(snapshot)),
  requires: {
    catalogSnapshot: 1,
    cardArtifact: [1],
    handoffLayout: 1,
    profileBundle: 1,
    features: ["handoff-index-v1", "local-profile-assets-v1"],
  },
  builtWith: {
    forgeCli: packageJson.version,
    forgeRevision,
    builderImageDigest,
  },
  cards: snapshot.cards.length,
  versions: snapshot.cards.reduce((total, card) => total + card.versions.length, 0),
}, null, 2)}\n`);

console.log(JSON.stringify({ output: outputRoot, catalogRevision, files: entries.length }, null, 2));
