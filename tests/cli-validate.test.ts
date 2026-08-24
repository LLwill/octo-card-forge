import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CURRENT_RENDER_PROFILE } from "../src/registry.js";

const execFileAsync = promisify(execFile);

describe("standalone Adaptive Card validation", () => {
  it("validates a raw card JSON file without a Card Package", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "octo-card-json-"));
    const input = path.join(root, "card.json");
    await writeFile(
      input,
      `${JSON.stringify(
        {
          type: "AdaptiveCard",
          version: "1.5",
          body: [{ type: "TextBlock", text: "One-time message", wrap: true }],
        },
        null,
        2
      )}\n`
    );

    const { stdout } = await execFileAsync(
      "pnpm",
      ["--silent", "cli", "validate", "--input", input, "--format", "json"],
      { encoding: "utf8" }
    );
    const report = JSON.parse(stdout) as {
      valid: boolean;
      profile: string;
      wireProfile: string;
      issues: unknown[];
    };

    expect(report).toMatchObject({
      valid: true,
      profile: CURRENT_RENDER_PROFILE,
      wireProfile: "octo/v1",
      issues: [],
    });
  });
});
