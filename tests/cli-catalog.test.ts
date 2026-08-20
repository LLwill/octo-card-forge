import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

async function runCli(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("pnpm", ["--silent", "cli", ...args], {
    encoding: "utf8",
  });
  return stdout;
}

describe("catalog CLI output", () => {
  it("lists distinct draft and release references as JSON", async () => {
    const [jsonOutput, textOutput] = await Promise.all([
      runCli("list", "--format", "json"),
      runCli("list"),
    ]);
    const report = JSON.parse(jsonOutput) as {
      cards: Array<{
        reference: string;
        kind: "draft" | "release";
        mutable: boolean;
        id: string;
        version: string;
      }>;
    };

    const references = report.cards.map((card) => card.reference);
    expect(new Set(references).size).toBe(references.length);
    expect(report.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reference: "ai.reasoning-process",
          kind: "draft",
          mutable: true,
          version: "0.3.1",
        }),
        expect.objectContaining({
          reference: "ai.reasoning-process@0.3.1",
          kind: "release",
          mutable: false,
          version: "0.3.1",
        }),
      ])
    );
    const draftLine = textOutput
      .trim()
      .split(/\r?\n/)
      .find((line) => line.includes("\tai.reasoning-process\tdraft\tmutable"));
    expect(draftLine?.split("\t").slice(0, 4)).toEqual([
      "ai.reasoning-process",
      "0.3.1",
      "contract 1.2.0",
      "推理过程卡",
    ]);
  });

  it("checks a draft by stable id and reports its package identity", async () => {
    const [jsonOutput, textOutput] = await Promise.all([
      runCli("check", "docs.access-request", "--format", "json"),
      runCli("check", "docs.access-request"),
    ]);
    const report = JSON.parse(jsonOutput) as {
      valid: boolean;
      cards: Array<{
        reference: string;
        kind: "draft" | "release";
        mutable: boolean;
      }>;
    };

    expect(report).toMatchObject({
      valid: true,
      cards: [
        {
          reference: "docs.access-request",
          kind: "draft",
          mutable: true,
        },
      ],
    });
    expect(textOutput.split(/\r?\n/, 1)[0]).toBe(
      "docs.access-request@0.2.0\tdocs.access-request\tdraft\tmutable"
    );
  });
});
