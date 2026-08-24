import { issue, type DecodeIssue } from "./diagnostics.js";

const CARD_ID_PATTERN = /^([a-z][a-z0-9-]*)\.([a-z][a-z0-9-]*)$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const RENDER_PROFILE_PATTERN = /^([a-z][a-z0-9.-]*)@(latest|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

export type CardId = string & { readonly __brand: "CardId" };
export type Namespace = string & { readonly __brand: "Namespace" };
export type CardKey = string & { readonly __brand: "CardKey" };
export type SemVer = string & { readonly __brand: "SemVer" };
export type PinnedRenderProfileReference = string & { readonly __brand: "PinnedRenderProfileReference" };

export interface ParsedCardId {
  value: CardId;
  namespace: Namespace;
  key: CardKey;
}

export function parseCardId(value: unknown): ParsedCardId | undefined {
  if (typeof value !== "string") return undefined;
  const match = CARD_ID_PATTERN.exec(value);
  if (!match) return undefined;
  return {
    value: value as CardId,
    namespace: match[1] as Namespace,
    key: match[2] as CardKey,
  };
}

export function parseSemVer(value: unknown): SemVer | undefined {
  return typeof value === "string" && SEMVER_PATTERN.test(value)
    ? (value as SemVer)
    : undefined;
}

export function parseRenderProfileReference(value: unknown): {
  id: string;
  version: "latest" | SemVer;
} | undefined {
  if (typeof value !== "string") return undefined;
  const match = RENDER_PROFILE_PATTERN.exec(value);
  if (!match) return undefined;
  return {
    id: match[1],
    version: match[2] === "latest" ? "latest" : (match[2] as SemVer),
  };
}

export function isPinnedRenderProfileReference(value: unknown): value is PinnedRenderProfileReference {
  const parsed = parseRenderProfileReference(value);
  return parsed !== undefined && parsed.version !== "latest";
}

export function validateCardId(value: unknown, path: string): DecodeIssue[] {
  return parseCardId(value)
    ? []
    : [issue("contract.pattern", path, "card id must match <namespace>.<card-key>")];
}
