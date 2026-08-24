import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initCard } from "../packages/cli/src/init.js";
import { verifyCardPackage, verifySummary } from "../packages/cli/src/verify.js";

describe("repo-free card verify", () => {
  it("verifies all samples and can emit cards and handoff together", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-card-verify-"));
    try {
      const cardRoot = path.join(root, "docs-forward");
      const emitDir = path.join(root, "compiled");
      const handoffDir = path.join(root, "handoff");
      await initCard({
        cardId: "docs.forward",
        name: "文档转发",
        preset: "docs-forward",
        outputRoot: cardRoot,
      });

      const report = await verifyCardPackage({
        cardRoot,
        emitDir,
        handoffDir,
      });
      const summary = verifySummary(report);

      expect(report.valid).toBe(true);
      expect(report.samples).toHaveLength(1);
      expect(report.samples[0]?.output).toBe(
        path.join(emitDir, "default.default.card.json")
      );
      await expect(readFile(report.samples[0]!.output!, "utf8")).resolves.toContain(
        '"type": "AdaptiveCard"'
      );
      expect(report.handoff?.filePath).toMatch(/docs\.forward@0\.1\.0\.handoff\.zip$/);
      expect(summary).toMatchObject({
        valid: true,
        card: { id: "docs.forward", version: "0.1.0" },
        samples: [{ valid: true }],
        handoff: { bytes: expect.any(Number) },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an unknown sample instead of silently verifying nothing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-card-verify-"));
    try {
      const cardRoot = path.join(root, "docs-forward");
      await initCard({
        cardId: "docs.forward",
        name: "文档转发",
        preset: "docs-forward",
        outputRoot: cardRoot,
      });

      await expect(
        verifyCardPackage({ cardRoot, sample: "missing" })
      ).rejects.toThrow("Unknown sample missing");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires a versioned package for the release gate", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-card-verify-"));
    try {
      const cardRoot = path.join(root, "docs-forward");
      await initCard({
        cardId: "docs.forward",
        name: "文档转发",
        preset: "docs-forward",
        outputRoot: cardRoot,
      });

      await expect(
        verifyCardPackage({ cardRoot, release: true })
      ).rejects.toThrow("Release verification requires a versioned package");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
