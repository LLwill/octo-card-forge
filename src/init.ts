import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "./fs.js";
import { createBlankPreset, getInitPreset, listInitPresets } from "./presets.js";
import { loadRenderProfileForReference } from "./profile-source.js";
import type { WireProfile } from "./types.js";

const CARD_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VIEW_ID = /^[a-z][a-z0-9_-]*$/;
const RENDER_PROFILE = /^[a-z][a-z0-9.-]*@(latest|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export interface InitCardOptions {
  cardId: string;
  name: string;
  preset?: string;
  view?: string;
  renderProfile?: string;
  wireProfile?: WireProfile;
  root?: string;
  outputRoot?: string;
}

export interface InitCardResult {
  cardId: string;
  name: string;
  preset: string;
  root: string;
  files: string[];
}

export { listInitPresets };

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function initCard(options: InitCardOptions): Promise<InitCardResult> {
  const cardId = options.cardId.trim();
  const name = options.name.trim();
  const presetId = options.preset?.trim() || "blank";
  const view = options.view?.trim() || "default";
  // Follow the repo baseline unless the caller pins a concrete version.
  const renderProfile = options.renderProfile?.trim() || "octo-chat@latest";
  const preset = presetId === "blank" ? createBlankPreset(name) : getInitPreset(presetId);
  const wireProfile = options.wireProfile ?? preset?.wireProfile ?? "octo/v1";

  if (!CARD_ID.test(cardId)) {
    throw new Error(
      "card-id must use lowercase letters, numbers, dots or hyphens (for example docs.access-request)"
    );
  }
  if (!name) throw new Error("--name is required");
  if (!preset) {
    throw new Error(
      `unknown preset ${presetId}. Available presets: ${listInitPresets()
        .map((item) => item.id)
        .join(", ")}`
    );
  }
  if (!VIEW_ID.test(view)) {
    throw new Error("view must start with a lowercase letter and contain letters, numbers, _ or -");
  }
  if (!RENDER_PROFILE.test(renderProfile)) {
    throw new Error(
      "render profile must look like octo-chat@1.2.0-rc.3 or octo-chat@latest"
    );
  }
  if (wireProfile !== "octo/v1" && wireProfile !== "octo/v2") {
    throw new Error("wire profile must be octo/v1 or octo/v2");
  }

  const root = path.resolve(options.root ?? projectRoot());
  const previousRoot = process.env.OCTO_CARD_FORGE_ROOT;
  process.env.OCTO_CARD_FORGE_ROOT = root;
  let adaptiveCardVersion: string;
  try {
    const profile = await loadRenderProfileForReference(renderProfile);
    adaptiveCardVersion = profile.capabilities.maxAdaptiveCardVersion;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : `Unknown render profile: ${renderProfile}`
    );
  } finally {
    if (previousRoot === undefined) delete process.env.OCTO_CARD_FORGE_ROOT;
    else process.env.OCTO_CARD_FORGE_ROOT = previousRoot;
  }
  const cardRoot = options.outputRoot
    ? path.resolve(options.outputRoot)
    : path.join(root, "cards", cardId);
  await mkdir(path.dirname(cardRoot), { recursive: true });
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
      schemaVersion: 2,
      id: cardId,
      name,
      version: "0.1.0",
      contractVersion: "1.0.0",
      adaptiveCardVersion,
      renderProfile,
      defaultLocale: "zh-CN",
      dataSchema: "contract/data.schema.json",
      views: {
        [view]: {
          wireProfile,
          template: `templates/${view}.template.json`,
          samples: [`samples/${view}.json`],
        },
      },
    },
    "contract/data.schema.json": preset.dataSchema,
    [`samples/${view}.json`]: preset.sample,
    [`templates/${view}.template.json`]: preset.template(adaptiveCardVersion),
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
    preset: preset.id,
    root: cardRoot,
    files: Object.keys(files).sort(),
  };
}
