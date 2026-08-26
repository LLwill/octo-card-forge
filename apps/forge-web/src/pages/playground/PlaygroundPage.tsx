import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  Code2,
  Copy,
  Play,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PreviewRenderResponse, PreviewSession } from "@mlt-org/octo-card-preview-kit";
import type { JsonObject, RenderProfileManifestV1 } from "@mlt-org/octo-card-spec";
import { useRuntime } from "../../app/runtime.js";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { RawPreviewFrame } from "../../components/PreviewFrame.js";
import { Button } from "../../components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.js";
import { Separator } from "../../components/ui/separator.js";
import { Textarea } from "../../components/ui/textarea.js";
import { loadJson, serverPath } from "../../data/client.js";
import { cn } from "../../lib/utils.js";

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
    { type: "TextBlock", text: "卡片预览", weight: "Bolder", size: "Medium" },
    { type: "TextBlock", text: "修改左侧 JSON，然后查看实时效果。", wrap: true },
  ],
  actions: [{ type: "Action.Submit", title: "确认", data: { action: "preview" } }],
};

const previewWidths = [320, 480, 640] as const;

export function PlaygroundPage() {
  const { runtime, loading: runtimeLoading, error: runtimeError } = useRuntime();
  const [mode, setMode] = useState<Mode>("card-json");
  const [profile, setProfile] = useState<ComponentResponse>();
  const [session, setSession] = useState<PreviewSession>();
  const [input, setInput] = useState(JSON.stringify(starterCard, null, 2));
  const [preview, setPreview] = useState<JsonObject>(starterCard);
  const [compiled, setCompiled] = useState<PreviewRenderResponse>();
  const [error, setError] = useState<string>();
  const [width, setWidth] = useState<(typeof previewWidths)[number]>(480);
  const [view, setView] = useState<string>();

  useEffect(() => {
    let active = true;
    void loadJson<ComponentResponse>(serverPath("/api/v1/components"))
      .then((value) => { if (active) setProfile(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!runtime?.capabilities.templateDataPreview || mode !== "template-data") return;
    let active = true;
    void loadJson<PreviewSession>(serverPath("/api/v1/preview/session"))
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

  if (runtimeLoading || !profile) return <LoadingState label="正在准备预览工具" />;
  if (runtimeError) return <ErrorState message={runtimeError} />;

  const activateMode = (nextMode: Mode) => {
    if (nextMode === "template-data" && !runtime?.capabilities.templateDataPreview) return;
    setMode(nextMode);
    setCompiled(undefined);
    setError(undefined);
    if (nextMode === "card-json") {
      setInput(JSON.stringify(starterCard, null, 2));
      setPreview(starterCard);
    }
  };

  const render = async () => {
    setError(undefined);
    let data: JsonObject;
    try {
      const parsed = JSON.parse(input) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON 顶层必须是对象");
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
      const result = await loadJson<PreviewRenderResponse>(serverPath("/api/v1/preview/compile"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: session.card.reference, revision: session.revision, view, data }),
      });
      setCompiled(result);
      if (result.valid) setPreview(result.payload as JsonObject);
      else setError(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const format = () => {
    try {
      setInput(JSON.stringify(JSON.parse(input), null, 2));
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <main className="playground-page">
      <div className="playground-shell">
        <header className="playground-header">
          <div className="max-w-2xl">
            <h1>预览调试</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              输入标准 Adaptive Card JSON，或为现有模板提供 ViewModel 数据。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">预览宽度</span>
            <div className="inline-flex rounded-lg border bg-muted/60 p-1" aria-label="预览宽度">
              {previewWidths.map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={width === value ? "outline" : "ghost"}
                  aria-pressed={width === value}
                  className={cn("h-9 min-w-12", width === value && "bg-background text-primary shadow-sm")}
                  onClick={() => setWidth(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
        </header>

        {runtime?.capabilities.templateDataPreview ? <section className="playground-mode" aria-label="预览模式">
          <div className="inline-flex w-fit rounded-lg border bg-muted/60 p-1">
            <Button
              type="button"
              variant={mode === "card-json" ? "outline" : "ghost"}
              aria-pressed={mode === "card-json"}
              className={cn("h-9", mode === "card-json" && "bg-background text-primary shadow-sm")}
              onClick={() => activateMode("card-json")}
            >
              <Braces data-icon="inline-start" />
              卡片 JSON
            </Button>
            <Button
              type="button"
              variant={mode === "template-data" ? "outline" : "ghost"}
              aria-pressed={mode === "template-data"}
              className={cn("h-9", mode === "template-data" && "bg-background text-primary shadow-sm")}
              onClick={() => activateMode("template-data")}
            >
              模板数据
            </Button>
          </div>
        </section> : <div className="py-2" />}

        <div className="playground-workbench">
          <section className="workbench-pane" aria-label="JSON 编辑器">
            <div className="flex min-h-14 flex-wrap items-center gap-2 border-b px-4 py-2">
              <div className="mr-auto">
                <strong className="block text-sm font-semibold">
                  {mode === "card-json" ? "卡片 JSON" : "模板数据"}
                </strong>
                <span className="text-xs text-muted-foreground">
                  {mode === "card-json" ? "修改后点击预览查看结果" : "选择卡片状态并填写对应数据"}
                </span>
              </div>

              {mode === "template-data" && session ? (
                <Select value={view ?? null} onValueChange={(value) => setView(value ?? undefined)}>
                  <SelectTrigger className="h-9 min-w-36 bg-background" aria-label="卡片状态">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {session.views.map((item) => <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : null}

              <Button type="button" variant="ghost" className="h-9" onClick={format}>
                <Code2 data-icon="inline-start" />
                格式化
              </Button>
              <Button type="button" variant="ghost" className="h-9" onClick={() => void navigator.clipboard.writeText(input)}>
                <Copy data-icon="inline-start" />
                复制
              </Button>
              <Button type="button" className="h-9 px-4" onClick={() => void render()}>
                <Play data-icon="inline-start" />
                预览
              </Button>
            </div>

            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              spellCheck={false}
              aria-label={mode === "card-json" ? "卡片 JSON" : "模板数据 JSON"}
              className="field-sizing-fixed h-[calc(100vh-350px)] min-h-[520px] resize-y rounded-none border-0 bg-[#121719] px-5 py-4 font-mono text-[13px] leading-6 text-slate-100 shadow-none focus-visible:border-transparent focus-visible:ring-0"
            />

            <div
              className={cn(
                "flex min-h-11 items-start gap-2 border-t px-4 py-3 text-xs",
                error ? "border-destructive/25 bg-destructive/8 text-destructive" : "border-primary/20 bg-primary/8 text-primary",
              )}
              aria-live="polite"
            >
              {error ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
              {error ? <pre className="m-0 whitespace-pre-wrap font-sans">{error}</pre> : <span>预览已更新</span>}
            </div>
          </section>

          <section className="workbench-pane workbench-preview" aria-label="卡片预览">
            <div className="flex min-h-14 items-center gap-3 border-b px-4 py-2">
              <div className="mr-auto">
                <strong className="block text-sm font-semibold">预览</strong>
                <span className="text-xs text-muted-foreground">当前宽度 {width}px</span>
              </div>
            </div>
            <div className="playground-stage">
              <div
                className="playground-canvas"
                style={{ width: `min(100%, ${width}px)` }}
              >
                {resources ? <RawPreviewFrame card={preview} resources={resources} title="卡片预览" /> : null}
              </div>
            </div>
          </section>
        </div>

        {compiled ? (
          <details className="mt-5 overflow-hidden rounded-lg border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">查看生成的卡片 JSON</summary>
            <Separator />
            <pre className="m-0 max-h-[420px] overflow-auto bg-[#121719] p-5 text-xs leading-6 text-slate-100">
              <code>{JSON.stringify(compiled.payload, null, 2)}</code>
            </pre>
          </details>
        ) : null}
      </div>
    </main>
  );
}
