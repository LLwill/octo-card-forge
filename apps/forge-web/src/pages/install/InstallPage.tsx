import {
  Check,
  CheckCircle2,
  Clipboard,
  Download,
  ExternalLink,
  PackageCheck,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { Badge } from "../../components/ui/badge.js";
import { Button, buttonVariants } from "../../components/ui/button.js";
import { Separator } from "../../components/ui/separator.js";
import { loadJson, serverPath } from "../../data/client.js";
import { cn } from "../../lib/utils.js";

interface InstallManifest {
  cli: { package: string; version: string; compatibleRange: string; npmUrl: string; installCommand: string; initCommand: string };
  skill: { name: string; version: string; entry: string; bundleUrl: string; releaseUrl: string; sha256: string };
  renderProfile: { id: string; version: string; source: string; package: string; compatibleRange?: string };
}

export function InstallPage() {
  const [data, setData] = useState<InstallManifest>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setError(undefined);
    void loadJson<InstallManifest>(serverPath("/api/v1/install"))
      .then((value) => { if (active) setData(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [revision]);

  if (error) return <ErrorState message={error} retry={() => setRevision((value) => value + 1)} />;
  if (!data) return <LoadingState label="Loading install manifest" />;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-14">
          <div className="max-w-2xl">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge className="h-6 bg-primary/10 px-2.5 text-primary">Current release</Badge>
              <span className="text-sm text-muted-foreground">CLI, Skill and Render Profile</span>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Install Octo Card Forge</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Set up a complete Card authoring workspace, or download the portable Skill bundle for an existing agent environment.
            </p>
          </div>
          <div className="flex items-center gap-3 lg:pb-1">
            <div className="text-right">
              <span className="block text-xs font-medium uppercase text-muted-foreground">Stable version</span>
              <strong className="font-mono text-lg">v{data.cli.version}</strong>
            </div>
            <div className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary"><PackageCheck className="size-5" /></div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <section aria-labelledby="workspace-install-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-primary">
                <Terminal className="size-5" />
                <span className="text-sm font-semibold">Recommended setup</span>
              </div>
              <h2 id="workspace-install-title" className="text-2xl font-semibold">Complete workspace</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Install the exact toolchain, then initialize the agent-facing workspace files.</p>
            </div>
            <Badge variant="outline" className="h-7 w-fit border-primary/25 bg-primary/8 px-3 text-primary">
              <CheckCircle2 data-icon="inline-start" />
              Recommended
            </Badge>
          </div>

          <div className="mt-7 overflow-hidden rounded-lg border bg-card shadow-xs">
            <InstallStep number="01" label="Install tools" description="Pins the Forge CLI and the active Octo Chat render profile." value={data.cli.installCommand} />
            <Separator />
            <InstallStep number="02" label="Initialize workspace" description="Creates the local agent instructions and validates the installation." value={data.cli.initCommand} />
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            Versions are generated from the published install manifest, not floating latest tags.
          </div>
        </section>

        <Separator className="my-10 lg:my-12" />

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start" aria-labelledby="portable-skill-title">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Download className="size-5" />
              <span className="text-sm font-semibold">Portable option</span>
            </div>
            <h2 id="portable-skill-title" className="text-2xl font-semibold">Skill bundle</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Use this path when the target environment accepts uploaded Skills but does not provide a Node.js runtime.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")} href={data.skill.bundleUrl}>
                <Download data-icon="inline-start" />
                Download Skill
              </a>
              <a className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")} href={data.skill.releaseUrl} target="_blank" rel="noreferrer">
                Release notes
                <ExternalLink data-icon="inline-end" />
              </a>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/45 p-5">
            <span className="text-xs font-medium uppercase text-muted-foreground">Bundle identity</span>
            <strong className="mt-2 block text-base">{data.skill.name}@{data.skill.version}</strong>
            <code className="mt-3 block break-all text-xs leading-5 text-muted-foreground">sha256:{data.skill.sha256}</code>
          </div>
        </section>

        <Separator className="my-10 lg:my-12" />

        <section aria-labelledby="compatibility-title">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="compatibility-title" className="text-2xl font-semibold">Versions and compatibility</h2>
              <p className="mt-2 text-sm text-muted-foreground">The exact packages included in this release.</p>
            </div>
            <a className="text-sm font-medium text-primary hover:underline" href={data.cli.npmUrl} target="_blank" rel="noreferrer">
              View CLI package <ExternalLink className="ml-1 inline size-3.5" />
            </a>
          </div>

          <div className="mt-6 overflow-hidden rounded-lg border bg-card">
            <VersionRow label="CLI" value={`${data.cli.package}@${data.cli.version}`} note={data.cli.compatibleRange} />
            <Separator />
            <VersionRow label="Skill" value={`${data.skill.name}@${data.skill.version}`} note={data.skill.entry} />
            <Separator />
            <VersionRow label="Render Profile" value={`${data.renderProfile.id}@${data.renderProfile.version}`} note={data.renderProfile.compatibleRange ?? data.renderProfile.source} />
          </div>
        </section>
      </div>
    </main>
  );
}

function InstallStep({ number, label, description, value }: { number: string; label: string; description: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="grid gap-4 p-5 sm:grid-cols-[48px_170px_minmax(0,1fr)_44px] sm:items-center sm:p-6">
      <div className="grid size-10 place-items-center rounded-lg bg-primary/10 font-mono text-sm font-semibold text-primary">{number}</div>
      <div>
        <strong className="block text-sm font-semibold">{label}</strong>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
      </div>
      <code className="min-w-0 overflow-x-auto rounded-md bg-[#121719] px-4 py-3 text-[13px] leading-5 text-slate-100">{value}</code>
      <Button type="button" variant="outline" size="icon-lg" aria-label={`Copy ${label}`} onClick={copy}>
        {copied ? <Check /> : <Clipboard />}
      </Button>
    </div>
  );
}

function VersionRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-[150px_minmax(0,1fr)_180px] sm:items-center sm:px-6">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <strong className="min-w-0 break-all font-mono text-sm font-medium">{value}</strong>
      <span className="text-xs text-muted-foreground sm:text-right">{note}</span>
    </div>
  );
}
