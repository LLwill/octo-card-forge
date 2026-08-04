#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const scenario = valueFor("--scenario") ?? "bot-token";
const workspace =
  valueFor("--output") ??
  mkdtempSync(path.join(os.tmpdir(), `octo-card-validation-${scenario}-`));

function valueFor(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function run(command, commandArgs, options = {}) {
  return execFileSync(command, commandArgs, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
}

function runJson(command, commandArgs, options = {}) {
  return JSON.parse(run(command, commandArgs, options));
}

function taskFor(name) {
  if (name === "docs-forward") {
    return `# Task

参考截图，帮我做一张文档转发卡片。

这张卡片用于在 Octo Chat 里展示别人转发的文档。截图只是布局和信息层级参考，不要求完全复刻样式。

卡片需要表达：
- 文档标题
- 创建人
- 转发人，如果有
- 当前权限，例如可查看或可编辑
- 文档内容预览
- 打开文档
- 复制链接

设计目标：
- 紧凑、清晰，像聊天里的文档卡片
- 不要像普通表单
- 不要大面积留白
- 窄宽度里也要好读

请完成最终可以交付给前后端的产物。
`;
  }

  return `# Task

我需要做一张 Bot Token 查看卡，用于在 Octo Chat 里展示一个机器人访问 Token 的创建结果。

卡片需要表达：
- 标题：Bot Token 已创建
- 机器人名称
- Token 名称
- Token 值，但默认应该以安全方式展示，避免直接裸露
- 创建时间
- 过期时间；如果没有过期时间，显示“永不过期”
- 权限范围列表
- 创建人
- 安全提醒：请立即复制并妥善保存，离开页面后无法再次完整查看
- 操作：
  - 复制 Token
  - 我已保存
  - 可选：显示 / 隐藏 Token

设计目标：
- 紧凑、清晰，有安全感
- 信息层级明确
- 不要像普通表单
- 不要大面积留白
- 窄宽度里也要好读

请完成最终可以交付给前后端的产物。
`;
}

function presetHintFor(name) {
  if (name === "docs-forward") return "docs-forward";
  if (name === "bot-token") return "bot-token";
  return undefined;
}

run("pnpm", ["build"], { stdio: "inherit" });
const profilePack = runJson("pnpm", [
  "--silent",
  "cli",
  "profile",
  "pack",
  "octo-chat@latest",
  "--output",
  ".release",
]);
const cliPackOutput = run("pnpm", ["pack", "--pack-destination", ".release"]);
const cliTarball = cliPackOutput
  .trim()
  .split(/\r?\n/)
  .findLast((line) => line.endsWith(".tgz"));

if (!cliTarball || !existsSync(cliTarball)) {
  throw new Error(`Unable to locate CLI tarball from pnpm pack output:\n${cliPackOutput}`);
}
if (!existsSync(profilePack.tarball)) {
  throw new Error(`Profile tarball was not created: ${profilePack.tarball}`);
}

mkdirSync(workspace, { recursive: true });
writeFileSync(
  path.join(workspace, "package.json"),
  `${JSON.stringify(
    {
      private: true,
      name: `octo-card-validation-${scenario}`,
      version: "0.0.0",
      type: "module",
    },
    null,
    2
  )}\n`
);

run("npm", ["install", "--save-dev", cliTarball, profilePack.tarball], {
  cwd: workspace,
  stdio: "inherit",
});

writeFileSync(
  path.join(workspace, "AGENTS.md"),
  `# Octo Card Validation Workspace

This is a consumer workspace, not the Octo Card Forge repository.

For Octo card work:
- Use the installed \`octo-card\` CLI through \`npx --no-install octo-card\`.
- Read the card authoring skill from \`node_modules/@mlt-org/octo-card-cli/skills/octo-design-cards/SKILL.md\`.
- Run \`npx --no-install octo-card presets --format json\`; if a preset matches the task, use it as an editable starting point with \`octo-card init --preset\`.
- Produce an independent card package in this workspace.
- Do not depend on a local Forge checkout.

Record the commands you actually used and the final deliverables.
`
);

writeFileSync(path.join(workspace, "TASK.md"), taskFor(scenario));
writeFileSync(
  path.join(workspace, "README.md"),
  `# Repo-free Agent Validation

Open a new Codex task in this directory and ask it to complete \`TASK.md\`.

Useful local checks after the task:

\`\`\`bash
npx --no-install octo-card verify --card ./<card-dir> --emit-dir compiled --handoff handoff --format json
npx --no-install octo-card emit --card ./<card-dir> --sample <sample-name> > card.json
\`\`\`

Suggested starting preset for this scenario: \`${presetHintFor(scenario) ?? "none"}\`.
`
);

const help = run("npm", ["exec", "--", "octo-card", "--help"], { cwd: workspace });
if (!help.includes("octo-card commands")) {
  throw new Error("Installed octo-card CLI did not print expected help");
}

console.log(JSON.stringify({
  workspace,
  scenario,
  cliTarball,
  profileTarball: profilePack.tarball,
  task: path.join(workspace, "TASK.md"),
  agentInstructions: path.join(workspace, "AGENTS.md"),
}, null, 2));
