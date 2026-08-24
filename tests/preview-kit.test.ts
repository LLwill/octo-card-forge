import { describe, expect, it } from "vitest";
import {
  PreviewApiError,
  PreviewClient,
  type PreviewFetch,
} from "@mlt-org/octo-card-preview-kit";

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(
    typeof body === "string" ? body : JSON.stringify(body),
    { status, headers: { "content-type": "application/json", ...headers } }
  );
}

describe("Preview Client", () => {
  it("keeps the base path and query parameters in every request", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: PreviewFetch = async (input, init) => {
      calls.push({ url: String(input), init });
      if (String(input).includes("host-config")) return response(200, { fontFamily: "system" });
      return response(200, {
        schemaVersion: 1,
        revision: "sha256:abc",
        card: {},
        renderProfile: {},
        views: [],
      });
    };
    const client = new PreviewClient({ baseUrl: "/phase1/", fetch: fetcher });

    await client.getSession("docs.access request");
    await client.getHostConfig("docs.access request");

    expect(calls.map((call) => call.url)).toEqual([
      "/phase1/api/preview/v1/session?cardId=docs.access+request",
      "/phase1/api/preview/v1/profile/host-config.json?cardId=docs.access+request",
    ]);
  });

  it("sends the revision and data as the render request", async () => {
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetcher: PreviewFetch = async (input, init) => {
      captured = { url: String(input), init };
      return response(200, {
        schemaVersion: 1,
        revision: "sha256:abc",
        valid: true,
        cardId: "docs.access-request",
        cardVersion: "0.2.0",
        contractVersion: "1.0.0",
        renderProfile: "octo-chat@1.2.0-rc.4",
        wireProfile: "octo/v2",
        view: "pending",
        payload: {},
        inspection: {},
        issues: [],
      });
    };
    const client = new PreviewClient({ baseUrl: "/phase1", fetch: fetcher });
    await client.render({
      cardId: "docs.access-request",
      revision: "sha256:abc",
      view: "pending",
      data: { state: "pending" },
    });

    expect(captured?.url).toBe("/phase1/api/preview/v1/render");
    expect(captured?.init?.method).toBe("POST");
    expect(JSON.parse(String(captured?.init?.body))).toMatchObject({
      cardId: "docs.access-request",
      revision: "sha256:abc",
      view: "pending",
      data: { state: "pending" },
    });
  });

  it("maps API errors to a typed error without losing the server code", async () => {
    const client = new PreviewClient({
      fetch: async () => response(409, {
        code: "preview.stale_revision",
        message: "The preview revision is stale; request a new session",
      }),
    });

    await expect(client.getSession()).rejects.toMatchObject({
      name: "PreviewApiError",
      status: 409,
      code: "preview.stale_revision",
    });
  });

  it("reads CSS as text", async () => {
    const client = new PreviewClient({
      fetch: async () => response(200, ".octo-card-profile {}", { "content-type": "text/css" }),
    });
    await expect(client.getStyles()).resolves.toBe(".octo-card-profile {}");
  });

  it("returns structured validation results for HTTP 422", async () => {
    const client = new PreviewClient({
      fetch: async () => response(422, {
        schemaVersion: 1,
        revision: "sha256:abc",
        valid: false,
        cardId: "docs.access-request",
        cardVersion: "0.2.0",
        contractVersion: "1.0.0",
        renderProfile: "octo-chat@1.2.0-rc.4",
        wireProfile: "octo/v2",
        view: "pending",
        payload: {},
        inspection: {},
        issues: [{ severity: "error", code: "contract.required", path: "$", message: "Required" }],
      }),
    });

    await expect(client.render({
      cardId: "docs.access-request",
      revision: "sha256:abc",
      view: "pending",
      data: {},
    })).resolves.toMatchObject({ valid: false, issues: [{ code: "contract.required" }] });
  });
});

describe("shared card renderer", () => {
  it("escapes markdown consistently", async () => {
    const { escapeMarkdownToHtml } = await import(
      "@mlt-org/octo-card-preview-kit"
    );
    expect(escapeMarkdownToHtml(`<b>&"'`)).toBe("&lt;b&gt;&amp;&quot;&#039;");
  });

  it("configures markdown processing and renders through the injected SDK", async () => {
    const { createCardRenderer } = await import(
      "@mlt-org/octo-card-preview-kit"
    );

    const calls: Array<Record<string, unknown>> = [];

    class FakeCard {
      hostConfig: unknown;
      onExecuteAction?: (action: unknown) => void;
      static onProcessMarkdown?: (
        text: string,
        result: { outputHtml?: string; didProcess: boolean }
      ) => void;
      parse(payload: unknown) {
        calls.push({ kind: "parse", payload });
      }
      render() {
        calls.push({ kind: "render" });
        return { rendered: true } as unknown as HTMLElement;
      }
    }
    const adaptiveCards = {
      AdaptiveCard: FakeCard,
      HostConfig: class {
        constructor(readonly config: unknown) {}
      },
    } as unknown as Parameters<typeof createCardRenderer>[0];

    const renderer = createCardRenderer(adaptiveCards);
    expect(typeof FakeCard.onProcessMarkdown).toBe("function");

    const result = { didProcess: false } as { outputHtml?: string; didProcess: boolean };
    FakeCard.onProcessMarkdown!("<x>", result);
    expect(result).toEqual({ outputHtml: "&lt;x&gt;", didProcess: true });

    const onAction = () => {};
    const element = renderer.renderCard({ type: "AdaptiveCard" }, { fontFamily: "x" }, { onAction });
    expect(element).toEqual({ rendered: true });
    expect(calls.map((call) => call.kind)).toEqual(["parse", "render"]);
  });
});
