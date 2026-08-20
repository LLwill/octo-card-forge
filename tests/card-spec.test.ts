import { readFile } from "node:fs/promises";
import pathModule from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  decodeCardSourceManifest,
  decodeCardArtifactV1,
  decodeCatalogSnapshotV1,
  CARD_ARTIFACT_MEDIA_TYPE,
  CATALOG_SNAPSHOT_MEDIA_TYPE,
  decodeRenderCapabilities,
  decodeRenderProfileManifest,
  isPinnedRenderProfileReference,
  validateCardManifestPolicy,
} from "../packages/card-spec/src/index.js";

async function readJson(path: string): Promise<unknown> {
  const root = pathModule.resolve(pathModule.dirname(fileURLToPath(import.meta.url)), "..");
  return JSON.parse(await readFile(pathModule.join(root, path), "utf8")) as unknown;
}

describe("card-spec source manifest decoder", () => {
  it("accepts every checked-in card draft and release manifest", async () => {
    const paths = [
      "cards/ai.decision-action/manifest.json",
      "cards/ai.decision-action/versions/0.2.0/manifest.json",
      "cards/ai.reasoning-process/manifest.json",
      "cards/ai.reasoning-process/versions/0.3.0/manifest.json",
      "cards/ai.reasoning-process/versions/0.3.1/manifest.json",
      "cards/docs.access-request/manifest.json",
      "cards/docs.access-request/versions/0.3.0/manifest.json",
    ];

    for (const path of paths) {
      const result = decodeCardSourceManifest(await readJson(path));
      expect(result.ok, path).toBe(true);
      if (result.ok) expect(result.value.id).toContain(".");
    }
  });

  it("fails closed for unknown schema versions and unknown properties", () => {
    const result = decodeCardSourceManifest({
      schemaVersion: 99,
      id: "docs.access-request",
      name: "Access",
      version: "0.1.0",
      contractVersion: "1.0.0",
      adaptiveCardVersion: "1.5",
      defaultLocale: "en-US",
      dataSchema: "contract/data.schema.json",
      views: {
        result: {
          wireProfile: "octo/v1",
          template: "templates/result.json",
          samples: ["samples/result.json"],
        },
      },
      extra: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.unsupported_version", path: "/schemaVersion" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/extra" }),
      ]));
    }
  });

  it("reports duplicate sample basenames and unsafe asset paths", () => {
    const result = decodeCardSourceManifest({
      schemaVersion: 2,
      id: "docs.access-request",
      name: "Access",
      version: "0.1.0",
      contractVersion: "1.0.0",
      adaptiveCardVersion: "1.5",
      defaultLocale: "en-US",
      dataSchema: "../contract/data.schema.json",
      views: {
        one: { wireProfile: "octo/v1", template: "templates/one.json", samples: ["samples/result.json"] },
        two: { wireProfile: "octo/v1", template: "templates/two.json", samples: ["other/result.json"] },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.pattern", path: "/dataSchema" }),
        expect.objectContaining({ code: "contract.duplicate", path: "/views/two/samples" }),
      ]));
    }
  });

  it("keeps release policy separate from structural decoding", async () => {
    const release = decodeCardSourceManifest(await readJson("cards/docs.access-request/versions/0.3.0/manifest.json"));
    expect(release.ok).toBe(true);
    if (release.ok) {
      expect(validateCardManifestPolicy(release.value, { kind: "release" })).toEqual([]);
      expect(isPinnedRenderProfileReference(release.value.renderProfile)).toBe(true);
    }

    const draft = decodeCardSourceManifest(await readJson("cards/docs.access-request/manifest.json"));
    expect(draft.ok).toBe(true);
    if (draft.ok) expect(validateCardManifestPolicy(draft.value, { kind: "draft" })).toEqual([]);
  });
});

describe("render profile compatibility decoder", () => {
  it("accepts current unversioned profile files only in compatibility mode", async () => {
    const input = await readJson("render-profiles/octo-chat/manifest.json");
    const capabilitiesInput = await readJson("render-profiles/octo-chat/capabilities.json");
    const legacyInput = { ...(input as Record<string, unknown>) };
    delete legacyInput.schemaVersion;
    const legacyCapabilitiesInput = { ...(capabilitiesInput as Record<string, unknown>) };
    delete legacyCapabilitiesInput.schemaVersion;
    expect(decodeRenderProfileManifest(input).ok).toBe(true);
    expect(decodeRenderProfileManifest(legacyInput).ok).toBe(false);
    const result = decodeRenderProfileManifest(legacyInput, { allowLegacyUnversioned: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.notices).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/schemaVersion" }),
    ]));
    expect(decodeRenderCapabilities(capabilitiesInput).ok).toBe(true);
    const capabilities = decodeRenderCapabilities(legacyCapabilitiesInput, { allowLegacyUnversioned: true });
    expect(capabilities.ok).toBe(true);
    if (capabilities.ok) expect(capabilities.notices).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "/schemaVersion" }),
    ]));
  });

  it("accepts canonical v1 profile and capabilities shapes", () => {
    const manifest = decodeRenderProfileManifest({
      schemaVersion: 1,
      id: "octo-chat",
      version: "1.2.0",
      adaptiveCardsSdkVersion: "3.0.6",
      hostConfig: "host-config.json",
      stylesheet: "styles.css",
      capabilities: "capabilities.json",
    });
    expect(manifest.ok).toBe(true);

    const capabilities = decodeRenderCapabilities({
      schemaVersion: 1,
      maxAdaptiveCardVersion: "1.5",
      allowedElements: ["TextBlock"],
      allowedActions: ["Action.Submit"],
      maxNodes: 100,
      maxDepth: 10,
      maxPayloadBytes: 10000,
      imageUrlSchemes: ["https"],
      openUrlSchemes: ["https"],
    });
    expect(capabilities.ok).toBe(true);
  });
});

describe("decoder robustness", () => {
  it("returns issues instead of throwing for arbitrary JSON roots", () => {
    for (const input of [null, true, 1, "text", [], [1, 2, 3]]) {
      expect(() => decodeCardSourceManifest(input)).not.toThrow();
      expect(decodeCardSourceManifest(input).ok).toBe(false);
    }
  });
});

describe("artifact and snapshot contracts", () => {
  const profileManifest = {
    schemaVersion: 1,
    id: "octo-chat",
    version: "1.2.0",
    adaptiveCardsSdkVersion: "3.0.6",
    hostConfig: "host-config.json",
    stylesheet: "styles.css",
    capabilities: "capabilities.json",
  };
  const profileCapabilities = {
    schemaVersion: 1,
    maxAdaptiveCardVersion: "1.5",
    allowedElements: ["TextBlock"],
    allowedActions: [],
    maxNodes: 20,
    maxDepth: 10,
    maxPayloadBytes: 10000,
    imageUrlSchemes: ["https"],
    openUrlSchemes: ["https"],
  };

  it("accepts a deterministic artifact and rejects legacy handoff format", () => {
    const artifact = decodeCardArtifactV1({
      formatVersion: 1,
      mediaType: CARD_ARTIFACT_MEDIA_TYPE,
      card: {
        id: "docs.access-request",
        name: "Access",
        version: "0.3.0",
        contractVersion: "1.0.0",
        adaptiveCardVersion: "1.5",
        defaultLocale: "en-US",
      },
      profile: { reference: "octo-chat@1.2.0", manifest: profileManifest, capabilities: profileCapabilities },
      dataContract: { type: "object" },
      views: {
        result: {
          wireProfile: "octo/v1",
          template: { type: "AdaptiveCard", version: "1.5" },
          samples: [{ name: "approved", data: {}, card: { type: "AdaptiveCard", version: "1.5" }, inspection: { actions: [], inputs: [], toggles: [] } }],
        },
      },
      validation: { valid: true, issues: [] },
    });
    expect(artifact.ok).toBe(true);
    expect(decodeCardArtifactV1({ formatVersion: 1, mediaType: "application/vnd.octo.handoff+zip;version=1" }).ok).toBe(false);
  });

  it("validates snapshot references, digests and release fields", () => {
    const snapshot = decodeCatalogSnapshotV1({
      formatVersion: 1,
      mediaType: CATALOG_SNAPSHOT_MEDIA_TYPE,
      channel: "release",
      revision: "abc123",
      cards: [{
        id: "docs.access-request",
        name: "Access",
        defaultLocale: "en-US",
        latest: "0.3.0",
        versions: [{
          reference: "docs.access-request@0.3.0",
          version: "0.3.0",
          contractVersion: "1.0.0",
          renderProfile: "octo-chat@1.2.0",
          artifact: { url: "https://example.test/artifact.json", sha256: "a".repeat(64), mediaType: CARD_ARTIFACT_MEDIA_TYPE },
          source: { repository: "octo-card-catalog", commit: "abc123", path: "cards/docs.access-request" },
          release: { tag: "docs.access-request-v0.3.0", url: "https://example.test/release" },
        }],
      }],
    });
    expect(snapshot.ok).toBe(true);
    const invalid = decodeCatalogSnapshotV1({
      formatVersion: 1,
      mediaType: CATALOG_SNAPSHOT_MEDIA_TYPE,
      channel: "release",
      revision: "abc123",
      cards: [{
        id: "docs.access-request",
        name: "Access",
        defaultLocale: "en-US",
        latest: "0.4.0",
        versions: [{
          reference: "other.card@0.3.0",
          version: "0.3.0",
          contractVersion: "1.0.0",
          renderProfile: "octo-chat@latest",
          artifact: { url: "x", sha256: "bad", mediaType: CARD_ARTIFACT_MEDIA_TYPE },
          source: { repository: "repo", commit: "abc", path: "cards/x" },
        }],
      }],
    });
    expect(invalid.ok).toBe(false);
  });
});
