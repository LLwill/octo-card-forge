#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(root, process.argv[2] ?? ".release");
const manifest = JSON.parse(
  await readFile(path.join(root, "skills/octo-design-cards/skill-manifest.json"), "utf8")
);
const version = manifest.skill.version;
const artifactName = `octo-design-cards-skill-${version}.tgz`;
const stagingDir = path.join(outputDir, "octo-design-cards-skill");
const artifactPath = path.join(outputDir, artifactName);
const manifestPath = path.join(outputDir, `octo-design-cards-skill-${version}.manifest.json`);

await mkdir(outputDir, { recursive: true });
await rm(stagingDir, { recursive: true, force: true });
await rm(artifactPath, { force: true });
await rm(manifestPath, { force: true });
await mkdir(path.join(stagingDir, "agents"), { recursive: true });
await mkdir(path.join(stagingDir, "references"), { recursive: true });

const files = [
  "SKILL.md",
  "agents/openai.yaml",
  "references/card-package-workflow.md",
  "references/component-system.md",
  "skill-manifest.json",
];
for (const file of files) {
  await cp(path.join(root, "skills/octo-design-cards", file), path.join(stagingDir, file));
}

execFileSync("tar", ["-czf", artifactPath, "-C", stagingDir, "."], {
  cwd: root,
  stdio: "inherit",
});

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
await rm(stagingDir, { recursive: true, force: true });
console.log(JSON.stringify({ artifact: artifactPath, manifest: manifestPath, sha256 }, null, 2));
