import { useMemo } from "react";
import type { CardArtifactV1 } from "@mlt-org/octo-card-catalog-snapshot";
import { createPreviewDocument } from "../data/preview-document.js";

type ArtifactSample = CardArtifactV1["views"][string]["samples"][number];

export function PreviewFrame({ artifact, sample, title }: { artifact: CardArtifactV1; sample: ArtifactSample; title: string }) {
  const document = useMemo(() => createPreviewDocument(artifact, sample), [artifact, sample]);
  return <iframe className="card-preview" title={title} sandbox="allow-scripts" srcDoc={document} />;
}
