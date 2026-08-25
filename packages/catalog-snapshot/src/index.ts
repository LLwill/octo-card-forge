import {
  CARD_ARTIFACT_MEDIA_TYPE,
  CATALOG_SNAPSHOT_MEDIA_TYPE,
  decodeCardArtifactV1,
  decodeCatalogSnapshotV1,
  issue,
  parseCardId,
  parseSemVer,
  type CardArtifactV1,
  type CatalogSnapshotV1,
  type DecodeIssue,
  type JsonObject,
  type JsonValue,
} from "@mlt-org/octo-card-spec";

export type { CardArtifactV1, CatalogSnapshotV1 } from "@mlt-org/octo-card-spec";

export interface CatalogReleaseRecord {
  card: {
    id: string;
    name: string;
    version: string;
    contractVersion: string;
    renderProfile: string;
    defaultLocale: string;
  };
  artifact: { url: string; sha256: string; mediaType?: string };
  handoff?: { url: string; sha256: string };
  source: {
    repository: string;
    commit: string;
    path: string;
    pullRequestUrl?: string;
  };
  release?: { tag: string; url: string };
}

export interface BuildCatalogSnapshotOptions {
  channel: "release" | "preview";
  revision: string;
  records: CatalogReleaseRecord[];
}

export class CatalogSnapshotBuildError extends Error {
  readonly issues: DecodeIssue[];

  constructor(issues: DecodeIssue[]) {
    super(`Catalog snapshot build failed: ${issues.map((item) => item.message).join("; ")}`);
    this.name = "CatalogSnapshotBuildError";
    this.issues = issues;
  }
}

export class CatalogArtifactParseError extends Error {
  readonly issues: DecodeIssue[];

  constructor(issues: DecodeIssue[]) {
    super(`Card artifact parse failed: ${issues.map((item) => item.message).join("; ")}`);
    this.name = "CatalogArtifactParseError";
    this.issues = issues;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareIdentifier(left: string, right: string): number {
  const leftNumber = /^\d+$/.test(left);
  const rightNumber = /^\d+$/.test(right);
  if (leftNumber && rightNumber) {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  }
  if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
  return compareText(left, right);
}

/** SemVer precedence comparator. Build metadata is intentionally unsupported by the v1 contract. */
export function compareCatalogVersions(left: string, right: string): number {
  if (!parseSemVer(left) || !parseSemVer(right)) {
    throw new TypeError(`Catalog versions must use SemVer: ${left}, ${right}`);
  }
  const [leftCore, leftPre] = left.split("-", 2);
  const [rightCore, rightPre] = right.split("-", 2);
  const leftParts = leftCore.split(".");
  const rightParts = rightCore.split(".");
  for (let index = 0; index < 3; index++) {
    const difference = compareIdentifier(leftParts[index], rightParts[index]);
    if (difference !== 0) return difference;
  }
  if (leftPre === undefined || rightPre === undefined) {
    return leftPre === rightPre ? 0 : leftPre === undefined ? 1 : -1;
  }
  const leftIdentifiers = leftPre.split(".");
  const rightIdentifiers = rightPre.split(".");
  const length = Math.max(leftIdentifiers.length, rightIdentifiers.length);
  for (let index = 0; index < length; index++) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === rightIdentifier ? 0 : leftIdentifier === undefined ? -1 : 1;
    }
    const difference = compareIdentifier(leftIdentifier, rightIdentifier);
    if (difference !== 0) return difference;
  }
  return 0;
}

function canonicalValue(value: unknown, path: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain a finite JSON number`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalValue(item, `${path}/${index}`));
  }
  if (typeof value !== "object") throw new TypeError(`${path} contains a non-JSON value`);
  const result: JsonObject = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const pointer = key.replaceAll("~", "~0").replaceAll("/", "~1");
    result[key] = canonicalValue((value as Record<string, unknown>)[key], `${path}/${pointer}`);
  }
  return result;
}

function decodedSnapshot(input: unknown): CatalogSnapshotV1 {
  const result = decodeCatalogSnapshotV1(input);
  if (!result.ok) throw new CatalogSnapshotBuildError(result.issues);
  return result.value;
}

export function buildCatalogSnapshot(options: BuildCatalogSnapshotOptions): CatalogSnapshotV1 {
  const grouped = new Map<string, {
    name: string;
    defaultLocale: string;
    records: CatalogReleaseRecord[];
  }>();
  const issues: DecodeIssue[] = [];
  const seen = new Set<string>();

  for (const [index, record] of options.records.entries()) {
    const recordPath = `/records/${index}`;
    const key = `${record.card.id}@${record.card.version}`;
    if (seen.has(key)) {
      issues.push(issue("contract.duplicate", `${recordPath}/card/version`, `duplicate release record ${key}`));
      continue;
    }
    seen.add(key);
    const group = grouped.get(record.card.id);
    if (group) {
      if (group.name !== record.card.name) {
        issues.push(issue("contract.invariant", `${recordPath}/card/name`, `card name conflicts for ${record.card.id}`));
      }
      if (group.defaultLocale !== record.card.defaultLocale) {
        issues.push(issue("contract.invariant", `${recordPath}/card/defaultLocale`, `default locale conflicts for ${record.card.id}`));
      }
      group.records.push(record);
    } else {
      grouped.set(record.card.id, {
        name: record.card.name,
        defaultLocale: record.card.defaultLocale,
        records: [record],
      });
    }
  }

  if (issues.length > 0) throw new CatalogSnapshotBuildError(issues);

  const cards = [...grouped.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([id, group]) => {
      const parsedId = parseCardId(id);
      const records = [...group.records].sort((left, right) =>
        compareCatalogVersions(right.card.version, left.card.version)
      );
      return {
        id,
        namespace: parsedId?.namespace,
        key: parsedId?.key,
        name: group.name,
        defaultLocale: group.defaultLocale,
        latest: records[0]?.card.version,
        versions: records.map((record) => ({
          reference: `${record.card.id}@${record.card.version}`,
          version: record.card.version,
          contractVersion: record.card.contractVersion,
          renderProfile: record.card.renderProfile,
          artifact: {
            url: record.artifact.url,
            sha256: record.artifact.sha256,
            mediaType: record.artifact.mediaType ?? CARD_ARTIFACT_MEDIA_TYPE,
          },
          ...(record.handoff ? { handoff: record.handoff } : {}),
          source: record.source,
          ...(record.release ? { release: record.release } : {}),
        })),
      };
    });

  return decodedSnapshot({
    formatVersion: 1,
    mediaType: CATALOG_SNAPSHOT_MEDIA_TYPE,
    channel: options.channel,
    revision: options.revision,
    cards,
  });
}

/** Compact UTF-8 JSON with recursively sorted object keys and stable array order. */
export function canonicalCatalogSnapshotBytes(input: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(canonicalValue(decodedSnapshot(input), "")));
}

export function parseCatalogSnapshot(input: unknown): CatalogSnapshotV1 {
  if (typeof input === "string") return decodedSnapshot(JSON.parse(input));
  if (input instanceof Uint8Array) {
    return decodedSnapshot(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input)));
  }
  return decodedSnapshot(input);
}

export function parseCardArtifact(input: unknown): CardArtifactV1 {
  let parsed = input;
  if (typeof input === "string") parsed = JSON.parse(input);
  if (input instanceof Uint8Array) {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input));
  }
  const result = decodeCardArtifactV1(parsed);
  if (!result.ok) throw new CatalogArtifactParseError(result.issues);
  return result.value;
}

/** Canonical artifact bytes use the same recursive key ordering as snapshot bytes. */
export function canonicalCardArtifactBytes(input: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(canonicalValue(parseCardArtifact(input), "")));
}
