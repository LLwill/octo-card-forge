import { issue, type DecodeIssue, type DecodeResult } from "./diagnostics.js";
import { isJsonObject, isNonEmptyString } from "./json.js";
import { parseCardId, parseRenderProfileReference, parseSemVer, type CardId, type CardKey, type Namespace, type SemVer } from "./identifiers.js";
import { CARD_ARTIFACT_MEDIA_TYPE } from "./artifact-v1.js";

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
const SNAPSHOT_KEYS = new Set(["formatVersion", "mediaType", "channel", "revision", "cards"]);
const CARD_KEYS = new Set(["id", "name", "defaultLocale", "latest", "versions"]);
const VERSION_KEYS = new Set(["reference", "version", "contractVersion", "renderProfile", "artifact", "handoff", "source", "release"]);
const ARTIFACT_KEYS = new Set(["url", "sha256", "mediaType"]);
const HANDOFF_KEYS = new Set(["url", "sha256"]);
const SOURCE_KEYS = new Set(["repository", "commit", "path", "pullRequestUrl"]);
const RELEASE_KEYS = new Set(["tag", "url"]);

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function unknownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: DecodeIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(issue("contract.unknown_property", `${path}/${escapePointer(key)}`, `unknown property ${key}`));
  }
}

function relativePath(value: unknown, path: string, issues: DecodeIssue[]): string | undefined {
  if (!isNonEmptyString(value) || value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    issues.push(issue("contract.pattern", path, "path must be a non-empty POSIX relative path"));
    return undefined;
  }
  return value;
}

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
  unknownKeys(input, SNAPSHOT_KEYS, "", issues);
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
      unknownKeys(rawCard, CARD_KEYS, cardPath, issues);
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
        unknownKeys(rawVersion, VERSION_KEYS, versionPath, issues);
        const version = parseSemVer(rawVersion.version);
        const contractVersion = parseSemVer(rawVersion.contractVersion);
        const reference = requiredString(rawVersion.reference, `${versionPath}/reference`, issues);
        const renderProfile = requiredString(rawVersion.renderProfile, `${versionPath}/renderProfile`, issues);
        if (!version) issues.push(issue("contract.pattern", `${versionPath}/version`, "version must use SemVer"));
        if (!contractVersion) issues.push(issue("contract.pattern", `${versionPath}/contractVersion`, "contractVersion must use SemVer"));
        const parsedReference = reference?.split("@");
        if (!version || !contractVersion || !reference || !renderProfile) continue;
        if (parsedReference?.length !== 2 || parsedReference[0] !== parsedId.value || parsedReference[1] !== version) issues.push(issue("contract.invariant", `${versionPath}/reference`, "reference must equal card id@version"));
        const parsedProfile = parseRenderProfileReference(renderProfile);
        if (!parsedProfile) issues.push(issue("contract.pattern", `${versionPath}/renderProfile`, "renderProfile must use id@version or id@latest"));
        else if (input.channel === "release" && parsedProfile.version === "latest") issues.push(issue("contract.invariant", `${versionPath}/renderProfile`, "release snapshots require an exact render profile version"));
        if (seenVersions.has(version)) issues.push(issue("contract.duplicate", `${versionPath}/version`, `duplicate version ${version}`));
        seenVersions.add(version);
        const artifact = rawVersion.artifact;
        if (!isJsonObject(artifact)) {
          issues.push(issue("contract.type", `${versionPath}/artifact`, "artifact requires url, sha256 and mediaType with a 64-character lowercase digest"));
        } else {
          unknownKeys(artifact, ARTIFACT_KEYS, `${versionPath}/artifact`, issues);
          if (!isNonEmptyString(artifact.url) || !isNonEmptyString(artifact.sha256) || !SHA256.test(artifact.sha256) || artifact.mediaType !== CARD_ARTIFACT_MEDIA_TYPE) issues.push(issue("contract.type", `${versionPath}/artifact`, `artifact requires url, sha256 and mediaType=${CARD_ARTIFACT_MEDIA_TYPE}`));
        }
        const source = rawVersion.source;
        let sourcePath: string | undefined;
        if (!isJsonObject(source)) {
          issues.push(issue("contract.type", `${versionPath}/source`, "source requires repository, commit and path"));
        } else {
          unknownKeys(source, SOURCE_KEYS, `${versionPath}/source`, issues);
          sourcePath = relativePath(source.path, `${versionPath}/source/path`, issues);
          if (!isNonEmptyString(source.repository) || !isNonEmptyString(source.commit) || !sourcePath) issues.push(issue("contract.type", `${versionPath}/source`, "source requires repository, commit and path"));
          if (source.pullRequestUrl !== undefined && !isNonEmptyString(source.pullRequestUrl)) issues.push(issue("contract.type", `${versionPath}/source/pullRequestUrl`, "pullRequestUrl must be a non-empty string"));
        }
        const handoff = rawVersion.handoff;
        if (handoff !== undefined) {
          if (!isJsonObject(handoff)) issues.push(issue("contract.type", `${versionPath}/handoff`, "handoff requires url and sha256"));
          else {
            unknownKeys(handoff, HANDOFF_KEYS, `${versionPath}/handoff`, issues);
            if (!isNonEmptyString(handoff.url) || !isNonEmptyString(handoff.sha256) || !SHA256.test(handoff.sha256)) issues.push(issue("contract.type", `${versionPath}/handoff`, "handoff sha256 must be a 64-character lowercase digest"));
          }
        }
        const release = rawVersion.release;
        const releaseTag = isJsonObject(release) && isNonEmptyString(release.tag) ? release.tag : undefined;
        const releaseUrl = isJsonObject(release) && isNonEmptyString(release.url) ? release.url : undefined;
        if (release !== undefined) {
          if (!isJsonObject(release)) issues.push(issue("contract.type", `${versionPath}/release`, "release requires tag and url"));
          else {
            unknownKeys(release, RELEASE_KEYS, `${versionPath}/release`, issues);
            if (!isNonEmptyString(release.tag) || !isNonEmptyString(release.url)) issues.push(issue("contract.type", `${versionPath}/release`, "release requires tag and url"));
          }
        }
        if (input.channel === "release" && (!releaseTag || !releaseUrl)) issues.push(issue("contract.invariant", `${versionPath}/release`, "release snapshots require release tag and url"));
        if (isJsonObject(artifact) && isNonEmptyString(artifact.url) && isNonEmptyString(artifact.sha256) && artifact.mediaType === CARD_ARTIFACT_MEDIA_TYPE && SHA256.test(artifact.sha256) && isJsonObject(source) && isNonEmptyString(source.repository) && isNonEmptyString(source.commit) && sourcePath && (!isJsonObject(handoff) || (isNonEmptyString(handoff.url) && isNonEmptyString(handoff.sha256) && SHA256.test(handoff.sha256))) && (!release || (releaseTag !== undefined && releaseUrl !== undefined))) {
          versions.push({ reference, version, contractVersion, renderProfile, artifact: { url: artifact.url, sha256: artifact.sha256, mediaType: artifact.mediaType }, ...(isJsonObject(handoff) && isNonEmptyString(handoff.url) && isNonEmptyString(handoff.sha256) && SHA256.test(handoff.sha256) ? { handoff: { url: handoff.url, sha256: handoff.sha256 } } : {}), source: { repository: source.repository, commit: source.commit, path: sourcePath, ...(isNonEmptyString(source.pullRequestUrl) ? { pullRequestUrl: source.pullRequestUrl } : {}) }, ...(releaseTag !== undefined && releaseUrl !== undefined ? { release: { tag: releaseTag, url: releaseUrl } } : {}) });
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
