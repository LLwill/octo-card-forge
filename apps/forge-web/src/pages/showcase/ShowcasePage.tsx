import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CardArtifactV1, CatalogSnapshotV1 } from "@mlt-org/octo-card-catalog-snapshot";
import type { JsonObject, RenderProfileManifestV1 } from "@mlt-org/octo-card-spec";
import { useRuntime } from "../../app/runtime.js";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { PreviewFrame, RawPreviewFrame } from "../../components/PreviewFrame.js";
import { buttonVariants } from "../../components/ui/button.js";
import { bootstrap, loadJson, serverPath } from "../../data/client.js";
import { loadCardArtifact, loadCatalogSnapshot } from "../../data.js";
import { cn } from "../../lib/utils.js";

interface WorkspaceCard {
  reference: string;
  id: string;
  name: string;
  samples: Record<string, string[]>;
}

interface WorkspaceContext {
  renderProfile: RenderProfileManifestV1;
  hostConfig: JsonObject;
  stylesheetUrl: string;
}

type FeaturedCard = {
  name: string;
  reference: string;
} & ({
  kind: "artifact";
  artifact: CardArtifactV1;
  sample: CardArtifactV1["views"][string]["samples"][number];
} | {
  kind: "workspace";
  payload: JsonObject;
  resources: Parameters<typeof RawPreviewFrame>[0]["resources"];
});

const deliveryFlow = [
  ["Card Package", "卡片定义与版本"],
  ["契约检查", "结构与语义校验"],
  ["Artifact / Handoff", "可交付工作与交接清单"],
  ["octo-server → octo-web", "运行时渲染与分发"],
];

export function ShowcasePage() {
  const { runtime, loading: runtimeLoading, error: runtimeError } = useRuntime();
  const [featured, setFeatured] = useState<FeaturedCard>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!runtime) return;
    let active = true;
    setError(undefined);

    const load = async () => {
      if (runtime.mode === "workspace") {
        const cards = await loadJson<WorkspaceCard[]>(serverPath("/api/v1/cards"));
        const card = cards[0];
        if (!card) throw new Error("当前没有可展示的卡片");
        const view = Object.keys(card.samples)[0];
        const sample = card.samples[view]?.[0];
        if (!view || !sample) throw new Error("当前卡片没有可用示例");
        const encoded = encodeURIComponent(card.reference);
        const [context, compiled] = await Promise.all([
          loadJson<WorkspaceContext>(serverPath(`/api/v1/cards/${encoded}/context`)),
          loadJson<{ payload: JsonObject }>(serverPath(`/api/v1/cards/${encoded}/samples/${encodeURIComponent(sample)}?view=${encodeURIComponent(view)}`)),
        ]);
        return {
          featured: {
            kind: "workspace" as const,
            name: card.name,
            reference: card.reference,
            payload: compiled.payload,
            resources: {
              hostConfig: context.hostConfig,
              stylesheetUrls: [context.stylesheetUrl],
              adaptiveCardsSdkUrl: `https://cdn.jsdelivr.net/npm/adaptivecards@${context.renderProfile.adaptiveCardsSdkVersion}/dist/adaptivecards.min.js`,
            },
          },
        };
      }

      const embedded = bootstrap();
      const snapshot: CatalogSnapshotV1 = await loadCatalogSnapshot({
        snapshot: embedded.snapshot,
        snapshotUrl: embedded.snapshotUrl ?? serverPath("/api/v1/cards"),
      });
      const card = snapshot.cards[0];
      const version = card?.versions.find((item) => item.version === card.latest) ?? card?.versions[0];
      if (!card || !version) throw new Error("当前没有可展示的卡片");
      const artifact = await loadCardArtifact(version.reference, version.artifact.sha256, {
        artifact: embedded.artifacts?.[version.reference],
        artifactBaseUrl: embedded.artifactBaseUrl ?? `${serverPath("/api/v1/cards/")}{reference}/artifact`,
      });
      const view = Object.values(artifact.views)[0];
      const sample = view?.samples[0];
      if (!view || !sample) throw new Error("当前卡片没有可用示例");
      return {
        featured: {
          kind: "artifact" as const,
          name: card.name,
          reference: version.reference,
          artifact,
          sample,
        },
      };
    };

    void load()
      .then((result) => {
        if (!active) return;
        setFeatured(result.featured);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => { active = false; };
  }, [runtime]);

  if (runtimeLoading || !runtime) return <LoadingState label="正在准备能力展示" />;
  if (runtimeError) return <ErrorState message={runtimeError} />;
  if (error) return <ErrorState message={error} />;

  return (
    <main className="showcase-page">
      <section className="showcase-hero">
        <div className="showcase-hero-copy">
          <span className="showcase-kicker">Octo Card Forge</span>
          <h1>把业务卡片变成<br />可验证、可交付的产品资产。</h1>
          <p className="showcase-lead">只读的 Adaptive Cards 资产展示与工程检查台，面向开发者与外部 AI 代理。</p>
          <div className="showcase-actions">
            <Link className={cn(buttonVariants({ size: "lg" }), "showcase-primary-action")} to="/cards">浏览卡片库</Link>
            <Link className="showcase-secondary-action" to="/install">安装接入<ArrowRight /></Link>
          </div>
        </div>

        <div className="showcase-product">
          <div className="showcase-stage">
            <div className="showcase-preview">
              {featured?.kind === "artifact" ? <PreviewFrame artifact={featured.artifact} sample={featured.sample} title={`${featured.name} 展示`} /> : null}
              {featured?.kind === "workspace" ? <RawPreviewFrame card={featured.payload} resources={featured.resources} title={`${featured.name} 展示`} /> : null}
            </div>
          </div>
          <div className="showcase-stage-footer">
            <span>{featured?.reference ?? ""}</span>
            <span className="showcase-live"><i />检查通过</span>
          </div>
        </div>
      </section>

      <section className="showcase-flow" aria-labelledby="delivery-title">
        <h2 id="delivery-title">从契约到交付的可验证流程</h2>
        <div className="showcase-flow-list">
          {deliveryFlow.map(([title, description], index) => <article key={title}><span>0{index + 1}</span><div><strong>{title}</strong><small>{description}</small></div>{index < deliveryFlow.length - 1 ? <ArrowRight aria-hidden="true" /> : null}</article>)}
        </div>
      </section>

      <section className="showcase-index">
        <h2>精选卡片索引</h2>
        <div className="showcase-next-links">
          {featured ? <Link to={`/cards/${encodeURIComponent(featured.reference)}`}>{featured.name}<ArrowRight /></Link> : null}
          <Link to="/cards/ai.decision-action">行动决策卡<ArrowRight /></Link>
          <Link to="/cards/ai.reasoning-process">推理过程卡<ArrowRight /></Link>
        </div>
      </section>
    </main>
  );
}
