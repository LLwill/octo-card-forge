import { Check, Clipboard, Download, ExternalLink, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../../components/AsyncState.js";
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
    void loadJson<InstallManifest>(serverPath("/api/install"))
      .then((value) => { if (active) setData(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [revision]);
  if (error) return <ErrorState message={error} retry={() => setRevision((value) => value + 1)} />;
  if (!data) return <LoadingState label="Loading install manifest" />;

  return <main className="page install-page">
    <header className="page-header split-header"><div><span className="eyebrow">Current release</span><h1>Install</h1><p>为 Agent 工作区安装 CLI、Skill 与精确版本 Render Profile。</p></div><span className="release-badge">v{data.cli.version}</span></header>
    <section className="install-section"><div className="section-heading"><Terminal size={19} /><div><h2>Complete workspace</h2><p>创建、预览、校验并交付 Card 的推荐路径。</p></div><span className="recommended-badge">Recommended</span></div><Command label="Install tools" value={data.cli.installCommand} /><Command label="Initialize workspace" value={data.cli.initCommand} /></section>
    <section className="install-section"><div className="section-heading"><Download size={19} /><div><h2>Portable Skill bundle</h2><p>适合只支持上传 Skill、无需 Node runtime 的环境。</p></div></div><div className="install-actions"><a className="button primary" href={data.skill.bundleUrl}>Download Skill</a><a className="button secondary" href={data.skill.releaseUrl} target="_blank" rel="noreferrer">Release notes<ExternalLink size={14} /></a></div></section>
    <section className="install-section"><h2>Versions and compatibility</h2><div className="install-facts"><InstallFact label="CLI" value={`${data.cli.package}@${data.cli.version}`} note={data.cli.compatibleRange} /><InstallFact label="Skill" value={`${data.skill.name}@${data.skill.version}`} note={data.skill.entry} /><InstallFact label="Render Profile" value={`${data.renderProfile.id}@${data.renderProfile.version}`} note={data.renderProfile.compatibleRange ?? data.renderProfile.source} /><InstallFact label="Skill SHA-256" value={data.skill.sha256} mono /></div></section>
  </main>;
}

function Command({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="command-block"><span>{label}</span><code>{value}</code><button className="icon-button" type="button" title={`Copy ${label}`} onClick={() => void navigator.clipboard.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); })}>{copied ? <Check size={17} /> : <Clipboard size={17} />}</button></div>;
}

function InstallFact({ label, value, note, mono = false }: { label: string; value: string; note?: string; mono?: boolean }) {
  return <div><span>{label}</span><strong className={mono ? "mono-break" : ""}>{value}</strong>{note ? <small>{note}</small> : null}</div>;
}
