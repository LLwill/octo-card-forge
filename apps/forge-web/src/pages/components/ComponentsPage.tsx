import { Check, Clipboard, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ComponentCatalogV1, JsonObject, RenderProfileManifestV1 } from "@mlt-org/octo-card-spec";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { RawPreviewFrame } from "../../components/PreviewFrame.js";
import { Button } from "../../components/ui/button.js";
import { loadJson, serverPath } from "../../data/client.js";

interface ComponentResponse {
  reference: string;
  renderProfile: RenderProfileManifestV1;
  hostConfig: unknown;
  stylesheetUrl: string;
  catalog: ComponentCatalogV1;
}

type CatalogSection = ComponentCatalogV1["groups"][number]["sections"][number];

const groupNames: Record<string, string> = {
  foundation: "基础规则",
  "adaptive-card-components": "卡片组件",
  "octo-utility-tokens": "扩展样式",
  "composition-patterns": "组合示例",
};

const groupOrder = ["adaptive-card-components", "octo-utility-tokens", "composition-patterns", "foundation"];

const sectionNames: Record<string, string> = {
  "foundation-typography": "字号与字重",
  "foundation-colors": "语义颜色",
  "foundation-layout": "间距与圆角",
  typography: "文字与语义色",
  containers: "容器语义",
  "semantic-primitives": "显式视觉语义",
  layout: "布局、间距与分隔",
  "media-facts": "图片与事实列表",
  table: "表格",
  "inputs-basic": "基础输入控件",
  "inputs-choice": "选择控件",
  actions: "操作按钮",
  "utility-surface": "容器背景工具",
  "utility-badge": "徽标工具",
  "utility-inset": "内边距工具",
  "utility-line": "线条工具",
  "utility-motion": "动效工具",
  "pattern-skeleton-preview": "骨架屏预览",
  "pattern-status-block": "状态信息块",
};

function groupName(id: string, fallback: string) {
  return groupNames[id] ?? fallback;
}

function sectionName(id: string, fallback: string) {
  return sectionNames[id] ?? fallback;
}

export function ComponentsPage() {
  const [data, setData] = useState<ComponentResponse>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [width, setWidth] = useState(480);

  useEffect(() => {
    let active = true;
    setError(undefined);
    void loadJson<ComponentResponse>(serverPath("/api/v1/components"))
      .then((value) => { if (active) setData(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [revision]);

  const sections = useMemo(() => [...(data?.catalog.groups ?? [])]
    .sort((left, right) => groupOrder.indexOf(left.id) - groupOrder.indexOf(right.id))
    .flatMap((entry) => entry.sections.map((section) => ({ group: entry, section }))), [data]);
  const visible = sections.filter(({ section }) => {
    const text = `${section.id} ${section.title} ${section.description}`.toLocaleLowerCase();
    return !query.trim() || text.includes(query.trim().toLocaleLowerCase());
  });
  const selected = visible.find(({ section }) => section.id === selectedId)
    ?? visible.find(({ section }) => section.card || section.utilityTokens?.some((token) => token.card))
    ?? visible[0]
    ?? sections[0];
  const visibleGroups = groupOrder.map((id) => ({
    id,
    sections: visible.filter(({ group }) => group.id === id),
  })).filter(({ sections: entries }) => entries.length);

  if (error) return <ErrorState message={error} retry={() => setRevision((value) => value + 1)} />;
  if (!data || !selected) return <LoadingState label="正在加载组件规范" />;

  const resources = {
    hostConfig: data.hostConfig,
    stylesheetUrls: [data.stylesheetUrl],
    adaptiveCardsSdkUrl: `https://cdn.jsdelivr.net/npm/adaptivecards@${data.renderProfile.adaptiveCardsSdkVersion}/dist/adaptivecards.min.js`,
  };

  return <main className="spec-page"><div className="spec-layout">
    <aside className="spec-sidebar">
      <div className="spec-sidebar-heading"><span className="spec-kicker">Render Profile</span><h1>组件规范</h1><p>组件、Token 与组合模式</p></div>
      <label className="flex h-10 items-center gap-2 rounded-md border bg-card px-3 text-muted-foreground focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10"><Search className="size-4" /><span className="sr-only">搜索组件</span><input className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索组件" /></label>
      <label className="spec-mobile-select"><span>选择规范项</span><select value={selected.section.id} onChange={(event) => setSelectedId(event.target.value)}>{visibleGroups.map(({ id, sections: entries }) => <optgroup key={id} label={groupName(id, entries[0]?.group.title ?? id)}>{entries.map(({ section }) => <option key={section.id} value={section.id}>{sectionName(section.id, section.title)}</option>)}</optgroup>)}</select></label>
      <nav className="spec-section-list" aria-label="组件目录">{visibleGroups.map(({ id, sections: entries }) => <section key={id}><h2>{groupName(id, entries[0]?.group.title ?? id)}<small>{entries.length}</small></h2>{entries.map(({ section }) => <button type="button" key={section.id} className={selected.section.id === section.id ? "active" : ""} onClick={() => setSelectedId(section.id)}>{sectionName(section.id, section.title)}</button>)}</section>)}</nav>
    </aside>

    <section className="spec-content">
      <header className={`component-detail-header${hasPreview(selected.section) ? "" : " no-preview"}`}>
        <div><span className="component-breadcrumb">组件规范 / {groupName(selected.group.id, selected.group.title)}</span><h1>{sectionName(selected.section.id, selected.section.title)}</h1><p>{selected.section.description}</p><div className="component-meta"><span>组件 ID</span><code>{selected.section.id}</code><span>Render Profile</span><code>{data.reference}</code></div></div>
        {hasPreview(selected.section) ? <div className="width-switch" aria-label="预览宽度">{[320, 480, 640].map((value) => <button key={value} type="button" className={width === value ? "active" : ""} onClick={() => setWidth(value)}>{value}</button>)}</div> : null}
      </header>
      <ComponentDetail section={selected.section} width={width} resources={resources} />
    </section>
  </div></main>;
}

function hasPreview(section: CatalogSection) {
  return Boolean(section.card ?? section.utilityTokens?.find((token) => token.card)?.card);
}

function ComponentDetail({ section, width, resources }: {
  section: CatalogSection;
  width: number;
  resources: Parameters<typeof RawPreviewFrame>[0]["resources"];
}) {
  const [mode, setMode] = useState<"preview" | "json">("preview");
  const [copied, setCopied] = useState(false);
  const json = section.card ?? section.utilityTokens?.find((token) => token.card)?.card;

  useEffect(() => {
    setMode("preview");
    setCopied(false);
  }, [section.id]);

  const copy = async () => {
    if (!json) return;
    await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return <div className="component-detail">
    {json ? <><div className="component-detail-tabs"><button type="button" className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>预览</button><button type="button" className={mode === "json" ? "active" : ""} onClick={() => setMode("json")}>JSON</button><Button variant="ghost" size="icon" type="button" title="复制 JSON" aria-label="复制 JSON" onClick={() => void copy()}>{copied ? <Check /> : <Clipboard />}</Button></div><section className="component-detail-stage">{mode === "preview" ? <div className="component-detail-preview" style={{ width: `min(100%, ${width}px)` }}><RawPreviewFrame card={json as JsonObject} resources={resources} title={`${sectionName(section.id, section.title)}预览`} /></div> : <pre><code>{JSON.stringify(json, null, 2)}</code></pre>}</section></> : null}
    {section.rows?.length ? <section className="component-reference"><h2>属性</h2><div className="matrix-table">{section.rows.map((row) => <div key={row.name}><code>{row.name}</code><strong>{row.value}</strong><span>{row.description}</span></div>)}</div></section> : null}
    {section.utilityTokens?.length ? <section className="component-reference"><h2>Token</h2><div className="token-list">{section.utilityTokens.map((token) => <div key={token.token}><code>{token.token}</code><span>{token.description}</span><small>{token.appliesTo.join(" · ")}</small></div>)}</div></section> : null}
    <section className="component-guidance"><h2>使用建议</h2><p>优先使用规范中的语义组件和 Token，避免在单个 Card 中重复定义视觉规则。</p></section>
  </div>;
}
