import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { artifactSha256, canonicalArtifactBytes } from "@mlt-org/octo-card-artifact";
import { buildCatalogSnapshot, canonicalCatalogSnapshotBytes } from "@mlt-org/octo-card-catalog-snapshot";
import { buildCardArtifactForCard } from "../packages/cli/src/artifact.js";
import { createForgeServer } from "../packages/cli/src/server.js";
import { loadNoticeCard } from "./card-fixtures.js";

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeBundleFile(root: string, relativePath: string, bytes: Uint8Array | string) {
  const buffer = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return { path: relativePath, bytes: buffer.byteLength, sha256: sha256(buffer) };
}

async function createBundle(): Promise<{ root: string; revision: string; reference: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "octo-catalog-bundle-"));
  roots.push(root);
  const artifact = await buildCardArtifactForCard(await loadNoticeCard());
  const reference = `${artifact.card.id}@${artifact.card.version}`;
  const revision = "a".repeat(40);
  const handoffZip = new JSZip();
  handoffZip.file(`${reference}/README.md`, "# Local handoff\n");
  const handoff = await handoffZip.generateAsync({ type: "nodebuffer" });
  const handoffSha256 = sha256(handoff);
  const snapshot = buildCatalogSnapshot({
    channel: "release",
    revision,
    records: [{
      card: {
        id: artifact.card.id,
        name: artifact.card.name,
        version: artifact.card.version,
        contractVersion: artifact.card.contractVersion,
        renderProfile: artifact.profile.reference,
        defaultLocale: artifact.card.defaultLocale,
      },
      artifact: { url: "https://invalid.example/artifact.json", sha256: artifactSha256(artifact) },
      handoff: { url: "https://invalid.example/handoff.zip", sha256: handoffSha256 },
      source: { repository: "example/catalog", commit: revision, path: "cards/example/notice" },
      release: { tag: `card/${reference}`, url: "https://invalid.example/release" },
    }],
  });
  const files = [];
  files.push(await writeBundleFile(root, "catalog-snapshot.v1.json", `${JSON.stringify(snapshot, null, 2)}\n`));
  files.push(await writeBundleFile(root, `artifacts/${artifact.card.id}/${artifact.card.version}.artifact.json`, canonicalArtifactBytes(artifact)));
  files.push(await writeBundleFile(root, `handoffs/${artifact.card.id}/${artifact.card.version}.handoff.zip`, handoff));
  files.push(await writeBundleFile(root, `handoff-indexes/${artifact.card.id}/${artifact.card.version}.json`, `${JSON.stringify({
    formatVersion: 1,
    reference,
    fileName: `${reference}.handoff.zip`,
    sha256: handoffSha256,
    bytes: handoff.byteLength,
    files: [{ path: "README.md", group: "root", previewable: true }],
  }, null, 2)}\n`));
  files.push(await writeBundleFile(root, `handoff-files/${artifact.card.id}/${artifact.card.version}/README.md`, "# Local handoff\n"));
  const profileRoot = `profiles/${artifact.profile.manifest.id}/${artifact.profile.manifest.version}`;
  const profileFiles: Record<string, string> = {
    "manifest.json": `${JSON.stringify(artifact.profile.manifest)}\n`,
    [artifact.profile.manifest.hostConfig]: "{}\n",
    [artifact.profile.manifest.stylesheet]: ".octo-card-profile{}\n",
    [artifact.profile.manifest.capabilities]: `${JSON.stringify(artifact.profile.capabilities)}\n`,
    "adaptivecards.min.js": "globalThis.AdaptiveCards = {};\n",
  };
  if (artifact.profile.manifest.theme) profileFiles[artifact.profile.manifest.theme] = ":root{}\n";
  if (artifact.profile.manifest.tokens) profileFiles[artifact.profile.manifest.tokens] = "{}\n";
  if (artifact.profile.manifest.componentCatalog) profileFiles[artifact.profile.manifest.componentCatalog] = "{}\n";
  for (const [fileName, contents] of Object.entries(profileFiles)) {
    files.push(await writeBundleFile(root, `${profileRoot}/${fileName}`, contents));
  }
  await writeFile(path.join(root, "bundle-manifest.json"), `${JSON.stringify({ formatVersion: 1, files }, null, 2)}\n`);
  await writeFile(path.join(root, "release.json"), `${JSON.stringify({
    formatVersion: 1,
    catalogRevision: revision,
    snapshotSha256: sha256(canonicalCatalogSnapshotBytes(snapshot)),
    requires: {
      catalogSnapshot: 1,
      cardArtifact: [1],
      handoffLayout: 1,
      profileBundle: 1,
      features: ["handoff-index-v1", "local-profile-assets-v1"],
    },
    builtWith: {
      forgeCli: "0.2.4",
      forgeRevision: "b".repeat(40),
      builderImageDigest: `sha256:${"c".repeat(64)}`,
    },
    cards: 1,
    versions: 1,
  }, null, 2)}\n`);
  return { root, revision, reference };
}

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("local Catalog bundle runtime", () => {
  it("validates and serves a bundle without network access", async () => {
    const bundle = await createBundle();
    const server = await createForgeServer({
      catalogRoot: bundle.root,
      catalogImageDigest: `sha256:${"d".repeat(64)}`,
      catalogRevision: bundle.revision,
      forgeRevision: "e".repeat(40),
      catalogFetch: async () => { throw new Error("network access is forbidden"); },
    });
    const baseUrl = await listen(server);

    await expect((await fetch(`${baseUrl}/readyz`)).json()).resolves.toEqual({ status: "ready" });
    await expect((await fetch(`${baseUrl}/api/v1/runtime`)).json()).resolves.toMatchObject({
      deployment: {
        ready: true,
        catalogSource: "local",
        catalogRevision: bundle.revision,
        catalogImageDigest: `sha256:${"d".repeat(64)}`,
        cards: 1,
        versions: 1,
      },
    });
    const snapshot = await (await fetch(`${baseUrl}/api/v1/cards`)).json() as { revision: string };
    expect(snapshot.revision).toBe(bundle.revision);
    const artifact = await (await fetch(`${baseUrl}/api/v1/cards/${encodeURIComponent(bundle.reference)}/artifact`)).json() as { card: { id: string } };
    expect(artifact.card.id).toBe("example.notice");
    const stylesheet = await fetch(`${baseUrl}/forge/api/profiles/octo-chat%401.2.0-rc.4/styles.css`);
    expect(stylesheet.status).toBe(200);
    expect(stylesheet.headers.get("access-control-allow-origin")).toBe("*");
    await expect(stylesheet.text()).resolves.toContain("octo-card-profile");
    const hostConfig = await fetch(`${baseUrl}/forge/api/profiles/octo-chat%401.2.0-rc.4/host-config.json`, {
      headers: { origin: "null" },
    });
    expect(hostConfig.status).toBe(200);
    expect(hostConfig.headers.get("access-control-allow-origin")).toBe("*");
    await expect(hostConfig.json()).resolves.toEqual({});
    const contents = await (await fetch(`${baseUrl}/api/v1/cards/${encodeURIComponent(bundle.reference)}/handoff/contents`)).json() as { files: Array<{ path: string }> };
    expect(contents.files).toEqual([{ path: "README.md", group: "root", previewable: true }]);
    await expect((await fetch(`${baseUrl}/api/v1/cards/${encodeURIComponent(bundle.reference)}/handoff/file?path=README.md`)).text()).resolves.toBe("# Local handoff\n");
  });

  it("stays unready when bundle verification fails", async () => {
    const bundle = await createBundle();
    await writeFile(path.join(bundle.root, "catalog-snapshot.v1.json"), "{}\n");
    const baseUrl = await listen(await createForgeServer({ catalogRoot: bundle.root }));

    const response = await fetch(`${baseUrl}/readyz`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "not_ready" });
    expect((await fetch(`${baseUrl}/api/v1/cards`)).status).toBe(503);
  });

  it("stays unready when the deployed revision does not match the bundle", async () => {
    const bundle = await createBundle();
    const baseUrl = await listen(await createForgeServer({
      catalogRoot: bundle.root,
      catalogRevision: "f".repeat(40),
    }));

    const response = await fetch(`${baseUrl}/readyz`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_ready",
      message: expect.stringContaining("Catalog revision mismatch"),
    });
  });
});
