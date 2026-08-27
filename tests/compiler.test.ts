import { describe, expect, it } from "vitest";
import { CURRENT_RENDER_PROFILE } from "../packages/cli/src/registry.js";
import {
  compileCardDirectory,
  compileSampleFromDirectory,
} from "../packages/cli/src/compiler.js";
import { CHOICE_CARD_ROOT, NOTICE_CARD_ROOT } from "./card-fixtures.js";

describe("explicit Card package compiler", () => {
  it("compiles a sample from a standalone package", async () => {
    const result = await compileSampleFromDirectory({
      cardRoot: NOTICE_CARD_ROOT,
      sample: "default",
    });

    expect(result).toMatchObject({
      cardId: "example.notice",
      cardVersion: "0.1.0",
      contractVersion: "1.0.0",
      renderProfile: CURRENT_RENDER_PROFILE,
      view: "default",
      wireProfile: "octo/v1",
      issues: [],
      payload: { type: "AdaptiveCard", version: "1.5" },
    });
    expect(JSON.stringify(result.payload)).toContain("示例通知卡");
    expect(JSON.stringify(result.payload)).not.toContain("${");
  });

  it("reports data-contract errors before rendering", async () => {
    const result = await compileCardDirectory({
      cardRoot: NOTICE_CARD_ROOT,
      view: "default",
      data: { title: "缺少正文" },
    });

    expect(result.payload).toEqual({});
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "contract.required" })]),
    );
  });

  it("validates URL patterns and preserves interaction inspection", async () => {
    const sample = await compileSampleFromDirectory({
      cardRoot: CHOICE_CARD_ROOT,
      sample: "default",
    });
    expect(sample.issues).toEqual([]);
    expect(sample.wireProfile).toBe("octo/v2");
    expect(sample.inspection.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "open-document", type: "Action.OpenUrl" }),
        expect.objectContaining({ id: "copy-document-link", associatedInputs: "none" }),
      ]),
    );

    const invalidData = structuredClone(sample.data);
    invalidData.documentUrl = "http://example.com/document";
    const invalid = await compileCardDirectory({
      cardRoot: CHOICE_CARD_ROOT,
      view: "default",
      data: invalidData,
    });
    expect(invalid.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "security.url_scheme" })]),
    );
  });

  it("rejects unknown samples and views", async () => {
    await expect(
      compileSampleFromDirectory({ cardRoot: NOTICE_CARD_ROOT, sample: "missing" }),
    ).rejects.toThrow("Unknown sample missing for example.notice");
    await expect(
      compileCardDirectory({ cardRoot: NOTICE_CARD_ROOT, view: "missing", data: {} }),
    ).rejects.toThrow("Unknown view missing for example.notice");
  });
});
