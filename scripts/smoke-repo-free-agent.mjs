#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function runJson(command, args, options = {}) {
  return JSON.parse(run(command, args, options));
}

run("pnpm", ["build"], { stdio: "inherit" });

const profilePack = runJson("pnpm", [
  "--silent",
  "cli",
  "profile",
  "pack",
  "octo-chat@latest",
  "--output",
  ".release",
]);
const cliPackOutput = run("pnpm", ["pack", "--pack-destination", ".release"]);
const cliTarball = cliPackOutput
  .trim()
  .split(/\r?\n/)
  .findLast((line) => line.endsWith(".tgz"));

if (!cliTarball || !existsSync(cliTarball)) {
  throw new Error(`Unable to locate CLI tarball from pnpm pack output:\n${cliPackOutput}`);
}
if (!existsSync(profilePack.tarball)) {
  throw new Error(`Profile tarball was not created: ${profilePack.tarball}`);
}

const workspace = mkdtempSync(path.join(os.tmpdir(), "octo-card-agent-smoke-"));
const cardRoot = path.join(workspace, "bot.token-view");

run("npm", ["install", "--save-dev", cliTarball, profilePack.tarball], {
  cwd: workspace,
  stdio: "ignore",
});

const octo = (...args) => run("npm", ["exec", "--", "octo-card", ...args], { cwd: workspace });

const discover = runJson("npm", [
  "exec", "--",
  "octo-card",
  "discover",
  "skeleton",
  "--format",
  "json",
], { cwd: workspace });
const presets = runJson("npm", [
  "exec", "--",
  "octo-card",
  "presets",
  "--format",
  "json",
], { cwd: workspace });
if (!presets.presets.some((preset) => preset.id === "bot-token")) {
  throw new Error("Installed octo-card CLI did not expose the bot-token preset");
}
run("npm", [
  "exec", "--",
  "octo-card",
  "init",
  "bot.token-view",
  "--name",
  "Bot Token View",
  "--out",
  cardRoot,
  "--preset",
  "bot-token",
  "--format",
  "json",
], { cwd: workspace });
const verify = JSON.parse(octo(
  "verify",
  "--card",
  cardRoot,
  "--emit-dir",
  path.join(workspace, "compiled"),
  "--handoff",
  path.join(workspace, "handoff"),
  "--format",
  "json"
));
const card = JSON.parse(octo("emit", "--card", cardRoot, "--sample", "default"));

if (!verify.valid) throw new Error("octo-card verify failed");
if (card.type !== "AdaptiveCard") throw new Error("render did not output AdaptiveCard JSON");
if (!verify.handoff?.bytes || verify.handoff.bytes <= 0) {
  throw new Error("handoff package was empty");
}

console.log(JSON.stringify({
  workspace,
  profile: discover.profile,
  presets: presets.presets.map((preset) => preset.id),
  card: "bot.token-view",
  valid: true,
  handoffBytes: verify.handoff.bytes,
}, null, 2));
