import * as AjvModule from "ajv";
import * as FormatsModule from "ajv-formats";
import { Template } from "adaptivecards-templating";
import type {
  CompileCardSourceOptions,
  CompileResult,
  JsonObject,
  ResolvedCardSource,
  ValidationIssue,
} from "./types.js";
import { inspectCard } from "./inspect.js";
import { validateCompiledCard } from "./validate.js";

type Validator = {
  (data: unknown): boolean;
  errors?: Array<{
    keyword: string;
    instancePath: string;
    message?: string;
  }> | null;
};

type AjvInstance = {
  compile(schema: JsonObject): Validator;
};

const Ajv = (AjvModule.default ?? AjvModule) as unknown as new (
  options?: Record<string, unknown>
) => AjvInstance;
const addFormats = (FormatsModule.default ?? FormatsModule) as unknown as (
  ajv: AjvInstance
) => void;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSource(options: CompileCardSourceOptions): ResolvedCardSource {
  return "card" in options ? options.card : options.source;
}

function getRenderProfileReference(options: CompileCardSourceOptions): string {
  if (options.profile.reference) return options.profile.reference;
  if (options.profile.manifest) {
    return `${options.profile.manifest.id}@${options.profile.manifest.version}`;
  }
  throw new Error("Render profile reference or manifest is required");
}

function dataIssues(source: ResolvedCardSource, data: JsonObject): ValidationIssue[] {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(source.dataContract);
  if (validate(data)) return [];
  return (validate.errors ?? []).map((item) => ({
    severity: "error" as const,
    code: `contract.${item.keyword}`,
    path: item.instancePath ? `$${item.instancePath}` : "$",
    message: item.message ?? "Invalid card data",
  }));
}

/**
 * Compile an already-resolved Card Source without reading files or consulting
 * a registry. The function is deliberately object-in/object-out so callers
 * can use the same engine from CLI, CI, server adapters, or a browser build.
 */
export function compileCardSource(options: CompileCardSourceOptions): CompileResult {
  const source = getSource(options);
  const view = source.views[options.view];
  if (!view) {
    throw new Error(`Unknown view ${options.view} for ${source.card.id}`);
  }

  const renderProfile = getRenderProfileReference(options);
  const issues = dataIssues(source, options.data);
  let payload: JsonObject = {};

  if (!issues.some((issue) => issue.severity === "error")) {
    const expanded = new Template(view.template).expand({ $root: options.data });
    if (!isObject(expanded)) {
      issues.push({
        severity: "error",
        code: "schema.root_type",
        path: "$",
        message: "Template must emit an Adaptive Card object",
      });
    } else {
      payload = expanded;
      if (payload.version !== source.card.adaptiveCardVersion) {
        issues.push({
          severity: "error",
          code: "schema.adaptive_card_version",
          path: "$.version",
          message:
            `Template emits Adaptive Card ${String(payload.version)}, ` +
            `manifest declares ${source.card.adaptiveCardVersion}`,
        });
      }
      issues.push(...validateCompiledCard(payload, options.profile.capabilities, view.wireProfile));
    }
  }

  return {
    cardId: source.card.id,
    cardVersion: source.card.version,
    contractVersion: source.card.contractVersion,
    renderProfile,
    wireProfile: view.wireProfile,
    view: options.view,
    payload,
    inspection: inspectCard(payload),
    issues,
  };
}
