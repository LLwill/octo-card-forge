import type { JsonObject, RenderCapabilities } from "@mlt-org/octo-card-cli-runtime";

export interface ComponentBaselineSection {
  id: string;
  title: string;
  description: string;
  card?: JsonObject;
  rows?: StyleMatrixRow[];
  utilityTokens?: UtilityTokenSpecimen[];
}

export interface StyleMatrixRow {
  name: string;
  value: string;
  description: string;
  preview: "text" | "color" | "spacing" | "radius";
}

export interface UtilityTokenSpecimen {
  token: string;
  group: string;
  description: string;
  appliesTo: string[];
  fallback?: JsonObject;
  card: JsonObject;
}

export interface ComponentBaselineGroup {
  id: string;
  title: string;
  description: string;
  sections: ComponentBaselineSection[];
}

function adaptiveCard(body: JsonObject[], actions?: JsonObject[]): JsonObject {
  return {
    type: "AdaptiveCard",
    version: "1.5",
    body,
    ...(actions && actions.length > 0 ? { actions } : {}),
  };
}

function supportsElement(capabilities: RenderCapabilities, type: string): boolean {
  return capabilities.allowedElements.includes(type);
}

function supportsAction(capabilities: RenderCapabilities, type: string): boolean {
  return capabilities.allowedActions.includes(type);
}

export function buildFoundationSections(): ComponentBaselineSection[] {
  return [
    {
      id: "foundation-typography",
      title: "Typography scale",
      description: "基础字号和字重，用于判断正文、辅助信息和标题的默认层级。",
      rows: [
        { name: "Small", value: "TextBlock.size", description: "辅助信息、时间、来源", preview: "text" },
        { name: "Default", value: "TextBlock.size", description: "正文和普通说明", preview: "text" },
        { name: "Medium", value: "TextBlock.size", description: "小标题和关键字段", preview: "text" },
        { name: "Large", value: "TextBlock.size", description: "卡片标题", preview: "text" },
        { name: "Bolder", value: "TextBlock.weight", description: "标题、状态、关键值", preview: "text" },
      ],
    },
    {
      id: "foundation-colors",
      title: "Semantic colors",
      description: "语义色只表达状态，不表达业务；业务状态应映射到这些固定语义。",
      rows: [
        { name: "Default", value: "text/default", description: "主体文字", preview: "color" },
        { name: "Accent", value: "text/accent", description: "品牌强调、链接入口", preview: "color" },
        { name: "Good", value: "text/good", description: "成功、通过、完成", preview: "color" },
        { name: "Warning", value: "text/warning", description: "待处理、警告、需注意", preview: "color" },
        { name: "Attention", value: "text/attention", description: "危险、失败、阻断", preview: "color" },
      ],
    },
    {
      id: "foundation-layout",
      title: "Spacing and radius",
      description: "默认间距和圆角提供舒适度；具体卡片优先用标准 spacing 和显式 utility。",
      rows: [
        { name: "Small", value: "spacing", description: "紧密关联的信息", preview: "spacing" },
        { name: "Medium", value: "spacing", description: "普通段落分隔", preview: "spacing" },
        { name: "Large", value: "spacing", description: "主要内容区分隔", preview: "spacing" },
        { name: "card radius", value: "8px", description: "卡片外壳圆角", preview: "radius" },
        { name: "container radius", value: "6px", description: "内容容器圆角", preview: "radius" },
      ],
    },
  ];
}

function sampleCardForUtility(token: string, group: string): JsonObject {
  if (token === "badge-warning") {
    return adaptiveCard([
      {
        type: "TextBlock",
        id: "octo--badge-warning--uid-sample-badge-warning",
        text: "Warning badge",
        size: "Small",
        weight: "Bolder",
        color: "Warning",
      },
    ]);
  }

  if (token === "line-skeleton") {
    return adaptiveCard([
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "Container",
                id: "octo--line-skeleton--uid-sample-line-skeleton-main",
                items: [],
              },
            ],
          },
          {
            type: "Column",
            width: "96px",
            items: [
              {
                type: "Container",
                id: "octo--line-skeleton--uid-sample-line-skeleton-short",
                items: [],
              },
            ],
          },
        ],
      },
    ]);
  }

  if (token === "motion-shimmer") {
    return adaptiveCard([
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "Container",
                id: "octo--line-skeleton--motion-shimmer--uid-sample-motion-shimmer-main",
                items: [],
              },
            ],
          },
          {
            type: "Column",
            width: "80px",
            items: [
              {
                type: "Container",
                id: "octo--line-skeleton--motion-shimmer--uid-sample-motion-shimmer-short",
                items: [],
              },
            ],
          },
        ],
      },
    ]);
  }

  if (token === "motion-fade-in") {
    return adaptiveCard([
      {
        type: "Container",
        id: "octo--surface-subtle--inset-md--motion-fade-in--uid-sample-motion-fade-in",
        style: "emphasis",
        items: [
          {
            type: "TextBlock",
            text: "motion-fade-in",
            weight: "Bolder",
            wrap: true,
          },
          {
            type: "TextBlock",
            text: "新内容出现时的轻量动效。",
            isSubtle: true,
            spacing: "Small",
            wrap: true,
          },
        ],
      },
    ]);
  }

  if (token === "inset-md") {
    return adaptiveCard([
      {
        type: "Container",
        id: "octo--surface-subtle--inset-md--uid-sample-inset-md",
        style: "emphasis",
        items: [
          {
            type: "TextBlock",
            text: "inset-md",
            weight: "Bolder",
            wrap: true,
          },
          {
            type: "TextBlock",
            text: "显式选择中等内部留白。",
            isSubtle: true,
            spacing: "Small",
            wrap: true,
          },
        ],
      },
    ]);
  }

  if (group === "surface") {
    const style = token === "surface-warning" ? "warning" : "emphasis";
    return adaptiveCard([
      {
        type: "Container",
        id: `octo--${token}--inset-md--uid-sample-${token}`,
        style,
        items: [
          {
            type: "TextBlock",
            text: token,
            weight: "Bolder",
            wrap: true,
          },
          {
            type: "TextBlock",
            text: "通用内容表面。",
            isSubtle: true,
            spacing: "Small",
            wrap: true,
          },
        ],
      },
    ]);
  }

  return adaptiveCard([
    {
      type: "TextBlock",
      text: token,
      wrap: true,
    },
  ]);
}

export function buildComponentBaseline(
  capabilities: RenderCapabilities
): ComponentBaselineSection[] {
  const sections: ComponentBaselineSection[] = [];

  sections.push({
    id: "typography",
    title: "文字与语义色",
    description: "TextBlock、RichTextBlock、字号、字重以及标准前景语义。",
    card: adaptiveCard([
      ...(["Small", "Default", "Medium", "Large", "ExtraLarge"] as const).map(
        (size) => ({
          type: "TextBlock",
          text: `${size} · Octo Card 组件基线`,
          size,
          wrap: true,
          spacing: size === "Small" ? "None" : "Small",
        })
      ),
      {
        type: "TextBlock",
        text: "Bolder · 用于标题和关键数据",
        weight: "Bolder",
        wrap: true,
      },
      ...(supportsElement(capabilities, "RichTextBlock")
        ? [
            {
              type: "RichTextBlock",
              inlines: [
                { type: "TextRun", text: "Default  " },
                { type: "TextRun", text: "Accent  ", color: "Accent" },
                { type: "TextRun", text: "Good  ", color: "Good" },
                { type: "TextRun", text: "Warning  ", color: "Warning" },
                { type: "TextRun", text: "Attention", color: "Attention" },
              ],
            },
          ]
        : []),
    ]),
  });

  sections.push({
    id: "containers",
    title: "容器语义",
    description: "六种标准 Container.style。颜色由 HostConfig 统一提供。",
    card: adaptiveCard(
      ["default", "emphasis", "accent", "good", "warning", "attention"].map(
        (style) => ({
          type: "Container",
          style,
          spacing: style === "default" ? "None" : "Medium",
          items: [
            {
              type: "TextBlock",
              text: style,
              weight: "Bolder",
              wrap: true,
            },
            {
              type: "TextBlock",
              text: "默认文字 / subtle 辅助文字",
              isSubtle: true,
              spacing: "Small",
              wrap: true,
            },
          ],
        })
      )
    ),
  });

  sections.push({
    id: "semantic-primitives",
    title: "显式视觉语义",
    description: "卡片通过公开的 octo-surface / octo-badge ID 前缀显式选择背景和紧凑标签，不依赖元素位置推断。",
    card: adaptiveCard([
      {
        type: "Container",
        id: "octo-surface-header-accent-baseline",
        style: "accent",
        items: [
          {
            type: "TextBlock",
            text: "Accent surface",
            weight: "Bolder",
            wrap: true,
          },
        ],
      },
      {
        type: "Container",
        id: "octo-surface-footer-default-baseline",
        style: "emphasis",
        bleed: true,
        separator: true,
        spacing: "Large",
        items: [
          {
            type: "TextBlock",
            text: "Full-width footer separator",
            isSubtle: true,
            wrap: true,
          },
        ],
      },
      {
        type: "ColumnSet",
        spacing: "Large",
        columns: [
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                id: "octo-badge-warning-baseline",
                text: "Warning badge",
                color: "Warning",
                weight: "Bolder",
                size: "Small",
              },
            ],
          },
          {
            type: "Column",
            width: "auto",
            spacing: "Small",
            items: [
              {
                type: "TextBlock",
                id: "octo-badge-neutral-baseline",
                text: "Neutral badge",
                isSubtle: true,
                weight: "Bolder",
                size: "Small",
              },
            ],
          },
        ],
      },
      {
        type: "ColumnSet",
        spacing: "Small",
        columns: [
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                id: "octo-badge-accent-baseline",
                text: "Accent badge",
                color: "Accent",
                weight: "Bolder",
                size: "Small",
              },
            ],
          },
          {
            type: "Column",
            width: "auto",
            spacing: "Small",
            items: [
              {
                type: "TextBlock",
                id: "octo-badge-good-baseline",
                text: "Good badge",
                color: "Good",
                weight: "Bolder",
                size: "Small",
              },
            ],
          },
          {
            type: "Column",
            width: "auto",
            spacing: "Small",
            items: [
              {
                type: "TextBlock",
                id: "octo-badge-attention-baseline",
                text: "Attention badge",
                color: "Attention",
                weight: "Bolder",
                size: "Small",
              },
            ],
          },
        ],
      },
    ]),
  });

  sections.push({
    id: "layout",
    title: "布局、间距与分隔",
    description: "ColumnSet、固定/自适应列、Spacing 与 Separator 的组合基线。",
    card: adaptiveCard([
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "auto",
            style: "emphasis",
            items: [{ type: "TextBlock", text: "auto", wrap: true }],
          },
          {
            type: "Column",
            width: "stretch",
            style: "accent",
            spacing: "Medium",
            items: [{ type: "TextBlock", text: "stretch", wrap: true }],
          },
          {
            type: "Column",
            width: 1,
            style: "good",
            spacing: "Medium",
            items: [{ type: "TextBlock", text: "weight 1", wrap: true }],
          },
        ],
      },
      {
        type: "TextBlock",
        text: "Separator + Large spacing",
        separator: true,
        spacing: "Large",
        wrap: true,
      },
      {
        type: "Container",
        style: "emphasis",
        bleed: true,
        spacing: "Large",
        items: [
          {
            type: "TextBlock",
            text: "Bleed container",
            horizontalAlignment: "Center",
            wrap: true,
          },
        ],
      },
    ]),
  });

  const mediaBody: JsonObject[] = [];
  if (
    supportsElement(capabilities, "Image") &&
    supportsElement(capabilities, "ImageSet")
  ) {
    mediaBody.push({
      type: "ImageSet",
      imageSize: "Medium",
      images: [
        {
          type: "Image",
          url: "https://api.iconify.design/lucide/image.svg?color=%236b7075",
          altText: "默认图片",
        },
        {
          type: "Image",
          url: "https://api.iconify.design/lucide/user-round.svg?color=%237f3bf5",
          altText: "圆形人物图片",
          style: "Person",
        },
      ],
    });
  }
  if (supportsElement(capabilities, "FactSet")) {
    mediaBody.push({
      type: "FactSet",
      spacing: "Large",
      facts: [
        { title: "HostConfig", value: "当前仓库基线" },
        { title: "SDK", value: "3.0.6" },
        { title: "宽度", value: "320 / 480 / 640" },
      ],
    });
  }
  sections.push({
    id: "media-facts",
    title: "图片与事实列表",
    description: "Image、ImageSet、Person 样式和 FactSet。",
    card: adaptiveCard(mediaBody),
  });

  if (supportsElement(capabilities, "Table")) {
    sections.push({
      id: "table",
      title: "表格",
      description: "表头、网格线、列宽和长文本换行。",
      card: adaptiveCard([
        {
          type: "Table",
          firstRowAsHeaders: true,
          showGridLines: true,
          columns: [{ width: 1 }, { width: 2 }, { width: 1 }],
          rows: [
            ["组件", "用途", "状态"],
            ["Input.Text", "接收单行或多行文本", "支持"],
            ["Action.Submit", "提交标准卡片动作", "支持"],
          ].map((row) => ({
            type: "TableRow",
            cells: row.map((text) => ({
              type: "TableCell",
              items: [{ type: "TextBlock", text, size: "Small", wrap: true }],
            })),
          })),
        },
      ]),
    });
  }

  const basicInputs: JsonObject[] = [];
  if (supportsElement(capabilities, "Input.Text")) {
    basicInputs.push(
      {
        type: "Input.Text",
        id: "baseline_text",
        label: "单行文本",
        placeholder: "请输入内容",
      },
      {
        type: "Input.Text",
        id: "baseline_multiline",
        label: "多行文本",
        placeholder: "请输入补充说明",
        isMultiline: true,
      }
    );
  }
  if (supportsElement(capabilities, "Input.Number")) {
    basicInputs.push({
      type: "Input.Number",
      id: "baseline_number",
      label: "数字",
      value: 8,
    });
  }
  if (supportsElement(capabilities, "Input.Date")) {
    basicInputs.push({
      type: "Input.Date",
      id: "baseline_date",
      label: "日期",
    });
  }
  if (supportsElement(capabilities, "Input.Time")) {
    basicInputs.push({
      type: "Input.Time",
      id: "baseline_time",
      label: "时间",
    });
  }
  if (supportsElement(capabilities, "Input.Toggle")) {
    basicInputs.push({
      type: "Input.Toggle",
      id: "baseline_toggle",
      title: "我已阅读并确认",
      valueOn: "yes",
      valueOff: "no",
    });
  }
  sections.push({
    id: "inputs-basic",
    title: "基础输入控件",
    description: "Text、Number、Date、Time 与 Toggle 的默认状态。",
    card: adaptiveCard(basicInputs),
  });

  if (supportsElement(capabilities, "Input.ChoiceSet")) {
    sections.push({
      id: "inputs-choice",
      title: "选择控件",
      description: "Compact、Expanded 单选和 Expanded 多选。",
      card: adaptiveCard([
        {
          type: "Input.ChoiceSet",
          id: "baseline_choice_compact",
          label: "Compact",
          style: "compact",
          value: "one",
          choices: [
            { title: "选项一", value: "one" },
            { title: "选项二", value: "two" },
          ],
        },
        {
          type: "Input.ChoiceSet",
          id: "baseline_choice_expanded",
          label: "Expanded 单选",
          style: "expanded",
          value: "one",
          choices: [
            { title: "首选方案", value: "one" },
            { title: "备选方案", value: "two" },
          ],
        },
        {
          type: "Input.ChoiceSet",
          id: "baseline_choice_multi",
          label: "Expanded 多选",
          style: "expanded",
          isMultiSelect: true,
          value: "one,two",
          choices: [
            { title: "能力一", value: "one" },
            { title: "能力二", value: "two" },
          ],
        },
      ]),
    });
  }

  const submitActions: JsonObject[] = [];
  if (supportsAction(capabilities, "Action.Submit")) {
    submitActions.push(
      {
        type: "Action.Submit",
        id: "baseline_submit_default",
        title: "默认操作",
        associatedInputs: "none",
      },
      {
        type: "Action.Submit",
        id: "baseline_submit_positive",
        title: "确认",
        style: "positive",
        associatedInputs: "none",
      },
      {
        type: "Action.Submit",
        id: "baseline_submit_destructive",
        title: "删除",
        style: "destructive",
        associatedInputs: "none",
      }
    );
  }
  const utilityActions: JsonObject[] = [];
  if (supportsAction(capabilities, "Action.OpenUrl")) {
    utilityActions.push({
      type: "Action.OpenUrl",
      title: "打开链接",
      url: "https://adaptivecards.io",
    });
  }
  if (supportsAction(capabilities, "Action.ToggleVisibility")) {
    utilityActions.push({
      type: "Action.ToggleVisibility",
      title: "展开内容",
      targetElements: ["baseline_toggle_target"],
    });
  }
  sections.push({
    id: "actions",
    title: "操作按钮",
    description: "Submit 的默认/正向/危险样式，以及 OpenUrl、ToggleVisibility。",
    card: adaptiveCard([
      ...(submitActions.length > 0
        ? [
            {
              type: "TextBlock",
              text: "Submit styles",
              size: "Small",
              isSubtle: true,
              wrap: true,
            },
            { type: "ActionSet", actions: submitActions },
          ]
        : []),
      ...(utilityActions.length > 0
        ? [
            {
              type: "TextBlock",
              text: "Navigation / visibility",
              size: "Small",
              isSubtle: true,
              spacing: "Large",
              wrap: true,
            },
            { type: "ActionSet", actions: utilityActions },
          ]
        : []),
      ...(supportsAction(capabilities, "Action.ToggleVisibility")
        ? [
        {
          type: "Container",
          id: "baseline_toggle_target",
          style: "emphasis",
          isVisible: false,
          items: [
            {
              type: "TextBlock",
              text: "ToggleVisibility 展开的标准内容",
              wrap: true,
            },
          ],
        },
          ]
        : []),
    ]),
  });

  return sections;
}

export function buildCompositionSections(): ComponentBaselineSection[] {
  return [
    {
      id: "pattern-skeleton-preview",
      title: "Skeleton preview",
      description: "占位骨架通过 line-skeleton + motion-shimmer 表达，宽度由 ColumnSet 控制。",
      card: adaptiveCard([
        {
          type: "Container",
          id: "octo--surface-subtle--inset-md--uid-pattern-skeleton-shell",
          style: "emphasis",
          items: [
            {
              type: "ColumnSet",
              columns: [
                {
                  type: "Column",
                  width: "stretch",
                  items: [
                    {
                      type: "Container",
                      id: "octo--line-skeleton--motion-shimmer--uid-pattern-skeleton-main",
                      items: [],
                    },
                  ],
                },
                {
                  type: "Column",
                  width: "88px",
                  items: [
                    {
                      type: "Container",
                      id: "octo--line-skeleton--motion-shimmer--uid-pattern-skeleton-short",
                      items: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    },
    {
      id: "pattern-status-block",
      title: "Status block",
      description: "状态区由 surface + inset + badge 组合，业务状态映射到通用语义。",
      card: adaptiveCard([
        {
          type: "Container",
          id: "octo--surface-warning--inset-md--uid-pattern-status",
          style: "warning",
          items: [
            {
              type: "TextBlock",
              id: "octo--badge-warning--uid-pattern-status-badge",
              text: "Pending",
              size: "Small",
              weight: "Bolder",
              color: "Warning",
            },
            {
              type: "TextBlock",
              text: "需要用户确认后继续。",
              spacing: "Small",
              wrap: true,
            },
          ],
        },
      ]),
    },
  ];
}

export function buildUtilityTokenSections(
  capabilities: RenderCapabilities
): ComponentBaselineSection[] {
  const utilities = capabilities.utilities ?? {};
  const groups = new Map<string, UtilityTokenSpecimen[]>();
  for (const [token, definition] of Object.entries(utilities)) {
    const specimens = groups.get(definition.group) ?? [];
    specimens.push({
      token,
      group: definition.group,
      description: definition.description,
      appliesTo: definition.appliesTo,
      fallback: definition.fallback,
      card: sampleCardForUtility(token, definition.group),
    });
    groups.set(definition.group, specimens);
  }

  const groupOrder = [
    "surface",
    "badge",
    "inset",
    "line",
    "motion",
  ];
  return [...groups.entries()]
    .sort(
      ([left], [right]) =>
        (groupOrder.includes(left) ? groupOrder.indexOf(left) : groupOrder.length) -
          (groupOrder.includes(right) ? groupOrder.indexOf(right) : groupOrder.length) ||
        left.localeCompare(right)
    )
    .map(([group, specimens]) => ({
      id: `utility-${group}`,
      title: `${group} utilities`,
      description: `已发布 ${group} 组 utility token。token 可以组合，但同组不能在同一元素上重复使用。`,
      utilityTokens: specimens.sort((a, b) => a.token.localeCompare(b.token)),
    }));
}

export function buildComponentBaselineGroups(
  capabilities: RenderCapabilities
): ComponentBaselineGroup[] {
  return [
    {
      id: "foundation",
      title: "Foundation",
      description:
        "先看基础尺度：字号、语义色、间距和圆角。这些是所有 Adaptive Card 默认美化和 utility 的共同底座。",
      sections: buildFoundationSections(),
    },
    {
      id: "adaptive-card-components",
      title: "Adaptive Card Defaults",
      description:
        "展示标准 Adaptive Cards 元素经过 octo-chat HostConfig 和默认 Profile CSS 后的基础效果。",
      sections: buildComponentBaseline(capabilities),
    },
    {
      id: "octo-utility-tokens",
      title: "Octo Utility Tokens",
      description:
        "展示类似 Tailwind CSS 的受控样式 token，以及不同 utility 名称对应的呈现效果。",
      sections: buildUtilityTokenSections(capabilities),
    },
    {
      id: "composition-patterns",
      title: "Composition Patterns",
      description:
        "展示多个 utility 与标准 Adaptive Card 结构如何组合成可复用的卡片片段。",
      sections: buildCompositionSections(),
    },
  ];
}
