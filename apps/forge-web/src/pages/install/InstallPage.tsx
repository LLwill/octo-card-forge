import {
  Check,
  Clipboard,
  Download,
  ExternalLink,
  PackageCheck,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
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
    <main className="install-showcase">
      <header className="install-hero">
        <div className="install-hero-inner">
          <div>
            <span className="install-edition-label">快速开始</span>
            <h1>安装 Octo Card Forge</h1>
            <p>在现有项目中安装工具，然后生成所需配置。</p>
          </div>
          <div className="install-version">
            <PackageCheck />
            <span>稳定版</span>
            <strong>v{data.cli.version}</strong>
          </div>
        </div>
      </header>

      <div className="install-body">
        <section className="install-quickstart" aria-labelledby="workspace-install-title">
          <div className="install-section-heading">
            <span>01</span>
            <div>
              <h2 id="workspace-install-title">两条命令完成初始化</h2>
              <p>命令中已经固定互相兼容的版本，可以直接运行。</p>
            </div>
          </div>

          <div className="install-steps">
            <InstallStep number="01" label="安装工具" description="安装与当前版本匹配的命令行工具和卡片样式。" value={data.cli.installCommand} />
            <InstallStep number="02" label="初始化项目" description="创建项目所需文件，并检查安装是否正确。" value={data.cli.initCommand} />
          </div>
        </section>

        <section className="install-secondary" aria-labelledby="portable-skill-title">
          <div>
            <span className="install-section-number">02</span>
            <h2 id="portable-skill-title">直接使用 Skill 包</h2>
            <p>适合已经支持导入 Skill，但没有 Node.js 运行环境的平台。</p>
            <div className="install-download-actions">
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

          <div className="install-skill-note">
            <span>Skill 版本</span>
            <strong>v{data.skill.version}</strong>
            <p>下载后可直接导入支持 Skill 的环境。</p>
          </div>
        </section>

        <details className="install-details">
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
    <div className="install-step">
      <div className="install-step-copy">
        <span>{number}</span>
        <div>
          <strong>{label}</strong>
          <small>{description}</small>
        </div>
      </div>
      <div className="install-command"><Terminal aria-hidden="true" /><code>{value}</code></div>
      <Button className="install-copy" type="button" variant="ghost" size="icon-lg" aria-label={`复制${label}命令`} title="复制命令" onClick={copy}>
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
