import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkCardPackage, checkCards } from "../src/check.js";
import { resolveInProject } from "../src/fs.js";
import { initCard } from "../src/init.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "octo-card-forge-"));
  temporaryRoots.push(root);
  await cp(resolveInProject("render-profiles"), path.join(root, "render-profiles"), {
    recursive: true,
  });
  return root;
}

afterEach(async () => {
  delete process.env.OCTO_CARD_FORGE_ROOT;
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("initCard", () => {
  it("creates a complete card package that passes check", async () => {
    const root = await temporaryRoot();
    const result = await initCard({
      cardId: "docs.share-notification",
      name: "文档分享通知",
      root,
    });

    expect(result.files).toEqual([
      "contract/data.schema.json",
      "manifest.json",
      "samples/default.json",
      "templates/default.template.json",
    ]);
    const manifest = JSON.parse(
      await readFile(path.join(result.root, "manifest.json"), "utf8")
    );
    expect(manifest).toMatchObject({
      id: "docs.share-notification",
      name: "文档分享通知",
      version: "0.1.0",
      schemaVersion: 2,
      renderProfile: "octo-chat@latest",
      views: {
        default: expect.objectContaining({ wireProfile: "octo/v1" }),
      },
    });

    process.env.OCTO_CARD_FORGE_ROOT = root;
    await expect(checkCards("docs.share-notification")).resolves.toMatchObject({
      valid: true,
    });
  });

  it("never overwrites an existing card", async () => {
    const root = await temporaryRoot();
    const options = { cardId: "docs.notice", name: "通知", root };
    await initCard(options);
    await expect(initCard(options)).rejects.toThrow("Card already exists: docs.notice");
  });

  it("can create a standalone card package outside the forge cards directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-card-standalone-"));
    temporaryRoots.push(root);
    const cardRoot = path.join(root, "docs.share-notification");

    const result = await initCard({
      cardId: "docs.share-notification",
      name: "文档分享通知",
      outputRoot: cardRoot,
    });

    expect(result.root).toBe(cardRoot);
    await expect(
      readFile(path.join(cardRoot, "manifest.json"), "utf8")
    ).resolves.toContain('"id": "docs.share-notification"');
    await expect(checkCardPackage(cardRoot)).resolves.toMatchObject({
      valid: true,
    });
  });

  it("rejects an unknown render profile before creating files", async () => {
    const root = await temporaryRoot();
    await expect(
      initCard({
        cardId: "docs.notice",
        name: "通知",
        renderProfile: "unknown-profile@1.0.0",
        root,
      })
    ).rejects.toThrow("Unknown render profile: unknown-profile@1.0.0");
  });

  it.each(["../escape", "Docs.Notice", "docs_notice", "docs/"])(
    "rejects unsafe card id %s",
    async (cardId) => {
      await expect(initCard({ cardId, name: "通知", root: "/tmp" })).rejects.toThrow(
        "card-id must use lowercase"
      );
    }
  );
});
