# Octo Card Forge 总体架构

> 状态：当前有效架构基线
>
> 生效日期：2026-08-20
>
> 适用范围：Card 生产、校验、预览、发布、GitHub 治理以及与 `octo-web`、`octo-server` 的集成

## 0. 文档优先级

本文是 Octo Card Forge 当前唯一的总体架构入口。

当其他历史设计与本文冲突时，以本文和 [`adr/README.md`](./adr/README.md) 中未被取代的决策为准。专项文档可以补充
实现细节，但不能改变本文定义的系统边界。

当前有效配套文档：

| 文档 | 用途 |
| --- | --- |
| [`refactor-roadmap.md`](./refactor-roadmap.md) | 重构顺序、Gate 和迁移范围 |
| [`modules/README.md`](./modules/README.md) | 七个核心模块的索引和统一记录格式 |
| [`repo-free-card-authoring-implementation.md`](./repo-free-card-authoring-implementation.md) | 外部 Agent 和开发者的本地 Card Workspace；其中历史阶段编号已废弃 |
| [`render-profile-integration-rollout.md`](./render-profile-integration-rollout.md) | Render Profile 的独立发布和 Web 消费方式 |
| [`cli-skill-and-component-system.md`](./cli-skill-and-component-system.md) | CLI、Skill 和组件能力边界 |
| [`preview-system-design.md`](./preview-system-design.md) | Preview API v1、revision 和页面接入边界 |

历史 Proposal：

- [`shared-go-renderer-design.md`](./shared-go-renderer-design.md) 保留为研究记录，不是当前重构前置条件；
- 历史文档中关于 Forge Database、内部账号、OIDC、RBAC、HTTP Renderer 或运行时 Registry 的方案
  不属于当前目标。

## 1. 一句话定位

Octo Card Forge 是一套**无状态的 Card 生产与检查工具链**。

它负责定义 Card 契约、编译和校验 Card、生成不可变 Artifact、提供本地 CLI 和 Forge Web，并通过
GitHub 完成评审和发布编排。

它不是：

- Card 内容数据库；
- 用户和权限系统；
- 在线协同编辑器；
- 生产消息运行时；
- 新的 Template Renderer 服务；
- `octo-web` 或 `octo-server` 的替代品。

## 2. 当前约束与目标

### 2.1 已确认约束

1. `octo-web` 和 `octo-server` 已经存在，并继续独立演进。
2. 当前阶段不引入 Forge Database。
3. 当前阶段不建设 Forge 内部账号、OIDC、RBAC 或 Service Account 系统。
4. GitHub 承担身份、仓库权限、PR Review、构建和发布记录。
5. Forge Web 需要重做，但保持静态、只读、Artifact 驱动。
6. Card Source 最终离开 Forge 代码仓库，进入独立内容仓库。
7. 本地 CLI 和 Repo-free Card Authoring 长期保留。
8. 不建设新的生产 HTTP Renderer 或运行时 Card Registry。

### 2.2 目标结果

```text
平台代码       → octo-card-forge Monorepo
Card Source    → octo-card-catalog 内容仓库
操作者与治理   → GitHub Account / Organization / Team / PR / Release
Card Artifact  → GitHub Release Asset + SHA-256
Web Profile    → npm Package
Forge 展示数据 → Catalog Snapshot
运行时实例     → octo-server
最终展示       → octo-web
```

## 3. 仓库拓扑

核心平台使用四个具名仓库，其中只有 `octo-card-catalog` 是新增仓库。各业务后端保持现有仓库和
接入方式，不计入 Forge 的仓库拓扑。

| 仓库 | 职责 | 不负责 |
| --- | --- | --- |
| `octo-card-forge` | 平台 Monorepo：契约、引擎、CLI、Profile、Artifact、Forge Web、Actions | 正式 Card Source |
| `octo-card-catalog` | Card Source、Sample、Schema、CODEOWNERS、PR、Release 配置 | 服务端 API 和数据库 |
| `octo-web` | 最终 Card DOM 渲染、交互和产品集成 | Card Source 与版本治理 |
| `octo-server` | 消息、业务数据、Runtime Binding、最终校验和实例生命周期 | Forge 源码与 Catalog 扫描 |

`octo-card-catalog` 是纯内容仓库，不是新服务。

## 4. 仓库关系

```text
octo-card-forge
  ├─ CLI / Actions ───────────────▶ octo-card-catalog
  └─ Render Profile npm package ──▶ octo-web

octo-card-catalog
  └─ Artifact / Handoff ──────────▶ 业务后端

业务后端
  └─ 标准 Card JSON / 现有协议 ───▶ octo-server ──▶ octo-web
```

仓库间不允许：

- Git submodule；
- 跨仓库相对路径；
- 复制 Profile CSS/HostConfig；
- 直接导入另一个仓库的源码；
- 依赖另一个仓库的未发布分支。

仓库间只通过版本化契约通信：

```text
Forge → CLI npm package       → Catalog
Forge → GitHub Action tag     → Catalog
Forge → Profile npm package   → octo-web
Catalog → Artifact/Handoff    → 业务后端
Catalog → Catalog Snapshot    → Forge Web
业务后端 → Card JSON          → octo-server
octo-server → Card JSON       → octo-web
```

## 5. Forge Monorepo 模块

按业务能力划分为七个核心模块。

| 模块 | 代码方向 | 主要职责 |
| --- | --- | --- |
| Card Contract | `packages/card-spec` | Source、Manifest、Artifact、Snapshot Schema |
| Card Engine | `packages/core` | 编译、校验、Inspect、能力分析 |
| Developer Toolkit | `packages/workspace`、`packages/preview-kit`、`packages/cli` | 本地目录、Preview client、导入导出、CLI |
| Render Profile | `packages/profile-octo-chat` | CSS、HostConfig、Capabilities、Tokens |
| Artifact | `packages/artifact` | 确定性构建、摘要、验证、Handoff |
| Forge Web | `apps/forge-web`、`packages/catalog-snapshot` | Catalog、Preview、报告和版本展示 |
| GitHub Delivery | `actions/`、`.github/workflows/` | PR Check、Preview 和 Release |

`packages/testkit` 是工程支撑包，不计为业务模块。

详细职责见 [`modules/`](./modules/README.md)。

## 6. 模块依赖方向

```text
card-spec
├── core
├── workspace
└── profile-octo-chat

core + workspace + resolved profile
                 ↓
              artifact
                 ↓
                cli

Card Catalog + Artifact
                 ↓
         catalog-snapshot
                 ↓
            forge-web

Artifact/Handoff → 业务后端现有接入链路 → octo-server
```

`workspace-packages.json` 是 Phase 1 起生效的机器可执行 allowlist。下表中的“允许依赖”指
左侧包可以声明的内部 runtime dependency：

| 包 | 允许依赖 |
| --- | --- |
| `card-spec` | 无 |
| `core` | `card-spec` |
| `workspace` | `card-spec` |
| `profile-octo-chat` | `card-spec` |
| `artifact` | `card-spec`、`core` |
| `catalog-snapshot` | `card-spec`、`artifact` |
| `forge-web` | `catalog-snapshot`、`profile-octo-chat` |
| `testkit` | 无；只提供无业务依赖的 fixture/helper，业务包仅可通过 devDependency 使用 |
| 根 legacy `cli` | `card-spec`、`core`、`workspace`、`artifact`；Profile 仅允许 optional peer |

`packages/cli` 在 Phase 1 只是迁移目标目录；发布中的 `@mlt-org/octo-card-cli` 仍位于根目录，
任何新 workspace 包不得反向依赖根 legacy 包。

约束：

1. `card-spec` 不依赖业务模块。
2. `core` 不读取文件、Git、HTTP、环境变量或 GitHub API。
3. `workspace` 负责文件系统和路径安全，不实现编译规则。
4. `artifact` 不知道 GitHub、环境或部署目标。
5. `forge-web` 不直接扫描 Card 目录。
6. `actions` 只编排 CLI/Package，不复制业务逻辑。
7. `octo-web`、`octo-server` 和业务后端不进入 Forge workspace。
8. `scripts/check-workspace-dependencies.mjs` 必须拒绝白名单外依赖、反向依赖和 runtime 循环。

## 7. Card 生命周期映射

不建设 Forge Database 后，Card 生命周期映射到 GitHub 原生对象。

| 领域概念 | GitHub-native 实现 |
| --- | --- |
| Card Project | Catalog 中的 `cards/<namespace>/<card-key>/` |
| Namespace | Card ID 前缀和一级目录 |
| Draft | Git Branch 中的 Card Source |
| Revision | Git Commit SHA |
| Change Request | Pull Request |
| Approval | Required Review / CODEOWNERS |
| Build | GitHub Actions Run |
| Release | 受保护 Tag + GitHub Release |
| Artifact | Release Asset + SHA-256 |
| Audit Trail | Commit、PR、Review、Release 和 Workflow 记录 |

Forge 不重新建立同名数据库实体。

## 8. Card Source 与 Namespace

目标 Catalog 目录：

```text
octo-card-catalog/
├── cards/
│   ├── ai/
│   │   ├── decision-action/
│   │   └── reasoning-process/
│   └── docs/
│       └── access-request/
├── CODEOWNERS
└── .github/workflows/
```

Card ID：

```text
<namespace>.<card-key>

ai.decision-action
docs.access-request
```

Namespace 当前只承担：

- 防止 Card ID 冲突；
- 目录分类；
- `CODEOWNERS` 和 Review 边界；
- Catalog 筛选；
- 未来按领域拆仓的稳定前缀。

Namespace 不是数据库实体、用户组或运行时租户。

## 9. Card 生产流程

```text
生产者在本地创建/修改 Card
  → CLI check / render / artifact build
  → 推送 Branch
  → 创建 Pull Request
  → GitHub Actions 执行 Contract/Core/Profile/Artifact 校验
  → PR Preview 展示变化
  → CODEOWNERS Review
  → 合并 main
  → 创建 Card Tag 和 Release
  → 上传 Artifact、Handoff 与 checksum
  → 业务后端按现有链路接入
```

生产者可以是人、AI Agent 或 CI。Forge 不区分生产者类型，只校验相同的 Card Contract。

## 10. Artifact

Artifact 是正式发布内容，不是 Source 的副本目录。

它必须：

- 使用版本化 Schema；
- 使用精确 Render Profile 版本；
- 包含已解析的 Card 内容、契约、报告和必要元数据；
- 使用确定性序列化；
- 通过 SHA-256 标识内容；
- 不包含时间戳、用户 Token、环境 URL 或部署状态；
- 可以在没有 Git 工作区的情况下验证；
- 可以生成 Handoff，供业务后端按现有链路接入。

GitHub Release 负责保存和分发 Artifact；Artifact 自身的 digest 负责内容完整性。

## 11. Forge Web

Forge Web 位于 `octo-card-forge/apps/forge-web`，由当前 `web/` 渐进迁移而来。

它是 Card 工作台，不是宣传站点，也不是带数据库的管理后台。

主要页面：

```text
Cards
Card Detail
  Preview
  Contract
  Validation
  Capabilities
  Versions
  Source
Profiles
Components
Releases
```

数据来源：

```text
octo-card-catalog
  → GitHub Actions
  → catalog-snapshot.v1.json
  → Forge Web
```

Forge Web：

- 不保存 Card；
- 不维护账号；
- 不直接调用数据库；
- 不扫描 Git 仓库目录；
- 不执行审批或部署；
- 可以链接到 GitHub Source、PR、Release 和 Workflow；
- 使用与 `octo-web` 相同版本的 Render Profile npm Artifact 进行预览。

PR 可以部署独立 Preview Snapshot，但不需要引入 Forge 用户系统。

### 11.1 本地 Preview 运行面

当前本地 Server 已提供 Preview API v1，作为现有 Web 页面和 `preview-kit` client 的适配层：

```text
Web → /api/preview/v1/session
Web → /api/preview/v1/render
Web → /api/preview/v1/profile/*
```

它复用 Workspace Loader、Core 和 Render Profile，不保存 session。Session 中的 revision 用于
拒绝页面基于旧 Card/Profile 内容提交的渲染请求。该 API 不等于新的 Forge API 服务，也不改变
Forge Web 最终只消费 Snapshot/Artifact 的目标。

完整字段、错误码和演进路径见 [`preview-system-design.md`](./preview-system-design.md)。

## 12. Render Profile 与 octo-web

`octo-chat` Render Profile 源码由 Forge Monorepo 管理，独立发布 npm 包：

```text
packages/profile-octo-chat
  → validate/build/pack
  → @mlt-org/octo-card-profile-octo-chat@x.y.z
  → octo-web 显式升级并锁定版本
```

规则：

1. Forge Preview 和 `octo-web` 消费同一发布包。
2. Card Release 记录精确 Profile 版本，不使用 `latest`。
3. Profile 发布不自动修改 `octo-web`。
4. `octo-web` 通过自己的 PR、视觉回归和发布流程升级 Profile。
5. 不把 Profile CSS、HostConfig 或 Capability 数据复制进 `octo-web` 源码。

## 13. 业务后端与 octo-server 边界

Forge 当前不直接调用 `octo-server`。

```text
Card Artifact / Handoff
  → 业务后端读取 Contract、Template 和 Sample
  → 业务后端完成领域模型映射和现有生产接入
  → octo-server 处理 Runtime Binding、最终校验和消息生命周期
```

Forge 负责把 Card 的契约和发布内容表达清楚，不负责猜测业务后端如何接入，也不复制
`octo-server` 的运行时状态。

只有未来出现明确、稳定的 Server 直连 API 时，才通过新 ADR 评估 Adapter。当前不预留独立模块。

## 14. GitHub Delivery

GitHub Delivery 由可复用 Actions 和 Catalog 仓库 Workflow 构成。

```text
card-check
  Contract + Core + Profile + Golden

card-release
  Version + Artifact + Digest + GitHub Release
```

原则：

- Workflow 固定使用已发布的 Forge CLI/Action 版本；
- PR Check 不发布正式 Artifact；
- 同一 Card 版本不可覆盖；
- Release Tag 与 Card ID/版本一一对应；
- Workflow 只编排，不包含第二套编译和校验实现。

## 15. 身份与权限边界

当前阶段没有 Forge 用户模型。

```text
身份       GitHub Account
组织成员   GitHub Organization
角色       Repository Role / Team
Card 审批  CODEOWNERS / Required Review
未来 SSO   GitHub Organization/Enterprise 与企业 IdP 对接
```

Forge Web 默认只读。CLI 使用开发者现有的 Git/`gh` 凭证，不实现 `octo-card login`。

如果未来出现必须脱离 GitHub 的非研发用户、实时协同编辑、细粒度授权或运营查询需求，再单独评估
数据库和账号体系；不得以“以后可能需要”为理由提前建设。

## 16. 当前实现与目标差异

当前仓库仍然：

- 使用根 `src/` 单 package；
- 将正式 Card 和版本放在 `cards/`；
- 通过 `src/registry.ts` 扫描文件；
- 通过本地 Node HTTP 服务向 `web/` 提供 Catalog API 和 Preview API v1；
- 将 `cards/` 打进部署包；
- 使用 TypeScript `adaptivecards-templating` 编译。

这些是迁移起点，不是最终边界。

目标：

- Forge 变为 pnpm Monorepo；
- Card Contract/Core/Workspace/Artifact 分包；
- 正式 Card 移到 `octo-card-catalog`；
- Forge Web 只消费 Catalog Snapshot；
- GitHub Actions 代替 Forge Worker；
- GitHub Organization/PR/Environment 代替 Forge 账号和治理系统；
- Release Artifact 通过 GitHub Release 分发；
- `octo-web` 消费精确 Profile 包和标准 Card JSON；`octo-server` 只通过现有运行时协议接收 Card JSON，不直接消费 Forge Artifact。

## 17. 明确不建设

本轮重构不建设：

```text
Forge Database
Forge User/Account System
OIDC/RBAC/Service Account
forge-api
forge-worker
动态 Artifact Registry 服务
生产 HTTP Template Renderer
新的 Runtime Card Registry
在线多人协同编辑器
```

不建设这些能力不是永久禁止，而是当前没有真实需求足以支付复杂度。

## 18. 变更规则

架构变化必须满足：

1. 修改本文的当前状态；
2. 增加或取代 ADR；
3. 更新受影响模块文档；
4. 更新重构 Roadmap；
5. 明确迁移和删除旧路径的条件；
6. 不允许只在聊天、Issue 或代码注释中改变架构。

下一步实施顺序见 [`refactor-roadmap.md`](./refactor-roadmap.md)。
