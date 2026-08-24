import { issue, parseOrThrow, type DecodeIssue, type DecodeResult } from "./diagnostics.js";
import { isJsonObject, isNonEmptyString } from "./json.js";
import { parseSemVer } from "./identifiers.js";

export interface RenderProfileManifestV1 {
  schemaVersion: 1;
  id: string;
  version: string;
  compatibility?: string;
  packageName?: string;
  adaptiveCardsSdkVersion: string;
  hostConfig: string;
  theme?: string;
  stylesheet: string;
  tokens?: string;
  capabilities: string;
  componentCatalog?: string;
}

export interface RenderCapabilitiesV1 {
  schemaVersion: 1;
  maxAdaptiveCardVersion: string;
  allowedElements: string[];
  allowedActions: string[];
  components?: Record<string, unknown>;
  utilities?: Record<string, unknown>;
  utilityRules?: { maxTokensPerElement?: number };
  maxNodes: number;
  maxDepth: number;
  maxPayloadBytes: number;
  imageUrlSchemes: string[];
  openUrlSchemes: string[];
}

const ID = /^[a-z][a-z0-9.-]*$/;
const PATH = /^(?![\\/])[^\\]*$/;
const PROFILE_KEYS = new Set(["schemaVersion", "id", "version", "compatibility", "packageName", "adaptiveCardsSdkVersion", "hostConfig", "theme", "stylesheet", "tokens", "capabilities", "componentCatalog"]);
const CAPABILITY_KEYS = new Set(["schemaVersion", "maxAdaptiveCardVersion", "allowedElements", "allowedActions", "components", "utilities", "utilityRules", "maxNodes", "maxDepth", "maxPayloadBytes", "imageUrlSchemes", "openUrlSchemes"]);
const UTILITY_RULE_KEYS = new Set(["maxTokensPerElement"]);
const COMPONENT_KEYS = new Set(["appliesTo", "variants"]);
const COMPONENT_VARIANT_KEYS = new Set(["fallback", "deprecated"]);
const UTILITY_KEYS = new Set(["group", "appliesTo", "fallback", "description", "useWhen", "avoidWhen", "cssRequired", "deprecated"]);

function unknownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: DecodeIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(issue("contract.unknown_property", `${path}/${key}`, `unknown property ${key}`));
  }
}

function pathValue(input: Record<string, unknown>, key: string, issues: DecodeIssue[]): string | undefined {
  const value = input[key];
  if (!isNonEmptyString(value)) {
    issues.push(issue("contract.required", `/${key}`, `${key} must be a non-empty string`));
    return undefined;
  }
  if (!PATH.test(value) || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    issues.push(issue("contract.pattern", `/${key}`, `${key} must be a package-relative path`));
    return undefined;
  }
  return value;
}

function stringArray(value: unknown, path: string, issues: DecodeIssue[], allowEmpty = true): string[] | undefined {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => !isNonEmptyString(item))) {
    issues.push(issue("contract.type", path, `value must be a ${allowEmpty ? "" : "non-empty "}string array`));
    return undefined;
  }
  return value as string[];
}

function decodeComponents(value: unknown, issues: DecodeIssue[]): Record<string, unknown> | undefined {
  if (!isJsonObject(value)) {
    issues.push(issue("contract.type", "/components", "components must be an object"));
    return undefined;
  }
  const components: Record<string, unknown> = {};
  for (const [name, rawDefinition] of Object.entries(value)) {
    const path = `/components/${name}`;
    if (!isJsonObject(rawDefinition)) {
      issues.push(issue("contract.type", path, "component definition must be an object"));
      continue;
    }
    unknownKeys(rawDefinition, COMPONENT_KEYS, path, issues);
    const appliesTo = stringArray(rawDefinition.appliesTo, `${path}/appliesTo`, issues, false);
    if (!isJsonObject(rawDefinition.variants) || Object.keys(rawDefinition.variants).length === 0) {
      issues.push(issue("contract.required", `${path}/variants`, "variants must be a non-empty object"));
    }
    const variants: Record<string, unknown> = {};
    if (isJsonObject(rawDefinition.variants)) {
      for (const [variantName, rawVariant] of Object.entries(rawDefinition.variants)) {
        const variantPath = `${path}/variants/${variantName}`;
        if (!isJsonObject(rawVariant)) {
          issues.push(issue("contract.type", variantPath, "component variant must be an object"));
          continue;
        }
        unknownKeys(rawVariant, COMPONENT_VARIANT_KEYS, variantPath, issues);
        if (rawVariant.fallback !== undefined && !isJsonObject(rawVariant.fallback)) issues.push(issue("contract.type", `${variantPath}/fallback`, "fallback must be an object"));
        if (rawVariant.deprecated !== undefined && typeof rawVariant.deprecated !== "boolean") issues.push(issue("contract.type", `${variantPath}/deprecated`, "deprecated must be boolean"));
        variants[variantName] = rawVariant;
      }
    }
    if (appliesTo && Object.keys(variants).length > 0) components[name] = { appliesTo, variants };
  }
  return components;
}

function decodeUtilities(value: unknown, issues: DecodeIssue[]): Record<string, unknown> | undefined {
  if (!isJsonObject(value)) {
    issues.push(issue("contract.type", "/utilities", "utilities must be an object"));
    return undefined;
  }
  const utilities: Record<string, unknown> = {};
  for (const [name, rawDefinition] of Object.entries(value)) {
    const path = `/utilities/${name}`;
    if (!isJsonObject(rawDefinition)) {
      issues.push(issue("contract.type", path, "utility definition must be an object"));
      continue;
    }
    unknownKeys(rawDefinition, UTILITY_KEYS, path, issues);
    const group = isNonEmptyString(rawDefinition.group) ? rawDefinition.group : undefined;
    const appliesTo = stringArray(rawDefinition.appliesTo, `${path}/appliesTo`, issues, false);
    const description = isNonEmptyString(rawDefinition.description) ? rawDefinition.description : undefined;
    if (!group) issues.push(issue("contract.required", `${path}/group`, "group must be a non-empty string"));
    if (!description) issues.push(issue("contract.required", `${path}/description`, "description must be a non-empty string"));
    if (rawDefinition.fallback !== undefined && !isJsonObject(rawDefinition.fallback)) issues.push(issue("contract.type", `${path}/fallback`, "fallback must be an object"));
    for (const key of ["useWhen", "avoidWhen"] as const) {
      if (rawDefinition[key] !== undefined) stringArray(rawDefinition[key], `${path}/${key}`, issues);
    }
    for (const key of ["cssRequired", "deprecated"] as const) {
      if (rawDefinition[key] !== undefined && typeof rawDefinition[key] !== "boolean") issues.push(issue("contract.type", `${path}/${key}`, `${key} must be boolean`));
    }
    if (group && appliesTo && description) utilities[name] = rawDefinition;
  }
  return utilities;
}

function decodeUtilityRules(value: unknown, issues: DecodeIssue[]): { maxTokensPerElement?: number } | undefined {
  if (!isJsonObject(value)) {
    issues.push(issue("contract.type", "/utilityRules", "utilityRules must be an object"));
    return undefined;
  }
  unknownKeys(value, UTILITY_RULE_KEYS, "/utilityRules", issues);
  if (value.maxTokensPerElement === undefined) return {};
  if (typeof value.maxTokensPerElement !== "number" || !Number.isInteger(value.maxTokensPerElement) || value.maxTokensPerElement <= 0) {
    issues.push(issue("contract.invariant", "/utilityRules/maxTokensPerElement", "maxTokensPerElement must be a positive integer"));
    return undefined;
  }
  return { maxTokensPerElement: value.maxTokensPerElement };
}

export function decodeRenderProfileManifest(input: unknown, options: { allowLegacyUnversioned?: boolean } = {}): DecodeResult<RenderProfileManifestV1> {
  const issues: DecodeIssue[] = [];
  const notices: DecodeIssue[] = [];
  if (!isJsonObject(input)) return { ok: false, issues: [issue("contract.root_type", "", "render profile manifest must be a JSON object")] };
  for (const key of Object.keys(input)) if (!PROFILE_KEYS.has(key)) issues.push(issue("contract.unknown_property", `/${key}`, `unknown property ${key}`));
  if (input.schemaVersion !== 1) {
    if (input.schemaVersion === undefined && options.allowLegacyUnversioned) notices.push(issue("contract.unsupported_version", "/schemaVersion", "legacy unversioned render profile accepted in compatibility mode"));
    else issues.push(issue("contract.unsupported_version", "/schemaVersion", "only render profile schemaVersion 1 is supported"));
  }
  const id = isNonEmptyString(input.id) && ID.test(input.id) ? input.id : undefined;
  if (!id) issues.push(issue("contract.pattern", "/id", "id has an invalid format"));
  const version = parseSemVer(input.version);
  if (!version) issues.push(issue("contract.pattern", "/version", "version must use SemVer"));
  const adaptiveCardsSdkVersion = isNonEmptyString(input.adaptiveCardsSdkVersion) ? input.adaptiveCardsSdkVersion : undefined;
  if (!adaptiveCardsSdkVersion) issues.push(issue("contract.required", "/adaptiveCardsSdkVersion", "adaptiveCardsSdkVersion must be a non-empty string"));
  const hostConfig = pathValue(input, "hostConfig", issues);
  const stylesheet = pathValue(input, "stylesheet", issues);
  const capabilities = pathValue(input, "capabilities", issues);
  const theme = input.theme === undefined ? undefined : pathValue(input, "theme", issues);
  const tokens = input.tokens === undefined ? undefined : pathValue(input, "tokens", issues);
  const componentCatalog = input.componentCatalog === undefined ? undefined : pathValue(input, "componentCatalog", issues);
  if (input.compatibility !== undefined && !isNonEmptyString(input.compatibility)) issues.push(issue("contract.type", "/compatibility", "compatibility must be a string when provided"));
  if (input.packageName !== undefined && !isNonEmptyString(input.packageName)) issues.push(issue("contract.type", "/packageName", "packageName must be a string when provided"));
  if (issues.length > 0 || !id || !version || !adaptiveCardsSdkVersion || !hostConfig || !stylesheet || !capabilities) return { ok: false, issues };
  return { ok: true, notices, value: { schemaVersion: 1, id, version, ...(typeof input.compatibility === "string" ? { compatibility: input.compatibility } : {}), ...(typeof input.packageName === "string" ? { packageName: input.packageName } : {}), adaptiveCardsSdkVersion, hostConfig, ...(theme ? { theme } : {}), stylesheet, ...(tokens ? { tokens } : {}), capabilities, ...(componentCatalog ? { componentCatalog } : {}) } };
}

export function parseRenderProfileManifest(input: unknown, options: { allowLegacyUnversioned?: boolean } = {}): RenderProfileManifestV1 {
  return parseOrThrow("RenderProfileManifestV1", decodeRenderProfileManifest(input, options));
}

export function decodeRenderCapabilities(input: unknown, options: { allowLegacyUnversioned?: boolean } = {}): DecodeResult<RenderCapabilitiesV1> {
  const issues: DecodeIssue[] = [];
  const notices: DecodeIssue[] = [];
  if (!isJsonObject(input)) return { ok: false, issues: [issue("contract.root_type", "", "render capabilities must be a JSON object")] };
  for (const key of Object.keys(input)) if (!CAPABILITY_KEYS.has(key)) issues.push(issue("contract.unknown_property", `/${key}`, `unknown property ${key}`));
  if (input.schemaVersion !== 1) {
    if (input.schemaVersion === undefined && options.allowLegacyUnversioned) notices.push(issue("contract.unsupported_version", "/schemaVersion", "legacy unversioned capabilities accepted in compatibility mode"));
    else issues.push(issue("contract.unsupported_version", "/schemaVersion", "only capabilities schemaVersion 1 is supported"));
  }
  const stringArray = (key: string): string[] | undefined => {
    const value = input[key];
    if (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item))) {
      issues.push(issue("contract.type", `/${key}`, `${key} must be a string array`));
      return undefined;
    }
    return value as string[];
  };
  const numberValue = (key: string): number | undefined => {
    const value = input[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      issues.push(issue("contract.invariant", `/${key}`, `${key} must be a positive integer`));
      return undefined;
    }
    return value;
  };
  const maxAdaptiveCardVersion = isNonEmptyString(input.maxAdaptiveCardVersion) && /^\d+\.\d+$/.test(input.maxAdaptiveCardVersion) ? input.maxAdaptiveCardVersion : undefined;
  if (!maxAdaptiveCardVersion) issues.push(issue("contract.pattern", "/maxAdaptiveCardVersion", "maxAdaptiveCardVersion must use <major>.<minor>"));
  const allowedElements = stringArray("allowedElements");
  const allowedActions = stringArray("allowedActions");
  const imageUrlSchemes = stringArray("imageUrlSchemes");
  const openUrlSchemes = stringArray("openUrlSchemes");
  const maxNodes = numberValue("maxNodes");
  const maxDepth = numberValue("maxDepth");
  const maxPayloadBytes = numberValue("maxPayloadBytes");
  const components = input.components === undefined ? undefined : decodeComponents(input.components, issues);
  const utilities = input.utilities === undefined ? undefined : decodeUtilities(input.utilities, issues);
  const utilityRules = input.utilityRules === undefined ? undefined : decodeUtilityRules(input.utilityRules, issues);
  if (issues.length > 0 || !maxAdaptiveCardVersion || !allowedElements || !allowedActions || !imageUrlSchemes || !openUrlSchemes || !maxNodes || !maxDepth || !maxPayloadBytes) return { ok: false, issues };
  return { ok: true, notices, value: { schemaVersion: 1, maxAdaptiveCardVersion, allowedElements, allowedActions, ...(components ? { components } : {}), ...(utilities ? { utilities } : {}), ...(utilityRules ? { utilityRules } : {}), maxNodes, maxDepth, maxPayloadBytes, imageUrlSchemes, openUrlSchemes } };
}
