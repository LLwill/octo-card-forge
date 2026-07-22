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

describe("docs.access-request compiler", () => {
  it.each(["pending", "approved", "rejected"])(
    "compiles the %s sample without errors",
    async (sample) => {
      const result = await compileSample({ cardId: "docs.access-request", sample });
      expect(result.issues).toEqual([]);
      expect(result.payload).toMatchObject({ type: "AdaptiveCard", version: "1.5" });
      expect(JSON.stringify(result.payload)).not.toContain("${");
      expect(result.renderProfile).toBe("octo-chat@1.0.0");
      expect(result.wireProfile).toBe(sample === "pending" ? "octo/v2" : "octo/v1");
    }
  );

  it("keeps approval independent from the hidden required denial input", async () => {
    const { payload } = await compileSample({
      cardId: "docs.access-request",
      sample: "pending",
    });
    expect(findById(payload, "approve")?.associatedInputs).toBe("none");
    expect(findById(payload, "deny_reason")).toMatchObject({
      type: "Input.Text",
      isRequired: true,
      maxLength: 200,
    });
    const result = await compileSample({
      cardId: "docs.access-request",
      sample: "pending",
    });
    expect(result.inspection.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "approve", associatedInputs: "none", inputIds: [] }),
        expect.objectContaining({
          id: "deny",
          associatedInputs: "auto",
          inputIds: ["deny_reason"],
        }),
      ])
    );
    expect(result.inspection.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "deny_reason", isVisible: false }),
      ])
    );
  });

  it("renders rejection reason only for the rejected result", async () => {
    const approved = await compileSample({
      cardId: "docs.access-request",
      sample: "approved",
    });
    const rejected = await compileSample({
      cardId: "docs.access-request",
      sample: "rejected",
    });
    expect(JSON.stringify(approved.payload)).not.toContain("拒绝原因：");
    expect(JSON.stringify(rejected.payload)).toContain("拒绝原因：");
  });

  it("rejects missing contract fields", async () => {
    const result = await compileCard({
      cardId: "docs.access-request",
      view: "pending",
      data: { state: "pending" },
    });
    expect(result.payload).toEqual({});
    expect(result.issues.some((issue) => issue.code === "contract.required")).toBe(true);
  });

  it("rejects non-HTTPS business URLs", async () => {
    const sample = await compileSample({
      cardId: "docs.access-request",
      sample: "pending",
    });
    const data = structuredClone(sample.data);
    (data.document as JsonObject).url = "http://example.com/document";
    const result = await compileCard({
      cardId: "docs.access-request",
      view: "pending",
      data,
    });
    expect(result.issues.some((issue) => issue.code === "contract.pattern")).toBe(true);
  });
});

describe("new Card Package versions", () => {
  it("compiles the AI decision 0.2 choice without changing 0.1", async () => {
    const legacy = await compileSample({
      cardId: "ai.decision-action",
      sample: "choose",
    });
    const next = await compileSample({
      cardId: "ai.decision-action@0.2.0",
      sample: "choose",
    });

    expect(legacy.cardVersion).toBe("0.1.0");
    expect(next.cardVersion).toBe("0.2.0");
    expect(next.renderProfile).toBe("octo-chat@1.1.0");
    expect(next.issues).toEqual([]);
    expect(findById(next.payload, "decision_choice")).toMatchObject({
      type: "Input.ChoiceSet",
      value: "interaction",
    });
    expect(findById(next.payload, "decision_send")?.data).toMatchObject({
      effect: "append_user_message",
      reply_target_uid: "octo-assistant",
    });
    expect(findById(next.payload, "octo-surface-accent-header")).toMatchObject({
      type: "Container",
      style: "accent",
    });
    expect(findById(next.payload, "octo-surface-default-footer")).toMatchObject({
      type: "Container",
      style: "emphasis",
      bleed: true,
      separator: true,
    });
  });

  it("compiles the docs 0.3 pending card with a white semantic body", async () => {
    const legacy = await compileSample({
      cardId: "docs.access-request",
      sample: "pending",
    });
    const next = await compileSample({
      cardId: "docs.access-request@0.3.0",
      sample: "pending",
    });

    expect(legacy.cardVersion).toBe("0.2.0");
    expect(next.cardVersion).toBe("0.3.0");
    expect(next.renderProfile).toBe("octo-chat@1.1.0");
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
