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
  utilities: {
    "surface-subtle": {
      group: "surface",
      appliesTo: ["Container"],
      fallback: { style: "emphasis" },
      description: "Subtle surface",
    },
    "surface-warning": {
      group: "surface",
      appliesTo: ["Container"],
      fallback: { style: "warning" },
      description: "Warning surface",
    },
    "inset-md": {
      group: "inset",
      appliesTo: ["Container"],
      description: "Medium inset",
    },
    "line-skeleton": {
      group: "line",
      appliesTo: ["Container", "TextBlock"],
      description: "Skeleton line",
    },
    "badge-warning": {
      group: "badge",
      appliesTo: ["TextBlock"],
      fallback: {
        size: "Small",
        weight: "Bolder",
        color: "Warning",
      },
      description: "Warning badge",
    },
    "motion-fade-in": {
      group: "motion",
      appliesTo: ["Container", "TextBlock"],
      description: "Fade in",
      deprecated: true,
    },
  },
  utilityRules: {
    maxTokensPerElement: 3,
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

  it("accepts base64 image data URLs when the render profile enables data URLs", () => {
    const imageCapabilities: RenderCapabilities = {
      ...capabilities,
      allowedElements: [...capabilities.allowedElements, "Image"],
      imageUrlSchemes: ["https", "data"],
    };
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Image",
          url: "data:image/svg+xml;base64,PHN2Zy8+",
          altText: "Chevron",
        },
      ],
    };

    expect(validateCompiledCard(payload, imageCapabilities, "octo/v2")).toEqual([]);
  });

  it("rejects non-image or malformed base64 data URLs", () => {
    const imageCapabilities: RenderCapabilities = {
      ...capabilities,
      allowedElements: [...capabilities.allowedElements, "Image"],
      imageUrlSchemes: ["https", "data"],
    };
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        { type: "Image", url: "data:text/html;base64,PGgxPk5vdCBhbiBpbWFnZTwvaDE+" },
        { type: "Image", url: "data:image/png;base64,not-valid-base64!" },
      ],
    };

    expect(validateCompiledCard(payload, imageCapabilities, "octo/v2").filter(
      (issue) => issue.code === "security.invalid_url"
    )).toHaveLength(2);
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

  it("accepts declared utility ids with required fallback", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Container",
          id: "octo--surface-subtle--inset-md--uid-summary",
          style: "emphasis",
          items: [],
        },
        {
          type: "TextBlock",
          id: "octo--badge-warning--uid-state",
          text: "Pending",
          size: "Small",
          weight: "Bolder",
          color: "Warning",
        },
      ],
    };

    expect(validateCompiledCard(payload, capabilities, "octo/v2")).toEqual([]);
  });

  it("rejects invalid utility id syntax and unknown utility tokens", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Container",
          id: "octo--surface_subtle--uid-panel",
          items: [],
        },
        {
          type: "Container",
          id: "octo--surface-magic--uid-panel",
          items: [],
        },
      ],
    };

    const codes = validateCompiledCard(payload, capabilities, "octo/v2").map(
      (issue) => issue.code
    );
    expect(codes).toContain("utility.id_invalid");
    expect(codes).toContain("utility.unknown");
  });

  it("rejects utility appliesTo mismatch and missing fallback", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "TextBlock",
          id: "octo--surface-subtle--uid-wrong-element",
          text: "Wrong element",
          style: "emphasis",
        },
        {
          type: "Container",
          id: "octo--surface-subtle--uid-missing-fallback",
          items: [],
        },
      ],
    };

    const codes = validateCompiledCard(payload, capabilities, "octo/v2").map(
      (issue) => issue.code
    );
    expect(codes).toContain("utility.applies_to");
    expect(codes).toContain("utility.fallback");
  });

  it("rejects same-group utility conflicts and too many tokens", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Container",
          id: "octo--surface-subtle--surface-warning--uid-conflict",
          style: "emphasis",
          items: [],
        },
        {
          type: "Container",
          id: "octo--surface-subtle--inset-md--line-skeleton--motion-fade-in--uid-crowded",
          style: "emphasis",
          items: [],
        },
      ],
    };

    const codes = validateCompiledCard(payload, capabilities, "octo/v2").map(
      (issue) => issue.code
    );
    expect(codes).toContain("utility.group_conflict");
    expect(codes).toContain("utility.too_many_tokens");
  });

  it("warns when a declared utility is deprecated", () => {
    const payload: JsonObject = {
      type: "AdaptiveCard",
      version: "1.5",
      body: [
        {
          type: "Container",
          id: "octo--motion-fade-in--uid-panel",
          items: [],
        },
      ],
    };

    expect(validateCompiledCard(payload, capabilities, "octo/v2")).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "utility.deprecated",
      }),
    ]);
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
