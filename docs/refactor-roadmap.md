# Octo Card Forge 重构路线

> 状态：当前执行路线
>
> 日期：2026-08-25
>
> 架构基线：[`architecture-design.md`](./architecture-design.md)

## 1. 执行原则

1. 先固定行为，再移动代码。
2. 先稳定 Contract，再抽 Core。
3. 先生成 Artifact，再迁移 Card Source。
4. Forge Web 可以提前使用 Fixture 开发，但只能在 Snapshot Contract 稳定后接真实数据。
5. 每张 Card 单独迁移，不长期双写。
6. 每个阶段必须有退出 Gate 和旧路径删除条件；退出 Gate 一律包含「干净检出（clean checkout）下 typecheck/test/build/check/smoke 全绿」这一条，避免只在增量环境验证造成回归。
7. 本轮不引入数据库、账号体系、Forge API 或 Worker。

## 2. 阶段划分与依赖

Phase 编号用于表达里程碑和主要依赖，不表示所有工作严格串行。Phase 0-2 先建立稳定基础；Phase 2
Gate 关闭后，Phase 3 的 Profile/Preview 工作与 Phase 4 Artifact Builder 可以按下文 Gate 并行推进。

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

### 2.1 当前实施快照

| 阶段 | 当前状态 | 实际完成情况 |
| --- | --- | --- |
| Phase 0 | 已完成 | 架构、ADR、Characterization Tests 和 Golden 已建立 |
| Phase 1 | 已完成 | Monorepo 外壳、依赖检查和兼容构建已建立 |
| Phase 2 | 已完成 | Contract、Core、Workspace 编译链路和单一 Validator/Inspection/utility parser Gate 已完成 |
| Phase 3 | 已完成 | Workspace/Preview/Profile/CLI package 均已收敛；Phase 3D 的共享渲染、Component Catalog Contract、Profile specimen 冻结与 server 静态消费链路已完成 |
| Phase 4 | 已完成 | Artifact Contract/Builder/digest/verify/CLI/Handoff/消费者 fixture/tarball 验证均已完成 |
| Phase 5 | 已完成 | Delivery Actions v0.1.0、Catalog Workflow/治理、Pilot PR 与不可变 Release 已完成 |
| Phase 6 | 已完成 | Snapshot 发布、正式只读 Forge Web、PR Preview Snapshot 与自包含预览入口均已完成 |
| Phase 7 | 未开始 | 尚未进行真实业务后端交付验证 |
| Phase 8 | 未开始 | Pilot Card 已迁入 Catalog；其余 Card Source 与 Forge Legacy 尚未删除 |

阶段状态以退出 Gate 是否满足为准，不能因为目标目录或 Contract 空壳已经建立就标记完成。Phase 3
的 Profile/Preview 工作与 Phase 4 Artifact Builder 现在可以按各自 Gate 并行推进。

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

## 5. Phase 2：Card Contract、Card Engine 与 Preview 基础

目标：形成唯一数据契约和唯一纯业务逻辑实现。

状态：**已完成（2026-08-20）**。

已落地：

- `packages/card-spec` 提供 Source Manifest v2、Resolved Source v1、Render Profile v1、Artifact v1、Catalog Snapshot v1；
- 所有 Decoder 都是纯对象输入，使用稳定诊断和 JSON Pointer，未知版本 fail-close；
- 当前 Profile 已切换到 canonical `schemaVersion: 1`，legacy unversioned compatibility 仍有测试；
- `packages/core` 提供纯对象 `compileCardSource`、`validateCompiledCard`、`inspectCard`；
- 当前 Draft 的全部 View/Sample 已完成 legacy/Core 的 payload、issues、inspection parity；
- Workspace Loader 已将目录解析为无路径 `ResolvedCardSourceV1`；
- 根 CLI 已通过 `Workspace → Core` facade 编译，npm 入口会 bundle 私有 workspace 代码；
- npm tarball 只发布 bundle 后的 CLI；Server bundle 只进入部署包，不暴露依赖私有 workspace 包的 legacy 编译中间文件；
- Preview API v1 已提供 session、revision、render 和 Profile 资源，旧 `/api/render` 保持兼容；
- 根 `src/validate.ts`、`src/inspect.ts` 和 `src/utility-id.ts` 已成为 Core 的精确兼容 facade；
- facade identity、CLI validate、组件基线和 Core parity tests 已覆盖单一实现边界；
- 根 CLI 尚未迁入 `packages/cli`，npm 独立安装能力保持不变。

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

删除兼容 facade 属于 Phase 3E CLI package 迁移，不再是 Phase 2 Gate。

## 6. Phase 3：Developer Toolkit 与 Render Profile

目标：让本地 Card Workspace 和 Profile 成为稳定的可分发能力。

状态：**已完成（2026-08-24）。Workspace、Preview API、Preview Kit、Profile package、Component Preview 与 CLI package convergence 均已关闭退出 Gate。**

子阶段：

| 子阶段 | 状态 | 范围 |
| --- | --- | --- |
| Phase 3A Workspace Runtime | 已完成 | 路径安全、Resolved Source、`Workspace → Core` facade |
| Phase 3B Preview Transport | 已完成 | Preview API v1、revision、Preview Kit client、legacy Card 页面接入 |
| Phase 3C Profile Package Foundation | 已完成 | `packages/profile-octo-chat` 独立包，validate/build/pack、workspace package 优先加载、legacy 目录作开发回退 |
| Phase 3D Component Preview | 已完成 | Component Catalog Contract、Profile specimen、共享浏览器渲染、legacy Components 页面迁移 |
| Phase 3E CLI Package Convergence | 已完成 | CLI 命令层、共享运行时与应用服务层均已迁入 `packages/cli`；根 `src/` 已删除，npm 包名/bin/发布产物保持兼容 |

工作：

- 抽出 Workspace Loader/Exporter 和路径安全；
- 将 CLI 迁入 `packages/cli`，保持 npm 包名与 bin；
- 将 `octo-chat` Profile 迁入独立 package；
- CLI 优先消费发布 Profile，Forge 源码只作开发回退；
- 保留 repo-free 本地开发和 Agent Skill；
- 使用 `packages/preview-kit`，供本地 Preview 和 Forge Web 共用；
- 在 Preview Kit 稳定前，不引入 SSE、热刷新或新的服务端状态。

### 6.0 Phase 3E：CLI Package Convergence（运行时下沉）

状态：**已完成运行时下沉（2026-08）。**

`packages/cli` 之前是 4 行占位包，真实 CLI 与整个应用运行时仍在根 `src/`（约 5500 行）。
本阶段把 CLI 命令层与共享运行时（registry/compiler/core-adapter/profile-source/profile/
handoff/artifact/check/init/presets/verify/agent/agent-bootstrap/validate/inspect/utility-id/
types/fs）迁入 `packages/cli`，消除「新包空壳、旧路径承载全部实现」的双写。

已落地：

- `packages/cli`（`@mlt-org/octo-card-cli-runtime`）导出 `runCli()` 与运行时 barrel；
- 根 `src/cli.ts` 收敛为薄入口：注入 dev server（`startServer`）并转发 argv，保留 shebang，
  esbuild 仍将其打包为 `dist/cli.js`，npm 包名 `@mlt-org/octo-card-cli`、`bin` 和发布产物不变；
- `src/server.ts`/`src/preview.ts`/`src/component-baseline.ts` 暂留应用层，改为反向消费
  `@mlt-org/octo-card-cli-runtime`，依赖方向保持 根 → 包，无包到根的反向引用；
- `projectRoot()` 由「固定上溯层级」改为向上查找 `pnpm-workspace.yaml` /
  `deployment-manifest.json` 标记，兼容源码运行、根 `dist/` 与部署包三种布局；
- 依赖 allowlist、tsconfig paths、esbuild alias、vitest alias 已登记新包。

退出 Gate：

- `packages/cli` 承载真实 CLI 与运行时，不再是占位包；
- npm 包名、`bin`、发布 tarball 内容与部署包保持兼容（`dist/cli.js` 仍自包含）；
- 无 `packages/cli` 反向依赖根 `src/`；
- 干净检出下 typecheck、175 项测试、check、repo-free 与 published-consumer smoke 全绿。

#### Phase 3E 补完：应用服务层下沉与根 `src/` 删除（2026-08）

后续 PR 完成了剩余的应用层下沉，根 `src/` 目录已整体删除：

- `server.ts`、`preview.ts`、`component-baseline.ts` 迁入 `packages/cli/src/`，
  三者改为包内相对引用；barrel 追加导出 `createForgeServer`/`startServer`/
  `normalizeBasePath`/`ForgeServerOptions` 及组件基线函数；
- 新增 `packages/cli/src/bin.ts` 作为可执行入口（shebang + 注入 `startServer`），
  根 `src/cli.ts` 及整个根 `src/` 目录删除；
- `bundle-entrypoints.mjs` 改为从包源打包：`cli → packages/cli/src/bin.ts`、
  `server → packages/cli/src/server.ts`，仍产出 `dist/cli.js` 与 `dist/server.js`，
  npm 包名/`bin`/发布 tarball 与部署包保持不变，`scripts/start-service.mjs` 继续消费
  `dist/server.js`；
- 移除已无源可编的 `build:legacy` 脚本与 `tsconfig.build.json`，`dist/` 不再残留
  逐文件 tsc 产物（只剩打包后的 `cli.js`/`server.js`）；根 `tsconfig.json` 的 include
  收敛为仅 `tests/**`；
- 测试对 `../src/*` 的引用全部改指 `packages/cli/src/*`，仓库内不再有任何对根 `src/`
  的引用。

补完后退出 Gate：

- 根 `src/` 已删除，应用层完全由 `packages/cli` 承载；
- npm 与部署产物形状不变（`dist/cli.js` 自包含、`dist/server.js` 可 `pnpm start`）；
- 干净检出下 typecheck、175 项测试、check、repo-free 与 published-consumer smoke，
  以及打包后的 `dist/cli.js`（list + dev server）与部署入口 `start-service.mjs` 全绿。

仍未包含：根发布入口最终是否直接指向包 `bin`（当前仍经由 esbuild 打包为 `dist/cli.js`）。

### 6.1 Phase 3C：Profile Package Foundation

状态：**已完成（2026-08-21）**。

Profile package 是 Component Preview 的前置。该阶段只稳定 Profile 的发布与消费边界，不要求先
完成组件展示页面；Artifact Builder 可以继续接收现有 Resolved Profile 对象，因此不被 package 迁移阻塞。

已落地：

- `packages/profile-octo-chat` 成为独立 workspace package，版本 `1.2.0-rc.3`；
- Profile 静态资源（manifest、capabilities、host-config、tokens、theme、styles）已迁入 package 根目录；
- `src/index.ts` 提供 `loadProfileAssets()`、`validateProfile()`、`validateProfileCss()` 等独立 API；
- build 脚本（`tsc` + asset copy）将编译产物和 assets 输出到 `dist/`，`dist/package.json` 适合独立 npm pack；
- `src/profile-source.ts` 加载优先级变为：workspace package dist → workspace package src → 旧 `render-profiles/` 目录 → npm 已发布包；
- 旧 `render-profiles/octo-chat` 保留作为开发回退和 npm pack 独立验证来源。

退出 Gate：

- Profile 可脱离 Forge 根源码独立 validate/build/pack；
- Preview 使用精确 Profile reference；
- package 内容覆盖 HostConfig、CSS、capabilities、tokens 和 manifest；
- npm pack 不依赖 Forge 私有目录结构。

### 6.2 Phase 3D：Component Preview

状态：**已完成（2026-08-24）。**

组件预览用于验证 Render Profile 的能力、样式和标准组合，不是另一套 Card Engine，也不新增数据库、
在线组件服务或独立账号体系。

职责边界：

- `packages/card-spec` 定义 `ComponentCatalogV1` 和 `ComponentSpecimenV1`；
- `packages/profile-octo-chat` 拥有组件、utility、token、pattern 和 specimen 内容；
- `packages/preview-kit` 提供共享 Adaptive Cards 浏览器渲染适配；
- 当前 `web/components.*` 和未来 `apps/forge-web` 负责搜索、分类、尺寸切换和状态展示；
- Core 只校验 specimen payload/capability，不拥有组件展示内容。

实施顺序：

1. 固定现有 `/components` 行为和 specimen Golden；
2. 定义并测试版本化 Component Catalog Contract；
3. 将 `src/component-baseline.ts` 的内容迁入 `profile-octo-chat`；
4. 将 Adaptive Cards SDK、HostConfig 和 Profile CSS 适配抽入 Preview Kit；
5. 让现有 `/components` 页面消费新 Contract 和共享渲染器；
6. Phase 6 再让静态 Forge Web 从 Snapshot/Profile Artifact 加载同一目录。

退出 Gate：

- Card Preview 和 Component Preview 使用同一个浏览器渲染适配；
- Component Catalog 有版本、Decoder、稳定诊断和 Golden；
- Profile 是 specimen 内容的唯一来源；
- `web/components.js` 不再直接初始化 Adaptive Cards SDK 或读取旧 stylesheet URL；
- 组件预览不依赖数据库、账号、GitHub Token 或 `octo-server`。

进度（切片式推进）：

- ✅ 已完成（共享渲染切片）：`packages/preview-kit` 新增 `createCardRenderer` / `escapeMarkdownToHtml` 共享 Adaptive Cards 浏览器渲染适配，`web/app.js` 与 `web/components.js` 均改为消费同一适配器，不再各自初始化 SDK 或重复 markdown 转义。对应实施顺序第 4 步与第 5 步的渲染器部分，退出 Gate 第 1、4 条已达成。
- ✅ 已完成（Contract 切片）：`packages/card-spec` 新增 `ComponentCatalogV1` 契约与 `decodeComponentCatalogV1` fail-closed Decoder，media type `application/vnd.octo.component-catalog+json;version=1`。group id 收敛为固定枚举，section 为「card / rows / utilityTokens 三选一」的可辨识联合，未知属性、枚举越界、重复 id、变体不唯一均产出结构化诊断。Golden 用真实 `getCurrentRenderProfile()` 输出验证契约可覆盖生产数据。对应实施顺序第 2 步，退出 Gate 第 2 条已达成。
- ✅ 已完成（端点接线切片）：`/api/component-baseline` 服务端在响应中新增符合 `ComponentCatalogV1` 的 `catalog` 信封（`formatVersion`/`mediaType`/`profileReference`/`groups`），顶层 `groups` 冗余已移除；`packages/preview-kit` re-export `decodeComponentCatalogV1`，浏览器 bundle 自包含该 Decoder；`web/components.js` 改为 fail-closed 校验 `catalog` 信封后再渲染。对应实施顺序第 5 步的「消费新 Contract 和共享渲染器」，退出 Gate 第 3 条已达成。
- ✅ 已完成（specimen 落盘切片 PR-1）：新增 `scripts/generate-component-catalog.mts` 生成器，用当前 Profile capabilities 跑 `buildComponentBaselineGroups` 冻结出静态 `render-profiles/octo-chat/component-catalog.json`（`ComponentCatalogV1` 结构）；Profile manifest 新增可选 `componentCatalog` 字段，`packages/profile-octo-chat` 的 `loadProfileAssets` 加载并用 `decodeComponentCatalogV1` 校验后经 `ProfileAssetBundle.componentCatalog` 暴露；`build.mjs` 将其纳入 dist 资源；守卫测试保证「静态文件字节 == 现场生成」。此切片为纯新增，运行时行为不变。
  - 关于 `external` 约束的更正：`dist/server.js` 的离线自包含并非靠把 Profile inline 进 bundle，而是靠部署脚本把 `render-profiles/` 目录一起打包、运行时从磁盘读取。因此把 specimen 落进 Profile 目录不会破坏离线自包含。
- ✅ 已完成（server 静态消费切片 PR-2）：CLI 的 workspace/package/directory Profile loader 会读取 manifest 声明的 `componentCatalog`，用 `decodeComponentCatalogV1` fail-closed 校验，并要求 catalog 的 `profileReference` 与承载它的 manifest 精确一致；自定义 Profile bundle/pack 将该文件纳入复制、SHA-256 manifest 和 package export。server `/api/component-baseline` 直接透传 `profile.componentCatalog`，删除请求时 `buildComponentBaseline*` 调用和旧顶层 `sections`；Profile 缺失 catalog 时返回稳定的 `component_catalog_missing` 错误。生产 `dist/server.js` 已确认不含运行时 baseline builder 符号，Profile 成为 specimen 内容的唯一运行时来源。

最终验证（2026-08-24）：

- workspace dependency check、typecheck、build、Catalog check 全绿；
- legacy 全量测试 32 文件、188 项全绿，workspace package 测试全绿；
- repo-free agent smoke 与 published-consumer tarball smoke 全绿。

退出 Gate：

- 外部目录可以完成 init/check/render/verify；
- CLI npm pack 兼容；
- Profile 可独立 validate/build/pack；
- Forge Web 与 `octo-web` 可以消费同一 Profile 包。

## 7. Phase 4：Artifact v1

目标：建立与 Git 目录无关的正式发布内容。

状态：**已完成（2026-08-21）。**

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

状态：**已完成（2026-08-24）。**

已落地：

- `github-delivery/v0.1.0` 提供固定已发布工具版本的 `card-check` 与 `card-release`；
- `LLwill/octo-card-catalog` 已建立目标目录、CODEOWNERS、PR 模板与 `main` 分支保护；
- Catalog PR 按 changed-card matrix 生成 Check/Preview workflow artifacts；
- 合并版本目录后自动创建不可覆盖的 Card tag、Release、Artifact/Handoff 与 digest；
- `docs.access-request@0.3.0` 已完成 Pilot 迁移和首个真实 Release。

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

状态：**已完成（2026-08-25）。**

Phase 6A 已交付：

- `packages/catalog-snapshot` 实现确定性 Builder、SemVer 排序、冲突检测和 canonical digest；
- CLI/Skill `0.2.3` 已发布，CLI 提供 `snapshot build/verify`；
- Catalog CI 从不可变 Card Releases 生成 Snapshot，并按 `catalog-snapshot/<catalog-commit>` 创建不可覆盖的 GitHub Release；
- 首个正式 Release 为 `catalog-snapshot/6b7623cfb919eb737e7cb1bce91195749f30c9b7`，canonical SHA-256 为 `e02fd0cd9209185e928ccac6e24d333f96bfcb4b6d17f49c0f2069046d14c4a7`；
- 已用 npm 发布的 `@mlt-org/octo-card-cli@0.2.3` 下载并复验正式 Snapshot。

Phase 6B 已交付（2026-08-25）：

- `apps/forge-web` 已形成可打包静态应用，提供搜索、版本切换、Preview、Contract、Validation 和 Versions；
- CLI 在 `/forge/` 提供新工作台，并通过同源只读代理消费正式 Snapshot 与 Artifact；
- Snapshot 和 Artifact 使用版本化 parser，Artifact 在服务端与浏览器按 canonical SHA-256 复验；
- Preview 使用 Artifact 固定的 npm Profile、HostConfig、CSS 与 Adaptive Cards SDK，不复制本地 Profile 样式；
- loading、error、empty 和响应式布局已覆盖，桌面与 `390x844` 移动端完成浏览器验收；
- npm 包和 deploy bundle 均携带 Forge Web 静态产物，legacy `/` 页面继续兼容。

Phase 6C 已交付（2026-08-25）：

- `card-check` 为每个 Card PR 生成独立的 `channel=preview` Catalog Snapshot、canonical digest 和 Card Artifact；
- Forge Web 支持内嵌 Snapshot/Artifact 启动模式，下载后的 `preview/index.html` 不依赖 Forge server 或 Card 目录扫描；
- PR Preview 记录真实 head commit、head repository、Card path 和 Pull Request URL，不使用 GitHub merge commit；
- CLI/Skill `0.2.4` 与不可变 Action `github-delivery/v0.2.0` 已发布，并通过公网消费者烟测；
- Catalog PR #3 已使用固定版本完成真实预览 Artifact 生成，桌面与 `390x844` 移动端验收通过；
- Catalog `main` 已用 CLI `0.2.4` 重新发布不可变 release-channel Snapshot。

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

状态：**未开始。**

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

状态：**未开始。**

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

当前执行顺序：

1. 已完成 Phase 6A：Catalog 侧生成并不可变发布 `catalog-snapshot.v1.json` 与 Artifact 索引；
2. 已完成 Phase 6B：`apps/forge-web` 接入正式 Snapshot、Artifact 和精确 Profile，并停止依赖 Card 目录扫描；
3. 已完成 Phase 6C：Card PR 生成独立 Preview Snapshot、Artifact 和自包含 Forge Web 入口；
4. 下一步进入 Phase 7，用真实业务后端验证 Handoff 接入与最终展示；
5. Phase 8 逐 Card 完成迁移，并删除 Forge 中的正式内容、Legacy Registry 与 legacy Components 页面。

Pilot Card 已迁入 Catalog；Forge 内对应内容暂作为兼容 Fixture 保留，直到 Phase 8
逐 Card Gate 通过后删除。根 CLI 发布入口继续保持兼容，直到所有外部消费者完成迁移。
