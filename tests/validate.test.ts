import { describe, expect, it } from "vitest";
import { inspectCard } from "../src/inspect.js";
import { validateCompiledCard } from "../src/validate.js";
import type { JsonObject, RenderCapabilities } from "../src/types.js";

const capabilities: RenderCapabilities = {
  maxAdaptiveCardVersion: "1.5",
  allowedElements: ["TextBlock", "Container", "ActionSet", "Input.Text"],
  allowedActions: ["Action.Submit", "Action.ToggleVisibility"],
  components: {
    "octo-badge": {
      appliesTo: ["TextBlock"],
      variants: {
        warning: {
          fallback: {
            size: "Small",
            weight: "Bolder",
            color: "Warning",
          },
        },
      },
    },
    "octo-surface": {
      appliesTo: ["Container"],
      variants: {
        "header-accent": {
          fallback: {
            style: "accent",
          },
        },
      },
    },
  },
  maxNodes: 20,
  maxDepth: 20,
  maxPayloadBytes: 10_000,
  imageUrlSchemes: ["https"],
  openUrlSchemes: ["https"],
};

describe("render and wire profile validation", () => {
  it("detects unsupported elements and actions", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        { type: "Media" },
        { type: "ActionSet", actions: [{ type: "Action.Execute" }] },
      ],
    };
    const codes = validateCompiledCard(payload, capabilities, "octo/v2").map(
      (issue) => issue.code
    );
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
    expect(validateCompiledCard(payload, capabilities, "octo/v2")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "interaction.toggle_target_missing" }),
      ])
    );
  });

  it("enforces octo/v1 interaction boundaries and standard properties", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        { type: "Input.Text", id: "reason", isRequired: true },
        {
          type: "ActionSet",
          actions: [
            {
              type: "Action.Submit",
              title: "Submit",
              associatedInputs: "invalid",
              data: "invalid",
            },
          ],
        },
      ],
    };
    const codes = validateCompiledCard(payload, capabilities, "octo/v1").map(
      (issue) => issue.code
    );
    expect(codes).toContain("wire_profile.input_unsupported");
    expect(codes).toContain("wire_profile.action_unsupported");
    expect(codes).toContain("interaction.submit_id");
    expect(codes).toContain("interaction.associated_inputs");
    expect(codes).toContain("interaction.submit_data");
  });

  it("treats TableRow and TableCell as structural children of an allowed Table", () => {
    const tableCapabilities: RenderCapabilities = {
      ...capabilities,
      allowedElements: [...capabilities.allowedElements, "Table"],
    };
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Table",
          columns: [{ width: 1 }],
          rows: [
            {
              type: "TableRow",
              cells: [
                {
                  type: "TableCell",
                  items: [{ type: "TextBlock", text: "Cell" }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(validateCompiledCard(payload, tableCapabilities, "octo/v2")).toEqual([]);
  });

  it("accepts declared platform component ids with required fallback", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Container",
          id: "octo-surface-header-accent-main",
          style: "accent",
          items: [
            {
              type: "TextBlock",
              id: "octo-badge-warning-state",
              text: "Pending",
              size: "Small",
              weight: "Bolder",
              color: "Warning",
            },
          ],
        },
      ],
    };

    expect(validateCompiledCard(payload, capabilities, "octo/v2")).toEqual([]);
  });

  it("rejects unknown platform component variants and missing fallback", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "TextBlock",
          id: "octo-badge-pending-state",
          text: "Pending",
          size: "Small",
          weight: "Bolder",
          color: "Warning",
        },
        {
          type: "TextBlock",
          id: "octo-badge-warning-state-2",
          text: "Pending",
          size: "Small",
        },
        {
          type: "Container",
          id: "octo-badge-warning-container",
          style: "emphasis",
        },
      ],
    };

    const codes = validateCompiledCard(payload, capabilities, "octo/v2").map(
      (issue) => issue.code
    );
    expect(codes).toContain("component.unknown");
    expect(codes).toContain("component.fallback");
    expect(codes).toContain("component.applies_to");
  });
});

describe("standard interaction inspection", () => {
  it("derives actions and inputs from compiled card JSON", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Input.Text",
          id: "deny_reason",
          isRequired: true,
          isVisible: false,
          maxLength: 200,
        },
      ],
      actions: [
        {
          type: "Action.Submit",
          id: "approve",
          associatedInputs: "none",
          data: { decision: "approve", request_id: "REQ-1" },
        },
        { type: "Action.Submit", id: "deny", data: { decision: "deny" } },
      ],
    };

    expect(inspectCard(payload)).toMatchObject({
      actions: [
        {
          id: "approve",
          associatedInputs: "none",
          inputIds: [],
          dataKeys: ["decision", "request_id"],
        },
        {
          id: "deny",
          associatedInputs: "auto",
          inputIds: ["deny_reason"],
          dataKeys: ["decision"],
        },
      ],
      inputs: [
        {
          id: "deny_reason",
          isRequired: true,
          isVisible: false,
          maxLength: 200,
        },
      ],
    });
  });
});
