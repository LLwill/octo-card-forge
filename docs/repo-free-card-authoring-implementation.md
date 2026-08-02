# Repo-free Card Authoring 实施方案

> 状态：实施方案草案  
> 日期：2026-07-31  
> 适用范围：`octo-card-forge`、未来可分发 `octo-card` CLI、`octo-design-cards` Skill、Render Profile 制品、卡片开发 Agent  
> 核心目标：新的 Agent 生成标准 Adaptive Card JSON 时，不需要 clone 整个 forge 仓库，只需要安装/调用 CLI、读取 Profile 能力、编辑轻量 Card Package。

## 1. 背景与问题

当前 `octo-card-forge` 已经具备：

- 标准 Adaptive Card 模板编译；
- ViewModel JSON Schema 校验；
- Render Profile capabilities 校验；
- Tailwind-like `octo--...--uid-*` utility token；
- `discover / explain / lint` Agent CLI；
- Render Profile `bundle / pack` 制品生成；
- 本地 Catalog / Components 展示页。

但现在这些能力仍然主要绑定在 forge 源码仓库中：

```text
Agent 想生成卡片
  -> 需要进入 octo-card-forge repo
  -> 使用 repo 内 pnpm cli
  -> 读 repo 内 cards/
  -> 读 repo 内 render-profiles/
```

这对平台开发者是合理的，但对卡片开发 Agent 不合理。

如果一个 Agent 只是要生成一张卡片 JSON，却必须 clone 整个工具链源码，那么：

1. Skill 的“告诉 Agent 怎么工作”价值被削弱；
2. CLI 的“工具能力封装”价值被削弱；
3. Render Profile 制品化没有真正完成消费闭环；
4. 卡片开发和平台工具链开发被错误绑定；
5. 后续接入第三方 Agent、CI、低代码系统、后端服务都会变重。

本方案的目标是把 forge 从“Agent 的工作目录”降级为“平台团队维护工具链的源码仓库”，让 Agent 面向一个可分发 CLI 和一个轻量 Card Workspace 工作。

## 2. 角色边界

### 2.1 平台开发者

平台开发者维护：

```text
octo-card-forge repo
  -> core compiler / validator
  -> CLI package source
  -> Render Profile source
  -> Components showcase
  -> tests / docs / release workflow
```

平台开发者需要 clone forge 仓库，因为他们改的是工具链本身。

### 2.2 卡片开发 Agent

卡片开发 Agent 只应该面对：

```text
octo-card CLI
octo-design-cards Skill
@mlt-org/octo-card-profile-octo-chat
一个 card package 目录
```

它不应该知道 forge 的源码结构，也不应该依赖 `render-profiles/`、`cards/` 在同一个仓库中。

### 2.3 Web Renderer

Web Renderer 消费标准 Adaptive Card JSON 和已发布 Render Profile：

```text
Adaptive Card JSON + render_profile
  -> octo-chat/v1
  -> Web 映射到某个精确 profile package
  -> DOM + CSS
```

Web 不依赖 forge repo。

### 2.4 业务后端

业务后端可以消费：

- Card ViewModel schema；
- handoff 包；
- 编译后的 golden Adaptive Card JSON；
- 交互诊断报告。

业务后端不依赖 forge repo。

## 3. 目标用户体验

### 3.1 新 Agent 开发卡片

理想流程：

```bash
octo-card discover warning --profile octo-chat@latest
octo-card explain utility surface-warning --profile octo-chat@latest
octo-card presets --format json

octo-card init bot.token-view \
  --name "Bot Token 查看" \
  --out ./bot.token-view \
  --preset bot-token \
  --render-profile octo-chat@latest

octo-card verify --card ./bot.token-view --emit-dir compiled --handoff handoff
octo-card render --card ./bot.token-view --sample pending > card.json
```

Agent 的工作目录只包含这张卡：

```text
bot.token-view/
├── manifest.json
├── contract/
│   └── data.schema.json
├── samples/
│   ├── pending.json
│   └── visible.json
└── templates/
    └── default.template.json
```

### 3.2 只生成一次 JSON

某些场景不需要长期维护 Card Package，只要一次性生成 JSON。CLI 仍应支持，但需要显式标记为临时模式：

```bash
octo-card render \
  --template ./template.json \
  --data ./sample.json \
  --profile octo-chat@latest \
  --wire-profile octo/v2 \
  > card.json
```

该模式适合调试和快速转换，不推荐作为正式卡片生命周期管理方式。

### 3.3 CI 中校验卡片目录

```bash
octo-card check --card ./cards/bot.token-view --format json
octo-card lint --card ./cards/bot.token-view --format json
octo-card render --card ./cards/bot.token-view --sample pending > golden.json
```

CI 不需要 checkout forge repo，只需要安装 CLI 和 profile package。

## 4. 最终架构

```text
                octo-design-cards Skill
                         |
                         v
              installed octo-card CLI
                         |
        +----------------+----------------+
        |                                 |
        v                                 v
  Card Workspace                  Profile Resolver
  manifest/templates              @mlt-org/octo-card-profile-octo-chat
  schema/samples                  or local cache / registry
        |                                 |
        +----------------+----------------+
                         |
                         v
                  octo-card core
          compile / validate / inspect / lint
                         |
                         v
              standard Adaptive Card JSON
```

Forge 仓库变成：

```text
octo-card-forge
  packages/core
  packages/cli
  render-profiles/octo-chat
  skills/octo-design-cards
  web showcase
  tests
  docs
```

Agent 使用的是发布产物，不是源码目录。

## 5. 包拆分设计

### 5.1 `@mlt-org/octo-card-core`

核心库，纯逻辑，不读固定 repo 路径。

负责：

- compile template；
- validate ViewModel schema；
- validate Adaptive Card payload；
- parse utility id；
- inspect Action/Input/Toggle；
- lint utility usage；
- load Card Package from explicit directory；
- load Render Profile from resolver 传入的对象。

不负责：

- dev server；
- web showcase；
- npm pack；
- 默认读取 `cards/`；
- 默认读取 `render-profiles/`。

建议 API：

```ts
export interface CardPackageSource {
  root: string;
  manifest: CardManifest;
}

export interface RenderProfileSource {
  reference: string;
  manifest: RenderProfileManifest;
  capabilities: RenderCapabilities;
  hostConfig: Record<string, unknown>;
  stylesheets?: string[];
}

export async function loadCardPackage(root: string): Promise<CardPackageSource>;
export async function compileCardPackage(options: {
  card: CardPackageSource;
  profile: RenderProfileSource;
  view: string;
  data: JsonObject;
}): Promise<CompileResult>;
```

### 5.2 `@mlt-org/octo-card-cli`

可执行 CLI，Agent 和 CI 的主要入口。

负责：

- 参数解析；
- card workspace 创建；
- profile resolution；
- 调用 core；
- 输出 JSON / text；
- 本地 preview server。

发布 bin：

```json
{
  "bin": {
    "octo-card": "dist/cli.js"
  }
}
```

典型安装方式：

```bash
pnpm add -D @mlt-org/octo-card-cli
pnpm exec octo-card discover
```

或一次性：

```bash
pnpm dlx @mlt-org/octo-card-cli discover
```

### 5.3 `@mlt-org/octo-card-profile-octo-chat`

Render Profile 制品，已经有 pack 基础。

负责提供：

```text
dist/manifest.json
dist/host-config.json
dist/theme.css
dist/styles.css
dist/tokens.json
dist/capabilities.json
dist/bundle-manifest.json
```

建议 package exports：

```json
{
  "exports": {
    "./manifest.json": "./dist/manifest.json",
    "./host-config.json": "./dist/host-config.json",
    "./theme.css": "./dist/theme.css",
    "./styles.css": "./dist/styles.css",
    "./tokens.json": "./dist/tokens.json",
    "./capabilities.json": "./dist/capabilities.json",
    "./bundle-manifest.json": "./dist/bundle-manifest.json"
  }
}
```

CLI 可以通过 package exports 加载这些文件。

### 5.4 `octo-design-cards` Skill

Skill 不应要求 clone forge repo。它应该要求：

1. 确认 `octo-card` CLI 可用；
2. 如果不可用，提示安装或由运行环境提供；
3. 使用 `discover / explain` 查询能力；
4. 只编辑 card package；
5. 运行 `check / lint / inspect / render`；
6. 输出标准 Adaptive Card JSON 或 handoff。

Skill 的核心句式应从：

```text
Work from the Octo Card Forge repository root.
```

调整为：

```text
Work in the card package workspace. Use the installed octo-card CLI.
Do not clone or edit octo-card-forge unless explicitly asked to change the platform tooling.
```

## 6. CLI 命令设计

### 6.1 当前 repo-bound 命令问题

当前实现中的隐性假设：

| 位置 | 当前假设 | Repo-free 问题 |
| --- | --- | --- |
| `src/fs.ts` | `projectRoot()` 默认源码根 | 发布 CLI 后源码根不是用户 workspace |
| `registry.ts` | 从 `cards/` 列卡 | 单张卡目录不在 `cards/` 下 |
| `getRenderProfile()` | 从 `render-profiles/` 读 profile | Agent 应从 profile package 读 |
| `dev` | 服务 forge web 目录 | Agent 需要轻量 preview，不一定需要完整 forge catalog |
| `profile pack` | 平台发布命令 | 普通 Agent 不应使用 |

所以要把 CLI 分成两组：

```text
Authoring commands  给卡片开发 Agent
Platform commands   给 forge 平台开发者
```

### 6.2 Authoring commands

这些命令必须 repo-free。

```text
octo-card presets [--format json]
octo-card init <card-id> --name <name> --out <dir> [--preset <preset-id>]
octo-card discover [query] [--profile octo-chat@latest]
octo-card explain utility <token> [--profile octo-chat@latest]
octo-card check --card <dir>
octo-card lint --card <dir>
octo-card verify --card <dir> [--emit-dir <dir>] [--handoff <dir>]
octo-card inspect --card <dir> [--sample <name>]
octo-card render --card <dir> --sample <name>
octo-card render --template <file> --data <file> --profile <profile> --wire-profile <wire>
octo-card handoff --card <dir> --output <dir>
octo-card dev --card <dir> --host 127.0.0.1 --port 4318
```

### 6.3 Platform commands

这些命令保留给 forge repo。

```text
octo-card profile validate <profile>
octo-card profile bundle <profile>
octo-card profile pack <profile>
octo-card components
octo-card catalog --workspace <forge-root>
```

平台命令可以继续依赖 forge 源目录，但必须显式。

### 6.4 兼容现有命令

为了不一次性打断现有开发，可以保留旧形式：

```bash
pnpm cli check docs.access-request
pnpm cli render docs.access-request --sample pending
```

但 repo-free 新形式应成为文档主路径：

```bash
octo-card check --card ./docs.access-request
octo-card render --card ./docs.access-request --sample pending
```

## 7. Profile Resolution 设计

### 7.1 输入形式

CLI 支持：

```text
octo-chat@latest
octo-chat@1.2.0-rc.1
file:/absolute/path/to/profile-package
dir:/absolute/path/to/render-profiles/octo-chat
```

其中：

- `octo-chat@latest`：解析为当前默认发布版本；
- `octo-chat@x.y.z`：解析为精确 npm package；
- `file:` / `dir:`：用于平台开发和本地调试。

### 7.2 加载顺序

建议顺序：

```text
1. --profile-dir 显式本地目录
2. --profile-package 显式 npm package 路径
3. node_modules 中已安装的 @mlt-org/octo-card-profile-<id>
4. CLI 内置默认 profile mapping
5. 远程 registry/cache（后续阶段）
```

MVP 不建议直接联网自动下载 profile，先要求项目或 Agent 环境安装 CLI/profile，避免供应链和离线问题复杂化。

### 7.3 latest 的处理

运行时消息只应该保存兼容代际，例如：

```json
{
  "render_profile": "octo-chat/v1"
}
```

但 CLI authoring 可以接受：

```text
octo-chat@latest
```

CLI 编译结果中应解析为精确版本：

```json
{
  "renderProfile": "octo-chat@1.2.0-rc.1"
}
```

这样可以同时满足：

- Agent 不必记最新版本；
- golden / handoff 可复现；
- Web 仍按兼容代际消费。

## 8. Card Workspace 规范

### 8.1 单卡目录

正式卡片目录：

```text
<card-id>/
├── manifest.json
├── contract/
│   └── data.schema.json
├── samples/
│   └── <sample>.json
└── templates/
    └── <view>.template.json
```

### 8.2 多卡 workspace

多卡项目可以有：

```text
cards/
├── bot.token-view/
└── docs.access-request/
```

CLI 支持：

```bash
octo-card list --workspace ./cards
octo-card check --workspace ./cards
octo-card check --card ./cards/bot.token-view
```

### 8.3 配置文件

可选 `octo-card.config.json`：

```json
{
  "defaultProfile": "octo-chat@latest",
  "defaultWireProfile": "octo/v2",
  "cardsRoot": "cards",
  "profilePackages": {
    "octo-chat": "@mlt-org/octo-card-profile-octo-chat"
  }
}
```

配置文件不是必须。单卡目录应零配置可用。

## 9. Skill 工作流更新

### 9.1 新 Agent 开发卡片的 Skill 指令

Skill 应要求 Agent：

1. 不 clone forge；
2. 检查 `octo-card --help`；
3. 运行 `octo-card discover --format json`；
4. 根据需求运行 `octo-card explain utility <token> --format json`；
5. `octo-card init --out <dir>` 创建卡片目录；
6. 先写 contract，再写 samples，再写 templates；
7. 用 utility id 时保留 fallback；
8. 跑 `check / lint / inspect / render`；
9. 最后输出 `card.json` 或 handoff。

### 9.2 Skill 禁令

必须明确禁止：

- 为生成一张卡片 clone forge；
- 修改 Render Profile 完成单卡需求；
- 发明 utility token；
- 发明 `octo-*` family；
- 跳过 `discover/explain` 直接凭记忆写样式；
- 只交视觉截图不交校验结果。

### 9.3 Agent 最小命令序列

```bash
octo-card discover --format json
octo-card presets --format json
octo-card init <card-id> --name "<name>" --out ./<card-id> [--preset <preset-id>]
octo-card verify --card ./<card-id> --emit-dir compiled --handoff handoff --format json
octo-card inspect --card ./<card-id> --format json
octo-card render --card ./<card-id> --sample <sample> > card.json
```

## 10. 实施分阶段

### Phase 0：文档与决策

目标：确认 repo-free 是正式方向。

交付：

- 本文档；
- 更新 README / Skill，明确“Agent 不 clone forge”；
- 标记现有 `pnpm cli` 是平台开发入口，不是最终 Agent 入口。

验收：

- 文档能解释平台开发者和卡片开发 Agent 的边界；
- 新 Agent 流程不出现 `git clone octo-card-forge`。

### Phase 1：路径依赖解耦

状态：已开始落地。当前已支持显式 `--card <dir>` 的 `check`、`lint`、`inspect`
和 `render --sample` 路径；Profile 仍从 forge 当前 registry 加载，尚未切到 npm
profile package resolver。

目标：core 能加载显式 card directory 和显式 profile source。

任务：

- 新增 `loadCardPackage(root)`；
- 新增 `loadWorkspace(root)`；
- 新增 `loadProfileFromPackage()`；
- 将 `compileCard` 拆成：
  - repo-bound wrapper；
  - source-based pure function；
- 将 `checkCards` 拆成：
  - `checkWorkspace(root)`；
  - `checkCardPackage(root)`；
- `lintCardsForAgent` 支持 `--card <dir>`。

验收：

```bash
octo-card check --card ./tmp/bot.token-view
octo-card lint --card ./tmp/bot.token-view
octo-card render --card ./tmp/bot.token-view --sample pending
```

不读取 forge `cards/`。

### Phase 2：Profile package 消费

状态：已落地。当前 CLI 已支持 `--profile-dir <dir>` 和
`--profile-package <dir-or-package>`，可从 `profile bundle/pack` 生成的 package
目录读取 manifest、host config、capabilities 和 stylesheets；未显式传入时会优先
尝试解析已安装的默认 npm profile package，例如
`@mlt-org/octo-card-profile-octo-chat`，找不到时才回退到 Forge workspace 源码。

目标：CLI 不读取 forge `render-profiles/` 也能 discover/explain/check/render。

任务：

- 调整 profile bundle package exports；
- 实现 profile package resolver；
- `discover/explain` 默认从 installed profile package 加载；
- 支持 `--profile-dir` 给平台本地调试；
- `profile validate/bundle/pack` 继续只在平台模式使用。

验收：

在一个空临时目录：

```bash
pnpm add -D @mlt-org/octo-card-cli @mlt-org/octo-card-profile-octo-chat
pnpm exec octo-card discover skeleton --format json
```

不需要 forge repo。

### Phase 3：CLI 包发布

状态：已完成发布准备，尚未真实发布到 npm。当前 package 已改为
`@mlt-org/octo-card-cli`，具备 `octo-card` bin、`pnpm build`、`dist/` 输出、
package metadata 测试、安装 tarball + profile tarball 的 repo-free smoke test，
以及 `publish-octo-card-cli` npm 发布 workflow。

目标：发布 `@mlt-org/octo-card-cli`。

任务：

- 将当前 package 拆为 workspace 或独立 package；
- 编译 TypeScript 到 `dist/`；
- 添加 bin；
- 去掉运行时 `tsx` 依赖；
- 将 web showcase/dev server 依赖放到平台包或 optional；
- 增加 package-level tests；
- 增加 release workflow。
- 发布 tag 约定为 `octo-card-cli/v<version>`。

验收：

```bash
pnpm dlx @mlt-org/octo-card-cli --help
pnpm dlx @mlt-org/octo-card-cli discover
```

可运行。

### Phase 4：Repo-free init/dev/handoff

状态：已落地主要闭环。`init --out <dir>`、`dev --card <dir>`、
`handoff --card <dir>`、`check/lint/render/emit/inspect --card <dir>` 均已支持。
`emit` 是 `render` 的别名，用于强调输出的是最终标准 Adaptive Card JSON。

目标：Agent 端完整开发闭环。

任务：

- `init --out <dir>` 创建单卡目录；
- `dev --card <dir>` 提供轻量预览；
- `handoff --card <dir>` 输出交付包；
- `render --card <dir> --sample <name>` 输出标准 JSON；
- 增加 `emit` alias 可选：

```bash
octo-card emit --card ./bot.token-view --sample pending
```

验收：

从空目录完成：

```bash
octo-card init bot.token-view --name "Bot Token 查看" --out ./bot.token-view --preset bot-token
octo-card dev --card ./bot.token-view
octo-card check --card ./bot.token-view
octo-card emit --card ./bot.token-view --sample default > card.json
octo-card handoff --card ./bot.token-view --output handoff
```

### Phase 5：Skill 发布与 Agent 验证

状态：已开始落地。`octo-design-cards` Skill 已改为默认 repo-free authoring；
新增 `pnpm smoke:repo-free-agent`，会打包 CLI/Profile，在临时空目录安装后只通过
`octo-card` 命令完成 `discover/init/check/lint/emit/handoff`。
新增 `pnpm prepare:agent-validation` 用于创建真实验证 workspace；它只安装
CLI/Profile 包并写入 `TASK.md`，实际产卡由新会话在该 workspace 中完成。

目标：用新 Skill 驱动一个全新 Agent 产卡。

任务：

- 更新 `octo-design-cards`；
- 写“新 Agent 首次开发卡片”测试脚本；
- 选择一个真实卡片试点，例如 Bot Token 查看卡；
- 要求 Agent 只能调用 `octo-card`，不能进入 forge repo；
- 记录生成过程中的 discover/explain/lint 输出。

验收：

- Agent 生成标准 Adaptive Card JSON；
- `check/lint/inspect` 通过；
- 没有 clone forge；
- 没有改 profile；
- 生成结果在 octo-chat profile 下可渲染。

## 11. 当前代码需要改造的关键点

### 11.1 `src/fs.ts`

当前：

```ts
const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
```

问题：发布后的 `SOURCE_ROOT` 是 CLI 包安装目录，不是用户 workspace。

改造：

- 保留 `projectRoot()` 只给平台模式；
- 新增显式路径参数；
- core 函数不再隐式调用 `resolveInProject()`。

### 11.2 `src/registry.ts`

当前：

```text
listCards() -> resolveInProject("cards")
getRenderProfile() -> resolveInProject("render-profiles", id)
```

改造：

- `listCards(root)` 接受 workspace root；
- `getCardByDirectory(root)`；
- `getRenderProfile()` 拆成：
  - `getLocalRenderProfile()` 平台模式；
  - `resolveProfilePackage()` authoring 模式。

### 11.3 `src/compiler.ts`

当前 `compileCard({ cardId, view, data })` 强依赖 `getCard()`。

改造：

```ts
compileCardPackage({
  card,
  profile,
  view,
  data
})
```

旧函数保留为 wrapper。

### 11.4 `src/check.ts`

当前 `checkCards(cardId?)` 强依赖 workspace cards registry。

改造：

```ts
checkCardPackage(root)
checkWorkspace(root)
```

旧函数保留为 forge catalog wrapper。

### 11.5 `src/agent.ts`

当前 `discover/explain` 可以继续复用，但 profile source 应改为 resolver 传入。

改造：

```ts
discoverUtilities({ profileSource })
explainUtility({ profileSource, token })
lintCardPackageForAgent({ cardRoot, profileResolver })
```

### 11.6 `src/cli.ts`

当前 CLI 参数围绕 repo 内 card id。

改造：

- 增加 `--card <dir>`；
- 增加 `--workspace <dir>`；
- 增加 `--profile-dir <dir>`；
- 增加 `--profile-package <package>`；
- repo-bound 参数作为兼容路径保留。

## 12. 安全与供应链考虑

### 12.1 不自动执行模板代码

Adaptive Cards template expansion 只处理 JSON 和表达式，不允许加载任意 JS。

### 12.2 不默认联网拉 profile

MVP 不做自动下载：

- 避免 Agent 环境不可控；
- 避免 latest 被远程悄悄改变；
- 避免供应链风险。

需要 profile 时由项目依赖或运行环境预安装。

### 12.3 精确版本写入 handoff

即使 manifest 使用 `octo-chat@latest`，handoff / render report 必须记录解析后的精确版本。

### 12.4 不允许卡片私有 CSS

Repo-free 后更要保持：

- card package 只包含标准 Adaptive Card template；
- 不包含 CSS；
- 不包含 renderer plugin；
- 不包含私有 JS。

## 13. 验收标准

### 13.1 Agent 侧验收

在没有 forge repo 的临时目录：

```bash
pnpm init -y
pnpm add -D @mlt-org/octo-card-cli @mlt-org/octo-card-profile-octo-chat
pnpm exec octo-card discover skeleton --format json
pnpm exec octo-card presets --format json
pnpm exec octo-card init bot.token-view --name "Bot Token 查看" --out ./bot.token-view --preset bot-token
pnpm exec octo-card check --card ./bot.token-view --format json
pnpm exec octo-card lint --card ./bot.token-view --format json
pnpm exec octo-card emit --card ./bot.token-view --sample default > card.json
```

预期：

- 所有命令成功；
- `card.json` 是标准 Adaptive Card JSON；
- 不读取 forge repo；
- 不要求 `OCTO_CARD_FORGE_ROOT`。

### 13.2 Profile 侧验收

```bash
pnpm exec octo-card discover surface --profile octo-chat@latest --format json
pnpm exec octo-card explain utility surface-warning --profile octo-chat@latest --format json
```

预期：

- 从 profile package 读取 capabilities；
- 返回 fallback；
- 返回 id syntax；
- 返回推荐组合。

### 13.3 Web 集成验收

同一张生成的 `card.json`：

- 在 forge preview 中渲染；
- 在 octo-web 消费 profile package 后渲染；
- JSON 不需要携带 CSS；
- `octo--...--uid-*` 样式由 profile 生效；
- 去掉 CSS 时仍有可读 fallback。

### 13.4 CI 验收

在独立 card repo：

```bash
pnpm exec octo-card check --workspace ./cards --format json
pnpm exec octo-card lint --workspace ./cards --format json
```

预期：

- 输出机器可读；
- 失败时 exit code 非 0；
- 能列出所有 issue path。

## 14. 风险与取舍

### 14.1 CLI 包过早抽离的风险

如果 core 逻辑还强依赖 forge 展示页，抽包会造成大量重构。

控制方式：

- 先做路径解耦；
- 再发布 CLI；
- 不先追求完美 monorepo。

### 14.2 latest 语义不清

`octo-chat@latest` 对 Agent 友好，但不利于复现。

控制方式：

- authoring 可用 latest；
- render / handoff 必须写解析后的精确版本；
- 生产消息只保存兼容代际。

### 14.3 profile 自动下载复杂

自动下载能减少安装步骤，但引入网络和安全问题。

控制方式：

- MVP 只支持本地安装；
- 后续再做 cache/registry。

### 14.4 临时 JSON 模式滥用

如果 Agent 总是 `--template --data` 一次性生成，会绕过 card lifecycle。

控制方式：

- 文档推荐 Card Package；
- 临时模式不支持 handoff；
- 正式交付必须有 manifest/schema/samples。

## 15. 推荐下一步

建议下一步不要继续扩 utility token，而是先做 Phase 1：

1. 新增 `loadCardPackage(root)`；
2. 改造 compiler/check/lint 支持 `--card <dir>`；
3. 保留现有 repo-bound 命令作为 wrapper；
4. 增加一个测试：把 `cards/docs.access-request` 复制到临时目录，使用 `--card <tmp>` 校验和渲染；
5. 更新 Skill，明确新 Agent 不 clone forge。

完成 Phase 1 后，再做 Profile package resolver。这样每一步都有独立验收，不会一次性把 CLI、Profile、Skill、Web 全部搅在一起。
