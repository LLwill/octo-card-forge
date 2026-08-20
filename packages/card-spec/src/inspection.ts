import type { JsonObject } from "./json.js";

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

export function isCardInspection(value: unknown): value is CardInspection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as JsonObject;
  return Array.isArray(candidate.actions) && Array.isArray(candidate.inputs) && Array.isArray(candidate.toggles);
}
