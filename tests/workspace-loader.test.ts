import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadResolvedCardSource, WorkspaceLoadError } from "../packages/workspace/src/index.js";

describe("workspace source loader", () => {
  it("resolves a checked-in card into a path-free source", async () => {
    const loaded = await loadResolvedCardSource("cards/docs.access-request");
    expect(loaded.root).toMatch(/cards[\\/]docs\.access-request$/);
    expect(loaded.source).toMatchObject({
      formatVersion: 1,
      card: { id: "docs.access-request", namespace: "docs", key: "access-request" },
    });
    expect(JSON.stringify(loaded.source)).not.toContain("manifest.json");
    expect(Object.values(loaded.source.views).every((view) => view.samples.length > 0)).toBe(true);
  });

  it("keeps unsafe asset paths at the workspace boundary", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-workspace-loader-"));
    await mkdir(path.join(root, "contract"), { recursive: true });
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({
      schemaVersion: 2,
      id: "demo.card",
      name: "Demo",
      version: "1.0.0",
      contractVersion: "1.0.0",
      adaptiveCardVersion: "1.5",
      defaultLocale: "en-US",
      dataSchema: "../outside.json",
      views: {
        main: { wireProfile: "octo/v1", template: "template.json", samples: ["sample.json"] },
      },
    }));
    await expect(loadResolvedCardSource(root)).rejects.toBeInstanceOf(WorkspaceLoadError);
  });

  it("rejects assets whose symlink resolves outside the package", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-workspace-symlink-"));
    await mkdir(path.join(root, "contract"), { recursive: true });
    await writeFile(path.join(root, "template.json"), JSON.stringify({ type: "AdaptiveCard", version: "1.5", body: [] }));
    await writeFile(path.join(root, "sample.json"), JSON.stringify({}));
    const outside = path.join(root, "..", "octo-outside-schema.json");
    await writeFile(outside, JSON.stringify({ type: "object" }));
    await symlink(outside, path.join(root, "contract", "data.schema.json"));
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({
      schemaVersion: 2,
      id: "demo.card",
      name: "Demo",
      version: "1.0.0",
      contractVersion: "1.0.0",
      adaptiveCardVersion: "1.5",
      defaultLocale: "en-US",
      dataSchema: "contract/data.schema.json",
      views: { main: { wireProfile: "octo/v1", template: "template.json", samples: ["sample.json"] } },
    }));
    await expect(loadResolvedCardSource(root)).rejects.toBeInstanceOf(WorkspaceLoadError);
  });

  it("reads an in-package symlink through its checked real path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-workspace-internal-symlink-"));
    try {
      await mkdir(path.join(root, "contract"), { recursive: true });
      await writeFile(path.join(root, "schema-target.json"), JSON.stringify({ type: "object" }));
      await symlink(path.join(root, "schema-target.json"), path.join(root, "contract", "data.schema.json"));
      await writeFile(path.join(root, "template.json"), JSON.stringify({ type: "AdaptiveCard", version: "1.5", body: [] }));
      await writeFile(path.join(root, "sample.json"), JSON.stringify({}));
      await writeFile(path.join(root, "manifest.json"), JSON.stringify({
        schemaVersion: 2,
        id: "demo.card",
        name: "Demo",
        version: "1.0.0",
        contractVersion: "1.0.0",
        adaptiveCardVersion: "1.5",
        defaultLocale: "en-US",
        dataSchema: "contract/data.schema.json",
        views: { main: { wireProfile: "octo/v1", template: "template.json", samples: ["sample.json"] } },
      }));

      await expect(loadResolvedCardSource(root)).resolves.toMatchObject({
        source: { dataContract: { type: "object" } },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("distinguishes missing files from invalid JSON", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-workspace-errors-"));
    try {
      await mkdir(path.join(root, "contract"), { recursive: true });
      await writeFile(path.join(root, "template.json"), JSON.stringify({ type: "AdaptiveCard", version: "1.5", body: [] }));
      await writeFile(path.join(root, "sample.json"), JSON.stringify({}));
      await writeFile(path.join(root, "manifest.json"), JSON.stringify({
        schemaVersion: 2,
        id: "demo.card",
        name: "Demo",
        version: "1.0.0",
        contractVersion: "1.0.0",
        adaptiveCardVersion: "1.5",
        defaultLocale: "en-US",
        dataSchema: "contract/data.schema.json",
        views: { main: { wireProfile: "octo/v1", template: "template.json", samples: ["sample.json"] } },
      }));

      await expect(loadResolvedCardSource(root)).rejects.toThrow(
        /dataSchema does not exist/
      );

      await writeFile(path.join(root, "contract", "data.schema.json"), "{not-json");
      await expect(loadResolvedCardSource(root)).rejects.toThrow(/invalid JSON/);
      await expect(loadResolvedCardSource(root)).rejects.not.toThrow(/could not be read/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
