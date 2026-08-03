# Octo Card Utility Core 具体开发文档

> 状态：开发任务书  
> 工作分支：`codex/card-utility-core`  
> 工作目录：`/Users/will/Project/octo/octo-card-forge-utility-core`  
> 目标：从干净 `origin/main` 基线实现新版 `octo--utility-token--uid-*` 机制，让 Card JSON 保持标准 Adaptive Card，同时获得类似 `className` 的受控组合能力。
> 关联文档：[`octo-card-utility-system-development-plan.md`](./octo-card-utility-system-development-plan.md)、[`octo-id-utility-syntax-implementation.md`](./octo-id-utility-syntax-implementation.md)

## 1. 交付目标

本阶段不是优化某一张卡，也不是直接迁移旧实验代码。交付目标是建立一套可被后续 Profile / Card Package 复用的核心机制：

```text
capabilities.utilities
  -> utility id parser
  -> validateCompiledCard 强校验
  -> profile validate CSS 对账
  -> baseline / handoff / skill 消费
```

实现后，卡片可以写：

```json
{
  "type": "Container",
  "id": "octo--surface-subtle--inset-md--uid-doc-preview",
  "style": "emphasis",
  "items": []
}
```

CLI 必须能判断：

- `surface-subtle` 是否声明；
- 它是否能用于 `Container`；
- `style: "emphasis"` fallback 是否存在；
- 是否和其它 token 同 group 冲突；
- 是否超过 token 数量限制；
- `id` 是否唯一且语法合法。

## 2. 分支与提交规划

当前新 worktree 已经从 `origin/main` 创建：

```text
/Users/will/Project/octo/octo-card-forge-utility-core
branch: codex/card-utility-core
```

建议按以下提交拆分，不要一次性混在一起：

| Commit | 范围 | 不做 |
| --- | --- | --- |
| `docs` | 本文档和方案文档 | 不改实现 |
| `core-parser` | types、`utility-id.ts`、parser tests | 不改 Profile CSS |
| `core-validate` | `validateCompiledCard` utility 校验 | 不迁移真实卡 |
| `profile-validate` | `profile.ts` schema / CSS 对账 | 不大改视觉 |
| `profile-css-v1` | `capabilities.json` + `styles.css` v1 token | 不做业务 selector |
| `baseline-handoff` | `/components` baseline + handoff 摘要 | 不改 runtime |
| `trial-cards` | 真实卡片试点 | 不新增临时 Profile 能力 |

## 3. 数据结构设计

### 3.1 修改文件

```text
src/types.ts
render-profiles/octo-chat/capabilities.json
tests/profile.test.ts
tests/validate.test.ts
```

### 3.2 新增类型

在 `src/types.ts` 中新增：

```ts
export interface RenderUtilityDefinition {
  group: string;
  appliesTo: string[];
  fallback?: JsonObject;
  description: string;
  useWhen?: string[];
  avoidWhen?: string[];
  cssRequired?: boolean;
  deprecated?: boolean;
}

export interface RenderUtilityRules {
  maxTokensPerElement?: number;
}
```

扩展：

```ts
export interface RenderCapabilities {
  maxAdaptiveCardVersion: string;
  allowedElements: string[];
  allowedActions: string[];
  components?: Record<string, RenderComponentDefinition>;
  utilities?: Record<string, RenderUtilityDefinition>;
  utilityRules?: RenderUtilityRules;
  maxNodes: number;
  maxDepth: number;
  maxPayloadBytes: number;
  imageUrlSchemes: string[];
  openUrlSchemes: string[];
}
```

### 3.3 capabilities 示例

第一批最小 token：

```json
{
  "utilityRules": {
    "maxTokensPerElement": 3
  },
  "utilities": {
    "surface-subtle": {
      "group": "surface",
      "appliesTo": ["Container", "Column"],
      "fallback": { "style": "emphasis" },
      "description": "弱背景内容区域。"
    },
    "inset-md": {
      "group": "inset",
      "appliesTo": ["Container", "Column"],
      "description": "中等内边距。"
    },
    "line-skeleton": {
      "group": "line",
      "appliesTo": ["Container", "TextBlock"],
      "description": "骨架占位线。"
    },
    "motion-fade-in": {
      "group": "motion",
      "appliesTo": ["Container", "Column", "TextBlock"],
      "description": "短时淡入增强。"
    }
  }
}
```

注意：

- `fallback` 只写标准 Adaptive Card 字段。
- `description` 必填，给 Agent discover / explain 用。
- `cssRequired` 默认视为 `true`，只有纯语义 token 才允许显式 `false`。

## 4. Utility ID Parser

### 4.1 新增文件

```text
src/utility-id.ts
tests/utility-id.test.ts
```

### 4.2 ID 语法

```text
octo--<token>--<token>--uid-<unique-name>
```

约束：

```text
token: [a-z][a-z0-9]*(?:-[a-z0-9]+)*
uid:   [a-z][a-z0-9]*(?:-[a-z0-9]+)*
```

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
octo--surface-subtle--uid-Panel
octo--uid-panel
```

### 4.3 推荐接口

```ts
export interface ParsedUtilityId {
  namespace: "octo";
  tokens: string[];
  uid: string;
}

export type UtilityIdParseResult =
  | { ok: true; value: ParsedUtilityId }
  | { ok: false; code: string; message: string };

export function isUtilityId(id: string): boolean;
export function parseUtilityId(id: string): UtilityIdParseResult | undefined;
```

行为：

- 非 `octo--` 返回 `undefined`；
- `octo--` 但语法错误返回 `{ ok: false }`；
- `tokens` 不包含 `uid-*`；
- `uid` 不包含 `uid-` 前缀。

### 4.4 Parser 错误码

内部 parser code 建议：

| Code | 条件 |
| --- | --- |
| `missing_uid` | 没有 `--uid-*` |
| `empty_tokens` | 没有 utility token |
| `invalid_token` | token 字符不合法 |
| `invalid_uid` | uid 字符不合法 |
| `duplicate_token` | 同一个 token 重复 |

这些内部 code 在 `validateCompiledCard` 中映射成 `utility.id_invalid`。

### 4.5 测试用例

`tests/utility-id.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { isUtilityId, parseUtilityId } from "../src/utility-id.js";

describe("utility id parser", () => {
  it("ignores non utility ids", () => {
    expect(isUtilityId("normal-id")).toBe(false);
    expect(parseUtilityId("octo-badge-warning-status")).toBeUndefined();
  });

  it("parses utility tokens and uid", () => {
    expect(parseUtilityId("octo--surface-subtle--inset-md--uid-panel")).toEqual({
      ok: true,
      value: {
        namespace: "octo",
        tokens: ["surface-subtle", "inset-md"],
        uid: "panel",
      },
    });
  });
});
```

必须补齐：

- 缺 uid；
- 空 token；
- 非法字符；
- 大写字符；
- token 重复；
- `octo-badge-*` legacy 不进入新 parser。

## 5. Card Validation

### 5.1 修改文件

```text
src/validate.ts
tests/validate.test.ts
```

### 5.2 检查顺序

当前逻辑是：

```text
id startsWith "octo-" -> legacy component
```

必须改为：

```text
if id startsWith "octo--":
  validateUtilityId
else if id startsWith "octo-":
  validateLegacyComponentId
else:
  normal id
```

原因：`octo--` 也满足 `startsWith("octo-")`，如果顺序错，会被误判成 legacy component unknown。

### 5.3 新增校验函数

建议在 `src/validate.ts` 内部新增：

```ts
function validateUtilityId(
  id: string,
  value: JsonObject,
  type: string | undefined,
  path: string,
  capabilities: RenderCapabilities,
  error: (code: string, path: string, message: string) => void,
  warning: (code: string, path: string, message: string) => void
): void
```

如果当前 `validateCompiledCard` 只有 `error` helper，需要新增：

```ts
const warning = (code: string, path: string, message: string) =>
  issues.push({ severity: "warning", code, path, message });
```

### 5.4 Error / Warning code

| Code | Severity | 条件 |
| --- | --- | --- |
| `utility.id_invalid` | error | `octo--` 语法不合法 |
| `utility.unknown` | error | token 不在 `capabilities.utilities` |
| `utility.applies_to` | error | token 不适用于当前 `type` |
| `utility.fallback` | error | fallback 字段缺失或值不匹配 |
| `utility.group_conflict` | error | 同 group 出现多个 token |
| `utility.too_many_tokens` | error | token 数超过限制 |
| `utility.deprecated` | warning | token 标记 deprecated |

`schema.duplicate_id` 继续复用现有重复 id 逻辑，不额外新增 `utility.uid_duplicate`，避免同一问题两套 code。

### 5.5 group conflict

示例：

```text
octo--surface-subtle--surface-warning--uid-panel
```

如果两者 `group` 都是 `surface`，输出：

```json
{
  "severity": "error",
  "code": "utility.group_conflict",
  "path": "$.body[0].id",
  "message": "Utilities in group surface cannot be combined: surface-subtle, surface-warning"
}
```

### 5.6 fallback 检查

capabilities：

```json
{
  "utilities": {
    "surface-subtle": {
      "group": "surface",
      "appliesTo": ["Container"],
      "fallback": { "style": "emphasis" },
      "description": "弱背景内容区域。"
    }
  }
}
```

合法 Card：

```json
{
  "type": "Container",
  "id": "octo--surface-subtle--uid-panel",
  "style": "emphasis",
  "items": []
}
```

不合法 Card：

```json
{
  "type": "Container",
  "id": "octo--surface-subtle--uid-panel",
  "items": []
}
```

输出 `utility.fallback`。

### 5.7 maxTokensPerElement

读取：

```ts
const maxTokens =
  capabilities.utilityRules?.maxTokensPerElement ?? 3;
```

超过时报：

```text
utility.too_many_tokens
```

### 5.8 validate tests

在 `tests/validate.test.ts` 的 fixture capabilities 中新增：

```ts
utilities: {
  "surface-subtle": {
    group: "surface",
    appliesTo: ["Container"],
    fallback: { style: "emphasis" },
    description: "Subtle surface",
  },
  "surface-warning": {
    group: "surface",
    appliesTo: ["Container"],
    fallback: { style: "warning" },
    description: "Warning surface",
  },
  "inset-md": {
    group: "inset",
    appliesTo: ["Container"],
    description: "Medium inset",
  },
  "badge-warning": {
    group: "badge",
    appliesTo: ["TextBlock"],
    fallback: { size: "Small", weight: "Bolder", color: "Warning" },
    description: "Warning badge",
  },
  "motion-fade-in": {
    group: "motion",
    appliesTo: ["Container", "TextBlock"],
    description: "Fade in",
    deprecated: true,
  },
},
utilityRules: {
  maxTokensPerElement: 3,
},
```

新增测试：

1. accepts valid utility id with fallback。
2. rejects unknown utility token。
3. rejects invalid utility id syntax。
4. rejects appliesTo mismatch。
5. rejects missing fallback。
6. rejects same group conflict。
7. rejects too many tokens。
8. warns deprecated utility。
9. keeps legacy `octo-badge-warning-*` working。

## 6. Profile Validation

### 6.1 修改文件

```text
src/profile.ts
tests/profile.test.ts
render-profiles/octo-chat/capabilities.json
render-profiles/octo-chat/styles.css
```

### 6.2 新增函数

在 `src/profile.ts` 中新增：

```ts
function assertUtilityCapabilities(
  capabilities: RenderCapabilities,
  css: string,
  filePath: string
): void
```

在 `validateLoadedRenderProfile` 中和 legacy component 校验一起调用：

```ts
const css = contents[files.indexOf(manifest.stylesheet)].toString("utf8");
assertScopedCss(css, path.join(profile.root, manifest.stylesheet));
assertComponentCapabilities(profile.capabilities, css, path.join(profile.root, manifest.stylesheet));
assertUtilityCapabilities(profile.capabilities, css, path.join(profile.root, manifest.stylesheet));
```

### 6.3 capabilities 校验规则

`assertUtilityCapabilities` 需要检查：

1. token 命名合法：`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`
2. group 命名合法。
3. `description` 非空。
4. `appliesTo` 非空。
5. `appliesTo` 中的元素必须存在于 `allowedElements`，允许 `Column` 这种当前 allowedElements 已声明的元素。
6. `fallback` 如果存在必须是 object。
7. `utilityRules.maxTokensPerElement` 如果存在必须是正整数。
8. 同一个 group 可以有多个 token，但 Card 中不能同时使用。
9. token 不允许互为 prefix-compatible。

prefix-compatible 示例：

```text
line
line-skeleton
```

第一版不建议允许，因为 CSS `[id*="--line--"]` 很容易误匹配设计意图。

### 6.4 CSS selector 对账

允许 selector：

```css
.octo-card-profile [id^="octo--"][id*="--surface-subtle--"] {}
```

提取 token：

```ts
const selectorTokens = css.matchAll(
  /\[id\*=(["'])--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)--\1\]/g
);
```

校验：

- CSS 出现 token，但 capabilities 未声明：error。
- capabilities 声明 token 且 `cssRequired !== false`，但 CSS 未出现：error。
- `cssRequired: false` 的 token 可以没有 CSS。

### 6.5 禁止 selector

继续沿用现有 `assertScopedCss`，并增加文档要求：

```css
.octo-card-profile .ac-container {}
.octo-card-profile:has(...) {}
[id*="surface"] {}
[id*="--surface"] {}
```

这些都不应该进入 v1。真正实现时如果要检测 `:has()`，可以在 `assertScopedCss` 中加入：

```ts
if (/:has\(/.test(css)) {
  throw new Error(`${filePath}: structural inference with :has() is not allowed`);
}
```

## 7. Profile CSS v1

### 7.1 修改文件

```text
render-profiles/octo-chat/capabilities.json
render-profiles/octo-chat/styles.css
render-profiles/octo-chat/theme.css
```

### 7.2 最小 token 集

MVP 先实现：

```text
surface-subtle
surface-warning
badge-warning
line-skeleton
inset-md
motion-fade-in
motion-shimmer
```

### 7.3 skeleton 示例

Card:

```json
{
  "type": "Container",
  "id": "octo--line-skeleton--motion-shimmer--uid-loading-line-1",
  "items": []
}
```

CSS:

```css
.octo-card-profile [id^="octo--"][id*="--line-skeleton--"] {
  min-height: 6px !important;
  max-height: 6px !important;
  overflow: hidden !important;
  border-radius: 999px !important;
  background: rgba(28, 28, 35, .08) !important;
}

.octo-card-profile [id^="octo--"][id*="--motion-shimmer--"] {
  color: transparent !important;
  background-image:
    linear-gradient(90deg, rgba(28, 28, 35, .06), rgba(28, 28, 35, .12), rgba(28, 28, 35, .06));
  background-size: 240% 100%;
  animation: octo-motion-shimmer 1.2s linear infinite;
}
```

宽度由 Adaptive Card 原生布局控制：

```json
{
  "type": "ColumnSet",
  "columns": [
    {
      "type": "Column",
      "width": "stretch",
      "items": [
        {
          "type": "Container",
          "id": "octo--line-skeleton--motion-shimmer--uid-line-main",
          "items": []
        }
      ]
    },
    {
      "type": "Column",
      "width": "80px",
      "items": []
    }
  ]
}
```

不要新增：

```text
width-73px
height-6px
padding-13px
```

## 8. Component Baseline

### 8.1 修改文件

```text
src/component-baseline.ts
tests/component-baseline.test.ts
```

### 8.2 目标

`/components` 需要展示：

```text
Utilities
  Surface
  Badge
  Line
  Inset
  Motion
```

每个 token 至少生成一个标准 Adaptive Card 示例，并通过：

```ts
validateCompiledCard(section.card, profile.capabilities, "octo/v2")
```

### 8.3 生成原则

不要手写业务示例。baseline id 使用：

```text
octo--<token>--uid-baseline-<token>
```

如果 token 需要 fallback，baseline card 必须写 fallback。

## 9. Handoff

### 9.1 修改文件

```text
src/handoff.ts
tests/handoff.test.ts
```

### 9.2 输出结构

在 handoff 交互诊断或 atomic system 摘要中新增：

```json
{
  "utilities": [
    {
      "token": "surface-subtle",
      "group": "surface",
      "ids": ["octo--surface-subtle--inset-md--uid-summary"]
    }
  ]
}
```

第一版可以只做统计，不做业务解释。

## 10. Skill 更新

### 10.1 修改文件

```text
skills/octo-design-cards/SKILL.md
```

### 10.2 写入规则

Agent 生成卡片时：

```text
1. 优先使用标准 Adaptive Card 字段。
2. 标准字段表达不舒适时，查询 capabilities.utilities。
3. 每个元素最多 3 个 utility token。
4. 同 group 不可组合。
5. 找不到 token 时记录 candidate，不修改 Profile。
6. 不使用任意 px、任意颜色、业务专属 token。
```

## 11. 测试命令

每个实现提交都跑：

```bash
pnpm typecheck
pnpm test
```

涉及 Profile 的提交额外跑：

```bash
pnpm cli profile validate octo-chat@latest
pnpm cli check --strict-profile --format json
```

涉及 bundle / pack 时跑：

```bash
pnpm cli profile bundle octo-chat@latest --output .release
pnpm cli profile pack octo-chat@latest --output .release
```

## 12. 验收标准

### 12.1 Core parser

- `tests/utility-id.test.ts` 覆盖所有合法 / 非法语法；
- legacy `octo-badge-warning-*` 不进入 utility parser；
- 没有运行时依赖。

### 12.2 Card validation

- 合法 utility 通过；
- 未知 token error；
- fallback 缺失 error；
- appliesTo 不匹配 error；
- 同 group 冲突 error；
- 超过 token 数 error；
- deprecated token warning；
- legacy component 校验不回退。

### 12.3 Profile validation

- CSS 中未声明 token 会失败；
- capabilities 中必需 CSS 但 CSS 缺失会失败；
- `cssRequired: false` 允许无 CSS；
- `:has()`、未 scoped selector、`.ac-*` 根选择器仍被拦截。

### 12.4 Skeleton UI

必须能用标准 Adaptive Card + utility 实现窄骨架：

```text
line-skeleton + motion-shimmer
```

高度、圆角、背景、shimmer 由 utility 控制；宽度由 `ColumnSet` / `Column.width` 控制。

## 13. 不要做的事

本阶段不要：

1. 不把旧 worktree 的卡片实验直接搬过来。
2. 不新增业务 token，例如 `token-card-secret-row`。
3. 不实现 arbitrary value，例如 `inset-13px`。
4. 不让 token 顺序决定覆盖关系。
5. 不让 CSS selector 匹配业务 id。
6. 不修改 Web Runtime。
7. 不把 `metadata.octoClass` 作为第一阶段方案。

## 14. 建议开工顺序

实际开发时按这个顺序：

```text
1. src/types.ts 增加 utilities 类型。
2. src/utility-id.ts + tests/utility-id.test.ts。
3. validate.ts 接入 utility parser。
4. tests/validate.test.ts 补强校验。
5. profile.ts 增加 utility capabilities / CSS 对账。
6. capabilities.json 声明最小 token。
7. styles.css 实现最小 token。
8. component-baseline.ts 展示 utility。
9. handoff.ts 输出 utility 摘要。
10. Skill 补 Agent 使用规则。
```

第一轮只需要做到第 4 步，就可以形成一个很干净的 `core` PR。后面的 Profile CSS 和真实卡片试点单独开 PR，风险更小。
