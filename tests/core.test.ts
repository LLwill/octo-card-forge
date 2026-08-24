import { describe, expect, it } from "vitest";
import {
  compileCardSource,
  inspectCard,
  validateCompiledCard,
  type JsonObject,
  type ResolvedCardSource,
  type RenderCapabilities,
} from "../packages/core/src/index.js";

const capabilities: RenderCapabilities = {
  schemaVersion: 1,
  maxAdaptiveCardVersion: "1.5",
  allowedElements: ["TextBlock", "Container", "ActionSet", "Input.Text"],
  allowedActions: ["Action.Submit", "Action.ToggleVisibility"],
  utilities: {
    "surface-subtle": {
      group: "surface",
      appliesTo: ["Container"],
      fallback: { style: "emphasis" },
      description: "Subtle surface",
    },
  },
  utilityRules: { maxTokensPerElement: 3 },
  maxNodes: 20,
  maxDepth: 20,
  maxPayloadBytes: 10_000,
  imageUrlSchemes: ["https"],
  openUrlSchemes: ["https"],
};

const source = {
  formatVersion: 1,
  card: {
    id: "demo.card",
    namespace: "demo",
    key: "card",
    name: "Demo Card",
    version: "1.0.0",
    contractVersion: "1.0.0",
    adaptiveCardVersion: "1.5",
    defaultLocale: "en-US",
  },
  dataContract: {
    type: "object",
    additionalProperties: false,
    required: ["title"],
    properties: { title: { type: "string", minLength: 1 } },
  },
  views: {
    main: {
      wireProfile: "octo/v2",
      template: {
        type: "AdaptiveCard",
        version: "1.5",
        body: [{ type: "TextBlock", text: "${title}" }],
      },
      samples: [],
    },
    legacy: {
      wireProfile: "octo/v2",
      template: {
        type: "AdaptiveCard",
        version: "1.4",
        body: [{ type: "TextBlock", text: "${title}" }],
      },
      samples: [],
    },
  },
} as unknown as ResolvedCardSource;

describe("pure card core", () => {
  it("inspects inputs, submits, and visibility toggles", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        { type: "Input.Text", id: "reason", isRequired: true },
        {
          type: "Container",
          id: "details",
          isVisible: false,
          items: [{ type: "Input.ChoiceSet", id: "kind", choices: [{ value: "a" }] }],
        },
        {
          type: "ActionSet",
          actions: [
            {
              type: "Action.Submit",
              id: "submit",
              data: { action: "request" },
            },
            {
              type: "Action.ToggleVisibility",
              targetElements: [{ elementId: "details", isVisible: true }],
            },
          ],
        },
      ],
    };

    expect(inspectCard(payload)).toEqual({
      inputs: [
        {
          path: "$.body[0]",
          id: "reason",
          type: "Input.Text",
          isRequired: true,
          isVisible: true,
        },
        {
          path: "$.body[1].items[0]",
          id: "kind",
          type: "Input.ChoiceSet",
          isRequired: false,
          isVisible: false,
          isMultiSelect: false,
          choiceValues: ["a"],
        },
      ],
      actions: [
        {
          path: "$.body[2].actions[0]",
          id: "submit",
          type: "Action.Submit",
          associatedInputs: "auto",
          dataKeys: ["action"],
          inputIds: ["reason", "kind"],
        },
        {
          path: "$.body[2].actions[1]",
          type: "Action.ToggleVisibility",
        },
      ],
      toggles: [
        {
          path: "$.body[2].actions[1]",
          targets: [{ elementId: "details", isVisible: true }],
        },
      ],
    });
  });

  it("validates a supported payload without filesystem or profile loading", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Container",
          id: "octo--surface-subtle--uid-panel",
          style: "emphasis",
          items: [{ type: "TextBlock", text: "Ready" }],
        },
      ],
    };

    expect(validateCompiledCard(payload, capabilities, "octo/v2")).toEqual([]);
  });

  it("compiles a resolved source from objects only", () => {
    const result = compileCardSource({
      source,
      view: "main",
      data: { title: "Ready" },
      profile: { reference: "octo-chat@1.2.0", capabilities },
    });

    expect(result).toMatchObject({
      cardId: "demo.card",
      cardVersion: "1.0.0",
      contractVersion: "1.0.0",
      renderProfile: "octo-chat@1.2.0",
      wireProfile: "octo/v2",
      view: "main",
      issues: [],
      payload: {
        type: "AdaptiveCard",
        version: "1.5",
        body: [{ type: "TextBlock", text: "Ready" }],
      },
    });
  });

  it("returns data contract issues without expanding an invalid input", () => {
    const result = compileCardSource({
      card: source,
      view: "main",
      data: {},
      profile: { manifest: { id: "octo-chat", version: "1.2.0" }, capabilities },
    });

    expect(result.payload).toEqual({});
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "contract.required", path: "$" }),
    ]);
  });

  it("reports a template Adaptive Card version mismatch", () => {
    const result = compileCardSource({
      source,
      view: "legacy",
      data: { title: "Ready" },
      profile: { reference: "octo-chat@1.2.0", capabilities },
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "schema.adaptive_card_version" }),
      ])
    );
  });

  it("reports structural, wire, and interaction violations", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        { type: "TextBlock" },
        { type: "Input.Text", id: "reason" },
        {
          type: "ActionSet",
          actions: [
            {
              type: "Action.Submit",
              associatedInputs: "invalid",
              data: "invalid",
            },
            { type: "Action.ToggleVisibility", targetElements: ["missing"] },
          ],
        },
      ],
    };

    const codes = validateCompiledCard(payload, capabilities, "octo/v1").map(
      (issue) => issue.code
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        "schema.required_property",
        "wire_profile.input_unsupported",
        "wire_profile.action_unsupported",
        "interaction.submit_id",
        "interaction.associated_inputs",
        "interaction.submit_data",
        "interaction.toggle_target_missing",
      ])
    );
  });
});
