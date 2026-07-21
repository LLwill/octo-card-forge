# Octo Card Forge 架构与开发设计

> 状态：Proposal
> 日期：2026-07-21
> 适用范围：Octo Adaptive Cards 的设计、数据契约、编译、校验、预览、发布与后端接入

## 1. 背景

Octo 已经具备完整的 Adaptive Cards 基础链路：

- `octo-server` 接收并校验标准 Adaptive Card JSON，保存卡片消息，处理 `Action.Submit`，校验 `Input.*`，并将动作分发给业务服务。
- `octo-web` 使用官方 Adaptive Cards SDK 和产品 HostConfig 渲染卡片，收集输入并提交动作。
- 业务后端负责产生卡片需要的业务数据，消费卡片动作，并在状态变化后更新整张卡片。

Card Forge 的目标不是再实现一种卡片协议，而是为上述链路提供统一的卡片设计、编译、验证和版本管理能力。

## 2. 核心决策

### 2.1 Card Forge 的定位

Card Forge 是 Octo 的卡片设计与编译平台，负责：

1. 管理标准 Adaptive Cards 模板。
2. 定义后端需要提供的 Card ViewModel JSON Schema。
3. 使用示例数据编译完整 Adaptive Card JSON。
4. 按 Octo Server 能力和平台渲染规范执行预校验。
5. 提供本地预览、交互模拟和视觉回归。
6. 管理卡片版本和不可变发布制品。
7. 向外部 AI Agent 提供稳定的 Skill 和 CLI。

Card Forge 不负责：

- 理解业务后端的领域模型。
- 决定某个字段应从哪张业务表或哪个服务获得。
- 替代 `octo-server` 的最终安全校验。
- 替代 `octo-web` 的运行时渲染。
- 引入卡片私有渲染标记。
- 在平台内部运行 AI Agent。
- 再定义一套 Action/Input 交互协议。

### 2.2 取消 `interactions.json`

标准 Adaptive Card JSON 已经完整表达：

- Action 类型、ID、`associatedInputs` 和静态 `data`。
- Input 类型、ID、必填规则、长度限制和 ChoiceSet 选项。
- `Action.ToggleVisibility` 的目标和显隐状态。

因此 Card Package 不再维护 `interactions.json`。Action、Input 和显隐关系由 Card Forge 从编译后的标准 JSON 自动提取，仅用于检查和生成交付文档。

### 2.3 平台 Render Profile 是渲染标准

Card Forge 管理的平台 Render Profile 是卡片视觉规范的唯一来源。`octo-web` 和 Card Forge Preview 都消费同一份发布制品。

不再使用 `octo-web@x.y.z` 表示平台规范，统一使用描述渲染表面的名称，例如：

```text
octo-chat@1.0.0
```

Adaptive Cards 官方文件名 `host-config.json` 可以保留，但产品概念、目录和 CLI 统一使用 `Render Profile` 或 `profile`，避免把 `host` 误解为服务器。

### 2.4 Server 能力不是 Card Package 协议

`octo-server` 已提供：

```http
GET /v1/bot/card/profile
```

该接口返回当前部署支持的：

- `octo/v1`、`octo/v2`。
- Adaptive Card 版本。
- Element、Input 和 Action 集合。
- Payload、节点数、深度和输入大小限制。

Card Forge 只在开发或 CI 校验时读取该接口。能力数据不写入卡片 Manifest，不随卡片发送，也不要求 Server 调用 Card Forge。

## 3. 系统架构

```text
外部 Agent / 开发者
        │ Skill + CLI
        ▼
┌──────────────────────────────┐
│ Octo Card Forge              │
│                              │
│ Card Package                 │
│ ViewModel Schema             │
│ Adaptive Card Template       │
│ Samples                      │
│ Render Profile               │
│ Compiler / Validator         │
│ Preview / Catalog / Registry │
└──────────────┬───────────────┘
               │ 标准 Adaptive Card JSON
               ▼
业务后端 ──发送/更新──▶ octo-server ──消息同步──▶ octo-web
   ▲                         │                         │
   └──── card_action ────────┘                         │
                                                     │
              Render Profile 制品 ◀──────────────────┘
```

### 3.1 各组件职责

| 组件 | 职责 |
| --- | --- |
| Card Forge | 模板、数据契约、编译、校验、预览、版本与发布 |
| 业务后端 | 领域模型映射、调用 Render API、业务动作处理、整卡更新 |
| octo-server | 最终校验、消息存储、动作防伪、输入校验、事件分发 |
| octo-web | 使用官方 SDK 和平台 Render Profile 渲染及执行通用交互 |
| 外部 Agent | 通过 Skill/CLI 修改 Card Package 并提交代码变更 |

## 4. 唯一事实来源

| 内容 | 唯一事实来源 |
| --- | --- |
| 卡片布局 | Adaptive Card Template |
| 后端渲染输入 | `contract/data.schema.json` |
| Action/Input 定义 | 编译后的标准 Adaptive Card JSON |
| Octo 协议档位 | View 的 `wireProfile` |
| Server 最终接受能力 | `octo-server` 校验器和 `/v1/bot/card/profile` |
| 平台视觉规范 | Card Forge Render Profile |
| 生产卡片版本 | Card Registry 不可变发布制品 |
| 业务字段来源 | 业务后端领域映射代码 |

不得在两个文件中手工维护同一份 Action、Input、组件白名单或样式规则。

## 5. Card Package 设计

### 5.1 目录结构

```text
cards/docs.access-request/
├── manifest.json
├── contract/
│   └── data.schema.json
├── templates/
│   ├── pending.template.json
│   └── result.template.json
└── samples/
    ├── pending.json
    ├── approved.json
    └── rejected.json
```

不再包含 `interactions.json`。

### 5.2 Manifest v2

```json
{
  "schemaVersion": 2,
  "id": "docs.access-request",
  "name": "文档访问申请",
  "version": "0.2.0",
  "contractVersion": "1.0.0",
  "adaptiveCardVersion": "1.5",
  "renderProfile": "octo-chat@1.0.0",
  "defaultLocale": "zh-CN",
  "dataSchema": "contract/data.schema.json",
  "views": {
    "pending": {
      "wireProfile": "octo/v2",
      "template": "templates/pending.template.json",
      "samples": ["samples/pending.json"]
    },
    "result": {
      "wireProfile": "octo/v1",
      "template": "templates/result.template.json",
      "samples": [
        "samples/approved.json",
        "samples/rejected.json"
      ]
    }
  }
}
```

字段说明：

| 字段 | 含义 |
| --- | --- |
| `version` | Card Package 版本，任何可发布变化均需递增 |
| `contractVersion` | Card ViewModel Schema 版本 |
| `adaptiveCardVersion` | 模板输出的 Adaptive Cards 版本 |
| `renderProfile` | 设计、预览和验证使用的平台渲染规范 |
| `wireProfile` | 该 View 发送时使用 `octo/v1` 或 `octo/v2` |

交互 View 使用 `octo/v2`；不包含 Input/Submit 的结果 View 优先使用 `octo/v1`。

### 5.3 Card ViewModel

Schema 描述展示就绪的数据，不直接暴露后端领域模型：

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["requestId", "document", "requester"],
  "properties": {
    "requestId": {
      "type": "string",
      "description": "文档访问申请 ID"
    },
    "document": {
      "type": "object",
      "required": ["title", "url"],
      "properties": {
        "title": { "type": "string" },
        "url": { "type": "string", "format": "uri" }
      }
    },
    "requester": {
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": { "type": "string" },
        "avatarUrl": { "type": "string", "format": "uri" }
      }
    }
  }
}
```

业务后端负责把领域模型显式映射成该结构。Card Forge 不接收后端领域对象，也不决定数据来源。

## 6. Render Profile 设计

### 6.1 目录结构

```text
render-profiles/octo-chat/1.0.0/
├── manifest.json
├── host-config.json
├── styles.css
├── light.tokens.json
└── dark.tokens.json
```

Render Profile 负责：

- 字号、字重和字体。
- 间距、分割线和容器 Padding。
- Action 排列、对齐和按钮间距。
- Container Style。
- 明暗主题语义色。
- Adaptive Cards SDK 版本。
- 所有卡片共享的通用补充样式。

禁止放入：

- 单张卡片专用 CSS。
- 业务 ID 或业务状态判断。
- Card-specific renderer marker。

### 6.2 语义 Token

Render Profile 可以使用平台语义 Token：

```json
{
  "containerStyles": {
    "default": {
      "backgroundColor": "{color.surface}"
    },
    "attention": {
      "backgroundColor": "{color.danger.background}"
    }
  }
}
```

Card Forge Preview 使用主题 Token 文件解析；`octo-web` 使用适配器将相同语义 Token 映射为现有 `--wk-*` CSS Variable。

### 6.3 消费方式

Render Profile 通过构建制品提供给 `octo-web`，不在运行时从远程加载：

```text
Card Forge 修改 Profile
  → 校验所有卡片
  → 视觉回归
  → 发布不可变 Profile Bundle
  → octo-web 更新引用版本
  → octo-web 正常发版
```

生产 `octo-web` 当前使用一份全局 Render Profile。卡片 Manifest 中的 `renderProfile` 表示该卡片设计和发布时验证过的目标规范，不随消息发送给 Web。

### 6.4 Profile CLI

```bash
octo-card profile validate octo-chat@1.0.0
octo-card profile bundle octo-chat@1.0.0
octo-card profile diff octo-chat@1.0.0 octo-chat@1.1.0
octo-card profile publish octo-chat@1.1.0
```

## 7. 编译与校验

### 7.1 编译链路

```text
Card ViewModel
  → JSON Schema 校验
  → Adaptive Cards Template Expand
  → 标准 Adaptive Card JSON
  → Adaptive Cards Schema 校验
  → Octo Server 能力预校验
  → Render Profile / Web 兼容性校验
  → 安全与资源限制校验
```

任一 Error 都不得输出可发布制品。

### 7.2 Server 能力校验

在线校验：

```bash
octo-card check docs.access-request \
  --server http://127.0.0.1:8090 \
  --bot-token "$OCTO_BOT_TOKEN"
```

离线校验使用 Card Forge 内置的 Octo 最低兼容基线。该基线是工具配置，不属于 Card Package。

Card Forge 必须理解 Adaptive Cards 的结构上下文。例如 `Column`、`TextRun`、`TableRow` 和 `TableCell` 是受父元素约束的结构节点，不能简单将所有 `type` 与 Server 返回的顶层 Element 数组做无上下文匹配。

### 7.3 校验内容

至少覆盖：

- Adaptive Cards 官方 Schema。
- `octo/v1`、`octo/v2` 能力边界。
- Element、Input 和 Action 支持情况。
- Input 和 Action ID 必填、唯一。
- `Action.ToggleVisibility` 目标存在。
- URL scheme 和远程资源安全。
- 节点数、深度和 Payload 大小。
- Input.Text、ChoiceSet、Toggle、Number、Date、Time 约束。
- 未展开模板表达式。
- 所有 View 的所有 Sample。
- 第三方图片、头像和图标依赖提示。
- `Action.Submit.data` 中不得包含 Token、秘密或不必要的敏感信息。

## 8. 标准交互模型

### 8.1 Action.Submit

业务路由信息直接放在标准 `Action.Submit.data`：

```json
{
  "type": "Action.Submit",
  "id": "deny_confirm",
  "title": "确认拒绝",
  "data": {
    "owner": "docs",
    "action_type": "access_request.decision",
    "decision": "deny",
    "request_id": "${requestId}"
  }
}
```

Web 提交时只发送：

```json
{
  "message_id": "...",
  "channel_id": "...",
  "channel_type": 1,
  "action_id": "deny_confirm",
  "inputs": {
    "deny_reason": "资料不完整"
  },
  "client_token": "..."
}
```

Web 不上传 `Action.Submit.data`。Server 从当前生效卡片中根据 `action_id` 重新提取可信的静态 `data`。

### 8.2 自动生成交互说明

Card Forge 提供：

```bash
octo-card inspect docs.access-request --sample pending
```

输出从标准 JSON 自动提取的 Action、Input 和 Toggle 关系：

```json
{
  "actions": [
    {
      "id": "deny_confirm",
      "type": "Action.Submit",
      "associatedInputs": "auto",
      "dataKeys": ["owner", "action_type", "decision", "request_id"]
    }
  ],
  "inputs": [
    {
      "id": "deny_reason",
      "type": "Input.Text",
      "isRequired": true,
      "maxLength": 200
    }
  ]
}
```

该输出是自动生成的文档，不是新的交互协议。

### 8.3 文档拒绝交互

文档拒绝统一改为标准 Adaptive Cards 交互：

1. 点击“拒绝”。
2. `Action.ToggleVisibility` 隐藏主操作区并显示拒绝表单。
3. 用户输入拒绝原因。
4. 点击“确认拒绝”执行 `Action.Submit`。
5. 点击“取消”恢复主操作区。

```json
{
  "type": "Action.ToggleVisibility",
  "title": "拒绝",
  "targetElements": [
    { "elementId": "primary_actions", "isVisible": false },
    { "elementId": "deny_panel", "isVisible": true }
  ]
}
```

配套 Web 改造：

- 删除文档拒绝专用 Semi UI 弹窗。
- 删除 `isDocsDenyAction` 专用分支。
- 通用提交逻辑遵循 `associatedInputs`。
- 通用提交逻辑执行标准必填校验。

业务后端仅在 `decision=deny` 时校验 `deny_reason`。Card Forge 不记录旧弹窗兼容逻辑，直接面向标准方案。

### 8.4 卡片更新

状态变化后生成一张新的完整 Card JSON，并通过现有 `content_edit` 更新整张卡片。不引入局部 JSON Patch 或 Card Forge 状态机协议。

```text
pending Card
  → card_action
  → 业务处理
  → Render approved/rejected View
  → content_edit 完整替换
  → Web 重新渲染
```

## 9. 后端接入

### 9.1 开发阶段

后端先获取数据契约：

```bash
octo-card contract docs.access-request --format markdown
octo-card contract docs.access-request --format json
```

Contract 输出包含：

- Card ID、Card Version、Contract Version。
- View 列表及其 `wireProfile`。
- JSON Schema。
- 字段说明、示例和状态条件。
- 从标准 JSON 自动提取的 Action/Input 清单。
- Render API 请求示例。
- `card_action` 事件示例。
- 整卡更新示例。

后端显式编写领域模型到 ViewModel 的映射，避免 Card Forge 依赖业务代码。

### 9.2 Render API

开发接口可以使用当前 Draft：

```http
POST /dev/cards/docs.access-request/render
```

生产接口必须固定版本：

```http
POST /v1/cards/docs.access-request/versions/0.2.0/render
Content-Type: application/json

{
  "view": "pending",
  "locale": "zh-CN",
  "data": {
    "requestId": "REQ-001"
  }
}
```

响应：

```json
{
  "cardId": "docs.access-request",
  "cardVersion": "0.2.0",
  "contractVersion": "1.0.0",
  "view": "pending",
  "wireProfile": "octo/v2",
  "adaptiveCardVersion": "1.5",
  "card": {
    "type": "AdaptiveCard",
    "version": "1.5"
  }
}
```

业务后端将返回的 `card` 和 `wireProfile` 交给现有 Octo 发送链路。`octo-server` 不需要知道 Card Forge Card ID 或 Card Version。

### 9.3 运行时要求

正式部署 Render API 时必须具备：

- 仅加载已发布的不可变版本。
- 模板和 JSON Schema 预编译缓存。
- 请求大小和超时限制。
- 稳定的错误码和字段级错误。
- 认证、审计、指标和日志。
- 灰度、回滚和健康检查。
- 不允许请求方提交任意模板路径或执行任意表达式。

MVP 阶段 Render API 仅用于本地开发；完成 Registry、不可变制品和运行保障后再作为生产依赖。

## 10. 版本与发布

### 10.1 版本模型

| 版本 | 作用 |
| --- | --- |
| Card Version | 模板、View、样式目标或行为的发布版本 |
| Contract Version | Card ViewModel Schema 版本 |
| Render Profile Version | 平台渲染规范版本 |

版本规则：

- Card 的任何可发布变化都递增 Card Version。
- ViewModel 兼容性变化才递增 Contract Version。
- Render Profile 独立版本化，已发布目录禁止原地修改。

### 10.2 Git 与 Registry

Git 管理源码和评审，Card Registry 管理生产不可变制品：

```text
Git
├── 当前 Draft
├── PR Review
└── Commit / Tag

Card Registry
├── docs.access-request@0.1.0
├── docs.access-request@0.2.0
└── docs.access-request@0.3.0
```

生产后端固定具体版本，不默认使用 `latest`。Catalog 可以展示 Draft 和全部历史发布版本。

### 10.3 发布流程

```text
修改 Card Package
  → typecheck / unit test
  → 编译全部 Sample
  → Server 能力校验
  → Render Profile 校验
  → 视觉回归
  → 兼容性 Diff
  → 生成不可变 Bundle + checksum
  → 发布 Registry
```

## 11. CLI 设计

```text
octo-card init <card-id>
octo-card list
octo-card contract <card-id>
octo-card inspect <card-id>
octo-card render <card-id>
octo-card check [card-id]
octo-card diff <old-ref> <new-ref>
octo-card dev [card-id]
octo-card release <card-id>

octo-card profile validate <profile-ref>
octo-card profile bundle <profile-ref>
octo-card profile diff <old-ref> <new-ref>
octo-card profile publish <profile-ref>
```

所有供 Agent 和 CI 使用的命令都支持：

```bash
--format json
```

JSON 输出结构和错误码必须保持向后兼容。

## 12. Catalog 与预览

Catalog 面向人类查看和评审，不是模板的唯一编辑入口。核心能力：

- Card、View、Sample 和版本选择。
- ViewModel JSON 编辑与实时编译。
- 最终 Card JSON 查看。
- 数据契约查看。
- Render Profile 和明暗主题切换。
- 桌面和移动宽度预览。
- ToggleVisibility 和 Input 操作。
- 模拟 `Action.Submit` 请求。
- 展示 Server 将提取的 `Action.Submit.data`。
- pending 到 approved/rejected 的整卡更新模拟。
- 校验错误定位。
- 历史版本和视觉 Diff。

每个 Sample 至少生成：

- 桌面亮色截图。
- 桌面暗色截图。
- 移动亮色截图。
- 移动暗色截图。

## 13. Agent Skill

Card Forge 自身不内置 Agent。外部 Agent 通过仓库 Skill 和 CLI 工作。

Skill 必须要求 Agent：

1. 检查 Git 状态并保护无关改动。
2. 先定义或确认 Card ViewModel Schema。
3. 只使用标准 Adaptive Cards 组件和动作。
4. 不创建 `interactions.json`。
5. 不发明 Input 类型、业务状态协议或渲染标记。
6. Action/Input 说明从模板自动提取。
7. 不清楚业务字段或动作语义时列出问题，不自行猜测。
8. 验证全部 View 和 Sample。
9. 执行 Server 能力和 Render Profile 校验。
10. 输出后端字段、Action、Input、版本和本地预览说明。
11. 未获得授权时不提交、推送、发布或创建 PR。

## 14. 当前实现迁移

### 14.1 Card Package v2

修改：

- 从 `CardManifest` 删除 `interactions`。
- 从 `CardManifest` 增加 `renderProfile`。
- 为每个 View 增加 `wireProfile`。
- `schemaVersion` 升级为 2。
- 删除所有 Card Package 中的 `interactions.json`。

### 14.2 Compiler 与 Validator

删除：

- `InteractionContract`。
- `validateInteractions()`。
- Compiler 对 `interactions.json` 的读取。

增加：

- 标准 Card JSON 的 Action/Input 自动提取。
- Adaptive Cards 官方 Schema 校验。
- Octo Server Profile 在线/离线校验。
- 结构节点上下文校验。
- Render Profile 兼容性校验。

### 14.3 CLI 与 API

修改：

- `init` 不再生成 `interactions.json`。
- `contract` 不再返回 interactions。
- 新增 `inspect`。
- 新增 Card/Contract 兼容性 `diff`。
- Render API 增加显式 Card Version。
- 生产 Render API 禁止隐式 latest。

### 14.4 Host Profile 重命名

```text
host-profiles/                  → render-profiles/
hostProfile                    → renderProfile
octo-web@1.x                   → octo-chat@1.x
octo-card host ...             → octo-card profile ...
```

迁移后 Card Forge 是 Render Profile 唯一来源；`octo-web` 改为消费构建制品。

### 14.5 octo-web 标准化

- 删除文档拒绝专用弹窗和动作识别。
- 通用提交逻辑遵循标准 `associatedInputs`。
- 通用提交逻辑执行 Input 必填校验。
- 构建时消费 Card Forge Render Profile Bundle。
- 保留平台 CSS Token 解析适配层。

### 14.6 octo-server

第一阶段不需要修改 Server 协议。继续使用现有：

- `type=17` Interactive Card。
- `octo/v1`、`octo/v2`。
- `Action.Submit.data` 服务端提取。
- `Input.*` 服务端校验。
- `card_action` 分发。
- `content_edit` 整卡更新。
- `/v1/bot/card/profile` 能力发现。

如果后续需要更严格的 CI 一致性，可以增加只读的卡片 dry-run 校验接口，但不作为 MVP 前置条件。

## 15. 实施阶段

### 阶段一：协议简化与能力对齐

- 删除 `interactions.json` 全链路。
- 完成 Manifest v2。
- 完成 Render Profile 重命名。
- 增加 `inspect` 和标准 Action/Input/Toggle 自动提取。
- 修正 Server 能力限制和结构节点校验。
- 更新 README、Skill 和测试。

验收：现有所有 Sample 在不依赖交互副协议的情况下完成编译和校验。

### 阶段二：标准交互与预览一致性

- 增加真实 Action/Input 提交模拟。
- 增加整卡更新模拟。
- octo-web 移除文档拒绝特例。
- octo-web 遵循 `associatedInputs` 和必填校验。
- Render Profile 制品接入 octo-web。

验收：文档拒绝完全使用标准 Adaptive Cards，在 Card Forge Preview 和生产 Web 中行为一致。

### 阶段三：版本发布

- Card/Profile Bundle。
- 不可变 Registry。
- Card/Contract/Profile Diff。
- Catalog 历史版本。
- CI 视觉回归。

验收：业务后端可以固定 Card Version，并安全升级或回滚。

### 阶段四：生产 Render Service

- 版本化 Render API。
- 缓存、认证、审计、指标和限流。
- 灰度与回滚。
- SLA 和故障处理。

验收：业务后端可以稳定地将 ViewModel 编译成指定版本的标准 Card JSON，且 `octo-server`、`octo-web` 无需理解 Card Forge 私有协议。

## 16. 最终约束

以下原则作为实现和 Code Review 的强制约束：

1. 标准 Adaptive Card JSON 是交互唯一事实来源。
2. Card ViewModel Schema 是后端数据交付唯一契约。
3. Card Forge Render Profile 是平台视觉规范唯一来源。
4. `octo-server` 是运行时能力和安全校验最终权威。
5. 业务后端决定领域模型映射和业务动作语义。
6. 状态更新使用完整新卡片，不引入局部 Patch 协议。
7. Card Forge 不引入业务专用渲染逻辑。
8. 外部 Agent 使用 Skill/CLI，平台本身不运行 Agent。
9. 生产必须固定不可变 Card Version，不隐式使用 latest。
10. 已发布 Card、Contract 和 Render Profile 制品禁止原地修改。
