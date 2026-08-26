import { useEffect, useMemo, useRef, useState } from "react";
import type { CardArtifactV1 } from "@mlt-org/octo-card-catalog-snapshot";
import {
  createPreviewDocument,
  createRawCardDocument,
  type PreviewResources,
} from "../data/preview-document.js";

type ArtifactSample = CardArtifactV1["views"][string]["samples"][number];

const PREVIEW_RESIZE_MESSAGE = "octo-card-preview:resize";

function PreviewIframe({ document, title }: { document: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState<number>();

  useEffect(() => {
    setContentHeight(undefined);
    const receiveHeight = (event: MessageEvent<unknown>) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as { type?: unknown; height?: unknown } | null;
      if (message?.type !== PREVIEW_RESIZE_MESSAGE || typeof message.height !== "number") return;
      setContentHeight(Math.min(4000, Math.max(64, Math.ceil(message.height))));
    };
    window.addEventListener("message", receiveHeight);
    return () => window.removeEventListener("message", receiveHeight);
  }, [document]);

  return <iframe ref={frameRef} className="card-preview" title={title} sandbox="allow-scripts" scrolling="no" srcDoc={document} style={contentHeight ? { height: `${contentHeight}px` } : undefined} />;
}

export function PreviewFrame({ artifact, sample, title }: { artifact: CardArtifactV1; sample: ArtifactSample; title: string }) {
  const document = useMemo(() => createPreviewDocument(artifact, sample), [artifact, sample]);
  return <PreviewIframe document={document} title={title} />;
}

export function RawPreviewFrame({ card, resources, title }: {
  card: unknown;
  resources: PreviewResources;
  title: string;
}) {
  const document = useMemo(() => createRawCardDocument(card, resources), [card, resources]);
  return <PreviewIframe document={document} title={title} />;
}
