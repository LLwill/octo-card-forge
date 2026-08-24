#!/usr/bin/env node
// Thin root entry for the published `octo-card` binary.
//
// The CLI runtime lives in @mlt-org/octo-card-cli-runtime (packages/cli). The
// only thing the root keeps is this entry, which injects the legacy dev server
// (still hosted in this application layer) and forwards argv. esbuild bundles
// this file into dist/cli.js for npm publishing and the deploy package.
import { runCli } from "@mlt-org/octo-card-cli-runtime";
import { startServer } from "./server.js";

await runCli(process.argv.slice(2), { startServer });
