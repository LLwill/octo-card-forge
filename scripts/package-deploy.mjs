#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(root, process.argv[2] ?? ".release");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const profileManifest = JSON.parse(
  await readFile(path.join(root, "render-profiles/octo-chat/manifest.json"), "utf8"),
);
const version = packageJson.version;
const artifactName = `octo-card-forge-deploy-${version}.tgz`;
const stagingDir = path.join(outputDir, "octo-card-forge-deploy");
const artifactPath = path.join(outputDir, artifactName);
const manifestPath = path.join(outputDir, `octo-card-forge-deploy-${version}.manifest.json`);

await mkdir(outputDir, { recursive: true });
await rm(stagingDir, { recursive: true, force: true });
await rm(artifactPath, { force: true });
await rm(manifestPath, { force: true });
await mkdir(stagingDir, { recursive: true });

const files = [
  "package.json",
  "pnpm-lock.yaml",
  "dist",
  "web",
  "cards",
  "render-profiles",
  "scripts/start-service.mjs",
];

for (const file of files) {
  await cp(path.join(root, file), path.join(stagingDir, file), { recursive: true });
}

const deploymentManifest = {
  name: "octo-card-forge",
  version,
  entrypoint: "pnpm start",
  host: "0.0.0.0",
  port: "PORT",
  renderProfile: `octo-chat@${profileManifest.version}`,
  files,
};
await writeFile(
  path.join(stagingDir, "deployment-manifest.json"),
  `${JSON.stringify(deploymentManifest, null, 2)}\n`,
);

execFileSync("tar", ["-czf", artifactPath, "-C", stagingDir, "."], {
  cwd: root,
  stdio: "inherit",
});

const checksum = createHash("sha256").update(await readFile(artifactPath)).digest("hex");
await writeFile(manifestPath, `${JSON.stringify({ ...deploymentManifest, artifact: artifactName, sha256: checksum }, null, 2)}\n`);
console.log(JSON.stringify({ artifact: artifactPath, manifest: manifestPath, sha256: checksum }, null, 2));
