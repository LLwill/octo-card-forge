import {
  canonicalCardArtifactBytes,
  parseCardArtifact,
  parseCatalogSnapshot,
  type CardArtifactV1,
  type CatalogSnapshotV1,
} from "@mlt-org/octo-card-catalog-snapshot";

export const DEFAULT_SNAPSHOT_ENDPOINT = "./api/catalog-snapshot";
export const DEFAULT_ARTIFACT_ENDPOINT = "./api/artifacts/";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ForgeCatalogClientOptions {
  snapshotUrl?: string;
  artifactBaseUrl?: string;
  snapshot?: unknown;
  artifact?: unknown;
  fetch?: FetchLike;
}

export interface ProfileResourceUrls {
  hostConfig: string;
  theme?: string;
  stylesheet: string;
  adaptiveCardsSdk: string;
}

function responseError(response: Response, resource: string): Error {
  return new Error(`${resource} request failed (${response.status} ${response.statusText || "Unknown"})`);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function loadCatalogSnapshot(
  options: ForgeCatalogClientOptions = {},
): Promise<CatalogSnapshotV1> {
  if (options.snapshot !== undefined) return parseCatalogSnapshot(options.snapshot);
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher(options.snapshotUrl ?? DEFAULT_SNAPSHOT_ENDPOINT, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw responseError(response, "Catalog snapshot");
  return parseCatalogSnapshot(new Uint8Array(await response.arrayBuffer()));
}

export function artifactRequestUrl(reference: string, artifactBaseUrl = DEFAULT_ARTIFACT_ENDPOINT): string {
  return `${artifactBaseUrl}${encodeURIComponent(reference)}`;
}

export async function loadCardArtifact(
  reference: string,
  expectedSha256: string,
  options: ForgeCatalogClientOptions = {},
): Promise<CardArtifactV1> {
  let input = options.artifact;
  if (input === undefined) {
    const fetcher = options.fetch ?? fetch;
    const response = await fetcher(artifactRequestUrl(reference, options.artifactBaseUrl), {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw responseError(response, `Card artifact ${reference}`);
    input = new Uint8Array(await response.arrayBuffer());
  }
  const artifact = parseCardArtifact(input);
  const actualSha256 = await sha256Hex(canonicalCardArtifactBytes(artifact));
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Card artifact digest mismatch: expected ${expectedSha256}, received ${actualSha256}`);
  }
  const actualReference = `${artifact.card.id}@${artifact.card.version}`;
  if (actualReference !== reference) {
    throw new Error(`Card artifact identity mismatch: expected ${reference}, received ${actualReference}`);
  }
  return artifact;
}

function profilePackageBase(artifact: CardArtifactV1): string {
  const packageName = artifact.profile.manifest.packageName;
  if (!packageName || !/^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)$/i.test(packageName)) {
    throw new Error(`Profile ${artifact.profile.reference} does not declare a valid npm package`);
  }
  return `https://cdn.jsdelivr.net/npm/${packageName}@${artifact.profile.manifest.version}/dist/`;
}

function profilePackageUrl(base: string, relativePath: string): string {
  if (!relativePath || relativePath.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid profile resource path: ${relativePath}`);
  }
  return `${base}${relativePath}`;
}

export function deriveProfileResourceUrls(artifact: CardArtifactV1): ProfileResourceUrls {
  const base = profilePackageBase(artifact);
  const manifest = artifact.profile.manifest;
  return {
    hostConfig: profilePackageUrl(base, manifest.hostConfig),
    ...(manifest.theme ? { theme: profilePackageUrl(base, manifest.theme) } : {}),
    stylesheet: profilePackageUrl(base, manifest.stylesheet),
    adaptiveCardsSdk: `https://cdn.jsdelivr.net/npm/adaptivecards@${manifest.adaptiveCardsSdkVersion}/dist/adaptivecards.min.js`,
  };
}
