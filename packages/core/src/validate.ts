import type {
  JsonObject,
  RenderComponentDefinition,
  RenderCapabilities,
  ValidationIssue,
  WireProfile,
} from "./types.js";
import { isUtilityId, parseUtilityId } from "./utility-id.js";

const ACTION_PREFIX = "Action.";
const INPUT_PREFIX = "Input.";
const DEFAULT_MAX_UTILITY_TOKENS_PER_ELEMENT = 3;
const STRUCTURAL_TYPES = new Set(["TextRun", "TableRow", "TableCell"]);
const BASE64_IMAGE_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/]+={0,2})$/i;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareVersion(a: string, b: string): number {
  const aa = a.split(".").map(Number);
  const bb = b.split(".").map(Number);
  return (aa[0] ?? 0) - (bb[0] ?? 0) || (aa[1] ?? 0) - (bb[1] ?? 0);
}

function findComponent(
  id: string,
  components: Record<string, RenderComponentDefinition> | undefined
):
  | {
      family: string;
      variant: string;
      definition: RenderComponentDefinition;
    }
  | undefined {
  if (!components) return undefined;
  const families = Object.keys(components).sort((a, b) => b.length - a.length);
  for (const family of families) {
    const definition = components[family];
    const familyPrefix = `${family}-`;
    if (!id.startsWith(familyPrefix)) continue;
    const variants = Object.keys(definition.variants).sort(
      (a, b) => b.length - a.length
    );
    for (const variant of variants) {
      const prefix = `${family}-${variant}-`;
      if (id.startsWith(prefix) && id.length > prefix.length) {
        return {
          family,
          variant,
          definition,
        };
      }
    }
  }
  return undefined;
}

function formatValue(value: unknown): string {
  return JSON.stringify(value);
}

function isBase64ImageUrl(value: string): boolean {
  const match = BASE64_IMAGE_URL_PATTERN.exec(value);
  if (!match) return false;
  const payload = match[1];
  return payload.length % 4 !== 1;
}

function validateChildCollection(
  value: JsonObject,
  key: string,
  path: string,
  expected: (type: string) => boolean,
  description: string,
  error: (code: string, path: string, message: string) => void
): void {
  const children = value[key];
  if (!Array.isArray(children)) {
    error("schema.collection", `${path}.${key}`, `${key} must be an array`);
    return;
  }
  children.forEach((child, index) => {
    if (!isObject(child) || typeof child.type !== "string" || !expected(child.type)) {
      error(
        "schema.child_type",
        `${path}.${key}[${index}]`,
        `${key} must contain ${description}`
      );
    }
  });
}

function validateElementStructure(
  value: JsonObject,
  type: string,
  path: string,
  error: (code: string, path: string, message: string) => void
): void {
  if (type === "Container" || type === "Column") {
    validateChildCollection(
      value,
      "items",
      path,
      (childType) => !childType.startsWith(ACTION_PREFIX),
      "Adaptive Card elements",
      error
    );
  } else if (type === "ColumnSet") {
    validateChildCollection(value, "columns", path, (childType) => childType === "Column", "Column", error);
  } else if (type === "ActionSet") {
    validateChildCollection(
      value,
      "actions",
      path,
      (childType) => childType.startsWith(ACTION_PREFIX),
      "actions",
      error
    );
  } else if (type === "AdaptiveCard") {
    if (value.body !== undefined) {
      validateChildCollection(
        value,
        "body",
        path,
        (childType) => !childType.startsWith(ACTION_PREFIX),
        "Adaptive Card elements",
        error
      );
    }
    if (value.actions !== undefined) {
      validateChildCollection(
        value,
        "actions",
        path,
        (childType) => childType.startsWith(ACTION_PREFIX),
        "actions",
        error
      );
    }
  } else if (type === "FactSet") {
    if (!Array.isArray(value.facts)) {
      error("schema.collection", `${path}.facts`, "facts must be an array");
    } else {
      value.facts.forEach((fact, index) => {
        if (
          !isObject(fact) ||
          typeof fact.title !== "string" ||
          typeof fact.value !== "string"
        ) {
          error(
            "schema.child_type",
            `${path}.facts[${index}]`,
            "facts must contain objects with string title and value"
          );
        }
      });
    }
  } else if (type === "ImageSet") {
    validateChildCollection(value, "images", path, (childType) => childType === "Image", "Image", error);
  } else if (type === "Table") {
    validateChildCollection(value, "rows", path, (childType) => childType === "TableRow", "TableRow", error);
  } else if (type === "TableRow") {
    validateChildCollection(value, "cells", path, (childType) => childType === "TableCell", "TableCell", error);
  } else if (type === "TableCell") {
    validateChildCollection(
      value,
      "items",
      path,
      (childType) => !childType.startsWith(ACTION_PREFIX),
      "Adaptive Card elements",
      error
    );
  }
}

function validateUtilityId(
  id: string,
  value: JsonObject,
  type: string | undefined,
  path: string,
  capabilities: RenderCapabilities,
  error: (code: string, path: string, message: string) => void,
  warning: (code: string, path: string, message: string) => void
): void {
  const parsed = parseUtilityId(id);
  if (!parsed) return;
  if (!parsed.ok) {
    error("utility.id_invalid", `${path}.id`, parsed.message);
    return;
  }

  const maxTokens =
    capabilities.utilityRules?.maxTokensPerElement ??
    DEFAULT_MAX_UTILITY_TOKENS_PER_ELEMENT;
  if (parsed.value.tokens.length > maxTokens) {
    error(
      "utility.too_many_tokens",
      `${path}.id`,
      `${id} uses ${parsed.value.tokens.length} utility tokens, maximum is ${maxTokens}`
    );
  }

  const groups = new Map<string, string[]>();
  const utilities = capabilities.utilities ?? {};
  for (const token of parsed.value.tokens) {
    const definition = utilities[token];
    if (!definition) {
      error(
        "utility.unknown",
        `${path}.id`,
        `${token} is not declared by the render profile utilities`
      );
      continue;
    }

    const groupTokens = groups.get(definition.group) ?? [];
    groupTokens.push(token);
    groups.set(definition.group, groupTokens);

    if (
      !type ||
      (!definition.appliesTo.includes("*") && !definition.appliesTo.includes(type))
    ) {
      error(
        "utility.applies_to",
        `${path}.id`,
        `${token} does not apply to ${type ?? "unknown type"}`
      );
    }

    if (definition.deprecated) {
      warning("utility.deprecated", `${path}.id`, `${token} is deprecated`);
    }

    for (const [key, expected] of Object.entries(definition.fallback ?? {})) {
      if (value[key] !== expected) {
        error(
          "utility.fallback",
          `${path}.${key}`,
          `${id} requires fallback ${key}=${formatValue(expected)}`
        );
      }
    }
  }

  for (const [group, tokens] of groups) {
    if (tokens.length > 1) {
      error(
        "utility.group_conflict",
        `${path}.id`,
        `Utilities in group ${group} cannot be combined: ${tokens.join(", ")}`
      );
    }
  }
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
  const warning = (code: string, path: string, message: string) =>
    issues.push({ severity: "warning", code, path, message });

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
      validateElementStructure(value, type, path, error);
      if (type === "TextBlock" && typeof value.text !== "string") {
        error(
          "schema.required_property",
          `${path}.text`,
          "TextBlock requires a string text property"
        );
      }
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
      } else if (type !== "AdaptiveCard" && !STRUCTURAL_TYPES.has(type)) {
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

        if (typeof value.id === "string" && isUtilityId(value.id)) {
          validateUtilityId(
            value.id,
            value,
            type,
            path,
            capabilities,
            error,
            warning
          );
        } else if (typeof value.id === "string" && value.id.startsWith("octo-")) {
          const component = findComponent(value.id, capabilities.components);
          if (!component) {
            error(
              "component.unknown",
              `${path}.id`,
              `${value.id} is not declared by the render profile components`
            );
          } else {
            if (!type || !component.definition.appliesTo.includes(type)) {
              error(
                "component.applies_to",
                `${path}.id`,
                `${component.family}-${component.variant} does not apply to ${type ?? "unknown type"}`
              );
            }
            const fallback =
              component.definition.variants[component.variant]?.fallback ?? {};
            for (const [key, expected] of Object.entries(fallback)) {
              if (value[key] !== expected) {
                error(
                  "component.fallback",
                  `${path}.${key}`,
                  `${value.id} requires fallback ${key}=${formatValue(expected)}`
                );
              }
            }
          }
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
          if (scheme === "data" && !isBase64ImageUrl(raw)) {
            error("security.invalid_url", `${path}.${key}`, "Invalid base64 image data URL");
            return;
          }
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
  const serializedPayload = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(serializedPayload).byteLength;
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
