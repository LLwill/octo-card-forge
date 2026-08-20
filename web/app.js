import { createPreviewClient, PreviewApiError } from "./preview-kit.js";

const catalogView = document.querySelector("#catalogView");
const detailView = document.querySelector("#detailView");
const cardGrid = document.querySelector("#cardGrid");
const cardSearch = document.querySelector("#cardSearch");
const catalogStatus = document.querySelector("#catalogStatus");
const catalogCount = document.querySelector("#catalogCount");
const viewCount = document.querySelector("#viewCount");
const sampleCount = document.querySelector("#sampleCount");
const detailTitle = document.querySelector("#detailTitle");
const detailDescription = document.querySelector("#detailDescription");
const detailReference = document.querySelector("#detailReference");
const detailMeta = document.querySelector("#detailMeta");
const detailStatus = document.querySelector("#detailStatus");
const detailCardSelect = document.querySelector("#detailCardSelect");
const detailVersionSwitcher = document.querySelector("#detailVersionSwitcher");
const detailVersionSelect = document.querySelector("#detailVersionSelect");
const sampleTabs = document.querySelector("#sampleTabs");
const detailPreview = document.querySelector("#detailPreview");
const sampleSelect = document.querySelector("#sampleSelect");
const dataEditor = document.querySelector("#dataEditor");
const template = document.querySelector("#template");
const payload = document.querySelector("#payload");
const contract = document.querySelector("#contract");
const editorMessage = document.querySelector("#editorMessage");
const exportButton = document.querySelector("#exportButton");
const homeThemeToggle = document.querySelector("#homeThemeToggle");
const basePath = window.__OCTO_BASE_PATH__ || "";
const previewClient = createPreviewClient({ baseUrl: basePath });
let cards = [];
let catalogItems = [];
let cardGroups = new Map();
let currentCard;
let currentSession;
let currentHostConfig;
let currentView;
let hostStyle;
let detailWidth = 640;
let locale = localStorage.getItem("octo-card-locale") === "en" ? "en" : "zh";

const copy = {
  zh: {
    "nav.cards": "卡片", "nav.components": "组件", "nav.install": "安装",
    "catalog.eyebrow": "卡片目录", "catalog.title": "成品卡片",
    "catalog.description": "浏览当前基线下可交付的卡片成品。选择一张进入预览、编辑和验证。",
    "catalog.search": "按名称或 ID 搜索卡片…", "catalog.loading": "正在加载成品卡片…",
    "filters.all": "全部", "filters.ai": "AI", "filters.documents": "文档",
    "stats.cards": "张卡片", "stats.views": "个视图", "stats.samples": "个样例",
    "detail.allCards": "全部卡片", "detail.card": "卡片", "detail.version": "版本", "detail.eyebrow": "卡片详情",
    "detail.export": "导出交付包", "detail.liveOutput": "实时输出", "detail.preview": "卡片预览",
    "detail.renderState": "渲染状态", "detail.viewModel": "视图模型", "detail.editData": "编辑样例数据",
    "detail.reassemble": "重新组装卡片", "detail.contract": "查看数据契约",
    "detail.template": "Adaptive Card 模板", "detail.finalJson": "最终 Adaptive Card JSON",
    "status.loading": "正在加载…", "status.assembling": "组装中…", "status.ready": "就绪",
    "status.validated": "校验通过", "status.checkJson": "请检查 JSON", "status.cards": "张成品卡片 · 当前基线",
    "status.shown": "张卡片 · 共", "status.shownSuffix": "张",
    "card.ai": "AI 工作流", "card.docs": "文档工作流", "card.draft": "草稿", "card.release": "发布版", "card.open": "打开详情 ↗",
    "card.views": "个视图", "card.samples": "个样例", "empty.title": "没有找到卡片", "empty.body": "请尝试其他搜索词或分类。",
    "meta.version": "卡片版本", "meta.contract": "契约版本", "meta.adaptive": "Adaptive Cards", "meta.profile": "Render Profile",
    "errors.selectSample": "请选择一个样例状态", "errors.export": "导出失败"
  },
  en: {
    "nav.cards": "Cards", "nav.components": "Components", "nav.install": "Install",
    "catalog.eyebrow": "CARD CATALOG", "catalog.title": "Finished cards",
    "catalog.description": "Browse deliverable cards under the current baseline. Open one to preview, edit, and validate.",
    "catalog.search": "Search cards by name or ID…", "catalog.loading": "Loading finished cards…",
    "filters.all": "All", "filters.ai": "AI", "filters.documents": "Documents",
    "stats.cards": "cards", "stats.views": "views", "stats.samples": "samples",
    "detail.allCards": "All cards", "detail.card": "Card", "detail.version": "Version", "detail.eyebrow": "CARD DETAIL",
    "detail.export": "Export handoff", "detail.liveOutput": "LIVE OUTPUT", "detail.preview": "Card preview",
    "detail.renderState": "Render state", "detail.viewModel": "VIEW MODEL", "detail.editData": "Edit sample data",
    "detail.reassemble": "Reassemble card", "detail.contract": "View data contract",
    "detail.template": "Adaptive Card template", "detail.finalJson": "Final Adaptive Card JSON",
    "status.loading": "Loading…", "status.assembling": "Assembling…", "status.ready": "Ready",
    "status.validated": "Validated", "status.checkJson": "Check JSON", "status.cards": "finished cards · current baseline",
    "status.shown": "of", "status.shownSuffix": "cards",
    "card.ai": "AI WORKFLOW", "card.docs": "DOCUMENT WORKFLOW", "card.draft": "DRAFT", "card.release": "RELEASE", "card.open": "Open details ↗",
    "card.views": "views", "card.samples": "samples", "empty.title": "No cards found", "empty.body": "Try another search or category.",
    "meta.version": "Card version", "meta.contract": "Contract", "meta.adaptive": "Adaptive Cards", "meta.profile": "Render profile",
    "errors.selectSample": "Select a sample state", "errors.export": "Export failed"
  }
};

function t(key) { return copy[locale][key] || copy.en[key] || key; }

function publicUrl(path) { return `${basePath}${path}`; }

function applyLocale() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-locale]").forEach((button) => button.classList.toggle("active", button.dataset.locale === locale));
  const staticText = {
    ".brand-nav nav a[data-nav='cards']": "nav.cards", ".brand-nav nav a[data-nav='components']": "nav.components", ".brand-nav nav a[data-nav='install']": "nav.install",
    "#catalogTitle": "catalog.title", ".home-hero-copy > p:not(.eyebrow)": "catalog.description",
    "#backToCatalog span:not([aria-hidden])": "detail.allCards", "#detailEyebrow": "detail.eyebrow",
    "#detailCardLabel": "detail.card", "#detailVersionLabel": "detail.version",
    "#exportButton": "detail.export", "#previewHeading": "detail.preview", ".sample-switcher > span": "detail.renderState",
    "#editorHeading": "detail.editData", ".detail-editor-panel .eyebrow": "detail.viewModel",
    "#renderButton": "detail.reassemble", ".contract-details summary": "detail.contract",
    ".detail-json-panels details:first-child summary": "detail.template", ".detail-json-panels details:last-child summary": "detail.finalJson"
  };
  for (const [selector, key] of Object.entries(staticText)) {
    const element = document.querySelector(selector);
    if (element) element.textContent = t(key);
  }
  const cardsNav = document.querySelector(".brand-nav nav a[data-nav='cards']");
  const componentsNav = document.querySelector(".brand-nav nav a[data-nav='components']");
  const installNav = document.querySelector(".brand-nav nav a[data-nav='install']");
  if (cardsNav) cardsNav.textContent = locale === "zh" ? "卡片" : "Cards";
  if (componentsNav) componentsNav.textContent = locale === "zh" ? "组件" : "Components";
  if (installNav) installNav.textContent = t("nav.install");
  const title = document.querySelector(".home-hero .eyebrow span:last-child");
  if (title) title.textContent = t("catalog.eyebrow");
  document.querySelector("#cardSearch")?.setAttribute("placeholder", t("catalog.search"));
  document.querySelector("#catalogStatus")?.setAttribute("data-i18n", "catalog.loading");
  for (const [selector, key] of [["[data-filter='all']", "filters.all"], ["[data-filter='ai']", "filters.ai"], ["[data-filter='docs']", "filters.documents"]]) {
    const element = document.querySelector(selector);
    if (element) element.textContent = t(key);
  }
  for (const element of document.querySelectorAll("[data-stat-label]")) {
    const key = element.dataset.statLabel;
    if (key) element.textContent = t(`stats.${key}`);
  }
  document.querySelectorAll("[data-locale]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.locale === locale ? "true" : "false"));
  localStorage.setItem("octo-card-locale", locale);
}

document.querySelectorAll("[data-locale]").forEach((button) => button.addEventListener("click", () => {
  locale = button.dataset.locale === "en" ? "en" : "zh";
  applyLocale();
  renderCatalog();
  if (currentCard) populateDetailMeta(currentCard);
}));
applyLocale();

AdaptiveCards.AdaptiveCard.onProcessMarkdown = (text, result) => {
  result.outputHtml = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  result.didProcess = true;
};

async function json(url, init) {
  const response = await fetch(publicUrl(url), init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || JSON.stringify(body.errors || body));
  return body;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("octo-card-theme", theme);
  const nextThemeLabel = theme === "dark" ? "切换到亮色主题" : "切换到暗色主题";
  homeThemeToggle.dataset.theme = theme;
  homeThemeToggle.setAttribute("aria-label", nextThemeLabel);
  homeThemeToggle.title = nextThemeLabel;
  const iconHost = homeThemeToggle.querySelector("[data-theme-icon]");
  if (iconHost) {
    const icon = document.createElement("i");
    icon.dataset.lucide = theme === "dark" ? "sun" : "moon";
    iconHost.replaceChildren(icon);
    window.lucide?.createIcons({ attrs: { "stroke-width": "1.8" } });
  }
}

function cardKind(card) {
  return card.id.startsWith("ai.") ? "ai" : "docs";
}

function packageKindLabel(card) {
  return card.kind === "draft" ? t("card.draft") : t("card.release");
}

function preferCardVersion(candidate, current) {
  const versionOrder = candidate.version.localeCompare(current.version, undefined, { numeric: true });
  if (versionOrder !== 0) return versionOrder > 0;
  return candidate.kind === "release" && current.kind === "draft";
}

function firstSample(card) {
  const [view, samples] = Object.entries(card.samples)[0] || [];
  return { view, sample: samples?.[0] };
}

function cardMatches(item) {
  const query = cardSearch.value.trim().toLowerCase();
  const matchesFilter = document.querySelector("[data-filter].active")?.dataset.filter || "all";
  const searchable = `${item.card.id} ${item.card.name} ${item.versions.map((card) => `${card.version} ${card.contractVersion}`).join(" ")}`.toLowerCase();
  return (matchesFilter === "all" || matchesFilter === cardKind(item.card)) &&
    (!query || searchable.includes(query));
}

function createCardElement(payload, hostConfig, onAction = () => {}) {
  const card = new AdaptiveCards.AdaptiveCard();
  card.hostConfig = new AdaptiveCards.HostConfig(hostConfig);
  card.onExecuteAction = onAction;
  card.parse(payload);
  return card.render();
}

function cardPreview(item) {
  const preview = document.createElement("div");
  preview.className = "catalog-preview octo-card-profile";
  preview.replaceChildren(createCardElement(item.result.payload, item.hostConfig));
  return preview;
}

function renderCatalog() {
  cardGrid.replaceChildren();
  const visible = catalogItems.filter(cardMatches);
  for (const [index, item] of visible.entries()) {
    const entry = document.createElement("article");
    entry.className = "card-catalog-entry";
    entry.tabIndex = 0;
    entry.dataset.reference = item.card.reference;
    const header = document.createElement("header");
    const category = document.createElement("p");
    category.className = "card-category";
    category.textContent = cardKind(item.card) === "ai" ? t("card.ai") : t("card.docs");
    const title = document.createElement("h2");
    title.textContent = item.card.name;
    const id = document.createElement("code");
    id.textContent = item.card.id;
    header.append(category, title, id);
    const previewShell = document.createElement("div");
    previewShell.className = "catalog-preview-shell";
    previewShell.append(cardPreview(item));
    const footer = document.createElement("footer");
    const meta = document.createElement("span");
    meta.textContent = `${packageKindLabel(item.card)} · ${item.card.version} · ${Object.keys(item.card.samples).length} ${t("card.views")} · ${item.sampleCount} ${t("card.samples")}`;
    const open = document.createElement("a");
    open.className = "card-open-link";
    open.href = publicUrl(`/?card=${encodeURIComponent(item.card.reference)}`);
    open.textContent = t("card.open");
    footer.append(meta, open);
    entry.append(header, previewShell, footer);
    entry.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("a,button")) return;
      openCard(item.card.reference);
    });
    entry.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openCard(item.card.reference);
      }
    });
    cardGrid.append(entry);
    if (index === 0) entry.classList.add("featured-card");
  }
  catalogStatus.textContent = visible.length === catalogItems.length && !cardSearch.value.trim()
    ? `${visible.length} ${t("status.cards")}`
    : locale === "zh" ? `${visible.length} ${t("status.shownSuffix")} · 共 ${catalogItems.length} ${t("status.shownSuffix")}` : `${visible.length} ${t("status.shown")} ${catalogItems.length} ${t("status.shownSuffix")}`;
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "catalog-empty";
    const title = document.createElement("strong");
    title.textContent = t("empty.title");
    const body = document.createElement("span");
    body.textContent = t("empty.body");
    empty.append(title, body);
    cardGrid.append(empty);
  }
}

function setHostStyle(css) {
  if (hostStyle) hostStyle.remove();
  hostStyle = document.createElement("style");
  hostStyle.dataset.previewProfile = "true";
  hostStyle.textContent = css;
  document.head.append(hostStyle);
}

function setDetailStatus(message, state = "") {
  detailStatus.textContent = message;
  detailStatus.dataset.state = state;
}

function updateDetailPreview(result) {
  detailPreview.style.width = `${detailWidth}px`;
  detailPreview.replaceChildren(createCardElement(result.payload, currentHostConfig, (action) => {
    setDetailStatus(`${action.getJsonTypeName()} · ${action.id || action.title || "local"}`);
  }));
}

function populateDetailMeta(card) {
  detailMeta.replaceChildren();
  const values = [
    [t("meta.version"), `${packageKindLabel(card)} · ${card.version}`],
    [t("meta.contract"), card.contractVersion],
    [t("meta.adaptive"), card.adaptiveCardVersion || currentSession.renderProfile.manifest.adaptiveCardsSdkVersion],
    [t("meta.profile"), currentSession.renderProfile.manifest.version],
  ];
  for (const [label, value] of values) {
    const item = document.createElement("div");
    const name = document.createElement("span");
    name.textContent = label;
    const content = document.createElement("strong");
    content.textContent = value;
    item.append(name, content);
    detailMeta.append(item);
  }
}

async function chooseSample() {
  const selected = sampleSelect.selectedOptions[0];
  if (!selected) return;
  for (const tab of sampleTabs.querySelectorAll("[data-sample]")) {
    const active = tab.dataset.sample === selected.value;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  }
  const result = await json(
    `/api/cards/${encodeURIComponent(currentCard.reference)}/samples/${encodeURIComponent(selected.value)}`
  );
  currentView = result.view;
  const templateResult = await json(
    `/api/cards/${encodeURIComponent(currentCard.reference)}/views/${encodeURIComponent(currentView)}/template`
  );
  dataEditor.value = JSON.stringify(result.data, null, 2);
  template.textContent = JSON.stringify(templateResult.template, null, 2);
  await renderCard(currentView);
}

function renderSampleTabs(card) {
  sampleTabs.replaceChildren();
  for (const [view, names] of Object.entries(card.samples)) {
    for (const name of names) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "sample-tab";
      tab.dataset.sample = name;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", "false");
      tab.title = `${view} / ${name}`;
      tab.textContent = name;
      tab.addEventListener("click", () => {
        sampleSelect.value = name;
        chooseSample().catch((error) => setDetailStatus(error.message, "error"));
      });
      sampleTabs.append(tab);
    }
  }
}

async function renderCard(view) {
  setDetailStatus(t("status.assembling"));
  editorMessage.textContent = "";
  try {
    const data = JSON.parse(dataEditor.value);
    const resolvedView = view || currentView;
    if (!resolvedView) throw new Error(t("errors.selectSample"));
    const result = await previewClient.render({
      cardId: currentCard.reference,
      revision: currentSession.revision,
      view: resolvedView,
      data,
    });
    if (!result.valid) {
      const issue = result.issues.find((item) => item.severity === "error");
      throw new Error(issue ? `${issue.code} ${issue.path}: ${issue.message}` : t("status.checkJson"));
    }
    updateDetailPreview(result);
    payload.textContent = JSON.stringify(result.payload, null, 2);
    setDetailStatus(`${t("status.validated")} · ${result.cardVersion}`);
    editorMessage.textContent = t("status.ready");
  } catch (error) {
    if (error instanceof PreviewApiError && error.code === "preview.stale_revision" && currentCard) {
      currentSession = await previewClient.getSession(currentCard.reference);
      setDetailStatus(locale === "zh" ? "内容已更新，请重新组装" : "Content changed; reassemble the card", "error");
      editorMessage.textContent = t("status.checkJson");
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    setDetailStatus(message, "error");
    editorMessage.textContent = t("status.checkJson");
  }
}

async function openCard(reference, replace = false) {
  const card = cards.find((item) => item.reference === reference);
  if (!card) return;
  const group = cardGroups.get(card.id) || { latest: card, versions: [card] };
  if (replace) history.replaceState({}, "", publicUrl(`/?card=${encodeURIComponent(reference)}`));
  else history.pushState({}, "", publicUrl(`/?card=${encodeURIComponent(reference)}`));
  currentCard = card;
  catalogView.hidden = true;
  detailView.hidden = false;
  detailCardSelect.value = group.latest.reference;
  detailVersionSelect.replaceChildren();
  for (const version of group.versions) {
    detailVersionSelect.add(new Option(`${packageKindLabel(version)} · ${version.version}`, version.reference));
  }
  detailVersionSelect.value = card.reference;
  detailVersionSwitcher.hidden = group.versions.length < 2;
  detailTitle.textContent = card.name;
  detailDescription.textContent = locale === "zh" ? "在当前 Render Profile 下查看样例状态、编辑 ViewModel 并验证最终 Adaptive Card。" : "Inspect sample states, edit ViewModel data, and validate the final Adaptive Card under the current Render Profile.";
  detailReference.textContent = card.id;
  const [session, hostConfig, profileStyles] = await Promise.all([
    previewClient.getSession(card.reference),
    previewClient.getHostConfig(card.reference),
    previewClient.getStyles(card.reference),
  ]);
  currentSession = session;
  currentHostConfig = hostConfig;
  setHostStyle(profileStyles);
  populateDetailMeta(card);
  contract.textContent = JSON.stringify(
    await json(`/api/cards/${encodeURIComponent(card.reference)}/contract`),
    null,
    2
  );
  sampleSelect.replaceChildren();
  for (const [view, names] of Object.entries(card.samples)) {
    for (const name of names) sampleSelect.add(new Option(`${view} / ${name}`, name));
  }
  renderSampleTabs(card);
  await chooseSample();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeCard() {
  history.pushState({}, "", publicUrl("/"));
  detailView.hidden = true;
  catalogView.hidden = false;
  currentCard = undefined;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function downloadHandoff() {
  if (!currentCard) return;
  setDetailStatus(locale === "zh" ? "正在生成交付包…" : "Building handoff package…");
  try {
    const response = await fetch(publicUrl(`/api/cards/${encodeURIComponent(currentCard.reference)}/handoff`));
    if (!response.ok) throw new Error((await response.json()).message || t("errors.export"));
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentCard.id}@${currentCard.version}.handoff.zip`;
    link.click();
    URL.revokeObjectURL(url);
    setDetailStatus(`Exported ${link.download}`);
  } catch (error) {
    setDetailStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

async function start() {
  const [cardData, hostConfig, profileStyles] = await Promise.all([
    json("/api/cards"),
    previewClient.getHostConfig(),
    previewClient.getStyles(),
  ]);
  cards = cardData;
  cardGroups = new Map();
  for (const card of cards) {
    const group = cardGroups.get(card.id) || { latest: card, versions: [] };
    group.versions.push(card);
    if (preferCardVersion(card, group.latest)) {
      group.latest = card;
    }
    cardGroups.set(card.id, group);
  }
  const latestCards = [...cardGroups.values()]
    .sort((a, b) => a.latest.id.localeCompare(b.latest.id))
    .map((group) => group.latest);
  for (const card of latestCards) {
    detailCardSelect.add(new Option(card.name, card.reference));
  }
  setHostStyle(profileStyles);
  catalogCount.textContent = latestCards.length;
  viewCount.textContent = latestCards.reduce((count, card) => count + Object.keys(card.samples).length, 0);
  sampleCount.textContent = latestCards.reduce(
    (count, card) => count + Object.values(card.samples).reduce((total, names) => total + names.length, 0),
    0
  );
  catalogItems = await Promise.all(latestCards.map(async (card) => {
    const selected = firstSample(card);
    const result = await json(
      `/api/cards/${encodeURIComponent(card.reference)}/samples/${encodeURIComponent(selected.sample)}`
    );
    return {
      card,
      result,
      hostConfig,
      versions: cardGroups.get(card.id).versions,
      sampleCount: Object.values(card.samples).reduce((total, names) => total + names.length, 0),
    };
  }));
  renderCatalog();
  const reference = new URLSearchParams(location.search).get("card");
  if (reference) {
    const canonicalCard = cards.find((card) => card.reference === reference)
      ?? (!reference.includes("@") ? cardGroups.get(reference)?.latest : undefined);
    if (canonicalCard) await openCard(canonicalCard.reference, true);
  }
}

cardSearch.addEventListener("input", renderCatalog);
document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("[data-filter].active")?.classList.remove("active");
    button.classList.add("active");
    document.querySelectorAll("[data-filter]").forEach((other) => {
      other.setAttribute("aria-selected", other === button ? "true" : "false");
    });
    renderCatalog();
  });
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    cardSearch.focus();
  }
});
document.querySelector("#backToCatalog").addEventListener("click", closeCard);
detailCardSelect.addEventListener("change", () => openCard(detailCardSelect.value));
detailVersionSelect.addEventListener("change", () => openCard(detailVersionSelect.value));
window.addEventListener("popstate", () => {
  const reference = new URLSearchParams(location.search).get("card");
  if (reference) openCard(reference, true);
  else closeCard();
});
sampleSelect.addEventListener("change", () => chooseSample().catch((error) => setDetailStatus(error.message, "error")));
document.querySelector("#renderButton").addEventListener("click", () => renderCard());
exportButton.addEventListener("click", downloadHandoff);
document.querySelectorAll("[data-detail-width]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector("[data-detail-width].active")?.classList.remove("active");
    button.classList.add("active");
    detailWidth = Number(button.dataset.detailWidth);
    detailPreview.style.width = `${detailWidth}px`;
  });
});

const savedTheme = localStorage.getItem("octo-card-theme");
setTheme(savedTheme === "dark" ? "dark" : "light");
homeThemeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

start().catch((error) => {
  catalogStatus.textContent = error instanceof Error ? error.message : String(error);
  catalogStatus.dataset.state = "error";
});
