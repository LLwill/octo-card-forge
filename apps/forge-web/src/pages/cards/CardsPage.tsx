import { ArrowRight, Check, Clipboard, Download, ExternalLink, LayoutTemplate, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { CardArtifactV1, CatalogSnapshotV1 } from "@mlt-org/octo-card-catalog-snapshot";
import { useRuntime } from "../../app/runtime.js";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { PreviewFrame } from "../../components/PreviewFrame.js";
import { Button } from "../../components/ui/button.js";
import { bootstrap, loadJson, serverPath } from "../../data/client.js";
import { deriveProfileResourceUrls, loadCardArtifact, loadCatalogSnapshot } from "../../data.js";
import { WorkspaceCardsPage } from "./WorkspaceCardsPage.js";

type CatalogCard = CatalogSnapshotV1["cards"][number];
type CatalogVersion = CatalogCard["versions"][number];
type DetailTab = "preview" | "contract" | "handoff";

const tabLabels: Record<DetailTab, string> = {
  preview: "预览",
  contract: "所需数据",
  handoff: "交付内容",
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
  return value === "preview" || value === "contract" || value === "handoff";
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
  const tab: DetailTab = isTab(tabValue) && (tabValue !== "handoff" || version.handoff) ? tabValue : "preview";
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
    <header className="detail-header"><div><div className="identity-line"><h1>{card.name}</h1><code>{card.id}</code></div><p>{describeCard(card)}</p><div className="detail-meta"><span className="status-draft">已发布</span><span>v{version.version}</span><span>{Object.keys(artifact.views).length} 个视图</span></div></div><div className="detail-actions">{card.versions.length > 1 ? <label>版本<select value={version.reference} onChange={(event) => setQuery("version", event.target.value)}>{card.versions.map((candidate) => <option key={candidate.reference} value={candidate.reference}>{candidate.version}</option>)}</select></label> : null}{version.handoff ? <a className="button primary" href={serverPath(`/api/v1/cards/${encodeURIComponent(version.reference)}/handoff`)}><Download size={14} />下载 Server 交付包</a> : null}{version.release ? <SafeExternalLink href={version.release.url}>发行说明</SafeExternalLink> : null}</div></header>
    <div className="detail-tabs" role="tablist">{Object.entries(tabLabels).filter(([key]) => key !== "handoff" || version.handoff).map(([key, label]) => <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setQuery("tab", key)}>{label}</button>)}</div>
    {tab === "preview" ? <PreviewPanel artifact={artifact} version={version} viewName={viewName} sample={sample} setQuery={setQuery} /> : null}
    {tab === "contract" ? <DataContractPanel contract={artifact.dataContract} /> : null}
    {tab === "handoff" && version.handoff ? <HandoffPanel version={version} /> : null}
  </>;
}

interface HandoffContents {
  reference: string;
  fileName: string;
  sha256: string;
  bytes: number;
  files: Array<{ path: string; group: string; previewable: boolean }>;
}

const handoffGroupLabels: Record<string, string> = {
  root: "接入说明与清单",
  contract: "数据契约",
  templates: "卡片模板",
  samples: "样例数据",
  goldens: "编译结果",
  reports: "交互报告",
  "render-profile": "渲染规范",
};

const handoffGroupOrder = [
  "root",
  "contract",
  "templates",
  "samples",
  "goldens",
  "reports",
  "render-profile",
];

function HandoffPanel({ version }: { version: CatalogVersion }) {
  const [contents, setContents] = useState<HandoffContents>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [fileContent, setFileContent] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const endpoint = serverPath(`/api/v1/cards/${encodeURIComponent(version.reference)}/handoff`);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(undefined);
    setContents(undefined);
    setSelectedPath(undefined);
    void loadJson<HandoffContents>(`${endpoint}/contents`)
      .then((value) => {
        if (!active) return;
        setContents(value);
        setSelectedPath(value.files.find((file) => file.path === "README.md")?.path ?? value.files.find((file) => file.previewable)?.path);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  useEffect(() => {
    if (!selectedPath) return;
    let active = true;
    setCopied(false);
    setFileContent(undefined);
    setError(undefined);
    void fetch(`${endpoint}/file?path=${encodeURIComponent(selectedPath)}`, { headers: { accept: "text/plain" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status} ${response.statusText || "Unknown"})`);
        return response.text();
      })
      .then((value) => { if (active) setFileContent(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [endpoint, selectedPath]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyFile = async () => {
    if (fileContent === undefined) return;
    await navigator.clipboard.writeText(fileContent);
    setCopied(true);
  };

  const groups = useMemo(() => {
    const grouped = new Map<string, HandoffContents["files"]>();
    for (const file of contents?.files ?? []) {
      const files = grouped.get(file.group) ?? [];
      files.push(file);
      grouped.set(file.group, files);
    }
    return [...grouped.entries()].sort(([left], [right]) => {
      const leftIndex = handoffGroupOrder.indexOf(left);
      const rightIndex = handoffGroupOrder.indexOf(right);
      if (leftIndex === -1 || rightIndex === -1) {
        if (leftIndex === rightIndex) return left.localeCompare(right);
        return leftIndex === -1 ? 1 : -1;
      }
      return leftIndex - rightIndex;
    });
  }, [contents]);

  if (loading) return <LoadingState label="正在读取交付内容" />;
  if (error && !contents) return <ErrorState message={error} />;
  if (!contents) return null;

  return <section className="handoff-panel">
    <header className="handoff-summary"><div><h3>Server 交付包</h3><p>这里展示 ZIP 中的实际文件。接入前可核对数据契约、模板、样例、编译结果与渲染规范。</p></div><dl><Fact label="文件" value={`${contents.files.length} 个`} /><Fact label="大小" value={`${Math.ceil(contents.bytes / 1024)} KiB`} /><Fact label="SHA-256" value={`${contents.sha256.slice(0, 10)}...${contents.sha256.slice(-8)}`} mono /></dl></header>
    <div className="handoff-browser">
      <nav className="handoff-file-list" aria-label="交付包文件">{groups.map(([group, files]) => <section key={group}><h4>{handoffGroupLabels[group] ?? group}</h4>{files.map((file) => <button type="button" key={file.path} className={selectedPath === file.path ? "active" : ""} disabled={!file.previewable} onClick={() => setSelectedPath(file.path)}><code>{file.path.includes("/") ? file.path.slice(file.path.indexOf("/") + 1) : file.path}</code>{!file.previewable ? <span>不可预览</span> : null}</button>)}</section>)}</nav>
      <div className="handoff-file-preview"><header><span>文件内容</span><div><code>{selectedPath}</code><Button className="handoff-copy" type="button" variant="ghost" size="icon-sm" disabled={fileContent === undefined} title={copied ? "已复制" : "复制文件内容"} aria-label={copied ? "文件内容已复制" : "复制文件内容"} onClick={() => void copyFile()}>{copied ? <Check /> : <Clipboard />}</Button></div></header>{error ? <ErrorState message={error} /> : fileContent === undefined ? <LoadingState label="正在读取文件" /> : <pre><code>{fileContent}</code></pre>}</div>
    </div>
  </section>;
}

function PreviewPanel({ artifact, version, viewName, sample, setQuery }: { artifact: CardArtifactV1; version: CatalogVersion; viewName: string; sample: CardArtifactV1["views"][string]["samples"][number]; setQuery(key: string, value: string): void }) {
  const view = artifact.views[viewName];
  const resources = deriveProfileResourceUrls(artifact);
  const [width, setWidth] = useState(480);
  return <div className="preview-stack"><div className="preview-toolbar"><label>视图<select value={viewName} onChange={(event) => setQuery("view", event.target.value)}>{Object.keys(artifact.views).map((name) => <option key={name}>{name}</option>)}</select></label><label>样例<select value={sample.name} onChange={(event) => setQuery("sample", event.target.value)}>{view.samples.map((candidate) => <option key={candidate.name}>{candidate.name}</option>)}</select></label><div className="width-switch" aria-label="预览宽度">{[320, 480, 640].map((value) => <button key={value} type="button" className={width === value ? "active" : ""} onClick={() => setWidth(value)}>{value}</button>)}</div></div><section className="preview-surface"><div className="detail-preview-frame" style={{ width: `min(100%, ${width}px)` }}><PreviewFrame artifact={artifact} sample={sample} title={`${artifact.card.name} ${viewName} 预览`} /></div></section><div className="detail-ledger"><Fact label="数据契约" value={`${Object.keys(artifact.dataContract.properties ?? {}).length} 个字段`} /><Fact label="交互动作" value={`${sample.inspection.actions.length} 个`} /><Fact label="渲染规范" value={artifact.profile.reference} mono /><Fact label="源文件" value={version.source.path} mono /></div><details className="technical-details"><summary>更多技术信息</summary><div className="technical-details-content"><dl><Fact label="产物摘要" value={`${version.artifact.sha256.slice(0, 10)}...${version.artifact.sha256.slice(-8)}`} mono /><Fact label="渲染 SDK" value={artifact.profile.manifest.adaptiveCardsSdkVersion} /><Fact label="数据协议" value={view.wireProfile} mono /><Fact label="来源提交" value={version.source.commit.slice(0, 12)} mono /></dl><div className="resource-links"><SafeExternalLink href={resources.hostConfig}>主机配置</SafeExternalLink><SafeExternalLink href={resources.stylesheet}>样式文件</SafeExternalLink></div></div></details></div>;
}

interface DataFieldRow {
  path: string;
  type: string;
  requirement: string;
  description: string;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValues(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function conditionLabel(schema: Record<string, unknown>): string | undefined {
  const properties = recordValue(recordValue(schema.if)?.properties);
  if (!properties) return undefined;
  for (const [field, value] of Object.entries(properties)) {
    const rule = recordValue(value);
    if (!rule) continue;
    if (rule.const !== undefined) return `${field}=${String(rule.const)}`;
    const values = Array.isArray(rule.enum) ? rule.enum.map(String) : [];
    if (values.length) return `${field}=${values.join("/")}`;
  }
  return undefined;
}

function conditionalRequirements(schema: Record<string, unknown>): Map<string, string> {
  const requirements = new Map<string, string>();
  const rules = Array.isArray(schema.allOf) ? schema.allOf : [];
  for (const value of rules) {
    const rule = recordValue(value);
    if (!rule) continue;
    const label = conditionLabel(rule);
    const thenSchema = recordValue(rule.then);
    if (!label || !thenSchema) continue;
    for (const field of stringValues(thenSchema.required)) requirements.set(field, label);
    const properties = recordValue(thenSchema.properties);
    if (!properties) continue;
    for (const [parent, propertyValue] of Object.entries(properties)) {
      const property = recordValue(propertyValue);
      for (const field of stringValues(property?.required)) requirements.set(`${parent}.${field}`, label);
    }
  }
  return requirements;
}

function fieldType(schema: Record<string, unknown>): string {
  const type = typeof schema.type === "string" ? schema.type : "unknown";
  if (type !== "array") return type;
  const itemType = recordValue(schema.items)?.type;
  return `${typeof itemType === "string" ? itemType : "unknown"}[]`;
}

function fieldDescription(schema: Record<string, unknown>): string {
  if (typeof schema.description === "string" && schema.description.trim()) return schema.description;
  const details: string[] = [];
  if (Array.isArray(schema.enum)) details.push(`可选值：${schema.enum.map(String).join("、")}`);
  if (schema.format === "uri") details.push("URL 地址");
  if (schema.minLength === 1) details.push("不可为空");
  if (typeof schema.minItems === "number") details.push(`至少 ${schema.minItems} 项`);
  const properties = recordValue(schema.properties) ?? recordValue(recordValue(schema.items)?.properties);
  if (properties) details.push(`包含 ${Object.keys(properties).length} 个子字段`);
  return details.join("；") || "—";
}

function dataContractRows(contract: Record<string, unknown>): DataFieldRow[] {
  const conditions = conditionalRequirements(contract);
  const rows: DataFieldRow[] = [];

  const visit = (
    properties: Record<string, unknown>,
    requiredFields: Set<string>,
    prefix = "",
    parentCondition?: string,
    parentOptional = false,
  ) => {
    for (const [name, value] of Object.entries(properties)) {
      const schema = recordValue(value);
      if (!schema) continue;
      const path = prefix ? `${prefix}.${name}` : name;
      const directCondition = conditions.get(path);
      const required = requiredFields.has(name);
      const requirement = directCondition
        ? `${directCondition} 时必填`
        : required && parentCondition
          ? `${parentCondition} 时必填`
          : required && parentOptional
            ? `随 ${prefix} 提供`
            : required
              ? "必填"
              : "选填";
      rows.push({ path, type: fieldType(schema), requirement, description: fieldDescription(schema) });

      const nestedProperties = recordValue(schema.properties) ?? recordValue(recordValue(schema.items)?.properties);
      if (!nestedProperties) continue;
      const nestedRequired = new Set(stringValues(schema.required ?? recordValue(schema.items)?.required));
      visit(
        nestedProperties,
        nestedRequired,
        schema.type === "array" ? `${path}[]` : path,
        directCondition ?? parentCondition,
        !required && !directCondition || parentOptional,
      );
    }
  };

  visit(recordValue(contract.properties) ?? {}, new Set(stringValues(contract.required)));
  return rows;
}

function DataContractPanel({ contract }: { contract: Record<string, unknown> }) {
  const rows = useMemo(() => dataContractRows(contract), [contract]);
  return <section className="contract-panel">
    <header><div><h3>卡片所需数据</h3><p>业务系统需要提供的 JSON 字段，以及对应的类型和必填条件。</p></div><span>{rows.length} 个字段</span></header>
    <div className="contract-table" role="table" aria-label="卡片所需数据">
      <div className="contract-table-head" role="row"><span>字段</span><span>类型</span><span>要求</span><span>说明</span></div>
      {rows.map((row) => <div className="contract-table-row" role="row" key={row.path}>
        <code>{row.path}</code><span>{row.type}</span><strong className={row.requirement === "选填" ? "optional" : "required"}>{row.requirement}</strong><span>{row.description}</span>
      </div>)}
    </div>
  </section>;
}

function Fact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div><dt>{label}</dt><dd>{mono ? <code>{value}</code> : value}</dd></div>; }
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
