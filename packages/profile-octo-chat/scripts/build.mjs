import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

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

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });

for (const asset of assets) {
  await cp(path.join(packageRoot, asset), path.join(distRoot, asset));
}

const packageJson = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8")
);
const publishedPackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  type: "module",
  description: packageJson.description,
  main: "./index.js",
  types: "./index.d.ts",
  exports: {
    ".": "./index.js",
    "./manifest.json": "./manifest.json",
    "./capabilities.json": "./capabilities.json",
    "./host-config.json": "./host-config.json",
    "./tokens.json": "./tokens.json",
    "./theme.css": "./theme.css",
    "./styles.css": "./styles.css",
  },
  sideEffects: ["*.css"],
};
await writeFile(
  path.join(distRoot, "package.json"),
  `${JSON.stringify(publishedPackageJson, null, 2)}\n`
);

console.log(`Built ${packageJson.name}@${packageJson.version} → dist/`);
