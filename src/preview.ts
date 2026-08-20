import type { CompileResult } from "./types.js";
import type { LoadedCardRuntime } from "./core-adapter.js";

export const PREVIEW_SCHEMA_VERSION = 1;

export interface PreviewSession {
  schemaVersion: typeof PREVIEW_SCHEMA_VERSION;
  revision: string;
  card: {
    reference: string;
    id: string;
    name: string;
    version: string;
    mutable: boolean;
  };
  renderProfile: {
    reference: string;
    source: string;
    manifest: LoadedCardRuntime["profile"]["manifest"];
  };
  views: Array<{
    name: string;
    wireProfile: string;
    states?: string[];
    submitActions?: string[];
    samples: string[];
  }>;
}

export interface PreviewRenderResponse extends CompileResult {
  schemaVersion: typeof PREVIEW_SCHEMA_VERSION;
  revision: string;
  valid: boolean;
}

export function buildPreviewSession(runtime: LoadedCardRuntime): PreviewSession {
  return {
    schemaVersion: PREVIEW_SCHEMA_VERSION,
    revision: runtime.revision,
    card: {
      reference: runtime.card.reference,
      id: runtime.source.card.id,
      name: runtime.source.card.name,
      version: runtime.source.card.version,
      mutable: runtime.card.mutable,
    },
    renderProfile: {
      reference: runtime.profile.reference,
      source: runtime.profile.source ?? "workspace",
      manifest: runtime.profile.manifest,
    },
    views: Object.entries(runtime.source.views).map(([name, view]) => ({
      name,
      wireProfile: view.wireProfile,
      ...(view.states ? { states: view.states } : {}),
      ...(view.submit_actions ? { submitActions: view.submit_actions } : {}),
      samples: view.samples.map((sample) => sample.name),
    })),
  };
}

export function buildPreviewRenderResponse(
  runtime: LoadedCardRuntime,
  result: CompileResult
): PreviewRenderResponse {
  return {
    schemaVersion: PREVIEW_SCHEMA_VERSION,
    revision: runtime.revision,
    valid: !result.issues.some((issue) => issue.severity === "error"),
    ...result,
  };
}
