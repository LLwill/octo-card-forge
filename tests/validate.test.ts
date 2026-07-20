import { describe, expect, it } from "vitest";
import { validateCompiledCard, validateInteractions } from "../src/validate.js";
import type {
  HostCapabilities,
  InteractionContract,
  JsonObject,
} from "../src/types.js";

const capabilities: HostCapabilities = {
  maxAdaptiveCardVersion: "1.5",
  allowedElements: ["TextBlock", "Container", "ActionSet", "Input.Text"],
  allowedActions: ["Action.Submit", "Action.ToggleVisibility"],
  maxNodes: 20,
  maxDepth: 20,
  maxPayloadBytes: 10_000,
  imageUrlSchemes: ["https"],
  openUrlSchemes: ["https"],
};

describe("host validation", () => {
  it("detects unsupported elements and actions", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        { type: "Media" },
        { type: "ActionSet", actions: [{ type: "Action.Execute" }] },
      ],
    };
    const codes = validateCompiledCard(payload, capabilities).map((issue) => issue.code);
    expect(codes).toContain("host.element_unsupported");
    expect(codes).toContain("host.action_unsupported");
  });

  it("detects missing ToggleVisibility targets", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "ActionSet",
          actions: [
            { type: "Action.ToggleVisibility", targetElements: ["missing_panel"] },
          ],
        },
      ],
    };
    expect(validateCompiledCard(payload, capabilities)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "interaction.toggle_target_missing" }),
      ])
    );
  });
});

describe("interaction contract validation", () => {
  const contract: InteractionContract = {
    actions: {
      approve: { type: "Action.Submit", associatedInputs: "none" },
      deny: { type: "Action.Submit", requiredInputs: ["deny_reason"] },
    },
    inputs: {
      deny_reason: { type: "string", required: true, maxLength: 200 },
    },
    localState: {
      mutuallyExclusive: [["deny_panel", "primary_actions"]],
    },
  };

  it("detects broken submit and input guarantees", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        { type: "Container", id: "deny_panel", items: [] },
        { type: "ActionSet", id: "primary_actions", actions: [] },
        { type: "Action.Submit", id: "approve" },
        { type: "Action.Submit", id: "deny" },
        { type: "Input.Text", id: "deny_reason", isRequired: false, maxLength: 100 },
      ],
    };
    const codes = validateInteractions(payload, contract).map((issue) => issue.code);
    expect(codes).toContain("contract.associated_inputs");
    expect(codes).toContain("contract.required_input_optional");
    expect(codes).toContain("contract.input_required");
    expect(codes).toContain("contract.input_max_length");
    expect(codes).toContain("contract.mutual_exclusion");
  });
});
