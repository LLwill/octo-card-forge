import { issue, type DecodeIssue, type DecodeResult } from "./diagnostics.js";
import { isJsonObject, isNonEmptyString } from "./json.js";
import { parseCardId, parseRenderProfileReference, parseSemVer, type CardId, type CardKey, type Namespace, type SemVer } from "./identifiers.js";

export const CATALOG_SNAPSHOT_MEDIA_TYPE = "application/vnd.octo.card-catalog-snapshot+json;version=1" as const;

export interface CatalogSnapshotV1 {
  formatVersion: 1;
  mediaType: typeof CATALOG_SNAPSHOT_MEDIA_TYPE;
  channel: "release" | "preview";
  revision: string;
  cards: Array<{
    id: CardId;
    namespace: Namespace;
    key: CardKey;
    name: string;
    defaultLocale: string;
    latest?: SemVer;
    versions: Array<{
      reference: string;
      version: SemVer;
      contractVersion: SemVer;
      renderProfile: string;
      artifact: { url: string; sha256: string; mediaType: string };
      handoff?: { url: string; sha256: string };
      source: { repository: string; commit: string; path: string; pullRequestUrl?: string };
      release?: { tag: string; url: string };
    }>;
  }>;
}

const SHA256 = /^[a-f0-9]{64}$/;

function requiredString(value: unknown, path: string, issues: DecodeIssue[]): string | undefined {
  if (!isNonEmptyString(value)) {
    issues.push(issue("contract.required", path, "value must be a non-empty string"));
    return undefined;
  }
  return value;
}

export function decodeCatalogSnapshotV1(input: unknown): DecodeResult<CatalogSnapshotV1> {
  const issues: DecodeIssue[] = [];
  if (!isJsonObject(input)) return { ok: false, issues: [issue("contract.root_type", "", "catalog snapshot must be a JSON object")] };
  if (input.formatVersion !== 1) issues.push(issue("contract.unsupported_version", "/formatVersion", "only snapshot formatVersion 1 is supported"));
  if (input.mediaType !== CATALOG_SNAPSHOT_MEDIA_TYPE) issues.push(issue("contract.enum", "/mediaType", `mediaType must be ${CATALOG_SNAPSHOT_MEDIA_TYPE}`));
  if (input.channel !== "release" && input.channel !== "preview") issues.push(issue("contract.enum", "/channel", "channel must be release or preview"));
  const revision = requiredString(input.revision, "/revision", issues);
  if (!Array.isArray(input.cards)) issues.push(issue("contract.type", "/cards", "cards must be an array"));
  const cards: CatalogSnapshotV1["cards"] = [];
  const cardIds = new Set<string>();
  if (Array.isArray(input.cards)) {
    for (const [cardIndex, rawCard] of input.cards.entries()) {
      const cardPath = `/cards/${cardIndex}`;
      if (!isJsonObject(rawCard)) { issues.push(issue("contract.type", cardPath, "card index must be an object")); continue; }
      const parsedId = parseCardId(rawCard.id);
      if (!parsedId) { issues.push(issue("contract.pattern", `${cardPath}/id`, "id must match <namespace>.<card-key>")); continue; }
      if (cardIds.has(parsedId.value)) issues.push(issue("contract.duplicate", `${cardPath}/id`, `duplicate card id ${parsedId.value}`));
      cardIds.add(parsedId.value);
      for (const key of ["name", "defaultLocale"]) requiredString(rawCard[key], `${cardPath}/${key}`, issues);
      if (!Array.isArray(rawCard.versions) || rawCard.versions.length === 0) { issues.push(issue("contract.required", `${cardPath}/versions`, "versions must be a non-empty array")); continue; }
      const versions: CatalogSnapshotV1["cards"][number]["versions"] = [];
      const seenVersions = new Set<string>();
      for (const [versionIndex, rawVersion] of rawCard.versions.entries()) {
        const versionPath = `${cardPath}/versions/${versionIndex}`;
        if (!isJsonObject(rawVersion)) { issues.push(issue("contract.type", versionPath, "version must be an object")); continue; }
        const version = parseSemVer(rawVersion.version);
        const contractVersion = parseSemVer(rawVersion.contractVersion);
        const reference = requiredString(rawVersion.reference, `${versionPath}/reference`, issues);
        const renderProfile = requiredString(rawVersion.renderProfile, `${versionPath}/renderProfile`, issues);
        if (!version) issues.push(issue("contract.pattern", `${versionPath}/version`, "version must use SemVer"));
        if (!contractVersion) issues.push(issue("contract.pattern", `${versionPath}/contractVersion`, "contractVersion must use SemVer"));
        const parsedReference = reference?.split("@");
        if (!version || !contractVersion || !reference || !renderProfile) continue;
        if (parsedReference?.length !== 2 || parsedReference[0] !== parsedId.value || parsedReference[1] !== version) issues.push(issue("contract.invariant", `${versionPath}/reference`, "reference must equal card id@version"));
        if (!parseRenderProfileReference(renderProfile)) issues.push(issue("contract.pattern", `${versionPath}/renderProfile`, "renderProfile must use id@version or id@latest"));
        if (seenVersions.has(version)) issues.push(issue("contract.duplicate", `${versionPath}/version`, `duplicate version ${version}`));
        seenVersions.add(version);
        const artifact = rawVersion.artifact;
        if (!isJsonObject(artifact) || !isNonEmptyString(artifact.url) || !isNonEmptyString(artifact.sha256) || !SHA256.test(artifact.sha256) || !isNonEmptyString(artifact.mediaType)) issues.push(issue("contract.type", `${versionPath}/artifact`, "artifact requires url, sha256 and mediaType with a 64-character lowercase digest"));
        const source = rawVersion.source;
        if (!isJsonObject(source) || !isNonEmptyString(source.repository) || !isNonEmptyString(source.commit) || !isNonEmptyString(source.path)) issues.push(issue("contract.type", `${versionPath}/source`, "source requires repository, commit and path"));
        const handoff = rawVersion.handoff;
        if (handoff !== undefined && (!isJsonObject(handoff) || !isNonEmptyString(handoff.url) || !isNonEmptyString(handoff.sha256) || !SHA256.test(handoff.sha256))) issues.push(issue("contract.type", `${versionPath}/handoff`, "handoff sha256 must be a 64-character lowercase digest"));
        const release = rawVersion.release;
        if (input.channel === "release" && (!isJsonObject(release) || !isNonEmptyString(release.tag) || !isNonEmptyString(release.url))) issues.push(issue("contract.invariant", `${versionPath}/release`, "release snapshots require release tag and url"));
        if (isJsonObject(artifact) && isNonEmptyString(artifact.url) && isNonEmptyString(artifact.sha256) && isNonEmptyString(artifact.mediaType) && SHA256.test(artifact.sha256) && isJsonObject(source) && isNonEmptyString(source.repository) && isNonEmptyString(source.commit) && isNonEmptyString(source.path)) {
          versions.push({ reference, version, contractVersion, renderProfile, artifact: { url: artifact.url, sha256: artifact.sha256, mediaType: artifact.mediaType }, ...(isJsonObject(handoff) && isNonEmptyString(handoff.url) && isNonEmptyString(handoff.sha256) && SHA256.test(handoff.sha256) ? { handoff: { url: handoff.url, sha256: handoff.sha256 } } : {}), source: { repository: source.repository, commit: source.commit, path: source.path, ...(isNonEmptyString(source.pullRequestUrl) ? { pullRequestUrl: source.pullRequestUrl } : {}) }, ...(isJsonObject(release) && isNonEmptyString(release.tag) && isNonEmptyString(release.url) ? { release: { tag: release.tag, url: release.url } } : {}) });
        }
      }
      const latest = rawCard.latest === undefined ? undefined : parseSemVer(rawCard.latest);
      if (rawCard.latest !== undefined && !latest) issues.push(issue("contract.pattern", `${cardPath}/latest`, "latest must use SemVer"));
      if (latest && !versions.some((item) => item.version === latest)) issues.push(issue("contract.invariant", `${cardPath}/latest`, "latest must refer to a version in versions"));
      if (isNonEmptyString(rawCard.name) && isNonEmptyString(rawCard.defaultLocale) && versions.length > 0) cards.push({ id: parsedId.value, namespace: parsedId.namespace, key: parsedId.key, name: rawCard.name, defaultLocale: rawCard.defaultLocale, ...(latest ? { latest } : {}), versions });
    }
  }
  if (issues.length > 0 || !revision || (input.channel !== "release" && input.channel !== "preview")) return { ok: false, issues };
  return { ok: true, notices: [], value: { formatVersion: 1, mediaType: CATALOG_SNAPSHOT_MEDIA_TYPE, channel: input.channel, revision, cards } };
}
