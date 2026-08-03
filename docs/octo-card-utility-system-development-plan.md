# Octo Card Utility System 开发落地文档

> 状态：实施计划  
> 适用范围：`octo-card-forge`、`octo-chat` Render Profile、Card Package、Agent Skill / CLI  
> 目标：把 `octo-chat` Profile 建成低频发布的 Tailwind-like utility 超集，让后续卡片主要通过标准 Adaptive Card 字段和已发布 utility 组合完成，而不是为单张卡频繁修改 Web 引用的制品。
> 相关文档：[`octo-utility-profile-v1-implementation.md`](./octo-utility-profile-v1-implementation.md)、[`octo-id-utility-syntax-implementation.md`](./octo-id-utility-syntax-implementation.md)、[`octo-card-motion-scale-research.md`](./octo-card-motion-scale-research.md)、[`octo-card-comfort-scale.md`](./octo-card-comfort-scale.md)

## 1. 最终结论

当前阶段最适合落地的方案是：

```text
标准 Adaptive Card JSON
  + octo--utility-token--uid-* ID 语法
  + capabilities.utilities 白名单
  + Render Profile CSS utility
  + CLI 强校验
  + Agent Skill 决策规则
```

它解决的是这几个问题：

1. Card Package 仍然输出标准 Adaptive Card JSON。
2. `id` 获得类似 `className` 的组合能力，但不引入 CSS cascade / override 复杂度。
3. Render Profile 成为低频发布的通用 utility 超集。
4. Web Runtime 不需要为了普通样式组合频繁改代码。
5. Agent 可以在受控词表中自由组合，超出词表时记录 candidate，而不是发明私有样式。

不要把它做成完整 Tailwind，也不要做成业务组件市场。Octo 只吸收 Tailwind 的三点：

```text
固定 scale
受控 utility token
机器可校验的组合规则
```

## 2. 三层发布边界

### 2.1 Card Package

位置：

```text
cards/<card-id>/
  manifest.json
  contract/data.schema.json
  templates/*.template.json
  samples/*.json
```

职责：

- 定义业务 ViewModel；
- 编排标准 Adaptive Card 结构；
- 选择已发布 utility token；
- 定义 action / input / toggle 的交互面。

发布影响：

```text
高频变化。
只影响对应卡片制品。
不要求修改 octo-chat Profile。
不要求修改 Web Runtime。
```

### 2.2 Render Profile Package

位置：

```text
render-profiles/octo-chat/
  manifest.json
  capabilities.json
  styles.css
  theme.css
  host-config.json
  tokens.json
  atoms.json
  recipes.json
```

职责：

- 声明可用 utility / legacy component；
- 提供 CSS 增强呈现；
- 提供 HostConfig、主题变量、舒适默认值；
- 为 CLI 和 Agent 提供能力事实。

发布影响：

```text
低频变化。
需要发布新的 Profile 制品。
Web 必须消费新 Profile 版本并重新打包 / 上线后才会在线上生效。
```

所以第二层不是热插拔魔法。它必须提前做成稳定超集，不能按单张卡补丁式发布。

### 2.3 Web Runtime

职责：

- 加载 Profile 资源；
- 调 Adaptive Cards SDK 渲染；
- 处理 Action / Submit / OpenUrl / Toggle；
- 执行安全策略；
- 提供 CSS 隔离根节点。

发布影响：

```text
最低频变化。
只有加载机制、SDK、交互、安全、隔离容器等运行时能力变化时才改。
```

普通 surface、badge、line、frame、motion CSS 不应该触发 Web Runtime 代码改造。

## 3. 本阶段范围

### 3.1 必做

1. 新增 `capabilities.utilities` 机读声明。
2. 新增 `octo--...--uid-*` ID utility 语法。
3. 扩展 `octo-card check`，校验 utility token、适用元素、fallback、冲突、数量和唯一性。
4. 扩展 `profile validate`，校验 capabilities 和 CSS selector 对账。
5. 在 `styles.css` 实现 v1 utility CSS。
6. 在 `/components` baseline 展示所有 utility。
7. 更新 Skill / docs，让 Agent 默认从 capabilities 选择 utility。
8. 建立 candidate 机制，超出能力时记录，不直接改 Profile。

### 3.2 暂不做

1. 不新增 Adaptive Card schema 字段。
2. 不做 `metadata.octoClass` 到 DOM class 的 Web Runtime 转换。
3. 不引入 JS 动画库。
4. 不开放任意值，例如 `inset-13px`、`color-ff00ff`。
5. 不为单张卡新增业务 utility。
6. 不把 Card IR / Compiler 作为本阶段前置条件。

## 4. ID Utility 语法

### 4.1 格式

```text
octo--<utility-token>--<utility-token>--uid-<unique-name>
```

示例：

```text
octo--surface-subtle--inset-md--uid-doc-preview-shell
octo--badge-warning--motion-pulse-once--uid-risk-state
octo--line-skeleton--motion-shimmer--uid-loading-line-1
```

含义：

| 片段 | 含义 |
| --- | --- |
| `octo--` | 新 utility 语法命名空间 |
| `surface-subtle` | utility token |
| `inset-md` | utility token |
| `uid-*` | 保证 Adaptive Card element id 唯一 |

### 4.2 规则

1. `uid-*` 必须存在。
2. 同一张卡内所有 `id` 必须唯一。
3. 每个元素最多 3 个 utility token。
4. token 顺序没有语义。
5. 同 group 最多一个 token。
6. 后写 token 不覆盖前写 token。
7. 未声明 token 是 error。
8. token 和 uid 只允许 `[a-z0-9-]`，且必须以小写字母开头。

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
octo--surface-subtle--surface-warning--uid-panel
octo--inset-13px--uid-panel
```

## 5. capabilities.json 设计

在 `RenderCapabilities` 中新增：

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

export interface RenderCapabilities {
  utilities?: Record<string, RenderUtilityDefinition>;
  utilityRules?: RenderUtilityRules;
}
```

示例：

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
      "description": "弱背景内容区域。",
      "useWhen": ["辅助信息块", "文档预览", "次级内容容器"],
      "avoidWhen": ["强风险状态", "主操作区域"]
    },
    "inset-md": {
      "group": "inset",
      "appliesTo": ["Container", "Column"],
      "description": "中等内边距。"
    },
    "motion-fade-in": {
      "group": "motion",
      "appliesTo": ["Container", "Column", "TextBlock"],
      "description": "短时淡入增强。",
      "cssRequired": true
    }
  }
}
```

### 5.1 v1 utility group

| Group | v1 token 示例 | 同组限制 |
| --- | --- | --- |
| `surface` | `surface-plain`、`surface-subtle`、`surface-accent`、`surface-warning`、`surface-attention` | 最多 1 |
| `badge` | `badge-neutral`、`badge-accent`、`badge-good`、`badge-warning`、`badge-attention` | 最多 1 |
| `line` | `line-muted`、`line-skeleton` | 最多 1 |
| `frame` | `frame-document`、`frame-media` | 最多 1 |
| `inset` | `inset-sm`、`inset-md`、`inset-lg` | 最多 1 |
| `motion` | `motion-fade-in`、`motion-slide-up`、`motion-pulse-once`、`motion-shimmer` | 最多 1 |

`density` 先进入文档和 Recipe，不建议第一版做 CSS utility。它通常影响多处结构，单个 element id 表达不稳定。

### 5.2 fallback 规则

如果 utility 声明了 fallback，Card JSON 必须显式写出对应 Adaptive Card 标准字段。

例如：

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

Card 必须写：

```json
{
  "type": "Container",
  "id": "octo--surface-subtle--uid-summary",
  "style": "emphasis",
  "items": []
}
```

这样去掉 Profile CSS 后，仍然是可读的标准 Adaptive Card。

## 6. CSS 实现规则

### 6.1 Selector 规则

必须使用完整 token 边界：

```css
.octo-card-profile [id^="octo--"][id*="--surface-subtle--"] {
  background: var(--octo-card-color-surface-subtle) !important;
}
```

禁止：

```css
[id*="surface"]
[id*="subtle"]
.ac-container { border-radius: 8px; }
.octo-card-profile:has(...)
```

原因：

- 防止误匹配；
- 防止业务 id 被样式污染；
- 防止父级结构猜测导致白边、间距、圆角问题；
- 让 `profile validate` 可以从 CSS 反向对账 capabilities。

### 6.2 CSS 顺序

CSS 文件按固定 group 顺序组织：

```text
1. profile root
2. surface
3. frame
4. line
5. badge
6. inset
7. motion
8. accessibility
```

注意：这是 CSS 文件维护顺序，不是 token override 语义。Card id 中 token 顺序不影响结果。

### 6.3 Profile Root

Profile root 只负责隔离和外层裁切：

```css
.octo-card-profile {
  overflow: hidden;
  border-radius: var(--octo-card-radius-card);
}

.octo-card-profile .ac-adaptiveCard {
  background: transparent !important;
}
```

禁止在 root 或 `.ac-adaptiveCard` 上强塞通用 padding。整卡内边距由 Card Template 的结构和 HostConfig spacing 负责，或者由显式 `inset-*` utility 负责。

### 6.4 圆角和 full-bleed

full-bleed header / footer 不自己做圆角，交给 `.octo-card-profile` 外层裁切：

```css
.octo-card-profile [id^="octo--"][id*="--surface-header-accent--"] {
  border-radius: 0 !important;
}
```

普通 surface / frame 可以有容器圆角：

```css
.octo-card-profile [id^="octo--"][id*="--surface-subtle--"] {
  border-radius: var(--octo-card-radius-container) !important;
}
```

### 6.5 动效

第一版只允许：

```text
motion-fade-in
motion-slide-up
motion-pulse-once
motion-shimmer
```

必须内置降级：

```css
@media (prefers-reduced-motion: reduce) {
  .octo-card-profile [id^="octo--"][id*="--motion-"] {
    animation: none !important;
    transition: none !important;
  }
}
```

规则：

- 默认不用动画；
- 同一卡片不超过 2 个 motion 元素；
- `motion-shimmer` 只用于 loading / skeleton；
- 动画不能是唯一状态表达。

## 7. Validator 实现

### 7.1 新增 parser

新增文件：

```text
src/utility-id.ts
```

接口：

```ts
export interface ParsedUtilityId {
  namespace: "octo";
  tokens: string[];
  uid: string;
}

export type UtilityIdParseResult =
  | { ok: true; value: ParsedUtilityId }
  | { ok: false; code: string; message: string };

export function parseUtilityId(id: string): UtilityIdParseResult | undefined;
export function isUtilityId(id: string): boolean;
```

行为：

- 非 `octo--` 返回 `undefined`；
- `octo--` 语法错误返回 `ok: false`；
- `tokens` 不包含 `uid-*`；
- `uid` 单独返回。

### 7.2 `validateCompiledCard`

在 `src/validate.ts` 中调整 `id` 检查顺序：

```text
if id startsWith "octo--":
  validateUtilityId(...)
else if id startsWith "octo-":
  validateLegacyComponentId(...)
else:
  normal id
```

新增 issue code：

| Code | 触发条件 | Severity |
| --- | --- | --- |
| `utility.id_invalid` | `octo--` 语法不合法 | error |
| `utility.unknown` | token 未声明 | error |
| `utility.applies_to` | token 不适用于该元素 type | error |
| `utility.fallback` | fallback 标准字段缺失或不一致 | error |
| `utility.group_conflict` | 同 group 多 token | error |
| `utility.too_many_tokens` | token 数超过上限 | error |
| `utility.uid_duplicate` | card 内 id 重复 | error |
| `utility.deprecated` | token 已 deprecated | warning |

### 7.3 Profile validate

在 `src/profile.ts` 中扩展：

1. 校验 `utilities` token 命名。
2. 校验 `group` 命名。
3. 校验 `appliesTo` 非空且元素存在于 `allowedElements`。
4. 校验 `fallback` 是对象。
5. 校验 `utilityRules.maxTokensPerElement` 是正整数。
6. 扫描 CSS 中的 `[id*="--token--"]`，必须存在于 `capabilities.utilities`。
7. `cssRequired !== false` 的 utility 必须有 CSS selector。
8. 禁止 CSS 中出现业务 selector 或未声明 legacy prefix。

CSS token 提取正则：

```text
\[id\*=(["'])--([a-z][a-z0-9]*(?:-[a-z0-9]+)*)--\1\]
```

## 8. Handoff / Inspect

`src/handoff.ts` 输出中新增 utility 摘要：

```json
{
  "atomicSystem": {
    "utilities": [
      {
        "token": "surface-subtle",
        "group": "surface",
        "ids": ["octo--surface-subtle--inset-md--uid-summary"]
      }
    ]
  }
}
```

用途：

- 后端知道卡片依赖哪些 Profile utility；
- Agent 能复盘是否过度组合；
- 评审能看到是否有 candidate 需要晋升。

## 9. Candidate Registry

新增建议文件：

```text
render-profiles/octo-chat/candidates.json
```

示例：

```json
{
  "line-skeleton": {
    "status": "candidate",
    "reason": "标准 Adaptive Card 很难稳定表达 2px skeleton line。",
    "seenIn": ["docs.preview-card", "ai.reasoning-process"],
    "proposedGroup": "line",
    "promotionCriteria": [
      "至少 3 个不同 Card Package 需要",
      "标准 Adaptive Card fallback 不够稳定",
      "命名不包含业务语义",
      "CSS 不依赖结构猜测"
    ]
  }
}
```

晋升条件：

1. 至少 3 个 Card Package 复用；
2. 标准 Adaptive Card 难以舒适表达；
3. token 命名通用；
4. 有清晰 fallback；
5. 不需要 Web Runtime 代码支持。

## 10. Agent 使用规则

Agent 生成卡片时按以下顺序：

```text
1. 优先使用标准 Adaptive Card 字段。
2. 标准字段表达不舒适时，查询 capabilities.utilities。
3. 从 utility 中选择最少 token。
4. 同元素超过 3 token 时拆嵌套。
5. 找不到合适 token 时，使用标准 Adaptive Card 兜底并记录 candidate。
6. 不为了单张卡修改 render-profiles/octo-chat/。
```

禁止：

```text
octo--brand-q3-special--uid-x
octo--padding-13px--uid-x
octo--surface-subtle--surface-warning--uid-x
```

推荐：

```json
{
  "type": "Container",
  "id": "octo--surface-subtle--inset-md--uid-risk-summary",
  "style": "emphasis",
  "items": [
    {
      "type": "TextBlock",
      "text": "存在 2 项风险",
      "weight": "Bolder"
    }
  ]
}
```

## 11. 开发任务拆分

### PR 1：冻结规范与导航

改动：

```text
docs/octo-card-utility-system-development-plan.md
docs/octo-utility-profile-v1-implementation.md
docs/octo-id-utility-syntax-implementation.md
docs/octo-card-motion-scale-research.md
README.md
```

验收：

- 文档明确三层发布边界；
- 文档明确 ID utility 语法；
- 文档明确 CSS 禁止项；
- 文档明确 Profile 变更需要 Web 消费新版本才生效。

### PR 2：类型与 parser

改动：

```text
src/types.ts
src/utility-id.ts
tests/utility-id.test.ts
```

验收：

```bash
pnpm typecheck
pnpm test
```

测试覆盖：

- 合法 id；
- 缺 uid；
- 非法字符；
- token 提取；
- token 顺序无关；
- token 数量；
- 非 `octo--` 不进入新 parser。

### PR 3：能力声明与 CSS v1

改动：

```text
render-profiles/octo-chat/capabilities.json
render-profiles/octo-chat/styles.css
render-profiles/octo-chat/theme.css
tests/profile.test.ts
```

内容：

- 新增 `utilities`；
- 实现 surface / badge / line / frame / inset / motion；
- 保留 legacy components；
- 移除全局结构猜测规则；
- 加 `prefers-reduced-motion`。

验收：

```bash
pnpm cli profile validate octo-chat@latest
pnpm test
```

### PR 4：Card check 强校验

改动：

```text
src/validate.ts
tests/validate.test.ts
tests/compiler.test.ts
```

验收：

```bash
pnpm cli check --strict-profile --format json
pnpm test
```

必须覆盖：

- unknown token error；
- appliesTo error；
- fallback error；
- group conflict error；
- too many tokens error；
- duplicate id error；
- deprecated warning；
- legacy `octo-*` 仍兼容。

### PR 5：Profile CSS 对账

改动：

```text
src/profile.ts
tests/profile.test.ts
```

验收：

- CSS 中出现未声明 utility selector 时报错；
- capabilities 中 `cssRequired !== false` 但 CSS 缺失时报错；
- legacy component selector 继续按旧规则校验；
- 禁止业务 selector 混入 Profile CSS。

### PR 6：Baseline 与视觉回归

改动：

```text
src/component-baseline.ts
tests/component-baseline.test.ts
```

验收：

- `/components` 展示所有 utility group；
- 每个 utility 至少有一个 baseline 示例；
- baseline card 全部通过 `validateCompiledCard`；
- 人工检查 320 / 480 / 640 宽度。

重点看：

- full-bleed header/footer 是否露白；
- ordinary surface 是否有意外 padding；
- badge 是否可读；
- line/skeleton 是否稳定；
- motion reduce 后是否静态可读。

### PR 7：Handoff / Agent Skill

改动：

```text
src/handoff.ts
tests/handoff.test.ts
skills/octo-design-cards/SKILL.md
docs/agent-skill-cli-operating-model.md
```

验收：

- handoff 输出 utility 使用摘要；
- Skill 明确默认使用标准 AC；
- Skill 明确只能从 capabilities 选择 utility；
- Skill 明确 candidate 机制；
- Agent 不应为了单卡改 Profile。

### PR 8：试点卡迁移

试点：

```text
ai.reasoning-process
docs.preview-card
bot token 查看卡片
```

目标：

- 使用新 utility 语法替代新增 legacy prefix；
- 验证不修改 Profile 的情况下，Card Package 能完成合理样式组合；
- 记录缺失能力到 candidates，不临时补平台 CSS。

## 12. 测试与验收命令

每个实现 PR 必跑：

```bash
pnpm typecheck
pnpm test
pnpm cli profile validate octo-chat@latest
pnpm cli check --strict-profile --format json
```

Profile 发布前额外跑：

```bash
pnpm cli profile bundle octo-chat@latest --output .release
pnpm cli profile pack octo-chat@latest --output .release
```

单卡试点：

```bash
pnpm cli check <card-id> --strict-profile --format json
pnpm cli inspect <card-id> --format json
pnpm cli render <card-id> --sample <sample>
```

## 13. Profile 发布流程

当 utility v1 稳定后：

1. 更新 `render-profiles/octo-chat/manifest.json` version。
2. 更新 `src/registry.ts` 中的 `CURRENT_RENDER_PROFILE`。
3. 生成 bundle / pack。
4. Web 仓库升级 Profile package 或配置。
5. Web 重新打包上线。
6. Card Package 才能在线上使用新 utility。

这意味着：

```text
新增 Card Package
  -> 只发卡片制品

新增 Profile utility
  -> 发 Profile 制品
  -> Web 消费新版本并上线后才生效

修改 Web Runtime
  -> 发 Web
```

因此 utility v1 要尽量一次性覆盖通用需求，后续通过 candidate 批量进入 vNext。

## 14. 实现坑位与规避

### 14.1 CSS 优先级膨胀

风险：

```text
为了覆盖 Adaptive Cards SDK 样式，不断加更强 selector 和 !important。
```

规避：

- selector 只匹配 utility token；
- 不写业务 selector；
- 不依赖 token 顺序；
- 同 group 冲突直接报错；
- CSS 按 group 固定顺序维护；
- `!important` 只用于 SDK 难以覆盖的展示属性。

### 14.2 重新发明 cascade

风险：

```text
octo--surface-subtle--surface-warning--uid-x
```

然后靠后面的 token 覆盖前面的 token。

规避：

- 同 group 最多一个 token；
- 顺序无语义；
- 冲突是 error，不是 warning。

### 14.3 id 过长和不可读

规避：

- 每个元素最多 3 token；
- uid 只写稳定短名；
- 复杂视觉拆嵌套，不在一个 id 里堆。

### 14.4 Profile 变成单卡补丁集

规避：

- 新能力先进入 `candidates.json`；
- 满足晋升条件后批量进入 vNext；
- 禁止业务命名；
- `/components` baseline 必须展示。

### 14.5 线上不生效误判

风险：

```text
Forge 里 Profile 改了，本地看起来好了，但 Web 线上没升级 Profile 包。
```

规避：

- 文档和 PR 模板明确 Profile 改动需要 Web 消费新版本；
- Card manifest pin 具体 Profile 版本；
- handoff 输出 resolved renderProfile。

### 14.6 安全与 selector 注入

规避：

- token / uid 字符集严格限制；
- 不允许空格、引号、方括号、点号、冒号；
- CSS selector token 必须来自 capabilities；
- 发布前 `profile validate` 阻断。

### 14.7 动画滥用

规避：

- 默认不用；
- 同一卡片最多 2 个 motion 元素；
- 持续动画只允许 loading / skeleton；
- 必须支持 reduced motion；
- 动画不能承载唯一语义。

## 15. 最小可交付版本

如果要尽快验证方案，MVP 可以只做：

1. `utilities` 类型和 parser；
2. `surface-subtle`、`badge-warning`、`line-skeleton`、`inset-md`、`motion-fade-in` 五个 token；
3. `validateCompiledCard` 强校验；
4. `profile validate` CSS 对账；
5. `/components` baseline；
6. 一个真实卡片试点。

MVP 成功标准：

```text
同一张卡可以通过 ID utility 组合出更舒服的布局；
不需要新增 Web Runtime 代码；
未知 token / 冲突 token 会被 check 拦住；
Profile CSS 不再依赖全局 padding、:has() 或业务 selector；
Agent 能从 capabilities 解释自己为什么选这些 token。
```

## 16. 决策记录

本方案选择 `id` utility，而不是 `metadata` 或自定义字段，原因是：

1. Adaptive Card 元素已有标准 `id` 字段。
2. CSS 可以直接选择 `id`，不需要 Web Runtime 读取 metadata 再加 class。
3. 不破坏宿主降级能力。
4. CLI 可以完全静态校验。

代价是：

1. `id` 同时承担唯一性和 utility 选择，需要强制 `uid-*`。
2. 组合能力必须克制，不能做完整 Tailwind。
3. CSS selector 维护必须靠 Profile validate 对账。

这个代价是可接受的，因为当前最重要的是降低 Profile / Web 发版频率，同时让 Agent 有稳定、可校验的组合空间。
