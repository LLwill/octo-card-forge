import { describe, expect, it } from "vitest";
import {
  CatalogSnapshotBuildError,
  buildCatalogSnapshot,
  canonicalCatalogSnapshotBytes,
  compareCatalogVersions,
  parseCatalogSnapshot,
  type CatalogReleaseRecord,
} from "@mlt-org/octo-card-catalog-snapshot";

type RecordOverrides = {
  card?: Partial<CatalogReleaseRecord["card"]>;
  artifact?: Partial<CatalogReleaseRecord["artifact"]>;
  handoff?: CatalogReleaseRecord["handoff"];
  source?: Partial<CatalogReleaseRecord["source"]>;
  release?: CatalogReleaseRecord["release"];
};

function record(overrides: RecordOverrides = {}): CatalogReleaseRecord {
  const version = overrides.card?.version ?? "0.3.0";
  const id = overrides.card?.id ?? "docs.access-request";
  return {
    card: {
      id,
      name: "Access Request",
      version,
      contractVersion: "1.1.0",
      renderProfile: "octo-chat@1.2.0-rc.4",
      defaultLocale: "zh-CN",
      ...overrides.card,
    },
    artifact: {
      url: `https://example.test/${id}-${version}.artifact.json`,
      sha256: "a".repeat(64),
      ...overrides.artifact,
    },
    handoff: overrides.handoff === undefined ? {
      url: `https://example.test/${id}-${version}.handoff.zip`,
      sha256: "b".repeat(64),
    } : overrides.handoff,
    source: {
      repository: "LLwill/octo-card-catalog",
      commit: "c".repeat(40),
      path: `cards/${id.replace(".", "/")}/versions/${version}`,
      ...overrides.source,
    },
    release: overrides.release === undefined ? {
      tag: `card/${id}/v${version}`,
      url: `https://example.test/releases/${id}/${version}`,
    } : overrides.release,
  };
}

describe("Catalog Snapshot Builder", () => {
  it("groups and sorts cards and versions deterministically", () => {
    const records = [
      record({ card: { id: "ops.alert", name: "Alert", version: "1.0.0", contractVersion: "1.0.0", renderProfile: "octo-chat@1.2.0-rc.4", defaultLocale: "en-US" } }),
      record({ card: { version: "0.4.0-rc.1" } }),
      record(),
      record({ card: { version: "0.4.0" } }),
    ];
    const snapshot = buildCatalogSnapshot({ channel: "release", revision: "revision-1", records });

    expect(snapshot.cards.map((card) => card.id)).toEqual(["docs.access-request", "ops.alert"]);
    expect(snapshot.cards[0].latest).toBe("0.4.0");
    expect(snapshot.cards[0].versions.map((item) => item.version)).toEqual([
      "0.4.0",
      "0.4.0-rc.1",
      "0.3.0",
    ]);
    const reversed = buildCatalogSnapshot({ channel: "release", revision: "revision-1", records: [...records].reverse() });
    expect(canonicalCatalogSnapshotBytes(reversed)).toEqual(canonicalCatalogSnapshotBytes(snapshot));
    expect(parseCatalogSnapshot(canonicalCatalogSnapshotBytes(snapshot))).toEqual(snapshot);
  });

  it("uses SemVer prerelease precedence", () => {
    expect(compareCatalogVersions("1.0.0", "1.0.0-rc.1")).toBeGreaterThan(0);
    expect(compareCatalogVersions("1.0.0-rc.10", "1.0.0-rc.2")).toBeGreaterThan(0);
    expect(compareCatalogVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
  });

  it("rejects duplicate versions and conflicting card metadata", () => {
    expect(() => buildCatalogSnapshot({
      channel: "release",
      revision: "revision-1",
      records: [record(), record()],
    })).toThrow(CatalogSnapshotBuildError);
    expect(() => buildCatalogSnapshot({
      channel: "release",
      revision: "revision-1",
      records: [record(), record({ card: { version: "0.4.0", name: "Changed" } })],
    })).toThrow("card name conflicts");
  });

  it("enforces release snapshot invariants through the shared contract", () => {
    const invalid = record({ card: { renderProfile: "octo-chat@latest" } });
    delete invalid.release;
    expect(() => buildCatalogSnapshot({
      channel: "release",
      revision: "revision-1",
      records: [invalid],
    })).toThrow(CatalogSnapshotBuildError);
  });
});
