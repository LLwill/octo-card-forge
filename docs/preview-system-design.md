# Preview System v1 设计

> 状态：Preview API v1 和 Preview Kit client 已实现，Web 渲染适配待接入
>
> 生效日期：2026-08-20

## 1. 定位

Preview 是 Card Source 到可检查 Card JSON 的临时执行面。它服务本地开发和未来的 PR Preview，
不保存数据、不管理账号，也不承担生产渲染职责。

```text
现有 Web 页面
  → Preview API v1
  → Workspace Loader
  → Core
  → Render Profile
```

Preview 使用和 CLI 相同的 `Workspace → Core` 运行链路。这样本地页面、CLI、CI 的 Contract、
Template、Inspection 和 Capability 诊断不会出现三套语义。

## 2. 边界

Preview 负责：

- 加载一个 Card Package 和精确 Render Profile；
- 返回可用于初始化页面的 session；
- 按 session revision 编译指定 View 和数据；
- 返回标准 Card JSON、Inspection 和 Validation Issues；
- 提供 Host Config 和 Profile CSS。

Preview 不负责：

- 保存 Card、样例或用户输入；
- 账号、登录、组织权限和审批；
- 调用 `octo-server` 或持有业务凭证；
- 生产消息、Runtime Binding 或最终业务校验；
- 复制 `octo-web` 的业务组件和交互逻辑。

## 3. 运行时对象

### 3.1 Workspace Loader

`packages/workspace` 是唯一读取 Card 文件目录的边界。它负责：

- 校验 `manifest.json`；
- 解析契约、View Template 和 Sample；
- 检查所有资源必须位于 Card Package 内；
- 返回不含文件路径的 `ResolvedCardSourceV1`。

Core 不接收目录、文件名、Git 或 HTTP 对象。

### 3.2 Core

`packages/core` 是纯对象编译器：

```ts
compileCardSource({ source, view, data, profile })
```

它返回 `CompileResult`，包括标准 Card JSON、Inspection、Wire Profile 和 Issues。未知 View 直接
失败；数据契约或渲染能力错误进入 `issues`，由上层决定 HTTP/CLI 状态码。

### 3.3 Runtime

根 CLI 和本地 Server 通过 `src/core-adapter.ts` 组装 runtime：

```text
CardPackage
  + ResolvedCardSourceV1
  + RenderProfileSource
  + sha256 revision
```

Revision 对 Card Source 和 Profile 的实际内容计算，不包含绝对路径、进程信息、用户信息或当前
时间。Profile CSS、Host Config、Capabilities 或 Card 文件变化都会产生新的 revision。

## 4. Preview API v1

当前实现位于根本地 Server，所有路径都受 `BASE_PATH` 影响。

### 4.1 Session

```http
GET /api/preview/v1/session?cardId=docs.access-request
```

绑定了 `cardRoot` 的本地 Server 可以省略 `cardId`。Catalog Server 没有绑定 Card 时必须提供
`cardId`。

返回：

```json
{
  "schemaVersion": 1,
  "revision": "sha256:<64 hex chars>",
  "card": {
    "reference": "docs.access-request",
    "id": "docs.access-request",
    "name": "文档访问申请",
    "version": "0.2.0",
    "mutable": true
  },
  "renderProfile": {
    "reference": "octo-chat@1.2.0-rc.3",
    "source": "workspace",
    "manifest": {}
  },
  "views": [
    {
      "name": "pending",
      "wireProfile": "octo/v2",
      "samples": ["pending"]
    }
  ]
}
```

Session 不返回 Card 根目录、文件名、绝对路径或 Profile 根目录。页面先拿到 session，再使用其中
的 `revision` 发起渲染。

### 4.2 Render

```http
POST /api/preview/v1/render
Content-Type: application/json
```

```json
{
  "cardId": "docs.access-request",
  "revision": "sha256:<session revision>",
  "view": "pending",
  "data": {}
}
```

成功和校验失败都返回：

```json
{
  "schemaVersion": 1,
  "revision": "sha256:...",
  "valid": true,
  "cardId": "docs.access-request",
  "cardVersion": "0.2.0",
  "contractVersion": "1.0.0",
  "renderProfile": "octo-chat@1.2.0-rc.3",
  "wireProfile": "octo/v2",
  "view": "pending",
  "payload": {},
  "inspection": {},
  "issues": []
}
```

状态码：

| 状态码 | code | 含义 |
| ---: | --- | --- |
| 200 | - | 编译成功且没有 error issue |
| 400 | `preview.invalid_request` | Body、cardId、revision、view 或 data 不合法 |
| 404 | `preview.card_not_found` / `preview.view_not_found` | Card 或 View 不存在 |
| 409 | `preview.stale_revision` / `preview.card_mismatch` | 页面使用了旧内容或错误 Card |
| 422 | - | 编译完成，但 Contract/Core 产生 error issue |
| 500 | `preview.internal_error` | 运行面本身不可用；不返回内部路径 |

`/api/render` 保留原有请求和响应格式，作为兼容 facade。新页面应使用 Preview API v1，并且不能
自行复制编译、校验或 revision 逻辑。

### 4.3 Render Profile 资源

```http
GET /api/preview/v1/profile/host-config.json
GET /api/preview/v1/profile/styles.css
```

Profile 资源来自当前 runtime。Catalog Server 没有绑定 Card 时可通过 `?cardId=` 选择 Card，
否则使用 Server 绑定的 Profile 或当前 Profile。响应只返回 JSON/CSS 内容，不返回文件路径。

## 5. 页面接入顺序

页面只需要实现以下状态：

```text
loading session
  → session ready
  → render pending
  → render result / validation issues
  → stale revision → refresh session
  → network/internal error
```

建议把 `session`、`render`、`host-config` 和 `styles` 封装在一个小的 Preview Client 中。Client
只处理 HTTP、revision 和状态，不放入 Card 业务规则。

当前 `packages/preview-kit` 负责：

- Preview API client；
- Preview session/render/profile 的共享 TypeScript 契约；
- HTTP 错误映射、base path 和 revision 透传。

后续在同一个包中增加的浏览器适配负责：

- Profile/HostConfig 注入；
- Adaptive Cards SDK 初始化；
- 统一错误、loading 和 stale 状态；
- CLI dev Server 和 Forge Web 的共享渲染适配。

它不负责 Catalog 数据访问、GitHub 权限或生产消息业务。

## 6. 演进路径

当前阶段：

1. 根 Server 提供 Preview API v1；
2. 根 CLI、旧 `/api/render` 和 Preview 使用同一 Core facade；
3. 通过测试固定 session、revision、错误码和 Profile 资源行为。

下一阶段：

1. 在 `apps/forge-web` 中接入 Preview Kit，先接 Fixture，再接 `catalog-snapshot.v1`；
2. 增加共享 Adaptive Cards 浏览器适配，避免 Web 自己复制请求状态机；
3. `apps/local-preview` 复用同一 Preview Kit，但保留本地目录加载和热刷新；
4. PR Preview 使用 Snapshot/Artifact，而不是在生产 Web 中扫描目录；
5. 最终移除 Web 对目录型 API 的依赖，保留 Preview API 作为本地开发和 CI 适配层。

SSE、文件监听和热刷新不属于 v1 必需协议，等静态页面和 Snapshot Contract 稳定后再增加。

## 7. 验收标准

- CLI、旧 `/api/render`、Preview API 对同一个 Source 产生相同 payload/issues/inspection；
- Preview session 不泄漏绝对路径；
- Card 或 Profile 内容变化会改变 revision；
- 旧 revision 不会静默渲染新内容；
- npm 包中的 CLI/Server 不依赖私有 workspace runtime package；
- Preview 不需要数据库、账号、GitHub Token 或 `octo-server` 连接。
