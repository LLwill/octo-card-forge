import path from "node:path";
import { createRequire } from "node:module";
import * as ACData from "adaptivecards-templating";
import { readJson } from "./fs.js";
import { inspectCard } from "./inspect.js";
import {
  getCard,
  loadCardPackage,
  resolveCardAssetPath,
  resolveRenderProfileReference,
} from "./registry.js";
import { loadRenderProfileForReference } from "./profile-source.js";
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
    resolveCardAssetPath(card.root, card.manifest.dataSchema, "dataSchema")
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
    const templateJson = await readJson<JsonObject>(
      resolveCardAssetPath(card.root, view.template, `views.${options.view}.template`)
    );
    const template = new ACData.Template(templateJson);
    payload = template.expand({ $root: options.data }) as JsonObject;
    if (payload.version !== card.manifest.adaptiveCardVersion) {
      issues.push({
        severity: "error",
        code: "schema.adaptive_card_version",
        path: "$.version",
        message:
          `Template emits Adaptive Card ${String(payload.version)}, ` +
          `manifest declares ${card.manifest.adaptiveCardVersion}`,
      });
    }
    const profile = await loadRenderProfileForReference(renderProfile, options.profile);
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
  view?: string;
  profile?: RenderProfileSource;
}): Promise<CompileResult & { data: JsonObject }> {
  const { card } = options;
  const matches: Array<{ viewName: string; samplePath: string }> = [];
  for (const [viewName, view] of Object.entries(card.manifest.views)) {
    if (options.view && options.view !== viewName) continue;
    const match = view.samples.find(
      (samplePath) => path.basename(samplePath, path.extname(samplePath)) === options.sample
    );
    if (match) matches.push({ viewName, samplePath: match });
  }
  if (matches.length > 1) {
    throw new Error(
      `Sample ${options.sample} is ambiguous for ${card.reference}; choose a view: ` +
        matches.map((match) => match.viewName).join(", ")
    );
  }
  const match = matches[0];
  if (match) {
    const data = await readJson<JsonObject>(
      resolveCardAssetPath(card.root, match.samplePath, `views.${match.viewName}.samples`)
    );
    return {
      ...(await compileCardPackage({
        card,
        view: match.viewName,
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
  view?: string;
  profile?: RenderProfileSource;
}): Promise<CompileResult & { data: JsonObject }> {
  return compileSampleFromPackage({
    card: await loadCardPackage(options.cardRoot),
    sample: options.sample,
    view: options.view,
    profile: options.profile,
  });
}
