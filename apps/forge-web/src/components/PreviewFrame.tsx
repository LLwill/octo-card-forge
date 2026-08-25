import { useMemo } from "react";
import type { CardArtifactV1 } from "@mlt-org/octo-card-catalog-snapshot";
import {
  createPreviewDocument,
  createRawCardDocument,
  type PreviewResources,
} from "../data/preview-document.js";

type ArtifactSample = CardArtifactV1["views"][string]["samples"][number];

export function PreviewFrame({ artifact, sample, title }: { artifact: CardArtifactV1; sample: ArtifactSample; title: string }) {
  const document = useMemo(() => createPreviewDocument(artifact, sample), [artifact, sample]);
  return <iframe className="card-preview" title={title} sandbox="allow-scripts" srcDoc={document} />;
}

export function RawPreviewFrame({ card, resources, title }: {
  card: unknown;
  resources: PreviewResources;
  title: string;
}) {
  const document = useMemo(() => createRawCardDocument(card, resources), [card, resources]);
  return <iframe className="card-preview" title={title} sandbox="allow-scripts" srcDoc={document} />;
}
