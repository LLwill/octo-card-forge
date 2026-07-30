# Octo Card Motion Scale 调研与落地建议

> 状态：调研方案  
> 适用范围：`octo-chat` Render Profile、Card Package、Agent Skill  
> 目标：在不扩展 Adaptive Card 协议的前提下，用类似 CSS utility / Tailwind 的方式，为卡片提供少量、克制、可降级的动效增强。

## 1. 结论

Octo 可以引入 **Motion Scale**，但不应把它做成复杂动画系统。

推荐路径：

```text
标准 Adaptive Card JSON
  + 已声明的 octo-motion-* element id
  + octo-chat Render Profile CSS
  + prefers-reduced-motion 降级
  -> 轻量动效增强
```

第一阶段只做 CSS，不引入 JS 动画库，不新增 Adaptive Card schema 字段，不让 Agent 自由写动画参数。

推荐内置 4 个 primitive：

```text
octo-motion-fade-in-*
octo-motion-slide-up-*
octo-motion-pulse-once-*
octo-motion-shimmer-*
```

其中 `shimmer` 只用于 loading / skeleton 场景；普通业务状态不应使用持续动画。

## 2. 协议边界

Adaptive Card 仍然只传标准 JSON。Motion 不进入协议字段：

```json
{
  "type": "TextBlock",
  "text": "处理中",
  "animation": "pulse"
}
```

上面这种不允许。

允许的方式是沿用当前 Render Profile component primitive：

```json
{
  "type": "TextBlock",
  "id": "octo-motion-pulse-once-processing",
  "text": "处理中",
  "color": "Accent"
}
```

对不支持 `octo-chat` Profile CSS 的宿主来说，这仍然是普通 Adaptive Card 元素。动效只是 Web Render Profile 的增强。

## 3. 可参考项目

| 项目 | 值得参考 | 不建议照搬 |
| --- | --- | --- |
| Tailwind CSS animation utilities | 少量默认 utility、固定命名、可被 Agent 稳定选择 | 不把 Tailwind class 写入 Card JSON |
| Animate.css | 纯 CSS、变量化、reduced-motion 意识 | 不引入全量动画库，不开放装饰型动画 |
| Open Props | motion token / easing / animation custom properties | 不引入整套 token，先吸收变量组织方式 |
| Motion One / Framer Motion | 复杂交互、编排、手势、未来参考 | 第一阶段不引入 JS runtime |
| Fluent / Material motion guidance | 功能性、短时、低干扰 motion 原则 | 不追求完整 App Motion 体系 |

### 3.1 Tailwind CSS

参考点：

- 用少量命名 utility 表达常见动效：`animate-spin`、`animate-ping`、`animate-pulse`、`animate-bounce`。
- 使用固定 token，而不是让开发者随便写 duration / easing。
- utility 是组合能力，不承担业务语义。

对 Octo 的启发：

```text
Tailwind: animate-pulse
Octo:     octo-motion-pulse-once-*
```

我们不直接使用 Tailwind class，因为 Card JSON 不是 HTML class 载体；但可以借鉴它的 “有限命名 + 默认参数”。

### 3.2 Animate.css

参考点：

- 完全 CSS 化，使用 class 触发。
- 动画族非常丰富，但生产使用时应只挑少量。
- 支持通过 CSS 变量调整 duration / delay / repeat。
- 文档明确考虑 `prefers-reduced-motion`。

对 Octo 的启发：

- 不引入运行时。
- 不暴露完整动画库给 Agent。
- 只吸收变量化和 reduced-motion 的实现方式。

不建议：

- 不要引入 Animate.css 全量 class。
- 不要开放 `bounce`、`rubberBand`、`wobble` 这类装饰型动画。

### 3.3 Open Props

参考点：

- 把 easing、duration、animation name 作为 CSS custom properties。
- 适合设计系统把 motion token 统一管理。

对 Octo 的启发：

在 `theme.css` 或 `styles.css` 中定义：

```css
--octo-motion-duration-fast: 120ms;
--octo-motion-duration-base: 180ms;
--octo-motion-duration-slow: 240ms;
--octo-motion-ease-out: cubic-bezier(.2, 0, 0, 1);
--octo-motion-ease-pulse: cubic-bezier(.4, 0, .2, 1);
```

Agent 不需要知道这些值，只选择 motion primitive。

### 3.4 Motion One / Framer Motion

参考点：

- 适合复杂交互、编排、手势、进入退出生命周期。

对 Octo 的判断：

第一阶段不需要。Adaptive Card 场景里，我们的目标只是轻量增强，不是做复杂交互动画。

可以作为未来参考，但不应进入当前实现。

### 3.5 Fluent / Material Motion

参考点：

- 动效要服务状态变化和空间关系。
- 常见 UI 动画应短、轻、可预测。
- 进入 / 退出 / 状态反馈有明确 duration 和 easing 约束。

对 Octo 的启发：

- `fade-in` 用于新卡片或新结果出现。
- `slide-up` 用于新增局部内容。
- `pulse-once` 用于状态刚变化后的短反馈。
- 避免长循环、强装饰、影响阅读的动画。

## 4. Agent 友好原则

Motion Scale 必须让 Agent 容易选择，不能要求 Agent 设计动画。

Agent 只回答三个问题：

```text
1. 这个元素是否需要动效增强？
2. 动效属于进入、状态反馈，还是加载占位？
3. 是否有可读文本和静态 fallback？
```

然后选择：

| 场景 | 推荐 primitive | 说明 |
| --- | --- | --- |
| 卡片首次出现 | `octo-motion-fade-in-*` | 最安全，默认短时一次 |
| 新增局部内容 | `octo-motion-slide-up-*` | 用于结果、摘要、展开内容 |
| 状态刚变化 | `octo-motion-pulse-once-*` | 只执行一次，不循环 |
| loading 占位 | `octo-motion-shimmer-*` | 仅 skeleton/loading，不能用于正文 |

禁止 Agent 自定义：

- duration；
- delay；
- iteration count；
- keyframes；
- cubic-bezier；
- 业务专属 motion variant。

## 5. 第一阶段 Motion Primitive

### 5.1 `fade-in`

用途：

- 新卡片出现；
- 结果区域出现；
- 非关键辅助信息出现。

建议 CSS：

```css
@keyframes octo-motion-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.octo-card-profile [id^="octo-motion-fade-in-"] {
  animation: octo-motion-fade-in var(--octo-motion-duration-base) var(--octo-motion-ease-out) both;
}
```

### 5.2 `slide-up`

用途：

- 新增内容块；
- 展开后显示的局部内容；
- 生成结果进入。

建议 CSS：

```css
@keyframes octo-motion-slide-up {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.octo-card-profile [id^="octo-motion-slide-up-"] {
  animation: octo-motion-slide-up var(--octo-motion-duration-base) var(--octo-motion-ease-out) both;
}
```

### 5.3 `pulse-once`

用途：

- 状态刚进入运行中、已完成、需确认；
- badge 或状态文字短反馈。

注意：

- 只执行一次。
- 不用于长时间表达“正在进行”。

建议 CSS：

```css
@keyframes octo-motion-pulse-once {
  0% { transform: scale(1); }
  45% { transform: scale(1.025); }
  100% { transform: scale(1); }
}

.octo-card-profile [id^="octo-motion-pulse-once-"] {
  animation: octo-motion-pulse-once var(--octo-motion-duration-slow) var(--octo-motion-ease-pulse) both;
}
```

### 5.4 `shimmer`

用途：

- skeleton；
- loading placeholder；
- 等待生成内容的占位块。

注意：

- 不用于真实正文。
- 不用于按钮。
- 不应长期留在最终结果卡中。

建议 CSS：

```css
@keyframes octo-motion-shimmer {
  from { background-position: 120% 0; }
  to { background-position: -120% 0; }
}

.octo-card-profile [id^="octo-motion-shimmer-"] {
  color: transparent !important;
  border-radius: 6px;
  background:
    linear-gradient(90deg, rgba(28,28,35,.06), rgba(28,28,35,.11), rgba(28,28,35,.06));
  background-size: 240% 100%;
  animation: octo-motion-shimmer 1.2s linear infinite;
}
```

## 6. Accessibility / 降级

必须内置：

```css
@media (prefers-reduced-motion: reduce) {
  .octo-card-profile [id^="octo-motion-"] {
    animation: none !important;
    transition: none !important;
  }
}
```

规则：

1. 动画不能是唯一状态表达。
2. 文本、颜色、badge、结构必须能独立表达状态。
3. 持续动画只允许 loading，占位结束后必须移除。
4. 动画不能遮挡、移动、延迟业务操作。

## 7. Profile 能力声明

在 `capabilities.json` 中新增一个 family：

```json
{
  "components": {
    "octo-motion": {
      "appliesTo": [
        "Container",
        "Column",
        "TextBlock",
        "ActionSet"
      ],
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

说明：

- `fallback` 为空是可接受的，因为 motion 不改变静态语义。
- `check` 已经会拒绝未知 `octo-*` family / variant。
- 若未来要让 `shimmer` 只允许 `TextBlock` / `Container`，需要扩展 component validation，目前 family 级 `appliesTo` 不能为不同 variant 设置不同元素范围。

## 8. Skill 使用规则

Agent 生成卡片时：

```text
默认不用动画。
只有当用户明确在等待、生成、状态变化、结果进入时，才考虑 motion。
```

推荐决策树：

```text
是否 loading?
  yes -> shimmer
  no
是否新内容进入?
  yes -> fade-in 或 slide-up
  no
是否状态刚变化且已有文字状态?
  yes -> pulse-once
  no -> 不用 motion
```

禁止：

- 为普通静态字段加动画；
- 同一个卡片超过 2 个 motion 元素；
- 对长正文使用 pulse；
- 对按钮使用 shimmer；
- 使用未声明的 `octo-motion-*` variant。

## 9. 推荐实施顺序

### Phase 1：文档与能力声明

1. 新增本文档。
2. 更新 Skill，说明 Motion Scale 是可选增强。
3. 在 `capabilities.json` 声明 `octo-motion`。
4. 在 `styles.css` 加 CSS keyframes、变量、reduced-motion。
5. 更新 `/components` baseline，展示 motion primitive。

验收：

```bash
pnpm cli profile validate octo-chat@latest
pnpm test
pnpm cli check --strict-profile --format json
```

### Phase 2：一个真实场景试点

优先选择：

- reasoning / tool call 新增行；
- loading skeleton；
- 状态 badge 切换。

不建议先拿 Token 卡做动画。Token 卡是安全/敏感展示，不应该通过动效增强存在感。

### Phase 3：再决定是否扩展

只有当多个卡片稳定需要时，再考虑：

```text
octo-motion-expand
octo-motion-collapse
octo-state-live-dot
```

否则不要扩。

## 10. 最终建议

这条路可行，但必须克制：

```text
Comfort Scale 解决默认静态舒适度
Motion Scale 解决少量状态反馈
Recipe 解决结构选择
Profile CSS 解决增强呈现
Adaptive Card JSON 保持标准
```

第一阶段只做：

```text
fade-in
slide-up
pulse-once
shimmer
```

并且默认不用动画。Motion 是增强，不是卡片质量的主要来源。

## 11. 参考资料

- [Tailwind CSS Animation utilities](https://tailwindcss.com/docs/animation)
- [Animate.css documentation](https://animate.style/)
- [Open Props](https://open-props.style/)
- [Motion documentation](https://motion.dev/docs)
- [Adaptive Cards Schema Explorer](https://adaptivecards.io/explorer/)
- [Adaptive Cards HostConfig](https://learn.microsoft.com/en-us/adaptive-cards/rendering-cards/host-config)
- [Action.ToggleVisibility](https://learn.microsoft.com/en-us/adaptive-cards/schema-explorer/action-toggle-visibility)
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)
- [WCAG 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html)
- [WCAG 2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html)
