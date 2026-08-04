const copy = {
  zh: {
    eyebrow: "AGENT TOOLKIT", title: "安装 Octo Card 工具", description: "为 Agent 配置 Skill、CLI 和 Octo-Chat Render Profile。选择你的运行环境，复制命令即可开始。", currentRelease: "当前发布", loading: "正在读取当前制品…", nodeEyebrow: "NODE AGENT", nodeTitle: "需要执行工具的 Agent", recommended: "推荐", nodeDescription: "安装 CLI 和固定版本的 Render Profile，获得 init、doctor、校验、预览和交付能力。", installCommandLabel: "安装 CLI + Render Profile", initCommandLabel: "初始化当前 Agent 工作区", copy: "复制", copied: "已复制", cliVersionLabel: "CLI", profileVersionLabel: "Render Profile", compatibilityLabel: "兼容范围", skillEyebrow: "SKILL-ONLY AGENT", skillTitle: "只需要读取规则的 Agent", portable: "Portable", skillDescription: "下载不依赖 Node/npm 的 Skill Bundle，把 SKILL.md 注册到 Agent 支持的 Skill 目录即可。", bundleFormat: "Portable Skill Bundle · .tgz", download: "下载 Bundle", releaseNotes: "查看 Release", checksumLabel: "SHA-256", compatibilityEyebrow: "COMPATIBILITY", factsTitle: "版本关系", componentLabel: "组件", versionLabel: "当前版本", rangeLabel: "兼容关系", cliLabel: "CLI", skillLabel: "Skill Bundle", profileLabel: "Render Profile", loadFailed: "制品信息读取失败，请稍后重试。", copyFailed: "复制失败"
  },
  en: {
    eyebrow: "AGENT TOOLKIT", title: "Install Octo Card tools", description: "Set up the Skill, CLI, and Octo-Chat Render Profile for your Agent. Pick a runtime and copy the command to begin.", currentRelease: "Current release", loading: "Loading current artifacts…", nodeEyebrow: "NODE AGENT", nodeTitle: "Agent with executable tools", recommended: "Recommended", nodeDescription: "Install the CLI with an exact Render Profile version for init, doctor, validation, preview, and handoff.", installCommandLabel: "Install CLI + Render Profile", initCommandLabel: "Initialize the Agent workspace", copy: "Copy", copied: "Copied", cliVersionLabel: "CLI", profileVersionLabel: "Render Profile", compatibilityLabel: "Compatibility", skillEyebrow: "SKILL-ONLY AGENT", skillTitle: "Agent that only reads the rules", portable: "Portable", skillDescription: "Download the Node/npm-free Skill Bundle and register SKILL.md in the Agent's Skill directory.", bundleFormat: "Portable Skill Bundle · .tgz", download: "Download Bundle", releaseNotes: "View Release", checksumLabel: "SHA-256", compatibilityEyebrow: "COMPATIBILITY", factsTitle: "Version matrix", componentLabel: "Component", versionLabel: "Current", rangeLabel: "Compatible with", cliLabel: "CLI", skillLabel: "Skill Bundle", profileLabel: "Render Profile", loadFailed: "Artifact information could not be loaded. Try again later.", copyFailed: "Copy failed"
  }
};

let locale = localStorage.getItem("octo-card-locale") === "en" ? "en" : "zh";
let installData;

function t(key) { return copy[locale][key] || copy.en[key] || key; }

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
  localStorage.setItem("octo-card-locale", locale);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("octo-card-theme", theme);
  const button = document.querySelector("#installThemeToggle");
  if (!button) return;
  const label = theme === "dark" ? "切换到亮色主题" : "切换到暗色主题";
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
    if (label) {
      label.textContent = t("copied");
      window.setTimeout(() => { label.textContent = t("copy"); }, 1200);
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
        : installData.skillChecksum;
    copyValue(value, button);
  }));
}

function renderInstallData(data) {
  installData = data;
  document.querySelector("#releaseVersion").textContent = `v${data.cli.version}`;
  document.querySelector("#installCommand").textContent = data.cli.installCommand;
  document.querySelector("#initCommand").textContent = data.cli.initCommand;
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
  status.textContent = locale === "zh" ? "制品信息已加载" : "Artifact information loaded";
  status.dataset.state = "ready";
}

async function loadInstallData() {
  const response = await fetch("/api/install");
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
