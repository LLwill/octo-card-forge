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
const PROFILE_KEYS = new Set(["schemaVersion", "id", "version", "compatibility", "packageName", "adaptiveCardsSdkVersion", "hostConfig", "theme", "stylesheet", "tokens", "capabilities"]);
const CAPABILITY_KEYS = new Set(["schemaVersion", "maxAdaptiveCardVersion", "allowedElements", "allowedActions", "components", "utilities", "utilityRules", "maxNodes", "maxDepth", "maxPayloadBytes", "imageUrlSchemes", "openUrlSchemes"]);

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
  if (input.compatibility !== undefined && !isNonEmptyString(input.compatibility)) issues.push(issue("contract.type", "/compatibility", "compatibility must be a string when provided"));
  if (input.packageName !== undefined && !isNonEmptyString(input.packageName)) issues.push(issue("contract.type", "/packageName", "packageName must be a string when provided"));
  if (issues.length > 0 || !id || !version || !adaptiveCardsSdkVersion || !hostConfig || !stylesheet || !capabilities) return { ok: false, issues };
  return { ok: true, notices, value: { schemaVersion: 1, id, version, ...(typeof input.compatibility === "string" ? { compatibility: input.compatibility } : {}), ...(typeof input.packageName === "string" ? { packageName: input.packageName } : {}), adaptiveCardsSdkVersion, hostConfig, ...(theme ? { theme } : {}), stylesheet, ...(tokens ? { tokens } : {}), capabilities } };
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
  const maxAdaptiveCardVersion = isNonEmptyString(input.maxAdaptiveCardVersion) ? input.maxAdaptiveCardVersion : undefined;
  if (!maxAdaptiveCardVersion) issues.push(issue("contract.required", "/maxAdaptiveCardVersion", "maxAdaptiveCardVersion is required"));
  const allowedElements = stringArray("allowedElements");
  const allowedActions = stringArray("allowedActions");
  const imageUrlSchemes = stringArray("imageUrlSchemes");
  const openUrlSchemes = stringArray("openUrlSchemes");
  const maxNodes = numberValue("maxNodes");
  const maxDepth = numberValue("maxDepth");
  const maxPayloadBytes = numberValue("maxPayloadBytes");
  if (input.components !== undefined && !isJsonObject(input.components)) issues.push(issue("contract.type", "/components", "components must be an object"));
  if (input.utilities !== undefined && !isJsonObject(input.utilities)) issues.push(issue("contract.type", "/utilities", "utilities must be an object"));
  if (issues.length > 0 || !maxAdaptiveCardVersion || !allowedElements || !allowedActions || !imageUrlSchemes || !openUrlSchemes || !maxNodes || !maxDepth || !maxPayloadBytes) return { ok: false, issues };
  return { ok: true, notices, value: { schemaVersion: 1, maxAdaptiveCardVersion, allowedElements, allowedActions, ...(isJsonObject(input.components) ? { components: input.components } : {}), ...(isJsonObject(input.utilities) ? { utilities: input.utilities } : {}), ...(isJsonObject(input.utilityRules) ? { utilityRules: input.utilityRules as { maxTokensPerElement?: number } } : {}), maxNodes, maxDepth, maxPayloadBytes, imageUrlSchemes, openUrlSchemes } };
}
