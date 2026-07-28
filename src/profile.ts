import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getRenderProfile } from "./registry.js";
import type { RenderCapabilities } from "./types.js";

const execFileAsync = promisify(execFile);

export interface ProfileBundleResult {
  reference: string;
  packageRoot: string;
  packageName: string;
  version: string;
  files: string[];
}

export interface ProfileValidationResult {
  reference: string;
  packageName: string;
  version: string;
  compatibility: string;
  files: [string, string, string, string, string];
}

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function assertScopedCss(css: string, filePath: string): void {
  if (css.includes("--wk-")) {
    throw new Error(`${filePath}: Profile CSS must not depend on Web --wk-* tokens`);
  }
  if (/(^|[}\n])\s*(?:body|html|:root|#preview|\.ac-)/m.test(css)) {
    throw new Error(`${filePath}: every Profile selector must be scoped by .octo-card-profile`);
  }
  if (/:first-child|:last-child/.test(css)) {
    throw new Error(`${filePath}: positional Header/Footer inference is not allowed`);
  }
}

function assertComponentCapabilities(
  capabilities: RenderCapabilities,
  css: string,
  filePath: string
): void {
  const components = capabilities.components ?? {};
  const allowedPrefixes = new Set<string>();
  for (const [family, definition] of Object.entries(components)) {
    if (!family.startsWith("octo-")) {
      throw new Error(`${filePath}: component family must start with octo-: ${family}`);
    }
    if (definition.appliesTo.length === 0) {
      throw new Error(`${filePath}: component ${family} must declare appliesTo`);
    }
    allowedPrefixes.add(`${family}-`);
    const variants = Object.keys(definition.variants);
    if (variants.length === 0) {
      throw new Error(`${filePath}: component ${family} must declare variants`);
    }
    for (const variant of variants) {
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(variant)) {
        throw new Error(`${filePath}: invalid component variant ${family}-${variant}`);
      }
      for (const other of variants) {
        if (variant !== other && other.startsWith(`${variant}-`)) {
          throw new Error(
            `${filePath}: component variants must not be prefix-compatible: ${family}-${variant} and ${family}-${other}`
          );
        }
      }
      allowedPrefixes.add(`${family}-${variant}-`);
      if (!css.includes(`[id^="${family}-${variant}-"]`)) {
        throw new Error(
          `${filePath}: missing CSS rule for component variant ${family}-${variant}`
        );
      }
    }
  }

  const selectorPrefixes = css.matchAll(/\[id\^=(["'])(octo-[^"']+)\1\]/g);
  for (const match of selectorPrefixes) {
    const prefix = match[2];
    if (!allowedPrefixes.has(prefix)) {
      throw new Error(
        `${filePath}: CSS selector prefix ${prefix} is not declared as a component family or variant`
      );
    }
  }
}

async function validateLoadedRenderProfile(
  reference: string,
  profile: Awaited<ReturnType<typeof getRenderProfile>>
): Promise<ProfileValidationResult> {
  const { manifest } = profile;
  if (!manifest.compatibility || !manifest.packageName || !manifest.theme || !manifest.tokens) {
    throw new Error(
      `${reference}: compatibility, packageName, theme and tokens are required for bundling`
    );
  }

  const files: ProfileValidationResult["files"] = [
    manifest.hostConfig,
    manifest.theme,
    manifest.stylesheet,
    manifest.tokens,
    manifest.capabilities,
  ];
  const contents = await Promise.all(
    files.map((file) => readFile(path.join(profile.root, file)))
  );
  assertScopedCss(
    contents[files.indexOf(manifest.stylesheet)].toString("utf8"),
    path.join(profile.root, manifest.stylesheet)
  );
  assertComponentCapabilities(
    profile.capabilities,
    contents[files.indexOf(manifest.stylesheet)].toString("utf8"),
    path.join(profile.root, manifest.stylesheet)
  );

  return {
    reference,
    packageName: manifest.packageName,
    version: manifest.version,
    compatibility: manifest.compatibility,
    files,
  };
}

export async function validateRenderProfile(
  reference: string
): Promise<ProfileValidationResult> {
  return validateLoadedRenderProfile(reference, await getRenderProfile(reference));
}

export async function bundleRenderProfile(
  reference: string,
  outputRoot: string
): Promise<ProfileBundleResult> {
  const profile = await getRenderProfile(reference);
  const { manifest } = profile;
  const validation = await validateLoadedRenderProfile(reference, profile);
  const sourceFiles = validation.files;
  const [hostConfig, theme, stylesheet, tokens, capabilities] = sourceFiles;
  const packageRoot = path.resolve(
    outputRoot,
    `${manifest.id}-${manifest.version}`,
    "package"
  );
  const distRoot = path.join(packageRoot, "dist");
  await rm(packageRoot, { recursive: true, force: true });
  await mkdir(distRoot, { recursive: true });

  for (const file of sourceFiles) {
    await cp(path.join(profile.root, file), path.join(distRoot, file));
  }

  const publishedManifest = {
    ...manifest,
    hostConfig: `dist/${hostConfig}`,
    theme: `dist/${theme}`,
    stylesheet: `dist/${stylesheet}`,
    tokens: `dist/${tokens}`,
    capabilities: `dist/${capabilities}`,
  };
  await writeFile(
    path.join(distRoot, "manifest.json"),
    `${JSON.stringify(publishedManifest, null, 2)}\n`
  );

  const hashedFiles = [...sourceFiles, "manifest.json"].sort();
  const hashes: Record<string, string> = {};
  for (const file of hashedFiles) {
    hashes[`dist/${file}`] = sha256(await readFile(path.join(distRoot, file)));
  }
  const bundleManifest = {
    profile: reference,
    compatibility: validation.compatibility,
    adaptiveCardsSdkVersion: manifest.adaptiveCardsSdkVersion,
    files: hashes,
  };
  await writeFile(
    path.join(distRoot, "bundle-manifest.json"),
    `${JSON.stringify(bundleManifest, null, 2)}\n`
  );

  const packageJson = {
    name: validation.packageName,
    version: validation.version,
    description: `Octo Adaptive Cards Render Profile ${reference}`,
    private: false,
    repository: {
      type: "git",
      url: "git+https://github.com/LLwill/octo-card-forge.git",
      directory: `render-profiles/${manifest.id}`,
    },
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
    files: ["dist"],
    sideEffects: ["*.css", "dist/*.css"],
    exports: {
      "./manifest.json": "./dist/manifest.json",
      "./host-config.json": `./dist/${hostConfig}`,
      "./theme.css": `./dist/${theme}`,
      "./styles.css": `./dist/${stylesheet}`,
      "./tokens.json": `./dist/${tokens}`,
      "./capabilities.json": `./dist/${capabilities}`,
      "./bundle-manifest.json": "./dist/bundle-manifest.json",
    },
  };
  await writeFile(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );

  return {
    reference,
    packageRoot,
    packageName: validation.packageName,
    version: validation.version,
    files: ["package.json", ...hashedFiles.map((file) => `dist/${file}`), "dist/bundle-manifest.json"],
  };
}

export async function packRenderProfile(
  reference: string,
  outputRoot: string
): Promise<ProfileBundleResult & { tarball: string }> {
  const bundle = await bundleRenderProfile(reference, outputRoot);
  const destination = path.resolve(outputRoot);
  await mkdir(destination, { recursive: true });
  const { stdout } = await execFileAsync(
    "pnpm",
    ["pack", "--pack-destination", destination],
    { cwd: bundle.packageRoot }
  );
  const packedName = stdout.trim().split(/\r?\n/).at(-1);
  if (!packedName) throw new Error(`${reference}: pnpm pack did not return a tarball`);
  return {
    ...bundle,
    tarball: path.isAbsolute(packedName) ? packedName : path.join(destination, packedName),
  };
}
