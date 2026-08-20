#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function dependencyEntries(manifest, fields) {
  return fields.flatMap((field) =>
    Object.entries(manifest[field] ?? {}).map(([name, spec]) => ({
      field,
      name,
      spec: String(spec),
    }))
  );
}

async function discoverWorkspacePackagePaths(root) {
  const workspace = await readFile(path.join(root, "pnpm-workspace.yaml"), "utf8");
  const patterns = workspace
    .split(/\r?\n/)
    .map((line) => /^\s*-\s*["']?([^"']+?)["']?\s*$/.exec(line)?.[1])
    .filter(Boolean);
  const packagePaths = new Set();

  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) {
      throw new Error(`Unsupported pnpm workspace pattern: ${pattern}`);
    }
    const parent = pattern.slice(0, -2);
    const entries = await readdir(path.join(root, parent), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const relativePath = path.posix.join(parent, entry.name);
      try {
        await readFile(path.join(root, relativePath, "package.json"), "utf8");
        packagePaths.add(relativePath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  return packagePaths;
}

function findCycles(graph) {
  const cycles = [];
  const visited = new Set();
  const active = new Set();
  const stack = [];

  function visit(id) {
    if (active.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    active.add(id);
    stack.push(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    stack.pop();
    active.delete(id);
  }

  for (const id of graph.keys()) visit(id);
  return cycles;
}

const root = path.resolve(option("--root") ?? defaultRoot);
const configPath = path.resolve(root, option("--config") ?? "workspace-packages.json");
const format = option("--format") ?? "text";
const config = await readJson(configPath);
const errors = [];

if (config.schemaVersion !== 1 || !Array.isArray(config.packages)) {
  errors.push("workspace-packages.json must use schemaVersion 1 and a packages array");
}

const configured = config.packages ?? [];
const definitions = new Map();
const ids = new Set();
const paths = new Set();
const names = new Map();

for (const definition of configured) {
  if (ids.has(definition.id)) errors.push(`duplicate workspace package id: ${definition.id}`);
  if (paths.has(definition.path)) {
    errors.push(`duplicate workspace package path: ${definition.path}`);
  }
  if (names.has(definition.name)) {
    errors.push(`duplicate workspace package name: ${definition.name}`);
  }
  ids.add(definition.id);
  paths.add(definition.path);
  names.set(definition.name, definition.id);
  if (!definitions.has(definition.id)) definitions.set(definition.id, definition);
}

try {
  const actualPaths = await discoverWorkspacePackagePaths(root);
  const configuredPaths = new Set(configured
    .map((definition) => definition.path)
    .filter((packagePath) => packagePath !== "."));
  for (const packagePath of actualPaths) {
    if (!configuredPaths.has(packagePath)) {
      errors.push(`workspace package ${packagePath} is not declared in workspace-packages.json`);
    }
  }
  for (const packagePath of configuredPaths) {
    if (!actualPaths.has(packagePath)) {
      errors.push(`configured package ${packagePath} is not present in pnpm workspace`);
    }
  }
} catch (error) {
  errors.push(
    `pnpm workspace packages are not discoverable: ${error instanceof Error ? error.message : String(error)}`
  );
}

const manifests = new Map();
for (const definition of definitions.values()) {
  for (const dependency of [
    ...(definition.runtimeDependencies ?? []),
    ...(definition.peerDependencies ?? []),
    ...(definition.optionalPeerDependencies ?? []),
  ]) {
    if (!definitions.has(dependency)) {
      errors.push(`${definition.id} allowlist references unknown package ${dependency}`);
    }
  }
  for (const dependency of definition.optionalPeerDependencies ?? []) {
    if (!(definition.peerDependencies ?? []).includes(dependency)) {
      errors.push(`${definition.id} optional peer ${dependency} is not in peerDependencies`);
    }
  }
  try {
    const manifestPath = path.join(root, definition.path, "package.json");
    const manifest = await readJson(manifestPath);
    manifests.set(definition.id, manifest);
    if (manifest.name !== definition.name) {
      errors.push(
        `${definition.id} package name mismatch: expected ${definition.name}, got ${String(manifest.name)}`
      );
    }
  } catch (error) {
    errors.push(
      `${definition.id} package manifest is not readable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const graph = new Map([...definitions.keys()].map((id) => [id, new Set()]));
for (const [id, definition] of definitions) {
  const manifest = manifests.get(id);
  if (!manifest) continue;
  const allowedRuntime = new Set(definition.runtimeDependencies ?? []);
  const allowedPeer = new Set(definition.peerDependencies ?? []);
  const optionalPeers = new Set(definition.optionalPeerDependencies ?? []);

  for (const { field, name, spec } of dependencyEntries(manifest, [
    "dependencies",
    "optionalDependencies",
  ])) {
    const target = names.get(name);
    if (!target) continue;
    if (definitions.get(target)?.legacyRoot && target !== id) {
      errors.push(`${id} ${field} must not depend on legacy root package ${name}`);
      continue;
    }
    if (!spec.startsWith("workspace:")) {
      errors.push(`${id} ${field} dependency on ${target} must use workspace: protocol`);
    }
    if (!allowedRuntime.has(target)) {
      errors.push(`${id} ${field} dependency on ${target} is not allowed`);
    }
    graph.get(id).add(target);
  }

  for (const { name } of dependencyEntries(manifest, ["peerDependencies"])) {
    const target = names.get(name);
    if (!target) continue;
    if (definitions.get(target)?.legacyRoot && target !== id) {
      errors.push(`${id} peerDependencies must not depend on legacy root package ${name}`);
      continue;
    }
    if (!allowedPeer.has(target)) {
      errors.push(`${id} peer dependency on ${target} is not allowed`);
    }
    if (
      optionalPeers.has(target) &&
      manifest.peerDependenciesMeta?.[name]?.optional !== true
    ) {
      errors.push(`${id} peer dependency on ${target} must be optional`);
    }
  }

  for (const { name, spec } of dependencyEntries(manifest, ["devDependencies"])) {
    const target = names.get(name);
    if (!target) continue;
    if (definitions.get(target)?.legacyRoot && target !== id) {
      errors.push(`${id} devDependencies must not depend on legacy root package ${name}`);
      continue;
    }
    if (!spec.startsWith("workspace:")) {
      errors.push(`${id} dev dependency on ${target} must use workspace: protocol`);
    }
    if (
      target !== "testkit" &&
      !allowedRuntime.has(target) &&
      !allowedPeer.has(target)
    ) {
      errors.push(`${id} dev dependency on ${target} bypasses the allowlist`);
    }
  }
}

for (const cycle of findCycles(graph)) {
  errors.push(`workspace runtime dependency cycle: ${cycle.join(" -> ")}`);
}

const report = {
  valid: errors.length === 0,
  packages: definitions.size,
  errors,
};

if (format === "json") {
  console.log(JSON.stringify(report, null, 2));
} else if (report.valid) {
  console.log(`Workspace dependency graph valid: ${report.packages} packages`);
} else {
  for (const error of errors) console.error(`workspace dependency error: ${error}`);
}

if (!report.valid) process.exitCode = 1;

