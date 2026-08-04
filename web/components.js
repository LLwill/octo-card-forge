const sectionsRoot = document.querySelector("#baselineSections");
const status = document.querySelector("#baselineStatus");
const baselineVersion = document.querySelector("#baselineVersion");
const groupCountLabel = document.querySelector("#groupCount");
const sectionCountLabel = document.querySelector("#sectionCount");
const utilityCountLabel = document.querySelector("#utilityCount");
const sdkVersion = document.querySelector("#sdkVersion");
const cardVersion = document.querySelector("#cardVersion");
const elementCount = document.querySelector("#elementCount");
const actionCount = document.querySelector("#actionCount");
const searchInput = document.querySelector("#componentSearch");
const searchTrigger = document.querySelector("#searchTrigger");
const themeToggle = document.querySelector("#themeToggle");
let previewWidth = 640;
let activeFilter = "all";
let baseline;
let locale = localStorage.getItem("octo-card-locale") === "en" ? "en" : "zh";

const componentCopy = {
  zh: {
    navCards: "卡片", navComponents: "组件", navInstall: "安装", eyebrow: "当前基线", title: "标准卡片组件",
    description: "把 Adaptive Card 的元素、语义和 utility 收进一套可检索的视觉词典。每个条目都由当前 Render Profile 实时渲染。",
    search: "按组件名称、token 或描述搜索…", all: "全部", foundation: "基础能力", adaptive: "Adaptive Cards", utilities: "Utilities", patterns: "组合模式",
    width: "卡片宽度", profileSystem: "PROFILE SYSTEM", profileTitle: "当前 Render Profile", profileDescription: "所有标准卡片和 utility specimen 共用同一份 HostConfig 与 Profile CSS。",
    sdk: "Adaptive Cards SDK", maxVersion: "最大卡片版本", elements: "支持的元素", actions: "支持的动作", loading: "正在加载组件基线…",
    copy: "复制 JSON", copied: "已复制", copyFailed: "复制失败", viewJson: "查看标准 Adaptive Card JSON", json: "JSON",
    live: "实时 Adaptive Card 预览", status: "个分区 ·", specimens: "个样例 · 当前基线已加载", shown: "显示", of: "/", noTitle: "没有找到组件", noBody: "请尝试其他搜索词或分类。",
    categories: { foundation: "基础能力", components: "Adaptive Cards", utilities: "Utility token", patterns: "组合模式" }
  },
  en: {
    navCards: "Cards", navComponents: "Components", navInstall: "Install", eyebrow: "CURRENT BASELINE", title: "Standard card components",
    description: "A searchable visual dictionary for Adaptive Card elements, semantics, and utilities. Every specimen is rendered by the current Render Profile.",
    search: "Search by component name, token, or description…", all: "All", foundation: "Foundation", adaptive: "Adaptive Cards", utilities: "Utilities", patterns: "Patterns",
    width: "Card width", profileSystem: "PROFILE SYSTEM", profileTitle: "Current Render Profile", profileDescription: "Standard cards and utility specimens share the same HostConfig and Profile CSS.",
    sdk: "Adaptive Cards SDK", maxVersion: "Max card version", elements: "Allowed elements", actions: "Allowed actions", loading: "Loading component baseline…",
    copy: "Copy JSON", copied: "Copied", copyFailed: "Copy failed", viewJson: "View standard Adaptive Card JSON", json: "JSON",
    live: "Live Adaptive Card preview", status: "sections ·", specimens: "specimens · current baseline loaded", shown: "Showing", of: "of", noTitle: "No components found", noBody: "Try another search or category.",
    categories: { foundation: "Foundation", components: "Adaptive Cards", utilities: "Utility token", patterns: "Composition pattern" }
  }
};

function ct(key) { return componentCopy[locale][key] || key; }

function applyComponentLocale() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-locale]").forEach((button) => {
    button.classList.toggle("active", button.dataset.locale === locale);
    button.setAttribute("aria-pressed", button.dataset.locale === locale ? "true" : "false");
  });
  const text = {
    ".brand-nav nav a[data-nav='cards']": ct("navCards"), ".brand-nav nav a[data-nav='components']": ct("navComponents"), ".brand-nav nav a[data-nav='install']": ct("navInstall"),
    ".component-hero .eyebrow span:last-child": ct("eyebrow"), "#pageTitle": ct("title"), ".hero-copy": ct("description"),
    "#componentSearch": ct("search"), "[data-filter='all']": ct("all"), "[data-filter='foundation']": ct("foundation"),
    "[data-filter='components']": ct("adaptive"), "[data-filter='utilities']": ct("utilities"), "[data-filter='patterns']": ct("patterns"),
    ".width-label": ct("width"), ".section-intro .eyebrow": ct("profileSystem"), "#systemHeading": ct("profileTitle"),
    ".section-intro > p:last-child": ct("profileDescription")
  };
  for (const [selector, value] of Object.entries(text)) {
    const element = document.querySelector(selector);
    if (!element) continue;
    if (selector === "#componentSearch") element.placeholder = value;
    else element.textContent = value;
  }
  const profileLabels = [ct("sdk"), ct("maxVersion"), ct("elements"), ct("actions")];
  document.querySelectorAll(".profile-overview div > span").forEach((element, index) => {
    if (profileLabels[index]) element.textContent = profileLabels[index];
  });
  const searchButton = document.querySelector("#searchTrigger");
  if (searchButton) searchButton.setAttribute("aria-label", locale === "zh" ? "搜索组件" : "Search components");
  const searchLabel = document.querySelector(".search-trigger-label");
  if (searchLabel) searchLabel.textContent = locale === "zh" ? "搜索组件" : "Search components";
}

document.querySelectorAll("[data-locale]").forEach((button) => button.addEventListener("click", () => {
  locale = button.dataset.locale === "en" ? "en" : "zh";
  localStorage.setItem("octo-card-locale", locale);
  applyComponentLocale();
  renderSections();
}));
applyComponentLocale();

AdaptiveCards.AdaptiveCard.onProcessMarkdown = (text, result) => {
  result.outputHtml = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  result.didProcess = true;
};

async function json(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "组件基线加载失败");
  return body;
}

function categoryForGroup(group) {
  return {
    foundation: "foundation",
    "adaptive-card-components": "components",
    "octo-utility-tokens": "utilities",
    "composition-patterns": "patterns",
  }[group.id] || "components";
}

function categoryLabel(category) {
  return componentCopy[locale].categories[category] || category;
}

function sectionSearchText(section) {
  return [
    section.id,
    section.title,
    section.description,
    JSON.stringify(section.rows || []),
    JSON.stringify(section.utilityTokens || []),
    JSON.stringify(section.card || {}),
  ].join(" ").toLowerCase();
}

function sectionMatches(section, category) {
  const query = searchInput.value.trim().toLowerCase();
  return (activeFilter === "all" || activeFilter === category) &&
    (!query || sectionSearchText(section).includes(query));
}

function applyWidth() {
  document.documentElement.style.setProperty("--baseline-preview-width", `${previewWidth}px`);
}

function renderJsonDetails(summaryText, jsonValue) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  const code = document.createElement("pre");
  code.textContent = JSON.stringify(jsonValue, null, 2);
  details.append(summary, code);
  return details;
}

function copyJsonButton(jsonValue) {
  const button = document.createElement("button");
  button.className = "copy-button";
  button.type = "button";
  button.textContent = ct("copy");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard?.writeText(JSON.stringify(jsonValue, null, 2));
      button.textContent = ct("copied");
      window.setTimeout(() => { button.textContent = ct("copy"); }, 1200);
    } catch {
      button.textContent = ct("copyFailed");
      window.setTimeout(() => { button.textContent = ct("copy"); }, 1200);
    }
  });
  return button;
}

function renderCardPreview(cardJson, sectionTitle, sectionId) {
  const shell = document.createElement("div");
  shell.className = "baseline-preview-shell";
  const preview = document.createElement("div");
  preview.className = "baseline-preview octo-card-profile";
  preview.dataset.baselineSection = sectionId;

  const card = new AdaptiveCards.AdaptiveCard();
  card.hostConfig = new AdaptiveCards.HostConfig(baseline.hostConfig);
  card.onExecuteAction = (action) => {
    status.textContent = `${sectionTitle} · ${action.getJsonTypeName()} · 本地预览未发送`;
  };
  card.parse(cardJson);
  preview.replaceChildren(card.render());

  shell.append(preview);
  return shell;
}

function renderSectionHeader(section, index, category, jsonValue) {
  const header = document.createElement("header");
  header.className = "component-entry-header";
  const headingGroup = document.createElement("div");
  headingGroup.className = "component-heading-group";
  const indexLabel = document.createElement("span");
  indexLabel.className = "component-index";
  indexLabel.textContent = String(index).padStart(2, "0");
  const headingCopy = document.createElement("div");
  const categoryElement = document.createElement("p");
  categoryElement.className = "component-category";
  categoryElement.textContent = categoryLabel(category);
  const heading = document.createElement("h2");
  heading.textContent = section.title;
  headingCopy.append(categoryElement, heading);
  headingGroup.append(indexLabel, headingCopy);
  header.append(headingGroup);
  if (jsonValue) header.append(copyJsonButton(jsonValue));
  return header;
}

function renderAdaptiveSection(section, index, category) {
  const article = document.createElement("article");
  article.className = "baseline-section adaptive-section";
  article.id = section.id;
  article.append(renderSectionHeader(section, index, category, section.card));

  const description = document.createElement("p");
  description.className = "component-description";
  description.textContent = section.description;
  article.append(description, renderCardPreview(section.card, section.title, section.id));
  article.append(renderJsonDetails(ct("viewJson"), section.card));
  return article;
}

function renderFoundationPreview(row) {
  const preview = document.createElement("div");
  preview.className = `style-preview style-preview-${row.preview}`;
  if (row.preview === "color") {
    preview.dataset.color = row.name.toLowerCase();
    const swatch = document.createElement("span");
    const label = document.createElement("b");
    label.textContent = row.name;
    preview.append(swatch, label);
    return preview;
  }
  if (row.preview === "spacing") {
    preview.dataset.size = row.name.toLowerCase();
    preview.append(document.createElement("span"), document.createElement("span"));
    return preview;
  }
  if (row.preview === "radius") {
    preview.dataset.radius = row.name.includes("card") ? "card" : "container";
    preview.textContent = row.value;
    return preview;
  }
  preview.textContent = row.name;
  preview.dataset.text = row.name.toLowerCase();
  return preview;
}

function renderMatrixSection(section, index, category) {
  const article = document.createElement("article");
  article.className = "baseline-section matrix-section";
  article.id = section.id;
  article.append(renderSectionHeader(section, index, category));
  const description = document.createElement("p");
  description.className = "component-description";
  description.textContent = section.description;
  const table = document.createElement("div");
  table.className = "style-matrix";
  for (const row of section.rows || []) {
    const item = document.createElement("div");
    item.className = "style-matrix-row";
    const name = document.createElement("code");
    name.textContent = row.name;
    const preview = renderFoundationPreview(row);
    const rowDescription = document.createElement("p");
    rowDescription.textContent = row.description;
    const value = document.createElement("span");
    value.textContent = row.value;
    item.append(name, preview, rowDescription, value);
    table.append(item);
  }
  article.append(description, table);
  return article;
}

function renderUtilityPreview(token) {
  const shell = document.createElement("div");
  shell.className = "utility-preview";
  if (token.token === "badge-warning") {
    const badge = document.createElement("span");
    badge.className = "utility-preview-badge warning";
    badge.textContent = "Warning badge";
    shell.append(badge);
    return shell;
  }
  if (token.token === "line-skeleton" || token.token === "motion-shimmer") {
    const stack = document.createElement("div");
    stack.className = "utility-preview-skeleton";
    if (token.token === "motion-shimmer") stack.classList.add("shimmer");
    stack.append(document.createElement("span"), document.createElement("span"));
    shell.append(stack);
    return shell;
  }
  const block = document.createElement("div");
  block.className = "utility-preview-block";
  if (token.token === "surface-warning") block.classList.add("warning");
  if (token.token === "inset-md") block.classList.add("inset");
  if (token.token === "motion-fade-in") block.classList.add("fade-in");
  const title = document.createElement("strong");
  title.textContent = token.token;
  const text = document.createElement("span");
  text.textContent = token.token === "inset-md" ? "12px inset" : "content surface";
  block.append(title, text);
  shell.append(block);
  return shell;
}

function renderUtilityToken(token) {
  const item = document.createElement("div");
  item.className = "utility-token-row";
  const identity = document.createElement("div");
  identity.className = "utility-token-identity";
  const name = document.createElement("code");
  name.textContent = token.token;
  const group = document.createElement("span");
  group.textContent = token.group;
  identity.append(name, group);
  const description = document.createElement("p");
  description.textContent = token.description;
  const meta = document.createElement("dl");
  const appliesTerm = document.createElement("dt");
  appliesTerm.textContent = "appliesTo";
  const appliesValue = document.createElement("dd");
  appliesValue.textContent = token.appliesTo.join(", ");
  meta.append(appliesTerm, appliesValue);
  if (token.fallback) {
    const fallbackTerm = document.createElement("dt");
    fallbackTerm.textContent = "fallback";
    const fallbackValue = document.createElement("dd");
    fallbackValue.textContent = JSON.stringify(token.fallback);
    meta.append(fallbackTerm, fallbackValue);
  }
  const info = document.createElement("div");
  info.className = "utility-token-info";
  info.append(identity, description, meta, renderJsonDetails("JSON", token.card));
  item.append(info, renderUtilityPreview(token));
  return item;
}

function renderUtilitySection(section, index, category) {
  const article = document.createElement("article");
  article.className = "baseline-section utility-section";
  article.id = section.id;
  article.append(renderSectionHeader(section, index, category));
  const description = document.createElement("p");
  description.className = "component-description";
  description.textContent = section.description;
  const grid = document.createElement("div");
  grid.className = "utility-token-grid";
  for (const token of section.utilityTokens || []) grid.append(renderUtilityToken(token));
  article.append(description, grid);
  return article;
}

function renderSection(section, index, category) {
  if (section.rows) return renderMatrixSection(section, index, category);
  if (section.utilityTokens) return renderUtilitySection(section, index, category);
  return renderAdaptiveSection(section, index, category);
}

function renderSections() {
  sectionsRoot.replaceChildren();
  let renderedGroups = 0;
  let renderedSections = 0;
  for (const group of baseline.groups || []) {
    const category = categoryForGroup(group);
    const sections = group.sections.filter((section) => sectionMatches(section, category));
    if (!sections.length) continue;
    renderedGroups += 1;
    const groupSection = document.createElement("section");
    groupSection.className = "baseline-group";
    groupSection.id = group.id;
    const groupHeader = document.createElement("header");
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = categoryLabel(category);
    const heading = document.createElement("h2");
    heading.textContent = group.title;
    const description = document.createElement("p");
    description.textContent = group.description;
    groupHeader.append(eyebrow, heading, description);
    const groupBody = document.createElement("div");
    groupBody.className = "baseline-group-sections";
    sections.forEach((section, index) => groupBody.append(renderSection(section, index + 1, category)));
    groupSection.append(groupHeader, groupBody);
    sectionsRoot.append(groupSection);
    renderedSections += sections.length;
  }
  if (!renderedSections) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = ct("noTitle");
    const body = document.createElement("span");
    body.textContent = ct("noBody");
    empty.append(title, body);
    sectionsRoot.append(empty);
  }
  const totalSections = (baseline.groups || []).reduce((count, group) => count + group.sections.length, 0);
  status.textContent = renderedSections === totalSections && activeFilter === "all" && !searchInput.value.trim()
    ? `${renderedGroups} ${ct("status")} ${renderedSections} ${ct("specimens")}`
    : `${ct("shown")} ${renderedSections} ${ct("of")} ${totalSections} ${locale === "zh" ? "个样例" : "specimens"}`;
  applyWidth();
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("octo-card-theme", theme);
  const nextThemeLabel = theme === "dark" ? "切换到亮色主题" : "切换到暗色主题";
  themeToggle.dataset.theme = theme;
  themeToggle.setAttribute("aria-label", nextThemeLabel);
  themeToggle.title = nextThemeLabel;
  const iconHost = themeToggle.querySelector("[data-theme-icon]");
  if (iconHost) {
    const icon = document.createElement("i");
    icon.dataset.lucide = theme === "dark" ? "sun" : "moon";
    iconHost.replaceChildren(icon);
    window.lucide?.createIcons({ attrs: { "stroke-width": "1.8" } });
  }
}

async function start() {
  baseline = await json("/api/component-baseline");
  const groups = baseline.groups || [];
  const sections = groups.flatMap((group) => group.sections);
  const utilityCount = sections.reduce((count, section) => count + (section.utilityTokens?.length || 0), 0);
  baselineVersion.textContent = baseline.reference;
  groupCountLabel.textContent = groups.length;
  sectionCountLabel.textContent = sections.length;
  utilityCountLabel.textContent = utilityCount;
  sdkVersion.textContent = baseline.renderProfile.adaptiveCardsSdkVersion;
  cardVersion.textContent = baseline.capabilities.maxAdaptiveCardVersion;
  elementCount.textContent = baseline.capabilities.allowedElements.length;
  actionCount.textContent = baseline.capabilities.allowedActions.length;
  const profileStyle = document.createElement("link");
  profileStyle.rel = "stylesheet";
  profileStyle.href = baseline.stylesheetUrl;
  document.head.append(profileStyle);
  renderSections();
}

for (const button of document.querySelectorAll("[data-baseline-width]")) {
  button.addEventListener("click", () => {
    document.querySelector("[data-baseline-width].active")?.classList.remove("active");
    button.classList.add("active");
    previewWidth = Number(button.dataset.baselineWidth);
    applyWidth();
  });
}

for (const button of document.querySelectorAll("[data-filter]")) {
  button.addEventListener("click", () => {
    document.querySelector("[data-filter].active")?.classList.remove("active");
    button.classList.add("active");
    for (const other of document.querySelectorAll("[data-filter]")) {
      other.setAttribute("aria-selected", other === button ? "true" : "false");
    }
    activeFilter = button.dataset.filter;
    renderSections();
  });
}

searchInput.addEventListener("input", renderSections);
searchTrigger.addEventListener("click", () => searchInput.focus());
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape" && document.activeElement === searchInput) searchInput.blur();
});

const savedTheme = localStorage.getItem("octo-card-theme");
setTheme(savedTheme === "dark" ? "dark" : "light");
themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

start().catch((error) => {
  status.textContent = error instanceof Error ? error.message : String(error);
  status.dataset.state = "error";
});
