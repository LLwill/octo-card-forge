import { Braces, Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
    void loadJson<WorkspaceCard[]>(serverPath("/api/v1/cards"))
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
      loadJson<CardContext>(serverPath(`/api/v1/cards/${encoded}/context`)),
      loadJson<ContractResponse>(serverPath(`/api/v1/cards/${encoded}/contract`)),
      loadJson<PreviewSession>(serverPath(`/api/v1/preview/session?cardId=${encoded}`)),
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
    const url = serverPath(`/api/v1/cards/${encodeURIComponent(selected.reference)}/samples/${encodeURIComponent(sample)}?view=${encodeURIComponent(view)}`);
    void loadJson<CompileResponse>(url)
      .then((value) => { if (active) setCompiled(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [selected, view, sample]);

  if (error) return <ErrorState message={error} />;
  if (!cards || !selected || !context || !contract || !session || !compiled) return <LoadingState label="正在加载卡片" />;
  const query = filter.trim().toLocaleLowerCase();
  const visible = cards.filter((card) => !query || `${card.id} ${card.name}`.toLocaleLowerCase().includes(query));
  const setQuery = (key: string, value: string) => { const next = new URLSearchParams(searchParams); next.set(key, value); if (key === "view") next.delete("sample"); setSearchParams(next, { replace: true }); };
  const resources = {
    hostConfig: context.hostConfig,
    stylesheetUrls: [context.stylesheetUrl],
    adaptiveCardsSdkUrl: `https://cdn.jsdelivr.net/npm/adaptivecards@${context.renderProfile.adaptiveCardsSdkVersion}/dist/adaptivecards.min.js`,
  };

  return <main className="cards-workspace"><aside className="catalog-panel" aria-label="卡片库"><div className="catalog-heading"><div><span className="eyebrow">能力案例</span><h1>卡片案例</h1></div><span className="count">{visible.length}</span></div><label className="search-box"><Search size={16} /><span className="sr-only">搜索卡片</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="搜索名称或 ID" /></label><div className="catalog-list">{visible.map((card) => <button key={card.reference} type="button" className={card.reference === selected.reference ? "catalog-row selected" : "catalog-row"} onClick={() => navigate(`/cards/${encodeURIComponent(card.reference)}`)}><strong>{card.name}</strong><span><code>{card.id}</code><small>{card.mutable ? "草稿" : `v${card.version}`}</small></span></button>)}{visible.length === 0 ? <div className="empty-list">没有找到匹配的卡片。</div> : null}</div></aside>
    <section className="card-detail"><div className="card-detail-inner"><header className="detail-header"><div><div className="identity-line"><code>{selected.id}</code><span className="status-badge">{selected.mutable ? "草稿" : `v${selected.version}`}</span></div><h2>{selected.name}</h2><p>查看卡片效果、所需数据和检查结果</p></div><div className="detail-actions"><Link className="button secondary" to="/playground"><Braces size={14} />用数据预览</Link><a className="button primary" href={serverPath(`/api/v1/cards/${encodeURIComponent(selected.reference)}/handoff`)}><Download size={14} />下载交付包</a></div></header><div className="detail-tabs" role="tablist">{[["preview", "预览"], ["contract", "数据结构"], ["validation", "检查结果"]].map(([key, label]) => <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setQuery("tab", key)}>{label}</button>)}</div>
      {tab === "preview" ? <div className="preview-stack"><section className="preview-surface"><div className="preview-toolbar"><label>状态<select value={view} onChange={(event) => setQuery("view", event.target.value)}>{Object.keys(selected.samples).map((name) => <option key={name}>{name}</option>)}</select></label><label>示例<select value={sample} onChange={(event) => setQuery("sample", event.target.value)}>{selected.samples[view].map((name) => <option key={name}>{name}</option>)}</select></label><span className="valid-dot">{compiled.issues.length ? `${compiled.issues.length} 个问题` : "检查通过"}</span></div><RawPreviewFrame card={compiled.payload} resources={resources} title={`${selected.name} 预览`} /></section><details className="technical-details"><summary>技术信息</summary><div className="technical-details-content"><dl><div><dt>数据修订</dt><dd><code>{session.revision.slice(0, 20)}...</code></dd></div><div><dt>渲染配置</dt><dd><code>{session.renderProfile.reference}</code></dd></div><div><dt>配置来源</dt><dd>{context.renderProfileSource}</dd></div><div><dt>当前状态</dt><dd><code>{view}</code></dd></div></dl></div></details></div> : null}
      {tab === "contract" ? <section className="panel code-panel"><h3>卡片需要的数据</h3><pre><code>{JSON.stringify(contract.schema, null, 2)}</code></pre></section> : null}
      {tab === "validation" ? <section className="panel"><div className="validation-summary"><strong>{compiled.issues.length ? "发现需要关注的问题" : "全部检查通过"}</strong><span>已检查 {contract.interactionReports.length} 个状态与示例组合</span></div>{compiled.issues.length ? <div className="issue-list">{compiled.issues.map((issue, index) => <div key={`${issue.code}-${index}`}><code>{issue.code}</code><strong>{issue.message}</strong><span>{issue.path}</span></div>)}</div> : <p className="empty-panel">当前卡片没有发现问题。</p>}<details className="technical-details"><summary>详细检查记录</summary><div className="issue-list">{contract.interactionReports.map((report) => <div key={`${report.view}-${report.sample}`}><code>{report.view}/{report.sample}</code><strong>检查通过</strong><span>{JSON.stringify(report.inspection)}</span></div>)}</div></details></section> : null}
    </div></section></main>;
}
