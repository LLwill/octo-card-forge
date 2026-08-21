import { createHash } from "node:crypto";
import {
  compileCardSource,
  type ResolvedCardSource,
} from "@mlt-org/octo-card-core";
import { loadResolvedCardSource } from "@mlt-org/octo-card-workspace";
import { loadRenderProfileForReference } from "./profile-source.js";
import type {
  CardPackage,
  CompileResult,
  JsonObject,
  RenderProfileSource,
} from "./types.js";

export interface LoadedCardRuntime {
  card: CardPackage;
  source: ResolvedCardSource;
  profile: RenderProfileSource;
  revision: string;
}

function runtimeRevision(
  source: ResolvedCardSource,
  profile: RenderProfileSource
): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      source,
      renderProfile: {
        reference: profile.reference,
        manifest: profile.manifest,
        capabilities: profile.capabilities,
        hostConfig: profile.hostConfig,
        stylesheets: profile.stylesheets ?? [],
      },
    }))
    .digest("hex");
  return `sha256:${digest}`;
}

export async function loadCardRuntime(
  card: CardPackage,
  explicitProfile?: RenderProfileSource
): Promise<LoadedCardRuntime> {
  const loaded = await loadResolvedCardSource(card.root);
  const profile = await loadRenderProfileForReference(
    loaded.manifest.renderProfile,
    explicitProfile
  );
  return {
    card,
    source: loaded.source,
    profile,
    revision: runtimeRevision(loaded.source, profile),
  };
}

export function compileLoadedCard(
  runtime: LoadedCardRuntime,
  view: string,
  data: JsonObject
): CompileResult {
  if (!runtime.source.views[view]) {
    throw new Error(`Unknown view ${view} for ${runtime.card.reference}`);
  }
  return compileCardSource({
    source: runtime.source,
    view,
    data,
    profile: {
      reference: runtime.profile.reference,
      capabilities: runtime.profile.capabilities,
    },
  }) as CompileResult;
}
