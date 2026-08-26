import { Bot, Check, ChevronDown, Clipboard, ExternalLink, Palette, Terminal } from "lucide-react";
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

  const skillArchive = `${data.skill.name}-${data.skill.version}.tgz`;
  const standardSteps = [
    { label: "安装开发工具", description: "同时安装 Forge CLI 与匹配的渲染规范。", value: data.cli.installCommand },
    { label: "初始化项目", description: "生成项目配置并绑定当前 Render Profile。", value: data.cli.initCommand },
    { label: "检查接入状态", description: "验证配置、数据契约与渲染规范是否匹配。", value: "pnpm octo-card-forge check", success: "项目配置有效，可以开始使用" },
  ];
  const advancedIntegrations = [
    {
      id: "profile",
      icon: Palette,
      title: "仅接入渲染规范",
      description: "适用于已有卡片运行时、只需要统一视觉与组件约束的宿主应用。",
      steps: [
        { label: "安装渲染包", description: "加入 Host Config、样式、Token 与组件能力声明。", value: `npm install --save-dev ${data.renderProfile.package}@${data.renderProfile.version}` },
        { label: "绑定配置", description: "在项目配置中固定当前 Render Profile 版本。", value: data.cli.initCommand },
        { label: "验证渲染环境", description: "确认宿主运行时与渲染规范版本匹配。", value: "pnpm octo-card-forge check", success: `${data.renderProfile.id}@${data.renderProfile.version} 已就绪` },
      ],
    },
    {
      id: "skill",
      icon: Bot,
      title: "为 AI Agent 安装 Skill",
      description: "适用于支持 Skill 导入的编码 Agent，不属于网页或卡片运行时依赖。",
      steps: [
        { label: "下载 Skill", description: "获取可移植的完整 Skill 压缩包。", value: `curl -L \"${data.skill.bundleUrl}\" -o \"${skillArchive}\"` },
        { label: "校验文件", description: "核对压缩包是否完整且未被修改。", value: `echo \"${data.skill.sha256}  ${skillArchive}\" | shasum -a 256 -c -` },
        { label: "查看入口", description: "导入前确认 Skill 的入口文件。", value: `tar -xOf \"${skillArchive}\" \"${data.skill.entry}\"`, success: `${data.skill.entry} 可读取` },
      ],
    },
  ];

  return (
    <main className="install-showcase">
      <header className="install-hero">
        <div className="install-hero-inner">
          <div>
            <h1>安装接入</h1>
            <p>大多数项目只需要完成标准接入；渲染规范与 Agent Skill 可按场景单独使用。</p>
            <span className="install-release">当前稳定版 <strong>v{data.cli.version}</strong> · 兼容范围 <strong>{data.cli.compatibleRange}</strong></span>
          </div>
        </div>
      </header>

      <div className="install-body">
        <div className="install-layout">
          <section className="install-quickstart" aria-labelledby="workspace-install-title">
            <header className="install-section-header">
              <span>标准项目接入</span>
              <h2 id="workspace-install-title">安装 Forge CLI</h2>
              <p>适合需要开发、检查和交付 Card Package 的项目。安装命令会同时加入匹配的 Render Profile。</p>
            </header>
            <div className="install-steps">{standardSteps.map((step, index) => <InstallStep key={step.label} number={String(index + 1).padStart(2, "0")} {...step} />)}</div>

            <section className="install-advanced" aria-labelledby="advanced-install-title">
              <header>
                <span>高级集成</span>
                <h2 id="advanced-install-title">只在特定场景下使用</h2>
                <p>下面的能力不是标准接入的替代方案，只有在自定义宿主或 Agent 环境中才需要单独配置。</p>
              </header>
              <div className="install-advanced-options">
                {advancedIntegrations.map((integration) => {
                  const Icon = integration.icon;
                  return <details className="install-option" key={integration.id}>
                    <summary><span className="install-option-icon"><Icon /></span><span className="install-option-copy"><strong>{integration.title}</strong><small>{integration.description}</small></span><ChevronDown className="install-option-chevron" /></summary>
                    <div className="install-option-steps">{integration.steps.map((step, index) => <InstallStep key={step.label} number={String(index + 1).padStart(2, "0")} {...step} />)}</div>
                  </details>;
                })}
              </div>
            </section>
          </section>

          <aside className="install-summary">
            <h2>标准接入包含</h2>
            <VersionRow label="开发工具" value={data.cli.package} note={data.cli.version} />
            <VersionRow label="渲染规范" value={data.renderProfile.id} note={data.renderProfile.version} />
            <p className="install-summary-note">Agent Skill 不会随项目依赖安装，需要时可从高级集成中单独下载。</p>
            <a href={data.skill.releaseUrl} target="_blank" rel="noreferrer">查看发行说明 <ExternalLink /></a>
          </aside>
        </div>

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
      <div className="install-command"><Terminal aria-hidden="true" /><code>{value}</code><Button className="install-copy" type="button" variant="ghost" size="icon-lg" aria-label={`复制${label}命令`} title="复制命令" onClick={copy}>{copied ? <Check /> : <Clipboard />}</Button></div>
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
