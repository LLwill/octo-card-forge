import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  Code2,
  Play,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PreviewRenderResponse, PreviewSession } from "@mlt-org/octo-card-preview-kit";
import type { JsonObject, RenderProfileManifestV1 } from "@mlt-org/octo-card-spec";
import { useRuntime } from "../../app/runtime.js";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { RawPreviewFrame } from "../../components/PreviewFrame.js";
import { Badge } from "../../components/ui/badge.js";
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
    { type: "TextBlock", text: "Card JSON playground", weight: "Bolder", size: "Medium" },
    { type: "TextBlock", text: "Edit this JSON and render it with the active Render Profile.", wrap: true },
  ],
  actions: [{ type: "Action.Submit", title: "Preview action", data: { action: "preview" } }],
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

  if (runtimeLoading || !profile) return <LoadingState label="Preparing playground" />;
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
    <main className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="flex flex-col gap-5 border-b pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="border-primary/25 bg-primary/8 text-primary">
                <Sparkles data-icon="inline-start" />
                Safe sandbox
              </Badge>
              <span className="text-sm text-muted-foreground">
                {runtime?.mode === "workspace" ? "Workspace compiler connected" : "Published preview"}
              </span>
            </div>
            <h1 className="text-3xl font-semibold">Playground</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Edit Card JSON directly, or compile Template Data through the active workspace profile.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border bg-muted/60 p-1" aria-label="Preview width">
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
            <Badge variant="secondary" className="h-8 px-3 text-xs">
              {profile.reference}
            </Badge>
          </div>
        </header>

        <section className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between" aria-label="Playground controls">
          <div className="inline-flex w-fit rounded-lg border bg-muted/60 p-1">
            <Button
              type="button"
              variant={mode === "card-json" ? "outline" : "ghost"}
              aria-pressed={mode === "card-json"}
              className={cn("h-9", mode === "card-json" && "bg-background text-primary shadow-sm")}
              onClick={() => activateMode("card-json")}
            >
              <Braces data-icon="inline-start" />
              Card JSON
            </Button>
            <Button
              type="button"
              variant={mode === "template-data" ? "outline" : "ghost"}
              aria-pressed={mode === "template-data"}
              disabled={!runtime?.capabilities.templateDataPreview}
              title={runtime?.capabilities.templateDataPreview ? undefined : "Template Data requires workspace mode"}
              className={cn("h-9", mode === "template-data" && "bg-background text-primary shadow-sm")}
              onClick={() => activateMode("template-data")}
            >
              <WandSparkles data-icon="inline-start" />
              Template Data
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Adaptive Cards SDK</span>
            <Badge variant="outline">{profile.renderProfile.adaptiveCardsSdkVersion}</Badge>
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[minmax(420px,0.95fr)_minmax(440px,1.05fr)]">
          <section className="min-w-0 overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="JSON editor">
            <div className="flex min-h-14 flex-wrap items-center gap-2 border-b px-4 py-2">
              <div className="mr-auto">
                <strong className="block text-sm font-semibold">
                  {mode === "card-json" ? "Adaptive Card JSON" : "ViewModel JSON"}
                </strong>
                <span className="text-xs text-muted-foreground">
                  {mode === "card-json" ? "Rendered locally in the preview sandbox" : "Compiled by the workspace server"}
                </span>
              </div>

              {mode === "template-data" && session ? (
                <Select value={view ?? null} onValueChange={(value) => setView(value ?? undefined)}>
                  <SelectTrigger className="h-9 min-w-36 bg-background" aria-label="Template view">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {session.views.map((item) => <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : null}

              <Button type="button" variant="ghost" className="h-9" onClick={format}>
                <Code2 data-icon="inline-start" />
                Format
              </Button>
              <Button type="button" className="h-9 px-4" onClick={() => void render()}>
                <Play data-icon="inline-start" />
                Render
              </Button>
            </div>

            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              spellCheck={false}
              aria-label={mode === "card-json" ? "Adaptive Card JSON" : "ViewModel JSON"}
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
              {error ? <pre className="m-0 whitespace-pre-wrap font-sans">{error}</pre> : <span>Last render succeeded</span>}
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-lg border bg-card shadow-xs" aria-label="Card preview">
            <div className="flex min-h-14 items-center gap-3 border-b px-4 py-2">
              <div className="mr-auto">
                <strong className="block text-sm font-semibold">Preview</strong>
                <span className="text-xs text-muted-foreground">Live output at {width}px</span>
              </div>
              <Badge variant="outline" className="font-mono text-[11px]">{profile.reference}</Badge>
            </div>
            <div className="flex h-[calc(100vh-294px)] min-h-[576px] overflow-auto bg-[#edf1f2] p-5 sm:p-7">
              <div
                className="mx-auto h-fit min-h-[520px] max-w-full overflow-hidden rounded-lg border bg-white shadow-sm transition-[width] duration-200 [&_.card-preview]:h-[560px] [&_.card-preview]:min-h-[560px]"
                style={{ width: `min(100%, ${width}px)` }}
              >
                {resources ? <RawPreviewFrame card={preview} resources={resources} title="Playground preview" /> : null}
              </div>
            </div>
          </section>
        </div>

        {compiled ? (
          <details className="mt-5 overflow-hidden rounded-lg border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Compiled Adaptive Card JSON</summary>
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
