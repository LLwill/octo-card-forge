import {
  buildCardArtifact as buildResolvedCardArtifact,
} from "@mlt-org/octo-card-artifact";
import {
  decodeRenderCapabilities,
  decodeRenderProfileManifest,
  parseOrThrow,
  type CardArtifactV1,
} from "@mlt-org/octo-card-spec";
import { loadCardRuntime } from "./core-adapter.js";
import { getCard } from "./registry.js";
import type { CardPackage, RenderProfileSource } from "./types.js";

export interface ResolvedCardArtifact {
  artifact: CardArtifactV1;
  requestedRenderProfile: string;
  profile: RenderProfileSource;
}

/** Resolve filesystem inputs at the outer adapter boundary, then build purely. */
export async function resolveCardArtifactForCard(
  card: CardPackage,
  profileSource?: RenderProfileSource
): Promise<ResolvedCardArtifact> {
  const requestedRenderProfile =
    typeof card.manifest.renderProfile === "string" && card.manifest.renderProfile
      ? card.manifest.renderProfile
      : "octo-chat@latest";
  const runtime = await loadCardRuntime(card, profileSource);
  const manifest = parseOrThrow(
    "RenderProfileManifestV1",
    decodeRenderProfileManifest(runtime.profile.manifest)
  );
  const capabilities = parseOrThrow(
    "RenderCapabilitiesV1",
    decodeRenderCapabilities(runtime.profile.capabilities)
  );

  return {
    requestedRenderProfile,
    profile: runtime.profile,
    artifact: buildResolvedCardArtifact({
      source: runtime.source,
      profile: {
        reference: runtime.profile.reference,
        manifest,
        capabilities,
      },
    }),
  };
}

export async function buildCardArtifactForCard(
  card: CardPackage,
  profileSource?: RenderProfileSource
): Promise<CardArtifactV1> {
  return (await resolveCardArtifactForCard(card, profileSource)).artifact;
}

export async function buildCardArtifact(cardId: string): Promise<CardArtifactV1> {
  return buildCardArtifactForCard(await getCard(cardId));
}
