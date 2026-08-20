import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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
});
