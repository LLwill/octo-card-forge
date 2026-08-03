#!/usr/bin/env node

import { startServer } from "../dist/server.js";

const port = Number(process.env.PORT ?? "4318");
const host = process.env.HOST ?? "0.0.0.0";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

await startServer({ host, port });
