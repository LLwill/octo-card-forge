function supports(capabilities, type) {
  return capabilities.allowedElements.includes(type);
}

function supportsAction(capabilities, type) {
  return capabilities.allowedActions.includes(type);
}

function section(title, items, style = "default") {
  return {
    type: "Container",
    style,
    spacing: "Large",
    items: [
      {
        type: "TextBlock",
        text: title,
        size: "Medium",
        weight: "Bolder",
        wrap: true,
      },
      ...items,
    ],
  };
}

export function buildComponentGallery(capabilities, reference) {
  const body = [
    {
      type: "TextBlock",
      text: "原生 Adaptive Card 组件样式",
      size: "ExtraLarge",
      weight: "Bolder",
      wrap: true,
    },
    {
      type: "TextBlock",
      text: `Render Profile · ${reference}`,
      isSubtle: true,
      spacing: "Small",
      wrap: true,
    },
  ];

  body.push(
    section("TextBlock / RichTextBlock", [
      {
        type: "TextBlock",
        text: "Small · Default · Medium · Large · ExtraLarge",
        size: "Small",
        isSubtle: true,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "正文文本与 **Bolder** 强调样式",
        wrap: true,
      },
      ...(supports(capabilities, "RichTextBlock")
        ? [
            {
              type: "RichTextBlock",
              inlines: [
                { type: "TextRun", text: "Accent  ", color: "Accent" },
                { type: "TextRun", text: "Good  ", color: "Good" },
                { type: "TextRun", text: "Warning  ", color: "Warning" },
                { type: "TextRun", text: "Attention", color: "Attention" },
              ],
            },
          ]
        : []),
    ])
  );

  body.push(
    section("Container Styles", [
      {
        type: "ColumnSet",
        columns: ["default", "emphasis", "accent", "good", "warning", "attention"].map(
          (style) => ({
            type: "Column",
            width: "stretch",
            style,
            items: [
              {
                type: "TextBlock",
                text: style,
                size: "Small",
                weight: "Bolder",
                horizontalAlignment: "Center",
                wrap: true,
              },
            ],
          })
        ),
      },
    ])
  );

  if (supports(capabilities, "Image")) {
    body.push(
      section("Image / FactSet", [
        {
          type: "ColumnSet",
          columns: [
            {
              type: "Column",
              width: "auto",
              items: [
                {
                  type: "Image",
                  url: "https://api.iconify.design/lucide/layout-template.svg?color=%236b7075",
                  altText: "Adaptive Card",
                  width: "48px",
                  height: "48px",
                },
              ],
            },
            {
              type: "Column",
              width: "stretch",
              items: supports(capabilities, "FactSet")
                ? [
                    {
                      type: "FactSet",
                      facts: [
                        { title: "SDK", value: "3.0.6" },
                        { title: "Profile", value: reference },
                      ],
                    },
                  ]
                : [{ type: "TextBlock", text: reference, wrap: true }],
            },
          ],
        },
      ], "emphasis")
    );
  }

  if (supports(capabilities, "Table")) {
    body.push(
      section("Table", [
        {
          type: "Table",
          firstRowAsHeaders: true,
          showGridLines: true,
          columns: [{ width: 1 }, { width: 2 }, { width: 1 }],
          rows: [
            ["组件", "用途", "状态"],
            ["Input.Text", "用户文本输入", "支持"],
            ["Action.Submit", "提交卡片动作", "支持"],
          ].map((row) => ({
            type: "TableRow",
            cells: row.map((text) => ({
              type: "TableCell",
              items: [{ type: "TextBlock", text, wrap: true, size: "Small" }],
            })),
          })),
        },
      ])
    );
  }

  const inputs = [];
  if (supports(capabilities, "Input.Text")) {
    inputs.push({
      type: "Input.Text",
      id: "gallery_text",
      label: "Input.Text",
      placeholder: "输入文本",
    });
  }
  if (supports(capabilities, "Input.ChoiceSet")) {
    inputs.push({
      type: "Input.ChoiceSet",
      id: "gallery_choice",
      label: "Input.ChoiceSet",
      style: "compact",
      value: "one",
      choices: [
        { title: "选项一", value: "one" },
        { title: "选项二", value: "two" },
      ],
    });
  }
  if (supports(capabilities, "Input.Toggle")) {
    inputs.push({
      type: "Input.Toggle",
      id: "gallery_toggle",
      title: "Input.Toggle",
      valueOn: "yes",
      valueOff: "no",
    });
  }
  if (supports(capabilities, "Input.Number")) {
    inputs.push({ type: "Input.Number", id: "gallery_number", label: "Input.Number", value: 8 });
  }
  if (supports(capabilities, "Input.Date")) {
    inputs.push({ type: "Input.Date", id: "gallery_date", label: "Input.Date" });
  }
  if (supports(capabilities, "Input.Time")) {
    inputs.push({ type: "Input.Time", id: "gallery_time", label: "Input.Time" });
  }
  if (inputs.length > 0) body.push(section("Inputs", inputs, "emphasis"));

  const actions = [];
  if (supportsAction(capabilities, "Action.OpenUrl")) {
    actions.push({ type: "Action.OpenUrl", title: "OpenUrl", url: "https://adaptivecards.io" });
  }
  if (supportsAction(capabilities, "Action.ToggleVisibility")) {
    actions.push({
      type: "Action.ToggleVisibility",
      title: "ToggleVisibility",
      targetElements: ["gallery_toggle_target"],
    });
  }
  if (supportsAction(capabilities, "Action.Submit")) {
    actions.push({
      type: "Action.Submit",
      id: "gallery_submit",
      title: "Submit",
      associatedInputs: "none",
    });
  }
  if (actions.length > 0) {
    body.push(
      section("Actions", [
        {
          type: "Container",
          id: "gallery_toggle_target",
          style: "accent",
          items: [{ type: "TextBlock", text: "Toggle target", wrap: true }],
        },
        { type: "ActionSet", actions },
      ])
    );
  }

  return { type: "AdaptiveCard", version: "1.5", body };
}
