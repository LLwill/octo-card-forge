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
历史 `1.1.0` 保持不变，组件基线与新 Card Package 显式使用 RC 版本。

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

术语约定：Template Renderer 生成 Card JSON；Web Renderer 使用 Card JSON 和 Render
Profile 生成 DOM。两者不是同一个组件。

## 当前命令

```text
octo-card list
octo-card init docs.share-notification --name "文档分享通知"
octo-card contract docs.access-request
octo-card inspect docs.access-request [--sample pending]
octo-card handoff docs.access-request [--output dist]
octo-card render docs.access-request --sample pending
octo-card check [docs.access-request] [--format json]
octo-card dev [docs.access-request] [--host 127.0.0.1] [--port 4318]
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
pnpm cli handoff docs.access-request --output dist
```

ZIP 解压后包含 `manifest.json`、数据契约、模板、Samples、Goldens、交互诊断报告和接入说明。交互报告用于 Preview/诊断，不是后端业务 Action 契约。

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

## 质量检查

```bash
pnpm typecheck
pnpm test
pnpm cli check --format json
```

## Render Profile

卡片 `manifest.renderProfile` 支持：

- 具体版本（如 `octo-chat@1.0.0` / `octo-chat@1.2.0-rc.1`）：钉死，用于历史复现
- `octo-chat@latest`：跟随仓库当前基线 `CURRENT_RENDER_PROFILE`
- 省略字段：等价于 `@latest`

`octo-card init` 默认写入 `octo-chat@latest`。升级基线时只需更新 `src/registry.ts` 中的 `CURRENT_RENDER_PROFILE`（并新增对应 profile 目录），跟随 latest 的卡无需批量改 manifest。编译结果中的 `renderProfile` 会解析成具体版本。

## 版本说明

Card Package 使用 Manifest v2：每个 View 显式声明 `wireProfile`，不再人工维护
`interactions.json`。当前 Forge 可从 Preview JSON 提取 Action/Input/Toggle 作为诊断信息；
目标架构中的真实 Action/Input Runtime Binding 与最终校验由 Server 负责。MVP 阶段
Card/Contract/Render Profile 版本由 Git 评审。
