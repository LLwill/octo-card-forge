# Octo Card Forge

面向外部 AI Agent 和开发者的 Adaptive Cards 设计、校验、预览和运行时编译工具。

当前 MVP 打通：

```text
Card Package + 示例业务数据
  → 数据契约校验
  → Adaptive Cards 官方模板编译
  → Octo Host 能力与安全策略校验
  → 完整标准 Adaptive Card JSON
  → 本地 Catalog / Render API
```

## 快速开始

```bash
pnpm install
pnpm cli list
pnpm cli check docs.access-request
pnpm cli render docs.access-request --sample pending
pnpm dev
```

打开 `http://127.0.0.1:4318`，可切换待处理、已允许、已拒绝示例，编辑业务数据并实时查看组装结果。

## 系统边界

- 业务后端负责：领域模型 → Card ViewModel。
- Card Forge 负责：Card ViewModel → 标准 Adaptive Card JSON。
- Octo Web 负责：标准 JSON + 固定 Host Profile → 最终 UI。
- 外部 Agent 通过 Skill/CLI 修改 Card Package；平台自身不运行 Agent。

## 当前命令

```text
octo-card list
octo-card contract docs.access-request
octo-card render docs.access-request --sample pending
octo-card check [docs.access-request] [--format json]
octo-card dev [docs.access-request] [--port 4318]
```

## 后端接入

后端先查看契约，再手动把自己的领域模型映射成 Card ViewModel：

```bash
pnpm cli contract docs.access-request
```

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

返回值中的 `payload` 是可直接发送的完整标准 Adaptive Card JSON；契约不满足时返回 422 和具体字段错误。Catalog 还提供：

- `GET /api/cards`
- `GET /api/cards/:id/contract`
- `GET /api/cards/:id/context`
- `GET /api/cards/:id/samples/:sample`
- `GET /api/host-styles/:hostProfile`

## Agent 使用

仓库内置 [`design-adaptive-cards`](skills/design-adaptive-cards/SKILL.md) Skill。外部 Agent 使用该 Skill 理解 Card Package、数据契约、交互契约、Host Profile 和必跑校验；Card Forge 自身不运行 Agent。

## 质量检查

```bash
pnpm typecheck
pnpm test
pnpm cli check --format json
```

## 版本说明

MVP 阶段 Card/Contract/Host Profile 版本记录在 manifest 中并由 Git 评审。后续发布系统将在不改变 Card Package 格式的前提下增加不可变制品、环境指针和回滚。
