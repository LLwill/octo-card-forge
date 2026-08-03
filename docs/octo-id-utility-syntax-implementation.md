# Octo ID Utility Syntax 开发实现方案

> 状态：开发实施方案  
> 适用范围：`octo-chat` Render Profile、Card Package Template、CLI 校验、Agent Skill  
> 目标：在不扩展 Adaptive Card 协议、不要求 Web runtime 读取 metadata 的前提下，把唯一 `id` 设计成类似 `className` 的可组合 utility token 串。

## 1. 背景

Adaptive Card 元素没有 `className`。当前 Profile 通过 `id` 前缀实现样式 primitive：

```json
{
  "type": "TextBlock",
  "id": "octo-badge-warning-request-state",
  "text": "待审核"
}
```

这个方案稳定、标准，但一个元素基本只能表达一个 primitive。它不像 Tailwind：

```html
<div class="bg-muted p-3 rounded-md animate-fade-in">
```

为了提升灵活性，同时避免改 Adaptive Card schema / Web runtime，建议新增一种 **className-like ID utility syntax**。

## 2. 核心方案

把 `id` 设计成：

```text
octo--<utility-token>--<utility-token>--uid-<unique-name>
```

示例：

```text
octo--surface-subtle--inset-md--uid-doc-preview-shell
octo--badge-warning--motion-pulse-once--uid-risk-state
octo--line-skeleton--density-compact--uid-preview-line-1
```

解释：

| 片段 | 含义 |
| --- | --- |
| `octo--` | 新语法命名空间 |
| `surface-subtle` | utility token |
| `inset-md` | utility token |
| `motion-pulse-once` | utility token |
| `uid-*` | 保证 Adaptive Card / DOM id 唯一 |

CSS 匹配：

```css
.octo-card-profile [id^="octo--"][id*="--surface-subtle--"] {
  background: var(--octo-card-color-surface-subtle) !important;
}

.octo-card-profile [id^="octo--"][id*="--inset-md--"] {
  padding: 12px !important;
}

.octo-card-profile [id^="octo--"][id*="--motion-fade-in--"] {
  animation: octo-motion-fade-in 180ms ease-out both;
}
```

这让 `id` 具备一部分 `className` 组合能力，但仍保持标准 Adaptive Card JSON。

## 3. 非目标

不做：

```json
{
  "type": "Container",
  "className": "surface-subtle inset-md"
}
```

不做：

```json
{
  "type": "Container",
  "metadata": {
    "octoClass": ["surface-subtle", "inset-md"]
  }
}
```

原因：

- `className` 不是 Adaptive Card schema 标准字段；
- metadata/data 不能直接被 CSS selector 读取；
- 若 Web runtime 读取 metadata 再加 DOM class，会触发第三层改造；
- 当前目标是只改 Render Profile + CLI 校验。

## 4. 设计原则

### 4.1 看起来像 className，但不继承 CSS cascade 语义

允许：

```text
surface-subtle + inset-md + motion-fade-in
```

禁止：

```text
surface-subtle + surface-warning
```

规则：

```text
同 group 最多一个 token。
token 顺序不影响结果。
后写 token 不覆盖前写 token。
冲突直接 check error。
```

### 4.2 token 顺序无语义

下面两个 id 等价：

```text
octo--surface-subtle--inset-md--uid-a
octo--inset-md--surface-subtle--uid-a
```

CSS 和校验不能依赖 token 顺序。

### 4.3 限制 token 数量

建议：

```text
每个元素最多 3 个 utility token。
```

超过 3 个，说明这个元素承担太多视觉职责，应该拆成嵌套结构。

### 4.4 UID 必须存在且唯一

因为本质仍是 `id`，所以必须唯一：

```text
octo--surface-subtle--uid-doc-preview-shell
```

禁止：

```text
octo--surface-subtle
```

## 5. ID Grammar

### 5.1 正则

整体：

```text
^octo--(?<tokens>[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*)--uid-(?<uid>[a-z][a-z0-9]*(?:-[a-z0-9]+)*)$
```

token：

```text
[a-z][a-z0-9]*(?:-[a-z0-9]+)*
```

uid：

```text
[a-z][a-z0-9]*(?:-[a-z0-9]+)*
```

### 5.2 示例

合法：

```text
octo--surface-subtle--uid-panel
octo--surface-subtle--inset-md--uid-panel
octo--badge-warning--motion-pulse-once--uid-status
```

非法：

```text
octo--surface-subtle
octo--surface-subtle--uid-
octo--surface_subtle--uid-panel
octo--surface-subtle--inset-md--motion-fade-in--density-compact--uid-panel
octo--surface-subtle--surface-warning--uid-panel
```

## 6. capabilities.json 结构

### 6.1 新增 `utilities`

建议在 `RenderCapabilities` 中新增：

```ts
export interface RenderUtilityDefinition {
  group: string;
  appliesTo: string[];
  fallback?: JsonObject;
  description: string;
  useWhen?: string[];
  avoidWhen?: string[];
  deprecated?: boolean;
}

export interface RenderCapabilities {
  components?: Record<string, RenderComponentDefinition>;
  utilities?: Record<string, RenderUtilityDefinition>;
}
```

示例：

```json
{
  "utilities": {
    "surface-subtle": {
      "group": "surface",
      "appliesTo": ["Container", "Column"],
      "fallback": { "style": "emphasis" },
      "description": "弱背景内容区域。",
      "useWhen": ["信息块", "预览区域", "辅助内容容器"],
      "avoidWhen": ["强风险", "主操作区域"]
    },
    "inset-md": {
      "group": "inset",
      "appliesTo": ["Container", "Column"],
      "description": "中等内边距。"
    },
    "motion-fade-in": {
      "group": "motion",
      "appliesTo": ["Container", "Column", "TextBlock"],
      "description": "短时淡入动效。"
    }
  }
}
```

### 6.2 与 `components` 的关系

短期兼容：

```text
components = 旧语法 octo-badge-warning-xxx
utilities = 新语法 octo--badge-warning--uid-xxx
```

长期目标：

```text
utilities 成为主路径。
components 只保留历史兼容或特别复杂的 family。
```

## 7. Utility Group 设计

建议 v1 group：

| Group | 示例 token | 同组限制 |
| --- | --- | --- |
| `surface` | `surface-subtle`, `surface-accent`, `surface-warning` | 最多 1 |
| `badge` | `badge-neutral`, `badge-warning`, `badge-attention` | 最多 1 |
| `inset` | `inset-sm`, `inset-md`, `inset-lg` | 最多 1 |
| `line` | `line-muted`, `line-skeleton` | 最多 1 |
| `frame` | `frame-document`, `frame-media` | 最多 1 |
| `motion` | `motion-fade-in`, `motion-pulse-once`, `motion-shimmer` | 最多 1 |
| `density` | `density-compact`, `density-relaxed` | 最多 1 |

注意：

- 一个元素可以跨组组合；
- 同组重复是错误；
- 不是所有 group 都应该开放给所有元素。

## 8. CSS 实现

### 8.1 Selector 规则

统一使用完整 token 边界：

```css
[id^="octo--"][id*="--surface-subtle--"]
```

禁止：

```css
[id*="surface"]
[id*="subtle"]
```

原因：

- 防止误匹配；
- 防止 token prefix 冲突；
- 让 selector 可由 validator 对账。

### 8.2 CSS 顺序

CSS 文件按 group 固定顺序组织：

```text
1. base
2. surface
3. frame
4. line
5. badge
6. inset
7. action
8. motion
9. accessibility
```

不要根据 Card id token 顺序决定 CSS 效果。

### 8.3 示例 CSS

```css
/* surface */
.octo-card-profile [id^="octo--"][id*="--surface-subtle--"] {
  background: var(--octo-card-color-surface-subtle) !important;
  border-radius: var(--octo-card-radius-container) !important;
}

/* inset */
.octo-card-profile [id^="octo--"][id*="--inset-md--"] {
  padding: 12px !important;
}

/* line */
.octo-card-profile [id^="octo--"][id*="--line-skeleton--"] {
  display: block !important;
  min-height: 2px !important;
  max-height: 2px !important;
  overflow: hidden !important;
  border-radius: 999px;
  color: transparent !important;
  background: rgba(28, 28, 35, .08) !important;
}
```

## 9. Validator 实现

### 9.1 解析函数

新增：

```text
src/utility-id.ts
```

导出：

```ts
export interface ParsedUtilityId {
  namespace: "octo";
  tokens: string[];
  uid: string;
}

export function parseUtilityId(id: string): ParsedUtilityId | undefined;
export function isUtilityId(id: string): boolean;
```

行为：

- 非 `octo--` 返回 `undefined`；
- `octo--` 但语法错误时抛出或返回错误对象；
- tokens 不包含 `uid-*`；
- uid 单独返回。

### 9.2 validateCompiledCard

当前逻辑：

```text
id startsWith "octo-" -> findComponent(...)
```

新增逻辑：

```text
if id startsWith "octo--":
  validateUtilityId(...)
else if id startsWith "octo-":
  validateLegacyComponentId(...)
```

检查项：

| Code | 条件 |
| --- | --- |
| `utility.id_invalid` | 语法不合法 |
| `utility.unknown` | token 不在 capabilities.utilities |
| `utility.applies_to` | 元素 type 不匹配 |
| `utility.fallback` | fallback 属性缺失或不匹配 |
| `utility.group_conflict` | 同 group 多 token |
| `utility.too_many_tokens` | token 数超过上限 |
| `utility.uid_missing` | 缺少 uid |
| `utility.deprecated` | token deprecated，warning |

### 9.3 fallback 校验

示例：

```json
"surface-subtle": {
  "fallback": { "style": "emphasis" }
}
```

Card 必须写：

```json
{
  "type": "Container",
  "id": "octo--surface-subtle--uid-panel",
  "style": "emphasis"
}
```

否则报：

```text
utility.fallback $.body[0].style surface-subtle requires fallback style="emphasis"
```

### 9.4 group 冲突

示例：

```text
octo--surface-subtle--surface-warning--uid-panel
```

报：

```text
utility.group_conflict: utilities in group "surface" cannot be combined
```

### 9.5 token 数量

默认：

```text
maxUtilityTokensPerElement = 3
```

如果后续需要，可以放进 capabilities：

```json
{
  "utilityRules": {
    "maxTokensPerElement": 3
  }
}
```

第一阶段可先写死为 3，减少 schema 改动。

## 10. Profile Validation

`profile validate` 需要检查：

1. `utilities` token 命名合法；
2. token 不互为 prefix-compatible；
3. group 命名合法；
4. appliesTo 非空；
5. fallback 是对象；
6. CSS 中 `[id*="--token--"]` 必须对应 capabilities utilities；
7. capabilities utilities 必须有 CSS 规则，除非 `cssRequired: false`。

建议扩展：

```ts
interface RenderUtilityDefinition {
  cssRequired?: boolean;
}
```

例如 `motion-fade-in` 必须 CSS；某些纯语义 token 可以暂时不需要。

## 11. CSS 对账

当前 profile validation 对 legacy components 已做：

```text
CSS selector prefix 必须来自 capabilities.components
```

新语法新增：

```text
CSS selector [id*="--<token>--"] 必须来自 capabilities.utilities
```

匹配正则：

```text
\[id\*=(["'])--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)--\1\]
```

发现未声明 token：

```text
styles.css: utility selector token line-skeleton is not declared in capabilities.utilities
```

发现声明但无 CSS：

```text
capabilities.json: utility line-skeleton requires CSS selector [id*="--line-skeleton--"]
```

## 12. Handoff / Report

`handoff.atomicSystem` 当前统计 legacy components。

新增：

```json
{
  "utilities": [
    {
      "token": "surface-subtle",
      "group": "surface",
      "ids": ["octo--surface-subtle--inset-md--uid-doc-preview"]
    }
  ]
}
```

用途：

- 后端知道卡片依赖哪些 Profile utility；
- Agent 可以复盘自己用了哪些能力；
- 评审时可发现过度组合。

## 13. Component Baseline

`/components` 页面新增 Utility 区块：

```text
Utilities
  Surface
  Badge
  Inset
  Line
  Frame
  Motion
```

每个 utility 生成一个标准 Card 示例：

```json
{
  "type": "Container",
  "id": "octo--surface-subtle--inset-md--uid-baseline",
  "style": "emphasis",
  "items": [
    {
      "type": "TextBlock",
      "text": "surface-subtle + inset-md"
    }
  ]
}
```

测试：

```text
tests/component-baseline.test.ts
```

要求：

- 所有 baseline card 通过 `validateCompiledCard`；
- baseline 不包含业务 id；
- 所有 capabilities.utilities 至少被展示一次。

## 14. Agent 使用规则

Agent 只能从 `capabilities.utilities` 选择 token。

决策：

```text
标准 Adaptive Card 能表达 -> 用标准属性
需要通用视觉增强 -> 用 utility token
同元素超过 3 token -> 拆嵌套
找不到合适 token -> 不发明，记录 candidate
```

示例：

```json
{
  "type": "Container",
  "id": "octo--surface-subtle--inset-md--uid-reason-summary",
  "style": "emphasis",
  "items": []
}
```

禁止：

```text
octo--surface-subtle--surface-warning--uid-x
octo--inset-13px--uid-x
octo--brand-q3-special--uid-x
```

## 15. 迁移策略

### 15.1 v1.2 当前状态

支持 legacy：

```text
octo-badge-warning-*
octo-surface-header-accent-*
```

### 15.2 v1.3 过渡

同时支持：

```text
legacy components
new utilities
```

推荐新卡使用：

```text
octo--badge-warning--uid-*
octo--surface-header-accent--uid-*
```

旧卡不强制迁移。

### 15.3 v1.4+

legacy 标记 deprecated：

```json
{
  "components": {
    "octo-badge": {
      "deprecated": true
    }
  }
}
```

`check` 输出 warning，不阻断历史卡。

## 16. 开发任务清单

### PR 1：类型与 schema

改动：

```text
src/types.ts
render-profiles/octo-chat/capabilities.json
tests/profile.test.ts
```

内容：

- 增加 `RenderUtilityDefinition`；
- `RenderCapabilities.utilities`；
- 测试 profile 能加载 utilities。

### PR 2：ID parser

改动：

```text
src/utility-id.ts
tests/utility-id.test.ts
```

测试：

- 合法 id；
- 缺 uid；
- 非法字符；
- token 提取；
- token 数量；
- 顺序无关。

### PR 3：编译后校验

改动：

```text
src/validate.ts
tests/validate.test.ts
```

新增错误码：

```text
utility.id_invalid
utility.unknown
utility.applies_to
utility.fallback
utility.group_conflict
utility.too_many_tokens
utility.deprecated
```

### PR 4：Profile validate CSS 对账

改动：

```text
src/profile.ts
tests/profile.test.ts
```

内容：

- 校验 utilities schema；
- 校验 CSS selector token；
- 校验 prefix-compatible token。

### PR 5：CSS 实现

改动：

```text
render-profiles/octo-chat/styles.css
render-profiles/octo-chat/theme.css
```

内容：

- surface；
- badge；
- inset；
- line；
- frame；
- motion；
- reduced-motion。

### PR 6：Baseline 页面

改动：

```text
src/component-baseline.ts
web/components.js
tests/component-baseline.test.ts
```

内容：

- 展示 utilities；
- 每组至少一个样例；
- baseline 通过 validate。

### PR 7：Skill / docs

改动：

```text
skills/octo-design-cards/SKILL.md
docs/agent-skill-cli-operating-model.md
docs/octo-card-comfort-scale.md
```

内容：

- Agent 如何选择 utilities；
- 冲突规则；
- candidate 规则；
- legacy 兼容。

### PR 8：Handoff 报告

改动：

```text
src/handoff.ts
tests/handoff.test.ts
```

内容：

- 输出 `utilities` 使用摘要；
- 保留 legacy `components` 摘要；
- 避免通过正则猜业务语义。

## 17. 验收命令

每个 PR 必跑：

```bash
pnpm typecheck
pnpm test
pnpm cli profile validate octo-chat@latest
pnpm cli check --strict-profile --format json
```

Profile 发布前：

```bash
pnpm cli profile bundle octo-chat@latest --output .release
pnpm cli profile pack octo-chat@latest --output .release
```

视觉检查：

```text
/components
320px
480px
640px
```

## 18. 风险与规避

### 风险：重新引入 CSS 优先级问题

规避：

- token 顺序无语义；
- 同 group 冲突报错；
- CSS 按 group 固定顺序。

### 风险：id 过长

规避：

- max 3 tokens；
- uid 简短；
- 复杂组合拆嵌套。

### 风险：Agent 乱选 token

规避：

- capabilities 写 description/useWhen/avoidWhen；
- Skill 决策树；
- check 强约束。

### 风险：legacy 与新语法并存混乱

规避：

- `octo--` 明确表示新语法；
- `octo-` legacy 保持旧解析；
- 文档明确推荐新语法；
- deprecated warning 分阶段引入。

### 风险：CSS selector 注入

规避：

- token/uid 字符集只允许 `[a-z0-9-]`；
- 禁止空格、引号、方括号、点号、冒号；
- validator 先于发布阻断。

## 19. 最终判断

这个方案是当前最合适的折中：

```text
比 legacy id prefix 更灵活；
比 metadata/className runtime 更轻；
比 Card IR/Compiler 更容易落地；
仍然保持标准 Adaptive Card JSON。
```

但必须坚持：

```text
className-like syntax
without cascade semantics
```

也就是：

- 可以组合；
- 不允许覆盖；
- 不允许冲突；
- 不允许顺序决定结果；
- 不允许未知 token。

这样才能获得 Tailwind 式灵活性，同时避免把 CSS 最麻烦的部分带进卡片生成系统。
