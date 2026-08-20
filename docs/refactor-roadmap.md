# Octo Card Forge 重构路线

> 状态：当前执行路线
>
> 日期：2026-08-20
>
> 架构基线：[`architecture-design.md`](./architecture-design.md)

## 1. 执行原则

1. 先固定行为，再移动代码。
2. 先稳定 Contract，再抽 Core。
3. 先生成 Artifact，再迁移 Card Source。
4. Forge Web 可以提前使用 Fixture 开发，但只能在 Snapshot Contract 稳定后接真实数据。
5. 每张 Card 单独迁移，不长期双写。
6. 每个阶段必须有退出 Gate 和旧路径删除条件。
7. 本轮不引入数据库、账号体系、Forge API 或 Worker。

## 2. 阶段顺序

```text
Phase 0  架构与行为基线
Phase 1  Monorepo 工程外壳
Phase 2  Card Contract 与 Card Engine
Phase 3  Developer Toolkit 与 Render Profile
Phase 4  Artifact v1
Phase 5  octo-card-catalog 与 GitHub Delivery
Phase 6  Catalog Snapshot 与 Forge Web
Phase 7  业务后端交付验证
Phase 8  逐 Card 迁移与 Legacy 删除
```

## 3. Phase 0：架构与行为基线

目标：在拆包前确定当前行为和目标边界。

状态：**已完成（2026-08-20）**。

已落地：

- 总体架构、7 个模块边界、ADR 和阶段路线已建立；
- Draft 始终以稳定 Card ID 可发现，Release 使用 `id@version`，两者输出不再混淆；
- `list`、`check` 和 `lint` 的 JSON/Text 输出携带 `reference/kind/mutable`；
- 三张 Draft 的 12 个 Sample 已提交稳定 Golden 并逐样本对账；
- Validator 已覆盖 `TextBlock.text` 必填约束；
- Catalog HTTP API、npm CLI 包和部署包已有 Characterization Tests；
- `typecheck`、全量测试、Catalog check、build 和 npm pack 均通过。

工作：

- 完成总体架构、ADR、模块索引和 Roadmap；
- 给现有 CLI、HTTP API、Handoff、Profile 和正式 Card 建立 Characterization Tests；
- 为现有 Sample 生成稳定 Golden；
- 修复 Draft/Profile 过滤、重复 Catalog 项和 Validator 缺口；
- 建立当前 npm pack、部署包和 CLI JSON 输出清单。

退出 Gate：

- 文档不存在互相冲突的当前目标；
- 当前命令和输出有回归测试；
- 三张现有 Card 有 Golden；
- 没有目录移动和存储变化。

## 4. Phase 1：Monorepo 工程外壳

目标：建立 workspace，不改变用户行为。

状态：**已完成（2026-08-20）**。

已落地：

- `pnpm-workspace.yaml` 和 8 个私有 package/app 空壳已建立；
- 根 `@mlt-org/octo-card-cli` 继续保留原包名、bin、源码和发布入口；
- `typecheck/test/build` 已成为 legacy + workspace 聚合命令；
- `workspace-packages.json` 明确包级依赖 allowlist；
- 依赖检查器覆盖非法边、legacy 反向依赖和 runtime cycle；
- npm pack 继续排除内部源码包，部署包已通过解压、离线生产安装和 HTTP smoke；
- 尚未移动根 `src/`、`web/`、`cards/` 或 `render-profiles/`。

目标目录：

```text
apps/
  forge-web/
packages/
  card-spec/
  core/
  workspace/
  cli/
  profile-octo-chat/
  artifact/
  catalog-snapshot/
  testkit/
actions/
```

工作：

- 增加 `pnpm-workspace.yaml`；
- 根 package 暂时保留现有源码、包名、bin 和发布入口；
- 增加 workspace 级 typecheck/test/build；
- 增加依赖方向检查；
- 保持现有部署包和 npm pack 内容兼容。

退出 Gate：

- 原 CLI 和 Web 行为不变；
- workspace 依赖图无循环；
- 尚未机械移动根源码；
- 发布物没有未解释差异。

## 5. Phase 2：Card Contract 与 Card Engine

目标：形成唯一数据契约和唯一纯业务逻辑实现。

状态：**Phase 2A/2B 第一版已完成，进入 Workspace facade 收敛（2026-08-20）**。

已落地：

- `packages/card-spec` 提供 Source Manifest v2、Resolved Source v1、Render Profile v1、Artifact v1、Catalog Snapshot v1；
- 所有 Decoder 都是纯对象输入，使用稳定诊断和 JSON Pointer，未知版本 fail-close；
- 当前 Profile 已切换到 canonical `schemaVersion: 1`，legacy unversioned compatibility 仍有测试；
- `packages/core` 提供纯对象 `compileCardSource`、`validateCompiledCard`、`inspectCard`；
- 当前 Draft 的全部 View/Sample 已完成 legacy/Core 的 payload、issues、inspection parity；
- 根 CLI 尚未依赖私有 workspace 包，npm 独立安装能力保持不变。

顺序：

```text
card-spec
  → core compile
  → core validate
  → core inspect/capabilities
```

工作：

- 定义 Source、Manifest、Artifact、Snapshot Schema；
- 将类型、编译、校验、Inspection 和能力分析抽入包；
- Core 只接收对象，不接收文件路径；
- 原 CLI 与本地 Catalog HTTP 层通过兼容 facade 调用新 Core；
- old/new 实现进行 Golden 对账。

退出 Gate：

- Core 无文件、HTTP、Git、环境变量依赖；
- Validator 只有一份权威实现；
- 正式 Card 编译输出无未解释差异；
- 现有 CLI 输出保持兼容。

当前剩余：

- Workspace Loader 将文件目录解析为 `ResolvedCardSourceV1`；
- 根 CLI 通过兼容 facade 调用 Core，完成一次真实 CLI parity 后再迁移入口；
- 删除 legacy `src/validate.ts` / `src/inspect.ts` 前，先确认没有第二套业务规则。

## 6. Phase 3：Developer Toolkit 与 Render Profile

目标：让本地 Card Workspace 和 Profile 成为稳定的可分发能力。

工作：

- 抽出 Workspace Loader/Exporter 和路径安全；
- 将 CLI 迁入 `packages/cli`，保持 npm 包名与 bin；
- 将 `octo-chat` Profile 迁入独立 package；
- CLI 优先消费发布 Profile，Forge 源码只作开发回退；
- 保留 repo-free 本地开发和 Agent Skill。

退出 Gate：

- 外部目录可以完成 init/check/render/verify；
- CLI npm pack 兼容；
- Profile 可独立 validate/build/pack；
- Forge Web 与 `octo-web` 可以消费同一 Profile 包。

## 7. Phase 4：Artifact v1

目标：建立与 Git 目录无关的正式发布内容。

工作：

- 定义 Artifact Schema、media type 和 canonical bytes；
- 实现 build/digest/verify/inspect；
- Handoff 从 Artifact 派生；
- 建立跨平台确定性测试；
- 建立 Handoff 消费者 fixture contract。

退出 Gate：

- 同一输入重复构建 digest 一致；
- Artifact 不含环境、用户、时间戳和绝对路径；
- Handoff 没有第二套编译逻辑；
- Artifact 可在无工作区环境中独立验证。

## 8. Phase 5：Catalog 仓库与 GitHub Delivery

目标：将 Card Source 与平台代码分离。

工作：

- 创建 `octo-card-catalog`；
- 建立 `cards/<namespace>/<card-key>/`；
- 配置 CODEOWNERS 和分支保护；
- 提供 `card-check`、`card-release` 可复用 Action；
- 定义 Tag、Release Asset 和 checksum 命名规则；
- 先迁移一张非关键 Pilot Card。

退出 Gate：

- Card PR 可完成 Check、Preview 和 Review；
- 合并后可创建不可覆盖的版本 Release；
- Catalog Workflow 固定使用已发布 Forge 工具版本；
- Forge 代码仓库不需要修改即可发布新 Card。

## 9. Phase 6：Catalog Snapshot 与 Forge Web

目标：把当前页面改造成静态 Card 工作台。

工作：

- 定义 `catalog-snapshot.v1.json`；
- Catalog CI 生成 Snapshot、Artifact 索引和报告；
- 重做 Cards、Card Detail、Preview、Validation、Versions；
- 当前 `web/` 渐进迁入 `apps/forge-web`；
- PR 使用独立 Snapshot 生成 Preview；
- Web 不再依赖文件扫描 API。

退出 Gate：

- Web 只读取 Snapshot、Artifact 和 Profile；
- 页面覆盖 loading/error/empty 和移动端；
- Preview 与 `octo-web` 使用同源 Profile；
- Catalog 更新不需要修改 Web 代码。

## 10. Phase 7：业务后端交付验证

目标：证明版本化 Artifact/Handoff 可以被业务后端按现有方式接入。

工作：

- 明确业务后端实际需要的 Contract、Template、Sample 和 Report；
- 用一个真实业务后端完成 Handoff 接入；
- 验证生成的标准 Card JSON 可以进入现有 `octo-server` 链路；
- 对比 Forge Preview 与真实 `octo-web` 展示；
- 记录业务映射责任和失败边界；
- 不增加 Forge 到 `octo-server` 的直连调用。

退出 Gate：

- 业务后端不需要读取 Forge 源码；
- Handoff 内容足以完成接入；
- Forge 不持有业务数据和 Server 凭证；
- `octo-server` 仍拥有运行时实例和最终安全校验；
- Forge 到 `octo-server` 的直连适配层不再是迁移前置条件。

## 11. Phase 8：迁移与删除 Legacy

目标：删除 Forge 中的正式 Card 内容和生产文件 Registry。

单 Card 迁移：

```text
扫描现有 Source/versions
  → 新 Core 与 Artifact 对账
  → 导入 Catalog Branch
  → PR Review
  → 创建 Release
  → 测试部署和回滚
  → Catalog 成为唯一 Source
  → 删除 Forge 中对应 Card
```

最终删除：

- Forge 中正式 `cards/`；
- `cards/*/versions/`；
- 生产文件扫描 Registry；
- Web 对目录型 API 的依赖；
- 部署包中的 Card Source；
- 历史重复编译和校验逻辑。

保留：

- Local Workspace；
- CLI 本地模式；
- 测试 Fixtures；
- Artifact/Handoff 导出；
- Profile Source。

## 12. 模块细化顺序

每个模块按 [`modules/README.md`](./modules/README.md) 的模板逐项定稿：

```text
1. Card Contract
2. Card Engine
3. Developer Toolkit
4. Render Profile
5. Artifact
6. GitHub Delivery
7. Forge Web
```

当前下一阶段：**Phase 3A Workspace Loader 与 CLI facade**。先把文件路径限制在 Workspace 层，
再让根 CLI 通过 `ResolvedCardSourceV1` 调用 Core；Card Source 目录和 npm 发布边界暂不移动。
