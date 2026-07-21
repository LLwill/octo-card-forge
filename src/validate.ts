import type {
  JsonObject,
  RenderCapabilities,
  ValidationIssue,
  WireProfile,
} from "./types.js";

const ACTION_PREFIX = "Action.";
const INPUT_PREFIX = "Input.";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareVersion(a: string, b: string): number {
  const aa = a.split(".").map(Number);
  const bb = b.split(".").map(Number);
  return (aa[0] ?? 0) - (bb[0] ?? 0) || (aa[1] ?? 0) - (bb[1] ?? 0);
}

export function validateCompiledCard(
  payload: JsonObject,
  capabilities: RenderCapabilities,
  wireProfile: WireProfile
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const toggleTargets: Array<{ path: string; id: string }> = [];
  let nodes = 0;
  let maxDepth = 0;

  const error = (code: string, path: string, message: string) =>
    issues.push({ severity: "error", code, path, message });

  if (payload.type !== "AdaptiveCard") {
    error("schema.root_type", "$.type", 'Root type must be "AdaptiveCard"');
  }
  if (typeof payload.version !== "string") {
    error("schema.version", "$.version", "Adaptive Card version is required");
  } else if (
    compareVersion(payload.version, capabilities.maxAdaptiveCardVersion) > 0
  ) {
    error(
      "host.version_unsupported",
      "$.version",
      `Card ${payload.version} exceeds host ${capabilities.maxAdaptiveCardVersion}`
    );
  }

  const walk = (value: unknown, path: string, depth: number): void => {
    maxDepth = Math.max(maxDepth, depth);
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (!isObject(value)) return;

    const type = typeof value.type === "string" ? value.type : undefined;
    if (type) {
      nodes++;
      if (type.startsWith(ACTION_PREFIX)) {
        if (!capabilities.allowedActions.includes(type)) {
          error("host.action_unsupported", `${path}.type`, `${type} is not allowed`);
        }
        if (wireProfile === "octo/v1" && type === "Action.Submit") {
          error(
            "wire_profile.action_unsupported",
            `${path}.type`,
            "Action.Submit requires octo/v2"
          );
        }
      } else if (type !== "AdaptiveCard" && type !== "TextRun") {
        if (!capabilities.allowedElements.includes(type)) {
          error("host.element_unsupported", `${path}.type`, `${type} is not allowed`);
        }
        if (wireProfile === "octo/v1" && type.startsWith(INPUT_PREFIX)) {
          error(
            "wire_profile.input_unsupported",
            `${path}.type`,
            `${type} requires octo/v2`
          );
        }
      }

      if (value.id !== undefined) {
        if (typeof value.id !== "string" || value.id.trim() === "") {
          error("schema.invalid_id", `${path}.id`, "id must be a non-empty string");
        } else if (ids.has(value.id)) {
          error("schema.duplicate_id", `${path}.id`, `Duplicate id: ${value.id}`);
        } else {
          ids.add(value.id);
        }
      }

      if (value.isVisible !== undefined && typeof value.isVisible !== "boolean") {
        error("schema.is_visible", `${path}.isVisible`, "isVisible must be boolean");
      }

      if (type === "Action.Submit") {
        if (typeof value.id !== "string" || value.id.trim() === "") {
          error("interaction.submit_id", `${path}.id`, "Action.Submit requires an id");
        }
        if (
          value.associatedInputs !== undefined &&
          value.associatedInputs !== "auto" &&
          value.associatedInputs !== "none"
        ) {
          error(
            "interaction.associated_inputs",
            `${path}.associatedInputs`,
            'associatedInputs must be "auto" or "none"'
          );
        }
        if (value.data !== undefined && !isObject(value.data)) {
          error("interaction.submit_data", `${path}.data`, "Action.Submit.data must be an object");
        }
      }

      if (type === "Action.ToggleVisibility") {
        const targets = Array.isArray(value.targetElements)
          ? value.targetElements
          : [];
        if (targets.length === 0) {
          error(
            "interaction.toggle_targets",
            `${path}.targetElements`,
            "ToggleVisibility requires targets"
          );
        }
        targets.forEach((target, index) => {
          const id =
            typeof target === "string"
              ? target
              : isObject(target) && typeof target.elementId === "string"
                ? target.elementId
                : "";
          if (!id) {
            error(
              "interaction.toggle_target_invalid",
              `${path}.targetElements[${index}]`,
              "Toggle target id is required"
            );
          } else {
            toggleTargets.push({ path: `${path}.targetElements[${index}]`, id });
          }
          if (
            isObject(target) &&
            target.isVisible !== undefined &&
            typeof target.isVisible !== "boolean"
          ) {
            error(
              "interaction.toggle_target_visibility",
              `${path}.targetElements[${index}].isVisible`,
              "Toggle target isVisible must be boolean"
            );
          }
        });
      }

      const checkUrl = (key: "url" | "iconUrl", allowed: string[]) => {
        const raw = value[key];
        if (typeof raw !== "string") return;
        try {
          const scheme = new URL(raw).protocol.replace(":", "");
          if (!allowed.includes(scheme)) {
            error("security.url_scheme", `${path}.${key}`, `${scheme} URL is not allowed`);
          }
        } catch {
          error("security.invalid_url", `${path}.${key}`, "Invalid URL");
        }
      };
      if (type === "Image") checkUrl("url", capabilities.imageUrlSchemes);
      if (type.startsWith(ACTION_PREFIX)) {
        checkUrl("iconUrl", capabilities.imageUrlSchemes);
      }
      if (type === "Action.OpenUrl") {
        checkUrl("url", capabilities.openUrlSchemes);
      }
      if (type.startsWith(INPUT_PREFIX)) {
        if (typeof value.id !== "string" || value.id.trim() === "") {
          error("interaction.input_id", `${path}.id`, `${type} requires an id`);
        }
        if (value.isRequired !== undefined && typeof value.isRequired !== "boolean") {
          error(
            "interaction.input_required",
            `${path}.isRequired`,
            "isRequired must be boolean"
          );
        }
        if (
          value.maxLength !== undefined &&
          (!Number.isInteger(value.maxLength) || (value.maxLength as number) < 0)
        ) {
          error(
            "interaction.input_max_length",
            `${path}.maxLength`,
            "maxLength must be a non-negative integer"
          );
        }
      }

      if (type === "Input.ChoiceSet") {
        if (!Array.isArray(value.choices) || value.choices.length === 0) {
          error(
            "interaction.choice_set_choices",
            `${path}.choices`,
            "Input.ChoiceSet requires at least one choice"
          );
        } else {
          const values = new Set<string>();
          value.choices.forEach((choice, index) => {
            if (
              !isObject(choice) ||
              typeof choice.title !== "string" ||
              typeof choice.value !== "string"
            ) {
              error(
                "interaction.choice_invalid",
                `${path}.choices[${index}]`,
                "Choice requires string title and value"
              );
            } else if (values.has(choice.value)) {
              error(
                "interaction.choice_duplicate",
                `${path}.choices[${index}].value`,
                `Duplicate choice value: ${choice.value}`
              );
            } else {
              values.add(choice.value);
            }
          });
        }
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "data") continue;
      walk(child, `${path}.${key}`, depth + 1);
    }
  };

  walk(payload, "$", 0);
  for (const target of toggleTargets) {
    if (!ids.has(target.id)) {
      error(
        "interaction.toggle_target_missing",
        target.path,
        `Toggle target does not exist: ${target.id}`
      );
    }
  }
  if (nodes > capabilities.maxNodes) {
    error("limits.nodes", "$", `${nodes} nodes exceed ${capabilities.maxNodes}`);
  }
  if (maxDepth > capabilities.maxDepth) {
    error("limits.depth", "$", `${maxDepth} depth exceeds ${capabilities.maxDepth}`);
  }
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > capabilities.maxPayloadBytes) {
    error(
      "limits.payload_bytes",
      "$",
      `${bytes} bytes exceed ${capabilities.maxPayloadBytes}`
    );
  }
  if (JSON.stringify(payload).includes("${")) {
    error("compiler.unexpanded_expression", "$", "Payload contains template expressions");
  }
  return issues;
}
