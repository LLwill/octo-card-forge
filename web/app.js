const cardSelect = document.querySelector("#cardSelect");
const sampleSelect = document.querySelector("#sampleSelect");
const dataEditor = document.querySelector("#dataEditor");
const preview = document.querySelector("#preview");
const template = document.querySelector("#template");
const payload = document.querySelector("#payload");
const status = document.querySelector("#status");
const contract = document.querySelector("#contract");
const version = document.querySelector("#version");
const exportButton = document.querySelector("#exportButton");
let cards = [];
let currentContext;
let currentView;
let hostStyle;

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
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || JSON.stringify(body.errors || body));
  return body;
}

async function chooseCard() {
  const selected = cards.find((card) => card.reference === cardSelect.value);
  currentContext = await json(`/api/cards/${encodeURIComponent(selected.reference)}/context`);
  const contractData = await json(`/api/cards/${encodeURIComponent(selected.reference)}/contract`);
  contract.textContent = JSON.stringify(contractData, null, 2);
  version.textContent = `${selected.id}@${selected.version} · ${selected.renderProfile}`;
  if (hostStyle) hostStyle.remove();
  hostStyle = document.createElement("link");
  hostStyle.rel = "stylesheet";
  hostStyle.href = currentContext.stylesheetUrl;
  document.head.append(hostStyle);
  sampleSelect.replaceChildren();
  for (const names of Object.values(selected.samples)) {
    for (const name of names) sampleSelect.add(new Option(name, name));
  }
  await chooseSample();
}

async function chooseSample() {
  const result = await json(
    `/api/cards/${encodeURIComponent(cardSelect.value)}/samples/${encodeURIComponent(sampleSelect.value)}`
  );
  currentView = result.view;
  const templateResult = await json(
    `/api/cards/${encodeURIComponent(cardSelect.value)}/views/${encodeURIComponent(currentView)}/template`
  );
  dataEditor.value = JSON.stringify(result.data, null, 2);
  template.textContent = JSON.stringify(templateResult.template, null, 2);
  await render(currentView);
}

async function render(view) {
  status.textContent = "组装中…";
  try {
    const data = JSON.parse(dataEditor.value);
    const resolvedView = view || currentView;
    if (!resolvedView) throw new Error("请先选择一个 View");
    const result = await json("/api/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: cardSelect.value, view: resolvedView, data }),
    });
    const card = new AdaptiveCards.AdaptiveCard();
    card.hostConfig = new AdaptiveCards.HostConfig(currentContext.hostConfig);
    card.onExecuteAction = (action) => {
      status.textContent = `${action.getJsonTypeName()} · ${action.id || action.title || "local"}`;
    };
    card.parse(result.payload);
    preview.replaceChildren(card.render());
    payload.textContent = JSON.stringify(result.payload, null, 2);
    status.textContent = `校验通过 · ${result.cardVersion}`;
  } catch (error) {
    status.textContent = error.message;
  }
}

cards = await json("/api/cards");
for (const card of cards) {
  cardSelect.add(new Option(`${card.name} · ${card.version}`, card.reference));
}
cardSelect.addEventListener("change", chooseCard);
sampleSelect.addEventListener("change", chooseSample);
document.querySelector("#renderButton").addEventListener("click", () => render());
exportButton.addEventListener("click", async () => {
  const selected = cards.find((card) => card.reference === cardSelect.value);
  if (!selected) return;
  status.textContent = "正在生成后端交付包…";
  try {
    const response = await fetch(
      `/api/cards/${encodeURIComponent(selected.reference)}/handoff`
    );
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.message || "导出失败");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.id}@${selected.version}.handoff.zip`;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `已导出 ${link.download}`;
  } catch (error) {
    status.textContent = error.message;
  }
});
for (const button of document.querySelectorAll(".width")) {
  button.addEventListener("click", () => {
    document.querySelector(".width.active")?.classList.remove("active");
    button.classList.add("active");
    preview.style.width = `${button.dataset.width}px`;
  });
}
await chooseCard();
