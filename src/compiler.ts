import path from "node:path";
import { createRequire } from "node:module";
import * as ACData from "adaptivecards-templating";
import { readJson } from "./fs.js";
import { getCard, getHostProfile } from "./registry.js";
import type {
  CompileResult,
  InteractionContract,
  JsonObject,
  ValidationIssue,
} from "./types.js";
import { validateCompiledCard, validateInteractions } from "./validate.js";

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

export async function compileCard(options: {
  cardId: string;
  view: string;
  data: JsonObject;
}): Promise<CompileResult> {
  const card = await getCard(options.cardId);
  const view = card.manifest.views[options.view];
  if (!view) throw new Error(`Unknown view ${options.view} for ${options.cardId}`);

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

  let payload: JsonObject = {};
  if (!issues.some((issue) => issue.severity === "error")) {
    const templateJson = await readJson<JsonObject>(path.join(card.root, view.template));
    const template = new ACData.Template(templateJson);
    payload = template.expand({ $root: options.data }) as JsonObject;
    const host = await getHostProfile(card.manifest.hostProfile);
    issues.push(...validateCompiledCard(payload, host.capabilities));
    const interactions = await readJson<InteractionContract>(
      path.join(card.root, card.manifest.interactions)
    );
    if (!interactions.views || interactions.views.includes(options.view)) {
      issues.push(...validateInteractions(payload, interactions));
    }
  }

  return {
    cardId: card.manifest.id,
    cardVersion: card.manifest.version,
    contractVersion: card.manifest.contractVersion,
    hostProfile: card.manifest.hostProfile,
    view: options.view,
    payload,
    issues,
  };
}

export async function compileSample(options: {
  cardId: string;
  sample: string;
}): Promise<CompileResult & { data: JsonObject }> {
  const card = await getCard(options.cardId);
  for (const [viewName, view] of Object.entries(card.manifest.views)) {
    const match = view.samples.find(
      (samplePath) => path.basename(samplePath, path.extname(samplePath)) === options.sample
    );
    if (!match) continue;
    const data = await readJson<JsonObject>(path.join(card.root, match));
    return { ...(await compileCard({ cardId: options.cardId, view: viewName, data })), data };
  }
  throw new Error(`Unknown sample ${options.sample} for ${options.cardId}`);
}
