import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot, readJson } from "./fs.js";
import type { HostCapabilities, HostProfileManifest } from "./types.js";

const CARD_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VIEW_ID = /^[a-z][a-z0-9_-]*$/;
const HOST_PROFILE = /^[a-z][a-z0-9.-]*@\d+\.\d+\.\d+$/;

export interface InitCardOptions {
  cardId: string;
  name: string;
  view?: string;
  hostProfile?: string;
  root?: string;
}

export interface InitCardResult {
  cardId: string;
  name: string;
  root: string;
  files: string[];
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function initCard(options: InitCardOptions): Promise<InitCardResult> {
  const cardId = options.cardId.trim();
  const name = options.name.trim();
  const view = options.view?.trim() || "default";
  const hostProfile = options.hostProfile?.trim() || "octo-web@1.0.0";

  if (!CARD_ID.test(cardId)) {
    throw new Error(
      "card-id must use lowercase letters, numbers, dots or hyphens (for example docs.access-request)"
    );
  }
  if (!name) throw new Error("--name is required");
  if (!VIEW_ID.test(view)) {
    throw new Error("view must start with a lowercase letter and contain letters, numbers, _ or -");
  }
  if (!HOST_PROFILE.test(hostProfile)) {
    throw new Error("host profile must look like octo-web@1.0.0");
  }

  const root = path.resolve(options.root ?? projectRoot());
  const at = hostProfile.lastIndexOf("@");
  const hostRoot = path.join(
    root,
    "host-profiles",
    hostProfile.slice(0, at),
    hostProfile.slice(at + 1)
  );
  let adaptiveCardVersion: string;
  try {
    const hostManifest = await readJson<HostProfileManifest>(
      path.join(hostRoot, "manifest.json")
    );
    const capabilities = await readJson<HostCapabilities>(
      path.join(hostRoot, hostManifest.capabilities)
    );
    adaptiveCardVersion = capabilities.maxAdaptiveCardVersion;
  } catch {
    throw new Error(`Unknown host profile: ${hostProfile}`);
  }
  const cardsRoot = path.join(root, "cards");
  const cardRoot = path.join(cardsRoot, cardId);
  await mkdir(cardsRoot, { recursive: true });
  try {
    await mkdir(cardRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Card already exists: ${cardId}`);
    }
    throw error;
  }

  const files: Record<string, unknown> = {
    "manifest.json": {
      schemaVersion: 1,
      id: cardId,
      name,
      version: "0.1.0",
      contractVersion: "1.0.0",
      adaptiveCardVersion,
      hostProfile,
      defaultLocale: "zh-CN",
      dataSchema: "contract/data.schema.json",
      interactions: "interactions.json",
      views: {
        [view]: {
          template: `templates/${view}.template.json`,
          samples: [`samples/${view}.json`],
        },
      },
    },
    "contract/data.schema.json": {
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
    "interactions.json": {
      views: [view],
      actions: {},
      inputs: {},
    },
    [`samples/${view}.json`]: {
      title: name,
      message: `这是${name}的示例内容。`,
    },
    [`templates/${view}.template.json`]: {
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
    },
  };

  try {
    await Promise.all([
      mkdir(path.join(cardRoot, "contract")),
      mkdir(path.join(cardRoot, "samples")),
      mkdir(path.join(cardRoot, "templates")),
    ]);
    await Promise.all(
      Object.entries(files).map(([relativePath, value]) =>
        writeFile(path.join(cardRoot, relativePath), json(value), { flag: "wx" })
      )
    );
  } catch (error) {
    await rm(cardRoot, { recursive: true, force: true });
    throw error;
  }

  return {
    cardId,
    name,
    root: cardRoot,
    files: Object.keys(files).sort(),
  };
}
