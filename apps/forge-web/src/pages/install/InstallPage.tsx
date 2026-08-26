import { Check, Clipboard, ExternalLink, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
import { Button } from "../../components/ui/button.js";
import { Separator } from "../../components/ui/separator.js";
import { loadJson, serverPath } from "../../data/client.js";

interface InstallManifest {
  cli: { package: string; version: string; compatibleRange: string; npmUrl: string; installCommand: string; initCommand: string };
  skill: { name: string; version: string; entry: string; bundleUrl: string; releaseUrl: string; sha256: string };
  renderProfile: { id: string; version: string; source: string; package: string; compatibleRange?: string };
}

type InstallPath = "cli" | "profile" | "skill";

export function InstallPage() {
  const [data, setData] = useState<InstallManifest>();
  const [error, setError] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [path, setPath] = useState<InstallPath>("cli");

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

  const skillArchive = `${data.skill.name}-${data.skill.version}.tgz`;
  const pathContent = {
    cli: {
      title: "CLI 快速开始",
      steps: [
        { label: "安装工具", description: "安装与当前版本匹配的命令行工具。", value: data.cli.installCommand },
        { label: "初始化项目", description: "生成项目所需配置并绑定 Render Profile。", value: data.cli.initCommand },
        { label: "验证安装", description: "检查配置、契约与 Render Profile 是否就绪。", value: "pnpm octo-card-forge check", success: "配置有效 · Render Profile 已就绪" },
      ],
    },
    profile: {
      title: "Render Profile 接入",
      steps: [
        { label: "安装渲染包", description: "将统一的 Host Config 与样式加入宿主项目。", value: `npm install --save-dev ${data.renderProfile.package}@${data.renderProfile.version}` },
        { label: "绑定配置", description: "初始化项目并写入当前 Render Profile。", value: data.cli.initCommand },
        { label: "验证渲染", description: "确认宿主、契约与组件规范版本匹配。", value: "pnpm octo-card-forge check", success: `${data.renderProfile.id}@${data.renderProfile.version} 已就绪` },
      ],
    },
    skill: {
      title: "Portable Skill 接入",
      steps: [
        { label: "下载 Skill", description: "获取可移植的完整 Skill 压缩包。", value: `curl -L \"${data.skill.bundleUrl}\" -o \"${skillArchive}\"` },
        { label: "校验文件", description: "核对压缩包是否完整且未被修改。", value: `echo \"${data.skill.sha256}  ${skillArchive}\" | shasum -a 256 -c -` },
        { label: "查看入口", description: "导入前确认 Skill 的入口文件。", value: `tar -xOf \"${skillArchive}\" \"${data.skill.entry}\"`, success: `${data.skill.entry} 可读取` },
      ],
    },
  } satisfies Record<InstallPath, { title: string; steps: Array<{ label: string; description: string; value: string; success?: string }> }>;
  const currentPath = pathContent[path];

  return (
    <main className="install-showcase">
      <header className="install-hero">
        <div className="install-hero-inner">
          <div>
            <h1>安装接入</h1>
            <p>在项目中安装 CLI 与 Render Profile，或下载可移植 Skill 包。</p>
            <span className="install-release">当前稳定版 <strong>v{data.cli.version}</strong> · 兼容范围 <strong>{data.cli.compatibleRange}</strong></span>
          </div>
        </div>
      </header>

      <div className="install-body">
        <div className="install-path-tabs" role="tablist" aria-label="接入方式">
          <button className={path === "cli" ? "active" : ""} type="button" role="tab" aria-selected={path === "cli"} onClick={() => setPath("cli")}>CLI（推荐）</button>
          <button className={path === "profile" ? "active" : ""} type="button" role="tab" aria-selected={path === "profile"} onClick={() => setPath("profile")}>Render Profile</button>
          <button className={path === "skill" ? "active" : ""} type="button" role="tab" aria-selected={path === "skill"} onClick={() => setPath("skill")}>Portable Skill</button>
        </div>
        <div className="install-layout"><section className="install-quickstart" aria-labelledby="workspace-install-title"><h2 id="workspace-install-title" className="sr-only">{currentPath.title}</h2><div className="install-steps">{currentPath.steps.map((step, index) => <InstallStep key={step.label} number={String(index + 1).padStart(2, "0")} {...step} />)}</div><section className="install-alternatives"><h2>其他接入方式</h2><button type="button" onClick={() => setPath("profile")}><span>Render Profile</span><small>用于自定义渲染宿主</small><strong>查看 Render Profile →</strong></button><button type="button" onClick={() => setPath("skill")}><span>Portable Skill</span><small>用于支持 Skill 导入的平台</small><strong>查看 Portable Skill →</strong></button></section></section><aside className="install-summary"><h2>本次安装</h2><VersionRow label="CLI" value={data.cli.package} note={data.cli.version} /><VersionRow label="Render Profile" value={data.renderProfile.id} note={data.renderProfile.version} /><VersionRow label="Portable Skill" value={data.skill.name} note={data.skill.version} /><a href={data.skill.releaseUrl} target="_blank" rel="noreferrer">查看发行说明 <ExternalLink /></a></aside></div>

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

function InstallStep({ number, label, description, value, success }: { number: string; label: string; description: string; value: string; success?: string }) {
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
      {success ? <span className="install-success"><Check />{success}</span> : null}
    </div>
  );
}

function VersionRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="install-version-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
