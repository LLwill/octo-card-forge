import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  artifactSha256,
  verifyCardArtifact,
} from "@mlt-org/octo-card-artifact";
import type { CardArtifactV1 } from "@mlt-org/octo-card-spec";

const execFileAsync = promisify(execFile);
const cliEntry = path.resolve("packages/cli/src/bin.ts");
const cardRoot = path.resolve("tests/fixtures/cards/example.choice");

function node(args: string[], opts?: { cwd?: string }) {
  return execFileAsync(
    "npx",
    ["--yes", "tsx", cliEntry, ...args],
    { cwd: opts?.cwd ?? process.cwd(), timeout: 30000 }
  );
}

describe("Artifact consumer fixture (repo-free consumption)", () => {
  it("built artifact JSON is self-contained: parsed, verified, and inspected without Forge source", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "octo-artifact-consumer-"));
    const artifactPath = path.join(tmpDir, "artifact.json");
    try {
      await node(["artifact", "build", "--card", cardRoot, "--out", artifactPath]);

      const raw = await readFile(artifactPath, "utf8");
      const artifact: CardArtifactV1 = JSON.parse(raw);

      expect(artifact.formatVersion).toBe(1);
      expect(artifact.mediaType).toBe(
        "application/vnd.octo.card-artifact+json;version=1"
      );
      expect(artifact.card.id).toBe("example.choice");
      expect(artifact.profile.reference).toMatch(/^octo-chat@\d+\.\d+\.\d+/);
      expect(artifact.profile.manifest.id).toBe("octo-chat");
      expect(artifact.profile.capabilities.allowedElements).toContain("TextBlock");
      expect(artifact.dataContract).toBeDefined();
      expect(Object.keys(artifact.views).length).toBeGreaterThan(0);

      for (const [, view] of Object.entries(artifact.views) as [
        string,
        CardArtifactV1["views"][string],
      ][]) {
        expect(view.template).toBeDefined();
        expect(view.samples.length).toBeGreaterThan(0);
        for (const sample of view.samples) {
          expect(sample.name).toBeTruthy();
          expect(sample.card).toBeDefined();
          expect(sample.card.type).toBe("AdaptiveCard");
          expect(sample.inspection).toBeDefined();
        }
      }

      const digest = artifactSha256(artifact);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);

      const reverified = verifyCardArtifact(raw, digest);
      expect(reverified.valid).toBe(true);
      expect(reverified.sha256).toBe(digest);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("verify CLI exits non-zero on tampered artifact (JSON mode)", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "octo-artifact-verify-"));
    const artifactPath = path.join(tmpDir, "artifact.json");
    try {
      await node(["artifact", "build", "--card", cardRoot, "--out", artifactPath]);
      const original: CardArtifactV1 = JSON.parse(await readFile(artifactPath, "utf8"));
      const correctDigest = artifactSha256(original);

      const tampered = { ...original, card: { ...original.card, name: "TAMPERED" } };
      const tamperedPath = path.join(tmpDir, "tampered.json");
      await writeFile(tamperedPath, JSON.stringify(tampered));

      let exitCode = 0;
      let stdout = "";
      try {
        const r = await node([
          "artifact", "verify", tamperedPath, "--sha256", correctDigest, "--format", "json",
        ]);
        stdout = r.stdout;
      } catch (err: any) {
        exitCode = err.status ?? 1;
        stdout = err.stdout ?? "";
      }

      expect(exitCode).toBe(1);
      const result = JSON.parse(stdout);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i: any) => i.code === "artifact.digest_mismatch")).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("verify CLI exits zero for a matching artifact (text mode)", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "octo-artifact-verify-ok-"));
    const artifactPath = path.join(tmpDir, "artifact.json");
    try {
      const { stdout: buildOut } = await node([
        "artifact", "build", "--card", cardRoot, "--out", artifactPath, "--format", "json",
      ]);
      const { sha256 } = JSON.parse(buildOut);
      const { stdout } = await node([
        "artifact", "verify", artifactPath, "--sha256", sha256,
      ]);
      expect(stdout).toContain("✓ Valid artifact");
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
