import { issue, type DecodeIssue, type DecodeResult } from "./diagnostics.js";
import { isJsonObject, isNonEmptyString, type JsonObject } from "./json.js";
import { parseCardId, parseSemVer, isPinnedRenderProfileReference, type CardId, type CardKey, type Namespace, type PinnedRenderProfileReference, type SemVer } from "./identifiers.js";
import { isCardInspection, type CardInspection } from "./inspection.js";
import { decodeRenderCapabilities, decodeRenderProfileManifest, type RenderCapabilitiesV1, type RenderProfileManifestV1 } from "./render-profile.js";
import type { WireProfile } from "./card-source.js";

export const CARD_ARTIFACT_MEDIA_TYPE = "application/vnd.octo.card-artifact+json;version=1" as const;

export interface CardArtifactV1 {
  formatVersion: 1;
  mediaType: typeof CARD_ARTIFACT_MEDIA_TYPE;
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
  profile: {
    reference: PinnedRenderProfileReference;
    manifest: RenderProfileManifestV1;
    capabilities: RenderCapabilitiesV1;
  };
  dataContract: JsonObject;
  views: Record<string, {
    wireProfile: WireProfile;
    states?: string[];
    submit_actions?: string[];
    template: JsonObject;
    samples: Array<{ name: string; data: JsonObject; card: JsonObject; inspection: CardInspection }>;
  }>;
  validation: { valid: true; issues: DecodeIssue[] };
}

const VOLATILE_TOP_LEVEL_FIELDS = new Set(["generatedAt", "generatedBy", "repository", "commit", "pullRequestUrl", "environment", "absolutePath", "sourcePath"]);

function validateIssue(value: unknown, path: string, issues: DecodeIssue[]): DecodeIssue | undefined {
  if (!isJsonObject(value) || !isNonEmptyString(value.code) || !isNonEmptyString(value.path) || !isNonEmptyString(value.message)) {
    issues.push(issue("contract.type", path, "validation issue must contain code, path and message"));
    return undefined;
  }
  return value as unknown as DecodeIssue;
}

export function decodeCardArtifactV1(input: unknown): DecodeResult<CardArtifactV1> {
  const issues: DecodeIssue[] = [];
  if (!isJsonObject(input)) return { ok: false, issues: [issue("contract.root_type", "", "card artifact must be a JSON object")] };
  for (const field of VOLATILE_TOP_LEVEL_FIELDS) if (field in input) issues.push(issue("contract.invariant", `/${field}`, `${field} is not allowed in a canonical artifact`));
  if (input.formatVersion !== 1) issues.push(issue("contract.unsupported_version", "/formatVersion", "only artifact formatVersion 1 is supported"));
  if (input.mediaType !== CARD_ARTIFACT_MEDIA_TYPE) issues.push(issue("contract.enum", "/mediaType", `mediaType must be ${CARD_ARTIFACT_MEDIA_TYPE}`));

  const rawCard = input.card;
  let card: CardArtifactV1["card"] | undefined;
  if (!isJsonObject(rawCard)) {
    issues.push(issue("contract.required", "/card", "card is required"));
  } else {
    const parsedId = parseCardId(rawCard.id);
    const version = parseSemVer(rawCard.version);
    const contractVersion = parseSemVer(rawCard.contractVersion);
    if (!parsedId) issues.push(issue("contract.pattern", "/card/id", "card.id must match <namespace>.<card-key>"));
    if (!version) issues.push(issue("contract.pattern", "/card/version", "card.version must use SemVer"));
    if (!contractVersion) issues.push(issue("contract.pattern", "/card/contractVersion", "card.contractVersion must use SemVer"));
    for (const key of ["name", "adaptiveCardVersion", "defaultLocale"]) if (!isNonEmptyString(rawCard[key])) issues.push(issue("contract.required", `/card/${key}`, `${key} is required`));
    if (parsedId && version && contractVersion && isNonEmptyString(rawCard.name) && isNonEmptyString(rawCard.adaptiveCardVersion) && isNonEmptyString(rawCard.defaultLocale)) {
      card = { id: parsedId.value, namespace: parsedId.namespace, key: parsedId.key, name: rawCard.name, version, contractVersion, adaptiveCardVersion: rawCard.adaptiveCardVersion, defaultLocale: rawCard.defaultLocale };
    }
  }

  const rawProfile = input.profile;
  let profile: CardArtifactV1["profile"] | undefined;
  if (!isJsonObject(rawProfile)) {
    issues.push(issue("contract.required", "/profile", "profile is required"));
  } else {
    if (!isPinnedRenderProfileReference(rawProfile.reference)) issues.push(issue("contract.pattern", "/profile/reference", "artifact profile must pin an exact version"));
    const manifest = decodeRenderProfileManifest(rawProfile.manifest);
    const capabilities = decodeRenderCapabilities(rawProfile.capabilities);
    if (!manifest.ok) issues.push(...manifest.issues.map((item) => ({ ...item, path: `/profile/manifest${item.path}` })));
    if (!capabilities.ok) issues.push(...capabilities.issues.map((item) => ({ ...item, path: `/profile/capabilities${item.path}` })));
    if (manifest.ok && capabilities.ok && isPinnedRenderProfileReference(rawProfile.reference)) {
      const parsedReference = rawProfile.reference.split("@");
      if (parsedReference[0] !== manifest.value.id || parsedReference[1] !== manifest.value.version) issues.push(issue("contract.invariant", "/profile/reference", "profile reference must match profile manifest id@version"));
      else profile = { reference: rawProfile.reference, manifest: manifest.value, capabilities: capabilities.value };
    }
  }

  if (!isJsonObject(input.dataContract)) issues.push(issue("contract.required", "/dataContract", "dataContract must be an object"));
  const rawViews = input.views;
  const views: CardArtifactV1["views"] = {};
  const sampleNames = new Set<string>();
  if (!isJsonObject(rawViews) || Object.keys(rawViews).length === 0) {
    issues.push(issue("contract.required", "/views", "views must be a non-empty object"));
  } else {
    for (const [viewName, rawView] of Object.entries(rawViews)) {
      const path = `/views/${viewName.replaceAll("~", "~0").replaceAll("/", "~1")}`;
      if (!isJsonObject(rawView)) {
        issues.push(issue("contract.type", path, "view must be an object"));
        continue;
      }
      const wireProfile = rawView.wireProfile;
      if (wireProfile !== "octo/v1" && wireProfile !== "octo/v2") issues.push(issue("contract.enum", `${path}/wireProfile`, "wireProfile must be octo/v1 or octo/v2"));
      if (!isJsonObject(rawView.template)) issues.push(issue("contract.type", `${path}/template`, "template must be an object"));
      if (!Array.isArray(rawView.samples) || rawView.samples.length === 0) {
        issues.push(issue("contract.required", `${path}/samples`, "samples must be a non-empty array"));
        continue;
      }
      const samples: CardArtifactV1["views"][string]["samples"] = [];
      for (const [index, rawSample] of rawView.samples.entries()) {
        const samplePath = `${path}/samples/${index}`;
        if (!isJsonObject(rawSample) || !isNonEmptyString(rawSample.name) || !isJsonObject(rawSample.data) || !isJsonObject(rawSample.card) || !isCardInspection(rawSample.inspection)) {
          issues.push(issue("contract.type", samplePath, "sample must contain name, data, card and inspection"));
          continue;
        }
        if (sampleNames.has(rawSample.name)) issues.push(issue("contract.duplicate", `${samplePath}/name`, `sample name ${rawSample.name} is duplicated`));
        sampleNames.add(rawSample.name);
        samples.push({ name: rawSample.name, data: rawSample.data, card: rawSample.card, inspection: rawSample.inspection });
      }
      if (wireProfile === "octo/v1" || wireProfile === "octo/v2") views[viewName] = { wireProfile, ...(Array.isArray(rawView.states) ? { states: rawView.states as string[] } : {}), ...(Array.isArray(rawView.submit_actions) ? { submit_actions: rawView.submit_actions as string[] } : {}), template: (rawView.template ?? {}) as JsonObject, samples };
    }
  }

  const rawValidation = input.validation;
  let validation: CardArtifactV1["validation"] | undefined;
  if (!isJsonObject(rawValidation) || rawValidation.valid !== true || !Array.isArray(rawValidation.issues)) {
    issues.push(issue("contract.invariant", "/validation", "artifact validation must be { valid: true, issues: [] }"));
  } else {
    const validationIssues = rawValidation.issues.flatMap((item, index) => validateIssue(item, `/validation/issues/${index}`, issues) ?? []);
    validation = { valid: true, issues: validationIssues };
  }

  if (issues.length > 0 || !card || !profile || !isJsonObject(input.dataContract) || !validation) return { ok: false, issues };
  return { ok: true, notices: [], value: { formatVersion: 1, mediaType: CARD_ARTIFACT_MEDIA_TYPE, card, profile, dataContract: input.dataContract, views, validation } };
}
