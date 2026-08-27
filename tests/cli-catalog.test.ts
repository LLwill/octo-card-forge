import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { NOTICE_CARD_ROOT } from "./card-fixtures.js";

const execFileAsync = promisify(execFile);

async function runCli(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("pnpm", ["--silent", "cli", ...args], {
    encoding: "utf8",
  });
  return stdout;
}

describe("explicit Card CLI", () => {
  it("checks an explicit package and reports its identity", async () => {
    const [jsonOutput, textOutput] = await Promise.all([
      runCli("check", "--card", NOTICE_CARD_ROOT, "--format", "json"),
      runCli("check", "--card", NOTICE_CARD_ROOT),
    ]);
    const report = JSON.parse(jsonOutput);

    expect(report).toMatchObject({
      valid: true,
      cards: [{ reference: "example.notice", kind: "draft", mutable: true }],
    });
    expect(textOutput.split(/\r?\n/, 1)[0]).toBe(
      "example.notice@0.1.0\texample.notice\tdraft\tmutable",
    );
  });

  it("rejects the removed repository-wide Card commands", async () => {
    await expect(execFileAsync("pnpm", ["--silent", "cli", "list"])).rejects.toMatchObject({
      code: 1,
    });
    await expect(
      execFileAsync("pnpm", ["--silent", "cli", "check", "example.notice"]),
    ).rejects.toMatchObject({ code: 1 });
  });
});
