# Octo Card Forge 单主题 Render Profile 接入实施方案

## 1. 文档状态

- 状态：实施基线，待按 PR 顺序执行
- 范围：`octo-card-forge`、`octo-web`、`octo-server`、首个业务卡片 producer
- 当前阶段：只支持一份默认主题；明暗主题不在本轮范围
- 核心目标：Card Forge 成为新卡片视觉标准来源，同时保证线上历史卡片和未迁移模板完全不变

## 2. 不可破坏的线上前提

1. 已经投递并持久化的 type-17 卡片没有 Render Profile 标识。
2. 当前后端模板仍按原有结构生成卡片。
3. 现有 `octo-web` HostConfig 和 `.wk-interactive-card-sdk .ac-*` CSS 已在线上使用。
4. `octo/v1`、`octo/v2` 表达协议能力，不能用来判断视觉规范。
5. 不允许根据 Card 结构、Action ID、业务字段或发送者猜测视觉 Profile。

因此，缺少 `render_profile` 的卡片必须永久保持 legacy 渲染行为。

## 3. 最终决策

### 3.1 单一 renderer，两个显式渲染档位

Web 继续只保留现有 `renderOctoCard()`，内部选择渲染档位：

```text
render_profile 缺失
  → legacy HostConfig
  → legacy 根类 wk-interactive-card-sdk
  → 现有线上 CSS

render_profile = octo-chat/v1
  → Forge HostConfig
  → Forge 根类 wk-interactive-card-forge octo-card-profile
  → Forge 发布 CSS
```

未知的非空 `render_profile` 不回退 legacy，而是进入客户端升级提示，避免把新规范卡片错误套入旧样式。

### 3.2 运行时只保存兼容代际

消息信封使用：

```json
{
  "render_profile": "octo-chat/v1"
}
```

消息中禁止出现精确制品版本，例如：

```json
{
  "render_profile": "octo-chat@1.2.0"
}
```

### 3.3 精确版本只用于构建和发布

四种版本必须分开：

| 概念 | 示例 | 作用 |
| --- | --- | --- |
| Card Package 版本 | `docs.access-request@0.3.0` | 业务模板与数据契约版本 |
| Wire 能力档位 | `octo/v1`、`octo/v2` | Adaptive Cards 元素与交互能力 |
| Render 兼容代际 | `octo-chat/v1` | 持久化消息和客户端协商 |
| Profile 制品版本 | `octo-chat@1.2.0` | 构建、发布、锁定与回滚 |

Web 不保存所有 `1.x` 制品，只将 `octo-chat/v1` 映射到当前审核通过的一个精确版本。

### 3.4 Forge 负责最终视觉值

本轮不实现 Web Token Adapter。Card Forge 发布包必须包含可直接使用的：

- 具体值 HostConfig；
- 单主题变量定义；
- 完整、带作用域的 Adaptive Cards CSS。

Web 不把 Forge Token 映射成 `--wk-*`，只负责选择 legacy 或 Forge。

## 4. 制品契约

### 4.1 Forge 源目录

推荐源目录：

```text
render-profiles/octo-chat/1.2.0/
├── manifest.json
├── host-config.template.json
├── tokens.json
├── styles.css
└── capabilities.json
```

`tokens.json` 是本轮唯一主题的最终值，而不是 Preview 临时值：

```json
{
  "color.surface": "#ffffff",
  "color.text.primary": "#1f2329",
  "color.text.secondary": "#6b7075",
  "color.accent": "#7f3bf5"
}
```

### 4.2 编译后 npm 包

包名：

```text
@dmwork/octo-card-profile-octo-chat@1.2.0
```

包内容：

```text
package/
├── package.json
└── dist/
    ├── manifest.json
    ├── host-config.json
    ├── theme.css
    ├── styles.css
    ├── capabilities.json
    └── bundle-manifest.json
```

其中：

- `host-config.json` 已将语义 Token 解析为具体值；
- `theme.css` 在 `.octo-card-profile` 内定义 `--octo-card-*`；
- `styles.css` 的每个普通选择器都受 `.octo-card-profile` 约束；
- `bundle-manifest.json` 记录每个文件的 SHA-256、SDK 版本和来源 Profile。

Manifest 至少包含：

```json
{
  "id": "octo-chat",
  "version": "1.2.0",
  "compatibility": "octo-chat/v1",
  "adaptiveCardsSdkVersion": "3.0.6",
  "hostConfig": "dist/host-config.json",
  "theme": "dist/theme.css",
  "stylesheet": "dist/styles.css",
  "capabilities": "dist/capabilities.json"
}
```

## 5. CSS 隔离规范

### 5.1 允许

```css
.octo-card-profile {
  --octo-card-color-surface: #ffffff;
}

.octo-card-profile .ac-pushButton {
  background: var(--octo-card-color-accent);
}

/* Forge 组件基线公开的显式语义；后缀只用于保证 Card 内 ID 唯一 */
.octo-card-profile [id^="octo-badge-warning-"] {
  background: var(--octo-card-color-warning-subtle);
}
```

允许使用的元素 ID 只能来自组件基线公开的 `octo-surface-*`、`octo-badge-*`
前缀。它们表达视觉语义，不得包含 Card 名、业务状态字段、Action/Input 名称；禁止再用
`:first-child`、`:last-child` 推断 Header/Footer。

### 5.2 禁止

```css
:root { ... }
body { ... }
.ac-pushButton { ... }
#deny_panel { ... }
* { ... }
```

同时禁止：

- `!important`（仅 SDK 内联背景无法覆盖时，公开的 `octo-surface-*` 语义规则可例外）；
- `--wk-*`；
- Card ID、Action ID、Input ID；
- 业务状态或业务 owner；
- 未加 `octo-card-` 前缀的全局 keyframes/font 名称。

### 5.3 Web 根节点必须分离

```html
<!-- legacy -->
<div class="wk-interactive-card-sdk"></div>

<!-- Forge -->
<div class="wk-interactive-card-forge octo-card-profile"></div>
```

Forge 根节点禁止同时携带 `.wk-interactive-card-sdk`，否则现有 legacy `.ac-*` 规则会反向污染 Forge 卡片。

## 6. 修改顺序与 PR 划分

必须按以下顺序实施。后一个阶段不得在前一个阶段验收通过前启用。

### PR 1：收敛 Card Forge 单主题 Profile 源

仓库：`octo-card-forge`

目标：得到唯一、宿主无关、无业务选择器的单主题源 Profile。

修改内容：

1. 确认候选精确版本。若 1.0/1.1 从未正式发布，可使用 `1.2.0-rc.1`；正式发布前再升为 `1.2.0`。
2. Manifest 增加 `compatibility: "octo-chat/v1"`。
3. 将最终主题值集中到 `tokens.json`。
4. HostConfig 源改为模板，Bundle 阶段解析为具体值。
5. `styles.css` 只保留通用 Adaptive Cards 规则。
6. 删除 `#deny_panel` 等业务选择器。
7. 删除所有 `--wk-*`、硬编码宿主路径和 Preview 专用选择器。
8. 不修改已发布 Card Package；需要迁移的 Card 必须创建新版本。

验收：

- 所有 Card Forge 单测通过；
- 所有 Sample `check` 通过；
- CSS scope 静态检查通过；
- HostConfig 中不存在未解析 Token；
- Manifest 的 compatibility、SDK 版本和文件引用完整。

本 PR 不做：

- Web 接入；
- Server 字段；
- 业务模板迁移；
- 生产发布。

### PR 2：实现 Bundle、Pack 和不可变发布包

仓库：`octo-card-forge`

目标：将源 Profile 变成可安装 npm 包。

CLI：

```bash
pnpm cli profile validate octo-chat@1.2.0-rc.1
pnpm cli profile bundle octo-chat@1.2.0-rc.1 --output .release
pnpm cli profile pack octo-chat@1.2.0-rc.1 --output .release
```

Bundle 必须完成：

1. 解析 `host-config.template.json + tokens.json`；
2. 生成具体值 `host-config.json`；
3. 生成带作用域的 `theme.css`；
4. 复制并校验 `styles.css`、`capabilities.json`；
5. 校验 Adaptive Cards SDK 版本；
6. 生成 per-file SHA-256；
7. 生成可发布 `package.json`；
8. 运行 `pnpm pack --dry-run` 文件白名单检查；
9. 生成 `.tgz`。

验收：

```bash
pnpm typecheck
pnpm test
pnpm cli check
pnpm cli profile pack octo-chat@1.2.0-rc.1
```

解开 `.tgz` 后只允许包含约定文件，不允许包含源码模板、Samples、缓存或密钥。

### PR 3：让 Card Forge Preview 消费打包制品

仓库：`octo-card-forge`

目标：Preview 不再读取源文件拼装结果，而是读取与 Web 相同的编译后包。

修改内容：

1. Preview 加载包内 `host-config.json`；
2. Preview 加载包内 `theme.css` 和 `styles.css`；
3. Preview 根节点使用 `.octo-card-profile`；
4. Preview SDK 版本必须与 Manifest 一致；
5. 增加 320、480、640 三种卡片宽度；
6. 为核心 Sample 生成视觉基线。

验收：

- Preview 页面不再依赖源 Profile Token 解析；
- Preview 展示内容与 `.tgz` 解包后的文件一致；
- docs pending/result 和 AI decision 样例视觉基线通过。

### PR 4：发布候选 npm 制品

仓库：`octo-card-forge` + 发布 CI

目标：发布不可覆盖的候选包。

推荐 Registry：GitHub Packages 或公司内部 npm Registry。

Tag：

```text
render-profile/octo-chat/v1.2.0-rc.1
```

CI 顺序：

1. 校验 Git Tag 与 package version 一致；
2. 安装依赖并运行 Forge 全量检查；
3. 生成 Bundle；
4. 生成 `.tgz`；
5. `pnpm pack --dry-run`；
6. 检查版本未发布；
7. `pnpm publish --no-git-checks`；
8. 保存构建日志、SHA-256 和 provenance。

禁止覆盖同版本包。

### PR 5：Web 增加 dormant 双路径支持

仓库：`octo-web`

前置：候选 npm 包已发布。

安装：

```bash
pnpm add @dmwork/octo-card-profile-octo-chat@1.2.0-rc.1 --save-exact
```

修改内容：

1. 保持原 `octoHostConfig.ts` 不变；
2. 保持原 `InteractiveCard/index.css` legacy 规则不变；
3. `InteractiveCardContent` 容忍可选 `render_profile`；
4. render gate 实现：缺失 → legacy，`octo-chat/v1` → Forge，未知 → hint；
5. `renderOctoCard()` 仍为唯一 renderer；
6. Forge 分支直接 `new HostConfig(packageHostConfig)`；
7. 导入包内 `theme.css`、`styles.css`；
8. legacy 根类保持 `.wk-interactive-card-sdk`；
9. Forge 根类使用 `.wk-interactive-card-forge.octo-card-profile`；
10. 不实现 Web Token Adapter；
11. 内容指纹必须包含 Render Profile，避免错误复用已挂载 DOM。

Web 依赖必须写精确版本，禁止 `^`、`~`、`latest`。

验收：

- 无 `render_profile` 的所有现有测试仍使用 legacy；
- 原 HostConfig 和原 legacy CSS 与 `upstream/main` 零差异；
- Forge Sample 显式 opt-in 后使用包内 HostConfig/CSS；
- legacy DOM 不包含 `.octo-card-profile`；
- Forge DOM 不包含 `.wk-interactive-card-sdk`；
- 未知 Render Profile 显示升级提示；
- Vite 生产构建通过；
- 包体积增量有记录。

本 PR 上线后不会自动改变任何生产卡片，因为 Server/producer 尚未发送该字段。

### PR 6：Server 增加可选 Render Profile 透传

仓库：`octo-server`

前置：支持双路径的 Web 已发布或进入可控灰度。

内部发送结构：

```go
type Card struct {
    Profile       string
    RenderProfile string
    Document      json.RawMessage
}
```

构造信封：

```go
if card.RenderProfile != "" {
    payload["render_profile"] = card.RenderProfile
}
```

规则：

- 空值允许，表示 legacy；
- 本阶段仅允许 `octo-chat/v1`；
- 其他非空值拒绝；
- `render_profile` 不改变 `octo/v1`、`octo/v2` 能力校验；
- `content_edit` 必须保留并校验同一字段；
- 消息大小预算包含该字段；
- 普通用户不能借此绕过 type-17 sender trust gate。

如果第三方 Bot API 也支持结构化 Card 发送，其请求模型同步增加同名可选字段，并继续执行 Bot 归属和 Profile allowlist 校验。

测试：

1. 空值不写入信封；
2. `octo-chat/v1` 正常透传；
3. 未知值拒绝；
4. send/edit 对称；
5. 历史无字段 payload 仍通过；
6. card_action 行为不受影响。

### PR 7：端到端 Sample 灰度，不改生产模板

涉及：Forge、Server、Web 测试环境

目标：证明完整链路，而不是立即迁移业务模板。

步骤：

1. 用已发布 Forge 包和 Sample 编译标准 Card JSON；
2. 通过测试 producer 发送：

```json
{
  "profile": "octo/v2",
  "render_profile": "octo-chat/v1",
  "card": {}
}
```

3. 验证消息首次接收、历史加载和刷新；
4. 验证 `content_edit` 更新后仍使用 Forge Profile；
5. 验证 Submit、ToggleVisibility、OpenUrl；
6. 验证 320、480、640 三种宽度；
7. 对比 Card Forge Preview 和 Web 截图；
8. 确认同会话内 legacy 与 Forge 卡片可以并存。

验收完成前，任何生产模板都不得设置 `render_profile`。

### PR 8：迁移第一个业务 Card Package

仓库：`octo-card-forge` + 对应业务后端

推荐选择一个低风险、可回滚的展示型卡片；不要第一张就迁移复杂审批流程。

步骤：

1. 创建新的 Card Package 版本，不修改已发布版本；
2. 后端领域模型映射到 Forge ViewModel；
3. 使用 Forge 编译或已批准的运行时编译服务生成 Card JSON；
4. 仅此 producer 设置 `RenderProfile: "octo-chat/v1"`；
5. 灰度到内部账号或测试 Space；
6. 观察后再逐步扩大。

回滚只需停止写入 `render_profile` 并恢复旧 Card 生成路径，无需回滚 Web 对字段的兼容支持。

## 7. 发布顺序

严格顺序：

```text
Forge Profile 源
  → Forge Bundle/Pack
  → Forge Preview 使用制品
  → 发布候选 npm 包
  → Web dormant 双路径支持
  → 先部署 Web
  → Server 可选字段
  → Sample 端到端灰度
  → 第一个业务 producer 迁移
  → 正式 Profile 1.2.0
  → 后续 producer 逐个迁移
```

不得在支持 Forge Profile 的 Web 覆盖率不足时，让生产 producer 开始发送 `octo-chat/v1`。

## 8. 兼容性矩阵

| Web | Server/producer | 结果 |
| --- | --- | --- |
| 旧 Web | 不发送字段 | legacy，当前行为 |
| 新 Web | 不发送字段 | legacy，当前行为 |
| 新 Web | 发送 `octo-chat/v1` | Forge 渲染 |
| 新 Web | 未知非空值 | 升级提示 |
| 旧 Web | 发送 `octo-chat/v1` | 旧 Web 会忽略未知字段并按 legacy 渲染，视觉可能错误，因此禁止先开 producer |

这也是必须 Web 先发布、producer 最后启用的原因。

## 9. CI 门禁

### Forge

- Profile Manifest Schema；
- Token 完整性；
- HostConfig 无未解析表达式；
- CSS AST scope 检查；
- 禁止业务选择器；
- SDK 版本一致；
- 所有 Card Sample check；
- Preview 视觉回归；
- npm pack 文件白名单；
- 同版本不可覆盖。

### Web

- 精确 npm 依赖；
- legacy HostConfig/CSS 零差异检查；
- legacy/Forge 根类互斥；
- Render Profile 选择单测；
- Forge Sample 渲染测试；
- 生产构建；
- 包体积检查。

### Server

- optional 字段 send/edit 对称；
- allowlist；
- sender trust；
- payload 大小；
- 历史消息兼容；
- card_action 不回归。

## 10. 观测与回滚

建议增加：

- Web：按 `legacy`、`octo-chat/v1`、`unsupported` 统计渲染次数和失败率；
- Server：按 producer 统计 `render_profile` 发送量和拒绝量；
- 业务 producer：记录 Forge 编译失败和旧模板回退次数。

回滚优先级：

1. producer 停止发送 `render_profile`；
2. producer 回退旧 Card JSON；
3. Server 保留字段兼容能力；
4. Web 保留 dormant Forge renderer，不需要紧急回滚；
5. npm 包版本永不覆盖或删除。

## 11. 当前原型的处理清单

当前未合并原型中可以保留：

- Profile Bundle 完整性哈希思路；
- Adaptive Cards SDK 版本检查；
- CSS scope；
- Web legacy 默认策略；
- 显式 opt-in render gate；
- 现有 renderer 复用。

必须修改或删除：

- 删除 Web `adapter.css`；
- 删除 `WEB_RENDER_PROFILE_TOKEN_BINDINGS`；
- Wire 从 `octo-chat@1.2.0` 改为 `octo-chat/v1`；
- Forge Bundle 输出具体值 HostConfig 和最终 `theme.css`；
- Web Forge 根节点不得携带 `.wk-interactive-card-sdk`；
- 不得直接修改已发布 Card Package 的 `renderProfile`，应创建新版本；
- 将本地目录同步替换为正式 npm 精确依赖；
- 在 producer 启用前完成 Server 可选字段透传。

## 12. 第一阶段完成定义

只有同时满足以下条件，才认为单主题 Render Profile 接入完成：

1. Forge 可生成并发布不可变 npm 包；
2. Preview 和 Web 消费同一精确包；
3. Web legacy 路径与当前线上保持一致；
4. Forge CSS 与 legacy CSS 双向隔离；
5. Server 支持可选 `octo-chat/v1`；
6. 无生产模板被隐式切换；
7. Sample 端到端灰度通过；
8. 第一个业务 producer 可独立启用和回滚。
