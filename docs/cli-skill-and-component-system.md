# Octo Card Forge CLI / Skill 与平台组件系统设计

> 状态：设计基线（部分已实现，部分待落地）  
> 初版日期：2026-07-27  
> 适用范围：`octo-card-forge` 的 CLI、Agent Skill、Render Profile 平台组件词汇表与发布节奏  
> 相关文档：[`architecture-design.md`](./architecture-design.md)、[`render-profile-integration-rollout.md`](./render-profile-integration-rollout.md)

## 1. 结论

Card Forge 采用两层协作模型：

1. **CLI 是可机检事实层**：创建、编译、校验、打包、handoff。
2. **Skill 是不可机检判断层**：何时新建 View、何时 bump 版本、何时停下来问人。

平台视觉增强采用受限组件词汇表：

1. **组件不是新的 Adaptive Cards `type`**。
2. **组件 = 语义 ID 前缀 + Profile CSS + 基线样例 + 机读声明**。
3. **绝大多数卡片需求停在标准 AC 或已发布词汇表内**；新组件按 rule-of-three 晋升，不按单卡需求立即进 profile。

目标是让 Agent 产卡、平台维护 profile、Web 发版三条节奏解耦，并尽量互不等待。

## 2. CLI 与 Skill 边界

### 2.1 为什么拆开

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| CLI | 确定性能力：`init` / `verify` / `check` / `inspect` / `render` / `handoff` / `profile` | 业务语义猜测、版本策略解释之外的产品取舍 |
| Skill | 工作流、禁令、semver 判断、交付清单、何时停下来提问 | 重复实现 CLI 已能断言的规则 |

这个拆分对应 Agent 协作的两种需求：

- 可执行、可 CI 化的事实，必须进入 CLI。
- 需要业务上下文或产品判断的策略，必须留在 Skill。

### 2.2 防腐化原则

**凡是能写成断言的，写进 `cli check`；凡是需要业务上下文才能决定的，留在 Skill。**

`verify` 是 Agent 的收尾入口：组合 check、lint、逐 sample 编译，并可选输出编译卡片和 handoff；`check`、`lint` 仍保留给平台开发和局部排错。

允许 Skill 复述 blocker，例如 unresolved `${...}`、duplicate IDs、insecure URLs；但新增机检规则时，必须先或同时进入 `check`，不能只写进 Skill。

Skill 与 CLI **同仓同版本**，Agent 从仓库根就地读取。不把 Skill 抽成无版本对齐的外部分发物，避免“Skill 描述了当前 CLI 不存在的命令”。

### 2.3 当前分工

CLI 已承担：

- Card Package 创建与版本选择
- ViewModel Schema 与 Sample 编译
- Wire Profile / Render Profile 能力校验
- Action / Input / Toggle 诊断提取
- handoff 制品生成
- Render Profile bundle / pack

Skill 已承担：

- 先设计 contract 再写 template
- 禁止 `interactions.json`
- 禁止业务专用渲染标记
- 版本与 contractVersion 决策
- 不发明业务 Action 语义
- handoff 报告清单

本分支补齐：

- 平台组件词汇表如何发现与使用
- Tier 0 / 1 / 2 表达力分流
- 候选组件模式如何写入 handoff

## 3. 平台组件是什么

### 3.1 机制

Adaptive Cards 不允许平台私有 `type`。Octo 的平台组件因此采用：

```text
Card Template
  type = 标准 AC 元素
  id   = octo-<family>-<variant>-<free-suffix>

Render Profile CSS
  .octo-card-profile [id^="octo-<family>-"]
  .octo-card-profile [id^="octo-<family>-<variant>-"]
```

线上传输仍然是标准 Adaptive Card JSON。组件语义不进入消息协议，只在 Web Render Profile 中增强呈现。

### 3.2 当前已验证家族

当前候选 / 已用前缀：

| family | 用途 | 已见 variant |
| --- | --- | --- |
| `octo-surface` | 区域背景与圆角语义 | `accent`、`header-accent`、`footer-default` |
| `octo-badge` | 紧凑胶囊标签 | `neutral`、`accent`、`good`、`warning`、`attention` |

它们已经进入当前 RC Render Profile 的 `capabilities.components`，并由 `cli check`
与 `profile validate` 校验。

### 3.3 组件不是业务状态

业务状态由 ViewModel / template 表达式选择 variant，而不是进入组件名。

正确：

```text
octo-badge-warning-request-state
```

错误：

```text
octo-badge-pending-request-state
octo-deny-panel
#deny_panel
```

禁止：

- 业务 owner / card id / action id 进入 CSS 选择器
- 用位置伪类推断 header / footer
- 为单张卡写私有 profile CSS

## 4. Agent / 平台 / 发版如何多赢

### 4.1 三方节奏冲突

| 角色 | 需要 | 不能被绑住 |
| --- | --- | --- |
| Agent | 当天交付可用卡片 | 等平台加 CSS、等 Web 发版 |
| 平台 | 小而稳的 profile | 被每张卡的私有样式打穿 |
| Web 发版 | 按自己节奏 bump 依赖 | 被“这张卡明天上线”绑架发车 |

### 4.2 解法：把大多数变更截在第一层

```text
Tier 0  标准 AC + HostConfig
        零耦合，任意 Web 版本可用

Tier 1  已发布平台组件词汇表
        复用现成 CSS，不改 profile

Tier 2  卡内一次性标准 AC 拼装
        不占用 octo-* 前缀，不进 profile
        效果可降档，但当天可交付

禁止     Agent 直接修改 render-profiles/
```

经验目标：

- ~70% 需求停在 Tier 0
- ~25% 停在 Tier 1
- ~5% 走 Tier 2，并记为候选模式

### 4.3 优雅降级是强制契约

带 `octo-*` ID 的元素，去掉 Profile CSS 后必须仍是可读的标准 AC 呈现。

例如 badge：

```json
{
  "type": "TextBlock",
  "id": "octo-badge-warning-request-state",
  "text": "待你处理",
  "size": "Small",
  "weight": "Bolder",
  "color": "Warning"
}
```

有 CSS 时是胶囊标签；无 CSS 时仍是小字号、加粗、Warning 色 TextBlock。

这条规则买到的是发版解耦：

- 新卡可领先于旧 Web profile
- Web 回滚 profile 不打碎卡片功能
- 私有化版本错配最多损失美观，不损失可用性

### 4.4 发布列车

新组件不跟单卡发布，而跟 profile 发布列车：

```text
Tier 2 候选模式反复出现
  → 平台晋升为 family/variant
  → 新 profile 版本四处落位
  → npm 发包
  → octo-web 在正常发版中 bump 精确依赖
  → 旧卡不可变；新卡直接用；旧卡若迁移则出新 card version
```

profile 按固定低频节奏发正式版，例如每月最多一版；候选 RC 可更密，但不被单卡阻塞触发。

## 5. 组件 ID 文法与 CSS 规则

### 5.1 固定三段式

```text
octo-<family>-<variant>-<free-suffix>
```

| 段 | 约束 |
| --- | --- |
| `family` | 封闭集，平台维护 |
| `variant` | 封闭集，可用短横线分词，但互不为前缀 |
| `free-suffix` | 卡内保证唯一；内容不限；永不进入 CSS 匹配 |

推荐示例：

```text
octo-badge-warning-request-state
octo-surface-header-accent-main
```

### 5.2 CSS 只匹配到 variant

允许：

```css
.octo-card-profile [id^="octo-badge-"] { ... }
.octo-card-profile [id^="octo-badge-warning-"] { ... }
```

禁止：

```css
.octo-card-profile [id^="octo-badge-warning-request-state"] { ... }
.octo-card-profile #deny_panel { ... }
```

### 5.3 base 管几何，variant 只管着色

```css
/* base：结构与盒模型，全家族唯一一份 */
.octo-card-profile [id^="octo-badge-"] {
  width: fit-content;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--octo-card-badge-bg-neutral);
}

/* variant：只覆盖颜色类 token */
.octo-card-profile [id^="octo-badge-warning-"] {
  background: var(--octo-card-badge-bg-warning);
  color: var(--octo-card-badge-fg-warning);
}
```

规则：

1. base 在前，variant 在后，靠源顺序覆盖，不玩 specificity 技巧。
2. variant 只允许颜色 / 背景 / 边框色等着色属性。
3. 几何变化意味着新 family 或新轴，不塞进现有 variant。
4. 值必须来自 token；禁止业务硬编码色值长期散落。
5. 尽量避免 `!important`；仅在 SDK 内联样式无法覆盖时，对公开 `octo-surface-*` 语义规则允许有限例外。

### 5.4 tone 覆盖度上限

tone 轴锚定 Adaptive Cards 语义集合：

```text
neutral / accent / good / warning / attention
（可选 emphasis，对齐 Container.style）
```

原因：

1. 每个 variant 都能映射到标准 AC 兜底属性。
2. 禁止发明 AC 表达不了、也无法降级的 tone。
3. 业务态永不进 variant 名。

命名空间可一次定满，实现按需填充。当前 `octo-badge` 已发布
`neutral` / `accent` / `good` / `warning` / `attention`。

### 5.5 参数轴上限

一个 family 最多两轴。超过两轴，优先拆 family，而不是继续笛卡尔积膨胀。

两轴时：

- 所有合法组合必须在 `capabilities.json` 显式枚举
- 视觉回归必须覆盖全部组合
- 不写“任意组合都合法”

## 6. 机读词汇表与校验

### 6.1 `capabilities.json` 形态

在现有元素 / Action 白名单之外，增加组件声明：

```json
{
  "components": {
    "octo-badge": {
      "appliesTo": ["TextBlock"],
      "variants": {
        "neutral": {
          "fallback": {
            "size": "Small",
            "weight": "Bolder",
            "isSubtle": true
          }
        },
        "accent": {
          "fallback": {
            "size": "Small",
            "weight": "Bolder",
            "color": "Accent"
          }
        },
        "good": {
          "fallback": {
            "size": "Small",
            "weight": "Bolder",
            "color": "Good"
          }
        },
        "warning": {
          "fallback": {
            "size": "Small",
            "weight": "Bolder",
            "color": "Warning"
          }
        }
        "attention": {
          "fallback": {
            "size": "Small",
            "weight": "Bolder",
            "color": "Attention"
          }
        }
      }
    },
    "octo-surface": {
      "appliesTo": ["Container", "Column"],
      "variants": {
        "accent": {
          "fallback": {
            "style": "accent"
          }
        },
        "header-accent": {
          "fallback": {
            "style": "accent"
          }
        },
        "footer-default": {
          "fallback": {
            "style": "emphasis"
          }
        }
      }
    }
  }
}
```

字段语义：

- `appliesTo`：允许挂载的 AC 元素类型
- `variants`：封闭 variant 枚举
- `fallback`：无 CSS 时必须具备的标准属性

### 6.2 已落地的机检规则

1. `cli check` 编译样例后，所有 `octo-*` ID 必须匹配该卡 resolved Render Profile 的
   `components` 声明。
2. 元素 `type` 必须属于 `appliesTo`。
3. 若声明了 `fallback`，编译后的元素必须携带这些标准属性。
4. 卡 pin 的 Render Profile 版本必须包含所用组件。
5. `profile validate` 会检查 profile CSS 中的每个 `octo-*` 前缀都能在
   `capabilities.components` 中找到声明。
6. `profile validate` 会检查声明的每个 variant 都有对应 CSS 规则，且 variant 名互不为前缀。

仍待补：

- 基线页从 `capabilities.components` 自动生成 family × variant 样例。
- 基线页增加“无 Profile CSS”降级列。
- handoff 自动提取“使用的平台组件列表”和 Tier 2 候选模式。

### 6.3 Skill / handoff 目标规则

Skill 必须要求 Agent：

1. 先查当前 profile 的组件词汇表。
2. 按 Tier 0 → 1 → 2 分流。
3. 禁止直接改 `render-profiles/`。
4. 使用 `octo-*` 时同时写好 fallback 标准属性。
5. Tier 2 或重复视觉模式写入 handoff 的“候选组件模式”字段。

handoff 报告至少包含：

- 使用的平台组件列表
- 候选模式描述与出现位置
- 是否依赖尚未发布的 profile 能力

导出的 backend handoff ZIP 必须包含 resolved Render Profile 的
`render-profile/manifest.json` 与 `render-profile/capabilities.json`。Server 侧用
capabilities 做最终发送 / 更新前校验；Web 侧不从 handoff 取 CSS，而通过 profile npm
包加载同版本的 HostConfig、theme、stylesheet、tokens 与 capabilities。

## 6.4 Web / Server 资源边界

Render Profile 是跨仓资源契约，不只是 Forge 本地样式：

- **Forge**：维护 `render-profiles/<id>/` 当前 Profile 源码，生成 npm 包，并在 handoff
  中写入 resolved profile 与 capabilities。历史版本由制品库保存；Forge 本地 Catalog
  和默认校验不预览历史 Card Package。
- **Server**：接收或生成标准 Card JSON 时，应按 resolved profile capabilities 做最终校验；
  不解析 Profile CSS，不发明额外组件语义。
- **Web**：按精确 npm 版本加载同一 profile 的 HostConfig、theme、stylesheet、tokens
  与 capabilities；不要混用不同版本的资源。
- **业务 Producer**：只引用 card package / view / sample 契约，不直接依赖 CSS 选择器。

## 7. 组件晋升流程

### 7.1 默认路径

```text
新视觉需求
  → Tier 0：标准 AC
  → 不够 → Tier 1：已发布 octo-* 组件
  → 仍不够 → Tier 2：卡内一次性标准 AC 拼装
  → handoff 记录候选模式
```

### 7.2 晋升门槛

同一模式出现第 2 到第 3 次后，才提名晋升：

1. 起语义 family / variant 名
2. 确认可用 `[id^=]` + token CSS 实现
3. 确认无 CSS 降级可读
4. 四处同时落位：
   - profile CSS
   - `capabilities.json`
   - 组件基线页 + 视觉回归
   - Skill 词汇表 / 文档
5. 以新 profile 版本发布，不原地修改已发布目录

### 7.3 废弃

- 已发布 profile 不可变，旧组件规则随旧版本保留
- 新 profile 可将 variant 标为 `deprecated`
- 旧卡不强制迁移；需要迁移时创建新 card version

## 8. 与现有实现的差距

已有：

- CLI / Skill 分层
- `octo-surface` / `octo-badge` 机读声明与实际用法
- 组件基线页
- profile 不可变版本目录与 bundle / pack
- CSS scope 与业务选择器禁令的方向
- `cli check` 组件 ID / appliesTo / fallback 校验
- `profile validate` CSS 与 components 声明对账
- handoff 导出 resolved Render Profile manifest / capabilities

待落地：

1. 基线页从 `capabilities.components` 自动生成，并补充无 profile CSS 降级对照
2. handoff 自动提取平台组件使用列表与 Tier 2 候选模式
3. 明确 profile 正式版发布列车节奏
4. 收敛 surface 等规则对 `!important` 的依赖，尽量回到 token 化着色

## 9. 落地顺序建议

### 阶段 A：把约定写成协议

- 本文作为设计基线
- Skill 增加平台组件使用规则
- 架构入口挂上本文

### 阶段 B：机读与校验

- capabilities 增加 `components`（已落地）
- check 增加未知前缀拒绝、appliesTo、fallback、CSS 双向对账（已部分落地）
- 组件基线与 capabilities 对账（待补）

### 阶段 C：降级与发布节奏

- 基线页增加无 CSS 列
- profile 正式版发布列车制度化
- handoff 输出候选组件模式

## 10. 最终约束

1. CLI 拥有可机检事实；Skill 拥有不可机检判断。
2. 可断言规则不得只存在于 Skill。
3. 平台组件不得发明私有 Adaptive Cards `type`。
4. 组件 ID 必须是 `octo-<family>-<variant>-<free-suffix>`。
5. CSS 只匹配到 family / variant，不匹配 free-suffix。
6. tone 锚定 AC 语义色板；业务态不进组件名。
7. 组件必须可降级为标准 AC 呈现。
8. Agent 不得直接修改已发布或共享 profile CSS 来完成单卡需求。
9. 新组件按 rule-of-three 晋升，并随 profile 发布列车批量发布。
10. 旧卡、旧 profile、旧 Web 版本错配时，功能可用优先于视觉一致。
