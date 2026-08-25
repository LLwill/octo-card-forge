import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { JsonObject, RenderProfileManifestV1 } from "@mlt-org/octo-card-spec";
import type { PreviewSession } from "@mlt-org/octo-card-preview-kit";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { RawPreviewFrame } from "../../components/PreviewFrame.js";
import { loadJson, serverPath } from "../../data/client.js";

interface WorkspaceCard {
  reference: string;
  id: string;
  name: string;
  kind: string;
  mutable: boolean;
  version: string;
  contractVersion: string;
  renderProfile: string;
  samples: Record<string, string[]>;
}

interface CardContext {
  card: WorkspaceCard & { defaultLocale?: string };
  renderProfile: RenderProfileManifestV1;
  renderProfileSource: string;
  hostConfig: JsonObject;
  stylesheetUrl: string;
}

interface ContractResponse {
  schema: JsonObject;
  interactionReports: Array<{ sample: string; view: string; inspection: unknown }>;
}

interface CompileResponse {
  payload: JsonObject;
  issues: Array<{ severity: string; code: string; path: string; message: string }>;
  inspection: unknown;
}

export function WorkspaceCardsPage() {
  const { reference } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cards, setCards] = useState<WorkspaceCard[]>();
  const [context, setContext] = useState<CardContext>();
  const [contract, setContract] = useState<ContractResponse>();
  const [session, setSession] = useState<PreviewSession>();
  const [compiled, setCompiled] = useState<CompileResponse>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    let active = true;
    void loadJson<WorkspaceCard[]>(serverPath("/api/cards"))
      .then((value) => { if (active) setCards(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  const selected = useMemo(() => cards?.find((card) => card.id === reference || card.reference === reference) ?? cards?.[0], [cards, reference]);
  const view = searchParams.get("view") ?? Object.keys(selected?.samples ?? {})[0];
  const sample = searchParams.get("sample") ?? selected?.samples[view]?.[0];
  const tab = searchParams.get("tab") ?? "preview";

  useEffect(() => {
    if (!selected || reference) return;
    void navigate(`/cards/${encodeURIComponent(selected.reference)}`, { replace: true });
  }, [selected, reference, navigate]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setError(undefined);
    const encoded = encodeURIComponent(selected.reference);
    void Promise.all([
      loadJson<CardContext>(serverPath(`/api/cards/${encoded}/context`)),
      loadJson<ContractResponse>(serverPath(`/api/cards/${encoded}/contract`)),
      loadJson<PreviewSession>(serverPath(`/api/preview/v1/session?cardId=${encoded}`)),
    ]).then(([nextContext, nextContract, nextSession]) => {
      if (!active) return;
      setContext(nextContext);
      setContract(nextContract);
      setSession(nextSession);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [selected]);

  useEffect(() => {
    if (!selected || !view || !sample) return;
    let active = true;
    const url = serverPath(`/api/cards/${encodeURIComponent(selected.reference)}/samples/${encodeURIComponent(sample)}?view=${encodeURIComponent(view)}`);
    void loadJson<CompileResponse>(url)
      .then((value) => { if (active) setCompiled(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [selected, view, sample]);

  if (error) return <ErrorState message={error} />;
  if (!cards || !selected || !context || !contract || !session || !compiled) return <LoadingState label="Loading workspace cards" />;
  const query = filter.trim().toLocaleLowerCase();
  const visible = cards.filter((card) => !query || `${card.id} ${card.name}`.toLocaleLowerCase().includes(query));
  const setQuery = (key: string, value: string) => { const next = new URLSearchParams(searchParams); next.set(key, value); if (key === "view") next.delete("sample"); setSearchParams(next, { replace: true }); };
  const resources = {
    hostConfig: context.hostConfig,
    stylesheetUrls: [context.stylesheetUrl],
    adaptiveCardsSdkUrl: `https://cdn.jsdelivr.net/npm/adaptivecards@${context.renderProfile.adaptiveCardsSdkVersion}/dist/adaptivecards.min.js`,
  };

  return <main className="cards-workspace"><aside className="catalog-panel" aria-label="Workspace cards"><div className="catalog-heading"><div><span className="eyebrow">Workspace</span><h1>Cards</h1></div><span className="count">{visible.length}</span></div><label className="search-box"><Search size={16} /><span className="sr-only">Search cards</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search name or ID" /></label><div className="catalog-list">{visible.map((card) => <button key={card.reference} type="button" className={card.reference === selected.reference ? "catalog-row selected" : "catalog-row"} onClick={() => navigate(`/cards/${encodeURIComponent(card.reference)}`)}><strong>{card.name}</strong><span><code>{card.reference}</code><small>{card.kind}</small></span></button>)}</div><footer className="catalog-footer"><span>{selected.mutable ? "Mutable draft" : "Pinned release"}</span><code>{selected.renderProfile}</code></footer></aside>
    <section className="card-detail"><header className="detail-header"><div><div className="identity-line"><code>{selected.reference}</code><span className="status-badge">{selected.mutable ? "Workspace" : "Release"}</span></div><h2>{selected.name}</h2><p>Contract {selected.contractVersion} · {context.renderProfile.id}@{context.renderProfile.version}</p></div><div className="detail-actions"><a className="button primary" href={serverPath(`/api/cards/${encodeURIComponent(selected.reference)}/handoff`)}><Download size={14} />Handoff</a></div></header><div className="detail-tabs" role="tablist">{[["preview", "Preview"], ["contract", "Data contract"], ["validation", "Validation"]].map(([key, label]) => <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setQuery("tab", key)}>{label}</button>)}</div>
      {tab === "preview" ? <div className="preview-layout"><section className="preview-surface"><div className="preview-toolbar"><label>View<select value={view} onChange={(event) => setQuery("view", event.target.value)}>{Object.keys(selected.samples).map((name) => <option key={name}>{name}</option>)}</select></label><label>Sample<select value={sample} onChange={(event) => setQuery("sample", event.target.value)}>{selected.samples[view].map((name) => <option key={name}>{name}</option>)}</select></label><span className="valid-dot">{compiled.issues.length ? `${compiled.issues.length} diagnostics` : "Compile valid"}</span></div><RawPreviewFrame card={compiled.payload} resources={resources} title={`${selected.name} preview`} /></section><aside className="facts-panel"><h3>Workspace facts</h3><dl><div><dt>Revision</dt><dd><code>{session.revision.slice(0, 20)}...</code></dd></div><div><dt>Render Profile</dt><dd><code>{session.renderProfile.reference}</code></dd></div><div><dt>Source</dt><dd>{context.renderProfileSource}</dd></div><div><dt>View</dt><dd><code>{view}</code></dd></div></dl></aside></div> : null}
      {tab === "contract" ? <section className="panel code-panel"><h3>Data contract</h3><pre><code>{JSON.stringify(contract.schema, null, 2)}</code></pre></section> : null}
      {tab === "validation" ? <section className="panel"><h3>Interaction reports</h3><div className="issue-list">{contract.interactionReports.map((report) => <div key={`${report.view}-${report.sample}`}><code>{report.view}/{report.sample}</code><strong>Compiled with current profile</strong><span>{JSON.stringify(report.inspection)}</span></div>)}</div></section> : null}
    </section></main>;
}
