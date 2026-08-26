import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Copy,
  Play,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { JsonObject, RenderProfileManifestV1 } from "@mlt-org/octo-card-spec";
import { useRuntime } from "../../app/runtime.js";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { RawPreviewFrame } from "../../components/PreviewFrame.js";
import { Button } from "../../components/ui/button.js";
import { Textarea } from "../../components/ui/textarea.js";
import { loadJson, serverPath } from "../../data/client.js";
import { cn } from "../../lib/utils.js";

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
  const { loading: runtimeLoading, error: runtimeError } = useRuntime();
  const [profile, setProfile] = useState<ComponentResponse>();
  const [input, setInput] = useState(JSON.stringify(starterCard, null, 2));
  const [preview, setPreview] = useState<JsonObject>(starterCard);
  const [error, setError] = useState<string>();
  const [width, setWidth] = useState<(typeof previewWidths)[number]>(480);

  useEffect(() => {
    let active = true;
    void loadJson<ComponentResponse>(serverPath("/api/v1/components"))
      .then((value) => { if (active) setProfile(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  const resources = useMemo(() => profile ? {
    hostConfig: profile.hostConfig,
    stylesheetUrls: [profile.stylesheetUrl],
    adaptiveCardsSdkUrl: `https://cdn.jsdelivr.net/npm/adaptivecards@${profile.renderProfile.adaptiveCardsSdkVersion}/dist/adaptivecards.min.js`,
  } : undefined, [profile]);

  if (runtimeLoading || !profile) return <LoadingState label="正在准备预览工具" />;
  if (runtimeError) return <ErrorState message={runtimeError} />;

  const render = () => {
    setError(undefined);
    try {
      const parsed = JSON.parse(input) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON 顶层必须是对象");
      setPreview(parsed as JsonObject);
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
            <h1>卡片预览器</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">粘贴或编辑完整的 Adaptive Card JSON，快速检查不同宽度下的渲染效果。</p>
          </div>

          <div className="playground-width-control">
            <span>预览宽度</span>
            <div className="width-switch" role="group" aria-label="预览宽度">
              {previewWidths.map((value) => <button key={value} type="button" className={width === value ? "active" : ""} aria-pressed={width === value} onClick={() => setWidth(value)}>{value}</button>)}
            </div>
          </div>
        </header>

        <div className="playground-workbench">
          <section className="workbench-pane" aria-label="JSON 编辑器">
            <div className="flex min-h-14 flex-wrap items-center gap-2 border-b px-4 py-2">
              <div className="mr-auto">
                <strong className="block text-sm font-semibold">
                  卡片 JSON
                </strong>
                <span className="text-xs text-muted-foreground">
                  输入一份完整的 Adaptive Card 定义
                </span>
              </div>

              <Button type="button" variant="ghost" className="h-9" onClick={format}>
                <Code2 data-icon="inline-start" />
                格式化
              </Button>
              <Button type="button" variant="ghost" className="h-9" onClick={() => void navigator.clipboard.writeText(input)}>
                <Copy data-icon="inline-start" />
                复制
              </Button>
              <Button type="button" className="h-9 px-4" onClick={render}>
                <Play data-icon="inline-start" />
                更新预览
              </Button>
            </div>

            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              spellCheck={false}
              aria-label="卡片 JSON"
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
              {error ? <pre className="m-0 whitespace-pre-wrap font-sans">{error}</pre> : <span>JSON 有效，预览已更新</span>}
            </div>
          </section>

          <section className="workbench-pane workbench-preview" aria-label="卡片预览">
            <div className="flex min-h-14 items-center gap-3 border-b px-4 py-2">
              <div className="mr-auto">
                <strong className="block text-sm font-semibold">预览</strong>
                <span className="text-xs text-muted-foreground">最大宽度 {width}px</span>
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

      </div>
    </main>
  );
}
