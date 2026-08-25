import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  artifactSha256,
  canonicalArtifactBytes,
} from "@mlt-org/octo-card-artifact";
import {
  buildCatalogSnapshot,
  canonicalCatalogSnapshotBytes,
} from "@mlt-org/octo-card-catalog-snapshot";
import {
  artifactRequestUrl,
  deriveProfileResourceUrls,
  loadCardArtifact,
  loadCatalogSnapshot,
} from "../apps/forge-web/src/data.js";
import { buildCardArtifact } from "../packages/cli/src/artifact.js";
import { createForgeServer } from "../packages/cli/src/server.js";

describe("Forge Web catalog client", () => {
  it("loads canonical snapshot and artifact data and derives exact profile resources", async () => {
    const artifact = await buildCardArtifact("docs.access-request@0.3.0");
    const digest = artifactSha256(artifact);
    const snapshot = buildCatalogSnapshot({
      channel: "release",
      revision: "a".repeat(40),
      records: [{
        card: {
          id: artifact.card.id,
          name: artifact.card.name,
          version: artifact.card.version,
          contractVersion: artifact.card.contractVersion,
          renderProfile: artifact.profile.reference,
          defaultLocale: artifact.card.defaultLocale,
        },
        artifact: { url: "https://example.test/card.artifact.json", sha256: digest },
        source: { repository: "example/catalog", commit: "b".repeat(40), path: "cards/docs/access-request" },
        release: { tag: "card/docs.access-request/v0.3.0", url: "https://example.test/releases/0.3.0" },
      }],
    });
    const fetcher = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.endsWith("snapshot")) return new Response(canonicalCatalogSnapshotBytes(snapshot));
      return new Response(JSON.stringify(artifact, null, 2));
    };

    const loadedSnapshot = await loadCatalogSnapshot({
      snapshotUrl: "https://example.test/snapshot",
      fetch: fetcher,
    });
    const loadedArtifact = await loadCardArtifact(artifact.card.id + "@" + artifact.card.version, digest, {
      artifactBaseUrl: "https://example.test/artifacts/",
      fetch: fetcher,
    });
    const resources = deriveProfileResourceUrls(loadedArtifact);

    expect(loadedSnapshot.cards[0].latest).toBe("0.3.0");
    expect(loadedArtifact.profile.reference).toBe("octo-chat@1.2.0-rc.4");
    expect(resources).toEqual({
      hostConfig: "https://cdn.jsdelivr.net/npm/@mlt-org/octo-card-profile-octo-chat@1.2.0-rc.4/dist/host-config.json",
      theme: "https://cdn.jsdelivr.net/npm/@mlt-org/octo-card-profile-octo-chat@1.2.0-rc.4/dist/theme.css",
      stylesheet: "https://cdn.jsdelivr.net/npm/@mlt-org/octo-card-profile-octo-chat@1.2.0-rc.4/dist/styles.css",
      adaptiveCardsSdk: "https://cdn.jsdelivr.net/npm/adaptivecards@3.0.6/dist/adaptivecards.min.js",
    });
    expect(artifactRequestUrl("docs.access-request@0.3.0")).toBe(
      "./api/artifacts/docs.access-request%400.3.0",
    );
  });

  it("rejects a canonical digest mismatch", async () => {
    const artifact = await buildCardArtifact("docs.access-request@0.3.0");
    await expect(loadCardArtifact("docs.access-request@0.3.0", "0".repeat(64), {
      fetch: async () => new Response(canonicalArtifactBytes(artifact)),
    })).rejects.toThrow("digest mismatch");
  });

  it("rejects an artifact whose identity does not match the requested reference", async () => {
    const artifact = await buildCardArtifact("ai.decision-action@0.2.0");
    const digest = artifactSha256(artifact);

    await expect(loadCardArtifact("docs.access-request@0.3.0", digest, {
      artifact,
    })).rejects.toThrow(
      "Card artifact identity mismatch: expected docs.access-request@0.3.0, received ai.decision-action@0.2.0",
    );
  });

  it("loads an embedded preview Snapshot and Artifact without network access", async () => {
    const artifact = await buildCardArtifact("docs.access-request@0.3.0");
    const digest = artifactSha256(artifact);
    const snapshot = buildCatalogSnapshot({
      channel: "preview",
      revision: "pr-42-head",
      records: [{
        card: {
          id: artifact.card.id,
          name: artifact.card.name,
          version: artifact.card.version,
          contractVersion: artifact.card.contractVersion,
          renderProfile: artifact.profile.reference,
          defaultLocale: artifact.card.defaultLocale,
        },
        artifact: { url: "./artifacts/card.artifact.json", sha256: digest },
        source: {
          repository: "example/catalog",
          commit: "e".repeat(40),
          path: "cards/docs/access-request",
          pullRequestUrl: "https://example.test/pull/42",
        },
      }],
    });
    let fetchCount = 0;
    const fetcher = async (): Promise<Response> => {
      fetchCount += 1;
      return new Response(null, { status: 500 });
    };

    const loadedSnapshot = await loadCatalogSnapshot({ snapshot, fetch: fetcher });
    const loadedArtifact = await loadCardArtifact("docs.access-request@0.3.0", digest, {
      artifact,
      fetch: fetcher,
    });

    expect(loadedSnapshot.channel).toBe("preview");
    expect(loadedArtifact.card.id).toBe("docs.access-request");
    expect(fetchCount).toBe(0);
  });
});

describe("Forge Web server route", () => {
  let server: Server;
  let baseUrl: string;
  let temporaryRoot: string;

  beforeAll(async () => {
    const artifact = await buildCardArtifact("docs.access-request@0.3.0");
    const digest = artifactSha256(artifact);
    const snapshot = buildCatalogSnapshot({
      channel: "release",
      revision: "c".repeat(40),
      records: [{
        card: {
          id: artifact.card.id,
          name: artifact.card.name,
          version: artifact.card.version,
          contractVersion: artifact.card.contractVersion,
          renderProfile: artifact.profile.reference,
          defaultLocale: artifact.card.defaultLocale,
        },
        artifact: { url: "https://example.test/card.artifact.json", sha256: digest },
        source: { repository: "example/catalog", commit: "d".repeat(40), path: "cards/docs/access-request" },
        release: { tag: "card/docs.access-request/v0.3.0", url: "https://example.test/releases/0.3.0" },
      }],
    });
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "octo-forge-web-"));
    await mkdir(path.join(temporaryRoot, "assets"), { recursive: true });
    await Promise.all([
      writeFile(path.join(temporaryRoot, "index.html"), "<!doctype html><html><head><title>Forge Web fixture</title></head><body></body></html>"),
      writeFile(path.join(temporaryRoot, "app.js"), "export {};"),
      writeFile(path.join(temporaryRoot, "app.js.map"), "{}"),
      writeFile(path.join(temporaryRoot, "styles.css"), "body{}"),
      writeFile(path.join(temporaryRoot, "assets", "app-hash.js"), "export const ready = true;"),
    ]);
    const catalogFetch = async (input: string | URL | Request): Promise<Response> => {
      return String(input).includes("snapshot")
        ? new Response(canonicalCatalogSnapshotBytes(snapshot))
        : new Response(JSON.stringify(artifact, null, 2));
    };
    server = await createForgeServer({
      catalogSnapshotUrl: "https://example.test/snapshot",
      catalogFetch: catalogFetch as typeof fetch,
      forgeWebRoot: temporaryRoot,
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("serves the workbench and verified published catalog assets", async () => {
    const redirect = await fetch(`${baseUrl}/forge`, { redirect: "manual" });
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("/forge/");

    const page = await fetch(`${baseUrl}/forge/`);
    expect(page.status).toBe(200);
    const pageHtml = await page.text();
    expect(pageHtml).toContain("Forge Web fixture");
    expect(pageHtml).toContain('<base href="/forge/" />');

    const nestedRoute = await fetch(`${baseUrl}/forge/cards/docs.access-request`);
    expect(nestedRoute.status).toBe(200);
    expect(await nestedRoute.text()).toContain('<base href="/forge/" />');

    const chunk = await fetch(`${baseUrl}/forge/assets/app-hash.js`);
    expect(chunk.status).toBe(200);
    expect(chunk.headers.get("content-type")).toContain("text/javascript");
    expect(await chunk.text()).toContain("ready = true");

    const snapshotResponse = await fetch(`${baseUrl}/forge/api/catalog-snapshot`);
    expect(snapshotResponse.status).toBe(200);
    await expect(snapshotResponse.json()).resolves.toMatchObject({ revision: "c".repeat(40) });

    const artifactResponse = await fetch(`${baseUrl}/forge/api/artifacts/docs.access-request%400.3.0`);
    expect(artifactResponse.status).toBe(200);
    await expect(artifactResponse.json()).resolves.toMatchObject({
      card: { id: "docs.access-request", version: "0.3.0" },
    });
  });

  it("rejects an artifact whose verified content has the wrong identity", async () => {
    const wrongArtifact = await buildCardArtifact("ai.decision-action@0.2.0");
    const snapshot = buildCatalogSnapshot({
      channel: "release",
      revision: "f".repeat(40),
      records: [{
        card: {
          id: "docs.access-request",
          name: "Access request",
          version: "0.3.0",
          contractVersion: "1.0.0",
          renderProfile: wrongArtifact.profile.reference,
          defaultLocale: "zh-CN",
        },
        artifact: {
          url: "https://example.test/wrong-card.artifact.json",
          sha256: artifactSha256(wrongArtifact),
        },
        source: {
          repository: "example/catalog",
          commit: "e".repeat(40),
          path: "cards/docs/access-request",
        },
        release: {
          tag: "card/docs.access-request/v0.3.0",
          url: "https://example.test/releases/0.3.0",
        },
      }],
    });
    const identityServer = await createForgeServer({
      catalogSnapshotUrl: "https://example.test/snapshot",
      catalogFetch: async (input) => String(input).includes("snapshot")
        ? new Response(canonicalCatalogSnapshotBytes(snapshot))
        : new Response(canonicalArtifactBytes(wrongArtifact)),
      forgeWebRoot: temporaryRoot,
    });
    await new Promise<void>((resolve, reject) => {
      identityServer.once("error", reject);
      identityServer.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = identityServer.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/forge/api/artifacts/docs.access-request%400.3.0`,
      );
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        code: "catalog.artifact_identity_mismatch",
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        identityServer.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});
