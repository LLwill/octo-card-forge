import { describe, expect, it } from "vitest";
import {
  ArtifactBuildError,
  artifactSha256,
  buildCardArtifact,
  canonicalArtifactBytes,
  verifyCardArtifact,
} from "@mlt-org/octo-card-artifact";
import {
  decodeResolvedCardSourceV1,
  parseOrThrow,
  type CardArtifactV1,
  type RenderCapabilitiesV1,
  type RenderProfileManifestV1,
  type ResolvedCardSourceV1,
} from "@mlt-org/octo-card-spec";

const profileManifest: RenderProfileManifestV1 = {
  schemaVersion: 1,
  id: "octo-chat",
  version: "1.2.0",
  adaptiveCardsSdkVersion: "3.0.6",
  hostConfig: "host-config.json",
  stylesheet: "styles.css",
  capabilities: "capabilities.json",
};

const profileCapabilities: RenderCapabilitiesV1 = {
  schemaVersion: 1,
  maxAdaptiveCardVersion: "1.5",
  allowedElements: ["TextBlock"],
  allowedActions: [],
  utilities: {
    "legacy-text": {
      group: "appearance",
      appliesTo: ["TextBlock"],
      description: "Legacy text treatment",
      deprecated: true,
    },
  },
  maxNodes: 20,
  maxDepth: 10,
  maxPayloadBytes: 10000,
  imageUrlSchemes: ["https"],
  openUrlSchemes: ["https"],
};

function source(template: Record<string, unknown> = {
  type: "AdaptiveCard",
  version: "1.5",
  body: [{
    type: "TextBlock",
    id: "octo--legacy-text--uid-title",
    text: "${title}",
  }],
}): ResolvedCardSourceV1 {
  return parseOrThrow("ResolvedCardSourceV1", decodeResolvedCardSourceV1({
    formatVersion: 1,
    card: {
      id: "docs.access-request",
      namespace: "docs",
      key: "access-request",
      name: "Access Request",
      version: "0.3.0",
      contractVersion: "1.0.0",
      adaptiveCardVersion: "1.5",
      defaultLocale: "en-US",
    },
    dataContract: {
      type: "object",
      required: ["title"],
      properties: { title: { type: "string" } },
    },
    views: {
      result: {
        wireProfile: "octo/v1",
        template,
        samples: [
          { name: "zebra", data: { title: "Zebra" } },
          { name: "alpha", data: { title: "Alpha" } },
        ],
      },
    },
  }));
}

function build(sourceValue = source()): CardArtifactV1 {
  return buildCardArtifact({
    source: sourceValue,
    profile: {
      reference: "octo-chat@1.2.0",
      manifest: profileManifest,
      capabilities: profileCapabilities,
    },
  });
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, item]) => [key, reverseObjectKeys(item)])
  );
}

describe("Card Artifact v1", () => {
  it("builds every sample, sorts samples, and retains warning provenance", () => {
    const artifact = build();

    expect(artifact.card).toEqual({
      id: "docs.access-request",
      name: "Access Request",
      version: "0.3.0",
      contractVersion: "1.0.0",
      adaptiveCardVersion: "1.5",
      defaultLocale: "en-US",
    });
    expect(artifact.views.result.samples.map((sample) => sample.name)).toEqual([
      "alpha",
      "zebra",
    ]);
    expect(artifact.views.result.samples[0].card).toMatchObject({
      type: "AdaptiveCard",
      body: [{ text: "Alpha" }],
    });
    expect(artifact.validation).toEqual({
      valid: true,
      issues: [
        expect.objectContaining({
          severity: "warning",
          code: "utility.deprecated",
          details: { view: "result", sample: "alpha" },
        }),
        expect.objectContaining({
          severity: "warning",
          code: "utility.deprecated",
          details: { view: "result", sample: "zebra" },
        }),
      ],
    });
  });

  it("produces canonical compact bytes and a stable lowercase digest", () => {
    const artifact = build();
    const reordered = reverseObjectKeys(artifact) as CardArtifactV1;
    const bytes = canonicalArtifactBytes(artifact);

    expect(new TextDecoder().decode(bytes)).not.toContain("\n");
    expect(canonicalArtifactBytes(reordered)).toEqual(bytes);
    expect(artifactSha256(reordered)).toBe(artifactSha256(artifact));
    expect(artifactSha256(artifact)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verifies objects, JSON strings and bytes against the canonical digest", () => {
    const artifact = build();
    const sha256 = artifactSha256(artifact);
    const json = JSON.stringify(reverseObjectKeys(artifact), null, 2);

    expect(verifyCardArtifact(artifact, sha256)).toMatchObject({ valid: true, sha256 });
    expect(verifyCardArtifact(json, sha256)).toMatchObject({ valid: true, sha256 });
    expect(verifyCardArtifact(new TextEncoder().encode(json), sha256)).toMatchObject({ valid: true, sha256 });
    expect(verifyCardArtifact(artifact, "0".repeat(64))).toMatchObject({
      valid: false,
      sha256,
      issues: [expect.objectContaining({ code: "artifact.digest_mismatch" })],
    });
    expect(verifyCardArtifact("not json")).toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ code: "artifact.invalid_json" })],
    });
  });

  it("rejects artifacts when any compiled sample has an error", () => {
    const invalidSource = source({
      type: "AdaptiveCard",
      version: "1.5",
      body: [{ type: "TextBlock" }],
    });

    expect(() => build(invalidSource)).toThrow(ArtifactBuildError);
    try {
      build(invalidSource);
    } catch (error) {
      expect(error).toBeInstanceOf(ArtifactBuildError);
      expect((error as ArtifactBuildError).issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "schema.required_property",
          details: { view: "result", sample: "alpha" },
        }),
      ]));
    }
  });

  it("requires an exact profile pin that matches the manifest", () => {
    expect(() => buildCardArtifact({
      source: source(),
      profile: {
        reference: "octo-chat@latest",
        manifest: profileManifest,
        capabilities: profileCapabilities,
      },
    })).toThrow("exact Render Profile reference");
  });
});
