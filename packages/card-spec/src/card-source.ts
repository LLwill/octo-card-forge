import { issue, parseOrThrow, type DecodeIssue, type DecodeResult } from "./diagnostics.js";
import { isJsonObject, isNonEmptyString, type JsonObject } from "./json.js";
import {
  isPinnedRenderProfileReference,
  parseCardId,
  parseRenderProfileReference,
  parseSemVer,
  type CardId,
  type CardKey,
  type Namespace,
  type SemVer,
} from "./identifiers.js";

export type WireProfile = "octo/v1" | "octo/v2";

export interface CardViewDefinition {
  wireProfile: WireProfile;
  template: string;
  samples: string[];
  states?: string[];
  submit_actions?: string[];
}

export interface CardSourceManifestV2 {
  schemaVersion: 2;
  id: CardId;
  name: string;
  /** Drafts keep this as a version hint; release identity is id@version. */
  version: SemVer;
  contractVersion: SemVer;
  adaptiveCardVersion: string;
  renderProfile?: string;
  renderProfileCompatibility?: string;
  defaultLocale: string;
  views: Record<string, CardViewDefinition>;
  dataSchema: string;
}

export type CardManifest = CardSourceManifestV2;

export interface ResolvedCardSourceV1 {
  formatVersion: 1;
  card: {
    id: CardId;
    namespace: Namespace;
    key: CardKey;
    name: string;
    version: SemVer;
    contractVersion: SemVer;
    adaptiveCardVersion: string;
    defaultLocale: string;
  };
  dataContract: JsonObject;
  views: Record<string, {
    wireProfile: WireProfile;
    states?: string[];
    submit_actions?: string[];
    template: JsonObject;
    samples: Array<{ name: string; data: JsonObject }>;
  }>;
}

const ROOT_KEYS = new Set([
  "schemaVersion", "id", "name", "version", "contractVersion", "adaptiveCardVersion",
  "renderProfile", "renderProfileCompatibility", "defaultLocale", "views", "dataSchema",
]);
const VIEW_KEYS = new Set(["wireProfile", "template", "samples", "states", "submit_actions"]);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ADAPTIVE_CARD_VERSION = /^\d+\.\d+$/;

function checkUnknownKeys(value: JsonObject, keys: Set<string>, path: string, issues: DecodeIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) issues.push(issue("contract.unknown_property", `${path}/${escapePointer(key)}`, `unknown property ${key}`));
  }
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function requiredString(value: JsonObject, key: string, path: string, issues: DecodeIssue[], pattern?: RegExp): string | undefined {
  const candidate = value[key];
  if (!isNonEmptyString(candidate)) {
    issues.push(issue("contract.required", `${path}/${key}`, `${key} must be a non-empty string`));
    return undefined;
  }
  if (pattern && !pattern.test(candidate)) {
    issues.push(issue("contract.pattern", `${path}/${key}`, `${key} has an invalid format`));
    return undefined;
  }
  return candidate;
}

function packageRelativePath(value: JsonObject, key: string, path: string, issues: DecodeIssue[]): string | undefined {
  const candidate = requiredString(value, key, path, issues);
  if (!candidate) return undefined;
  if (candidate.startsWith("/") || candidate.includes("\\") || candidate.split("/").some((part) => part === "" || part === "." || part === "..")) {
    issues.push(issue("contract.pattern", `${path}/${key}`, `${key} must be a non-empty POSIX relative path`));
    return undefined;
  }
  return candidate;
}

function stringArray(value: unknown, path: string, issues: DecodeIssue[], allowEmpty: boolean): string[] | undefined {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => !isNonEmptyString(item))) {
    issues.push(issue("contract.type", path, `value must be a ${allowEmpty ? "" : "non-empty "}string array`));
    return undefined;
  }
  return value as string[];
}

function decodeViews(value: unknown, issues: DecodeIssue[]): Record<string, CardViewDefinition> | undefined {
  if (!isJsonObject(value) || Object.keys(value).length === 0) {
    issues.push(issue("contract.required", "/views", "views must be a non-empty object"));
    return undefined;
  }
  const views: Record<string, CardViewDefinition> = {};
  const sampleOwners = new Map<string, string>();
  for (const [viewName, rawView] of Object.entries(value)) {
    const path = `/views/${escapePointer(viewName)}`;
    if (!isJsonObject(rawView)) {
      issues.push(issue("contract.type", path, "view must be an object"));
      continue;
    }
    checkUnknownKeys(rawView, VIEW_KEYS, path, issues);
    const wireProfile = rawView.wireProfile;
    if (wireProfile !== "octo/v1" && wireProfile !== "octo/v2") {
      issues.push(issue("contract.enum", `${path}/wireProfile`, "wireProfile must be octo/v1 or octo/v2"));
    }
    const template = packageRelativePath(rawView, "template", path, issues);
    const samples = stringArray(rawView.samples, `${path}/samples`, issues, false);
    const states = rawView.states === undefined ? undefined : stringArray(rawView.states, `${path}/states`, issues, false);
    const submitActions = rawView.submit_actions === undefined ? undefined : stringArray(rawView.submit_actions, `${path}/submit_actions`, issues, true);
    if (!template || !samples || (wireProfile !== "octo/v1" && wireProfile !== "octo/v2")) continue;
    for (const sample of samples) {
      const sampleName = sample.split("/").at(-1)!.replace(/\.[^.]*$/, "");
      const owner = sampleOwners.get(sampleName);
      if (owner) issues.push(issue("contract.duplicate", `${path}/samples`, `sample basename ${sampleName} is already used by view ${owner}`));
      else sampleOwners.set(sampleName, viewName);
    }
    views[viewName] = {
      wireProfile,
      template,
      samples,
      ...(states ? { states: [...new Set(states)] } : {}),
      ...(submitActions ? { submit_actions: submitActions } : {}),
    };
    if (states && new Set(states).size !== states.length) issues.push(issue("contract.duplicate", `${path}/states`, "states must be unique"));
  }
  return views;
}

export function decodeCardSourceManifest(input: unknown): DecodeResult<CardSourceManifestV2> {
  const issues: DecodeIssue[] = [];
  if (!isJsonObject(input)) return { ok: false, issues: [issue("contract.root_type", "", "manifest must be a JSON object")] };
  checkUnknownKeys(input, ROOT_KEYS, "", issues);
  if (input.schemaVersion !== 2) issues.push(issue("contract.unsupported_version", "/schemaVersion", "only card manifest schemaVersion 2 is supported"));
  const parsedId = parseCardId(input.id);
  if (!parsedId) issues.push(issue("contract.pattern", "/id", "id must match <namespace>.<card-key>"));
  const name = requiredString(input, "name", "", issues);
  const version = requiredString(input, "version", "", issues, SEMVER);
  const contractVersion = requiredString(input, "contractVersion", "", issues, SEMVER);
  const adaptiveCardVersion = requiredString(input, "adaptiveCardVersion", "", issues, ADAPTIVE_CARD_VERSION);
  const defaultLocale = requiredString(input, "defaultLocale", "", issues);
  const dataSchema = packageRelativePath(input, "dataSchema", "", issues);
  const views = decodeViews(input.views, issues);
  if (input.renderProfile !== undefined) {
    if (!isNonEmptyString(input.renderProfile) || !parseRenderProfileReference(input.renderProfile)) issues.push(issue("contract.pattern", "/renderProfile", "renderProfile must use id@latest or id@x.y.z"));
  }
  if (input.renderProfileCompatibility !== undefined && !isNonEmptyString(input.renderProfileCompatibility)) issues.push(issue("contract.type", "/renderProfileCompatibility", "renderProfileCompatibility must be a non-empty string"));
  if (issues.length > 0 || !parsedId || !name || !version || !contractVersion || !adaptiveCardVersion || !defaultLocale || !dataSchema || !views) return { ok: false, issues };
  return {
    ok: true,
    notices: [],
    value: {
      schemaVersion: 2,
      id: parsedId.value,
      name,
      version: version as SemVer,
      contractVersion: contractVersion as SemVer,
      adaptiveCardVersion,
      ...(typeof input.renderProfile === "string" ? { renderProfile: input.renderProfile } : {}),
      ...(typeof input.renderProfileCompatibility === "string" ? { renderProfileCompatibility: input.renderProfileCompatibility } : {}),
      defaultLocale,
      views,
      dataSchema,
    },
  };
}

export function parseCardSourceManifest(input: unknown): CardSourceManifestV2 {
  return parseOrThrow("CardSourceManifestV2", decodeCardSourceManifest(input));
}

export function validateCardManifestPolicy(manifest: CardSourceManifestV2, options: { kind: "draft" | "release" }): DecodeIssue[] {
  if (options.kind === "draft") return [];
  if (!manifest.renderProfile || !isPinnedRenderProfileReference(manifest.renderProfile)) {
    return [issue("contract.invariant", "/renderProfile", "release manifest must pin an exact render profile version")];
  }
  return [];
}

export function decodeResolvedCardSourceV1(input: unknown): DecodeResult<ResolvedCardSourceV1> {
  const issues: DecodeIssue[] = [];
  if (!isJsonObject(input)) return { ok: false, issues: [issue("contract.root_type", "", "resolved card source must be a JSON object")] };
  if (input.formatVersion !== 1) issues.push(issue("contract.unsupported_version", "/formatVersion", "only resolved card source formatVersion 1 is supported"));
  const rawCard = input.card;
  let card: ResolvedCardSourceV1["card"] | undefined;
  if (!isJsonObject(rawCard)) {
    issues.push(issue("contract.required", "/card", "card is required"));
  } else {
    const parsedId = parseCardId(rawCard.id);
    const version = parseSemVer(rawCard.version);
    const contractVersion = parseSemVer(rawCard.contractVersion);
    if (!parsedId) issues.push(issue("contract.pattern", "/card/id", "card.id must match <namespace>.<card-key>"));
    if (!version) issues.push(issue("contract.pattern", "/card/version", "card.version must use SemVer"));
    if (!contractVersion) issues.push(issue("contract.pattern", "/card/contractVersion", "card.contractVersion must use SemVer"));
    for (const key of ["namespace", "key", "name", "adaptiveCardVersion", "defaultLocale"]) if (!isNonEmptyString(rawCard[key])) issues.push(issue("contract.required", `/card/${key}`, `${key} is required`));
    if (parsedId && isNonEmptyString(rawCard.namespace) && rawCard.namespace !== parsedId.namespace) issues.push(issue("contract.invariant", "/card/namespace", "namespace must match card id"));
    if (parsedId && isNonEmptyString(rawCard.key) && rawCard.key !== parsedId.key) issues.push(issue("contract.invariant", "/card/key", "key must match card id"));
    if (parsedId && version && contractVersion && isNonEmptyString(rawCard.name) && isNonEmptyString(rawCard.adaptiveCardVersion) && isNonEmptyString(rawCard.defaultLocale)) card = { id: parsedId.value, namespace: parsedId.namespace, key: parsedId.key, name: rawCard.name, version, contractVersion, adaptiveCardVersion: rawCard.adaptiveCardVersion, defaultLocale: rawCard.defaultLocale };
  }
  if (!isJsonObject(input.dataContract)) issues.push(issue("contract.required", "/dataContract", "dataContract must be an object"));
  const rawViews = input.views;
  const views: ResolvedCardSourceV1["views"] = {};
  const sampleNames = new Set<string>();
  if (!isJsonObject(rawViews) || Object.keys(rawViews).length === 0) {
    issues.push(issue("contract.required", "/views", "views must be a non-empty object"));
  } else {
    for (const [viewName, rawView] of Object.entries(rawViews)) {
      const path = `/views/${escapePointer(viewName)}`;
      if (!isJsonObject(rawView)) { issues.push(issue("contract.type", path, "view must be an object")); continue; }
      const wireProfile = rawView.wireProfile;
      if (wireProfile !== "octo/v1" && wireProfile !== "octo/v2") issues.push(issue("contract.enum", `${path}/wireProfile`, "wireProfile must be octo/v1 or octo/v2"));
      if (!isJsonObject(rawView.template)) issues.push(issue("contract.type", `${path}/template`, "template must be an object"));
      const states = rawView.states;
      if (states !== undefined && (!Array.isArray(states) || states.length === 0 || states.some((item) => !isNonEmptyString(item)))) issues.push(issue("contract.type", `${path}/states`, "states must be a non-empty string array when provided"));
      const submitActions = rawView.submit_actions;
      if (submitActions !== undefined && (!Array.isArray(submitActions) || submitActions.some((item) => !isNonEmptyString(item)))) issues.push(issue("contract.type", `${path}/submit_actions`, "submit_actions must be a string array when provided"));
      if (!Array.isArray(rawView.samples) || rawView.samples.length === 0) { issues.push(issue("contract.required", `${path}/samples`, "samples must be a non-empty array")); continue; }
      const samples: ResolvedCardSourceV1["views"][string]["samples"] = [];
      for (const [index, rawSample] of rawView.samples.entries()) {
        const samplePath = `${path}/samples/${index}`;
        if (!isJsonObject(rawSample) || !isNonEmptyString(rawSample.name) || !isJsonObject(rawSample.data)) { issues.push(issue("contract.type", samplePath, "sample must contain a name and object data")); continue; }
        if (sampleNames.has(rawSample.name)) issues.push(issue("contract.duplicate", `${samplePath}/name`, `sample name ${rawSample.name} is duplicated`));
        sampleNames.add(rawSample.name);
        samples.push({ name: rawSample.name, data: rawSample.data });
      }
      if (wireProfile === "octo/v1" || wireProfile === "octo/v2") views[viewName] = { wireProfile, ...(Array.isArray(states) && states.every(isNonEmptyString) ? { states: states as string[] } : {}), ...(Array.isArray(submitActions) && submitActions.every(isNonEmptyString) ? { submit_actions: submitActions as string[] } : {}), template: (rawView.template ?? {}) as JsonObject, samples };
    }
  }
  if (issues.length > 0 || !card || !isJsonObject(input.dataContract) || Object.keys(views).length === 0) return { ok: false, issues };
  return { ok: true, notices: [], value: { formatVersion: 1, card, dataContract: input.dataContract, views } };
}

export function parseResolvedCardSourceV1(input: unknown): ResolvedCardSourceV1 {
  return parseOrThrow("ResolvedCardSourceV1", decodeResolvedCardSourceV1(input));
}
