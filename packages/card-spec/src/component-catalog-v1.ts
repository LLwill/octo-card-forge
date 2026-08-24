import { issue, type DecodeIssue, type DecodeResult } from "./diagnostics.js";
import { isJsonObject, isNonEmptyString, type JsonObject } from "./json.js";
import { parseRenderProfileReference } from "./identifiers.js";

export const COMPONENT_CATALOG_MEDIA_TYPE =
  "application/vnd.octo.component-catalog+json;version=1" as const;

export const COMPONENT_CATALOG_CATEGORIES = [
  "foundation",
  "adaptive-card-components",
  "octo-utility-tokens",
  "composition-patterns",
] as const;

export type ComponentCatalogCategory = (typeof COMPONENT_CATALOG_CATEGORIES)[number];

export const STYLE_MATRIX_PREVIEWS = ["text", "color", "spacing", "radius"] as const;

export type StyleMatrixPreview = (typeof STYLE_MATRIX_PREVIEWS)[number];

export interface ComponentStyleMatrixRowV1 {
  name: string;
  value: string;
  description: string;
  preview: StyleMatrixPreview;
}

export interface ComponentUtilityTokenV1 {
  token: string;
  group: string;
  description: string;
  appliesTo: string[];
  fallback?: JsonObject;
  card: JsonObject;
}

export interface ComponentCatalogSectionV1 {
  id: string;
  title: string;
  description: string;
  card?: JsonObject;
  rows?: ComponentStyleMatrixRowV1[];
  utilityTokens?: ComponentUtilityTokenV1[];
}

export interface ComponentCatalogGroupV1 {
  id: ComponentCatalogCategory;
  title: string;
  description: string;
  sections: ComponentCatalogSectionV1[];
}

export interface ComponentCatalogV1 {
  formatVersion: 1;
  mediaType: typeof COMPONENT_CATALOG_MEDIA_TYPE;
  profileReference: string;
  groups: ComponentCatalogGroupV1[];
}

const CATALOG_KEYS = new Set(["formatVersion", "mediaType", "profileReference", "groups"]);
const GROUP_KEYS = new Set(["id", "title", "description", "sections"]);
const SECTION_KEYS = new Set(["id", "title", "description", "card", "rows", "utilityTokens"]);
const ROW_KEYS = new Set(["name", "value", "description", "preview"]);
const TOKEN_KEYS = new Set(["token", "group", "description", "appliesTo", "fallback", "card"]);

const CATEGORY_SET = new Set<string>(COMPONENT_CATALOG_CATEGORIES);
const PREVIEW_SET = new Set<string>(STYLE_MATRIX_PREVIEWS);

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: DecodeIssue[]
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(issue("contract.unknown_property", `${path}/${escapePointer(key)}`, `unknown property ${key}`));
    }
  }
}

function requiredString(value: unknown, path: string, issues: DecodeIssue[]): string | undefined {
  if (!isNonEmptyString(value)) {
    issues.push(issue("contract.required", path, "value must be a non-empty string"));
    return undefined;
  }
  return value;
}

function decodeRows(
  raw: unknown,
  path: string,
  issues: DecodeIssue[]
): ComponentStyleMatrixRowV1[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push(issue("contract.type", path, "rows must be a non-empty array"));
    return undefined;
  }
  const rows: ComponentStyleMatrixRowV1[] = [];
  let valid = true;
  for (const [index, rawRow] of raw.entries()) {
    const rowPath = `${path}/${index}`;
    if (!isJsonObject(rawRow)) {
      issues.push(issue("contract.type", rowPath, "row must be an object"));
      valid = false;
      continue;
    }
    unknownKeys(rawRow, ROW_KEYS, rowPath, issues);
    const name = requiredString(rawRow.name, `${rowPath}/name`, issues);
    const value = requiredString(rawRow.value, `${rowPath}/value`, issues);
    const description = requiredString(rawRow.description, `${rowPath}/description`, issues);
    let preview: StyleMatrixPreview | undefined;
    if (typeof rawRow.preview !== "string" || !PREVIEW_SET.has(rawRow.preview)) {
      issues.push(issue("contract.enum", `${rowPath}/preview`, `preview must be one of ${[...STYLE_MATRIX_PREVIEWS].join(", ")}`));
    } else {
      preview = rawRow.preview as StyleMatrixPreview;
    }
    if (name && value && description && preview) rows.push({ name, value, description, preview });
    else valid = false;
  }
  return valid ? rows : undefined;
}

function decodeTokens(
  raw: unknown,
  path: string,
  issues: DecodeIssue[]
): ComponentUtilityTokenV1[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push(issue("contract.type", path, "utilityTokens must be a non-empty array"));
    return undefined;
  }
  const tokens: ComponentUtilityTokenV1[] = [];
  let valid = true;
  for (const [index, rawToken] of raw.entries()) {
    const tokenPath = `${path}/${index}`;
    if (!isJsonObject(rawToken)) {
      issues.push(issue("contract.type", tokenPath, "utility token must be an object"));
      valid = false;
      continue;
    }
    unknownKeys(rawToken, TOKEN_KEYS, tokenPath, issues);
    const token = requiredString(rawToken.token, `${tokenPath}/token`, issues);
    const group = requiredString(rawToken.group, `${tokenPath}/group`, issues);
    const description = requiredString(rawToken.description, `${tokenPath}/description`, issues);
    let appliesTo: string[] | undefined;
    if (!Array.isArray(rawToken.appliesTo) || rawToken.appliesTo.length === 0 || !rawToken.appliesTo.every((entry) => isNonEmptyString(entry))) {
      issues.push(issue("contract.type", `${tokenPath}/appliesTo`, "appliesTo must be a non-empty array of strings"));
    } else {
      appliesTo = [...(rawToken.appliesTo as string[])];
    }
    if (rawToken.fallback !== undefined && !isJsonObject(rawToken.fallback)) {
      issues.push(issue("contract.type", `${tokenPath}/fallback`, "fallback must be an object"));
      valid = false;
    }
    if (!isJsonObject(rawToken.card)) {
      issues.push(issue("contract.type", `${tokenPath}/card`, "card must be an object"));
      valid = false;
    }
    if (token && group && description && appliesTo && isJsonObject(rawToken.card)) {
      tokens.push({
        token,
        group,
        description,
        appliesTo,
        ...(isJsonObject(rawToken.fallback) ? { fallback: rawToken.fallback } : {}),
        card: rawToken.card,
      });
    } else {
      valid = false;
    }
  }
  return valid ? tokens : undefined;
}

function decodeSection(
  raw: unknown,
  path: string,
  issues: DecodeIssue[]
): ComponentCatalogSectionV1 | undefined {
  if (!isJsonObject(raw)) {
    issues.push(issue("contract.type", path, "section must be an object"));
    return undefined;
  }
  unknownKeys(raw, SECTION_KEYS, path, issues);
  const id = requiredString(raw.id, `${path}/id`, issues);
  const title = requiredString(raw.title, `${path}/title`, issues);
  const description = requiredString(raw.description, `${path}/description`, issues);

  const variants = ["card", "rows", "utilityTokens"].filter((key) => raw[key] !== undefined);
  if (variants.length !== 1) {
    issues.push(issue("contract.invariant", path, "section must define exactly one of card, rows or utilityTokens"));
    return undefined;
  }

  let card: JsonObject | undefined;
  let rows: ComponentStyleMatrixRowV1[] | undefined;
  let utilityTokens: ComponentUtilityTokenV1[] | undefined;
  if (raw.card !== undefined) {
    if (!isJsonObject(raw.card)) issues.push(issue("contract.type", `${path}/card`, "card must be an object"));
    else card = raw.card;
  } else if (raw.rows !== undefined) {
    rows = decodeRows(raw.rows, `${path}/rows`, issues);
  } else {
    utilityTokens = decodeTokens(raw.utilityTokens, `${path}/utilityTokens`, issues);
  }

  if (!id || !title || !description) return undefined;
  if (raw.card !== undefined && !card) return undefined;
  if (raw.rows !== undefined && !rows) return undefined;
  if (raw.utilityTokens !== undefined && !utilityTokens) return undefined;

  return {
    id,
    title,
    description,
    ...(card ? { card } : {}),
    ...(rows ? { rows } : {}),
    ...(utilityTokens ? { utilityTokens } : {}),
  };
}

export function decodeComponentCatalogV1(input: unknown): DecodeResult<ComponentCatalogV1> {
  const issues: DecodeIssue[] = [];
  if (!isJsonObject(input)) {
    return { ok: false, issues: [issue("contract.root_type", "", "component catalog must be a JSON object")] };
  }
  unknownKeys(input, CATALOG_KEYS, "", issues);
  if (input.formatVersion !== 1) {
    issues.push(issue("contract.unsupported_version", "/formatVersion", "only component catalog formatVersion 1 is supported"));
  }
  if (input.mediaType !== COMPONENT_CATALOG_MEDIA_TYPE) {
    issues.push(issue("contract.enum", "/mediaType", `mediaType must be ${COMPONENT_CATALOG_MEDIA_TYPE}`));
  }
  const profileReference = requiredString(input.profileReference, "/profileReference", issues);
  if (profileReference && !parseRenderProfileReference(profileReference)) {
    issues.push(issue("contract.pattern", "/profileReference", "profileReference must use id@version or id@latest"));
  }

  if (!Array.isArray(input.groups) || input.groups.length === 0) {
    issues.push(issue("contract.required", "/groups", "groups must be a non-empty array"));
    return { ok: false, issues };
  }

  const groups: ComponentCatalogGroupV1[] = [];
  const groupIds = new Set<string>();
  const sectionIds = new Set<string>();
  for (const [groupIndex, rawGroup] of input.groups.entries()) {
    const groupPath = `/groups/${groupIndex}`;
    if (!isJsonObject(rawGroup)) {
      issues.push(issue("contract.type", groupPath, "group must be an object"));
      continue;
    }
    unknownKeys(rawGroup, GROUP_KEYS, groupPath, issues);
    let id: ComponentCatalogCategory | undefined;
    if (typeof rawGroup.id !== "string" || !CATEGORY_SET.has(rawGroup.id)) {
      issues.push(issue("contract.enum", `${groupPath}/id`, `group id must be one of ${[...COMPONENT_CATALOG_CATEGORIES].join(", ")}`));
    } else {
      id = rawGroup.id as ComponentCatalogCategory;
      if (groupIds.has(id)) issues.push(issue("contract.duplicate", `${groupPath}/id`, `duplicate group id ${id}`));
      groupIds.add(id);
    }
    const title = requiredString(rawGroup.title, `${groupPath}/title`, issues);
    const description = requiredString(rawGroup.description, `${groupPath}/description`, issues);
    // A group can legitimately have zero sections (for example a utility group
    // whose tokens are gated off by the active render capabilities), so require
    // an array but allow it to be empty.
    if (!Array.isArray(rawGroup.sections)) {
      issues.push(issue("contract.type", `${groupPath}/sections`, "sections must be an array"));
      continue;
    }
    const sections: ComponentCatalogSectionV1[] = [];
    for (const [sectionIndex, rawSection] of rawGroup.sections.entries()) {
      const sectionPath = `${groupPath}/sections/${sectionIndex}`;
      const section = decodeSection(rawSection, sectionPath, issues);
      if (!section) continue;
      if (sectionIds.has(section.id)) issues.push(issue("contract.duplicate", `${sectionPath}/id`, `duplicate section id ${section.id}`));
      sectionIds.add(section.id);
      sections.push(section);
    }
    if (id && title && description && sections.length === rawGroup.sections.length) {
      groups.push({ id, title, description, sections });
    }
  }

  if (issues.length > 0 || !profileReference || groups.length !== input.groups.length) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    notices: [],
    value: {
      formatVersion: 1,
      mediaType: COMPONENT_CATALOG_MEDIA_TYPE,
      profileReference,
      groups,
    },
  };
}
