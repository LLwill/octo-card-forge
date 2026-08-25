#!/usr/bin/env node

import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceAlias = {
  "@mlt-org/octo-card-artifact": path.join(root, "packages/artifact/src/index.ts"),
  "@mlt-org/octo-card-catalog-snapshot": path.join(root, "packages/catalog-snapshot/src/index.ts"),
  "@mlt-org/octo-card-core": path.join(root, "packages/core/src/index.ts"),
  "@mlt-org/octo-card-preview-kit": path.join(root, "packages/preview-kit/src/index.ts"),
  "@mlt-org/octo-card-spec": path.join(root, "packages/card-spec/src/index.ts"),
  "@mlt-org/octo-card-workspace": path.join(root, "packages/workspace/src/index.ts"),
  "@mlt-org/octo-card-cli-runtime": path.join(root, "packages/cli/src/index.ts"),
};
const external = [
  "@mlt-org/octo-card-profile-octo-chat",
  "adaptive-expressions",
  "adaptivecards-templating",
  "ajv",
  "ajv-formats",
  "jszip",
];

await build({
  absWorkingDir: root,
  entryPoints: {
    cli: "packages/cli/src/bin.ts",
    server: "packages/cli/src/server.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  alias: workspaceAlias,
  external,
  logLevel: "info",
});

await build({
  absWorkingDir: root,
  entryPoints: ["packages/preview-kit/src/index.ts"],
  outfile: "web/preview-kit.js",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2020",
  sourcemap: false,
  alias: workspaceAlias,
  logLevel: "info",
});
