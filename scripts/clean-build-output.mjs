#!/usr/bin/env node
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = JSON.parse(
  readFileSync(path.join(root, "workspace-packages.json"), "utf8")
);

rmSync(path.join(root, "dist"), { recursive: true, force: true });
for (const definition of workspace.packages) {
  if (definition.path === ".") continue;
  rmSync(path.join(root, definition.path, "dist"), {
    recursive: true,
    force: true,
  });
}
