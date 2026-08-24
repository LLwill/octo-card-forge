import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeComponentCatalogV1,
  decodeRenderCapabilities,
  decodeRenderProfileManifest,
  type ComponentCatalogV1,
  type RenderCapabilitiesV1,
  type RenderProfileManifestV1,
} from "@mlt-org/octo-card-spec";

const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function resolveAssetPath(root: string, relativePath: string): string {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).some((segment) => segment === "..")
  ) {
    throw new Error(
      `${root}/manifest.json: Profile asset must stay inside the package: ${relativePath}`
    );
  }
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `${root}/manifest.json: Profile asset must stay inside the package: ${relativePath}`
    );
  }
  return resolvedPath;
}

async function resolveProfileRoot(explicitRoot?: string): Promise<{ root: string; manifest: RenderProfileManifestV1 }> {
  const resolved = explicitRoot ? path.resolve(explicitRoot) : PACKAGE_ROOT;
  const candidates = explicitRoot
    ? [resolved, path.join(resolved, "dist")]
    : [PACKAGE_ROOT, path.join(PACKAGE_ROOT, "dist")];

  let lastError: unknown;
  for (const root of candidates) {
    try {
      const manifestPath = path.join(root, "manifest.json");
      const rawManifest = await readJsonFile<unknown>(manifestPath);
      const result = decodeRenderProfileManifest(rawManifest);
      if (result.ok) {
        return { root, manifest: result.value };
      }
      lastError = new Error(result.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Could not locate profile manifest (tried: ${candidates.join(", ")}): ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

export function assertScopedCss(css: string, filePath: string): string[] {
  const errors: string[] = [];
  if (css.includes("--wk-")) {
    errors.push(
      `${filePath}: Profile CSS must not depend on Web --wk-* tokens`
    );
  }
  if (/(^|[}\n])\s*(?:body|html|:root|#preview|\.ac-)/m.test(css)) {
    errors.push(
      `${filePath}: every Profile selector must be scoped by .octo-card-profile`
    );
  }
  if (/:first-child|:last-child/.test(css)) {
    errors.push(
      `${filePath}: positional Header/Footer inference is not allowed`
    );
  }
  return errors;
}

export function assertComponentCapabilities(
  capabilities: RenderCapabilitiesV1,
  css: string,
  filePath: string
): string[] {
  const errors: string[] = [];
  const components = (capabilities.components ?? {}) as Record<
    string,
    { appliesTo: string[]; variants: Record<string, { fallback?: Record<string, unknown> }> }
  >;
  const allowedPrefixes = new Set<string>();
  for (const [family, definition] of Object.entries(components)) {
    if (!family.startsWith("octo-")) {
      errors.push(
        `${filePath}: component family must start with octo-: ${family}`
      );
      continue;
    }
    if (!definition.appliesTo || definition.appliesTo.length === 0) {
      errors.push(
        `${filePath}: component ${family} must declare appliesTo`
      );
    }
    allowedPrefixes.add(`${family}-`);
    const variants = Object.keys(definition.variants ?? {});
    if (variants.length === 0) {
      errors.push(
        `${filePath}: component ${family} must declare variants`
      );
    }
    for (const variant of variants) {
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(variant)) {
        errors.push(
          `${filePath}: invalid component variant ${family}-${variant}`
        );
      }
      for (const other of variants) {
        if (variant !== other && other.startsWith(`${variant}-`)) {
          errors.push(
            `${filePath}: component variants must not be prefix-compatible: ${family}-${variant} and ${family}-${other}`
          );
        }
      }
      allowedPrefixes.add(`${family}-${variant}-`);
      if (!css.includes(`[id^="${family}-${variant}-"]`)) {
        errors.push(
          `${filePath}: missing CSS rule for component variant ${family}-${variant}`
        );
      }
    }
  }

  const selectorPrefixes = css.matchAll(/\[id\^=(["'])(octo-[^"']+)\1\]/g);
  for (const match of selectorPrefixes) {
    const prefix = match[2];
    if (prefix === "octo--") continue;
    if (!allowedPrefixes.has(prefix)) {
      errors.push(
        `${filePath}: CSS selector prefix ${prefix} is not declared as a component family or variant`
      );
    }
  }
  return errors;
}

export function assertUtilityCapabilities(
  capabilities: RenderCapabilitiesV1,
  css: string,
  filePath: string
): string[] {
  const errors: string[] = [];
  const tokenPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const utilities = (capabilities.utilities ?? {}) as Record<
    string,
    {
      group: string;
      appliesTo: string[];
      description: string;
      fallback?: Record<string, unknown>;
      cssRequired?: boolean;
    }
  >;
  const utilityRules = capabilities.utilityRules;
  if (
    utilityRules?.maxTokensPerElement !== undefined &&
    (!Number.isInteger(utilityRules.maxTokensPerElement) ||
      utilityRules.maxTokensPerElement <= 0)
  ) {
    errors.push(
      `${filePath}: utilityRules.maxTokensPerElement must be a positive integer`
    );
  }

  const declaredTokens = Object.keys(utilities);
  for (const token of declaredTokens) {
    if (!tokenPattern.test(token)) {
      errors.push(`${filePath}: invalid utility token ${token}`);
      continue;
    }
    const definition = utilities[token];
    if (!tokenPattern.test(definition.group)) {
      errors.push(`${filePath}: invalid utility group ${definition.group}`);
    }
    if (!Array.isArray(definition.appliesTo) || definition.appliesTo.length === 0) {
      errors.push(`${filePath}: utility ${token} must declare appliesTo`);
    } else {
      for (const element of definition.appliesTo) {
        if (element !== "*" && !capabilities.allowedElements.includes(element)) {
          errors.push(
            `${filePath}: utility ${token} applies to unsupported element ${element}`
          );
        }
      }
    }
    if (
      typeof definition.description !== "string" ||
      definition.description.trim() === ""
    ) {
      errors.push(`${filePath}: utility ${token} must declare description`);
    }
    if (definition.fallback !== undefined && !isObject(definition.fallback)) {
      errors.push(`${filePath}: utility ${token} fallback must be an object`);
    }
    for (const other of declaredTokens) {
      if (token !== other && other.startsWith(`${token}-`)) {
        errors.push(
          `${filePath}: utility tokens must not be prefix-compatible: ${token} and ${other}`
        );
      }
    }
  }

  const cssTokens = new Set<string>();
  const selectorTokens = css.matchAll(
    /\[id\*=(["'])--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)--\1\]/g
  );
  for (const match of selectorTokens) {
    const token = match[2];
    cssTokens.add(token);
    if (!utilities[token]) {
      errors.push(
        `${filePath}: CSS utility selector token ${token} is not declared in capabilities.utilities`
      );
    }
  }

  for (const [token, definition] of Object.entries(utilities)) {
    if (definition.cssRequired === false) continue;
    if (!cssTokens.has(token)) {
      errors.push(
        `${filePath}: missing CSS rule for utility token ${token}`
      );
    }
  }
  return errors;
}

export function validateProfileCss(
  capabilities: RenderCapabilitiesV1,
  css: string,
  filePath: string
): string[] {
  return [
    ...assertScopedCss(css, filePath),
    ...assertComponentCapabilities(capabilities, css, filePath),
    ...assertUtilityCapabilities(capabilities, css, filePath),
  ];
}

export interface ProfileAssetBundle {
  root: string;
  manifest: RenderProfileManifestV1;
  capabilities: RenderCapabilitiesV1;
  hostConfig: Record<string, unknown>;
  tokens: Record<string, unknown>;
  themeCss: string;
  stylesCss: string;
  componentCatalog?: ComponentCatalogV1;
}

export interface ProfileValidationResult {
  reference: string;
  packageName: string;
  version: string;
  compatibility: string;
  errors: string[];
}

export async function loadProfileAssets(
  root?: string
): Promise<ProfileAssetBundle> {
  const resolved = await resolveProfileRoot(root);
  const { root: assetRoot, manifest } = resolved;

  const capabilitiesPath = resolveAssetPath(assetRoot, manifest.capabilities);
  const rawCapabilities = await readJsonFile<unknown>(capabilitiesPath);
  const capsResult = decodeRenderCapabilities(rawCapabilities);
  if (!capsResult.ok) {
    const details = capsResult.issues
      .map((i) => `${i.path}: ${i.message}`)
      .join("; ");
    throw new Error(`${capabilitiesPath}: ${details}`);
  }

  const hostConfig = await readJsonFile<Record<string, unknown>>(
    resolveAssetPath(assetRoot, manifest.hostConfig)
  );
  const tokens = manifest.tokens
    ? await readJsonFile<Record<string, unknown>>(
        resolveAssetPath(assetRoot, manifest.tokens)
      )
    : {};
  const stylesCss = await readFile(
    resolveAssetPath(assetRoot, manifest.stylesheet),
    "utf8"
  );
  const themeCss = manifest.theme
    ? await readFile(resolveAssetPath(assetRoot, manifest.theme), "utf8")
    : "";

  let componentCatalog: ComponentCatalogV1 | undefined;
  if (manifest.componentCatalog) {
    const catalogPath = resolveAssetPath(assetRoot, manifest.componentCatalog);
    const rawCatalog = await readJsonFile<unknown>(catalogPath);
    const catalogResult = decodeComponentCatalogV1(rawCatalog);
    if (!catalogResult.ok) {
      const details = catalogResult.issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ");
      throw new Error(`${catalogPath}: ${details}`);
    }
    componentCatalog = catalogResult.value;
  }

  return {
    root: assetRoot,
    manifest,
    capabilities: capsResult.value,
    hostConfig,
    tokens,
    themeCss,
    stylesCss,
    ...(componentCatalog ? { componentCatalog } : {}),
  };
}

export async function validateProfile(
  root?: string
): Promise<ProfileValidationResult> {
  const assets = await loadProfileAssets(root);
  const errors: string[] = [];

  if (!assets.manifest.compatibility) {
    errors.push("manifest.json: compatibility is required for package publishing");
  }
  if (!assets.manifest.packageName) {
    errors.push("manifest.json: packageName is required for package publishing");
  }
  if (!assets.manifest.theme) {
    errors.push("manifest.json: theme is required for package publishing");
  }
  if (!assets.manifest.tokens) {
    errors.push("manifest.json: tokens is required for package publishing");
  }

  const combinedCss = [assets.themeCss, assets.stylesCss].filter(Boolean).join("\n");
  const cssPath = path.join(assets.root, assets.manifest.stylesheet);
  errors.push(...validateProfileCss(assets.capabilities, combinedCss, cssPath));

  return {
    reference: `${assets.manifest.id}@${assets.manifest.version}`,
    packageName: assets.manifest.packageName ?? "@mlt-org/octo-card-profile-octo-chat",
    version: assets.manifest.version,
    compatibility: assets.manifest.compatibility ?? "",
    errors,
  };
}

export function getPackageRoot(): string {
  return PACKAGE_ROOT;
}

export function getProfileReference(
  manifest: RenderProfileManifestV1
): string {
  return `${manifest.id}@${manifest.version}`;
}
