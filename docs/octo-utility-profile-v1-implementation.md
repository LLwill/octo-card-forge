# Octo Utility Profile v1 开发实现方案

> 状态：开发实施方案  
> 适用范围：`octo-card-forge`、`octo-chat` Render Profile 制品、Agent Skill、Card Package 开发  
> 目标：把 `octo-chat` Render Profile 做成类似 Tailwind CSS 的稳定通用能力底座，让后续卡片主要通过组合已有 utility 实现，不因为单张卡片频繁发 Profile / Web。

## 1. 核心结论

`octo-chat` Profile 不应该按卡片逐个补能力，而应该先发布一版足够完整、克制、稳定的 **Utility Profile v1**。

后续新增卡片时：

```text
优先修改：
cards/<card-id>/

尽量不修改：
render-profiles/octo-chat/

不修改：
octo-chat Web runtime
```

Profile v1 的定位类似 Tailwind 基础 utility 集合：

```text
Tailwind:
  p-4 / gap-2 / rounded-md / animate-pulse / text-sm

Octo Utility Profile:
  octo-surface-* / octo-badge-* / octo-line-* / octo-field-* / octo-motion-*
```

但 Adaptive Card JSON 没有 HTML 多 class 机制，所以 Octo 不能简单照搬 Tailwind。Octo 使用 **typed primitive + 嵌套结构**：

```json
{
  "type": "Container",
  "id": "octo-surface-subtle-doc-preview",
  "style": "emphasis",
  "items": []
}
```

一个元素通常只挂一个主要 `octo-*` primitive；需要组合时通过嵌套 `Container` / `ColumnSet` / `TextBlock` 完成。

## 2. 三层关系

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

- 定义这张卡展示什么数据；
- 定义标准 Adaptive Card 结构；
- 选择当前 Profile 已发布的 utility；
- 定义业务 action id 和 submit data。

修改影响：

```text
只影响这张卡。
不触发 octo-chat Profile 发版。
不触发 Web runtime 发版。
```

### 2.2 Render Profile 制品

位置：

```text
render-profiles/octo-chat/
  manifest.json
  capabilities.json
  styles.css
  host-config.json
  theme.css
  tokens.json
  atoms.json
  recipes.json
```

职责：

- 声明允许哪些元素、action、`octo-*` utility；
- 定义这些 utility 在 Web 中的 CSS 表现；
- 提供 HostConfig、主题变量和默认交互样式；
- 为 Agent 提供可查询能力表。

修改影响：

```text
需要发布新的 Render Profile 制品。
Web 要消费新 Profile 版本才会生效。
通常不需要改 octo-chat runtime 代码，但实际线上生效仍需要 Web 打包/上线或配置切换。
```

### 2.3 octo-chat Web Runtime

职责：

- 加载 Adaptive Card JSON；
- 加载指定 Render Profile 资源；
- 调用 Adaptive Cards SDK 渲染；
- 执行 Action / Submit / OpenUrl / Toggle；
- 执行安全策略。

修改影响：

```text
需要 octo-chat runtime 发版。
```

只有以下情况才改 runtime：

- Profile 包加载机制变化；
- Adaptive Cards SDK 升级；
- Action 行为或安全策略变化；
- CSS 隔离根节点变化；
- 运行时需要新能力，而不是纯 CSS/HostConfig 能解决。

## 3. 发版策略

### 3.1 期望频率

| 层 | 频率 | 触发 |
| --- | --- | --- |
| Card Package | 高频 | 新业务卡片、新状态、新字段、新 action |
| Render Profile | 低频 | 批量新增或调整通用 utility |
| Web Runtime | 更低频 | 渲染器、加载器、交互、安全策略变化 |

### 3.2 禁止模式

```text
一张卡缺一个视觉效果
  -> 新增一个 primitive
  -> 发一次 Profile
  -> Web 重新打包上线
```

这会让 Profile 变成按卡片打补丁，违背本方案目标。

### 3.3 推荐模式

```text
多个卡片实现中发现共性
  -> 记录 candidate
  -> 定期评审
  -> 批量进入 Profile vNext
  -> Web 按平台节奏升级
```

## 4. Utility Profile v1 范围

v1 目标是覆盖 80% 卡片视觉需求，但不包含业务组件。

### 4.1 v1 family 总览

| Family | 解决问题 | 是否 v1 必须 |
| --- | --- | --- |
| `octo-surface` | 通用背景区域 | 是 |
| `octo-badge` | 状态胶囊 | 是 |
| `octo-line` | 细线、分隔、骨架线 | 是 |
| `octo-field` | 字段列表 / label-value 对齐 | 是 |
| `octo-frame` | 文档 / 媒体预览框 | 是 |
| `octo-motion` | 轻量动效 | 可选，建议进入 v1 但默认不用 |
| `octo-density` | compact / default / relaxed 密度 | 可选，先文档化，谨慎实现 |
| `octo-inset` | 受控内边距 | 谨慎，不建议第一批大规模开放 |

### 4.2 不进入 Profile 的内容

禁止业务组件：

```text
octo-token-card-*
octo-doc-preview-q3-*
octo-approval-brooks-*
octo-bot-list-*
```

禁止单卡样式：

```text
octo-special-title-*
octo-q3-preview-line-*
octo-demo-worker-token-*
```

禁止自由参数：

```text
octo-padding-13px-*
octo-color-ff00ff-*
octo-motion-700ms-*
```

## 5. 命名规则

统一格式：

```text
octo-<family>-<variant>-<free-suffix>
```

示例：

```text
octo-badge-warning-request-state
octo-surface-subtle-doc-preview
octo-line-muted-preview-skeleton-1
octo-motion-fade-in-result
```

规则：

- `family` 和 `variant` 必须由 `capabilities.json` 声明；
- `free-suffix` 只用于元素唯一性，不进入 CSS 语义；
- 业务状态映射到通用 variant，不新增业务 variant；
- 未声明的 `octo-*` 必须被 `check` 拒绝。

## 6. capabilities.json 设计

### 6.1 当前机制

当前 `capabilities.components` 已支持：

```json
{
  "octo-badge": {
    "appliesTo": ["TextBlock"],
    "variants": {
      "warning": {
        "fallback": {
          "size": "Small",
          "weight": "Bolder",
          "color": "Warning"
        }
      }
    }
  }
}
```

校验逻辑会检查：

- `id` 前缀是否声明；
- `variant` 是否存在；
- 元素类型是否适用；
- fallback 属性是否写在 Card JSON 上。

### 6.2 v1 建议声明

建议新增或完善：

```json
{
  "components": {
    "octo-surface": {
      "appliesTo": ["Container", "Column"],
      "variants": {
        "plain": { "fallback": { "style": "default" } },
        "subtle": { "fallback": { "style": "emphasis" } },
        "accent": { "fallback": { "style": "accent" } },
        "warning": { "fallback": { "style": "warning" } },
        "attention": { "fallback": { "style": "attention" } },
        "header-accent": { "fallback": { "style": "accent" } },
        "footer-default": { "fallback": { "style": "emphasis" } }
      }
    },
    "octo-badge": {
      "appliesTo": ["TextBlock"],
      "variants": {
        "neutral": { "fallback": { "size": "Small", "weight": "Bolder", "isSubtle": true } },
        "accent": { "fallback": { "size": "Small", "weight": "Bolder", "color": "Accent" } },
        "good": { "fallback": { "size": "Small", "weight": "Bolder", "color": "Good" } },
        "warning": { "fallback": { "size": "Small", "weight": "Bolder", "color": "Warning" } },
        "attention": { "fallback": { "size": "Small", "weight": "Bolder", "color": "Attention" } }
      }
    },
    "octo-line": {
      "appliesTo": ["TextBlock", "Container"],
      "variants": {
        "muted": { "fallback": {} },
        "skeleton": { "fallback": {} }
      }
    },
    "octo-frame": {
      "appliesTo": ["Container"],
      "variants": {
        "document": { "fallback": { "style": "default" } },
        "media": { "fallback": { "style": "default" } }
      }
    },
    "octo-motion": {
      "appliesTo": ["Container", "Column", "TextBlock", "ActionSet"],
      "variants": {
        "fade-in": { "fallback": {} },
        "slide-up": { "fallback": {} },
        "pulse-once": { "fallback": {} },
        "shimmer": { "fallback": {} }
      }
    }
  }
}
```

注意：

- `fallback: {}` 表示该 utility 不改变静态语义，只做视觉增强；
- 如果某个 variant 需要不同 `appliesTo`，当前 schema 不够，需要后续扩展 validator；
- v1 尽量不扩 schema，除非确实无法表达。

## 7. CSS 实现原则

### 7.1 禁止全局结构猜测

禁止：

```css
.octo-card-profile .ac-adaptiveCard {
  padding: 20px 24px !important;
}

.octo-card-profile:has(.ac-adaptiveCard > [id^="octo-surface-subtle-"]) {
  background: ...;
}

.octo-card-profile .ac-container {
  border-radius: 8px;
}
```

原因：

- 会影响所有卡；
- 会让局部结构影响整卡；
- 会把布局职责从 Card Template 偷到 Profile；
- 会造成不可预期的白边、间距、圆角问题。

允许：

```css
.octo-card-profile [id^="octo-badge-warning-"] { ... }
.octo-card-profile [id^="octo-surface-subtle-"] { ... }
.octo-card-profile [id^="octo-line-skeleton-"] { ... }
```

原因：

- 元素显式选择了 utility；
- 不依赖位置推断；
- 不影响未选择该 utility 的卡片。

### 7.2 外层裁切

外层卡片壳负责：

```css
.octo-card-profile {
  overflow: hidden;
  border-radius: var(--octo-card-radius-card);
}
```

full-bleed header/footer 不自己定义圆角，交给外层裁切：

```css
.octo-card-profile [id^="octo-surface-header-accent-"] {
  border-radius: 0 !important;
}
```

### 7.3 不把 padding 做成隐式规则

禁止某个普通 surface 偷偷自带大 padding。

如果要提供 inset 能力，应显式设计：

```text
octo-inset-sm-*
octo-inset-md-*
octo-inset-lg-*
```

但 v1 不建议立刻开放 `octo-inset-*`，因为 Adaptive Card 一个元素只有一个主要 `id`，inset 很容易和 surface 冲突。优先通过 Card 结构和 HostConfig spacing 解决。

## 8. v1 Family 详细设计

### 8.1 `octo-surface`

用途：

- 普通背景块；
- 强调块；
- full-bleed header/footer。

建议 variants：

```text
plain
subtle
accent
warning
attention
header-accent
footer-default
```

CSS 原则：

- `subtle/accent/warning/attention` 是普通块，保留容器圆角；
- `header-accent/footer-default` 是 full-bleed 区域，不带内边距，不自己处理整体卡片布局；
- 不通过 `:has()` 影响父级。

### 8.2 `octo-badge`

用途：

- 状态；
- 风险；
- 推荐；
- 权限；
- AI 能力入口。

建议 variants：

```text
neutral
accent
good
warning
attention
```

CSS 原则：

- 胶囊；
- 小字号；
- fallback 必须含文字和语义色；
- 状态不能只靠颜色表达。

### 8.3 `octo-line`

用途：

- 细分割线；
- 文档预览骨架线；
- loading skeleton 的静态占位线。

建议 variants：

```text
muted
skeleton
```

CSS 示例：

```css
.octo-card-profile [id^="octo-line-muted-"],
.octo-card-profile [id^="octo-line-skeleton-"] {
  display: block !important;
  min-height: 2px !important;
  max-height: 2px !important;
  overflow: hidden !important;
  border-radius: 999px;
  background: rgba(28, 28, 35, .08) !important;
}
```

Card 写法建议：

```json
{
  "type": "TextBlock",
  "id": "octo-line-skeleton-doc-preview-1",
  "text": " ",
  "spacing": "Small"
}
```

说明：

- 这是通用视觉 utility，不是文档预览业务组件；
- 它解决 Adaptive Card 原生无法优雅表达 2px 可控宽度线的问题；
- 长度通过 `ColumnSet` 控制，不通过 CSS 私有宽度参数控制。

### 8.4 `octo-frame`

用途：

- 文档预览框；
- 图片/媒体预览框；
- 文件卡片内嵌页面感。

建议 variants：

```text
document
media
```

CSS 原则：

- 只提供边框、圆角、背景；
- 不写业务文案；
- 不决定内部具体排版；
- 内部结构仍由 Card Template 负责。

### 8.5 `octo-motion`

用途：

- 新内容进入；
- 状态短反馈；
- loading skeleton。

建议 variants：

```text
fade-in
slide-up
pulse-once
shimmer
```

规则：

- 默认不用；
- 同一卡片不超过 2 个 motion 元素；
- `shimmer` 只用于 loading/skeleton；
- 必须支持 `prefers-reduced-motion`；
- 动画不能是唯一状态表达。

详细方案见：

```text
docs/octo-card-motion-scale-research.md
```

### 8.6 `octo-density`

暂不建议第一阶段实现为 CSS primitive。

原因：

- density 通常影响多处 spacing；
- 单元素 `id` 不适合表达整卡密度；
- 容易重新引入全局结构推断。

第一阶段只在文档和 Recipe 中定义：

```text
compact
default
relaxed
```

具体通过模板选择 `spacing` 和结构实现。

### 8.7 `octo-inset`

第一阶段暂缓。

原因：

- Adaptive Card 元素没有多 class；
- `octo-inset-md-*` 会和 `octo-surface-subtle-*` 竞争同一个 `id`；
- 如果通过嵌套容器表达，会增加模板复杂度。

如果未来要做，建议只做非常少的组合 variant：

```text
octo-surface-subtle-inset-md-*
octo-frame-document-inset-lg-*
```

但这会扩大 variant 数量，需谨慎。

## 9. Agent 使用规则

Agent 生成卡片时：

```text
1. 先读取 capabilities.json。
2. 只使用已声明的 octo-* family / variant。
3. 能用标准 Adaptive Card 表达的，优先用标准能力。
4. 标准 AC 表达很别扭时，使用已发布 utility。
5. 仍不够时，使用最朴素的标准 AC 兜底，并记录 candidate。
6. 不允许为了单张卡直接修改 render-profiles/octo-chat/。
```

决策顺序：

```text
Text / color / spacing / action style
  -> 标准 Adaptive Card

Badge / surface / line / frame / motion
  -> 已发布 octo-* utility

特殊业务布局
  -> Card Template 自己组合

多卡复用痛点
  -> candidate registry
```

## 10. Candidate Registry

为了避免频繁发 Profile，需要记录候选能力，但不立即实现。

建议新增：

```text
render-profiles/octo-chat/candidates.json
```

示例：

```json
{
  "line.skeleton": {
    "status": "candidate",
    "reason": "Standard Adaptive Card cannot express stable 2px skeleton lines without renderer-specific behavior.",
    "seenIn": ["docs.preview-card"],
    "proposedFamily": "octo-line",
    "proposedVariants": ["skeleton"],
    "promotionCriteria": [
      "Used by at least 3 card packages",
      "No acceptable standard Adaptive Card fallback",
      "No business-specific naming"
    ]
  }
}
```

Promotion 条件：

- 至少 3 个不同 Card Package 需要；
- 标准 Adaptive Card 方案明显不稳定或过于 hack；
- 语义通用，不包含业务；
- fallback 可读；
- CSS 实现不需要结构猜测。

## 11. 开发任务拆分

### Phase 0：冻结规则

目标：

- 明确 Profile 不按单卡补丁发版；
- 明确 v1 utility 范围；
- 明确 candidate 机制。

改动：

```text
docs/octo-utility-profile-v1-implementation.md
skills/octo-design-cards/SKILL.md
docs/adaptive-card-atomic-system.md
docs/octo-card-comfort-scale.md
```

验收：

- 文档说明 Card / Profile / Web 三层发布影响；
- Skill 明确禁止 Agent 直接为单卡改 Profile；
- 文档明确 candidate 记录方式。

### Phase 1：能力声明

目标：

- 在 `capabilities.json` 声明 v1 utility families。

改动：

```text
render-profiles/octo-chat/capabilities.json
tests/validate.test.ts
tests/component-baseline.test.ts
```

验收：

```bash
pnpm cli profile validate octo-chat@latest
pnpm test
```

### Phase 2：CSS 实现

目标：

- 实现 v1 utility CSS；
- 清理全局结构猜测规则；
- 增加 reduced-motion。

改动：

```text
render-profiles/octo-chat/styles.css
render-profiles/octo-chat/theme.css
```

禁止：

- 根 `.ac-adaptiveCard` 强制 padding；
- 用 `:has()` 推断整卡背景；
- 给所有 `.ac-container` 写圆角/padding；
- 业务 selector。

验收：

```bash
pnpm cli profile validate octo-chat@latest
pnpm test
```

### Phase 3：Baseline 页面

目标：

- `/components` 展示每个 utility family；
- 每个 family 有可视化样例；
- 320 / 480 / 640 宽度人工检查。

改动：

```text
src/component-baseline.ts
web/components.js
tests/component-baseline.test.ts
```

验收：

- baseline cards 通过 `validateCompiledCard`；
- 样例不包含业务 card id；
- CSS selector 都由 `capabilities.components` 声明。

### Phase 4：Skill 与 Agent Runtime

目标：

- Agent 默认从 capabilities discover 能力；
- 不够用时记录 candidate，不改 Profile。

改动：

```text
skills/octo-design-cards/SKILL.md
src/handoff.ts
docs/agent-skill-cli-operating-model.md
```

可选 CLI：

```bash
pnpm cli profile candidates octo-chat@latest
pnpm cli profile explain octo-chat@latest utility octo-line.skeleton
```

### Phase 5：试点卡片回归

选择 3 类试点：

```text
ai.reasoning-process
ai.decision-action
docs.preview-card
```

目标：

- 验证 header/footer/surface 不露白；
- 验证 choice list 不需要卡片私有 CSS；
- 验证 document preview skeleton/line 能通过 v1 utility 表达；
- 验证不需要新发 Profile 就能实现新增卡片。

## 12. 测试策略

必跑：

```bash
pnpm typecheck
pnpm test
pnpm cli profile validate octo-chat@latest
pnpm cli check --strict-profile --format json
```

针对 Profile：

```bash
pnpm cli profile bundle octo-chat@latest --output .release
pnpm cli profile pack octo-chat@latest --output .release
```

针对卡片：

```bash
pnpm cli check <card-id> --strict-profile --format json
pnpm cli render <card-id> --sample <sample>
pnpm cli inspect <card-id> --sample <sample> --format json
```

视觉检查：

```text
320px
480px
640px
```

重点看：

- 是否横向溢出；
- full-bleed header/footer 是否露白；
- nested surface 是否出现意外 padding；
- badge/action 是否可读；
- reduced-motion 是否生效。

## 13. 发布流程

### 13.1 Profile 版本

当 v1 utility 集合稳定后：

```text
octo-chat@1.3.0
```

修改：

```text
render-profiles/octo-chat/manifest.json
src/registry.ts CURRENT_RENDER_PROFILE
```

生成制品：

```bash
pnpm cli profile bundle octo-chat@1.3.0 --output .release
pnpm cli profile pack octo-chat@1.3.0 --output .release
```

### 13.2 Web 生效

Web 要生效仍需要：

```text
升级 Profile 包 / lockfile / 配置
重新打包
上线
```

因此 Profile 发版必须低频、批量。

### 13.3 Card Package 兼容

使用 `octo-chat@latest` 的草稿卡：

```text
跟随当前 Profile baseline
```

冻结或历史卡：

```text
pin 到具体 octo-chat@x.y.z
```

## 14. 风险与约束

### 风险 1：utility 太少

结果：

- Agent 被迫 hack；
- 卡片质量不稳定；
- 视觉还原差。

应对：

- v1 一次性覆盖常用视觉能力；
- 建立 candidate registry；
- 定期批量晋升。

### 风险 2：utility 太多

结果：

- Profile 变复杂；
- Agent 选择困难；
- variant 命名膨胀。

应对：

- 禁止业务 variant；
- 每个 family 控制在 3-8 个 variant；
- Skill 提供决策树；
- `/components` 提供 baseline。

### 风险 3：Profile 修改带来 Web 上线压力

结果：

- 每个视觉能力都要求 Web 打包；
- 卡片迭代被平台发版阻塞。

应对：

- Profile 只低频批量发版；
- 单卡诉求不进 Profile；
- Card Package 使用已发布 utility 组合。

### 风险 4：CSS 结构猜测回潮

结果：

- 某张卡看起来好了，其他卡坏了；
- full-bleed、padding、圆角不可控。

应对：

- CSS 只基于显式 `octo-*` id；
- 禁止根节点 padding；
- 禁止基于元素位置推断；
- tests 检查 selector 声明。

## 15. 最终验收标准

Utility Profile v1 完成时，应满足：

1. 新增普通业务卡片时，80% 情况只改 `cards/<card-id>/`。
2. Agent 不需要为单卡修改 `render-profiles/octo-chat/`。
3. `capabilities.json` 完整声明所有 `octo-*` family / variant。
4. `/components` 能展示所有 utility baseline。
5. Profile CSS 不包含业务 selector、根 padding、位置推断。
6. 320 / 480 / 640 宽度下 baseline 无明显布局问题。
7. Web 只在 Profile 批量升级时消费新制品，不随单卡需求频繁上线。

## 16. 建议下一步

1. 评审本文档，确认 v1 family 范围。
2. 清理当前 Profile 中不合格的全局规则。
3. 设计 `capabilities.components` v1。
4. 补 `/components` baseline。
5. 用 `docs.preview-card`、`ai.reasoning-process`、`ai.decision-action` 做试点。
6. 稳定后发布 `octo-chat@1.3.0` 候选制品。
