import { AlertTriangle, Braces, Play, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PreviewClient, type PreviewRenderResponse, type PreviewSession } from "@mlt-org/octo-card-preview-kit";
import type { JsonObject, RenderProfileManifestV1 } from "@mlt-org/octo-card-spec";
import { useRuntime } from "../../app/runtime.js";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { RawPreviewFrame } from "../../components/PreviewFrame.js";
import { loadJson, serverPath } from "../../data/client.js";

type Mode = "card-json" | "template-data";

interface ComponentResponse {
  reference: string;
  renderProfile: RenderProfileManifestV1;
  hostConfig: JsonObject;
  stylesheetUrl: string;
}

const starterCard: JsonObject = {
  type: "AdaptiveCard",
  version: "1.5",
  body: [
    { type: "TextBlock", text: "Card JSON playground", weight: "Bolder", size: "Medium" },
    { type: "TextBlock", text: "Edit this JSON and render it with the active Render Profile.", wrap: true },
  ],
  actions: [{ type: "Action.Submit", title: "Preview action", data: { action: "preview" } }],
};

export function PlaygroundPage() {
  const { runtime, loading: runtimeLoading, error: runtimeError } = useRuntime();
  const [mode, setMode] = useState<Mode>("card-json");
  const [profile, setProfile] = useState<ComponentResponse>();
  const [session, setSession] = useState<PreviewSession>();
  const [input, setInput] = useState(JSON.stringify(starterCard, null, 2));
  const [preview, setPreview] = useState<JsonObject>(starterCard);
  const [compiled, setCompiled] = useState<PreviewRenderResponse>();
  const [error, setError] = useState<string>();
  const [width, setWidth] = useState(480);
  const [view, setView] = useState<string>();

  useEffect(() => {
    let active = true;
    void loadJson<ComponentResponse>(serverPath("/api/component-baseline"))
      .then((value) => { if (active) setProfile(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!runtime?.capabilities.templateDataPreview || mode !== "template-data") return;
    let active = true;
    const client = new PreviewClient({ baseUrl: window.__OCTO_BASE_PATH__ ?? "" });
    void client.getSession()
      .then((value) => {
        if (!active) return;
        setSession(value);
        setView(value.views[0]?.name);
        setInput("{}");
        setError(undefined);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [runtime, mode]);

  const resources = useMemo(() => profile ? {
    hostConfig: profile.hostConfig,
    stylesheetUrls: [profile.stylesheetUrl],
    adaptiveCardsSdkUrl: `https://cdn.jsdelivr.net/npm/adaptivecards@${profile.renderProfile.adaptiveCardsSdkVersion}/dist/adaptivecards.min.js`,
  } : undefined, [profile]);

  if (runtimeLoading || !profile) return <LoadingState label="Preparing playground" />;
  if (runtimeError) return <ErrorState message={runtimeError} />;

  const render = async () => {
    setError(undefined);
    let data: JsonObject;
    try {
      const parsed = JSON.parse(input) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON root must be an object");
      data = parsed as JsonObject;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return;
    }
    if (mode === "card-json") {
      setPreview(data);
      setCompiled(undefined);
      return;
    }
    if (!session || !view) return;
    try {
      const result = await new PreviewClient({ baseUrl: window.__OCTO_BASE_PATH__ ?? "" }).render({
        cardId: session.card.reference,
        revision: session.revision,
        view,
        data,
      });
      setCompiled(result);
      if (result.valid) setPreview(result.payload as JsonObject);
      else setError(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const format = () => {
    try { setInput(JSON.stringify(JSON.parse(input), null, 2)); setError(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };

  return <main className="page playground-page">
    <header className="page-header split-header"><div><span className="eyebrow">Safe sandbox</span><h1>Playground</h1><p>标准 Card JSON 在浏览器渲染；Template Data 由 Workspace compiler 编译。</p></div><div className="width-control">{[320, 480, 640].map((value) => <button key={value} type="button" className={width === value ? "active" : ""} onClick={() => setWidth(value)}>{value}</button>)}</div></header>
    <div className="mode-switch"><button type="button" className={mode === "card-json" ? "active" : ""} onClick={() => { setMode("card-json"); setInput(JSON.stringify(starterCard, null, 2)); setPreview(starterCard); setError(undefined); }}><Braces size={16} />Card JSON</button><button type="button" disabled={!runtime?.capabilities.templateDataPreview} className={mode === "template-data" ? "active" : ""} onClick={() => setMode("template-data")}><WandSparkles size={16} />Template Data</button></div>
    <div className="playground-grid"><section className="editor-pane"><div className="pane-toolbar"><strong>{mode === "card-json" ? "Adaptive Card JSON" : "ViewModel JSON"}</strong>{mode === "template-data" && session ? <select value={view} onChange={(event) => setView(event.target.value)}>{session.views.map((item) => <option key={item.name}>{item.name}</option>)}</select> : null}<button type="button" onClick={format}>Format</button><button className="button primary" type="button" onClick={() => void render()}><Play size={15} />Render</button></div><textarea value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} aria-label={mode === "card-json" ? "Adaptive Card JSON" : "ViewModel JSON"} />{error ? <div className="diagnostic"><AlertTriangle size={16} /><pre>{error}</pre></div> : <div className="diagnostic ok">Last render succeeded</div>}</section>
      <section className="playground-preview"><div className="pane-toolbar"><strong>Preview</strong><span>{profile.reference}</span></div><div className="preview-width" style={{ width: `min(100%, ${width}px)` }}>{resources ? <RawPreviewFrame card={preview} resources={resources} title="Playground preview" /> : null}</div></section>
    </div>
    {compiled ? <details className="compiled-output"><summary>Compiled Adaptive Card JSON</summary><pre><code>{JSON.stringify(compiled.payload, null, 2)}</code></pre></details> : null}
  </main>;
}
