#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { create } from "tar";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(root, process.argv[2] ?? ".release");
const manifest = JSON.parse(
  await readFile(path.join(root, "skills/octo-design-cards/skill-manifest.json"), "utf8")
);
const version = manifest.skill.version;
const artifactName = `octo-design-cards-skill-${version}.tgz`;
const artifactPath = path.join(outputDir, artifactName);
const manifestPath = path.join(outputDir, `octo-design-cards-skill-${version}.manifest.json`);
const skillRoot = path.join(root, "skills/octo-design-cards");

await mkdir(outputDir, { recursive: true });
await rm(artifactPath, { force: true });
await rm(manifestPath, { force: true });

const files = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/card-package-workflow.md",
  "references/component-system.md",
  "skill-manifest.json",
];
await create(
  {
    cwd: skillRoot,
    file: artifactPath,
    gzip: { level: 9 },
    mtime: new Date(0),
    portable: true,
  },
  files.map((file) => `./${file}`)
);

const sha256 = createHash("sha256").update(await readFile(artifactPath)).digest("hex");
await writeFile(
  manifestPath,
  `${JSON.stringify({
    name: "octo-design-cards-skill",
    version,
    artifact: artifactName,
    sha256,
    files,
  }, null, 2)}\n`
);
console.log(JSON.stringify({ artifact: artifactPath, manifest: manifestPath, sha256 }, null, 2));
