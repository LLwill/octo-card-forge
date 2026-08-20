import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initCard } from "../src/init.js";
import { loadCardPackage } from "../src/registry.js";

describe("Card Package asset boundaries", () => {
  it("rejects manifest paths that escape the package root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-card-assets-"));
    try {
      const cardRoot = path.join(root, "docs-forward");
      await initCard({
        cardId: "docs.forward",
        name: "文档转发",
        preset: "docs-forward",
        outputRoot: cardRoot,
      });
      const manifestPath = path.join(cardRoot, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        dataSchema: string;
      };
      manifest.dataSchema = "../outside.json";
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      await expect(loadCardPackage(cardRoot)).rejects.toThrow(
        "dataSchema must stay inside the card package"
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects sample names that collide across views", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-card-samples-"));
    try {
      const cardRoot = path.join(root, "docs-forward");
      await initCard({
        cardId: "docs.forward",
        name: "文档转发",
        preset: "docs-forward",
        outputRoot: cardRoot,
      });
      const manifestPath = path.join(cardRoot, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        views: Record<string, {
          wireProfile: "octo/v1" | "octo/v2";
          template: string;
          samples: string[];
        }>;
      };
      const existing = Object.values(manifest.views)[0];
      manifest.views.secondary = {
        ...existing,
        samples: ["samples/default.json"],
      };
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      await expect(loadCardPackage(cardRoot)).rejects.toThrow(
        "sample name default must be unique across views"
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
