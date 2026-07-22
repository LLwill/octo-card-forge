# Octo Card Forge

面向外部 AI Agent 和开发者的 Adaptive Cards 设计、校验、预览和运行时编译工具。

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

## 系统边界

- 业务后端负责：领域模型 → Card ViewModel。
- Card Forge 负责：Card ViewModel → 标准 Adaptive Card JSON。
- Octo Web 负责：标准 JSON + 固定 Render Profile → 最终 UI。
- 外部 Agent 通过 Skill/CLI 修改 Card Package；平台自身不运行 Agent。

## 当前命令

```text
octo-card list
octo-card init docs.share-notification --name "文档分享通知"
octo-card contract docs.access-request
octo-card inspect docs.access-request [--sample pending]
octo-card handoff docs.access-request [--output dist]
octo-card render docs.access-request --sample pending
octo-card check [docs.access-request] [--format json]
octo-card dev [docs.access-request] [--port 4318]
```

## 后端接入

后端先查看契约，再手动把自己的领域模型映射成 Card ViewModel：

```bash
pnpm cli contract docs.access-request
```

也可以从页面点击“导出后端交付包”，或使用 CLI 生成同一份 ZIP：

```bash
pnpm cli handoff docs.access-request --output dist
```

ZIP 解压后包含 `manifest.json`、数据契约、模板、Samples、Goldens、交互报告和接入说明。

开发阶段可调用本地 Render API：

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

## 版本说明

Card Package 使用 Manifest v2：每个 View 显式声明 `wireProfile`，Action/Input/Toggle 只在标准 Adaptive Card JSON 中定义，不再维护 `interactions.json`。MVP 阶段 Card/Contract/Render Profile 版本由 Git 评审。
