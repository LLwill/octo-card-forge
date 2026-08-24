export type JsonObject = Record<string, unknown>;

// Re-export the versioned Component Catalog contract so browser bundles that
// only load preview-kit can decode /api/component-baseline responses without a
// separate card-spec bundle. card-spec is dependency-free, so this keeps the
// browser bundle self-contained.
export {
  decodeComponentCatalogV1,
  COMPONENT_CATALOG_MEDIA_TYPE,
  COMPONENT_CATALOG_CATEGORIES,
  STYLE_MATRIX_PREVIEWS,
} from "@mlt-org/octo-card-spec";
export type {
  ComponentCatalogV1,
  ComponentCatalogGroupV1,
  ComponentCatalogSectionV1,
  ComponentCatalogCategory,
  ComponentStyleMatrixRowV1,
  ComponentUtilityTokenV1,
  StyleMatrixPreview,
} from "@mlt-org/octo-card-spec";

export interface PreviewView {
  name: string;
  wireProfile: string;
  states?: string[];
  submitActions?: string[];
  samples: string[];
}

export interface PreviewSession {
  schemaVersion: 1;
  revision: string;
  card: {
    reference: string;
    id: string;
    name: string;
    version: string;
    mutable: boolean;
  };
  renderProfile: {
    reference: string;
    source: string;
    manifest: PreviewRenderProfileManifest;
  };
  views: PreviewView[];
}

export interface PreviewRenderProfileManifest {
  id: string;
  version: string;
  compatibility?: string;
  packageName?: string;
  adaptiveCardsSdkVersion: string;
  hostConfig: string;
  theme?: string;
  stylesheet: string;
  tokens?: string;
  capabilities: string;
}

export interface PreviewRenderRequest {
  cardId: string;
  revision: string;
  view: string;
  data: JsonObject;
}

export interface PreviewRenderResponse {
  schemaVersion: 1;
  revision: string;
  valid: boolean;
  cardId: string;
  cardVersion: string;
  contractVersion: string;
  renderProfile: string;
  wireProfile: string;
  view: string;
  payload: JsonObject;
  inspection: unknown;
  issues: Array<{
    severity: "error" | "warning";
    code: string;
    path: string;
    message: string;
  }>;
}

export type PreviewFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface PreviewClientOptions {
  /** Relative base path such as `/phase1`, or an absolute service URL. */
  baseUrl?: string;
  fetch?: PreviewFetch;
}

export class PreviewApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "PreviewApiError";
  }
}

function normalizeBaseUrl(value: string | undefined): string {
  const base = value?.trim() ?? "";
  if (!base || base === "/") return "";
  return base.replace(/\/+$/, "");
}

function endpoint(
  baseUrl: string,
  pathname: string,
  query: Record<string, string | undefined> = {}
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const suffix = params.toString();
  return `${baseUrl}${pathname}${suffix ? `?${suffix}` : ""}`;
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorFromResponse(status: number, body: unknown): PreviewApiError {
  const object = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const code = typeof object.code === "string" ? object.code : "preview.http_error";
  const message = typeof object.message === "string"
    ? object.message
    : `Preview request failed with HTTP ${status}`;
  return new PreviewApiError(status, code, message, body);
}

export class PreviewClient {
  readonly baseUrl: string;
  private readonly fetcher: PreviewFetch;

  constructor(options: PreviewClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async getSession(cardId?: string): Promise<PreviewSession> {
    return this.requestJson<PreviewSession>(
      endpoint(this.baseUrl, "/api/preview/v1/session", { cardId })
    );
  }

  async render(request: PreviewRenderRequest): Promise<PreviewRenderResponse> {
    const response = await this.fetcher(
      endpoint(this.baseUrl, "/api/preview/v1/render"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
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

  async getHostConfig(cardId?: string): Promise<JsonObject> {
    return this.requestJson<JsonObject>(
      endpoint(this.baseUrl, "/api/preview/v1/profile/host-config.json", { cardId })
    );
  }

  async getStyles(cardId?: string): Promise<string> {
    const response = await this.fetcher(
      endpoint(this.baseUrl, "/api/preview/v1/profile/styles.css", { cardId }),
      { headers: { accept: "text/css" } }
    );
    if (!response.ok) throw errorFromResponse(response.status, await readJsonBody(response));
    return response.text();
  }

  private async requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(url, init);
    const body = await readJsonBody(response);
    if (!response.ok) throw errorFromResponse(response.status, body);
    if (body === undefined) {
      throw new PreviewApiError(
        response.status,
        "preview.invalid_response",
        "Preview service returned an empty response"
      );
    }
    return body as T;
  }
}

function isPreviewRenderResponse(value: unknown): value is PreviewRenderResponse {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Partial<PreviewRenderResponse>;
  return body.schemaVersion === 1 &&
    typeof body.revision === "string" &&
    typeof body.valid === "boolean" &&
    typeof body.cardId === "string" &&
    typeof body.view === "string" &&
    Array.isArray(body.issues);
}

export function createPreviewClient(options: PreviewClientOptions = {}): PreviewClient {
  return new PreviewClient(options);
}

// --- Shared Adaptive Cards browser renderer -------------------------------
//
// Both the Card preview page and the Component preview page render Adaptive
// Cards in the browser using the CDN-loaded `AdaptiveCards` global. They used
// to each configure markdown escaping and instantiate the card the same way,
// which is exactly the duplication Phase 3D removes. This is the single shared
// rendering adapter for every in-browser preview surface.
//
// The renderer takes the `AdaptiveCards` namespace by injection so this package
// stays dependency-free and works with whatever SDK build the host page loads.

export interface AdaptiveCardInstance {
  hostConfig: unknown;
  onExecuteAction?: (action: unknown) => void;
  parse(payload: unknown): void;
  render(): HTMLElement | undefined;
}

export interface AdaptiveCardsNamespace {
  AdaptiveCard: {
    new (): AdaptiveCardInstance;
    onProcessMarkdown?: (
      text: string,
      result: { outputHtml?: string; didProcess: boolean }
    ) => void;
  };
  HostConfig: new (config: unknown) => unknown;
}

export interface RenderCardOptions {
  onAction?: (action: unknown) => void;
}

export interface CardRenderer {
  renderCard(
    payload: unknown,
    hostConfig: unknown,
    options?: RenderCardOptions
  ): HTMLElement | undefined;
}

/** Escape raw markdown text to HTML the same way across every preview surface. */
export function escapeMarkdownToHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Configure the shared markdown processing and return a renderer bound to the
 * supplied `AdaptiveCards` namespace. Call once per page after the SDK global
 * is available.
 */
export function createCardRenderer(
  adaptiveCards: AdaptiveCardsNamespace
): CardRenderer {
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
    },
  };
}
