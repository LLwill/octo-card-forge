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

run("pnpm", ["add", "-D", cliTarball, profilePack.tarball], {
  cwd: workspace,
  stdio: "ignore",
});

const octo = (...args) => run("pnpm", ["exec", "octo-card", ...args], { cwd: workspace });

const discover = runJson("pnpm", [
  "exec",
  "octo-card",
  "discover",
  "skeleton",
  "--format",
  "json",
], { cwd: workspace });
const presets = runJson("pnpm", [
  "exec",
  "octo-card",
  "presets",
  "--format",
  "json",
], { cwd: workspace });
if (!presets.presets.some((preset) => preset.id === "bot-token")) {
  throw new Error("Installed octo-card CLI did not expose the bot-token preset");
}
run("pnpm", [
  "exec",
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
const check = JSON.parse(octo("check", "--card", cardRoot, "--format", "json"));
const lint = JSON.parse(octo("lint", "--card", cardRoot, "--format", "json"));
const card = JSON.parse(octo("emit", "--card", cardRoot, "--sample", "default"));
const handoff = JSON.parse(octo(
  "handoff",
  "--card",
  cardRoot,
  "--output",
  path.join(workspace, "handoff"),
  "--format",
  "json"
));

if (!check.valid) throw new Error("octo-card check failed");
if (!lint.valid) throw new Error("octo-card lint failed");
if (card.type !== "AdaptiveCard") throw new Error("render did not output AdaptiveCard JSON");
if (!handoff.bytes || handoff.bytes <= 0) throw new Error("handoff package was empty");

console.log(JSON.stringify({
  workspace,
  profile: discover.profile,
  presets: presets.presets.map((preset) => preset.id),
  card: "bot.token-view",
  valid: true,
  handoffBytes: handoff.bytes,
}, null, 2));
