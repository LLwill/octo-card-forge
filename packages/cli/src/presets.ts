import type { JsonObject, WireProfile } from "./types.js";

export type InitPresetId = "blank" | "bot-token" | "docs-forward";

export interface InitPreset {
  id: InitPresetId;
  description: string;
  wireProfile: WireProfile;
  dataSchema: JsonObject;
  sample: JsonObject;
  template: (adaptiveCardVersion: string) => JsonObject;
}

function schemaProperty(
  type: string,
  description: string,
  examples: unknown[]
): JsonObject {
  return { type, description, examples };
}

export function listInitPresets(): Array<Pick<InitPreset, "id" | "description" | "wireProfile">> {
  return [createBlankPreset("Blank Card"), ...Object.values(INIT_PRESETS)].map(
    ({ id, description, wireProfile }) => ({
      id,
      description,
      wireProfile,
    })
  );
}

export function getInitPreset(id: string): InitPreset | undefined {
  if (id === "blank") return createBlankPreset("Blank Card");
  return INIT_PRESETS[id as Exclude<InitPresetId, "blank">];
}

export function createBlankPreset(name: string): InitPreset {
  return {
    id: "blank",
    description: "Minimal generic card scaffold.",
    wireProfile: "octo/v1",
    dataSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: `${name}数据契约`,
      type: "object",
      additionalProperties: false,
      required: ["title", "message"],
      properties: {
        title: {
          type: "string",
          minLength: 1,
          description: "卡片主标题，由业务后端映射",
          examples: [name],
        },
        message: {
          type: "string",
          description: "卡片正文，由业务后端映射",
          examples: [`这是${name}的示例内容。`],
        },
      },
    },
    sample: {
      title: name,
      message: `这是${name}的示例内容。`,
    },
    template: (adaptiveCardVersion) => ({
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: adaptiveCardVersion,
      body: [
        {
          type: "TextBlock",
          text: "${title}",
          size: "Large",
          weight: "Bolder",
          wrap: true,
        },
        {
          type: "TextBlock",
          text: "${message}",
          spacing: "Medium",
          wrap: true,
        },
      ],
    }),
  };
}

const INIT_PRESETS: Record<Exclude<InitPresetId, "blank">, InitPreset> = {
  "bot-token": {
    id: "bot-token",
    description: "Secure bot token creation/result card with copy and saved actions.",
    wireProfile: "octo/v2",
    dataSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "Bot Token 查看数据契约",
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "tokenId",
        "botName",
        "tokenName",
        "maskedToken",
        "tokenValue",
        "createdAt",
        "expiresAtLabel",
        "scopes",
        "creatorName",
        "securityMessage",
      ],
      properties: {
        title: schemaProperty("string", "卡片标题", ["Bot Token 已创建"]),
        tokenId: schemaProperty("string", "Token 业务唯一标识，用于提交动作", [
          "tok_20260801_demo",
        ]),
        botName: schemaProperty("string", "机器人名称", ["Octo Docs Bot"]),
        tokenName: schemaProperty("string", "Token 名称", ["生产环境访问 Token"]),
        maskedToken: schemaProperty("string", "默认展示的脱敏 Token", [
          "octo_tok_••••••••••••9f3a",
        ]),
        tokenValue: schemaProperty("string", "完整 Token，仅用于一次性展示或复制", [
          "octo_tok_demo_value_not_real",
        ]),
        createdAt: schemaProperty("string", "创建时间展示文案", ["2026-08-01 10:30"]),
        expiresAtLabel: schemaProperty("string", "过期时间展示文案", ["永不过期"]),
        creatorName: schemaProperty("string", "创建人展示名", ["Will"]),
        securityMessage: schemaProperty("string", "安全提示文案", [
          "请立即复制并妥善保存，离开页面后无法再次完整查看。",
        ]),
        scopes: {
          type: "array",
          description: "权限范围展示列表",
          minItems: 1,
          items: {
            type: "string",
          },
          examples: [["读取文档", "发送消息"]],
        },
      },
    },
    sample: {
      title: "Bot Token 已创建",
      tokenId: "tok_20260801_demo",
      botName: "Octo Docs Bot",
      tokenName: "生产环境访问 Token",
      maskedToken: "octo_tok_••••••••••••9f3a",
      tokenValue: "octo_tok_demo_value_not_real",
      createdAt: "2026-08-01 10:30",
      expiresAtLabel: "永不过期",
      creatorName: "Will",
      securityMessage: "请立即复制并妥善保存，离开页面后无法再次完整查看。",
      scopes: ["读取文档", "发送消息"],
    },
    template: (adaptiveCardVersion) => ({
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: adaptiveCardVersion,
      body: [
        {
          type: "TextBlock",
          text: "${title}",
          size: "Large",
          weight: "Bolder",
          wrap: true,
        },
        {
          type: "Container",
          id: "octo--surface-warning--inset-md--uid-security-notice",
          style: "warning",
          spacing: "Medium",
          items: [
            {
              type: "TextBlock",
              text: "${securityMessage}",
              color: "Attention",
              weight: "Bolder",
              wrap: true,
            },
          ],
        },
        {
          type: "FactSet",
          spacing: "Medium",
          facts: [
            { title: "机器人", value: "${botName}" },
            { title: "Token", value: "${tokenName}" },
            { title: "创建时间", value: "${createdAt}" },
            { title: "过期时间", value: "${expiresAtLabel}" },
            { title: "创建人", value: "${creatorName}" },
          ],
        },
        {
          type: "Container",
          id: "octo--surface-subtle--inset-md--uid-token-preview",
          style: "emphasis",
          spacing: "Medium",
          items: [
            {
              type: "TextBlock",
              text: "Token",
              size: "Small",
              isSubtle: true,
              wrap: true,
            },
            {
              type: "TextBlock",
              text: "${maskedToken}",
              weight: "Bolder",
              wrap: true,
              spacing: "Small",
            },
            {
              type: "TextBlock",
              id: "tokenValue",
              text: "${tokenValue}",
              isVisible: false,
              wrap: true,
              spacing: "Small",
            },
          ],
        },
        {
          type: "Container",
          spacing: "Medium",
          items: [
            {
              type: "TextBlock",
              text: "权限范围",
              size: "Small",
              weight: "Bolder",
              isSubtle: true,
              wrap: true,
            },
            {
              type: "TextBlock",
              text: "• ${$data}",
              wrap: true,
              spacing: "Small",
              $data: "${scopes}",
            },
          ],
        },
      ],
      actions: [
        {
          type: "Action.Submit",
          id: "copy-token",
          title: "复制 Token",
          associatedInputs: "none",
          data: {
            action: "copyToken",
            tokenId: "${tokenId}",
          },
        },
        {
          type: "Action.ToggleVisibility",
          id: "toggle-token-visibility",
          title: "显示/隐藏 Token",
          targetElements: ["tokenValue"],
        },
        {
          type: "Action.Submit",
          id: "confirm-saved",
          title: "我已保存",
          associatedInputs: "none",
          data: {
            action: "confirmSaved",
            tokenId: "${tokenId}",
          },
        },
      ],
    }),
  },
  "docs-forward": {
    id: "docs-forward",
    description: "Compact forwarded document card with preview, open and copy-link actions.",
    wireProfile: "octo/v2",
    dataSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "文档转发卡片数据契约",
      type: "object",
      additionalProperties: false,
      required: [
        "documentId",
        "title",
        "creatorName",
        "permissionLabel",
        "previewText",
        "documentUrl",
        "linkUrl",
      ],
      properties: {
        documentId: schemaProperty("string", "文档业务唯一标识，用于提交动作", [
          "doc_20260801_demo",
        ]),
        title: schemaProperty("string", "文档标题", ["Q3 产品方案"]),
        creatorName: schemaProperty("string", "文档创建人", ["Ming"]),
        forwarderName: schemaProperty("string", "转发人；无转发人时可省略", ["Will"]),
        permissionLabel: schemaProperty("string", "当前权限展示文案", ["可查看"]),
        previewText: schemaProperty("string", "文档内容预览", [
          "这份文档整理了目标、范围、里程碑和待确认问题。",
        ]),
        updatedAt: schemaProperty("string", "更新时间或补充元信息，可省略", [
          "今天 10:30",
        ]),
        documentUrl: schemaProperty("string", "打开文档的 HTTPS 地址", [
          "https://example.com/docs/doc_20260801_demo",
        ]),
        linkUrl: schemaProperty("string", "复制链接动作对应的 HTTPS 地址", [
          "https://example.com/docs/doc_20260801_demo",
        ]),
      },
    },
    sample: {
      documentId: "doc_20260801_demo",
      title: "Q3 产品方案",
      creatorName: "Ming",
      forwarderName: "Will",
      permissionLabel: "可查看",
      previewText: "这份文档整理了目标、范围、里程碑和待确认问题。",
      updatedAt: "今天 10:30",
      documentUrl: "https://example.com/docs/doc_20260801_demo",
      linkUrl: "https://example.com/docs/doc_20260801_demo",
    },
    template: (adaptiveCardVersion) => ({
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
      type: "AdaptiveCard",
      version: adaptiveCardVersion,
      body: [
        {
          type: "ColumnSet",
          columns: [
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                  type: "TextBlock",
                  text: "${title}",
                  size: "Medium",
                  weight: "Bolder",
                  wrap: true,
                },
                {
                  type: "TextBlock",
                  text: "创建人 ${creatorName}",
                  size: "Small",
                  isSubtle: true,
                  spacing: "Small",
                  wrap: true,
                },
                {
                  type: "TextBlock",
                  text: "由 ${forwarderName} 转发",
                  size: "Small",
                  isSubtle: true,
                  spacing: "None",
                  wrap: true,
                  $when: "${forwarderName != null && forwarderName != ''}",
                },
              ],
            },
            {
              type: "Column",
              width: "auto",
              items: [
                {
                  type: "TextBlock",
                  id: "octo-badge-accent-permission",
                  text: "${permissionLabel}",
                  size: "Small",
                  weight: "Bolder",
                  color: "Accent",
                  wrap: true,
                },
              ],
            },
          ],
        },
        {
          type: "Container",
          id: "octo--surface-subtle--inset-md--uid-document-preview",
          style: "emphasis",
          spacing: "Medium",
          items: [
            {
              type: "TextBlock",
              text: "${previewText}",
              wrap: true,
              maxLines: 3,
            },
            {
              type: "TextBlock",
              text: "${updatedAt}",
              size: "Small",
              isSubtle: true,
              spacing: "Small",
              wrap: true,
              $when: "${updatedAt != null && updatedAt != ''}",
            },
          ],
        },
      ],
      actions: [
        {
          type: "Action.OpenUrl",
          id: "open-document",
          title: "打开文档",
          url: "${documentUrl}",
        },
        {
          type: "Action.Submit",
          id: "copy-document-link",
          title: "复制链接",
          associatedInputs: "none",
          data: {
            action: "copyDocumentLink",
            documentId: "${documentId}",
            linkUrl: "${linkUrl}",
          },
        },
      ],
    }),
  },
};
