import path from "node:path";
import { compileSampleFromPackage } from "./compiler.js";
import { loadCardPackage, listCards, resolveRenderProfileReference } from "./registry.js";
import { loadRenderProfileForReference } from "./profile-source.js";
import type {
  JsonObject,
  RenderUtilityDefinition,
  ValidationIssue,
  WireProfile,
  CardPackage,
  RenderProfileSource,
} from "./types.js";
import { isUtilityId, parseUtilityId } from "./utility-id.js";

export interface AgentUtilityToken {
  token: string;
  group: string;
  appliesTo: string[];
  description: string;
  fallback?: JsonObject;
  useWhen?: string[];
  avoidWhen?: string[];
  deprecated?: boolean;
  idExample: string;
}

export interface AgentDiscoverReport {
  profile: string;
  idSyntax: string;
  maxTokensPerElement: number;
  groups: Array<{
    group: string;
    tokens: AgentUtilityToken[];
  }>;
}

export interface AgentExplainReport extends AgentUtilityToken {
  profile: string;
  groupConflictRule: string;
  cardExample: JsonObject;
  recommendedCombinations: string[];
}

export interface AgentUtilityUsage {
  path: string;
  id: string;
  tokens: string[];
  uid: string;
}

export interface AgentLintReport {
  valid: boolean;
  summary: {
    cards: number;
    samples: number;
    errors: number;
    warnings: number;
    utilityIds: number;
    tokens: string[];
  };
  cards: Array<{
    reference: string;
    cardId: string;
    version: string;
    kind: CardPackage["kind"];
    mutable: boolean;
    samples: Array<{
      name: string;
      view: string;
      wireProfile: WireProfile;
      valid: boolean;
      renderProfile?: string;
      issues: ValidationIssue[];
      utilities: {
        ids: AgentUtilityUsage[];
        tokens: string[];
      };
    }>;
  }>;
}

const DEFAULT_MAX_UTILITY_TOKENS_PER_ELEMENT = 3;
const ID_SYNTAX = "octo--<token>--<token>--uid-<unique-name>";
const GROUP_ORDER = ["surface", "badge", "inset", "line", "motion"];

function utilityToToken(
  token: string,
  definition: RenderUtilityDefinition
): AgentUtilityToken {
  return {
    token,
    group: definition.group,
    appliesTo: definition.appliesTo,
    description: definition.description,
    fallback: definition.fallback,
    useWhen: definition.useWhen,
    avoidWhen: definition.avoidWhen,
    deprecated: definition.deprecated,
    idExample: `octo--${token}--uid-example`,
  };
}

function compareGroup(left: string, right: string): number {
  const leftIndex = GROUP_ORDER.includes(left)
    ? GROUP_ORDER.indexOf(left)
    : GROUP_ORDER.length;
  const rightIndex = GROUP_ORDER.includes(right)
    ? GROUP_ORDER.indexOf(right)
    : GROUP_ORDER.length;
  return leftIndex - rightIndex || left.localeCompare(right);
}

function matchesQuery(token: AgentUtilityToken, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    token.token,
    token.group,
    token.description,
    ...token.appliesTo,
    ...(token.useWhen ?? []),
    ...(token.avoidWhen ?? []),
  ].some((value) => value.toLowerCase().includes(normalized));
}

export async function discoverUtilities(options: {
  profile?: string;
  profileSource?: RenderProfileSource;
  query?: string;
} = {}): Promise<AgentDiscoverReport> {
  const profile = await loadRenderProfileForReference(
    options.profile,
    options.profileSource
  );
  const grouped = new Map<string, AgentUtilityToken[]>();
  for (const [token, definition] of Object.entries(profile.capabilities.utilities ?? {})) {
    const item = utilityToToken(token, definition);
    if (!matchesQuery(item, options.query ?? "")) continue;
    const tokens = grouped.get(item.group) ?? [];
    tokens.push(item);
    grouped.set(item.group, tokens);
  }

  return {
    profile: profile.reference,
    idSyntax: ID_SYNTAX,
    maxTokensPerElement:
      profile.capabilities.utilityRules?.maxTokensPerElement ??
      DEFAULT_MAX_UTILITY_TOKENS_PER_ELEMENT,
    groups: [...grouped.entries()]
      .sort(([left], [right]) => compareGroup(left, right))
      .map(([group, tokens]) => ({
        group,
        tokens: tokens.sort((a, b) => a.token.localeCompare(b.token)),
      })),
  };
}

function overlap(left: string[], right: string[]): boolean {
  return left.includes("*") || right.includes("*") || left.some((item) => right.includes(item));
}

function fallbackElementType(appliesTo: string[]): string {
  return appliesTo.find((item) => item !== "*") ?? "Container";
}

function exampleForUtility(token: AgentUtilityToken, id: string): JsonObject {
  if (token.group === "line") {
    return {
      type: "Container",
      id,
      items: [],
    };
  }
  const type = fallbackElementType(token.appliesTo);
  if (type === "TextBlock") {
    return {
      type,
      id,
      text: token.token,
      wrap: true,
      ...(token.fallback ?? {}),
    };
  }
  return {
    type,
    id,
    ...(token.fallback ?? {}),
    items: [
      {
        type: "TextBlock",
        text: token.token,
        wrap: true,
      },
    ],
  };
}

export async function explainUtility(options: {
  token: string;
  profile?: string;
  profileSource?: RenderProfileSource;
}): Promise<AgentExplainReport> {
  const profile = await loadRenderProfileForReference(
    options.profile,
    options.profileSource
  );
  const definition = profile.capabilities.utilities?.[options.token];
  if (!definition) {
    throw new Error(`${options.token} is not declared by ${profile.reference}`);
  }
  const token = utilityToToken(options.token, definition);
  const isRecommendedCombination = (
    otherToken: string,
    other: RenderUtilityDefinition
  ): boolean => {
    if (!overlap(other.appliesTo, definition.appliesTo)) return false;
    if (definition.group === "line") return otherToken === "motion-shimmer";
    if (options.token === "motion-shimmer") return other.group === "line";
    if (options.token === "motion-fade-in") {
      return ["surface", "inset", "badge"].includes(other.group);
    }
    if (otherToken === "motion-shimmer") return false;
    if (definition.group === "surface") return ["inset", "motion"].includes(other.group);
    if (definition.group === "inset") return ["surface", "motion"].includes(other.group);
    if (definition.group === "badge") return otherToken === "motion-fade-in";
    return false;
  };
  const compatible = Object.entries(profile.capabilities.utilities ?? {})
    .filter(
      ([otherToken, other]) =>
        otherToken !== options.token &&
        other.group !== definition.group &&
        isRecommendedCombination(otherToken, other)
    )
    .map(([otherToken]) => otherToken)
    .sort();

  const preferredCombination =
    definition.group === "line" && compatible.includes("motion-shimmer")
      ? [options.token, "motion-shimmer"]
      : definition.group === "surface" && compatible.includes("inset-md")
        ? [options.token, "inset-md"]
        : [options.token];

  const idExample = `octo--${preferredCombination.join("--")}--uid-example`;

  return {
    ...token,
    idExample,
    profile: profile.reference,
    groupConflictRule: "Only one utility token from the same group may be used on one element.",
    cardExample: exampleForUtility(token, idExample),
    recommendedCombinations: compatible,
  };
}

function collectUtilityUsage(value: unknown, pathName = "$"): AgentUtilityUsage[] {
  const usages: AgentUtilityUsage[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      usages.push(...collectUtilityUsage(item, `${pathName}[${index}]`));
    });
    return usages;
  }
  if (typeof value !== "object" || value === null) return usages;

  const record = value as JsonObject;
  if (typeof record.id === "string" && isUtilityId(record.id)) {
    const parsed = parseUtilityId(record.id);
    if (parsed?.ok) {
      usages.push({
        path: `${pathName}.id`,
        id: record.id,
        tokens: parsed.value.tokens,
        uid: parsed.value.uid,
      });
    }
  }

  for (const [key, child] of Object.entries(record)) {
    usages.push(...collectUtilityUsage(child, `${pathName}.${key}`));
  }
  return usages;
}

async function lintCardPackages(
  cards: CardPackage[],
  profile?: RenderProfileSource
): Promise<AgentLintReport> {
  const report: AgentLintReport = {
    valid: true,
    summary: {
      cards: cards.length,
      samples: 0,
      errors: 0,
      warnings: 0,
      utilityIds: 0,
      tokens: [],
    },
    cards: [],
  };
  const tokens = new Set<string>();

  for (const card of cards) {
    const cardReport: AgentLintReport["cards"][number] = {
      reference: card.reference,
      cardId: card.manifest.id,
      version: card.manifest.version,
      kind: card.kind,
      mutable: card.mutable,
      samples: [],
    };

    for (const [view, definition] of Object.entries(card.manifest.views)) {
      for (const samplePath of definition.samples) {
        const sample = path.basename(samplePath, path.extname(samplePath));
        report.summary.samples++;
        try {
          const result = await compileSampleFromPackage({ card, sample, view, profile });
          const valid = !result.issues.some((issue) => issue.severity === "error");
          const utilityIds = collectUtilityUsage(result.payload);
          for (const usage of utilityIds) {
            usage.tokens.forEach((token) => tokens.add(token));
          }
          report.summary.utilityIds += utilityIds.length;
          report.summary.errors += result.issues.filter(
            (issue) => issue.severity === "error"
          ).length;
          report.summary.warnings += result.issues.filter(
            (issue) => issue.severity === "warning"
          ).length;
          report.valid &&= valid;
          cardReport.samples.push({
            name: sample,
            view,
            wireProfile: definition.wireProfile,
            valid,
            renderProfile: result.renderProfile,
            issues: result.issues,
            utilities: {
              ids: utilityIds,
              tokens: [...new Set(utilityIds.flatMap((usage) => usage.tokens))].sort(),
            },
          });
        } catch (error) {
          report.valid = false;
          report.summary.errors++;
          cardReport.samples.push({
            name: sample,
            view,
            wireProfile: definition.wireProfile,
            valid: false,
            renderProfile: resolveRenderProfileReference(card.manifest.renderProfile),
            issues: [
              {
                severity: "error",
                code: "compiler.failure",
                path: "$",
                message: error instanceof Error ? error.message : String(error),
              },
            ],
            utilities: {
              ids: [],
              tokens: [],
            },
          });
        }
      }
    }

    report.cards.push(cardReport);
  }

  report.summary.tokens = [...tokens].sort();
  return report;
}

export async function lintCardsForAgent(cardId?: string): Promise<AgentLintReport> {
  const availableCards = await listCards();
  const cards = cardId
    ? availableCards.filter((card) => card.reference === cardId)
    : availableCards;
  if (cardId && cards.length === 0) {
    throw new Error(
      `Unknown card reference: ${cardId} (expected one of ${availableCards
        .map((card) => card.reference)
        .join(", ")})`
    );
  }
  return lintCardPackages(cards);
}

export async function lintCardPackageForAgent(
  cardRoot: string,
  profile?: RenderProfileSource
): Promise<AgentLintReport> {
  return lintCardPackages([await loadCardPackage(cardRoot)], profile);
}
