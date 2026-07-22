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
  for (const preview of document.querySelectorAll(".baseline-preview")) {
    preview.style.width = `${previewWidth}px`;
  }
}

function renderSection(section) {
  const article = document.createElement("article");
  article.className = "baseline-section";
  article.id = section.id;

  const header = document.createElement("header");
  const heading = document.createElement("h2");
  heading.textContent = section.title;
  const description = document.createElement("p");
  description.textContent = section.description;
  header.append(heading, description);

  const shell = document.createElement("div");
  shell.className = "baseline-preview-shell";
  const preview = document.createElement("div");
  preview.className = "baseline-preview";
  preview.dataset.baselineSection = section.id;
  preview.style.width = `${previewWidth}px`;

  const card = new AdaptiveCards.AdaptiveCard();
  card.hostConfig = new AdaptiveCards.HostConfig(baseline.hostConfig);
  card.onExecuteAction = (action) => {
    status.textContent = `${section.title} · ${action.getJsonTypeName()} · 本地预览未发送`;
  };
  card.parse(section.card);
  preview.replaceChildren(card.render());
  shell.append(preview);

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "查看标准 Adaptive Card JSON";
  const code = document.createElement("pre");
  code.textContent = JSON.stringify(section.card, null, 2);
  details.append(summary, code);

  article.append(header, shell, details);
  sectionsRoot.append(article);

  const link = document.createElement("a");
  link.href = `#${section.id}`;
  link.textContent = section.title;
  nav.append(link);
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
  baseline.sections.forEach(renderSection);
  status.textContent = `${baseline.sections.length} 组组件 · 当前基线加载完成`;
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
