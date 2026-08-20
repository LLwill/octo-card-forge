import { issue, type DecodeIssue, type DecodeResult } from "./diagnostics.js";
import { isJsonObject, isNonEmptyString, type JsonObject } from "./json.js";

export interface InspectedAction {
  path: string;
  id?: string;
  type: string;
  associatedInputs?: "auto" | "none";
  inputIds?: string[];
  dataKeys?: string[];
}

export interface InspectedInput {
  path: string;
  id: string;
  type: string;
  isRequired: boolean;
  isVisible: boolean;
  maxLength?: number;
  isMultiSelect?: boolean;
  choiceValues?: string[];
}

export interface InspectedToggleTarget {
  elementId: string;
  isVisible?: boolean;
}

export interface InspectedToggle {
  path: string;
  targets: InspectedToggleTarget[];
}

export interface CardInspection {
  actions: InspectedAction[];
  inputs: InspectedInput[];
  toggles: InspectedToggle[];
}

const INSPECTION_KEYS = new Set(["actions", "inputs", "toggles"]);
const ACTION_KEYS = new Set(["path", "id", "type", "associatedInputs", "inputIds", "dataKeys"]);
const INPUT_KEYS = new Set(["path", "id", "type", "isRequired", "isVisible", "maxLength", "isMultiSelect", "choiceValues"]);
const TOGGLE_KEYS = new Set(["path", "targets"]);
const TOGGLE_TARGET_KEYS = new Set(["elementId", "isVisible"]);

function unknownKeys(value: JsonObject, allowed: Set<string>, path: string, issues: DecodeIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(issue("contract.unknown_property", `${path}/${key}`, `unknown property ${key}`));
  }
}

function stringArray(value: unknown, path: string, issues: DecodeIssue[]): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => !isNonEmptyString(item))) {
    issues.push(issue("contract.type", path, "value must be a string array"));
    return undefined;
  }
  return value as string[];
}

/** Decode the full inspection shape, including every nested element. */
export function decodeCardInspection(input: unknown): DecodeResult<CardInspection> {
  const issues: DecodeIssue[] = [];
  if (!isJsonObject(input)) return { ok: false, issues: [issue("contract.root_type", "", "inspection must be an object")] };
  unknownKeys(input, INSPECTION_KEYS, "", issues);
  const actions: InspectedAction[] = [];
  const inputs: InspectedInput[] = [];
  const toggles: InspectedToggle[] = [];

  if (!Array.isArray(input.actions)) issues.push(issue("contract.type", "/actions", "actions must be an array"));
  else for (const [index, rawAction] of input.actions.entries()) {
    const path = `/actions/${index}`;
    if (!isJsonObject(rawAction)) { issues.push(issue("contract.type", path, "action must be an object")); continue; }
    unknownKeys(rawAction, ACTION_KEYS, path, issues);
    if (!isNonEmptyString(rawAction.path)) issues.push(issue("contract.required", `${path}/path`, "path must be a non-empty string"));
    if (!isNonEmptyString(rawAction.type)) issues.push(issue("contract.required", `${path}/type`, "type must be a non-empty string"));
    if (rawAction.id !== undefined && !isNonEmptyString(rawAction.id)) issues.push(issue("contract.type", `${path}/id`, "id must be a non-empty string"));
    if (rawAction.associatedInputs !== undefined && rawAction.associatedInputs !== "auto" && rawAction.associatedInputs !== "none") issues.push(issue("contract.enum", `${path}/associatedInputs`, "associatedInputs must be auto or none"));
    const inputIds = rawAction.inputIds === undefined ? undefined : stringArray(rawAction.inputIds, `${path}/inputIds`, issues);
    const dataKeys = rawAction.dataKeys === undefined ? undefined : stringArray(rawAction.dataKeys, `${path}/dataKeys`, issues);
    if (isNonEmptyString(rawAction.path) && isNonEmptyString(rawAction.type)) actions.push({ path: rawAction.path, type: rawAction.type, ...(isNonEmptyString(rawAction.id) ? { id: rawAction.id } : {}), ...(rawAction.associatedInputs === "auto" || rawAction.associatedInputs === "none" ? { associatedInputs: rawAction.associatedInputs } : {}), ...(inputIds ? { inputIds } : {}), ...(dataKeys ? { dataKeys } : {}) });
  }

  if (!Array.isArray(input.inputs)) issues.push(issue("contract.type", "/inputs", "inputs must be an array"));
  else for (const [index, rawInput] of input.inputs.entries()) {
    const path = `/inputs/${index}`;
    if (!isJsonObject(rawInput)) { issues.push(issue("contract.type", path, "input must be an object")); continue; }
    unknownKeys(rawInput, INPUT_KEYS, path, issues);
    for (const key of ["path", "id", "type"] as const) if (!isNonEmptyString(rawInput[key])) issues.push(issue("contract.required", `${path}/${key}`, `${key} must be a non-empty string`));
    if (typeof rawInput.isRequired !== "boolean") issues.push(issue("contract.type", `${path}/isRequired`, "isRequired must be boolean"));
    if (typeof rawInput.isVisible !== "boolean") issues.push(issue("contract.type", `${path}/isVisible`, "isVisible must be boolean"));
    if (rawInput.maxLength !== undefined && (typeof rawInput.maxLength !== "number" || !Number.isInteger(rawInput.maxLength) || rawInput.maxLength < 0)) issues.push(issue("contract.invariant", `${path}/maxLength`, "maxLength must be a non-negative integer"));
    if (rawInput.isMultiSelect !== undefined && typeof rawInput.isMultiSelect !== "boolean") issues.push(issue("contract.type", `${path}/isMultiSelect`, "isMultiSelect must be boolean"));
    const choiceValues = rawInput.choiceValues === undefined ? undefined : stringArray(rawInput.choiceValues, `${path}/choiceValues`, issues);
    if (isNonEmptyString(rawInput.path) && isNonEmptyString(rawInput.id) && isNonEmptyString(rawInput.type) && typeof rawInput.isRequired === "boolean" && typeof rawInput.isVisible === "boolean") inputs.push({ path: rawInput.path, id: rawInput.id, type: rawInput.type, isRequired: rawInput.isRequired, isVisible: rawInput.isVisible, ...(typeof rawInput.maxLength === "number" && Number.isInteger(rawInput.maxLength) && rawInput.maxLength >= 0 ? { maxLength: rawInput.maxLength } : {}), ...(typeof rawInput.isMultiSelect === "boolean" ? { isMultiSelect: rawInput.isMultiSelect } : {}), ...(choiceValues ? { choiceValues } : {}) });
  }

  if (!Array.isArray(input.toggles)) issues.push(issue("contract.type", "/toggles", "toggles must be an array"));
  else for (const [index, rawToggle] of input.toggles.entries()) {
    const path = `/toggles/${index}`;
    if (!isJsonObject(rawToggle)) { issues.push(issue("contract.type", path, "toggle must be an object")); continue; }
    unknownKeys(rawToggle, TOGGLE_KEYS, path, issues);
    if (!isNonEmptyString(rawToggle.path)) issues.push(issue("contract.required", `${path}/path`, "path must be a non-empty string"));
    if (!Array.isArray(rawToggle.targets)) { issues.push(issue("contract.type", `${path}/targets`, "targets must be an array")); continue; }
    const targets: InspectedToggleTarget[] = [];
    for (const [targetIndex, rawTarget] of rawToggle.targets.entries()) {
      const targetPath = `${path}/targets/${targetIndex}`;
      if (!isJsonObject(rawTarget)) { issues.push(issue("contract.type", targetPath, "toggle target must be an object")); continue; }
      unknownKeys(rawTarget, TOGGLE_TARGET_KEYS, targetPath, issues);
      if (!isNonEmptyString(rawTarget.elementId)) issues.push(issue("contract.required", `${targetPath}/elementId`, "elementId must be a non-empty string"));
      if (rawTarget.isVisible !== undefined && typeof rawTarget.isVisible !== "boolean") issues.push(issue("contract.type", `${targetPath}/isVisible`, "isVisible must be boolean"));
      if (isNonEmptyString(rawTarget.elementId)) targets.push({ elementId: rawTarget.elementId, ...(typeof rawTarget.isVisible === "boolean" ? { isVisible: rawTarget.isVisible } : {}) });
    }
    if (isNonEmptyString(rawToggle.path)) toggles.push({ path: rawToggle.path, targets });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, notices: [], value: { actions, inputs, toggles } };
}

export function isCardInspection(value: unknown): value is CardInspection {
  return decodeCardInspection(value).ok;
}
