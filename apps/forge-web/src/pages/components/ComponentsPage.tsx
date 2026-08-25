import { Check, Clipboard, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ComponentCatalogV1, JsonObject, RenderProfileManifestV1 } from "@mlt-org/octo-card-spec";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { RawPreviewFrame } from "../../components/PreviewFrame.js";
import { Button } from "../../components/ui/button.js";
import { loadJson, serverPath } from "../../data/client.js";
import { cn } from "../../lib/utils.js";

interface ComponentResponse {
  reference: string;
  renderProfile: RenderProfileManifestV1;
  hostConfig: unknown;
  stylesheetUrl: string;
  catalog: ComponentCatalogV1;
}

const groupNames: Record<string, string> = {
  foundation: "基础规范",
  "adaptive-card-components": "基础组件",
  "octo-utility-tokens": "样式工具",
  "composition-patterns": "组合模式",
};

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
  if (sectionNames[id]) return sectionNames[id];
  return fallback;
}

export function ComponentsPage() {
  const [data, setData] = useState<ComponentResponse>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [width, setWidth] = useState(480);

  useEffect(() => {
    let active = true;
    setError(undefined);
    void loadJson<ComponentResponse>(serverPath("/api/v1/components"))
      .then((value) => { if (active) setData(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [revision]);

  const sections = useMemo(() => (data?.catalog.groups ?? []).flatMap((entry) =>
    entry.sections.map((section) => ({ group: entry, section }))), [data]);
  const matches = ({ group: entry, section }: (typeof sections)[number]) => {
    const text = `${section.id} ${section.title} ${section.description}`.toLocaleLowerCase();
    return (group === "all" || entry.id === group) && (!query.trim() || text.includes(query.trim().toLocaleLowerCase()));
  };
  const filtered = sections.filter(matches);
  const filteredGroups = (data?.catalog.groups ?? []).map((entry) => ({
    ...entry,
    sections: entry.sections.filter((section) => matches({ group: entry, section })),
  })).filter((entry) => entry.sections.length > 0);

  if (error) return <ErrorState message={error} retry={() => setRevision((value) => value + 1)} />;
  if (!data) return <LoadingState label="正在加载组件规范" />;

  const resources = {
    hostConfig: data.hostConfig,
    stylesheetUrls: [data.stylesheetUrl],
    adaptiveCardsSdkUrl: `https://cdn.jsdelivr.net/npm/adaptivecards@${data.renderProfile.adaptiveCardsSdkVersion}/dist/adaptivecards.min.js`,
  };
  return <main className="spec-page">
    <div className="spec-layout">
      <aside className="spec-sidebar">
        <div className="spec-sidebar-heading"><span className="showcase-kicker">系统</span><h1>设计规范</h1><p>组件、样式与组合方式</p></div>
        <label className="flex h-10 items-center gap-2 rounded-md border bg-card px-3 text-muted-foreground focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10"><Search className="size-4" /><span className="sr-only">搜索组件</span><input className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索组件" /></label>
        <nav className="spec-sidebar-nav" aria-label="组件分类"><button type="button" className={group === "all" ? "active" : ""} onClick={() => setGroup("all")}><span>全部</span><small>{sections.length}</small></button>{data.catalog.groups.map((entry) => <button key={entry.id} type="button" className={group === entry.id ? "active" : ""} onClick={() => setGroup(entry.id)}><span>{groupName(entry.id, entry.title)}</span><small>{entry.sections.length}</small></button>)}</nav>
        <div className="spec-width"><span>预览宽度</span><div>{[320, 480, 640].map((value) => <Button key={value} type="button" size="sm" variant="ghost" className={cn(width === value && "active")} onClick={() => setWidth(value)}>{value}</Button>)}</div></div>
      </aside>
      <div className="spec-content">
        <header className="spec-hero">
          <span className="showcase-kicker">组件规范</span>
          <h2>设计一次，稳定复用。</h2>
          <p>这里收录卡片的基础样式、可用组件与组合方式。每一项都配有可运行示例和对应 JSON。</p>
          <dl className="spec-summary"><div><dt>{data.catalog.groups.length}</dt><dd>分类</dd></div><div><dt>{sections.length}</dt><dd>规范与示例</dd></div><div><dt>{width}px</dt><dd>当前预览宽度</dd></div></dl>
        </header>
        <div className="spec-groups">{filteredGroups.map((entry, groupIndex) => <section className="spec-group" key={entry.id}><header className="spec-group-heading"><span>0{groupIndex + 1}</span><div><p>{groupName(entry.id, entry.title)}</p><strong>{entry.sections.length} 项</strong></div></header><div className={cn("spec-grid", entry.id === "foundation" && "spec-grid-foundation")}>{entry.sections.map((section) => <ComponentSection key={section.id} category={groupName(entry.id, entry.title)} section={section} width={width} resources={resources} compact={entry.id === "foundation"} />)}</div></section>)}{filtered.length === 0 ? <div className="empty-panel"><strong>没有找到匹配的组件</strong><span>可以尝试其他名称或分类。</span></div> : null}</div>
      </div>
    </div>
  </main>;
}

function ComponentSection({ category, section, width, resources, compact }: {
  category: string;
  section: ComponentCatalogV1["groups"][number]["sections"][number];
  width: number;
  resources: Parameters<typeof RawPreviewFrame>[0]["resources"];
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const json = section.card ?? section.utilityTokens?.[0]?.card;
  const copy = async () => {
    if (!json) return;
    await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  const title = sectionName(section.id, section.title);
  return <article className={cn("component-section", compact && "component-section-compact")}><header><div className="min-w-0 flex-1"><span className="component-category">{category}</span><h2>{title}</h2><p>{section.description}</p></div>{json ? <Button variant="outline" size="icon" type="button" title="复制 JSON" aria-label="复制 JSON" onClick={() => void copy()}>{copied ? <Check /> : <Clipboard />}</Button> : null}</header>
    {json ? <div className="component-preview" style={{ width: `min(100%, ${width}px)` }}><RawPreviewFrame card={json as JsonObject} resources={resources} title={`${title}预览`} /></div> : null}
    {section.rows ? <div className="matrix-table">{section.rows.map((row) => <div key={row.name}><code>{row.name}</code><strong>{row.value}</strong><span>{row.description}</span></div>)}</div> : null}
    {section.utilityTokens ? <div className="token-list">{section.utilityTokens.map((token) => <div key={token.token}><code>{token.token}</code><span>{token.description}</span><small>{token.appliesTo.join(" · ")}</small></div>)}</div> : null}
    {json ? <details className="technical-details"><summary>查看 JSON</summary><pre><code>{JSON.stringify(json, null, 2)}</code></pre></details> : null}
  </article>;
}
