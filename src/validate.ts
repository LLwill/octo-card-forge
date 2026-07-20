import type {
  HostCapabilities,
  InteractionContract,
  JsonObject,
  ValidationIssue,
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
  capabilities: HostCapabilities
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
      } else if (type !== "AdaptiveCard" && type !== "TextRun") {
        if (!capabilities.allowedElements.includes(type)) {
          error("host.element_unsupported", `${path}.type`, `${type} is not allowed`);
        }
      }

      if (typeof value.id === "string" && value.id) {
        if (ids.has(value.id)) {
          error("schema.duplicate_id", `${path}.id`, `Duplicate id: ${value.id}`);
        }
        ids.add(value.id);
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
      if (type.startsWith(INPUT_PREFIX) && typeof value.id !== "string") {
        error("interaction.input_id", `${path}.id`, `${type} requires an id`);
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

function collectTypedNodes(payload: JsonObject): Map<string, JsonObject> {
  const nodes = new Map<string, JsonObject>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!isObject(value)) return;
    if (typeof value.id === "string" && typeof value.type === "string") {
      nodes.set(value.id, value);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "data") walk(child);
    }
  };
  walk(payload);
  return nodes;
}

export function validateInteractions(
  payload: JsonObject,
  contract: InteractionContract
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodes = collectTypedNodes(payload);
  const error = (code: string, path: string, message: string) =>
    issues.push({ severity: "error", code, path, message });

  for (const [id, expected] of Object.entries(contract.actions ?? {})) {
    const action = nodes.get(id);
    if (!action) {
      error("contract.action_missing", `$.actions.${id}`, `Action is missing: ${id}`);
      continue;
    }
    if (action.type !== expected.type) {
      error(
        "contract.action_type",
        `$.actions.${id}.type`,
        `${id} must be ${expected.type}`
      );
    }
    if (
      expected.associatedInputs !== undefined &&
      action.associatedInputs !== expected.associatedInputs
    ) {
      error(
        "contract.associated_inputs",
        `$.actions.${id}.associatedInputs`,
        `${id} must use associatedInputs=${expected.associatedInputs}`
      );
    }
    for (const inputId of expected.requiredInputs ?? []) {
      const input = nodes.get(inputId);
      if (!input || !String(input.type).startsWith(INPUT_PREFIX)) {
        error(
          "contract.required_input_missing",
          `$.actions.${id}.requiredInputs`,
          `${id} requires input ${inputId}`
        );
      } else if (input.isRequired !== true) {
        error(
          "contract.required_input_optional",
          `$.inputs.${inputId}.isRequired`,
          `${inputId} must be required`
        );
      }
    }
  }

  for (const [id, expected] of Object.entries(contract.inputs ?? {})) {
    const input = nodes.get(id);
    if (!input) {
      error("contract.input_missing", `$.inputs.${id}`, `Input is missing: ${id}`);
      continue;
    }
    if (expected.type === "string" && input.type !== "Input.Text") {
      error("contract.input_type", `$.inputs.${id}.type`, `${id} must be Input.Text`);
    }
    if (expected.required !== undefined && input.isRequired !== expected.required) {
      error(
        "contract.input_required",
        `$.inputs.${id}.isRequired`,
        `${id} isRequired must be ${expected.required}`
      );
    }
    if (expected.maxLength !== undefined && input.maxLength !== expected.maxLength) {
      error(
        "contract.input_max_length",
        `$.inputs.${id}.maxLength`,
        `${id} maxLength must be ${expected.maxLength}`
      );
    }
  }

  for (const group of contract.localState?.mutuallyExclusive ?? []) {
    for (const id of group) {
      if (!nodes.has(id)) {
        error(
          "contract.local_state_missing",
          "$.localState.mutuallyExclusive",
          `Local state element is missing: ${id}`
        );
      }
    }
    if (group.length !== 2) continue;
    const [first, second] = group;
    let forward = false;
    let reverse = false;
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (!isObject(value)) return;
      if (value.type === "Action.ToggleVisibility" && Array.isArray(value.targetElements)) {
        const targets = new Map<string, unknown>();
        for (const target of value.targetElements) {
          if (isObject(target) && typeof target.elementId === "string") {
            targets.set(target.elementId, target.isVisible);
          }
        }
        forward ||= targets.get(first) === true && targets.get(second) === false;
        reverse ||= targets.get(first) === false && targets.get(second) === true;
      }
      Object.entries(value).forEach(([key, child]) => key !== "data" && walk(child));
    };
    walk(payload);
    if (!forward || !reverse) {
      error(
        "contract.mutual_exclusion",
        "$.localState.mutuallyExclusive",
        `${first} and ${second} require explicit enter and cancel toggles`
      );
    }
  }

  return issues;
}
