import { cp, writeFile, readFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const distRoot = path.join(packageRoot, "dist");

const assets = [
  "manifest.json",
  "capabilities.json",
  "host-config.json",
  "tokens.json",
  "theme.css",
  "styles.css",
];

for (const asset of assets) {
  await cp(path.join(packageRoot, asset), path.join(distRoot, asset));
}

const cliPath = path.join(distRoot, "cli.js");
const shebang = "#!/usr/bin/env node\n";
const cliContent = await readFile(cliPath, "utf8");
if (!cliContent.startsWith("#!")) {
  await writeFile(cliPath, shebang + cliContent);
}
await chmod(cliPath, 0o755);

console.log(`Copied ${assets.length} assets and made cli.js executable`);
