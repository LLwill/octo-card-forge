import { Check, Clipboard, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ComponentCatalogV1, JsonObject, RenderProfileManifestV1 } from "@mlt-org/octo-card-spec";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { RawPreviewFrame } from "../../components/PreviewFrame.js";
import { loadJson, serverPath } from "../../data/client.js";

interface ComponentResponse {
  reference: string;
  renderProfile: RenderProfileManifestV1;
  hostConfig: unknown;
  stylesheetUrl: string;
  catalog: ComponentCatalogV1;
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
  if (!data) return <LoadingState label="Loading component catalog" />;

  const resources = {
    hostConfig: data.hostConfig,
    stylesheetUrls: [data.stylesheetUrl],
    adaptiveCardsSdkUrl: `https://cdn.jsdelivr.net/npm/adaptivecards@${data.renderProfile.adaptiveCardsSdkVersion}/dist/adaptivecards.min.js`,
  };
  return <main className="page components-page">
    <header className="page-header split-header"><div><span className="eyebrow">{data.reference}</span><h1>Components</h1><p>Render Profile 提供的组件 specimen、样式基线和 utility token。</p></div><div className="width-control" aria-label="Preview width">{[320, 480, 640].map((value) => <button key={value} type="button" className={width === value ? "active" : ""} onClick={() => setWidth(value)}>{value}</button>)}</div></header>
    <div className="component-tools"><label className="search-box"><Search size={16} /><span className="sr-only">Search components</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search components" /></label><div className="filter-tabs"><button type="button" className={group === "all" ? "active" : ""} onClick={() => setGroup("all")}>All</button>{data.catalog.groups.map((entry) => <button key={entry.id} type="button" className={group === entry.id ? "active" : ""} onClick={() => setGroup(entry.id)}>{entry.title}</button>)}</div></div>
    <div className="component-list">{filtered.map(({ group: entry, section }, index) => <ComponentSection key={section.id} index={index + 1} category={entry.title} section={section} width={width} resources={resources} />)}{filtered.length === 0 ? <div className="empty-panel"><strong>No matching components</strong><span>Try another search or category.</span></div> : null}</div>
  </main>;
}

function ComponentSection({ index, category, section, width, resources }: {
  index: number;
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
  return <article className="component-section"><header><div className="component-index">{String(index).padStart(2, "0")}</div><div><span>{category}</span><h2>{section.title}</h2><p>{section.description}</p></div>{json ? <button className="icon-button" type="button" title="Copy JSON" onClick={() => void copy()}>{copied ? <Check size={17} /> : <Clipboard size={17} />}</button> : null}</header>
    {json ? <div className="component-preview" style={{ maxWidth: width }}><RawPreviewFrame card={json as JsonObject} resources={resources} title={`${section.title} preview`} /></div> : null}
    {section.rows ? <div className="matrix-table">{section.rows.map((row) => <div key={row.name}><code>{row.name}</code><strong>{row.value}</strong><span>{row.description}</span></div>)}</div> : null}
    {section.utilityTokens ? <div className="token-list">{section.utilityTokens.map((token) => <div key={token.token}><code>{token.token}</code><span>{token.description}</span><small>{token.appliesTo.join(" · ")}</small></div>)}</div> : null}
    {json ? <details><summary>View JSON</summary><pre><code>{JSON.stringify(json, null, 2)}</code></pre></details> : null}
  </article>;
}
