#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

const [
  artifactPath,
  artifactUrl,
  artifactSha256,
  repository,
  commit,
  sourcePath,
  pullRequestUrl = "",
] = process.argv.slice(2);

if (!artifactPath || !artifactUrl || !artifactSha256 || !repository || !commit || !sourcePath) {
  throw new Error("artifact, digest and source metadata are required");
}
if (path.isAbsolute(sourcePath) || sourcePath.split("/").some((part) => !part || part === "." || part === "..")) {
  throw new Error(`source path must be a safe repository-relative path: ${sourcePath}`);
}

const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
const record = {
  card: {
    id: artifact.card.id,
    name: artifact.card.name,
    version: artifact.card.version,
    contractVersion: artifact.card.contractVersion,
    renderProfile: artifact.profile.reference,
    defaultLocale: artifact.card.defaultLocale,
  },
  artifact: {
    url: artifactUrl,
    sha256: artifactSha256,
    mediaType: artifact.mediaType,
  },
  source: {
    repository,
    commit,
    path: sourcePath,
    ...(pullRequestUrl ? { pullRequestUrl } : {}),
  },
};

process.stdout.write(`${JSON.stringify([record], null, 2)}\n`);
