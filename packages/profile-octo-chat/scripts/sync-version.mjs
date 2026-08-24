import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// npm/pnpm require a literal `version` in package.json, so it cannot be derived
// at load time like the runtime baseline. This prebuild step keeps that literal
// in lockstep with the single source of truth (the active profile manifest),
// so a baseline bump still only edits render-profiles/octo-chat/manifest.json.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.join(packageRoot, "package.json");
const manifestPath = path.resolve(
  packageRoot,
  "..",
  "..",
  "render-profiles",
  "octo-chat",
  "manifest.json"
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));

if (typeof manifest.version !== "string") {
  throw new Error(`${manifestPath}: missing string version`);
}

if (packageJson.version !== manifest.version) {
  packageJson.version = manifest.version;
  await writeFile(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    "utf8"
  );
  console.log(`Synced package.json version -> ${manifest.version}`);
} else {
  console.log(`package.json version already ${manifest.version}`);
}
