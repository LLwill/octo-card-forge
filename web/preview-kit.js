var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

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
  PreviewApiError,
  PreviewClient,
  createCardRenderer,
  createPreviewClient,
  escapeMarkdownToHtml
};
