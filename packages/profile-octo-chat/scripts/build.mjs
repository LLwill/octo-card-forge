import { cp, rm, writeFile, readFile } from "node:fs/promises";
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
  "package.json",
];

for (const asset of assets) {
  await rm(path.join(distRoot, asset), { force: true });
}

for (const asset of assets.slice(0, -1)) {
  await cp(path.join(packageRoot, asset), path.join(distRoot, asset));
}

const pkg = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8")
);
const publishedPackageJson = {
  name: pkg.name,
  version: pkg.version,
  type: "module",
  description: pkg.description,
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

console.log(`Built ${pkg.name}@${pkg.version} → dist/`);
