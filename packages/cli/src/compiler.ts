import { compileLoadedCard, loadCardRuntime } from "./core-adapter.js";
import {
  getCard,
  loadCardPackage,
} from "./registry.js";
import type {
  CardPackage,
  CompileResult,
  JsonObject,
  RenderProfileSource,
} from "./types.js";

export async function compileCardPackage(options: {
  card: CardPackage;
  view: string;
  data: JsonObject;
  profile?: RenderProfileSource;
}): Promise<CompileResult> {
  const runtime = await loadCardRuntime(options.card, options.profile);
  return compileLoadedCard(runtime, options.view, options.data);
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
  const runtime = await loadCardRuntime(options.card, options.profile);
  const matches: Array<{ viewName: string; samplePath: string }> = [];
  for (const [viewName, view] of Object.entries(runtime.source.views)) {
    if (options.view && options.view !== viewName) continue;
    const match = view.samples.find((sample) => sample.name === options.sample);
    if (match) matches.push({ viewName, samplePath: match.name });
  }
  if (matches.length > 1) {
    throw new Error(
      `Sample ${options.sample} is ambiguous for ${options.card.reference}; choose a view: ` +
        matches.map((match) => match.viewName).join(", ")
    );
  }
  const match = matches[0];
  if (match) {
    const data = runtime.source.views[match.viewName].samples.find(
      (sample) => sample.name === match.samplePath
    )!.data;
    return {
      ...compileLoadedCard(runtime, match.viewName, data),
      data,
    };
  }
  throw new Error(`Unknown sample ${options.sample} for ${options.card.reference}`);
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
