import { createHash } from "node:crypto";
import {
  CARD_ARTIFACT_MEDIA_TYPE,
  decodeCardArtifactV1,
  decodeRenderCapabilities,
  decodeRenderProfileManifest,
  decodeResolvedCardSourceV1,
  isPinnedRenderProfileReference,
  parseOrThrow,
  type ArtifactValidationIssue,
  type CardArtifactV1,
  type DecodeIssue,
  type JsonObject,
  type JsonValue,
  type PinnedRenderProfileReference,
  type RenderCapabilitiesV1,
  type RenderProfileManifestV1,
  type ResolvedCardSourceV1,
} from "@mlt-org/octo-card-spec";
import {
  compileCardSource,
  type RenderCapabilities,
  type ValidationIssue,
} from "@mlt-org/octo-card-core";

export interface BuildCardArtifactOptions {
  source: ResolvedCardSourceV1;
  profile: {
    reference: string;
    manifest: RenderProfileManifestV1;
    capabilities: RenderCapabilitiesV1;
  };
}

export interface ArtifactBuildIssue extends ValidationIssue {
  details: {
    view: string;
    sample: string;
  };
}

export class ArtifactBuildError extends Error {
  readonly issues: ArtifactBuildIssue[];

  constructor(issues: ArtifactBuildIssue[]) {
    super(
      `Card Artifact build failed: ${issues
        .map((item) => `${item.details.view}/${item.details.sample}: ${item.message}`)
        .join("; ")}`
    );
    this.name = "ArtifactBuildError";
    this.issues = issues;
  }
}

export interface ArtifactVerificationIssue {
  code: string;
  path: string;
  message: string;
}

export interface CardArtifactVerification {
  valid: boolean;
  artifact?: CardArtifactV1;
  sha256?: string;
  issues: ArtifactVerificationIssue[];
}

function pinnedProfileReference(
  reference: string,
  manifest: RenderProfileManifestV1
): PinnedRenderProfileReference {
  if (!isPinnedRenderProfileReference(reference)) {
    throw new Error("Card Artifact requires an exact Render Profile reference");
  }
  if (reference !== `${manifest.id}@${manifest.version}`) {
    throw new Error(
      `Render Profile reference ${reference} does not match ${manifest.id}@${manifest.version}`
    );
  }
  return reference;
}

function withSampleDetails(
  issue: ValidationIssue,
  view: string,
  sample: string
): ArtifactBuildIssue {
  return { ...issue, details: { view, sample } };
}

function asArtifactWarning(issue: ArtifactBuildIssue): ArtifactValidationIssue {
  return {
    severity: "warning",
    code: issue.code,
    path: issue.path,
    message: issue.message,
    details: issue.details,
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Build the immutable, path-free Artifact from already resolved inputs. */
export function buildCardArtifact(options: BuildCardArtifactOptions): CardArtifactV1 {
  const source = parseOrThrow(
    "ResolvedCardSourceV1",
    decodeResolvedCardSourceV1(options.source)
  );
  const manifest = parseOrThrow(
    "RenderProfileManifestV1",
    decodeRenderProfileManifest(options.profile.manifest)
  );
  const capabilities = parseOrThrow(
    "RenderCapabilitiesV1",
    decodeRenderCapabilities(options.profile.capabilities)
  );
  // The Contract decoder has validated the component and utility definitions;
  // its public type intentionally exposes those extensible maps as unknown.
  const runtimeCapabilities = capabilities as RenderCapabilities;
  const reference = pinnedProfileReference(options.profile.reference, manifest);
  const views: CardArtifactV1["views"] = {};
  const warnings: ArtifactValidationIssue[] = [];
  const errors: ArtifactBuildIssue[] = [];

  for (const [viewName, view] of Object.entries(source.views).sort(([left], [right]) =>
    compareText(left, right)
  )) {
    const samples: CardArtifactV1["views"][string]["samples"] = [];
    for (const sample of [...view.samples].sort((left, right) =>
      compareText(left.name, right.name)
    )) {
      const result = compileCardSource({
        source,
        view: viewName,
        data: sample.data,
        profile: { reference, capabilities: runtimeCapabilities },
      });
      const sampleIssues = result.issues.map((item) =>
        withSampleDetails(item, viewName, sample.name)
      );
      errors.push(...sampleIssues.filter((item) => item.severity === "error"));
      warnings.push(
        ...sampleIssues
          .filter((item) => item.severity === "warning")
          .map(asArtifactWarning)
      );
      samples.push({
        name: sample.name,
        data: sample.data,
        card: result.payload as JsonObject,
        inspection: result.inspection,
      });
    }
    views[viewName] = {
      wireProfile: view.wireProfile,
      ...(view.states ? { states: view.states } : {}),
      ...(view.submit_actions ? { submit_actions: view.submit_actions } : {}),
      template: view.template,
      samples,
    };
  }

  if (errors.length > 0) throw new ArtifactBuildError(errors);

  return parseOrThrow(
    "CardArtifactV1",
    decodeCardArtifactV1({
      formatVersion: 1,
      mediaType: CARD_ARTIFACT_MEDIA_TYPE,
      card: {
        id: source.card.id,
        name: source.card.name,
        version: source.card.version,
        contractVersion: source.card.contractVersion,
        adaptiveCardVersion: source.card.adaptiveCardVersion,
        defaultLocale: source.card.defaultLocale,
      },
      profile: { reference, manifest, capabilities },
      dataContract: source.dataContract,
      views,
      validation: { valid: true, issues: warnings },
    })
  );
}

function canonicalValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain a finite JSON number`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalValue(item, `${path}/${index}`));
  }
  if (typeof value !== "object") {
    throw new TypeError(`${path} contains a non-JSON value`);
  }
  const result: JsonObject = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    result[key] = canonicalValue(
      (value as Record<string, unknown>)[key],
      `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`
    );
  }
  return result;
}

/** Compact UTF-8 JSON with object keys sorted recursively and array order preserved. */
export function canonicalArtifactBytes(artifact: CardArtifactV1): Uint8Array {
  const decoded = parseOrThrow("CardArtifactV1", decodeCardArtifactV1(artifact));
  return new TextEncoder().encode(JSON.stringify(canonicalValue(decoded, "")));
}

export function artifactSha256(artifact: CardArtifactV1): string {
  return createHash("sha256").update(canonicalArtifactBytes(artifact)).digest("hex");
}

function parseArtifactInput(input: unknown): unknown {
  if (typeof input === "string") return JSON.parse(input);
  if (input instanceof Uint8Array) {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input));
  }
  return input;
}

/** Verify contract validity and, when supplied, the canonical SHA-256 digest. */
export function verifyCardArtifact(
  input: unknown,
  expectedSha256?: string
): CardArtifactVerification {
  let parsed: unknown;
  try {
    parsed = parseArtifactInput(input);
  } catch (error) {
    return {
      valid: false,
      issues: [{
        code: "artifact.invalid_json",
        path: "",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }

  const decoded = decodeCardArtifactV1(parsed);
  if (!decoded.ok) {
    return { valid: false, issues: decoded.issues.map(toVerificationIssue) };
  }

  const sha256 = artifactSha256(decoded.value);
  if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    return {
      valid: false,
      artifact: decoded.value,
      sha256,
      issues: [{
        code: "artifact.digest_format",
        path: "",
        message: "Expected SHA-256 must be 64 lowercase hexadecimal characters",
      }],
    };
  }
  if (expectedSha256 !== undefined && expectedSha256 !== sha256) {
    return {
      valid: false,
      artifact: decoded.value,
      sha256,
      issues: [{
        code: "artifact.digest_mismatch",
        path: "",
        message: `Expected SHA-256 ${expectedSha256}, received ${sha256}`,
      }],
    };
  }
  return { valid: true, artifact: decoded.value, sha256, issues: [] };
}

function toVerificationIssue(issue: DecodeIssue): ArtifactVerificationIssue {
  return { code: issue.code, path: issue.path, message: issue.message };
}
