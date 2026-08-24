#!/usr/bin/env node
// Executable entry for the published `octo-card` binary and the bundled
// dist/cli.js. It wires the dev server (startServer) into the CLI runtime so
// the `dev` command can boot the preview server, then forwards argv.
import { runCli } from "./cli.js";
import { startServer } from "./server.js";

await runCli(process.argv.slice(2), { startServer });
