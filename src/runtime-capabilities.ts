import type {
  JsonObject,
  RuntimeCapabilityRequirement,
  ValidationIssue,
} from "./types.js";

export interface RuntimeCapabilityDefinition {
  id: string;
  version: string;
  status: "supported" | "planned";
  description: string;
  effects: string[];
}

/** Runtime behavior is separate from Render Profile capabilities. */
export const RUNTIME_CAPABILITIES: RuntimeCapabilityDefinition[] = [
  {
    id: "message.send.current_user",
    version: "1.0.0",
    status: "supported",
    description: "Send a durable text message as the logged-in Octo Web user before running the card action.",
    effects: ["send_current_user_message", "append_user_message"],
  },
  {
    id: "clipboard.write",
    version: "1.0.0",
    status: "planned",
    description: "Write a bounded card-declared value to the local clipboard.",
    effects: ["write_clipboard"],
  },
  {
    id: "composer.insert",
    version: "1.0.0",
    status: "planned",
    description: "Insert a bounded card-declared value into the message composer.",
    effects: ["insert_composer_text"],
  },
  {
    id: "panel.open",
    version: "1.0.0",
    status: "planned",
    description: "Open a Web-owned panel identified by a registered key.",
    effects: ["open_panel"],
  },
  {
    id: "url.open",
    version: "1.0.0",
    status: "planned",
    description: "Open a safe HTTPS URL after Web-side policy validation.",
    effects: ["open_url"],
  },
];

const EFFECTS = new Map(
  RUNTIME_CAPABILITIES.flatMap((capability) =>
    capability.effects.map((effect) => [effect, capability] as const)
  )
);

export function runtimeCapabilityForEffect(
  effect: string
): RuntimeCapabilityDefinition | undefined {
  return EFFECTS.get(effect);
}

export function compareVersion(a: string, b: string): number {
  const aa = a.split(".").map(Number);
  const bb = b.split(".").map(Number);
  return (aa[0] ?? 0) - (bb[0] ?? 0) || (aa[1] ?? 0) - (bb[1] ?? 0) || (aa[2] ?? 0) - (bb[2] ?? 0);
}

function satisfies(version: string, range: string): boolean {
  const clauses = range.trim().split(/\s+/).filter(Boolean);
  if (clauses.length === 0) return false;
  return clauses.every((clause) => {
    const match = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+)$/.exec(clause);
    if (!match) return false;
    const comparison = compareVersion(version, match[2]);
    switch (match[1] ?? "=") {
      case ">=": return comparison >= 0;
      case "<=": return comparison <= 0;
      case ">": return comparison > 0;
      case "<": return comparison < 0;
      default: return comparison === 0;
    }
  });
}

export function validateRuntimeCapabilities(
  capabilities: RuntimeCapabilityRequirement[] | undefined,
  filePath = "manifest.json"
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const [index, requirement] of (capabilities ?? []).entries()) {
    const path = `$.runtimeCapabilities[${index}]`;
    if (!requirement || !requirement.id || !requirement.version) {
      issues.push({ severity: "error", code: "runtime.capability_invalid", path, message: `${filePath}: capability id and version are required` });
      continue;
    }
    if (seen.has(requirement.id)) {
      issues.push({ severity: "error", code: "runtime.capability_duplicate", path, message: `Duplicate runtime capability: ${requirement.id}` });
    }
    seen.add(requirement.id);
    const definition = RUNTIME_CAPABILITIES.find((item) => item.id === requirement.id);
    if (!definition) {
      issues.push({ severity: "error", code: "runtime.capability_unknown", path, message: `Unknown runtime capability: ${requirement.id}` });
      continue;
    }
    if (!satisfies(definition.version, requirement.version)) {
      issues.push({ severity: "error", code: "runtime.capability_version", path, message: `${requirement.id} requires ${requirement.version}, available ${definition.version}` });
    }
    if (definition.status !== "supported" && requirement.required !== false) {
      issues.push({ severity: "error", code: "runtime.capability_unavailable", path, message: `${requirement.id} is not supported by the current Web runtime` });
    }
  }
  return issues;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateMessageSource(
  source: unknown,
  path: string,
  issues: ValidationIssue[],
  inputTypes: Map<string, string>,
  associatedInputIds: Set<string>
): void {
  if (!isObject(source) || typeof source.type !== "string") {
    issues.push({ severity: "error", code: "runtime.message_source_invalid", path, message: "message_source must be a declared source object" });
    return;
  }
  const inputId = source.input_id ?? source.inputId;
  if (["choice_labels", "input_text"].includes(source.type)) {
    if (typeof inputId !== "string" || !inputId.trim()) {
      issues.push({ severity: "error", code: "runtime.message_source_input", path, message: `${source.type} requires input_id` });
    } else {
      const inputType = inputTypes.get(inputId);
      if (!inputType) {
        issues.push({ severity: "error", code: "runtime.message_source_input_unknown", path, message: `message_source references unknown input: ${inputId}` });
      } else {
        const expectedType = source.type === "choice_labels" ? "Input.ChoiceSet" : "Input.Text";
        if (inputType !== expectedType) {
          issues.push({ severity: "error", code: "runtime.message_source_input_type", path, message: `${source.type} requires ${expectedType}, got ${inputType}` });
        }
        if (!associatedInputIds.has(inputId)) {
          issues.push({ severity: "error", code: "runtime.message_source_input_unassociated", path, message: `message_source input is not associated with this Action.Submit: ${inputId}` });
        }
      }
    }
  }
  if (source.type === "compose") {
    if (!Array.isArray(source.parts) || source.parts.length === 0 || source.parts.length > 4) {
      issues.push({ severity: "error", code: "runtime.message_source_parts", path, message: "compose.parts must contain 1 to 4 sources" });
    } else {
      source.parts.forEach((part, index) => validateMessageSource(part, `${path}.parts[${index}]`, issues, inputTypes, associatedInputIds));
    }
  } else if (!["action.title", "choice_labels", "input_text"].includes(source.type)) {
    issues.push({ severity: "error", code: "runtime.message_source_type", path, message: `Unsupported message source type: ${source.type}` });
  }
  if (source.separator !== undefined && typeof source.separator !== "string") {
    issues.push({ severity: "error", code: "runtime.message_source_separator", path, message: "message source separator must be a string" });
  }
}

export function validateRuntimeEffects(
  payload: JsonObject,
  declared: RuntimeCapabilityRequirement[] | undefined
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const declaredById = new Map((declared ?? []).map((item) => [item.id, item] as const));
  const inputTypes = new Map<string, string>();
  const collectInputs = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collectInputs);
      return;
    }
    if (!isObject(value)) return;
    if (typeof value.type === "string" && value.type.startsWith("Input.") && typeof value.id === "string") {
      inputTypes.set(value.id, value.type);
    }
    Object.values(value).forEach(collectInputs);
  };
  collectInputs(payload);
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (!isObject(value)) return;
    if (value.type === "Action.Submit" && isObject(value.data) && value.data.effect !== undefined) {
      const effectPath = `${path}.data.effect`;
      if (typeof value.data.effect !== "string") {
        issues.push({ severity: "error", code: "runtime.effect_invalid", path: effectPath, message: "effect must be a string" });
      } else {
        const definition = runtimeCapabilityForEffect(value.data.effect);
        if (!definition) {
          issues.push({ severity: value.data.effect_required === false ? "warning" : "error", code: "runtime.effect_unknown", path: effectPath, message: `Unknown runtime effect: ${value.data.effect}` });
        } else if (!declaredById.has(definition.id)) {
          issues.push({ severity: "error", code: "runtime.capability_undeclared", path: effectPath, message: `Declare runtime capability ${definition.id} in manifest.json` });
        } else if (value.data.effect_required !== false && declaredById.get(definition.id)?.required === false) {
          issues.push({ severity: "error", code: "runtime.capability_required", path: effectPath, message: `Runtime capability ${definition.id} must be required in manifest.json` });
        }
        const version = value.data.effect_version;
        if (version !== undefined && (!Number.isInteger(version) || Number(version) < 1)) {
          issues.push({ severity: "error", code: "runtime.effect_version", path: `${path}.data.effect_version`, message: "effect_version must be a positive integer" });
        } else if (version !== undefined && definition && Number(version) > Number(definition.version.split(".")[0])) {
          issues.push({ severity: "error", code: "runtime.effect_version_unsupported", path: `${path}.data.effect_version`, message: `${value.data.effect} does not support effect version ${String(version)}` });
        }
        if ((value.data.effect === "send_current_user_message" || value.data.effect === "append_user_message") && definition) {
          if (value.data.message_source === undefined && value.data.messageSource === undefined) {
            if (value.data.effect === "send_current_user_message") {
              issues.push({ severity: "error", code: "runtime.message_source_missing", path: `${path}.data`, message: "Current-user message effect requires message_source" });
            }
          } else {
            const associatedInputIds =
              value.associatedInputs === "none"
                ? new Set<string>()
                : new Set(inputTypes.keys());
            validateMessageSource(
              value.data.message_source ?? value.data.messageSource,
              `${path}.data.message_source`,
              issues,
              inputTypes,
              associatedInputIds
            );
          }
        }
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "data") walk(child, `${path}.${key}`);
    }
  };
  walk(payload, "$");
  return issues;
}
