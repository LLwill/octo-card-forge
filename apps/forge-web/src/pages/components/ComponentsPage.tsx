import { Check, Clipboard, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ComponentCatalogV1, JsonObject, RenderProfileManifestV1 } from "@mlt-org/octo-card-spec";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { RawPreviewFrame } from "../../components/PreviewFrame.js";
import { Badge } from "../../components/ui/badge.js";
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
};

function groupName(id: string, fallback: string) {
  return groupNames[id] ?? fallback;
}

function sectionName(id: string, fallback: string) {
  if (sectionNames[id]) return sectionNames[id];
  if (id.startsWith("utility-")) return `${id.slice("utility-".length)} 样式工具`;
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
  const filtered = sections.filter(({ group: entry, section }) => {
    const text = `${section.id} ${section.title} ${section.description}`.toLocaleLowerCase();
    return (group === "all" || entry.id === group) && (!query.trim() || text.includes(query.trim().toLocaleLowerCase()));
  });

  if (error) return <ErrorState message={error} retry={() => setRevision((value) => value + 1)} />;
  if (!data) return <LoadingState label="正在加载组件规范" />;

  const resources = {
    hostConfig: data.hostConfig,
    stylesheetUrls: [data.stylesheetUrl],
    adaptiveCardsSdkUrl: `https://cdn.jsdelivr.net/npm/adaptivecards@${data.renderProfile.adaptiveCardsSdkVersion}/dist/adaptivecards.min.js`,
  };
  return <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-7 lg:px-10 lg:py-9">
    <div className="mx-auto max-w-6xl">
      <header className="border-b pb-6"><h1 className="text-3xl font-semibold">组件规范</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">查找可复用的基础组件、样式和组合方式。</p></header>
      <div className="grid gap-4 border-b py-4 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)_auto] lg:items-center">
        <label className="flex h-10 items-center gap-2 rounded-md border bg-card px-3 text-muted-foreground focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/10"><Search className="size-4" /><span className="sr-only">搜索组件</span><input className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索组件" /></label>
        <div className="flex min-w-0 gap-1 overflow-x-auto" aria-label="组件分类"><Button type="button" size="sm" variant={group === "all" ? "secondary" : "ghost"} onClick={() => setGroup("all")}>全部</Button>{data.catalog.groups.map((entry) => <Button key={entry.id} type="button" size="sm" variant={group === entry.id ? "secondary" : "ghost"} className="shrink-0" onClick={() => setGroup(entry.id)}>{groupName(entry.id, entry.title)}</Button>)}</div>
        <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">预览宽度</span><div className="inline-flex rounded-md border bg-muted/50 p-1">{[320, 480, 640].map((value) => <Button key={value} type="button" size="sm" variant="ghost" className={cn("h-7 min-w-11 px-2 text-xs", width === value && "bg-background text-primary shadow-xs")} onClick={() => setWidth(value)}>{value}</Button>)}</div></div>
      </div>
      <div>{filtered.map(({ group: entry, section }) => <ComponentSection key={section.id} category={groupName(entry.id, entry.title)} section={section} width={width} resources={resources} />)}{filtered.length === 0 ? <div className="empty-panel"><strong>没有找到匹配的组件</strong><span>可以尝试其他名称或分类。</span></div> : null}</div>
    </div>
  </main>;
}

function ComponentSection({ category, section, width, resources }: {
  category: string;
  section: ComponentCatalogV1["groups"][number]["sections"][number];
  width: number;
  resources: Parameters<typeof RawPreviewFrame>[0]["resources"];
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
  return <article className="border-b py-7"><header className="flex items-start gap-4"><div className="min-w-0 flex-1"><Badge variant="secondary" className="mb-2">{category}</Badge><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{section.description}</p></div>{json ? <Button variant="outline" size="icon" type="button" title="复制 JSON" aria-label="复制 JSON" onClick={() => void copy()}>{copied ? <Check /> : <Clipboard />}</Button> : null}</header>
    {json ? <div className="mx-auto mt-5 max-w-full overflow-hidden rounded-lg border bg-muted/35 shadow-xs transition-[width]" style={{ width: `min(100%, ${width}px)` }}><RawPreviewFrame card={json as JsonObject} resources={resources} title={`${title}预览`} /></div> : null}
    {section.rows ? <div className="matrix-table">{section.rows.map((row) => <div key={row.name}><code>{row.name}</code><strong>{row.value}</strong><span>{row.description}</span></div>)}</div> : null}
    {section.utilityTokens ? <div className="token-list">{section.utilityTokens.map((token) => <div key={token.token}><code>{token.token}</code><span>{token.description}</span><small>{token.appliesTo.join(" · ")}</small></div>)}</div> : null}
    {json ? <details className="technical-details"><summary>查看 JSON</summary><pre><code>{JSON.stringify(json, null, 2)}</code></pre></details> : null}
  </article>;
}
