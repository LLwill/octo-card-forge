# Octo Card Forge

面向外部 AI Agent 和开发者的 Adaptive Cards 设计、校验、预览和制品发布工具。

当前实现使用 TypeScript `adaptivecards-templating` 驱动本地 Preview、CLI、check 和
handoff。目标生产架构是同源 Go/WASM Template Renderer：Server 使用原生 Go，Forge
Preview 使用同源 WASM；该目标仍处于 Proposal 阶段。

当前 MVP 打通：

```text
Card Package + 示例业务数据
  → 数据契约校验
  → Adaptive Cards 官方模板编译
  → Octo Wire Profile 与渲染能力校验
  → 完整标准 Adaptive Card JSON
  → 本地 Catalog / Render API
```

## 快速开始

```bash
pnpm install
pnpm cli init docs.share-notification --name "文档分享通知"
pnpm cli list
pnpm cli check docs.access-request
pnpm cli inspect docs.access-request --sample pending
pnpm cli render docs.access-request --sample pending
pnpm cli discover skeleton
pnpm cli explain utility line-skeleton
pnpm cli lint docs.access-request --format json
pnpm dev
```

打开 `http://127.0.0.1:4318`，可切换待处理、已允许、已拒绝示例，编辑业务数据并实时查看组装结果。

组件基线位于 `http://127.0.0.1:4318/components`。它固定使用仓库当前唯一的
HostConfig，分别展示文字、容器、布局、图片、FactSet、Table、Inputs 和 Actions，
并提供 320 / 480 / 640 三档宽度，作为 Render Profile 升级前后的视觉回归入口。

已发布 Card Package 保留在 `cards/<card-id>/`；新版本放在
`cards/<card-id>/versions/<version>/`，不得覆盖原目录。CLI/API 使用
`<card-id>@<version>` 显式选择新版本，例如：

```bash
pnpm cli check ai.decision-action@0.2.0
pnpm cli render docs.access-request@0.3.0 --sample pending
```

当前候选 Render Profile 可生成 Web 直接安装的不可变制品：

```bash
pnpm cli profile bundle octo-chat@1.2.0-rc.1 --output .release
pnpm cli profile pack octo-chat@1.2.0-rc.1 --output .release
```

打包结果为 `.release/mlt-org-octo-card-profile-octo-chat-1.2.0-rc.1.tgz`。
`render-profiles/octo-chat/` 只保存当前候选 Profile 源码；历史精确版本由制品库保存，
需要复现旧卡时从对应 card/profile 制品重新渲染，不在本仓预览。

## 系统边界

- 业务后端负责：领域模型 → Card ViewModel。
- Card Forge 负责：Template、ViewModel Schema、Samples、Preview、校验和制品发布。
- 目标 Shared Go Template Renderer 负责：Template + ViewModel + Runtime Binding → 标准 Adaptive Card JSON。
- Octo Server 负责：真实 Action/Input Runtime Binding、metadata、最终安全校验和发送/更新。
- Octo Web 负责：标准 JSON + 固定 Render Profile → 最终 UI。
- 外部 Agent 通过 Skill/CLI 修改 Card Package；平台自身不运行 Agent。

当前生产后端仍使用现有 Go Builder；目标 Renderer 不应被理解为已经实现。

## 文档导航

- [`docs/architecture-design.md`](docs/architecture-design.md)：总体架构入口，区分当前实现与目标架构。
- [`docs/shared-go-renderer-design.md`](docs/shared-go-renderer-design.md)：同源 Go/WASM Template Renderer Proposal。
- [`docs/render-profile-integration-rollout.md`](docs/render-profile-integration-rollout.md)：Web Render Profile、CSS 隔离与跨仓上线顺序。
- [`docs/cli-skill-and-component-system.md`](docs/cli-skill-and-component-system.md)：CLI/Skill 边界、平台组件词汇表、晋升制与发布节奏。
- [`docs/octo-card-utility-system-development-plan.md`](docs/octo-card-utility-system-development-plan.md)：Tailwind-like `id` utility、Profile 超集、校验、CSS 对账和发布边界的开发落地计划。
- [`docs/octo-card-utility-core-development.md`](docs/octo-card-utility-core-development.md)：Utility Core 的文件级开发任务、函数签名、错误码、测试和验收标准。
- [`docs/repo-free-card-authoring-implementation.md`](docs/repo-free-card-authoring-implementation.md)：让 Agent 不 clone Forge、只用可分发 CLI/Profile 开发卡片的实施方案。

术语约定：Template Renderer 生成 Card JSON；Web Renderer 使用 Card JSON 和 Render
Profile 生成 DOM。两者不是同一个组件。

## 当前命令

```text
octo-card list
octo-card discover [skeleton] [--profile octo-chat@latest] [--format json]
octo-card explain utility line-skeleton [--profile octo-chat@latest] [--format json]
octo-card lint [docs.access-request] [--card ./docs.access-request] [--format json]
octo-card presets [--format json]
octo-card init docs.share-notification --name "文档分享通知" [--out ./docs.share-notification] [--preset docs-forward]
octo-card contract docs.access-request
octo-card inspect docs.access-request [--card ./docs.access-request] [--sample pending]
octo-card handoff docs.access-request [--output handoff]
octo-card handoff --card ./docs.access-request [--output handoff]
octo-card render docs.access-request --sample pending
octo-card render --card ./docs.access-request --sample pending
octo-card emit --card ./docs.access-request --sample pending
octo-card check [docs.access-request] [--card ./docs.access-request] [--format json]
octo-card dev [docs.access-request] [--card ./docs.access-request] [--host 127.0.0.1] [--port 4318]
```

需要让同一局域网设备访问 Catalog 时，显式监听全部网卡：

```bash
pnpm dev -- --host 0.0.0.0
```

然后通过 `http://<本机局域网IP>:4318/` 访问。Catalog/Render API 当前没有认证，只应在可信局域网临时开放。

## 后端接入

后端先查看契约，再手动把自己的领域模型映射成 Card ViewModel：

```bash
pnpm cli contract docs.access-request
```

也可以从页面点击“导出后端交付包”，或使用 CLI 生成同一份 ZIP：

```bash
pnpm cli handoff docs.access-request --output handoff
```

ZIP 解压后包含 `manifest.json`、数据契约、模板、Samples、Goldens、交互诊断报告、
resolved Render Profile manifest / capabilities 和接入说明。交互报告用于 Preview/诊断，
不是后端业务 Action 契约。

开发阶段可调用本地 Render API。它服务 Catalog 和联调，不是生产消息链路依赖：

```http
POST /api/render
Content-Type: application/json

{
  "cardId": "docs.access-request",
  "view": "pending",
  "data": {}
}
```

返回值中的 `payload` 是完整标准 Adaptive Card JSON，`wireProfile` 指明发送时使用的 Octo 协议档位；契约不满足时返回 422 和具体字段错误。Catalog 还提供：

- `GET /api/cards`
- `GET /api/cards/:id/contract`
- `GET /api/cards/:id/context`
- `GET /api/cards/:id/handoff`
- `GET /api/cards/:id/views/:view/template`
- `GET /api/cards/:id/samples/:sample`
- `GET /api/render-styles/:renderProfile`

## Agent 使用

仓库内置 [`octo-design-cards`](skills/octo-design-cards/SKILL.md) Skill。外部 Agent 使用该 Skill 创建或修改 Card Package，并理解数据契约、标准 Action/Input、Render Profile、版本规则和必跑校验；Card Forge 自身不运行 Agent。

Agent 不应凭提示词记忆 Profile 能力。需要查找样式能力时使用：

```bash
pnpm cli discover [query] --format json
pnpm cli explain utility <token> --format json
pnpm cli lint [card-id] --format json
```

`discover` 从当前 Render Profile 的 `capabilities.utilities` 返回可用 token、适用元素、
fallback 和 `octo--<token>--uid-*` 写法；`explain` 给出单个 token 的组合规则和标准
Adaptive Card 示例；`lint` 在常规校验之外列出每个 sample 实际使用的 utility id/token。
Repo-free 试点路径可用 `--card <dir>` 指向单卡目录，并用 `--profile-package <dir-or-package>`
或 `--profile-dir <dir>` 显式指定 Render Profile 来源。

Agent 侧不需要 clone 本仓库即可完成单卡开发闭环。典型流程是安装 CLI 与目标
Render Profile 包后，在自己的工作目录中生成、预览、校验和交付：

```bash
pnpm add -D @mlt-org/octo-card-cli @mlt-org/octo-card-profile-octo-chat
pnpm exec octo-card discover skeleton --format json
pnpm exec octo-card presets --format json
pnpm exec octo-card init bot.token-view --name "Bot Token 查看" --out ./bot.token-view --preset bot-token
pnpm exec octo-card dev --card ./bot.token-view
pnpm exec octo-card check --card ./bot.token-view --format json
pnpm exec octo-card lint --card ./bot.token-view --format json
pnpm exec octo-card emit --card ./bot.token-view --sample default > card.json
pnpm exec octo-card handoff --card ./bot.token-view --output handoff
```

这里 `--out` 创建的是一个独立 Card Package 目录；后续 `--card` 都指向这个目录。
CLI 会优先读取已安装的 profile package，找不到时才回退到 Forge 仓库源码，方便平台开发。

## 质量检查

```bash
pnpm typecheck
pnpm test
pnpm cli check --format json
pnpm smoke:repo-free-agent
```

创建真实 Agent 验证用的消费者工作区：

```bash
pnpm prepare:agent-validation -- --scenario bot-token
pnpm prepare:agent-validation -- --scenario docs-forward
```

脚本会打包当前 CLI/Profile，本地安装到临时目录，并写入 `AGENTS.md` 与 `TASK.md`。
随后在该临时目录新开 Codex task，只让 Agent 完成 `TASK.md`，才能验证它是否自然使用
`octo-card` 而不是回到 Forge 仓库工作流。

## Render Profile

卡片 `manifest.renderProfile` 支持：

- 具体版本（如 `octo-chat@1.0.0` / `octo-chat@1.2.0-rc.1`）：钉死，用于历史复现
- `octo-chat@latest`：跟随仓库当前基线 `CURRENT_RENDER_PROFILE`
- 省略字段：等价于 `@latest`

`octo-card init` 默认写入 `octo-chat@latest`。升级基线时更新
`render-profiles/octo-chat/manifest.json` 中的版本和 `src/registry.ts` 中的
`CURRENT_RENDER_PROFILE`；跟随 latest 的卡无需批量改 manifest。编译结果中的
`renderProfile` 会解析成具体版本。

开发规范：不要在 `render-profiles/` 下新增版本目录来保存制品。修改
`render-profiles/octo-chat/` 当前源码，通过 `pnpm cli profile bundle/pack` 生成不可变制品；
已发布版本由 npm / 制品库保存。Forge Catalog 和默认 `cli check` 只覆盖当前 workspace
profile 可渲染的 Card Package；历史 Card Package 由制品库负责重渲染。

## 发布

普通分支 push 和 PR 不会发布 npm 包。PR 只运行验证；合并到 `main` 也只运行 CI 和
候选 artifact 打包。真正发布需要手动 workflow，或在已经合入 `main` 的 commit 上打 tag。

发布 Agent 侧 CLI：

```bash
git tag octo-card-cli/v0.1.0
git push origin octo-card-cli/v0.1.0
```

这会触发 `publish-octo-card-cli`，验证 `package.json` 中的
`@mlt-org/octo-card-cli@0.1.0`，运行 `typecheck/test/check/smoke:repo-free-agent`，
打包并发布 `@mlt-org/octo-card-cli`。

发布 Render Profile：

```bash
git tag render-profile/octo-chat/v1.2.0-rc.1
git push origin render-profile/octo-chat/v1.2.0-rc.1
```

这会触发 `publish-render-profile`，验证 `render-profiles/octo-chat/manifest.json` 中的
`@mlt-org/octo-card-profile-octo-chat@1.2.0-rc.1`，打包并以 `next` tag 发布。

两个发布 workflow 都要求 tag 指向已经合入 `main` 的 commit，并使用 `npm-publish`
environment 与 `NPM_TOKEN`。

## 版本说明

Card Package 使用 Manifest v2：每个 View 显式声明 `wireProfile`，不再人工维护
`interactions.json`。当前 Forge 可从 Preview JSON 提取 Action/Input/Toggle 作为诊断信息；
目标架构中的真实 Action/Input Runtime Binding 与最终校验由 Server 负责。MVP 阶段
Card/Contract/Render Profile 版本由 Git 评审。
