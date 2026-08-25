import { readFile } from "node:fs/promises";
import pathModule from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertCardManifest as assertLegacyCardManifest } from "../packages/cli/src/registry.js";
import {
  decodeCardSourceManifest,
  decodeResolvedCardSourceV1,
  decodeCardArtifactV1,
  decodeCatalogSnapshotV1,
  decodeComponentCatalogV1,
  COMPONENT_CATALOG_MEDIA_TYPE,
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
      const input = await readJson(path);
      assertLegacyCardManifest(input as never, path);
      const result = decodeCardSourceManifest(input);
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

  it("accepts an optional componentCatalog path and rejects an escaping one", () => {
    const withCatalog = decodeRenderProfileManifest({
      schemaVersion: 1,
      id: "octo-chat",
      version: "1.2.0",
      adaptiveCardsSdkVersion: "3.0.6",
      hostConfig: "host-config.json",
      stylesheet: "styles.css",
      capabilities: "capabilities.json",
      componentCatalog: "component-catalog.json",
    });
    expect(withCatalog.ok).toBe(true);
    if (withCatalog.ok) expect(withCatalog.value.componentCatalog).toBe("component-catalog.json");

    const escaping = decodeRenderProfileManifest({
      schemaVersion: 1,
      id: "octo-chat",
      version: "1.2.0",
      adaptiveCardsSdkVersion: "3.0.6",
      hostConfig: "host-config.json",
      stylesheet: "styles.css",
      capabilities: "capabilities.json",
      componentCatalog: "../escape.json",
    });
    expect(escaping.ok).toBe(false);
    if (!escaping.ok) {
      expect(escaping.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.pattern", path: "/componentCatalog" }),
      ]));
    }
  });

  it("fails closed on malformed capability subcontracts", () => {
    const result = decodeRenderCapabilities({
      schemaVersion: 1,
      maxAdaptiveCardVersion: "latest",
      allowedElements: ["TextBlock"],
      allowedActions: [],
      utilityRules: { maxTokensPerElement: 0, extra: true },
      components: {
        "octo-badge": {
          appliesTo: ["TextBlock"],
          variants: {
            warning: { fallback: { color: "Warning" }, extra: true },
          },
          extra: true,
        },
      },
      utilities: {
        "surface-subtle": {
          group: "surface",
          appliesTo: ["Container"],
          description: "Subtle surface",
          extra: true,
        },
      },
      maxNodes: 20,
      maxDepth: 10,
      maxPayloadBytes: 10000,
      imageUrlSchemes: ["https"],
      openUrlSchemes: ["https"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.pattern", path: "/maxAdaptiveCardVersion" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/utilityRules/extra" }),
        expect.objectContaining({ code: "contract.invariant", path: "/utilityRules/maxTokensPerElement" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/components/octo-badge/extra" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/components/octo-badge/variants/warning/extra" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/utilities/surface-subtle/extra" }),
      ]));
    }
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
    if (artifact.ok) {
      expect(artifact.value.card).not.toHaveProperty("namespace");
      expect(artifact.value.card).not.toHaveProperty("key");
    }
    expect(decodeCardArtifactV1({ formatVersion: 1, mediaType: "application/vnd.octo.handoff+zip;version=1" }).ok).toBe(false);
  });

  it("allows validation warnings but rejects errors in valid artifacts", () => {
    const base = {
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
    };
    const details = { view: "result", sample: "approved" };

    expect(decodeCardArtifactV1({
      ...base,
      validation: { valid: true, issues: [{ severity: "warning", code: "test.warning", path: "$", message: "warning", details }] },
    }).ok).toBe(true);
    const invalid = decodeCardArtifactV1({
      ...base,
      validation: { valid: true, issues: [{ severity: "error", code: "test.error", path: "$", message: "error", details }] },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.invariant", path: "/validation/issues/0/severity" }),
      ]));
    }
  });

  it("validates snapshot references, digests and release fields", () => {
    const snapshot = decodeCatalogSnapshotV1({
      formatVersion: 1,
      mediaType: CATALOG_SNAPSHOT_MEDIA_TYPE,
      channel: "release",
      revision: "abc123",
      cards: [{
        id: "docs.access-request",
        namespace: "docs",
        key: "access-request",
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
        namespace: "docs",
        key: "access-request",
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

  it("rejects artifact nested unknown keys, malformed inspection, and invalid view metadata", () => {
    const invalid = decodeCardArtifactV1({
      formatVersion: 1,
      mediaType: CARD_ARTIFACT_MEDIA_TYPE,
      card: {
        id: "docs.access-request",
        name: "Access",
        version: "0.3.0",
        contractVersion: "1.0.0",
        adaptiveCardVersion: "1.5",
        defaultLocale: "en-US",
        extra: true,
      },
      profile: { reference: "octo-chat@1.2.0", manifest: profileManifest, capabilities: profileCapabilities },
      dataContract: { type: "object" },
      views: {
        result: {
          wireProfile: "octo/v1",
          states: ["approved", "approved"],
          submit_actions: [1],
          template: { type: "AdaptiveCard", version: "1.5" },
          extra: true,
          samples: [{
            name: "approved",
            data: {},
            card: { type: "AdaptiveCard", version: "1.5" },
            inspection: { actions: [{ path: "$.body[0]", type: "Action.Submit", extra: true }], inputs: [], toggles: [] },
            extra: true,
          }],
        },
      },
      validation: { valid: true, issues: [] },
    });

    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.unknown_property", path: "/card/extra" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/views/result/extra" }),
        expect.objectContaining({ code: "contract.duplicate", path: "/views/result/states" }),
        expect.objectContaining({ code: "contract.type", path: "/views/result/submit_actions" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/views/result/samples/0/extra" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/views/result/samples/0/inspection/actions/0/extra" }),
      ]));
    }
  });

  it("requires release snapshots to pin profiles and use Card Artifact media type", () => {
    const invalid = decodeCatalogSnapshotV1({
      formatVersion: 1,
      mediaType: CATALOG_SNAPSHOT_MEDIA_TYPE,
      channel: "release",
      revision: "abc123",
      cards: [{
        id: "docs.access-request",
        namespace: "docs",
        key: "access-request",
        name: "Access",
        defaultLocale: "en-US",
        versions: [{
          reference: "docs.access-request@0.3.0",
          version: "0.3.0",
          contractVersion: "1.0.0",
          renderProfile: "octo-chat@latest",
          artifact: { url: "https://example.test/artifact.json", sha256: "a".repeat(64), mediaType: "application/vnd.octo.handoff+zip;version=1" },
          source: { repository: "octo-card-catalog", commit: "abc123", path: "cards/docs.access-request" },
          extra: true,
        }],
        extra: true,
      }],
    });

    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.unknown_property", path: "/cards/0/extra" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/cards/0/versions/0/extra" }),
        expect.objectContaining({ code: "contract.invariant", path: "/cards/0/versions/0/renderProfile" }),
        expect.objectContaining({ code: "contract.type", path: "/cards/0/versions/0/artifact" }),
      ]));
    }
  });
});

describe("resolved source contract", () => {
  it("accepts a path-free source for the pure engine", () => {
    const result = decodeResolvedCardSourceV1({
      formatVersion: 1,
      card: {
        id: "docs.access-request",
        namespace: "docs",
        key: "access-request",
        name: "Access",
        version: "0.3.0",
        contractVersion: "1.0.0",
        adaptiveCardVersion: "1.5",
        defaultLocale: "en-US",
      },
      dataContract: { type: "object" },
      views: {
        result: {
          wireProfile: "octo/v1",
          template: { type: "AdaptiveCard", version: "1.5" },
          samples: [{ name: "approved", data: { status: "approved" } }],
        },
      },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects source path leakage and mismatched identity", () => {
    const result = decodeResolvedCardSourceV1({
      formatVersion: 1,
      card: {
        id: "docs.access-request",
        namespace: "wrong",
        key: "access-request",
        name: "Access",
        version: "0.3.0",
        contractVersion: "1.0.0",
        adaptiveCardVersion: "1.5",
        defaultLocale: "en-US",
        root: "/tmp/card",
      },
      dataContract: { type: "object" },
      views: {
        result: {
          wireProfile: "octo/v1",
          template: { type: "AdaptiveCard", version: "1.5" },
          samples: [{ name: "approved", data: { status: "approved" } }],
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "contract.invariant", path: "/card/namespace" }),
    ]));
  });

  it("rejects unknown keys in resolved source objects", () => {
    const result = decodeResolvedCardSourceV1({
      formatVersion: 1,
      extra: true,
      card: {
        id: "docs.access-request",
        namespace: "docs",
        key: "access-request",
        name: "Access",
        version: "0.3.0",
        contractVersion: "1.0.0",
        adaptiveCardVersion: "1.5",
        defaultLocale: "en-US",
      },
      dataContract: { type: "object" },
      views: {
        result: {
          wireProfile: "octo/v1",
          template: { type: "AdaptiveCard", version: "1.5" },
          samples: [{ name: "approved", data: {}, extra: true }],
          extra: true,
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.unknown_property", path: "/extra" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/views/result/extra" }),
        expect.objectContaining({ code: "contract.unknown_property", path: "/views/result/samples/0/extra" }),
      ]));
    }
  });
});

describe("card-spec component catalog decoder", () => {
  function envelope(groups: unknown): Record<string, unknown> {
    return {
      formatVersion: 1,
      mediaType: COMPONENT_CATALOG_MEDIA_TYPE,
      profileReference: "octo-chat@1.2.0",
      groups,
    };
  }

  it("accepts the live component baseline groups as a versioned catalog", async () => {
    const { buildComponentBaselineGroups } = await import("../packages/cli/src/component-baseline.js");
    const { getCurrentRenderProfile } = await import("../packages/cli/src/registry.js");
    const profile = await getCurrentRenderProfile();
    const groups = buildComponentBaselineGroups(profile.capabilities);
    const result = decodeComponentCatalogV1({
      formatVersion: 1,
      mediaType: COMPONENT_CATALOG_MEDIA_TYPE,
      profileReference: profile.reference,
      groups,
    });
    expect(result.ok, JSON.stringify(!result.ok ? result.issues : [])).toBe(true);
    if (result.ok) {
      expect(result.value.groups.map((group) => group.id)).toEqual([
        "foundation",
        "adaptive-card-components",
        "octo-utility-tokens",
        "composition-patterns",
      ]);
      const variants = result.value.groups.flatMap((group) =>
        group.sections.map((section) =>
          section.card ? "card" : section.rows ? "rows" : "utilityTokens"
        )
      );
      expect(new Set(variants)).toEqual(new Set(["card", "rows", "utilityTokens"]));
    }
  });

  it("accepts a minimal catalog covering all three section variants", () => {
    const result = decodeComponentCatalogV1(envelope([
      {
        id: "foundation",
        title: "Foundation",
        description: "base scales",
        sections: [{
          id: "foundation-typography",
          title: "Typography",
          description: "text scale",
          rows: [{ name: "Default", value: "TextBlock.size", description: "body", preview: "text" }],
        }],
      },
      {
        id: "adaptive-card-components",
        title: "Adaptive Card Defaults",
        description: "standard elements",
        sections: [{
          id: "component-textblock",
          title: "TextBlock",
          description: "text element",
          card: { type: "AdaptiveCard", version: "1.5", body: [] },
        }],
      },
      {
        id: "octo-utility-tokens",
        title: "Octo Utility Tokens",
        description: "controlled styles",
        sections: [{
          id: "utility-badge-warning",
          title: "badge-warning",
          description: "warning badge",
          utilityTokens: [{
            token: "badge-warning",
            group: "badge",
            description: "warning",
            appliesTo: ["Container"],
            card: { type: "AdaptiveCard", version: "1.5", body: [] },
          }],
        }],
      },
      {
        id: "composition-patterns",
        title: "Composition Patterns",
        description: "reusable fragments",
        sections: [{
          id: "pattern-summary",
          title: "Summary",
          description: "summary fragment",
          card: { type: "AdaptiveCard", version: "1.5", body: [] },
        }],
      },
    ]));
    expect(result.ok, JSON.stringify(!result.ok ? result.issues : [])).toBe(true);
  });

  it("fails closed for unknown media type, bad group id, and multi-variant sections", () => {
    const result = decodeComponentCatalogV1({
      formatVersion: 1,
      mediaType: "application/json",
      profileReference: "octo-chat@latest",
      groups: [
        {
          id: "not-a-category",
          title: "Bad",
          description: "bad group",
          sections: [{
            id: "bad-section",
            title: "Bad",
            description: "two variants",
            card: { type: "AdaptiveCard" },
            rows: [{ name: "x", value: "y", description: "z", preview: "text" }],
          }],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.enum", path: "/mediaType" }),
        expect.objectContaining({ code: "contract.enum", path: "/groups/0/id" }),
        expect.objectContaining({ code: "contract.invariant", path: "/groups/0/sections/0" }),
      ]));
    }
  });

  it("rejects unknown properties and bad preview enum values", () => {
    const result = decodeComponentCatalogV1(envelope([
      {
        id: "foundation",
        title: "Foundation",
        description: "base",
        extra: true,
        sections: [{
          id: "foundation-typography",
          title: "One",
          description: "row section",
          rows: [{ name: "A", value: "B", description: "C", preview: "invalid" }],
        }],
      },
    ]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.unknown_property", path: "/groups/0/extra" }),
        expect.objectContaining({ code: "contract.enum", path: "/groups/0/sections/0/rows/0/preview" }),
      ]));
    }
  });

  it("rejects duplicate section ids across groups", () => {
    const result = decodeComponentCatalogV1(envelope([
      {
        id: "foundation",
        title: "Foundation",
        description: "base",
        sections: [{
          id: "dup",
          title: "One",
          description: "card section",
          card: { type: "AdaptiveCard", version: "1.5" },
        }],
      },
      {
        id: "composition-patterns",
        title: "Composition Patterns",
        description: "patterns",
        sections: [{
          id: "dup",
          title: "Two",
          description: "another card section",
          card: { type: "AdaptiveCard", version: "1.5" },
        }],
      },
    ]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "contract.duplicate", path: "/groups/1/sections/0/id" }),
      ]));
    }
  });
});
