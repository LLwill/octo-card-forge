import { Braces, ExternalLink, Search } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState(searchParams.get("q") ?? "");
  const [catalogRevision, setCatalogRevision] = useState(0);

  useEffect(() => {
    if (!runtime || runtime.mode !== "published") return;
    let active = true;
    setLoading(true);
    setError(undefined);
    const embedded = bootstrap();
    void loadCatalogSnapshot({
      snapshot: embedded.snapshot,
      snapshotUrl: embedded.snapshotUrl ?? serverPath("/api/v1/cards"),
    })
      .then((value) => { if (active) setSnapshot(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [runtime, catalogRevision]);

  const selectedCard = useMemo(() => {
    if (!snapshot) return undefined;
    return snapshot.cards.find((card) => card.id === reference || card.versions.some((version) => version.reference === reference)) ?? snapshot.cards[0];
  }, [snapshot, reference]);
  const requestedVersion = searchParams.get("version");
  const selectedVersion = selectedCard?.versions.find((version) => version.reference === requestedVersion || version.version === requestedVersion)
    ?? selectedCard?.versions.find((version) => version.version === selectedCard.latest)
    ?? selectedCard?.versions[0];

  useEffect(() => {
    if (!selectedCard || reference) return;
    void navigate(`/cards/${encodeURIComponent(selectedCard.id)}${window.location.search}`, { replace: true });
  }, [selectedCard, reference, navigate]);

  useEffect(() => {
    if (!selectedVersion) return;
    let active = true;
    setArtifact(undefined);
    setLoading(true);
    setError(undefined);
    const embedded = bootstrap();
    void loadCardArtifact(selectedVersion.reference, selectedVersion.artifact.sha256, {
      artifact: embedded.artifacts?.[selectedVersion.reference],
      artifactBaseUrl: embedded.artifactBaseUrl ?? `${serverPath("/api/v1/cards/")}{reference}/artifact`,
    })
      .then((value) => { if (active) setArtifact(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedVersion]);

  if (runtimeLoading) return <LoadingState label="正在准备卡片库" />;
  if (runtimeError) return <ErrorState message={runtimeError} retry={reloadRuntime} />;
  if (runtime?.mode === "workspace") return <WorkspaceCardsPage />;
  if (error && !snapshot) return <ErrorState message={error} retry={() => setCatalogRevision((value) => value + 1)} />;

  const cards = (snapshot?.cards ?? []).filter((card) => {
    const query = filter.trim().toLocaleLowerCase();
    return !query || [card.id, card.name, card.namespace, card.key].some((value) => value?.toLocaleLowerCase().includes(query));
  });

  return (
    <main className="cards-workspace">
      <aside className="catalog-panel" aria-label="卡片库">
        <div className="catalog-heading"><div><span className="eyebrow">能力案例</span><h1>卡片案例</h1></div><span className="count">{cards.length}</span></div>
        <label className="search-box"><Search size={16} aria-hidden="true" /><span className="sr-only">搜索卡片</span><input value={filter} onChange={(event) => {
          const value = event.target.value;
          setFilter(value);
          const next = new URLSearchParams(searchParams);
          value ? next.set("q", value) : next.delete("q");
          setSearchParams(next, { replace: true });
        }} placeholder="搜索名称或 ID" /></label>
        <div className="catalog-list">{cards.map((card) => <button key={card.id} type="button" className={card.id === selectedCard?.id ? "catalog-row selected" : "catalog-row"} onClick={() => navigate(`/cards/${encodeURIComponent(card.id)}`)}><strong>{card.name}</strong><span><code>{card.id}</code><small>v{card.latest}</small></span></button>)}{!loading && cards.length === 0 ? <div className="empty-list">没有找到匹配的卡片。</div> : null}</div>
      </aside>
      <section className="card-detail">
        <div className="card-detail-inner">
          {loading || !selectedCard || !selectedVersion || !artifact ? <LoadingState label="正在加载卡片" /> : <CardDetail card={selectedCard} version={selectedVersion} artifact={artifact} searchParams={searchParams} setSearchParams={setSearchParams} />}
          {error && snapshot ? <div className="inline-error"><ErrorState message={error} /></div> : null}
        </div>
      </section>
    </main>
  );
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
    <header className="detail-header"><div><div className="identity-line"><code>{card.id}</code><span className="status-badge">v{version.version}</span></div><h2>{card.name}</h2><p>查看卡片效果、所需数据和检查结果</p></div><div className="detail-actions">{card.versions.length > 1 ? <label>版本<select value={version.reference} onChange={(event) => setQuery("version", event.target.value)}>{card.versions.map((candidate) => <option key={candidate.reference} value={candidate.reference}>{candidate.version}</option>)}</select></label> : null}<Link className="button secondary" to="/playground"><Braces size={14} />用数据预览</Link><SafeExternalLink href={version.release?.url ?? version.artifact.url}>发行说明</SafeExternalLink></div></header>
    <div className="detail-tabs" role="tablist">{Object.entries(tabLabels).map(([key, label]) => <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setQuery("tab", key)}>{label}</button>)}</div>
    {tab === "preview" ? <PreviewPanel artifact={artifact} version={version} viewName={viewName} sample={sample} setQuery={setQuery} /> : null}
    {tab === "contract" ? <JsonPanel title="卡片需要的数据" value={artifact.dataContract} /> : null}
    {tab === "validation" ? <ValidationPanel artifact={artifact} /> : null}
  </>;
}

function PreviewPanel({ artifact, version, viewName, sample, setQuery }: { artifact: CardArtifactV1; version: CatalogVersion; viewName: string; sample: CardArtifactV1["views"][string]["samples"][number]; setQuery(key: string, value: string): void }) {
  const view = artifact.views[viewName];
  const resources = deriveProfileResourceUrls(artifact);
  return <div className="preview-stack"><section className="preview-surface"><div className="preview-toolbar"><label>状态<select value={viewName} onChange={(event) => setQuery("view", event.target.value)}>{Object.keys(artifact.views).map((name) => <option key={name}>{name}</option>)}</select></label><label>示例<select value={sample.name} onChange={(event) => setQuery("sample", event.target.value)}>{view.samples.map((candidate) => <option key={candidate.name}>{candidate.name}</option>)}</select></label><span className="valid-dot">检查通过</span></div><PreviewFrame artifact={artifact} sample={sample} title={`${artifact.card.name} ${viewName} 预览`} /></section><details className="technical-details"><summary>技术信息</summary><div className="technical-details-content"><dl><Fact label="产物摘要" value={`${version.artifact.sha256.slice(0, 10)}...${version.artifact.sha256.slice(-8)}`} mono /><Fact label="渲染配置" value={artifact.profile.reference} mono /><Fact label="渲染 SDK" value={artifact.profile.manifest.adaptiveCardsSdkVersion} /><Fact label="数据协议" value={view.wireProfile} mono /><Fact label="来源提交" value={version.source.commit.slice(0, 12)} mono /></dl><div className="resource-links"><SafeExternalLink href={resources.hostConfig}>主机配置</SafeExternalLink><SafeExternalLink href={resources.stylesheet}>样式文件</SafeExternalLink></div></div></details></div>;
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
