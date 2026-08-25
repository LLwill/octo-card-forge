import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CURRENT_RENDER_PROFILE,
  getCurrentRenderProfile,
} from "../packages/cli/src/registry.js";
import { decodeComponentCatalogV1 } from "../packages/card-spec/src/index.js";
import { createForgeServer, normalizeBasePath } from "../packages/cli/src/server.js";

describe("server base path", () => {
  it("normalizes valid public URL prefixes", () => {
    expect(normalizeBasePath()).toBe("");
    expect(normalizeBasePath("/")).toBe("");
    expect(normalizeBasePath("card-forge")).toBe("/card-forge");
    expect(normalizeBasePath("/card-forge/")).toBe("/card-forge");
  });

  it("rejects values that are not URL path prefixes", () => {
    for (const value of ["/card forge", "/card?forge", "/card\"forge", "/../card"]) {
      expect(() => normalizeBasePath(value)).toThrow("Invalid BASE_PATH");
    }
  });
});

describe("catalog HTTP API", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createForgeServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it("exposes distinct draft and release package identities", async () => {
    const response = await fetch(`${baseUrl}/api/cards`);
    const cards = await response.json() as Array<{
      reference: string;
      kind: "draft" | "release";
      mutable: boolean;
    }>;
    const references = cards.map((card) => card.reference);

    expect(response.status).toBe(200);
    expect(new Set(references).size).toBe(references.length);
    expect(cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reference: "docs.access-request",
          kind: "draft",
          mutable: true,
        }),
        expect.objectContaining({
          reference: "docs.access-request@0.3.0",
          kind: "release",
          mutable: false,
        }),
      ])
    );
  });

  it("describes the default published runtime capabilities", async () => {
    const response = await fetch(`${baseUrl}/api/v1/runtime`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      schemaVersion: 1,
      mode: "published",
      capabilities: {
        cardCatalog: true,
        componentCatalog: true,
        templateDataPreview: false,
        rawCardPreview: true,
        handoffDownload: false,
      },
    });
  });

  it("compiles a draft sample through its stable card id", async () => {
    const response = await fetch(
      `${baseUrl}/api/cards/docs.access-request/samples/pending`
    );
    const result = await response.json() as {
      cardId: string;
      cardVersion: string;
      renderProfile: string;
      payload: { type: string; version: string };
      issues: unknown[];
    };

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      cardId: "docs.access-request",
      cardVersion: "0.2.0",
      renderProfile: CURRENT_RENDER_PROFILE,
      payload: { type: "AdaptiveCard", version: "1.5" },
      issues: [],
    });
  });

  it("returns 422 with contract issues for invalid render data", async () => {
    const response = await fetch(`${baseUrl}/api/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cardId: "docs.access-request",
        view: "pending",
        data: { state: "pending" },
      }),
    });
    const result = await response.json() as {
      valid: boolean;
      issues: Array<{ code: string }>;
    };

    expect(response.status).toBe(422);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "contract.required" })])
    );
  });

  it("serves the current Profile CSS for an unbound catalog session", async () => {
    const response = await fetch(`${baseUrl}/api/preview/v1/profile/styles.css`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(".octo-card-profile");
  });

  it("serves the browser Preview Kit entrypoint", async () => {
    const response = await fetch(`${baseUrl}/preview-kit.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(await response.text()).toContain("createPreviewClient");
  });

  it("serves the Profile's static component catalog as the single runtime source", async () => {
    const response = await fetch(`${baseUrl}/api/v1/components`);
    expect(response.status).toBe(200);
    const body = await response.json() as {
      catalog: unknown;
      sections?: unknown;
    };

    const decoded = decodeComponentCatalogV1(body.catalog);
    expect(decoded.ok, JSON.stringify(!decoded.ok ? decoded.issues : [])).toBe(true);
    if (decoded.ok) {
      expect(decoded.value.groups.map((group) => group.id)).toEqual([
        "foundation",
        "adaptive-card-components",
        "octo-utility-tokens",
        "composition-patterns",
      ]);
    }

    // The endpoint must pass through the Profile-carried catalog verbatim, not
    // regenerate it on request, so the Profile stays the single source of truth.
    const profile = await getCurrentRenderProfile();
    expect(profile.componentCatalog).toBeDefined();
    expect(body.catalog).toEqual(profile.componentCatalog);

    // The legacy runtime-generated top-level sections field is gone.
    expect(body.sections).toBeUndefined();
  });

  it("fails closed when the active Profile does not carry a component catalog", async () => {
    const profile = await getCurrentRenderProfile();
    const { componentCatalog: _componentCatalog, ...legacyProfile } = profile;
    const unboundServer = await createForgeServer({ profile: legacyProfile });
    await new Promise<void>((resolve, reject) => {
      unboundServer.once("error", reject);
      unboundServer.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = unboundServer.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/component-baseline`
      );
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toMatchObject({
        code: "component_catalog_missing",
        message: `Render profile ${CURRENT_RENDER_PROFILE} does not carry a static component catalog`,
      });
      expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        unboundServer.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});

describe("Preview API v1", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createForgeServer({ cardRoot: "cards/docs.access-request" });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it("exposes a path-free session and profile assets", async () => {
    const sessionResponse = await fetch(`${baseUrl}/api/v1/preview/session`);
    const session = await sessionResponse.json() as {
      schemaVersion: number;
      revision: string;
      card: { id: string; reference: string; mutable: boolean };
      renderProfile: { reference: string; manifest: Record<string, unknown> };
      views: Array<{ name: string; samples: string[] }>;
    };

    expect(sessionResponse.status).toBe(200);
    expect(session).toMatchObject({
      schemaVersion: 1,
      card: { id: "docs.access-request", reference: "docs.access-request", mutable: true },
      renderProfile: { reference: CURRENT_RENDER_PROFILE },
    });
    expect(session.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(session.views).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "pending", samples: ["pending"] })])
    );
    expect(JSON.stringify(session)).not.toContain(process.cwd());

    const hostConfigResponse = await fetch(
      `${baseUrl}/api/preview/v1/profile/host-config.json`
    );
    expect(hostConfigResponse.status).toBe(200);
    expect(hostConfigResponse.headers.get("content-type")).toContain("application/json");
    expect(await hostConfigResponse.json()).toHaveProperty("fontFamily");

    const stylesResponse = await fetch(`${baseUrl}/api/preview/v1/profile/styles.css`);
    expect(stylesResponse.status).toBe(200);
    expect(stylesResponse.headers.get("content-type")).toContain("text/css");
    expect(await stylesResponse.text()).toContain(".ac-");
  });

  it("describes workspace-only preview capabilities", async () => {
    const response = await fetch(`${baseUrl}/api/v1/runtime`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: 1,
      mode: "workspace",
      capabilities: {
        cardCatalog: true,
        componentCatalog: true,
        templateDataPreview: true,
        rawCardPreview: true,
        handoffDownload: true,
      },
    });
  });

  it("renders through the session revision and returns Core diagnostics", async () => {
    const session = await (await fetch(`${baseUrl}/api/v1/preview/session`)).json() as {
      revision: string;
    };
    const response = await fetch(`${baseUrl}/api/v1/preview/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cardId: "docs.access-request",
        revision: session.revision,
        view: "pending",
        data: {
          requestId: "DOC-REQ-024",
          state: "pending",
          document: {
            title: "2026 Q3 OKR",
            url: "https://example.com/documents/2026-q3-okr",
            sourceName: "Q3 产品规划",
          },
          requester: {
            name: "张三",
            avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Zhang%20San",
          },
          permission: { label: "协作权限", roleLabel: "协作者" },
          requestReason: "希望加入协作，以补充 KR3 数据。",
          requestedAtDisplay: "2026-07-16 11:00",
          messageTimeDisplay: "11:03",
        },
      }),
    });
    const result = await response.json() as {
      schemaVersion: number;
      revision: string;
      valid: boolean;
      payload: { type: string; version: string };
      issues: unknown[];
    };

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      schemaVersion: 1,
      revision: session.revision,
      valid: true,
      payload: { type: "AdaptiveCard", version: "1.5" },
      issues: [],
    });
  });

  it("returns 422 for invalid data and 409 for a stale revision", async () => {
    const session = await (await fetch(`${baseUrl}/api/preview/v1/session`)).json() as {
      revision: string;
    };
    const invalidResponse = await fetch(`${baseUrl}/api/preview/v1/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cardId: "docs.access-request",
        revision: session.revision,
        view: "pending",
        data: { state: "pending" },
      }),
    });
    const invalid = await invalidResponse.json() as {
      valid: boolean;
      issues: Array<{ code: string }>;
    };
    expect(invalidResponse.status).toBe(422);
    expect(invalid.valid).toBe(false);
    expect(invalid.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "contract.required" })])
    );

    const staleResponse = await fetch(`${baseUrl}/api/preview/v1/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cardId: "docs.access-request",
        revision: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        view: "pending",
        data: {},
      }),
    });
    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toMatchObject({ code: "preview.stale_revision" });
  });
});
