# Forge Web 与 Server 重构方案

> 状态：Draft
>
> 日期：2026-08-25
>
> 范围：`apps/forge-web`、`packages/cli/src/server.ts`、legacy `web/`
>
> 关联文档：[`architecture-design.md`](./architecture-design.md)、
> [`modules/forge-web.md`](./modules/forge-web.md)、
> [`adr/0003-no-forge-database-or-accounts.md`](./adr/0003-no-forge-database-or-accounts.md)

实施状态：**Phase A 进行中。**

已完成（2026-08-25）：

- 新增 `ForgeRuntimeDescriptorV1` TypeScript 契约、严格 decoder 和 JSON Schema；
- 新增 `GET /api/v1/runtime`，显式区分 `published` 与 `workspace`；
- Published 和 Workspace 模式开始通过 capability 描述实际开放能力；
- Forge Web Client 与 Published Artifact Proxy 均校验 Artifact `id@version` 是否匹配请求 reference；
- 新增契约、HTTP API 和 Artifact identity 回归测试。

Phase A 剩余：

- 固化 Cards、Components、Install 和 Preview 的页面级截图基线；
- 定义统一 Card Summary、Card Detail 和 API Error 契约；
- 将 Runtime Descriptor 从当前 Server Context 推导迁入正式 Provider 边界。

## 1. 背景

Forge 当前已经具备 Card、Render Profile、Component Catalog、Artifact、Snapshot、Preview 和安装信息等
底层能力，但浏览器产品面仍分散在两套实现中：

```text
apps/forge-web
  /forge/
  发布 Catalog、Artifact、Preview、Contract、Validation、Versions

legacy web/
  /
  本地 Card 列表、ViewModel 编辑、Template 编译、Handoff

  /components
  当前 Render Profile 的 Component Catalog

  /install
  CLI、Skill 和 Render Profile 安装信息
```

两套页面的数据来源、状态模型、样式和导航不同：

- 新 Forge Web 消费 Published Catalog Snapshot 和不可变 Artifact；
- legacy Cards 页面扫描本地 Workspace Card；
- Components 页面读取当前本地 Render Profile；
- Install 页面读取 Forge 仓库内的 package、Skill 和安装清单；
- JSON 编辑器实际编辑的是 ViewModel 数据，不是任意标准 Adaptive Card JSON。

当前结构可以支持只读 Card 工作台，但不足以继续承载统一的 Cards、Components、Playground 和 Install
产品体验。继续在两套页面上分别增加功能会形成长期重复实现。

## 2. 重构目标

本轮重构建设一个统一的 Forge Web，用于承载：

1. 组件与模板目录展示；
2. CLI、Skill 和 Render Profile 安装页面；
3. 已发布 Card 的列表、详情、版本和报告；
4. 标准 Adaptive Card JSON 的粘贴、校验和预览；
5. 已有 Card Template 与 ViewModel Data 的编译预览；
6. 本地 Card 开发和 Published Catalog 浏览两种明确的运行模式；
7. PR Preview 和离线 Preview Bundle。

重构必须保持以下既有架构约束：

- Forge Web 保持静态优先和只读优先；
- 不引入 Forge Database、账号、权限和在线协同编辑；
- Forge 不直接调用 `octo-server`；
- Card、Component 和 Preview 不复制 Core 或 Render Profile 规则；
- 发布数据来自版本化 Snapshot、Artifact 和 Render Profile；
- 本地开发数据来自显式 Workspace，不允许静默混用两种来源；
- Preview 与 `octo-web` 使用相同版本的 Adaptive Cards SDK、HostConfig 和 Profile CSS。

## 3. 非目标

本轮不建设：

- 在线 Card 仓库或数据库；
- 用户登录、RBAC、审批和审计系统；
- 浏览器内保存或发布 Card；
- 实时多人编辑；
- Forge 到业务后端的直连部署；
- 在 Web 内重新实现 Template Compiler 或 Card Validator；
- 用 Forge 专属 CSS 修补业务 Card 的最终展示结果。

## 4. 当前实现评估

### 4.1 Web

`apps/forge-web` 当前是 TypeScript + esbuild 的无框架单页应用：

- `index.html` 只提供应用挂载点；
- `src/data.ts` 负责 Snapshot、Artifact 和 Profile 资源定位；
- `src/index.ts` 同时负责状态、HTML 模板、数据加载和事件绑定；
- `styles.css` 是单一全局样式文件；
- 每次交互通过替换 `root.innerHTML` 完成整页重绘，再重新绑定事件。

该实现适合当前规模，但增加多个页面后会出现：

- 页面、组件和状态边界不可见；
- 输入焦点、滚动、弹窗和局部加载状态容易丢失；
- URL 无法完整表达 Card、版本、Tab、View 和 Sample；
- 无法自然进行页面级代码分包；
- DOM 行为缺少可靠的组件测试和端到端测试。

### 4.2 Server

`packages/cli/src/server.ts` 当前同时负责：

- Node HTTP Server 生命周期；
- Base Path 处理；
- 静态资源映射；
- Published Snapshot 和 Artifact 代理；
- Workspace Card Registry；
- Preview Session 和 Template 编译；
- Render Profile 资源；
- Component Catalog；
- 安装元数据；
- Handoff 下载；
- HTTP 错误映射。

核心能力可以复用，但单文件路由不适合继续扩展。当前还存在以下运行时问题：

- `/forge/api/*` 与 `/api/*` 是两套 API 命名空间；
- Published 和 Workspace 数据源没有统一的显式模式描述；
- Snapshot 以进程级 Promise 缓存，缺少刷新和 ETag 语义；
- Artifact 经过校验但没有按 digest 做共享缓存；
- 静态资源文件名硬编码，不支持前端代码分包；
- 错误响应没有完整统一的 request ID、details 和稳定错误类型；
- Server 集成测试覆盖主要成功路径，但缺少统一 Web 用户流程测试。

## 5. 核心架构决策

### 5.1 建设一个统一 Web 应用

`apps/forge-web` 成为唯一正式浏览器应用。legacy `web/` 仅在迁移期间提供兼容入口，完成迁移后删除。

建议采用：

```text
React
TypeScript
Vite
React Router
```

选择理由：

- 页面和交互规模已超过单文件模板适合的范围；
- React 组件模型适合 Cards、Components、JSON Editor、Preview 和报告页面；
- Vite 可以生成静态产物，同时提供 chunk manifest；
- Router 可以让页面、Card、版本和 Tab 形成可分享、可恢复的 URL；
- 不需要 SSR，不改变静态发布模型。

首期不引入重量级全局状态框架。状态按以下顺序保存：

1. 路由参数：页面、Card reference；
2. URL query：版本、Tab、View、Sample、搜索和筛选；
3. 页面本地状态：编辑器草稿、弹窗和临时选择；
4. 数据 Client 缓存：Snapshot、Artifact、Profile 和 Install Manifest。

只有出现明确的跨页面可变状态需求时，才重新评估全局 Store。

### 5.2 保留静态和离线能力

正式 Server 使用 History Router，并为 `/forge/*` 提供 SPA fallback。

PR Preview 或下载后直接打开的 Bundle 使用路由适配层：

- HTTP 环境使用 History Router；
- `file:` 或自包含 Preview 环境使用 Hash Router；
- 页面组件和数据 Client 不感知路由实现差异。

### 5.3 显式区分两种运行模式

统一 Web 可以运行在两种模式，但同一进程只能选择一个权威 Card 数据源：

| 模式 | Card 数据来源 | Component 数据来源 | 主要用途 |
| --- | --- | --- | --- |
| `published` | Catalog Snapshot + Artifact | Artifact 固定的 Profile package | 正式站点、PR Preview |
| `workspace` | 本地 Card Workspace | 本地或已安装的精确 Profile | CLI `dev`、本地开发 |

Web 启动时读取统一 Runtime Descriptor：

```json
{
  "schemaVersion": 1,
  "mode": "published",
  "capabilities": {
    "cardCatalog": true,
    "componentCatalog": true,
    "templateDataPreview": false,
    "rawCardPreview": true,
    "handoffDownload": true
  }
}
```

页面根据能力显示或隐藏功能。禁止通过某个接口读取 Published Card，再通过另一个接口静默使用 Workspace
Profile 或 Template。

### 5.4 分离两种 JSON Preview

Playground 必须明确提供两个模式，避免把不同输入混为一谈。

#### Card JSON

输入是完整的标准 Adaptive Card JSON：

```text
Adaptive Card JSON
  -> JSON 解析
  -> Card Schema 与 Profile Capability 校验
  -> Preview Kit
  -> sandbox iframe
```

- 渲染可以完全在浏览器完成；
- 使用所选精确 Render Profile；
- Server 不负责将任意 JSON 转换成另一份 Card；
- 校验逻辑必须来自共享 Card Spec/Core 浏览器入口，不在页面复制；
- 默认禁用或拦截真实外部 Action，只展示可观察的本地 Action 事件。

#### Template Data

输入是某个已知 Card View 的 ViewModel 数据：

```text
Card reference + View + ViewModel JSON + Revision
  -> Server Preview Compiler
  -> 标准 Adaptive Card JSON
  -> Preview Kit
  -> sandbox iframe
```

- 仅在 `workspace` 或携带可执行 Template Bundle 的模式开放；
- 继续复用 Preview Session 的 revision 防陈旧机制；
- 编译错误返回稳定 code、JSON path 和诊断信息；
- 输出面板显示最终标准 Adaptive Card JSON。

## 6. 目标信息架构

```text
/forge/cards
/forge/cards/:reference
/forge/cards/:reference/preview
/forge/cards/:reference/contract
/forge/cards/:reference/validation
/forge/cards/:reference/versions

/forge/components
/forge/components/:componentId

/forge/playground
  ?mode=card-json
  ?mode=template-data&card=:reference&view=:view

/forge/install
```

页面职责如下。

### 6.1 Cards

- 搜索、Namespace 和状态筛选；
- Card 列表与版本选择；
- Sample 和 View 切换；
- Preview、Contract、Validation、Capabilities、Versions；
- Source、PR、Release、Artifact、Handoff 链接；
- URL 可恢复当前 Card 和查看位置。

### 6.2 Components

- 展示 Render Profile 提供的 Component、Utility 和 Pattern；
- 搜索、分类和预览宽度切换；
- 显示并复制标准 Adaptive Card JSON；
- 使用与 Card Preview 相同的 Preview Renderer；
- 页面不维护第二份 Component 示例。

“组件模板列表”在产品文案中需要区分：

- Component specimen：Render Profile 提供的标准组件示例；
- Card template：某个 Card View 的可编译模板。

两者不能共用模糊的 Template 数据类型。

### 6.3 Playground

- Card JSON 与 Template Data 分段模式；
- JSON 编辑器、格式化和错误定位；
- 320、480、640 和自适应预览宽度；
- Profile 信息和 Capability 结果；
- 最终 JSON、诊断和 Action 事件面板；
- 编辑器错误不能销毁上一次成功预览；
- 用户输入默认只保存在浏览器当前会话，不上传和持久化。

### 6.4 Install

- CLI 安装命令；
- Skill Bundle 下载、版本和 checksum；
- Render Profile 精确版本和兼容范围；
- 初始化命令和 Agent 使用提示；
- 数据来自版本化 Install Manifest，不由页面拼接版本规则。

## 7. Web 代码结构

```text
apps/forge-web/
  index.html
  vite.config.ts
  src/
    main.tsx
    app/
      App.tsx
      router.tsx
      runtime.ts
    pages/
      cards/
        CardsPage.tsx
        CardDetailPage.tsx
      components/
        ComponentsPage.tsx
        ComponentDetailPage.tsx
      playground/
        PlaygroundPage.tsx
      install/
        InstallPage.tsx
    features/
      catalog/
      artifact/
      component-catalog/
      preview/
      install/
    components/
      AppShell.tsx
      Navigation.tsx
      JsonEditor.tsx
      JsonViewer.tsx
      PreviewFrame.tsx
      ErrorBoundary.tsx
    data/
      client.ts
      contracts.ts
      errors.ts
    styles/
      tokens.css
      global.css
      components/
```

边界规则：

- `pages/` 负责路由组合，不直接访问 `fetch`；
- `features/` 负责领域 UI 和查询；
- `data/` 负责 HTTP、Bootstrap 和离线数据适配；
- `PreviewFrame` 是唯一创建 iframe 和加载 Adaptive Cards SDK/Profile 的组件；
- JSON 序列化、Artifact 验证和 Component Catalog 解码继续来自 workspace package；
- 页面不得从源 Card 目录读取文件。

## 8. Server 目标结构

保持 Node HTTP Server 和 CLI 内嵌启动能力，先拆边界，不要求立即引入 Web Server 框架。

```text
packages/cli/src/server/
  index.ts
  create-server.ts
  router.ts
  responses.ts
  request-body.ts
  static-assets.ts
  errors.ts

  routes/
    runtime.ts
    catalog.ts
    cards.ts
    components.ts
    preview.ts
    install.ts
    profiles.ts
    health.ts

  services/
    catalog-service.ts
    card-service.ts
    component-service.ts
    preview-service.ts
    install-service.ts

  providers/
    catalog-provider.ts
    published-catalog-provider.ts
    workspace-catalog-provider.ts
    profile-provider.ts
```

分层职责：

```text
HTTP Route
  -> 解析方法、路径、query 和 body
  -> 调用 Service
  -> 将稳定结果或错误映射为 HTTP

Service
  -> 编排 Artifact、Core、Preview、Profile 能力
  -> 不依赖 Node request/response

Provider
  -> Published 或 Workspace 数据来源
  -> 返回统一领域对象
```

### 8.1 数据源 Provider

定义统一接口，避免 Route 判断当前数据来自哪里：

```ts
interface ForgeContentProvider {
  readonly mode: "published" | "workspace";
  getRuntimeDescriptor(): Promise<RuntimeDescriptorV1>;
  listCards(): Promise<CardSummaryV1[]>;
  getCard(reference: string): Promise<CardDetailV1>;
  getArtifact(reference: string): Promise<CardArtifactV1>;
  getComponentCatalog(profileReference?: string): Promise<ComponentCatalogResponseV1>;
  getInstallManifest(): Promise<InstallManifestV1>;
}
```

Workspace 专属的 Template 编译能力使用单独接口，不伪装成 Published Provider 能力。

### 8.2 API 命名空间

新增统一 `/api/v1`，旧接口在迁移期作为兼容 Adapter：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/runtime` | 运行模式和能力 |
| GET | `/api/v1/cards` | Card 摘要列表 |
| GET | `/api/v1/cards/:reference` | Card 详情 |
| GET | `/api/v1/cards/:reference/artifact` | 已验证 Artifact |
| GET | `/api/v1/cards/:reference/handoff` | Handoff 下载 |
| GET | `/api/v1/components` | Component Catalog 与 Profile 摘要 |
| GET | `/api/v1/install` | 版本化安装信息 |
| GET | `/api/v1/profiles/:reference/host-config` | HostConfig |
| GET | `/api/v1/profiles/:reference/styles.css` | Profile CSS |
| POST | `/api/v1/preview/compile` | Template Data 编译 |
| POST | `/api/v1/preview/validate` | 可选的服务端 Card JSON 校验 |

所有 JSON 错误统一为：

```json
{
  "code": "preview.invalid_request",
  "message": "A JSON object request body is required",
  "details": [],
  "requestId": "..."
}
```

旧接口的删除条件：

- `/api/cards`：Cards 页面迁移完成；
- `/api/component-baseline`：Components 页面迁移完成；
- `/api/install`：Install 页面迁移完成；
- `/api/preview/v1/*`：Preview Client 完成新 API 迁移；
- `/forge/api/*`：Published Provider 完成新 API 迁移。

## 9. 缓存与交付策略

### 9.1 Published 数据

- Snapshot 使用可配置 TTL，并支持显式刷新；
- Snapshot 返回 `ETag`；
- Artifact 以 SHA-256 为 key 缓存；
- 已验证 Artifact 使用 immutable cache header；
- 上游下载失败时不得返回未验证内容；
- reference、Artifact 内部 Card identity 和 Snapshot record 必须一致。

### 9.2 Workspace 数据

- 开发模式可以按文件 revision 失效；
- Preview Session revision 继续防止提交陈旧数据；
- 编译缓存以 Card reference、revision、view 和 canonical input digest 为 key；
- Workspace 错误不得回退到 Published 数据。

### 9.3 静态资源

- Server 从 Vite manifest 或通用静态目录提供 hashed assets；
- `/forge/*` 未命中 API 或实际文件时回退 `index.html`；
- PR Preview Bundle 内嵌或相对引用所需 Snapshot 和 Artifact；
- Base Path、HTTP 部署和本地文件打开都必须纳入测试。

## 10. 安全边界

- JSON request body 保留大小限制，并为不同端点配置明确上限；
- Raw Card Preview 始终运行在 sandbox iframe；
- 不允许用户 JSON 注入页面 HTML 或 script；
- Preview Action 默认只记录，不直接打开任意 URL 或调用宿主能力；
- 外部资源只允许来自受信 Profile Manifest 和已验证 Artifact；
- Server 设置 CSP、`X-Content-Type-Options` 和合理的 Referrer Policy；
- Published Artifact 必须同时验证 digest、Schema 和 reference identity；
- API 错误不能泄露 Token、本地绝对路径或内部堆栈。

## 11. 测试策略

### 11.1 单元测试

- API request/response decoder；
- Provider 的 Published/Workspace 行为；
- Runtime capability 计算；
- Card reference 和 Artifact identity 校验；
- Playground JSON 解析、格式化和错误定位；
- 路由与 query 状态序列化。

### 11.2 Server 集成测试

- 每个 `/api/v1` 成功、404、400、409、422 和上游失败路径；
- Snapshot TTL、ETag 和 Artifact digest cache；
- Base Path 和 SPA fallback；
- Published 与 Workspace 模式禁止混用；
- 静态 chunk、source map 和 content type；
- body size、非法 URL 和错误信息脱敏。

### 11.3 Web 组件测试

- Cards 搜索、筛选、版本和 Tab；
- Components 搜索、分类、宽度和复制；
- Install 加载、错误和复制命令；
- Playground 两种模式及错误恢复；
- loading、empty、error 和 unavailable capability 状态。

### 11.4 端到端与视觉测试

至少覆盖：

- Desktop `1440x900`；
- Narrow desktop `1024x768`；
- Mobile `390x844`；
- Published 模式；
- Workspace 单 Card 模式；
- PR Preview 自包含模式；
- Card JSON 合法、非法和 Capability 不支持；
- Template Data 合法、Schema 错误和 stale revision；
- Forge Preview 与 `octo-web` 的同 Card/Profile 截图对比。

## 12. 迁移阶段

### Phase A：契约与回归基线

工作：

- 冻结现有 Cards、Components、Install 和 Preview 行为；
- 为关键页面保存桌面与移动端截图基线；
- 定义 Runtime Descriptor、API 错误和统一 Card 摘要契约；
- 明确 Published 与 Workspace Provider 的能力矩阵；
- 补齐 Artifact reference identity 校验。

退出 Gate：

- 新契约有 Schema、decoder 和测试；
- 当前四类用户流程有自动化基线；
- 数据源边界不再依赖页面自行判断。

### Phase B：Server 模块化

工作：

- 拆分 `server.ts`，保持旧 API 行为不变；
- 引入 Route、Service、Provider 分层；
- 增加统一错误响应和 request ID；
- 改造静态资源处理，为 Vite chunk 和 SPA fallback 做准备；
- 增加 Snapshot TTL、ETag 和 Artifact digest cache。

退出 Gate：

- 旧页面和现有测试全部通过；
- `server.ts` 只保留兼容导出或被新入口替代；
- Route 层不直接读取 Card、Profile 或文件系统。

### Phase C：统一 Web Shell

工作：

- 建立 React、Vite、Router 和 App Shell；
- 建立 `/cards`、`/components`、`/playground`、`/install` 空路由；
- 实现 Base Path 和离线 Preview 路由适配；
- 建立 Data Client、Error Boundary、loading 和 empty 状态；
- 迁移全局设计 token、导航、主题和语言设置。

退出 Gate：

- 四个路由可直接访问和刷新；
- URL 状态可恢复；
- hashed assets 可由 CLI Server 和 Preview Bundle 正确提供。

### Phase D：Cards 迁移

工作：

- 迁移 Catalog、Card Detail、Preview、Contract、Validation 和 Versions；
- 合并新版 `/forge/` 与 legacy `/` 的有效能力；
- Published 模式使用 Snapshot/Artifact；
- Workspace 模式提供 Sample、ViewModel 编辑和 Handoff；
- 删除重复 Card UI 实现。

退出 Gate：

- 两种模式的 Card 列表和详情都通过 E2E；
- Published 页面不扫描 Workspace；
- Workspace 页面不静默加载 Published Card；
- Card URL 可分享和恢复。

### Phase E：Components 与 Install 迁移

工作：

- 迁移 Component Catalog、搜索、筛选、预览和 JSON 复制；
- 迁移 Install 页面；
- Install 数据改为版本化 Manifest；
- 统一 Profile 资源加载和 PreviewFrame。

退出 Gate：

- Component 页面不维护重复 specimen；
- Install 页面不自行推导兼容版本；
- legacy `/components` 和 `/install` 可以重定向到新页面。

### Phase F：Playground

工作：

- 实现 Card JSON 模式；
- 实现 Template Data 模式；
- 增加 JSON 编辑、格式化、错误定位和诊断面板；
- 增加 Profile、宽度和 Sample 切换；
- Action 进入本地事件面板，不执行宿主副作用。

退出 Gate：

- 任意标准 Adaptive Card JSON 可以在受控 Profile 下预览；
- Template Data 使用 Server/Core 编译，不复制逻辑；
- 输入错误不会清空最后一次成功预览；
- 大小限制、sandbox 和 XSS 回归测试通过。

### Phase G：Legacy 删除

工作：

- 将 `/`、`/components`、`/install` 重定向到统一 Web；
- 删除 `web/app.js`、`web/components.js`、`web/install.js` 和重复 CSS；
- 删除旧 API Adapter；
- 更新 npm package、deploy bundle、README 和模块文档。

退出 Gate：

- 正式部署只包含一个 Web 应用；
- 没有页面依赖 legacy 文件；
- 没有重复 Card/Component Preview renderer；
- Published、Workspace 和 PR Preview 烟测全部通过。

## 13. PR 拆分建议

建议按可独立回滚的顺序提交：

1. Contracts、runtime descriptor 和回归测试；
2. Server Route/Service/Provider 拆分；
3. Vite/React Shell 和静态资源服务；
4. Cards 页面迁移；
5. Components 页面迁移；
6. Install 页面迁移；
7. Playground Card JSON；
8. Playground Template Data；
9. Legacy redirect 和删除；
10. 文档、部署包和最终视觉验收。

每个 PR 必须满足：

- 不同时重写 Web、Server 和核心 Contract；
- 保留兼容 Adapter，直到对应页面完成迁移；
- 包含对应测试和截图证据；
- 不提交临时 Snapshot、下载 Artifact 或本地调试文件。

## 14. 完成标准

重构完成需要同时满足：

- Forge 只有一个正式 Web 应用和一套导航；
- Cards、Components、Playground、Install 都有稳定路由；
- Published 与 Workspace 数据来源显式且不可混用；
- 任意标准 Adaptive Card JSON 可以安全预览；
- 已有 Card 可以使用 ViewModel JSON 进行 Template 编译预览；
- Card 和 Component Preview 复用同一个浏览器渲染适配；
- Server 路由、服务和数据源 Provider 已拆分；
- API 具有版本、稳定错误模型和完整测试；
- Base Path、移动端和离线 PR Preview 工作正常；
- legacy `web/` 页面和旧 API 已删除；
- Forge 仍然不依赖数据库、账号系统或 `octo-server`。

## 15. 实施前待确认

以下决策应在 Phase A 结束前确认：

1. 正式入口是否从 `/forge/` 提升为根路径，还是保留 `/forge/`；
2. Card JSON Playground 是否允许选择历史 Profile，还是只允许当前 Card 固定 Profile；
3. Published 模式是否提供 Handoff 下载，或仅链接 Release Asset；
4. Install Manifest 由 Forge Release 还是独立发布流程生成；
5. legacy URL 需要维持多长时间的重定向兼容。
