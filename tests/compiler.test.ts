import { describe, expect, it } from "vitest";
import { compileCard, compileSample } from "../src/compiler.js";
import type { JsonObject } from "../src/types.js";

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
      expect(result.renderProfile).toBe("octo-chat@1.2.0-rc.2");
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
  it("compiles the AI decision 0.2 choice", async () => {
    const next = await compileSample({
      cardId: "ai.decision-action@0.2.0",
      sample: "choose",
    });

    expect(next.cardVersion).toBe("0.2.0");
    expect(next.renderProfile).toBe("octo-chat@1.2.0-rc.2");
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
    expect(next.renderProfile).toBe("octo-chat@1.2.0-rc.2");
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
    ["reasoning", "active"],
    ["answering", "active"],
    ["completed", "result"],
    ["stopped", "result"],
    ["error", "error"],
  ])("compiles the %s sample into the %s view", async (sample, view) => {
    const result = await compileSample({
      cardId: "ai.reasoning-process",
      sample,
    });

    expect(result.issues).toEqual([]);
    expect(result.view).toBe(view);
    expect(result.cardVersion).toBe("0.1.0");
    expect(result.contractVersion).toBe("1.0.0");
    expect(result.renderProfile).toBe("octo-chat@1.2.0-rc.2");
    expect(result.wireProfile).toBe("octo/v2");
    expect(JSON.stringify(result.payload)).not.toContain("${");
  });

  it("exposes stable stop and toggle interactions for an active trace", async () => {
    const result = await compileSample({
      cardId: "ai.reasoning-process",
      sample: "reasoning",
    });

    expect(findById(result.payload, "reasoning_stop")).toMatchObject({
      type: "Action.Submit",
      associatedInputs: "none",
      data: {
        action: "reasoning_stop",
        effect: "stop_reasoning",
        reasoning_id: "reasoning-channel-b-001",
      },
    });
    expect(findById(result.payload, "reasoning_toggle")).toMatchObject({
      type: "Action.ToggleVisibility",
      targetElements: ["trace_panel", "collapsed_panel"],
    });
    expect(findById(result.payload, "trace_panel")?.isVisible).toBe(true);
    expect(findById(result.payload, "collapsed_panel")?.isVisible).toBe(false);
  });

  it("starts a completed trace collapsed and keeps it locally expandable", async () => {
    const result = await compileSample({
      cardId: "ai.reasoning-process",
      sample: "completed",
    });

    expect(findById(result.payload, "trace_panel")?.isVisible).toBe(false);
    expect(findById(result.payload, "collapsed_panel")?.isVisible).toBe(true);
    expect(result.inspection.actions).toEqual([
      expect.objectContaining({
        id: "reasoning_toggle",
        type: "Action.ToggleVisibility",
      }),
    ]);
  });

  it("exposes a retry action with the reasoning identifier after failure", async () => {
    const result = await compileSample({
      cardId: "ai.reasoning-process",
      sample: "error",
    });

    expect(findById(result.payload, "reasoning_retry")).toMatchObject({
      type: "Action.Submit",
      associatedInputs: "none",
      data: {
        action: "reasoning_retry",
        effect: "retry_reasoning",
        reasoning_id: "reasoning-channel-b-003",
      },
    });
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
        timerText: "已中断",
        traceExpanded: false,
        traceCollapsed: true,
        collapsedSummary: "生成已中断",
        phases: [
          {
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
