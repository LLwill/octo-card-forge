import { ExternalLink, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CardArtifactV1, CatalogSnapshotV1 } from "@mlt-org/octo-card-catalog-snapshot";
import { useRuntime } from "../../app/runtime.js";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { PreviewFrame } from "../../components/PreviewFrame.js";
import { bootstrap, serverPath } from "../../data/client.js";
import { deriveProfileResourceUrls, loadCardArtifact, loadCatalogSnapshot } from "../../data.js";
import { WorkspaceCardsPage } from "./WorkspaceCardsPage.js";

type CatalogCard = CatalogSnapshotV1["cards"][number];
type CatalogVersion = CatalogCard["versions"][number];
type DetailTab = "preview" | "contract" | "validation" | "versions";

const tabLabels: Record<DetailTab, string> = {
  preview: "Preview",
  contract: "Data contract",
  validation: "Validation",
  versions: "Versions",
};

function isTab(value: string | null): value is DetailTab {
  return value === "preview" || value === "contract" || value === "validation" || value === "versions";
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

  if (runtimeLoading) return <LoadingState label="Loading Forge runtime" />;
  if (runtimeError) return <ErrorState message={runtimeError} retry={reloadRuntime} />;
  if (runtime?.mode === "workspace") return <WorkspaceCardsPage />;
  if (error && !snapshot) return <ErrorState message={error} retry={() => setCatalogRevision((value) => value + 1)} />;

  const cards = (snapshot?.cards ?? []).filter((card) => {
    const query = filter.trim().toLocaleLowerCase();
    return !query || [card.id, card.name, card.namespace, card.key].some((value) => value?.toLocaleLowerCase().includes(query));
  });

  return (
    <main className="cards-workspace">
      <aside className="catalog-panel" aria-label="Card catalog">
        <div className="catalog-heading"><div><span className="eyebrow">Catalog</span><h1>Cards</h1></div><span className="count">{cards.length}</span></div>
        <label className="search-box"><Search size={16} aria-hidden="true" /><span className="sr-only">Search cards</span><input value={filter} onChange={(event) => {
          const value = event.target.value;
          setFilter(value);
          const next = new URLSearchParams(searchParams);
          value ? next.set("q", value) : next.delete("q");
          setSearchParams(next, { replace: true });
        }} placeholder="Search name or ID" /></label>
        <div className="catalog-list">{cards.map((card) => <button key={card.id} type="button" className={card.id === selectedCard?.id ? "catalog-row selected" : "catalog-row"} onClick={() => navigate(`/cards/${encodeURIComponent(card.id)}`)}><strong>{card.name}</strong><span><code>{card.id}</code><small>v{card.latest}</small></span></button>)}{!loading && cards.length === 0 ? <div className="empty-list">No cards match this search.</div> : null}</div>
        <footer className="catalog-footer"><span>{snapshot?.channel === "preview" ? "Preview snapshot" : "Release snapshot"}</span><code>{snapshot?.revision.slice(0, 12) ?? "-"}</code></footer>
      </aside>
      <section className="card-detail">
        {loading || !selectedCard || !selectedVersion || !artifact ? <LoadingState label="Verifying card artifact" /> : <CardDetail card={selectedCard} version={selectedVersion} artifact={artifact} searchParams={searchParams} setSearchParams={setSearchParams} />}
        {error && snapshot ? <div className="inline-error"><ErrorState message={error} /></div> : null}
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
    <header className="detail-header"><div><div className="identity-line"><code>{card.id}</code><span className="status-badge">Read only</span></div><h2>{card.name}</h2><p>{version.reference} · Contract {version.contractVersion} · {artifact.card.defaultLocale}</p></div><div className="detail-actions"><label>Version<select value={version.reference} onChange={(event) => setQuery("version", event.target.value)}>{card.versions.map((candidate) => <option key={candidate.reference} value={candidate.reference}>{candidate.version}</option>)}</select></label><SafeExternalLink href={version.release?.url ?? version.artifact.url}>Release</SafeExternalLink></div></header>
    <div className="detail-tabs" role="tablist">{Object.entries(tabLabels).map(([key, label]) => <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setQuery("tab", key)}>{label}</button>)}</div>
    {tab === "preview" ? <PreviewPanel artifact={artifact} version={version} viewName={viewName} sample={sample} setQuery={setQuery} /> : null}
    {tab === "contract" ? <JsonPanel title="Data contract" value={artifact.dataContract} /> : null}
    {tab === "validation" ? <ValidationPanel artifact={artifact} /> : null}
    {tab === "versions" ? <VersionsPanel card={card} setQuery={setQuery} /> : null}
  </>;
}

function PreviewPanel({ artifact, version, viewName, sample, setQuery }: { artifact: CardArtifactV1; version: CatalogVersion; viewName: string; sample: CardArtifactV1["views"][string]["samples"][number]; setQuery(key: string, value: string): void }) {
  const view = artifact.views[viewName];
  const resources = deriveProfileResourceUrls(artifact);
  return <div className="preview-layout"><section className="preview-surface"><div className="preview-toolbar"><label>View<select value={viewName} onChange={(event) => setQuery("view", event.target.value)}>{Object.keys(artifact.views).map((name) => <option key={name}>{name}</option>)}</select></label><label>Sample<select value={sample.name} onChange={(event) => setQuery("sample", event.target.value)}>{view.samples.map((candidate) => <option key={candidate.name}>{candidate.name}</option>)}</select></label><span className="valid-dot">Artifact valid</span></div><PreviewFrame artifact={artifact} sample={sample} title={`${artifact.card.name} ${viewName} preview`} /></section><aside className="facts-panel"><h3>Release facts</h3><dl><Fact label="Artifact SHA-256" value={`${version.artifact.sha256.slice(0, 10)}...${version.artifact.sha256.slice(-8)}`} mono /><Fact label="Render Profile" value={artifact.profile.reference} mono /><Fact label="Adaptive Cards SDK" value={artifact.profile.manifest.adaptiveCardsSdkVersion} /><Fact label="Wire profile" value={view.wireProfile} mono /><Fact label="Source commit" value={version.source.commit.slice(0, 12)} mono /></dl><div className="resource-links"><SafeExternalLink href={resources.hostConfig}>HostConfig</SafeExternalLink><SafeExternalLink href={resources.stylesheet}>Profile CSS</SafeExternalLink></div></aside></div>;
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><dt>{label}</dt><dd>{mono ? <code>{value}</code> : value}</dd></div>; }
function JsonPanel({ title, value }: { title: string; value: unknown }) { return <section className="panel code-panel"><h3>{title}</h3><pre><code>{JSON.stringify(value, null, 2)}</code></pre></section>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function ValidationPanel({ artifact }: { artifact: CardArtifactV1 }) {
  const samples = Object.values(artifact.views).reduce((sum, view) => sum + view.samples.length, 0);
  return <section className="panel validation-panel"><div className="validation-summary"><strong>Artifact validation passed</strong><span>{Object.keys(artifact.views).length} views · {samples} compiled samples · {artifact.validation.issues.length} warnings</span></div><div className="metrics"><Metric label="Max card version" value={artifact.profile.capabilities.maxAdaptiveCardVersion} /><Metric label="Max nodes" value={artifact.profile.capabilities.maxNodes} /><Metric label="Max depth" value={artifact.profile.capabilities.maxDepth} /><Metric label="Max payload" value={`${Math.round(artifact.profile.capabilities.maxPayloadBytes / 1024)} KiB`} /></div>{artifact.validation.issues.length ? <div className="issue-list">{artifact.validation.issues.map((issue, index) => <div key={`${issue.code}-${index}`}><code>{issue.code}</code><strong>{issue.message}</strong><span>{issue.path}</span></div>)}</div> : <p className="empty-panel">No validation warnings in this immutable artifact.</p>}</section>;
}

function VersionsPanel({ card, setQuery }: { card: CatalogCard; setQuery(key: string, value: string): void }) {
  return <section className="panel"><h3>Published versions</h3><div className="versions-table"><div className="table-head"><span>Version</span><span>Profile</span><span>Source</span><span></span></div>{card.versions.map((version) => <div className="table-row" key={version.reference}><strong>{version.version}</strong><code>{version.renderProfile}</code><code>{version.source.commit.slice(0, 12)}</code><button type="button" onClick={() => setQuery("version", version.reference)}>Open</button></div>)}</div></section>;
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
