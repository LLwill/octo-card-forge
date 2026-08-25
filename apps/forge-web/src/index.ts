import type {
  CardArtifactV1,
  CatalogSnapshotV1,
} from "@mlt-org/octo-card-catalog-snapshot";
import {
  deriveProfileResourceUrls,
  loadCardArtifact,
  loadCatalogSnapshot,
} from "./data.js";

type CatalogCard = CatalogSnapshotV1["cards"][number];
type CatalogVersion = CatalogCard["versions"][number];
type TabName = "preview" | "contract" | "validation" | "versions";

interface AppState {
  snapshot?: CatalogSnapshotV1;
  selectedCard?: CatalogCard;
  selectedVersion?: CatalogVersion;
  artifact?: CardArtifactV1;
  filter: string;
  tab: TabName;
  view?: string;
  sample?: string;
  loading: boolean;
  error?: string;
}

function requireRoot(): HTMLElement {
  const element = document.querySelector<HTMLElement>("#app");
  if (!element) throw new Error("Forge Web root was not found");
  return element;
}

const root = requireRoot();

const state: AppState = { filter: "", tab: "preview", loading: true };
let artifactRequest = 0;

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("</script", "<\\/script");
}

function safeLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function shortDigest(value: string): string {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function filteredCards(): CatalogCard[] {
  const query = state.filter.trim().toLocaleLowerCase();
  if (!query) return state.snapshot?.cards ?? [];
  return (state.snapshot?.cards ?? []).filter((card) =>
    [card.id, card.name, card.namespace, card.key].some((value) =>
      value?.toLocaleLowerCase().includes(query)
    )
  );
}

function renderSidebar(): string {
  const cards = filteredCards();
  return `
    <aside class="catalog-pane" aria-label="Card Catalog">
      <div class="catalog-tools">
        <label class="search-field">
          <span class="sr-only">搜索卡片</span>
          <span aria-hidden="true" class="search-icon">⌕</span>
          <input id="catalog-search" type="search" value="${escapeHtml(state.filter)}" placeholder="搜索名称或 ID" autocomplete="off" />
        </label>
        <span class="count-label">${cards.length} cards</span>
      </div>
      <div class="card-list" role="listbox" aria-label="Catalog cards">
        ${cards.length === 0 ? `<div class="empty-list">没有匹配的卡片</div>` : cards.map((card) => `
          <button class="card-row${state.selectedCard?.id === card.id ? " is-selected" : ""}" data-card-id="${escapeHtml(card.id)}" role="option" aria-selected="${state.selectedCard?.id === card.id}">
            <span class="card-row-name">${escapeHtml(card.name)}</span>
            <span class="card-row-meta"><code>${escapeHtml(card.id)}</code><span>v${escapeHtml(card.latest)}</span></span>
          </button>
        `).join("")}
      </div>
      <footer class="catalog-revision">
        <span>Snapshot</span>
        <code title="${escapeHtml(state.snapshot?.revision ?? "")}">${state.snapshot ? escapeHtml(state.snapshot.revision.slice(0, 12)) : "-"}</code>
      </footer>
    </aside>`;
}

function renderLoading(): string {
  return `<main class="detail-pane centered-state"><div class="spinner" aria-hidden="true"></div><strong>正在读取不可变 Catalog</strong><span>校验 Snapshot 与 Artifact 数据...</span></main>`;
}

function renderError(): string {
  return `<main class="detail-pane centered-state error-state"><span class="state-mark">!</span><strong>Catalog 加载失败</strong><span>${escapeHtml(state.error)}</span><button id="retry-load" class="command-button">重新加载</button></main>`;
}

function externalLink(label: string, url: string | undefined): string {
  const safeUrl = safeLink(url);
  return safeUrl ? `<a class="command-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${escapeHtml(label)}<span aria-hidden="true">↗</span></a>` : "";
}

function renderHeader(card: CatalogCard, version: CatalogVersion, artifact: CardArtifactV1): string {
  return `
    <header class="detail-header">
      <div class="title-block">
        <div class="eyebrow"><code>${escapeHtml(card.id)}</code><span class="readonly-badge">只读</span></div>
        <h1>${escapeHtml(card.name)}</h1>
        <p>${escapeHtml(version.reference)} · Contract ${escapeHtml(version.contractVersion)} · ${escapeHtml(artifact.card.defaultLocale)}</p>
      </div>
      <div class="header-actions">
        <label class="version-control">版本
          <select id="version-select">
            ${card.versions.map((candidate) => `<option value="${escapeHtml(candidate.reference)}"${candidate.reference === version.reference ? " selected" : ""}>${escapeHtml(candidate.version)}</option>`).join("")}
          </select>
        </label>
        ${externalLink("Release", version.release?.url)}
        ${externalLink("Artifact", version.artifact.url)}
      </div>
    </header>`;
}

function renderTabs(): string {
  const labels: Record<TabName, string> = {
    preview: "预览",
    contract: "数据契约",
    validation: "验证",
    versions: "版本",
  };
  return `<nav class="tabs" aria-label="Card details">${(Object.keys(labels) as TabName[]).map((tab) => `
    <button class="tab-button${state.tab === tab ? " is-active" : ""}" data-tab="${tab}" role="tab" aria-selected="${state.tab === tab}">${labels[tab]}</button>
  `).join("")}</nav>`;
}

function selectedView(artifact: CardArtifactV1): [string, CardArtifactV1["views"][string]] {
  const entries = Object.entries(artifact.views);
  const result = entries.find(([name]) => name === state.view) ?? entries[0];
  if (!result) throw new Error("Artifact does not contain a view");
  return result;
}

function selectedSample(view: CardArtifactV1["views"][string]): CardArtifactV1["views"][string]["samples"][number] {
  const result = view.samples.find((sample) => sample.name === state.sample) ?? view.samples[0];
  if (!result) throw new Error("Artifact view does not contain a sample");
  return result;
}

function previewDocument(artifact: CardArtifactV1, sample: CardArtifactV1["views"][string]["samples"][number]): string {
  const resources = deriveProfileResourceUrls(artifact);
  const styles = [resources.theme, resources.stylesheet].filter(Boolean).map((url) => `<link rel="stylesheet" href="${escapeHtml(url)}">`).join("");
  return `<!doctype html><html><head><meta charset="utf-8">${styles}<style>
    html,body{margin:0;min-height:100%;background:#f4f6f8;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    body{padding:28px 20px;box-sizing:border-box}.preview-root{max-width:560px;margin:0 auto}.preview-error{padding:20px;color:#9b2c2c;background:#fff;border:1px solid #e8b4b4;border-radius:6px;white-space:pre-wrap}
  </style></head><body><div id="card" class="preview-root"></div><script src="${escapeHtml(resources.adaptiveCardsSdk)}"></script><script>
    const hostConfig=${jsonForScript(resources.hostConfig)};
    const payload=${jsonForScript(sample.card)};
    Promise.resolve().then(async()=>{const response=await fetch(hostConfig);if(!response.ok)throw new Error('HostConfig '+response.status);const config=await response.json();const card=new AdaptiveCards.AdaptiveCard();card.hostConfig=new AdaptiveCards.HostConfig(config);card.parse(payload);const rendered=card.render();if(!rendered)throw new Error('Adaptive Card SDK did not return a rendered element');document.getElementById('card').append(rendered)}).catch((error)=>{document.getElementById('card').innerHTML='<div class="preview-error">'+String(error.message||error).replace(/[&<>]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</div>'});
  </script></body></html>`;
}

function renderPreview(artifact: CardArtifactV1, version: CatalogVersion): string {
  const [viewName, view] = selectedView(artifact);
  const sample = selectedSample(view);
  state.view = viewName;
  state.sample = sample.name;
  const resources = deriveProfileResourceUrls(artifact);
  return `
    <section class="tab-panel preview-layout" role="tabpanel">
      <div class="preview-tool">
        <div class="preview-toolbar">
          <label>View<select id="view-select">${Object.keys(artifact.views).map((name) => `<option${name === viewName ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>
          <label>Sample<select id="sample-select">${view.samples.map((candidate) => `<option${candidate.name === sample.name ? " selected" : ""}>${escapeHtml(candidate.name)}</option>`).join("")}</select></label>
          <span class="valid-indicator"><span></span>Artifact valid</span>
        </div>
        <iframe class="card-preview" title="${escapeHtml(artifact.card.name)} ${escapeHtml(viewName)} preview" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" srcdoc="${escapeHtml(previewDocument(artifact, sample))}"></iframe>
      </div>
      <aside class="facts-pane">
        <h2>Release facts</h2>
        <dl>
          <div><dt>Artifact SHA-256</dt><dd><code title="${escapeHtml(version.artifact.sha256)}">${escapeHtml(shortDigest(version.artifact.sha256))}</code></dd></div>
          <div><dt>Render Profile</dt><dd><code>${escapeHtml(artifact.profile.reference)}</code></dd></div>
          <div><dt>Adaptive Cards SDK</dt><dd>${escapeHtml(artifact.profile.manifest.adaptiveCardsSdkVersion)}</dd></div>
          <div><dt>Wire profile</dt><dd><code>${escapeHtml(view.wireProfile)}</code></dd></div>
          <div><dt>Compiled sample</dt><dd>${escapeHtml(sample.name)}</dd></div>
          <div><dt>Source commit</dt><dd><code title="${escapeHtml(version.source.commit)}">${escapeHtml(version.source.commit.slice(0, 12))}</code></dd></div>
        </dl>
        <div class="resource-links">
          ${externalLink("HostConfig", resources.hostConfig)}
          ${resources.theme ? externalLink("Theme CSS", resources.theme) : ""}
          ${externalLink("Profile CSS", resources.stylesheet)}
          ${externalLink("Source", `https://github.com/${version.source.repository}/tree/${version.source.commit}/${version.source.path}`)}
        </div>
      </aside>
    </section>`;
}

function renderJsonPanel(title: string, description: string, value: unknown): string {
  return `<section class="tab-panel code-panel" role="tabpanel"><div class="panel-heading"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><pre><code>${escapeHtml(JSON.stringify(value, null, 2))}</code></pre></section>`;
}

function renderValidation(artifact: CardArtifactV1): string {
  const sampleCount = Object.values(artifact.views).reduce((sum, view) => sum + view.samples.length, 0);
  return `<section class="tab-panel validation-panel" role="tabpanel">
    <div class="validation-summary"><span class="validation-mark">✓</span><div><h2>Artifact validation passed</h2><p>${Object.keys(artifact.views).length} views · ${sampleCount} compiled samples · ${artifact.validation.issues.length} warnings</p></div></div>
    <div class="capability-grid">
      <div><span>Max card version</span><strong>${escapeHtml(artifact.profile.capabilities.maxAdaptiveCardVersion)}</strong></div>
      <div><span>Max nodes</span><strong>${artifact.profile.capabilities.maxNodes}</strong></div>
      <div><span>Max depth</span><strong>${artifact.profile.capabilities.maxDepth}</strong></div>
      <div><span>Max payload</span><strong>${Math.round(artifact.profile.capabilities.maxPayloadBytes / 1024)} KiB</strong></div>
    </div>
    ${artifact.validation.issues.length ? `<div class="warning-list">${artifact.validation.issues.map((issue) => `<article><code>${escapeHtml(issue.code)}</code><strong>${escapeHtml(issue.message)}</strong><span>${escapeHtml(issue.details.view)} / ${escapeHtml(issue.details.sample)} · ${escapeHtml(issue.path)}</span></article>`).join("")}</div>` : `<div class="empty-validation">这个不可变 Artifact 没有验证警告。</div>`}
  </section>`;
}

function renderVersions(card: CatalogCard): string {
  return `<section class="tab-panel versions-panel" role="tabpanel"><div class="panel-heading"><h2>Published versions</h2><p>Snapshot 中记录的不可变版本与来源。</p></div><div class="version-table" role="table">
    <div class="version-table-head" role="row"><span>Version</span><span>Profile</span><span>Source</span><span>Release</span></div>
    ${card.versions.map((version) => `<div class="version-table-row" role="row"><strong>${escapeHtml(version.version)}</strong><code>${escapeHtml(version.renderProfile)}</code><code>${escapeHtml(version.source.commit.slice(0, 12))}</code>${externalLink(version.release?.tag ?? "Artifact", version.release?.url ?? version.artifact.url)}</div>`).join("")}
  </div></section>`;
}

function renderDetail(): string {
  const { selectedCard: card, selectedVersion: version, artifact } = state;
  if (!card || !version || !artifact) return renderLoading();
  let panel = renderPreview(artifact, version);
  if (state.tab === "contract") panel = renderJsonPanel("Data contract", `${artifact.card.id}@${artifact.card.version} 的 JSON Schema。`, artifact.dataContract);
  if (state.tab === "validation") panel = renderValidation(artifact);
  if (state.tab === "versions") panel = renderVersions(card);
  return `<main class="detail-pane">${renderHeader(card, version, artifact)}${renderTabs()}${panel}</main>`;
}

function render(): void {
  if (state.loading && !state.snapshot) {
    root.innerHTML = `<div class="app-shell"><div class="loading-sidebar"></div>${renderLoading()}</div>`;
  } else if (state.error && !state.snapshot) {
    root.innerHTML = `<div class="app-shell"><div class="loading-sidebar"></div>${renderError()}</div>`;
  } else {
    root.innerHTML = `<div class="app-shell">${renderSidebar()}${state.error ? renderError() : renderDetail()}</div>`;
  }
  bindEvents();
}

async function selectVersion(version: CatalogVersion): Promise<void> {
  const request = ++artifactRequest;
  state.selectedVersion = version;
  state.artifact = undefined;
  state.error = undefined;
  state.loading = true;
  render();
  try {
    const artifact = await loadCardArtifact(version.reference, version.artifact.sha256);
    if (request !== artifactRequest) return;
    state.artifact = artifact;
    state.view = Object.keys(artifact.views)[0];
    state.sample = state.view ? artifact.views[state.view].samples[0]?.name : undefined;
  } catch (error) {
    if (request !== artifactRequest) return;
    state.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (request === artifactRequest) {
      state.loading = false;
      render();
    }
  }
}

async function selectCard(card: CatalogCard): Promise<void> {
  state.selectedCard = card;
  const version = card.versions.find((candidate) => candidate.version === card.latest) ?? card.versions[0];
  if (!version) throw new Error(`Catalog card ${card.id} does not contain a version`);
  await selectVersion(version);
}

async function loadCatalog(): Promise<void> {
  artifactRequest += 1;
  state.snapshot = undefined;
  state.selectedCard = undefined;
  state.selectedVersion = undefined;
  state.artifact = undefined;
  state.error = undefined;
  state.loading = true;
  render();
  try {
    const snapshot = await loadCatalogSnapshot();
    state.snapshot = snapshot;
    if (snapshot.cards.length === 0) throw new Error("Catalog snapshot does not contain cards");
    state.loading = false;
    await selectCard(snapshot.cards[0]);
  } catch (error) {
    state.loading = false;
    state.error = error instanceof Error ? error.message : String(error);
    render();
  }
}

function bindEvents(): void {
  document.querySelector<HTMLInputElement>("#catalog-search")?.addEventListener("input", (event) => {
    state.filter = (event.currentTarget as HTMLInputElement).value;
    render();
    document.querySelector<HTMLInputElement>("#catalog-search")?.focus();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-card-id]").forEach((button) => button.addEventListener("click", () => {
    const card = state.snapshot?.cards.find((candidate) => candidate.id === button.dataset.cardId);
    if (card) void selectCard(card);
  }));
  document.querySelector<HTMLSelectElement>("#version-select")?.addEventListener("change", (event) => {
    const version = state.selectedCard?.versions.find((candidate) => candidate.reference === (event.currentTarget as HTMLSelectElement).value);
    if (version) void selectVersion(version);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    state.tab = button.dataset.tab as TabName;
    render();
  }));
  document.querySelector<HTMLSelectElement>("#view-select")?.addEventListener("change", (event) => {
    state.view = (event.currentTarget as HTMLSelectElement).value;
    state.sample = state.artifact?.views[state.view]?.samples[0]?.name;
    render();
  });
  document.querySelector<HTMLSelectElement>("#sample-select")?.addEventListener("change", (event) => {
    state.sample = (event.currentTarget as HTMLSelectElement).value;
    render();
  });
  document.querySelector<HTMLButtonElement>("#retry-load")?.addEventListener("click", () => void loadCatalog());
}

void loadCatalog();
