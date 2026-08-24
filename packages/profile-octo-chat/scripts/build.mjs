import { cp, writeFile, readFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const distRoot = path.join(packageRoot, "dist");

// Single source of truth for the Render Profile assets. The workspace package
// no longer keeps its own byte-identical copies; it re-packages the active
// profile from render-profiles/ so a baseline only ever lives in one place.
const profileSourceRoot = path.resolve(
  packageRoot,
  "..",
  "..",
  "render-profiles",
  "octo-chat"
);

const assets = [
  "manifest.json",
  "capabilities.json",
  "host-config.json",
  "tokens.json",
  "theme.css",
  "styles.css",
];

for (const asset of assets) {
  await cp(path.join(profileSourceRoot, asset), path.join(distRoot, asset));
}

const cliPath = path.join(distRoot, "cli.js");
const shebang = "#!/usr/bin/env node\n";
const cliContent = await readFile(cliPath, "utf8");
if (!cliContent.startsWith("#!")) {
  await writeFile(cliPath, shebang + cliContent);
}
await chmod(cliPath, 0o755);

console.log(
  `Copied ${assets.length} assets from ${path.relative(packageRoot, profileSourceRoot)} and made cli.js executable`
);
