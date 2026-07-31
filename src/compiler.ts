import path from "node:path";
import { createRequire } from "node:module";
import * as ACData from "adaptivecards-templating";
import { readJson } from "./fs.js";
import { inspectCard } from "./inspect.js";
import {
  getCard,
  getRenderProfile,
  loadCardPackage,
  resolveRenderProfileReference,
} from "./registry.js";
import type {
  CardPackage,
  CompileResult,
  JsonObject,
  RenderProfileSource,
  ValidationIssue,
} from "./types.js";
import { validateCompiledCard } from "./validate.js";

// Both packages publish CommonJS-shaped declarations under NodeNext. Resolve the
// runtime defaults once here while keeping the rest of Card Forge native ESM.
const require = createRequire(import.meta.url);
const AjvModule = require("ajv");
const Ajv = (AjvModule.default ?? AjvModule) as new (options?: Record<string, unknown>) => {
  compile: (schema: JsonObject) => {
    (data: JsonObject): boolean;
    errors?: Array<{
      keyword: string;
      instancePath: string;
      message?: string;
    }> | null;
  };
};
const formatsModule = require("ajv-formats");
const addFormats = (formatsModule.default ?? formatsModule) as (ajv: object) => void;

export async function compileCardPackage(options: {
  card: CardPackage;
  view: string;
  data: JsonObject;
  profile?: RenderProfileSource;
}): Promise<CompileResult> {
  const { card } = options;
  const view = card.manifest.views[options.view];
  if (!view) throw new Error(`Unknown view ${options.view} for ${card.reference}`);

  const schema = await readJson<JsonObject>(
    path.join(card.root, card.manifest.dataSchema)
  );
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const issues: ValidationIssue[] = [];
  if (!validate(options.data)) {
    for (const item of validate.errors ?? []) {
      issues.push({
        severity: "error",
        code: `contract.${item.keyword}`,
        path: item.instancePath ? `$${item.instancePath}` : "$",
        message: item.message ?? "Invalid card data",
      });
    }
  }

  const renderProfile = resolveRenderProfileReference(card.manifest.renderProfile);
  let payload: JsonObject = {};
  if (!issues.some((issue) => issue.severity === "error")) {
    const templateJson = await readJson<JsonObject>(path.join(card.root, view.template));
    const template = new ACData.Template(templateJson);
    payload = template.expand({ $root: options.data }) as JsonObject;
    const profile = options.profile ?? await getRenderProfile(renderProfile);
    issues.push(...validateCompiledCard(payload, profile.capabilities, view.wireProfile));
  }

  return {
    cardId: card.manifest.id,
    cardVersion: card.manifest.version,
    contractVersion: card.manifest.contractVersion,
    renderProfile: options.profile?.reference ?? renderProfile,
    wireProfile: view.wireProfile,
    view: options.view,
    payload,
    inspection: inspectCard(payload),
    issues,
  };
}

export async function compileCard(options: {
  cardId: string;
  view: string;
  data: JsonObject;
}): Promise<CompileResult> {
  return compileCardPackage({
    card: await getCard(options.cardId),
    view: options.view,
    data: options.data,
  });
}

export async function compileSampleFromPackage(options: {
  card: CardPackage;
  sample: string;
  profile?: RenderProfileSource;
}): Promise<CompileResult & { data: JsonObject }> {
  const { card } = options;
  for (const [viewName, view] of Object.entries(card.manifest.views)) {
    const match = view.samples.find(
      (samplePath) => path.basename(samplePath, path.extname(samplePath)) === options.sample
    );
    if (!match) continue;
    const data = await readJson<JsonObject>(path.join(card.root, match));
    return {
      ...(await compileCardPackage({
        card,
        view: viewName,
        data,
        profile: options.profile,
      })),
      data,
    };
  }
  throw new Error(`Unknown sample ${options.sample} for ${card.reference}`);
}

export async function compileSample(options: {
  cardId: string;
  sample: string;
}): Promise<CompileResult & { data: JsonObject }> {
  return compileSampleFromPackage({
    card: await getCard(options.cardId),
    sample: options.sample,
  });
}

export async function compileCardDirectory(options: {
  cardRoot: string;
  view: string;
  data: JsonObject;
  profile?: RenderProfileSource;
}): Promise<CompileResult> {
  return compileCardPackage({
    card: await loadCardPackage(options.cardRoot),
    view: options.view,
    data: options.data,
    profile: options.profile,
  });
}

export async function compileSampleFromDirectory(options: {
  cardRoot: string;
  sample: string;
  profile?: RenderProfileSource;
}): Promise<CompileResult & { data: JsonObject }> {
  return compileSampleFromPackage({
    card: await loadCardPackage(options.cardRoot),
    sample: options.sample,
    profile: options.profile,
  });
}
