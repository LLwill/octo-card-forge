#!/usr/bin/env node

import { startServer } from "../dist/server.js";

const port = Number(process.env.PORT ?? "4318");
const host = process.env.HOST ?? "0.0.0.0";
const basePath = process.env.BASE_PATH ?? "/";
const catalogSnapshotUrl = process.env.CATALOG_SNAPSHOT_URL;
const catalogRoot = process.env.CATALOG_ROOT;
const catalogImageDigest = process.env.CATALOG_IMAGE_DIGEST;
const catalogRevision = process.env.CATALOG_REVISION;
const forgeRevision = process.env.FORGE_REVISION;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}
if (catalogRoot && catalogSnapshotUrl) {
  throw new Error("CATALOG_ROOT and CATALOG_SNAPSHOT_URL cannot be configured together");
}
if (process.env.NODE_ENV === "production" && !catalogRoot) {
  throw new Error("CATALOG_ROOT is required in production");
}

await startServer({ basePath, catalogImageDigest, catalogRevision, catalogRoot, catalogSnapshotUrl, forgeRevision, host, port });
