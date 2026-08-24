var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// packages/card-spec/src/json.ts
function isJsonObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// packages/card-spec/src/diagnostics.ts
function issue(code, path, message, details) {
  return details ? { code, path, message, details } : { code, path, message };
}

// packages/card-spec/src/identifiers.ts
var RENDER_PROFILE_PATTERN = /^([a-z][a-z0-9.-]*)@(latest|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
function parseRenderProfileReference(value) {
  if (typeof value !== "string") return void 0;
  const match = RENDER_PROFILE_PATTERN.exec(value);
  if (!match) return void 0;
  return {
    id: match[1],
    version: match[2] === "latest" ? "latest" : match[2]
  };
}

// packages/card-spec/src/component-catalog-v1.ts
var COMPONENT_CATALOG_MEDIA_TYPE = "application/vnd.octo.component-catalog+json;version=1";
var COMPONENT_CATALOG_CATEGORIES = [
  "foundation",
  "adaptive-card-components",
  "octo-utility-tokens",
  "composition-patterns"
];
var STYLE_MATRIX_PREVIEWS = ["text", "color", "spacing", "radius"];
var CATALOG_KEYS = /* @__PURE__ */ new Set(["formatVersion", "mediaType", "profileReference", "groups"]);
var GROUP_KEYS = /* @__PURE__ */ new Set(["id", "title", "description", "sections"]);
var SECTION_KEYS = /* @__PURE__ */ new Set(["id", "title", "description", "card", "rows", "utilityTokens"]);
var ROW_KEYS = /* @__PURE__ */ new Set(["name", "value", "description", "preview"]);
var TOKEN_KEYS = /* @__PURE__ */ new Set(["token", "group", "description", "appliesTo", "fallback", "card"]);
var CATEGORY_SET = new Set(COMPONENT_CATALOG_CATEGORIES);
var PREVIEW_SET = new Set(STYLE_MATRIX_PREVIEWS);
function escapePointer(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
function unknownKeys(value, allowed, path, issues) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(issue("contract.unknown_property", `${path}/${escapePointer(key)}`, `unknown property ${key}`));
    }
  }
}
function requiredString(value, path, issues) {
  if (!isNonEmptyString(value)) {
    issues.push(issue("contract.required", path, "value must be a non-empty string"));
    return void 0;
  }
  return value;
}
function decodeRows(raw, path, issues) {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push(issue("contract.type", path, "rows must be a non-empty array"));
    return void 0;
  }
  const rows = [];
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
    let preview;
    if (typeof rawRow.preview !== "string" || !PREVIEW_SET.has(rawRow.preview)) {
      issues.push(issue("contract.enum", `${rowPath}/preview`, `preview must be one of ${[...STYLE_MATRIX_PREVIEWS].join(", ")}`));
    } else {
      preview = rawRow.preview;
    }
    if (name && value && description && preview) rows.push({ name, value, description, preview });
    else valid = false;
  }
  return valid ? rows : void 0;
}
function decodeTokens(raw, path, issues) {
  if (!Array.isArray(raw) || raw.length === 0) {
    issues.push(issue("contract.type", path, "utilityTokens must be a non-empty array"));
    return void 0;
  }
  const tokens = [];
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
    let appliesTo;
    if (!Array.isArray(rawToken.appliesTo) || rawToken.appliesTo.length === 0 || !rawToken.appliesTo.every((entry) => isNonEmptyString(entry))) {
      issues.push(issue("contract.type", `${tokenPath}/appliesTo`, "appliesTo must be a non-empty array of strings"));
    } else {
      appliesTo = [...rawToken.appliesTo];
    }
    if (rawToken.fallback !== void 0 && !isJsonObject(rawToken.fallback)) {
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
        ...isJsonObject(rawToken.fallback) ? { fallback: rawToken.fallback } : {},
        card: rawToken.card
      });
    } else {
      valid = false;
    }
  }
  return valid ? tokens : void 0;
}
function decodeSection(raw, path, issues) {
  if (!isJsonObject(raw)) {
    issues.push(issue("contract.type", path, "section must be an object"));
    return void 0;
  }
  unknownKeys(raw, SECTION_KEYS, path, issues);
  const id = requiredString(raw.id, `${path}/id`, issues);
  const title = requiredString(raw.title, `${path}/title`, issues);
  const description = requiredString(raw.description, `${path}/description`, issues);
  const variants = ["card", "rows", "utilityTokens"].filter((key) => raw[key] !== void 0);
  if (variants.length !== 1) {
    issues.push(issue("contract.invariant", path, "section must define exactly one of card, rows or utilityTokens"));
    return void 0;
  }
  let card;
  let rows;
  let utilityTokens;
  if (raw.card !== void 0) {
    if (!isJsonObject(raw.card)) issues.push(issue("contract.type", `${path}/card`, "card must be an object"));
    else card = raw.card;
  } else if (raw.rows !== void 0) {
    rows = decodeRows(raw.rows, `${path}/rows`, issues);
  } else {
    utilityTokens = decodeTokens(raw.utilityTokens, `${path}/utilityTokens`, issues);
  }
  if (!id || !title || !description) return void 0;
  if (raw.card !== void 0 && !card) return void 0;
  if (raw.rows !== void 0 && !rows) return void 0;
  if (raw.utilityTokens !== void 0 && !utilityTokens) return void 0;
  return {
    id,
    title,
    description,
    ...card ? { card } : {},
    ...rows ? { rows } : {},
    ...utilityTokens ? { utilityTokens } : {}
  };
}
function decodeComponentCatalogV1(input) {
  const issues = [];
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
  const groups = [];
  const groupIds = /* @__PURE__ */ new Set();
  const sectionIds = /* @__PURE__ */ new Set();
  for (const [groupIndex, rawGroup] of input.groups.entries()) {
    const groupPath = `/groups/${groupIndex}`;
    if (!isJsonObject(rawGroup)) {
      issues.push(issue("contract.type", groupPath, "group must be an object"));
      continue;
    }
    unknownKeys(rawGroup, GROUP_KEYS, groupPath, issues);
    let id;
    if (typeof rawGroup.id !== "string" || !CATEGORY_SET.has(rawGroup.id)) {
      issues.push(issue("contract.enum", `${groupPath}/id`, `group id must be one of ${[...COMPONENT_CATALOG_CATEGORIES].join(", ")}`));
    } else {
      id = rawGroup.id;
      if (groupIds.has(id)) issues.push(issue("contract.duplicate", `${groupPath}/id`, `duplicate group id ${id}`));
      groupIds.add(id);
    }
    const title = requiredString(rawGroup.title, `${groupPath}/title`, issues);
    const description = requiredString(rawGroup.description, `${groupPath}/description`, issues);
    if (!Array.isArray(rawGroup.sections)) {
      issues.push(issue("contract.type", `${groupPath}/sections`, "sections must be an array"));
      continue;
    }
    const sections = [];
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
      groups
    }
  };
}

// packages/preview-kit/src/index.ts
var PreviewApiError = class extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = "PreviewApiError";
  }
};
function normalizeBaseUrl(value) {
  const base = value?.trim() ?? "";
  if (!base || base === "/") return "";
  return base.replace(/\/+$/, "");
}
function endpoint(baseUrl, pathname, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== void 0 && value !== "") params.set(key, value);
  }
  const suffix = params.toString();
  return `${baseUrl}${pathname}${suffix ? `?${suffix}` : ""}`;
}
async function readJsonBody(response) {
  const text = await response.text();
  if (!text) return void 0;
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function errorFromResponse(status, body) {
  const object = typeof body === "object" && body !== null ? body : {};
  const code = typeof object.code === "string" ? object.code : "preview.http_error";
  const message = typeof object.message === "string" ? object.message : `Preview request failed with HTTP ${status}`;
  return new PreviewApiError(status, code, message, body);
}
var PreviewClient = class {
  constructor(options = {}) {
    __publicField(this, "baseUrl");
    __publicField(this, "fetcher");
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }
  async getSession(cardId) {
    return this.requestJson(
      endpoint(this.baseUrl, "/api/preview/v1/session", { cardId })
    );
  }
  async render(request) {
    const response = await this.fetcher(
      endpoint(this.baseUrl, "/api/preview/v1/render"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      }
    );
    const body = await readJsonBody(response);
    if (response.status === 422 && isPreviewRenderResponse(body)) {
      return body;
    }
    if (!response.ok) throw errorFromResponse(response.status, body);
    if (!isPreviewRenderResponse(body)) {
      throw new PreviewApiError(
        response.status,
        "preview.invalid_response",
        "Preview service returned an invalid render response",
        body
      );
    }
    return body;
  }
  async getHostConfig(cardId) {
    return this.requestJson(
      endpoint(this.baseUrl, "/api/preview/v1/profile/host-config.json", { cardId })
    );
  }
  async getStyles(cardId) {
    const response = await this.fetcher(
      endpoint(this.baseUrl, "/api/preview/v1/profile/styles.css", { cardId }),
      { headers: { accept: "text/css" } }
    );
    if (!response.ok) throw errorFromResponse(response.status, await readJsonBody(response));
    return response.text();
  }
  async requestJson(url, init) {
    const response = await this.fetcher(url, init);
    const body = await readJsonBody(response);
    if (!response.ok) throw errorFromResponse(response.status, body);
    if (body === void 0) {
      throw new PreviewApiError(
        response.status,
        "preview.invalid_response",
        "Preview service returned an empty response"
      );
    }
    return body;
  }
};
function isPreviewRenderResponse(value) {
  if (typeof value !== "object" || value === null) return false;
  const body = value;
  return body.schemaVersion === 1 && typeof body.revision === "string" && typeof body.valid === "boolean" && typeof body.cardId === "string" && typeof body.view === "string" && Array.isArray(body.issues);
}
function createPreviewClient(options = {}) {
  return new PreviewClient(options);
}
function escapeMarkdownToHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function createCardRenderer(adaptiveCards) {
  adaptiveCards.AdaptiveCard.onProcessMarkdown = (text, result) => {
    result.outputHtml = escapeMarkdownToHtml(text);
    result.didProcess = true;
  };
  return {
    renderCard(payload, hostConfig, options = {}) {
      const card = new adaptiveCards.AdaptiveCard();
      card.hostConfig = new adaptiveCards.HostConfig(hostConfig);
      if (options.onAction) card.onExecuteAction = options.onAction;
      card.parse(payload);
      return card.render();
    }
  };
}
export {
  COMPONENT_CATALOG_CATEGORIES,
  COMPONENT_CATALOG_MEDIA_TYPE,
  PreviewApiError,
  PreviewClient,
  STYLE_MATRIX_PREVIEWS,
  createCardRenderer,
  createPreviewClient,
  decodeComponentCatalogV1,
  escapeMarkdownToHtml
};
