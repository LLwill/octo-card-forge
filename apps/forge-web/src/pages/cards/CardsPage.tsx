import { ArrowRight, ExternalLink, LayoutTemplate, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CardArtifactV1, CatalogSnapshotV1 } from "@mlt-org/octo-card-catalog-snapshot";
import { useRuntime } from "../../app/runtime.js";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { PreviewFrame } from "../../components/PreviewFrame.js";
import { bootstrap, serverPath } from "../../data/client.js";
import { deriveProfileResourceUrls, loadCardArtifact, loadCatalogSnapshot } from "../../data.js";
import { WorkspaceCardsPage } from "./WorkspaceCardsPage.js";

type CatalogCard = CatalogSnapshotV1["cards"][number];
type CatalogVersion = CatalogCard["versions"][number];
type DetailTab = "preview" | "contract" | "validation";

const tabLabels: Record<DetailTab, string> = {
  preview: "预览",
  contract: "数据结构",
  validation: "检查结果",
};

const cardDescriptions: Record<string, string> = {
  "ai.decision-action": "呈现候选行动、确认步骤与提交结果，帮助用户清楚地完成一次决策。",
  "ai.reasoning-process": "呈现推理进度、阶段状态与最终结果，让复杂过程保持可读。",
  "docs.access-request": "用于请求访问或协作文档，并清晰呈现审批状态与结果。",
};

function describeCard(card: CatalogCard): string {
  return cardDescriptions[card.id] ?? "展示业务交互、数据契约与可验证渲染结果。";
}

function isTab(value: string | null): value is DetailTab {
  return value === "preview" || value === "contract" || value === "validation";
}

export function CardsPage() {
  const { runtime, loading: runtimeLoading, error: runtimeError, reload: reloadRuntime } = useRuntime();
  const { reference } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState<CatalogSnapshotV1>();
  const [artifact, setArtifact] = useState<CardArtifactV1>();
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState(searchParams.get("q") ?? "");
  const [catalogRevision, setCatalogRevision] = useState(0);

  useEffect(() => {
    if (!runtime || runtime.mode !== "published") return;
    let active = true;
    setSnapshotLoading(true);
    setError(undefined);
    const embedded = bootstrap();
    void loadCatalogSnapshot({
      snapshot: embedded.snapshot,
      snapshotUrl: embedded.snapshotUrl ?? serverPath("/api/v1/cards"),
    })
      .then((value) => { if (active) setSnapshot(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setSnapshotLoading(false); });
    return () => { active = false; };
  }, [runtime, catalogRevision]);

  const namespace = searchParams.get("namespace") ?? "all";
  const namespaces = useMemo(() => [...new Set((snapshot?.cards ?? []).map((card) => card.namespace))].sort(), [snapshot]);
  const cards = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return (snapshot?.cards ?? []).filter((card) =>
      (namespace === "all" || card.namespace === namespace)
      && (!query || [card.id, card.name, card.namespace, card.key].some((value) => value?.toLocaleLowerCase().includes(query))),
    );
  }, [filter, namespace, snapshot]);
  const selectedCard = useMemo(() => {
    if (!snapshot) return undefined;
    return snapshot.cards.find((card) => card.id === reference || card.versions.some((version) => version.reference === reference)) ?? snapshot.cards[0];
  }, [snapshot, reference]);
  const requestedVersion = searchParams.get("version");
  const selectedVersion = selectedCard?.versions.find((version) => version.reference === requestedVersion || version.version === requestedVersion)
    ?? selectedCard?.versions.find((version) => version.version === selectedCard.latest)
    ?? selectedCard?.versions[0];

  useEffect(() => {
    if (!reference || !selectedVersion) {
      setArtifact(undefined);
      setArtifactLoading(false);
      return;
    }
    let active = true;
    setArtifact(undefined);
    setArtifactLoading(true);
    setError(undefined);
    const embedded = bootstrap();
    void loadCardArtifact(selectedVersion.reference, selectedVersion.artifact.sha256, {
      artifact: embedded.artifacts?.[selectedVersion.reference],
      artifactBaseUrl: embedded.artifactBaseUrl ?? `${serverPath("/api/v1/cards/")}{reference}/artifact`,
    })
      .then((value) => { if (active) setArtifact(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setArtifactLoading(false); });
    return () => { active = false; };
  }, [reference, selectedVersion]);

  if (runtimeLoading) return <LoadingState label="正在准备卡片库" />;
  if (runtimeError) return <ErrorState message={runtimeError} retry={reloadRuntime} />;
  if (runtime?.mode === "workspace") return <WorkspaceCardsPage />;
  if (error && !snapshot) return <ErrorState message={error} retry={() => setCatalogRevision((value) => value + 1)} />;

  return (
    <main className={reference ? "card-detail-page" : "catalog-page"}>
      {!reference ? <section className="catalog-overview">
        <header className="catalog-page-header">
          <div><h1>卡片库</h1><p>查找可复用的 Card Package，并进入详情查看预览与数据契约。</p><span>{cards.length} 个卡片包</span></div>
          <div className="catalog-tools"><label className="search-box"><Search size={16} aria-hidden="true" /><span className="sr-only">搜索卡片</span><input value={filter} onChange={(event) => {
          const value = event.target.value;
          setFilter(value);
          const next = new URLSearchParams(searchParams);
          value ? next.set("q", value) : next.delete("q");
          setSearchParams(next, { replace: true });
        }} placeholder="搜索名称或 Card ID" /></label><select aria-label="命名空间" value={namespace} onChange={(event) => {
          const next = new URLSearchParams(searchParams);
          event.target.value === "all" ? next.delete("namespace") : next.set("namespace", event.target.value);
          setSearchParams(next, { replace: true });
        }}><option value="all">全部命名空间</option>{namespaces.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        </header>
        {snapshotLoading ? <LoadingState label="正在加载卡片库" /> : <CatalogGrid cards={cards} navigate={navigate} />}
      </section> : <section className="card-detail">
        <div className="card-detail-inner">
          {artifactLoading || !selectedCard || !selectedVersion || !artifact ? <LoadingState label="正在加载卡片" /> : <CardDetail card={selectedCard} version={selectedVersion} artifact={artifact} searchParams={searchParams} setSearchParams={setSearchParams} />}
          {error && snapshot ? <div className="inline-error"><ErrorState message={error} /></div> : null}
        </div>
      </section>}
    </main>
  );
}

function CatalogGrid({ cards, navigate }: {
  cards: CatalogCard[];
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (!cards.length) return <div className="catalog-empty"><Search size={20} /><strong>没有找到卡片</strong><span>换一个名称、Card ID 或命名空间试试。</span></div>;
  return <div className="catalog-grid">{cards.map((card) => <button type="button" className="catalog-card" key={card.id} onClick={() => navigate(`/cards/${encodeURIComponent(card.id)}`)}>
    <span className="catalog-card-icon"><LayoutTemplate size={20} aria-hidden="true" /></span>
    <span className="catalog-card-version">v{card.latest}</span>
    <strong>{card.name}</strong>
    <code>{card.id}</code>
    <span className="catalog-card-description">{describeCard(card)}</span>
    <span className="catalog-card-footer"><span><i />已发布</span><span>查看详情 <ArrowRight size={15} /></span></span>
  </button>)}</div>;
}

function CardDetail({ card, version, artifact, searchParams, setSearchParams }: {
  card: CatalogCard;
  version: CatalogVersion;
  artifact: CardArtifactV1;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
}) {
  const tabValue = searchParams.get("tab");
  const tab: DetailTab = isTab(tabValue) ? tabValue : "preview";
  const requestedView = searchParams.get("view");
  const viewName = requestedView && artifact.views[requestedView] ? requestedView : Object.keys(artifact.views)[0];
  const view = artifact.views[viewName];
  const sampleName = searchParams.get("sample");
  const sample = view.samples.find((candidate) => candidate.name === sampleName) ?? view.samples[0];
  const setQuery = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    if (key === "view") next.delete("sample");
    setSearchParams(next, { replace: true });
  };
  return <>
    <Link className="detail-breadcrumb" to="/cards">卡片库</Link>
    <header className="detail-header"><div><div className="identity-line"><h1>{card.name}</h1><code>{card.id}</code></div><p>{describeCard(card)}</p><div className="detail-meta"><span className="status-draft">已发布</span><span>v{version.version}</span><span>{Object.keys(artifact.views).length} 个视图</span><span className="status-valid">检查通过</span></div></div><div className="detail-actions">{card.versions.length > 1 ? <label>版本<select value={version.reference} onChange={(event) => setQuery("version", event.target.value)}>{card.versions.map((candidate) => <option key={candidate.reference} value={candidate.reference}>{candidate.version}</option>)}</select></label> : <span className="version-label">v{version.version}</span>}<SafeExternalLink href={version.release?.url ?? version.artifact.url}>发行说明</SafeExternalLink></div></header>
    <div className="detail-tabs" role="tablist">{Object.entries(tabLabels).map(([key, label]) => <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setQuery("tab", key)}>{label}</button>)}</div>
    {tab === "preview" ? <PreviewPanel artifact={artifact} version={version} viewName={viewName} sample={sample} setQuery={setQuery} /> : null}
    {tab === "contract" ? <JsonPanel title="卡片需要的数据" value={artifact.dataContract} /> : null}
    {tab === "validation" ? <ValidationPanel artifact={artifact} /> : null}
  </>;
}

function PreviewPanel({ artifact, version, viewName, sample, setQuery }: { artifact: CardArtifactV1; version: CatalogVersion; viewName: string; sample: CardArtifactV1["views"][string]["samples"][number]; setQuery(key: string, value: string): void }) {
  const view = artifact.views[viewName];
  const resources = deriveProfileResourceUrls(artifact);
  const [width, setWidth] = useState(480);
  return <div className="preview-stack"><div className="preview-toolbar"><label>视图<select value={viewName} onChange={(event) => setQuery("view", event.target.value)}>{Object.keys(artifact.views).map((name) => <option key={name}>{name}</option>)}</select></label><label>样例<select value={sample.name} onChange={(event) => setQuery("sample", event.target.value)}>{view.samples.map((candidate) => <option key={candidate.name}>{candidate.name}</option>)}</select></label><div className="width-switch" aria-label="预览宽度">{[320, 480, 640].map((value) => <button key={value} type="button" className={width === value ? "active" : ""} onClick={() => setWidth(value)}>{value}</button>)}</div></div><section className="preview-surface"><div className="detail-preview-frame" style={{ width: `min(100%, ${width}px)` }}><PreviewFrame artifact={artifact} sample={sample} title={`${artifact.card.name} ${viewName} 预览`} /></div></section><div className="detail-ledger"><Fact label="数据契约" value={`${Object.keys(artifact.dataContract.properties ?? {}).length} 个字段`} /><Fact label="交互检查" value={`${sample.inspection.actions.length} 个动作`} /><Fact label="渲染规范" value={artifact.profile.reference} mono /><Fact label="源文件" value={version.source.path} mono /></div><details className="technical-details"><summary>更多技术信息</summary><div className="technical-details-content"><dl><Fact label="产物摘要" value={`${version.artifact.sha256.slice(0, 10)}...${version.artifact.sha256.slice(-8)}`} mono /><Fact label="渲染 SDK" value={artifact.profile.manifest.adaptiveCardsSdkVersion} /><Fact label="数据协议" value={view.wireProfile} mono /><Fact label="来源提交" value={version.source.commit.slice(0, 12)} mono /></dl><div className="resource-links"><SafeExternalLink href={resources.hostConfig}>主机配置</SafeExternalLink><SafeExternalLink href={resources.stylesheet}>样式文件</SafeExternalLink></div></div></details></div>;
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><dt>{label}</dt><dd>{mono ? <code>{value}</code> : value}</dd></div>; }
function JsonPanel({ title, value }: { title: string; value: unknown }) { return <section className="panel code-panel"><h3>{title}</h3><pre><code>{JSON.stringify(value, null, 2)}</code></pre></section>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function ValidationPanel({ artifact }: { artifact: CardArtifactV1 }) {
  const samples = Object.values(artifact.views).reduce((sum, view) => sum + view.samples.length, 0);
  return <section className="panel validation-panel"><div className="validation-summary"><strong>{artifact.validation.issues.length ? "发现需要关注的问题" : "全部检查通过"}</strong><span>已检查 {Object.keys(artifact.views).length} 个状态和 {samples} 个示例</span></div>{artifact.validation.issues.length ? <div className="issue-list">{artifact.validation.issues.map((issue, index) => <div key={`${issue.code}-${index}`}><code>{issue.code}</code><strong>{issue.message}</strong><span>{issue.path}</span></div>)}</div> : <p className="empty-panel">当前版本没有发现问题。</p>}<details className="technical-details"><summary>技术限制</summary><div className="metrics"><Metric label="卡片版本上限" value={artifact.profile.capabilities.maxAdaptiveCardVersion} /><Metric label="节点上限" value={artifact.profile.capabilities.maxNodes} /><Metric label="层级上限" value={artifact.profile.capabilities.maxDepth} /><Metric label="数据大小上限" value={`${Math.round(artifact.profile.capabilities.maxPayloadBytes / 1024)} KiB`} /></div></details></section>;
}

function SafeExternalLink({ href, children }: { href: string; children: ReactNode }) {
  let safe: string | undefined;
  try {
    const url = new URL(href, window.location.href);
    if (url.protocol === "https:" || (url.protocol === "http:" && url.origin === window.location.origin)) safe = url.toString();
  } catch {
    safe = undefined;
  }
  return safe ? <a className="button secondary" href={safe} target="_blank" rel="noreferrer">{children}<ExternalLink size={14} /></a> : null;
}
