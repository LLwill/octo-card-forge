const sectionsRoot = document.querySelector("#baselineSections");
const nav = document.querySelector("#baselineNav");
const status = document.querySelector("#baselineStatus");
const version = document.querySelector("#baselineVersion");
const profileReference = document.querySelector("#profileReference");
const sdkVersion = document.querySelector("#sdkVersion");
const cardVersion = document.querySelector("#cardVersion");
let previewWidth = 640;
let baseline;
let profileStyle;

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

function applyWidth() {
  for (const preview of document.querySelectorAll(
    ".baseline-preview:not(.utility-token-preview)"
  )) {
    preview.style.width = `${previewWidth}px`;
  }
}

function renderCardPreview(cardJson, sectionTitle, sectionId) {
  const shell = document.createElement("div");
  shell.className = "baseline-preview-shell";
  const preview = document.createElement("div");
  preview.className = "baseline-preview octo-card-profile";
  preview.dataset.baselineSection = sectionId;
  preview.style.width = `${previewWidth}px`;

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

function renderJsonDetails(summaryText, jsonValue) {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  const code = document.createElement("pre");
  code.textContent = JSON.stringify(jsonValue, null, 2);
  details.append(summary, code);
  return details;
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

function renderMatrixSection(section) {
  const article = document.createElement("article");
  article.className = "baseline-section matrix-section";
  article.id = section.id;

  const header = document.createElement("header");
  const sectionHeading = document.createElement("h3");
  sectionHeading.textContent = section.title;
  const sectionDescription = document.createElement("p");
  sectionDescription.textContent = section.description;
  header.append(sectionHeading, sectionDescription);

  const table = document.createElement("div");
  table.className = "style-matrix";
  for (const row of section.rows || []) {
    const item = document.createElement("div");
    item.className = "style-matrix-row";
    const name = document.createElement("code");
    name.textContent = row.name;
    const preview = renderFoundationPreview(row);
    const description = document.createElement("p");
    description.textContent = row.description;
    const value = document.createElement("span");
    value.textContent = row.value;
    item.append(name, preview, description, value);
    table.append(item);
  }

  article.append(header, table);
  return article;
}

function renderUtilityToken(token) {
  const item = document.createElement("div");
  item.className = "utility-token-row";
  item.id = `token-${token.token}`;

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

  const details = renderJsonDetails("JSON", token.card);
  const info = document.createElement("div");
  info.className = "utility-token-info";
  info.append(identity, description, meta, details);
  const preview = renderUtilityPreview(token);
  item.append(info, preview);
  return item;
}

function renderAdaptiveSection(section) {
  const article = document.createElement("article");
  article.className = "baseline-section";
  article.id = section.id;

  const header = document.createElement("header");
  const sectionHeading = document.createElement("h3");
  sectionHeading.textContent = section.title;
  const sectionDescription = document.createElement("p");
  sectionDescription.textContent = section.description;
  header.append(sectionHeading, sectionDescription);

  const shell = renderCardPreview(section.card, section.title, section.id);
  const details = renderJsonDetails("查看标准 Adaptive Card JSON", section.card);
  article.append(header, shell, details);
  return article;
}

function renderUtilitySection(section) {
  const article = document.createElement("article");
  article.className = "baseline-section utility-section";
  article.id = section.id;

  const header = document.createElement("header");
  const sectionHeading = document.createElement("h3");
  sectionHeading.textContent = section.title;
  const sectionDescription = document.createElement("p");
  sectionDescription.textContent = section.description;
  header.append(sectionHeading, sectionDescription);

  const grid = document.createElement("div");
  grid.className = "utility-token-grid";
  for (const token of section.utilityTokens || []) {
    grid.append(renderUtilityToken(token));
  }

  article.append(header, grid);
  return article;
}

function renderGroup(group) {
  const groupSection = document.createElement("section");
  groupSection.className = "baseline-group";
  groupSection.id = group.id;

  const header = document.createElement("header");
  const eyebrow = document.createElement("span");
  eyebrow.className = "eyebrow";
  const eyebrowLabels = {
    foundation: "FOUNDATION",
    "adaptive-card-components": "ADAPTIVE CARDS",
    "octo-utility-tokens": "UTILITY MATRIX",
    "composition-patterns": "PATTERNS",
  };
  eyebrow.textContent = eyebrowLabels[group.id] || "STYLE SYSTEM";
  const heading = document.createElement("h2");
  heading.textContent = group.title;
  const description = document.createElement("p");
  description.textContent = group.description;
  header.append(eyebrow, heading, description);

  const groupBody = document.createElement("div");
  groupBody.className = "baseline-group-sections";
  groupSection.append(header, groupBody);
  sectionsRoot.append(groupSection);

  const navGroup = document.createElement("div");
  navGroup.className = "baseline-nav-group";
  const navTitle = document.createElement("a");
  navTitle.className = "baseline-nav-title";
  navTitle.href = `#${group.id}`;
  navTitle.dataset.navTarget = group.id;
  navTitle.textContent = group.title;
  navGroup.append(navTitle);
  nav.append(navGroup);

  for (const section of group.sections) {
    const article = section.rows
      ? renderMatrixSection(section)
      : section.utilityTokens
      ? renderUtilitySection(section)
      : renderAdaptiveSection(section);
    groupBody.append(article);

    const link = document.createElement("a");
    link.href = `#${section.id}`;
    link.dataset.navTarget = section.id;
    link.textContent = section.title;
    navGroup.append(link);
  }
}

function setActiveNav(targetId) {
  const activeLink = nav.querySelector(`[data-nav-target="${targetId}"]`);
  if (!activeLink) return;
  for (const link of nav.querySelectorAll("[data-nav-target]")) {
    link.classList.toggle("active", link === activeLink);
  }
}

function installNavSpy() {
  const targets = document.querySelectorAll(".baseline-section");
  const observer = new IntersectionObserver(
    (entries) => {
      const hashTargetId = location.hash ? decodeURIComponent(location.hash.slice(1)) : "";
      const hashTarget = hashTargetId ? document.getElementById(hashTargetId) : null;
      if (hashTarget?.classList.contains("baseline-section")) {
        const rect = hashTarget.getBoundingClientRect();
        if (rect.top < 180 && rect.bottom > 120) {
          setActiveNav(hashTargetId);
          return;
        }
      }
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible?.target?.id) setActiveNav(visible.target.id);
    },
    {
      rootMargin: "-120px 0px -65% 0px",
      threshold: [0, 0.1, 0.25],
    }
  );
  targets.forEach((target) => observer.observe(target));
  if (location.hash) setActiveNav(location.hash.slice(1));
  window.addEventListener("hashchange", () => {
    if (location.hash) setActiveNav(location.hash.slice(1));
  });
}

function restoreInitialHash() {
  if (!location.hash) return;
  const targetId = decodeURIComponent(location.hash.slice(1));
  const target = document.getElementById(targetId);
  if (!target) return;
  target.scrollIntoView();
  setActiveNav(targetId);
}

async function start() {
  baseline = await json("/api/component-baseline");
  profileStyle = document.createElement("link");
  profileStyle.rel = "stylesheet";
  profileStyle.href = baseline.stylesheetUrl;
  document.head.append(profileStyle);

  version.textContent = baseline.reference;
  profileReference.textContent = baseline.reference;
  sdkVersion.textContent = baseline.renderProfile.adaptiveCardsSdkVersion;
  cardVersion.textContent = baseline.capabilities.maxAdaptiveCardVersion;
  const groups = baseline.groups || [
    {
      id: "legacy-baseline",
      title: "组件基线",
      description: "当前基线加载完成。",
      sections: baseline.sections,
    },
  ];
  groups.forEach(renderGroup);
  installNavSpy();
  restoreInitialHash();
  const sectionCount = groups.reduce((count, group) => count + group.sections.length, 0);
  status.textContent = `${groups.length} 个分区 · ${sectionCount} 个样式组 · 当前基线加载完成`;
}

for (const button of document.querySelectorAll("[data-baseline-width]")) {
  button.addEventListener("click", () => {
    document
      .querySelector("[data-baseline-width].active")
      ?.classList.remove("active");
    button.classList.add("active");
    previewWidth = Number(button.dataset.baselineWidth);
    applyWidth();
  });
}

start().catch((error) => {
  status.textContent = error instanceof Error ? error.message : String(error);
  status.dataset.state = "error";
});
