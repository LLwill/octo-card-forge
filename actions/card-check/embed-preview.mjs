#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const [indexPath, snapshotPath, artifactPath] = process.argv.slice(2);
if (!indexPath || !snapshotPath || !artifactPath) {
  throw new Error("index, snapshot and artifact paths are required");
}

const [index, snapshot, artifact] = await Promise.all([
  readFile(indexPath, "utf8"),
  readFile(snapshotPath, "utf8").then(JSON.parse),
  readFile(artifactPath, "utf8").then(JSON.parse),
]);
const reference = `${artifact.card.id}@${artifact.card.version}`;
const bootstrap = JSON.stringify({
  snapshot,
  artifacts: { [reference]: artifact },
})
  .replaceAll("<", "\\u003c")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");
const marker = "<!-- OCTO_FORGE_BOOTSTRAP -->";
if (!index.includes(marker)) throw new Error(`Forge Web index is missing ${marker}`);

await writeFile(
  indexPath,
  index.replace(marker, `<script>window.__OCTO_FORGE_BOOTSTRAP__=${bootstrap};</script>`),
);
