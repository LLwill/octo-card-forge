export type JsonObject = Record<string, unknown>;

export type WireProfile = "octo/v1" | "octo/v2";

export interface CardViewDefinition {
  wireProfile: WireProfile;
  template: string;
  samples: string[];
}

export interface CardManifest {
  schemaVersion: 2;
  id: string;
  name: string;
  version: string;
  contractVersion: string;
  adaptiveCardVersion: string;
  /** Concrete pin, `id@latest` (follows CURRENT_RENDER_PROFILE), or omit for current baseline. */
  renderProfile?: string;
  defaultLocale: string;
  views: Record<string, CardViewDefinition>;
  dataSchema: string;
}

export interface RenderProfileManifest {
  id: string;
  version: string;
  compatibility?: string;
  packageName?: string;
  adaptiveCardsSdkVersion: string;
  hostConfig: string;
  theme?: string;
  stylesheet: string;
  tokens?: string;
  capabilities: string;
}

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

export interface RenderUtilityRules {
  maxTokensPerElement?: number;
}

export interface RenderCapabilities {
  maxAdaptiveCardVersion: string;
  allowedElements: string[];
  allowedActions: string[];
  components?: Record<string, RenderComponentDefinition>;
  utilities?: Record<string, RenderUtilityDefinition>;
  utilityRules?: RenderUtilityRules;
  maxNodes: number;
  maxDepth: number;
  maxPayloadBytes: number;
  imageUrlSchemes: string[];
  openUrlSchemes: string[];
}

export interface RenderProfileSource {
  root: string;
  reference: string;
  manifest: RenderProfileManifest;
  capabilities: RenderCapabilities;
  hostConfig: Record<string, unknown>;
  stylesheets?: string[];
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

export interface CardPackage {
  /** Stable lookup key. Base packages use id; additional versions use id@version. */
  reference: string;
  root: string;
  manifest: CardManifest;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface CompileResult {
  cardId: string;
  cardVersion: string;
  contractVersion: string;
  renderProfile: string;
  wireProfile: WireProfile;
  view: string;
  payload: JsonObject;
  inspection: CardInspection;
  issues: ValidationIssue[];
}

export interface CheckReport {
  valid: boolean;
  cards: Array<{
    cardId: string;
    version: string;
    samples: Array<{
      name: string;
      view: string;
      wireProfile: WireProfile;
      valid: boolean;
      issues: ValidationIssue[];
    }>;
  }>;
}
