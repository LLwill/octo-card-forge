import { describe, expect, it } from "vitest";
import { compileCard, compileSample } from "../src/compiler.js";
import type { JsonObject } from "../src/types.js";

const CHEVRON_DOWN_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiPjxwYXRoIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ExYTZhYiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjIiIGQ9Im02IDlsNiA2bDYtNiIvPjwvc3ZnPg==";
const CHEVRON_UP_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxZW0iIGhlaWdodD0iMWVtIiB2aWV3Qm94PSIwIDAgMjQgMjQiPjxwYXRoIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ExYTZhYiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjIiIGQ9Im0xOCAxNWwtNi02bC02IDYiLz48L3N2Zz4=";

function findById(value: unknown, id: string): JsonObject | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findById(item, id);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const object = value as JsonObject;
  if (object.id === id) return object;
  for (const child of Object.values(object)) {
    const found = findById(child, id);
    if (found) return found;
  }
  return undefined;
}

describe("docs.access-request 0.3 compiler", () => {
  it.each(["pending", "approved", "rejected"])(
    "compiles the %s sample without errors",
    async (sample) => {
      const result = await compileSample({ cardId: "docs.access-request@0.3.0", sample });
      expect(result.issues).toEqual([]);
      expect(result.payload).toMatchObject({ type: "AdaptiveCard", version: "1.5" });
      expect(JSON.stringify(result.payload)).not.toContain("${");
      expect(result.renderProfile).toBe("octo-chat@1.2.0-rc.3");
      expect(result.wireProfile).toBe(sample === "pending" ? "octo/v2" : "octo/v1");
    }
  );

  it("keeps approval independent from the hidden required denial input", async () => {
    const { payload } = await compileSample({
      cardId: "docs.access-request@0.3.0",
      sample: "pending",
    });
    expect(findById(payload, "approve")?.associatedInputs).toBe("none");
    expect(findById(payload, "rejection_reason")).toMatchObject({
      type: "Input.Text",
      isRequired: true,
      maxLength: 200,
    });
    const result = await compileSample({
      cardId: "docs.access-request@0.3.0",
      sample: "pending",
    });
    expect(result.inspection.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "approve", associatedInputs: "none", inputIds: [] }),
        expect.objectContaining({
          id: "deny",
          associatedInputs: "auto",
          inputIds: ["rejection_reason"],
        }),
      ])
    );
    expect(result.inspection.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "rejection_reason", isVisible: false }),
      ])
    );
  });

  it("renders rejection reason only for the rejected result", async () => {
    const approved = await compileSample({
      cardId: "docs.access-request@0.3.0",
      sample: "approved",
    });
    const rejected = await compileSample({
      cardId: "docs.access-request@0.3.0",
      sample: "rejected",
    });
    expect(JSON.stringify(approved.payload)).not.toContain("拒绝原因：");
    expect(JSON.stringify(rejected.payload)).toContain("拒绝原因：");
  });

  it("rejects missing contract fields", async () => {
    const result = await compileCard({
      cardId: "docs.access-request@0.3.0",
      view: "pending",
      data: { state: "pending" },
    });
    expect(result.payload).toEqual({});
    expect(result.issues.some((issue) => issue.code === "contract.required")).toBe(true);
  });

  it("rejects non-HTTPS business URLs", async () => {
    const sample = await compileSample({
      cardId: "docs.access-request@0.3.0",
      sample: "pending",
    });
    const data = structuredClone(sample.data);
    (data.document as JsonObject).url = "http://example.com/document";
    const result = await compileCard({
      cardId: "docs.access-request@0.3.0",
      view: "pending",
      data,
    });
    expect(result.issues.some((issue) => issue.code === "contract.pattern")).toBe(true);
  });
});

describe("new Card Package versions", () => {
  it.each([
    ["reasoning", "active", "octo/v2"],
    ["answering", "active", "octo/v2"],
    ["completed", "result", "octo/v1"],
    ["stopped", "result", "octo/v1"],
    ["error", "error", "octo/v2"],
  ])("compiles reasoning process 0.2 %s without server actions", async (sample, view, wireProfile) => {
    const result = await compileSample({
      cardId: "ai.reasoning-process@0.2.0",
      sample,
    });

    expect(result.issues).toEqual([]);
    expect(result.cardVersion).toBe("0.2.0");
    expect(result.contractVersion).toBe("1.0.0");
    expect(result.renderProfile).toBe("octo-chat@1.2.0-rc.3");
    expect(result.view).toBe(view);
    expect(result.wireProfile).toBe(wireProfile);
    expect(findById(result.payload, "reasoning_stop")).toBeUndefined();
    expect(findById(result.payload, "reasoning_retry")).toBeUndefined();
    expect(findById(result.payload, "reasoning_toggle")).toMatchObject({
      type: "Action.ToggleVisibility",
    });
  });

  it("compiles the 0.3.1 reasoning package with synchronized title arrows", async () => {
    const result = await compileSample({
      cardId: "ai.reasoning-process@0.3.1",
      sample: "reasoning",
    });

    expect(result.issues).toEqual([]);
    expect(result.cardVersion).toBe("0.3.1");
    expect(result.contractVersion).toBe("1.2.0");
    expect(findById(result.payload, "reasoning_toggle")?.targetElements).toEqual([
      "trace_panel",
      "collapsed_panel",
      "reasoning_toggle_collapsed",
      "reasoning_toggle_expanded",
    ]);
    expect((result.payload.body as JsonObject[])[0]).toMatchObject({
      type: "Container",
      bleed: true,
    });
  });

  it("compiles the AI decision 0.2 choice", async () => {
    const next = await compileSample({
      cardId: "ai.decision-action@0.2.0",
      sample: "choose",
    });

    expect(next.cardVersion).toBe("0.2.0");
    expect(next.renderProfile).toBe("octo-chat@1.2.0-rc.3");
    expect(next.issues).toEqual([]);
    expect(findById(next.payload, "decision_choice")).toMatchObject({
      type: "Input.ChoiceSet",
      value: "interaction",
    });
    expect(findById(next.payload, "decision_send")?.data).toMatchObject({
      effect: "append_user_message",
      reply_target_uid: "octo-assistant",
    });
    expect(findById(next.payload, "octo-surface-header-accent-main")).toMatchObject({
      type: "Container",
      style: "accent",
    });
    expect(findById(next.payload, "octo-surface-footer-default-actions")).toMatchObject({
      type: "Container",
      style: "emphasis",
      bleed: true,
      separator: true,
    });
  });

  it("compiles the docs 0.3 pending card with a white semantic body", async () => {
    const next = await compileSample({
      cardId: "docs.access-request@0.3.0",
      sample: "pending",
    });

    expect(next.cardVersion).toBe("0.3.0");
    expect(next.renderProfile).toBe("octo-chat@1.2.0-rc.3");
    expect(next.issues).toEqual([]);
    expect(next.payload.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "Container", style: "accent" }),
      ])
    );
    expect(findById(next.payload, "octo-badge-warning-request-state")).toMatchObject({
      type: "TextBlock",
      color: "Warning",
    });
    expect(findById(next.payload, "rejection_form")).toMatchObject({
      style: "attention",
      isVisible: false,
    });
    expect(findById(next.payload, "rejection_reason")).toMatchObject({
      type: "Input.Text",
      isRequired: true,
    });
  });
});

describe("ai.reasoning-process compiler", () => {
  it.each([
    ["reasoning", "active", "octo/v2"],
    ["answering", "active", "octo/v2"],
    ["completed", "result", "octo/v1"],
    ["stopped", "result", "octo/v1"],
    ["error", "error", "octo/v2"],
  ])("compiles the %s sample into the %s view", async (sample, view, wireProfile) => {
    const result = await compileSample({
      cardId: "ai.reasoning-process",
      sample,
    });

    expect(result.issues).toEqual([]);
    expect(result.view).toBe(view);
    expect(result.cardVersion).toBe("0.3.1");
    expect(result.contractVersion).toBe("1.2.0");
    expect(result.renderProfile).toBe("octo-chat@1.2.0-rc.3");
    expect(result.wireProfile).toBe(wireProfile);
    expect(JSON.stringify(result.payload)).not.toContain("${");
    expect((result.payload.body as JsonObject[])[0]).toMatchObject({
      type: "Container",
      bleed: true,
    });
  });

  it("keeps the v1.2 producer shape compatible without phaseState", async () => {
    const sample = await compileSample({
      cardId: "ai.reasoning-process",
      sample: "reasoning",
    });
    const data = structuredClone(sample.data);
    for (const phase of data.phases as JsonObject[]) {
      delete phase.phaseState;
    }

    const result = await compileCard({
      cardId: "ai.reasoning-process",
      view: "active",
      data,
    });

    expect(result.issues).toEqual([]);
    expect(result.contractVersion).toBe("1.2.0");
    expect(JSON.stringify(result.payload)).not.toContain("正在深度思考");
  });

  it("exposes only the local toggle interaction for an active trace", async () => {
    const result = await compileSample({
      cardId: "ai.reasoning-process",
      sample: "reasoning",
    });

    expect(findById(result.payload, "reasoning_stop")).toBeUndefined();
    expect(findById(result.payload, "reasoning_toggle")).toMatchObject({
      type: "Action.ToggleVisibility",
      targetElements: [
        "trace_panel",
        "collapsed_panel",
        "reasoning_toggle_collapsed",
        "reasoning_toggle_expanded",
      ],
    });
    expect(findById(result.payload, "reasoning_toggle_collapsed")).toMatchObject({
      type: "Image",
      url: CHEVRON_DOWN_DATA_URL,
      width: "14px",
    });
    expect(findById(result.payload, "reasoning_toggle_expanded")).toMatchObject({
      type: "Image",
      url: CHEVRON_UP_DATA_URL,
      width: "14px",
    });
    expect(JSON.stringify(result.payload)).not.toContain('"text":"●"');
    expect(JSON.stringify(result.payload)).toContain("正在执行下一步");
    expect(findById(result.payload, "reasoning_tools_toggle_collapsed_0")).toMatchObject({
      type: "Image",
      url: CHEVRON_DOWN_DATA_URL,
      width: "14px",
      selectAction: expect.objectContaining({
        type: "Action.ToggleVisibility",
        targetElements: [
          "reasoning_tools_panel_0",
          "reasoning_tools_toggle_collapsed_0",
          "reasoning_tools_toggle_expanded_0",
        ],
      }),
    });
    expect(findById(result.payload, "reasoning_tools_toggle_expanded_0")).toMatchObject({
      type: "Image",
      url: CHEVRON_UP_DATA_URL,
      isVisible: false,
      width: "14px",
    });
    expect(findById(result.payload, "reasoning_tools_panel_0")).toMatchObject({
      type: "Container",
      isVisible: false,
      spacing: "Small",
    });
    expect(JSON.stringify(result.payload)).toContain('"text":"•"');
    expect(findById(result.payload, "trace_panel")?.isVisible).toBe(true);
    expect(findById(result.payload, "collapsed_panel")?.isVisible).toBe(false);
  });

  it("renders a plugin-compatible marker for every phase", async () => {
    const active = await compileSample({
      cardId: "ai.reasoning-process",
      sample: "reasoning",
    });
    const completed = await compileSample({
      cardId: "ai.reasoning-process",
      sample: "completed",
    });

    expect(JSON.stringify(active.payload)).not.toContain('"text":"●"');
    expect(JSON.stringify(completed.payload)).not.toContain('"text":"●"');
    expect(JSON.stringify(active.payload)).not.toContain('"text":"◌"');
    expect(JSON.stringify(completed.payload)).not.toContain('"text":"◌"');
  });

  it("starts a completed trace collapsed and keeps it locally expandable", async () => {
    const result = await compileSample({
      cardId: "ai.reasoning-process",
      sample: "completed",
    });

    expect(findById(result.payload, "trace_panel")?.isVisible).toBe(false);
    expect(findById(result.payload, "collapsed_panel")?.isVisible).toBe(true);
    expect(findById(result.payload, "reasoning_toggle_collapsed")?.isVisible).toBe(true);
    expect(findById(result.payload, "reasoning_toggle_expanded")?.isVisible).toBe(false);
    expect(result.inspection.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "reasoning_toggle",
          type: "Action.ToggleVisibility",
        }),
        expect.objectContaining({
          id: "reasoning_toggle_expanded_action",
          type: "Action.ToggleVisibility",
        }),
        expect.objectContaining({
          id: "reasoning_tools_toggle_action_0",
          type: "Action.ToggleVisibility",
        }),
        expect.objectContaining({
          id: "reasoning_tools_toggle_expanded_action_0",
          type: "Action.ToggleVisibility",
        }),
      ])
    );
  });

  it("keeps the failure details visible without retry actions", async () => {
    const result = await compileSample({
      cardId: "ai.reasoning-process",
      sample: "error",
    });

    expect(findById(result.payload, "reasoning_retry")).toBeUndefined();
    expect(JSON.stringify(result.payload)).toContain("推理服务连接超时");
  });

  it("rejects an error state without user-facing error details", async () => {
    const result = await compileCard({
      cardId: "ai.reasoning-process",
      view: "error",
      data: {
        reasoningId: "reasoning-missing-error-copy",
        state: "error",
        title: "已深度思考",
        statusLabel: "生成失败",
        statusTone: "Attention",
        traceExpanded: false,
        traceCollapsed: true,
        collapsedSummary: "生成已中断",
        phases: [
          {
            phaseState: "completed",
            thought: "读取指标失败。",
            actions: [
              {
                tool: "query_metrics",
                detail: "连接超时",
                statusGlyph: "●",
                statusTone: "Attention",
              },
            ],
          },
        ],
      },
    });

    expect(result.payload).toEqual({});
    expect(result.issues.filter((issue) => issue.code === "contract.required")).toHaveLength(2);
  });
});
