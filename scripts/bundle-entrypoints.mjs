#!/usr/bin/env node

import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
    cli: "src/cli.ts",
    server: "src/server.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  external,
  logLevel: "info",
});
