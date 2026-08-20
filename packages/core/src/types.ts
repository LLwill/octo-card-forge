import type {
  CardManifest as CardSourceManifest,
  JsonObject as ContractJsonObject,
  RenderCapabilitiesV1,
  WireProfile as ContractWireProfile,
} from "@mlt-org/octo-card-spec";

/** JSON object accepted by the pure engine at runtime. */
export type JsonObject = Record<string, unknown>;

/** Versioned source manifest owned by the Card Contract package. */
export type CardManifest = CardSourceManifest;

/** Wire protocol selected by a Card view. */
export type WireProfile = ContractWireProfile;

/** Recursive JSON object used by contract definitions and fallback values. */
export type ContractObject = ContractJsonObject;

export interface RenderComponentVariant {
  fallback?: JsonObject;
  deprecated?: boolean;
}

export interface RenderComponentDefinition {
  appliesTo: string[];
  variants: Record<string, RenderComponentVariant>;
}

export interface RenderUtilityDefinition {
  group: string;
  appliesTo: string[];
  fallback?: JsonObject;
  description: string;
  useWhen?: string[];
  avoidWhen?: string[];
  cssRequired?: boolean;
  deprecated?: boolean;
}

/**
 * Runtime-normalized render capabilities.
 *
 * `schemaVersion` and the scalar limits come from the versioned
 * `@mlt-org/octo-card-spec` Render Profile contract. Component and utility
 * entries are narrowed here because the validator needs their semantics.
 */
export interface RenderCapabilities
  extends Omit<RenderCapabilitiesV1, "components" | "utilities"> {
  components?: Record<string, RenderComponentDefinition>;
  utilities?: Record<string, RenderUtilityDefinition>;
}

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

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}
