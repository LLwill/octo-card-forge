export type JsonObject = Record<string, unknown>;

export interface CardViewDefinition {
  template: string;
  samples: string[];
}

export interface CardManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  contractVersion: string;
  adaptiveCardVersion: string;
  hostProfile: string;
  defaultLocale: string;
  views: Record<string, CardViewDefinition>;
  dataSchema: string;
  interactions: string;
}

export interface HostProfileManifest {
  id: string;
  version: string;
  adaptiveCardsSdkVersion: string;
  hostConfig: string;
  stylesheet: string;
  capabilities: string;
}

export interface HostCapabilities {
  maxAdaptiveCardVersion: string;
  allowedElements: string[];
  allowedActions: string[];
  maxNodes: number;
  maxDepth: number;
  maxPayloadBytes: number;
  imageUrlSchemes: string[];
  openUrlSchemes: string[];
}

export interface InteractionContract {
  views?: string[];
  actions: Record<
    string,
    {
      type: string;
      associatedInputs?: string;
      requiredInputs?: string[];
    }
  >;
  inputs: Record<
    string,
    {
      type: "string";
      required?: boolean;
      maxLength?: number;
    }
  >;
  localState?: {
    mutuallyExclusive?: string[][];
    [id: string]: unknown;
  };
}

export interface CardPackage {
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
  hostProfile: string;
  view: string;
  payload: JsonObject;
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
      valid: boolean;
      issues: ValidationIssue[];
    }>;
  }>;
}
