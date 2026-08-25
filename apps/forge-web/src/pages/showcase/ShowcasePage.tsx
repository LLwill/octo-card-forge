import { ArrowRight, Braces, Layers3, PackageCheck, Shapes } from "lucide-react";
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
  viewCount: number;
  sampleCount: number;
} & ({
  kind: "artifact";
  artifact: CardArtifactV1;
  sample: CardArtifactV1["views"][string]["samples"][number];
} | {
  kind: "workspace";
  payload: JsonObject;
  resources: Parameters<typeof RawPreviewFrame>[0]["resources"];
});

const capabilities = [
  {
    icon: Layers3,
    title: "完整状态表达",
    description: "同一张卡片可以覆盖等待、成功、拒绝等不同业务状态，并保持一致的信息层级。",
  },
  {
    icon: Shapes,
    title: "可复用设计规范",
    description: "组件、语义色、间距和组合模式来自同一套规范，减少重复设计与实现偏差。",
  },
  {
    icon: PackageCheck,
    title: "可验证的交付",
    description: "数据结构、示例和检查结果随卡片一起交付，让设计效果能够稳定复现。",
  },
];

export function ShowcasePage() {
  const { runtime, loading: runtimeLoading, error: runtimeError } = useRuntime();
  const [featured, setFeatured] = useState<FeaturedCard>();
  const [cardCount, setCardCount] = useState(0);
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
          cardCount: cards.length,
          featured: {
            kind: "workspace" as const,
            name: card.name,
            reference: card.reference,
            viewCount: Object.keys(card.samples).length,
            sampleCount: Object.values(card.samples).reduce((sum, samples) => sum + samples.length, 0),
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
        cardCount: snapshot.cards.length,
        featured: {
          kind: "artifact" as const,
          name: card.name,
          reference: version.reference,
          viewCount: Object.keys(artifact.views).length,
          sampleCount: Object.values(artifact.views).reduce((sum, item) => sum + item.samples.length, 0),
          artifact,
          sample,
        },
      };
    };

    void load()
      .then((result) => {
        if (!active) return;
        setCardCount(result.cardCount);
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
        <div className="showcase-heading">
          <div>
            <span className="showcase-kicker">卡片能力展示 · {cardCount || "—"} 个案例</span>
            <h1>Octo Card Forge</h1>
          </div>
          <div className="showcase-intro">
            <strong>让结构、状态与交互一起被看见。</strong>
            <p>从真实业务案例出发，查看一张卡片如何组织信息、承载操作，并在不同状态下保持清晰。</p>
            <div className="showcase-actions">
              <Link className={cn(buttonVariants({ size: "lg" }), "bg-foreground text-background hover:bg-foreground/90")} to="/cards">浏览卡片案例<ArrowRight data-icon="inline-end" /></Link>
              <Link className={buttonVariants({ variant: "outline", size: "lg" })} to="/components">查看设计规范</Link>
            </div>
          </div>
        </div>

        <div className="showcase-stage">
          <div className="showcase-stage-header">
            <div><span>精选案例</span><strong>{featured?.name ?? "正在加载"}</strong></div>
            {featured ? <Link to={`/cards/${encodeURIComponent(featured.reference)}`}>查看完整案例<ArrowRight size={15} /></Link> : null}
          </div>
          <div className="showcase-preview">
            {featured?.kind === "artifact" ? <PreviewFrame artifact={featured.artifact} sample={featured.sample} title={`${featured.name} 展示`} /> : null}
            {featured?.kind === "workspace" ? <RawPreviewFrame card={featured.payload} resources={featured.resources} title={`${featured.name} 展示`} /> : null}
          </div>
          <div className="showcase-stage-footer">
            <span>{featured?.reference ?? ""}</span>
            <span>{featured ? `${featured.viewCount} 个状态 · ${featured.sampleCount} 个示例` : ""}</span>
          </div>
        </div>
      </section>

      <section className="showcase-capabilities" aria-labelledby="capabilities-title">
        <div className="showcase-section-heading"><span>核心能力</span><h2 id="capabilities-title">不止是把 JSON 渲染出来</h2></div>
        <div className="showcase-capability-list">
          {capabilities.map(({ icon: Icon, title, description }, index) => <article key={title}><span className="showcase-capability-number">0{index + 1}</span><Icon aria-hidden="true" /><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>

      <section className="showcase-next">
        <div><span>开始探索</span><h2>从案例理解能力，从规范开始创作。</h2></div>
        <div className="showcase-next-links">
          <Link to="/cards">卡片案例<ArrowRight /></Link>
          <Link to="/components">设计规范<ArrowRight /></Link>
          <Link to="/playground"><Braces />预览调试</Link>
        </div>
      </section>
    </main>
  );
}
