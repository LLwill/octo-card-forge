# Octo Card Agent 工具安装与升级方案

> 状态：Phase 1、Bootstrap、Doctor 与升级预检已落地；自动 apply/回滚和平台 Adapter 仍按后续阶段实施
> 适用范围：`octo-design-cards` Skill、`octo-card` CLI、Octo Chat Render Profile，以及所有消费这些能力的 Agent

## 1. 结论

安装方案采用 **Portable Skill Bundle 优先、CLI Runtime 可选、平台 Adapter 薄适配**。

核心原则：

> Agent 不应该为了读取 Skill 而先安装 CLI；CLI 是执行和校验依赖，不是 Skill 的阅读前提。

目标分发结构：

```text
Portable Skill Bundle
  ├── SKILL.md
  ├── references/
  └── skill-manifest.json

CLI Runtime
  ├── dist/       CLI 运行代码
  └── web/        本地 Preview UI

Render Profile
  └── Octo Chat 的 HostConfig、capabilities、tokens 和 CSS

Agent Adapter
  ├── Codex Skill 目录注册
  ├── 通用 AGENTS.md
  └── 其他 Agent 平台适配
```

当前 `@mlt-org/octo-card-cli` 继续携带 `dist/`、`web/` 和 `skills/`，保证现有 CLI
与 Skill 同版本；同时增加独立的 Skill Bundle 发布制品，让不使用 npm/pnpm 的 Agent
也能直接消费 Skill。Skill 在逻辑上依赖 CLI 和 Profile，但当前将 Skill 放在 CLI 包内
是为了版本同步，不代表逻辑依赖方向反了。

## 2. 问题分析

仅使用 npm/pnpm 作为入口不够普惠：

- 部分 Agent 没有 Node、npm 或 pnpm。
- 部分 Agent 只能读取任务上下文或本地 Markdown，不能自动扫描 `node_modules`。
- 不同平台的 Skill 注册目录不同。
- CLI、Skill 和 Render Profile 的版本关系需要人工理解。

因此必须拆开两个概念：

```text
读取 Skill：下载 Skill Bundle，或读取平台已注册的 SKILL.md
执行工具：按环境选择 npm、standalone binary、Docker 或其他 Runtime
```

没有 CLI 时，Agent 可以读取 Skill 并生成 JSON，但不能声称完成了 CLI 校验。Skill
必须明确报告未完成的校验，而不是把未验证结果当成已验证结果。

## 3. 目标制品

### 3.1 Portable Skill Bundle

```text
octo-design-cards-skill-0.2.0.tgz
├── SKILL.md
├── agents/openai.yaml
├── references/card-package-workflow.md
├── references/component-system.md
└── skill-manifest.json
```

它不包含 CLI、不要求 Node、不修改用户环境。发布渠道按优先级为：

1. GitHub Release 附件或内部 HTTPS 制品库。
2. 可选 npm 包 `@mlt-org/octo-design-cards-skill`。
3. Agent 平台自己的 Skill 注册目录。

GitHub Release/内部制品库是跨平台基线，npm 只是 Node 用户的快捷渠道。

### 3.2 CLI Runtime

`@mlt-org/octo-card-cli` 继续负责可执行能力：

```text
dist/ -> init、validate、check、lint、verify、render、handoff、profile
web/  -> octo-card dev 的本地 Catalog、Preview 和组件基线页面
```

`web/` 不是生产版 `octo-web`，而是 CLI 本地 Preview 的运行资源。由于 `dist/cli.js`
会启动本地服务并加载 `web/`，两者应继续同包、同版本发布。

Runtime 安装渠道：

```text
Node workspace -> @mlt-org/octo-card-cli
CI / Docker   -> 固定版本的 octo-card-cli container
无 Node 环境   -> 预编译 standalone binary（后续阶段）
```

### 3.3 Render Profile

Render Profile 保持独立制品，例如：

```text
@mlt-org/octo-card-profile-octo-chat@1.2.0-rc.2
```

它负责 HostConfig、capabilities、组件、utility、tokens、theme 和 CSS。CLI 升级不应
隐式升级 Render Profile。

## 4. 各类 Agent 的安装方式

### 4.1 通用 Agent，无包管理器

1. 从 GitHub Release 或内部制品库下载 Skill Bundle。
2. 解压到 Agent 支持的 Skill 目录，或者把 `SKILL.md` 加入任务上下文。
3. 需要校验和预览时，再按环境安装 CLI Runtime。
4. 根据 `skill-manifest.json` 选择匹配的 CLI/Profile 版本。

### 4.2 Node Agent

```bash
pnpm add -D \
  @mlt-org/octo-card-cli@0.2.0 \
  @mlt-org/octo-card-profile-octo-chat@1.2.0-rc.2
```

Skill 可以从以下路径读取，也可以使用独立 Skill Bundle：

```text
node_modules/@mlt-org/octo-card-cli/skills/octo-design-cards/SKILL.md
```

### 4.3 Codex 和其他平台

平台 Adapter 只负责注册同一份 Skill：

- Codex：注册到 Codex Skill 目录。
- 通用 Agent：生成 `AGENTS.md`，声明 Skill 路径和 CLI 命令。
- 不支持 Skill 目录的平台：把 `SKILL.md` 或其 URL 加入任务上下文。

Adapter 不得复制规则文本，也不得长期指向未知的 `latest` 副本。

## 5. 统一 Skill Manifest

Skill Bundle 包含 `skill-manifest.json`，描述兼容关系、下载地址和 checksum：

```json
{
  "schemaVersion": 1,
  "skill": {
    "name": "octo-design-cards",
    "version": "0.2.0",
    "entry": "SKILL.md"
  },
  "cli": {
    "package": "@mlt-org/octo-card-cli",
    "compatibleRange": ">=0.2.0 <0.3.0",
    "recommendedVersion": "0.2.0"
  },
  "renderProfiles": [
    {
      "id": "octo-chat",
      "package": "@mlt-org/octo-card-profile-octo-chat",
      "compatibleRange": ">=1.2.0-rc.2 <2.0.0",
      "recommendedVersion": "1.2.0-rc.2"
    }
  ],
  "artifacts": {
    "skillBundle": "https://github.com/LLwill/octo-card-forge/releases/download/octo-design-cards-skill/v0.2.0/octo-design-cards-skill-0.2.0.tgz",
    "sha256": "published-release-checksum"
  }
}
```

约束：

- Skill Bundle 可脱离 CLI 被读取。
- CLI 是执行依赖，Profile 是渲染和能力依赖。
- `compatibleRange` 不替代 workspace lockfile。
- 生产 workspace 记录实际解析的精确版本。
- Release 制品必须提供 checksum。

## 6. Workspace 注册和生命周期

### 6.1 `.octo-card/agent.json`

它记录 Agent 注册状态和兼容性信息，不替代 `package.json` 或 lockfile：

```json
{
  "schemaVersion": 1,
  "target": "generic",
  "skill": {
    "source": "bundle|npm|embedded",
    "version": "0.2.0",
    "path": "node_modules/@mlt-org/octo-card-cli/skills/octo-design-cards/SKILL.md"
  },
  "cli": {
    "package": "@mlt-org/octo-card-cli",
    "version": "0.2.0"
  },
  "renderProfile": {
    "package": "@mlt-org/octo-card-profile-octo-chat",
    "reference": "octo-chat@1.2.0-rc.2"
  },
  "generatedFiles": ["AGENTS.md"]
}
```

`package.json` 和 lockfile 是实际依赖解析的唯一事实来源；`agent.json` 只记录 Skill
注册、平台目标和诊断状态。

### 6.2 Bootstrap

目标体验：

```bash
pnpm dlx @mlt-org/octo-card-agent-kit init --target generic
```

`agent-kit` 应完成：

- 下载或安装匹配的 Skill Bundle、CLI 和 Profile。
- 生成 `.octo-card/agent.json`。
- 生成或更新 `AGENTS.md` 托管区块。
- 注册目标平台的 Skill 路径。
- 运行一次 `doctor`。

在 Agent Kit 发布前，Node workspace 的手动流程是：

```bash
pnpm add -D @mlt-org/octo-card-cli @mlt-org/octo-card-profile-octo-chat
```

通用 Agent 则直接下载 Skill Bundle，不被 npm 流程阻塞。

### 6.3 Doctor

目标命令：

```bash
octo-card agent doctor --format json
```

检查：

- Skill 是否存在、来源和版本是否明确。
- Skill 与 CLI 兼容范围是否匹配。
- CLI 是否可执行。
- Render Profile 是否可加载。
- Profile Manifest、capabilities 和 CSS 是否一致。
- `agent.json`、`package.json` 和 lockfile 是否漂移。
- `AGENTS.md` 托管区块是否存在且未损坏。
- `validate`、`discover` 和 `verify` 是否可调用。

阻塞级不兼容返回非零退出码；`--format json` 用于 CI 和其他 Agent。

### 6.4 Upgrade

目标命令：

```bash
octo-card agent upgrade --check --format json
octo-card agent upgrade --apply
```

默认策略：

- CLI 和随附 Skill 一起升级。
- Render Profile 保持当前精确版本。
- 刷新 Skill 注册、`AGENTS.md`、`agent.json` 和 lockfile。
- 升级后运行 `doctor`。
- 对 Card Package 运行 `check` / `lint`，对 Quick Card fixture 运行 `validate`。

只有明确指定 Profile 新版本时，才升级 Render Profile。

### 6.5 Rollback

回滚使用历史 lockfile 和精确版本：

```bash
pnpm add -D @mlt-org/octo-card-cli@0.1.0
pnpm add -D @mlt-org/octo-card-profile-octo-chat@1.2.0-rc.2
pnpm exec octo-card agent doctor
```

升级器不应删除历史 lockfile、Card Package 或 handoff 产物。

## 7. 版本和兼容策略

### 7.1 CLI 与内嵌 Skill

第一阶段 Skill 随 CLI 同包发布：

```text
@mlt-org/octo-card-cli@0.2.0
  contains octo-design-cards Skill@0.2.0
```

Skill 新增 CLI 要求时，必须在同一 CLI 版本提供对应实现。

### 7.2 独立 Skill Bundle

独立 Bundle 可以拥有自己的版本，但必须通过 `skill-manifest.json` 声明兼容 CLI 范围。
它不应直接复制 CLI 规则或维护另一套命令清单。

### 7.3 Render Profile

Render Profile 独立版本化。组件、utility、HostConfig、tokens 或 CSS 的变化不能通过
CLI 升级隐式发生。

### 7.4 破坏性变化

删除或重命名 CLI 命令、修改 Skill 命令参数、删除 Profile 能力、改变 Wire Profile
边界或修改 Card Package 语义时，必须提供兼容性说明和迁移步骤。

## 8. 发布与 CI 验收

### 8.1 Skill Bundle

CI 验证：

1. `SKILL.md`、`agents/openai.yaml` 和 `references/` 存在。
2. 所有内部相对引用都能在 Bundle 中解析。
3. Bundle 不引用发布包之外的仓库 `docs/` 路径。
4. `skill-manifest.json` 的版本、checksum 和入口正确。
5. 解压后的 Skill 可以在没有 Node 的环境中被读取。

### 8.2 CLI Runtime

CI 验证：

1. `pnpm typecheck`。
2. `pnpm test`。
3. `pnpm pack --dry-run` 包含 `dist/cli.js`、`web/` 和内嵌 Skill。
4. 包内不包含仓库 Cards、handoff zip 或 Render Profile source。
5. 临时 consumer workspace 可以运行 `discover`、`validate`、`verify` 和 `dev`。

### 8.3 外部 Agent

至少验证两条路径：

```text
通用 Agent：只下载 Skill Bundle，读取 SKILL.md
Node Agent：安装 CLI/Profile，读取 Skill 并完成 validate/verify
```

测试任务覆盖一次性 Quick Card、带契约的 Card Package、CLI 升级后的 Skill 匹配，
以及 Profile 精确版本保持不变。

## 9. 立即落地分期

### Phase 1：Portable Skill Bundle

- 新增 `skill-manifest.json`。
- 增加 `pnpm skill:pack .release` Skill Bundle 构建脚本。
- 在 GitHub Release 发布 `.tgz` 和 checksum。
- 增加 Bundle 内部引用检查。

### Phase 2：通用 Bootstrap 和 Doctor

- 实现 `agent init --target generic`。
- 生成 `.octo-card/agent.json` 和 `AGENTS.md` 托管区块。
- 实现 `agent doctor --format json`。
- 将现有 Agent validation workspace 接入同一套逻辑。

### Phase 3：升级和回滚

- 实现 `agent upgrade --check`。
- `agent upgrade --apply` 暂不自动修改依赖，待 Agent Kit 独立发布后实施。
- 保持 Profile 精确版本，禁止隐式升级。
- 增加 lockfile、manifest 和实际安装版本的漂移测试。

### Phase 4：平台 Adapter 和多 Runtime

- 增加 `--target codex`。
- 增加 standalone binary 和 Docker Runtime。
- 按实际需求增加其他 Agent 平台 Adapter。

### Phase 5：评估独立 npm Skill 包

只有在 Skill 需要独立于 CLI 发布，或者不使用 CLI 的平台大量消费 Skill 时，才发布
`@mlt-org/octo-design-cards-skill`。独立 npm 包是 Node 渠道，不替代 Portable Bundle。

## 10. 方案取舍与建议

### CLI 内嵌 Skill

版本同步简单，当前发布链路低风险；缺点是只想读 Skill 的 Agent 需要接触 CLI 包。
保留作为兼容和 Node 用户渠道。

### 独立 Skill npm 包

依赖关系清晰，但仍不能解决无 Node Agent 和平台注册问题，还会引入版本矩阵。
作为后续可选渠道，不作为普惠入口。

### Portable Skill Bundle

不依赖 Node/npm，适用于任何能读取 Markdown 或压缩包的 Agent；需要维护 Release
制品、checksum 和下载入口。作为跨平台基线，立即落地。

### Agent Kit

为 Node 用户提供一条命令完成安装、注册、诊断和升级；需要维护平台 Adapter，但不能
替代 Portable Bundle。

**最终建议：采用 Portable Skill Bundle + Agent Kit，保留 CLI 内嵌 Skill，延后独立
npm Skill 包。**

## 11. 完成标准

### 普惠路径

无 Node 环境的 Agent 可以下载 Skill Bundle，读取 `SKILL.md`，理解 Quick Card 和
Card Package，并明确知道缺少 CLI 校验能力。

### Node 路径

Node Agent 可以安装 CLI/Profile，读取 Skill，执行 `validate`、`verify`、`dev`，并
使用精确版本的 Render Profile。

### 升级路径

已接入 workspace 可以通过：

```bash
octo-card agent upgrade --check
octo-card agent doctor
```

判断是否可升级、是否发生版本漂移，并使用 lockfile 回滚到上一套可用工具链。

### 质量路径

Skill Bundle、CLI Runtime、Profile 制品和 Agent Adapter 有独立发布检查，最终 Agent
体验由外部 consumer workspace 集成测试验收。
