import { describe, expect, it } from "vitest";
import { inspectCard } from "../src/inspect.js";
import {
  RUNTIME_CAPABILITIES,
  validateRuntimeEffects,
} from "../src/runtime-capabilities.js";
import type { JsonObject } from "../src/types.js";

const card: JsonObject = {
  type: "AdaptiveCard",
  version: "1.5",
  body: [
    {
      type: "Input.ChoiceSet",
      id: "decision_choice",
      choices: [{ title: "继续执行", value: "continue" }],
    },
  ],
  actions: [
    {
      type: "Action.Submit",
      id: "decision_send",
      data: {
        effect: "send_current_user_message",
        effect_version: 1,
        effect_required: true,
        message_source: { type: "choice_labels", input_id: "decision_choice" },
      },
    },
  ],
};

describe("runtime capabilities", () => {
  it("keeps local behavior separate from the render profile and inspects its source", () => {
    expect(RUNTIME_CAPABILITIES.find((item) => item.id === "message.send.current_user"))
      .toMatchObject({ status: "supported" });
    expect(inspectCard(card).actions[0]).toMatchObject({
      effect: "send_current_user_message",
      effectVersion: 1,
      messageSource: { type: "choice_labels", input_id: "decision_choice" },
    });
  });

  it("requires a declared capability and rejects an unbounded source", () => {
    expect(validateRuntimeEffects(card, [
      { id: "message.send.current_user", version: ">=1.0.0 <2.0.0", required: true },
    ])).toEqual([]);

    const invalid = JSON.parse(JSON.stringify(card)) as JsonObject;
    const action = (invalid.actions as JsonObject[])[0];
    (action.data as JsonObject).message_source = { type: "arbitrary_template" };
    expect(validateRuntimeEffects(invalid, [])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "runtime.capability_undeclared" }),
        expect.objectContaining({ code: "runtime.message_source_type" }),
      ])
    );
  });

  it("rejects a source that references a missing or wrong input type", () => {
    const invalid = JSON.parse(JSON.stringify(card)) as JsonObject;
    const action = (invalid.actions as JsonObject[])[0];
    (action.data as JsonObject).message_source = {
      type: "input_text",
      input_id: "decision_choice",
    };
    expect(validateRuntimeEffects(invalid, [
      { id: "message.send.current_user", version: ">=1.0.0 <2.0.0", required: true },
    ])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "runtime.message_source_input_type" }),
      ])
    );
  });
});
