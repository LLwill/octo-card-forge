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
  if (!data) return <LoadingState label="正在准备安装信息" />;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-14">
          <div className="max-w-2xl">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge className="h-6 bg-primary/10 px-2.5 text-primary">最新稳定版</Badge>
              <span className="text-sm text-muted-foreground">命令行工具与卡片组件</span>
            </div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">安装 Octo Card Forge</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              两步完成项目初始化，也可以单独下载 Skill 包用于已有的智能体环境。
            </p>
          </div>
          <div className="flex items-center gap-3 lg:pb-1">
            <div className="text-right">
              <span className="block text-xs font-medium text-muted-foreground">当前版本</span>
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
                <span className="text-sm font-semibold">推荐方式</span>
              </div>
              <h2 id="workspace-install-title" className="text-2xl font-semibold">快速开始</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">依次运行下面两条命令，即可在当前项目中开始使用。</p>
            </div>
            <Badge variant="outline" className="h-7 w-fit border-primary/25 bg-primary/8 px-3 text-primary">
              <CheckCircle2 data-icon="inline-start" />
              推荐
            </Badge>
          </div>

          <div className="mt-7 overflow-hidden rounded-lg border bg-card shadow-xs">
            <InstallStep number="01" label="安装工具" description="安装与当前版本匹配的命令行工具和卡片样式。" value={data.cli.installCommand} />
            <Separator />
            <InstallStep number="02" label="初始化项目" description="创建项目所需文件，并检查安装是否正确。" value={data.cli.initCommand} />
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" />
            命令中已固定兼容版本，可以直接运行。
          </div>
        </section>

        <Separator className="my-10 lg:my-12" />

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start" aria-labelledby="portable-skill-title">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Download className="size-5" />
              <span className="text-sm font-semibold">可选方式</span>
            </div>
            <h2 id="portable-skill-title" className="text-2xl font-semibold">便携 Skill 包</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              适合已经支持导入 Skill，但没有 Node.js 运行环境的平台。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a className={cn(buttonVariants({ size: "lg" }), "h-10 px-4")} href={data.skill.bundleUrl}>
                <Download data-icon="inline-start" />
                下载 Skill
              </a>
              <a className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")} href={data.skill.releaseUrl} target="_blank" rel="noreferrer">
                发行说明
                <ExternalLink data-icon="inline-end" />
              </a>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/45 p-5">
            <span className="text-xs font-medium text-muted-foreground">Skill 版本</span>
            <strong className="mt-2 block text-base">v{data.skill.version}</strong>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">下载后可直接导入支持 Skill 的环境。</p>
          </div>
        </section>

        <Separator className="my-10 lg:my-12" />

        <details className="overflow-hidden rounded-lg border bg-card">
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium">技术信息</summary>
          <Separator />
          <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">当前安装包含的具体包版本与兼容范围。</p>
            <a className="text-sm font-medium text-primary hover:underline" href={data.cli.npmUrl} target="_blank" rel="noreferrer">
              查看命令行工具 <ExternalLink className="ml-1 inline size-3.5" />
            </a>
          </div>
          <div>
            <VersionRow label="命令行工具" value={`${data.cli.package}@${data.cli.version}`} note={data.cli.compatibleRange} />
            <Separator />
            <VersionRow label="Skill 包" value={`${data.skill.name}@${data.skill.version}`} note={data.skill.entry} />
            <Separator />
            <VersionRow label="卡片样式" value={`${data.renderProfile.id}@${data.renderProfile.version}`} note={data.renderProfile.compatibleRange ?? data.renderProfile.source} />
            <Separator />
            <VersionRow label="文件校验" value={`sha256:${data.skill.sha256}`} />
          </div>
        </details>
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
      <Button type="button" variant="outline" size="icon-lg" aria-label={`复制${label}命令`} title="复制命令" onClick={copy}>
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
