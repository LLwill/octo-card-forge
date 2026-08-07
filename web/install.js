const copy = {
  zh: {
    navCards: "卡片", navComponents: "组件", navInstall: "安装", eyebrow: "START HERE", title: "让 Agent 开始做卡片", description: "先选一种用法。大多数 Agent 选择“完整工作台”，安装后就能创建、预览和校验卡片。", currentRelease: "当前版本", loading: "正在准备安装信息…", ready: "当前版本已准备好，可以开始安装", chooseEyebrow: "CHOOSE A PATH", chooseTitle: "你要让 Agent 做什么？", nodeTitle: "完整工作台", recommended: "推荐", nodeDescription: "适合要创建、预览、校验和交付卡片的 Agent。", nodeBenefitOne: "Skill 告诉 Agent 卡片该怎么写", nodeBenefitTwo: "CLI 检查 JSON、预览结果并交付", nodeBenefitThree: "Render Profile 提供 Octo-Chat 的规则", installCommandLabel: "第一步：安装工具", nextStepLabel: "然后初始化工作区", agentInstructionLabel: "给 Agent 的安装指令", copyAgentInstruction: "复制安装指令", copy: "复制", copied: "已复制", cliVersionLabel: "CLI", profileVersionLabel: "Render Profile", compatibilityLabel: "兼容范围", skillTitle: "只给 Agent 规则", portable: "不需要 Node", skillDescription: "适合平台只支持上传 Skill，或 Agent 只需要知道如何产出标准卡片。", skillBenefitOne: "包含 SKILL.md 和平台入口", skillBenefitTwo: "包含卡片规范和参考资料", skillBenefitThree: "不包含 CLI、预览和校验运行时", bundleFormat: "Portable Skill Bundle · .tgz", download: "下载 Skill", releaseNotes: "查看版本说明", howEyebrow: "AFTER INSTALL", howTitle: "安装后怎么用？", stepOneTitle: "告诉 Agent 你要做什么", stepOneBody: "例如：创建一个“文档分享通知”卡片。", stepTwoTitle: "Agent 创建或修改卡片", stepTwoBody: "Skill 提供写法，CLI 负责校验和预览，Render Profile 负责按 Octo-Chat 规则渲染。", stepThreeTitle: "交付标准 Adaptive Card JSON", stepThreeBody: "完成后运行 doctor 和 verify，确认可以交给 Octo-Chat。", technicalSummary: "查看版本、兼容范围和 checksum", checksumLabel: "SHA-256", componentLabel: "组件", versionLabel: "当前版本", rangeLabel: "兼容关系", cliLabel: "CLI", skillLabel: "Skill Bundle", profileLabel: "Render Profile", loadFailed: "安装信息读取失败，请稍后重试。", copyFailed: "复制失败", themeToLight: "切换到亮色主题", themeToDark: "切换到暗色主题"
  },
  en: {
    navCards: "Cards", navComponents: "Components", navInstall: "Install", eyebrow: "START HERE", title: "Let your Agent make cards", description: "Pick the way you want to work. Most Agents should use the complete workspace to create, preview, and validate cards.", currentRelease: "Current version", loading: "Preparing install information…", ready: "The current version is ready to install", chooseEyebrow: "CHOOSE A PATH", chooseTitle: "What should your Agent do?", nodeTitle: "Complete workspace", recommended: "Recommended", nodeDescription: "For Agents that create, preview, validate, and hand off cards.", nodeBenefitOne: "Skill tells the Agent how cards should be written", nodeBenefitTwo: "CLI checks JSON, previews results, and packages handoff", nodeBenefitThree: "Render Profile provides Octo-Chat rules", installCommandLabel: "Step one: install the tools", nextStepLabel: "Then initialize the workspace", agentInstructionLabel: "Installation instruction for your Agent", copyAgentInstruction: "Copy installation instruction", copy: "Copy", copied: "Copied", cliVersionLabel: "CLI", profileVersionLabel: "Render Profile", compatibilityLabel: "Compatibility", skillTitle: "Give the Agent rules only", portable: "No Node needed", skillDescription: "For platforms that only accept Skills, or Agents that only need to produce standard cards.", skillBenefitOne: "Includes SKILL.md and platform entry points", skillBenefitTwo: "Includes card rules and reference material", skillBenefitThree: "Does not include CLI, preview, or validation runtime", bundleFormat: "Portable Skill Bundle · .tgz", download: "Download Skill", releaseNotes: "View release notes", howEyebrow: "AFTER INSTALL", howTitle: "What happens after install?", stepOneTitle: "Tell the Agent what to make", stepOneBody: "For example: create a document-sharing notification card.", stepTwoTitle: "The Agent creates or edits the card", stepTwoBody: "The Skill provides the writing rules, the CLI validates and previews, and the Render Profile applies Octo-Chat rules.", stepThreeTitle: "Hand off standard Adaptive Card JSON", stepThreeBody: "Run doctor and verify when you are done, then send it to Octo-Chat.", technicalSummary: "View versions, compatibility, and checksum", checksumLabel: "SHA-256", componentLabel: "Component", versionLabel: "Current", rangeLabel: "Compatible with", cliLabel: "CLI", skillLabel: "Skill Bundle", profileLabel: "Render Profile", loadFailed: "Install information could not be loaded. Try again later.", copyFailed: "Copy failed", themeToLight: "Switch to light theme", themeToDark: "Switch to dark theme"
  }
};

let locale = localStorage.getItem("octo-card-locale") === "en" ? "en" : "zh";
let installData;
const basePath = window.__OCTO_BASE_PATH__ || "";

function t(key) { return copy[locale][key] || copy.en[key] || key; }

function agentInstruction() {
  if (!installData) return "—";
  const install = installData.cli.installCommand;
  const init = installData.cli.initCommand;
  return locale === "zh"
    ? `请在当前工作区安装完整的 Octo Card 工具链，包括 Skill、CLI 和 Octo-Chat Render Profile，然后运行 ${init} 初始化 Agent 配置。安装命令：${install}`
    : `In the current workspace, install the complete Octo Card toolkit, including the Skill, CLI, and Octo-Chat Render Profile, then run ${init} to initialize the Agent. Install command: ${install}`;
}

function applyLocale() {
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-locale]").forEach((button) => {
    button.classList.toggle("active", button.dataset.locale === locale);
    button.setAttribute("aria-pressed", button.dataset.locale === locale ? "true" : "false");
  });
  document.querySelectorAll("[data-copy]").forEach((element) => {
    const key = element.dataset.copy;
    if (key) element.textContent = t(key);
  });
  const agentButton = document.querySelector("[data-copy-command='agent']");
  if (agentButton) {
    agentButton.setAttribute("aria-label", t("copyAgentInstruction"));
    agentButton.title = t("copyAgentInstruction");
  }
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  const themeLabel = theme === "dark" ? t("themeToLight") : t("themeToDark");
  const themeButton = document.querySelector("#installThemeToggle");
  if (themeButton) {
    themeButton.setAttribute("aria-label", themeLabel);
    themeButton.title = themeLabel;
  }
  localStorage.setItem("octo-card-locale", locale);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("octo-card-theme", theme);
  const button = document.querySelector("#installThemeToggle");
  if (!button) return;
  const label = theme === "dark" ? t("themeToLight") : t("themeToDark");
  button.setAttribute("aria-label", label);
  button.title = label;
  const icon = document.createElement("i");
  icon.dataset.lucide = theme === "dark" ? "sun" : "moon";
  button.querySelector("[data-theme-icon]")?.replaceChildren(icon);
  window.lucide?.createIcons({ attrs: { "stroke-width": "1.8" } });
}

async function copyValue(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    const label = button.querySelector("[data-copy]");
    const originalAriaLabel = button.getAttribute("aria-label");
    const originalTitle = button.title;
    if (label) {
      label.textContent = t("copied");
      window.setTimeout(() => { label.textContent = t("copy"); }, 1200);
    } else {
      button.setAttribute("aria-label", t("copied"));
      button.title = t("copied");
      window.setTimeout(() => {
        button.setAttribute("aria-label", originalAriaLabel || t("copy"));
        button.title = originalTitle || t("copy");
      }, 1200);
    }
  } catch {
    const label = button.querySelector("[data-copy]");
    if (label) label.textContent = t("copyFailed");
  }
}

function bindCopyButtons() {
  document.querySelectorAll("[data-copy-command]").forEach((button) => button.addEventListener("click", () => {
    if (!installData) return;
    const value = button.dataset.copyCommand === "install"
      ? installData.cli.installCommand
      : button.dataset.copyCommand === "init"
        ? installData.cli.initCommand
        : button.dataset.copyCommand === "agent"
          ? agentInstruction()
          : installData.skillChecksum;
    copyValue(value, button);
  }));
}

function renderInstallData(data) {
  installData = data;
  document.querySelector("#releaseVersion").textContent = `v${data.cli.version}`;
  document.querySelector("#installCommand").textContent = data.cli.installCommand;
  document.querySelector("#initCommand").textContent = data.cli.initCommand;
  document.querySelector("#agentInstruction").textContent = agentInstruction();
  document.querySelector("#cliVersion").textContent = data.cli.version;
  document.querySelector("#profileVersion").textContent = `${data.renderProfile.id}@${data.renderProfile.version}`;
  document.querySelector("#cliCompatibility").textContent = data.cli.compatibleRange;
  document.querySelector("#skillVersion").textContent = `v${data.skill.version}`;
  document.querySelector("#skillDownload").href = data.skill.bundleUrl;
  document.querySelector("#skillRelease").href = data.skill.releaseUrl;
  document.querySelector("#skillChecksum").textContent = data.skillChecksum;
  document.querySelector("#factCliVersion").textContent = data.cli.version;
  document.querySelector("#factCliRange").textContent = data.cli.compatibleRange;
  document.querySelector("#factSkillVersion").textContent = data.skill.version;
  document.querySelector("#factSkillRange").textContent = data.cli.compatibleRange;
  document.querySelector("#factProfileVersion").textContent = `${data.renderProfile.id}@${data.renderProfile.version}`;
  document.querySelector("#factProfileRange").textContent = data.renderProfile.compatibleRange || "—";
  const status = document.querySelector("#installStatus");
  status.textContent = t("ready");
  status.dataset.state = "ready";
}

async function loadInstallData() {
  const response = await fetch(`${basePath}/api/install`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "install metadata unavailable");
  renderInstallData({ ...data, skillChecksum: data.skill.sha256 });
}

document.querySelectorAll("[data-locale]").forEach((button) => button.addEventListener("click", () => {
  locale = button.dataset.locale === "en" ? "en" : "zh";
  applyLocale();
  if (installData) renderInstallData(installData);
}));
document.querySelector("#installThemeToggle")?.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
applyLocale();
setTheme(localStorage.getItem("octo-card-theme") === "dark" ? "dark" : "light");
bindCopyButtons();
window.lucide?.createIcons({ attrs: { "stroke-width": "1.8" } });
loadInstallData().catch(() => {
  const status = document.querySelector("#installStatus");
  status.textContent = t("loadFailed");
  status.dataset.state = "error";
});
