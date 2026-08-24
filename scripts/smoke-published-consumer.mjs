#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const cliVersion = process.env.CONSUMER_CLI_VERSION ?? "0.2.0";
const profileVersion = process.env.CONSUMER_PROFILE_VERSION ?? "1.2.0-rc.2";
const skillVersion = process.env.CONSUMER_SKILL_VERSION ?? "0.2.0";
const profilePackage = "@mlt-org/octo-card-profile-octo-chat";
const cliPackage = "@mlt-org/octo-card-cli";
const profileSpec = process.env.CONSUMER_PROFILE_SPEC ?? `${profilePackage}@${profileVersion}`;
const repository = "https://github.com/LLwill/octo-card-forge";
const workspace = mkdtempSync(path.join(os.tmpdir(), "octo-card-published-consumer-"));

function run(args, options = {}) {
  try {
    return execFileSync("npm", args, {
      cwd: workspace,
      encoding: "utf8",
      stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (options.capture !== false && error && typeof error === "object") {
      if ("stdout" in error && error.stdout) process.stdout.write(String(error.stdout));
      if ("stderr" in error && error.stderr) process.stderr.write(String(error.stderr));
    }
    throw error;
  }
}

function jsonCommand(args) {
  return JSON.parse(run(["exec", "--", "octo-card", ...args, "--format", "json"]));
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

run(["init", "--yes"], { capture: false });
run(["install", "--save-dev", `${cliPackage}@${cliVersion}`, profileSpec], { capture: false });

const init = jsonCommand([
  "agent",
  "init",
  "--target",
  "generic",
  "--profile",
  `octo-chat@${profileVersion}`,
]);
const doctor = jsonCommand(["agent", "doctor"]);
const upgrade = jsonCommand(["agent", "upgrade", "--check"]);
if (
  init.state?.cli?.version !== cliVersion ||
  init.state?.skill?.version !== skillVersion ||
  init.state?.renderProfile?.reference !== `octo-chat@${profileVersion}` ||
  !doctor.valid ||
  !upgrade.valid ||
  upgrade.needsUpgrade
) {
  throw new Error(`Agent lifecycle smoke failed: ${JSON.stringify({ init, doctor, upgrade })}`);
}

run([
  "exec",
  "--",
  "octo-card",
  "init",
  "consumer.bot-token",
  "--name",
  "Consumer Bot Token",
  "--out",
  "./consumer.bot-token",
  "--preset",
  "bot-token",
  "--render-profile",
  `octo-chat@${profileVersion}`,
], { capture: false });
const packageReport = jsonCommand(["verify", "--card", "./consumer.bot-token", "--emit-dir", "compiled", "--handoff", "handoff"]);
if (!packageReport.valid || !packageReport.handoff?.filePath) {
  throw new Error(`Card Package smoke failed: ${JSON.stringify(packageReport)}`);
}

writeFileSync(
  path.join(workspace, "quick-card.json"),
  `${JSON.stringify({
    type: "AdaptiveCard",
    version: "1.5",
    body: [{ type: "TextBlock", text: "One-time message", wrap: true }],
    actions: [],
  }, null, 2)}\n`,
);
const quickCard = jsonCommand(["validate", "--input", "./quick-card.json", "--wire-profile", "octo/v1"]);
if (!quickCard.valid) throw new Error(`Quick Card smoke failed: ${JSON.stringify(quickCard)}`);

const releaseBase = `${repository}/releases/download/octo-design-cards-skill/v${skillVersion}`;
const bundle = await download(`${releaseBase}/octo-design-cards-skill-${skillVersion}.tgz`);
const bundleManifest = JSON.parse(
  (await download(`${releaseBase}/octo-design-cards-skill-${skillVersion}.manifest.json`)).toString("utf8"),
);
const checksum = createHash("sha256").update(bundle).digest("hex");
if (bundleManifest.version !== skillVersion || bundleManifest.sha256 !== checksum) {
  throw new Error(`Skill Bundle checksum smoke failed: ${JSON.stringify({ bundleManifest, checksum })}`);
}

console.log(JSON.stringify({
  workspace,
  cli: `${cliPackage}@${cliVersion}`,
  profile: `${profilePackage}@${profileVersion}`,
  skill: `octo-design-cards@${skillVersion}`,
  doctor: doctor.valid,
  upgradeNeedsUpgrade: upgrade.needsUpgrade,
  cardPackage: packageReport.valid,
  quickCard: quickCard.valid,
  skillChecksum: checksum,
}, null, 2));
