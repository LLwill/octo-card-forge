import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CURRENT_RENDER_PROFILE,
  getCurrentRenderProfile,
} from "../packages/cli/src/registry.js";
import { decodeComponentCatalogV1 } from "../packages/card-spec/src/index.js";
import { createForgeServer, normalizeBasePath } from "../packages/cli/src/server.js";
import { NOTICE_CARD_ROOT } from "./card-fixtures.js";

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

  it("does not expose workspace Card source endpoints in published mode", async () => {
    const response = await fetch(`${baseUrl}/api/cards`);
    expect(response.status).toBe(404);
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
        handoffDownload: true,
      },
    });
  });

  it("does not compile repository Card source in published mode", async () => {
    const response = await fetch(`${baseUrl}/api/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cardId: "example.notice",
        view: "default",
        data: {},
      }),
    });
    expect(response.status).toBe(404);
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
    server = await createForgeServer({ cardRoot: NOTICE_CARD_ROOT });
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
      card: { id: "example.notice", reference: "example.notice", mutable: true },
      renderProfile: { reference: CURRENT_RENDER_PROFILE },
    });
    expect(session.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(session.views).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "default", samples: ["default"] })])
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
        cardId: "example.notice",
        revision: session.revision,
        view: "default",
        data: {
          title: "通知",
          message: "内容",
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
        cardId: "example.notice",
        revision: session.revision,
        view: "default",
        data: {},
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
        cardId: "example.notice",
        revision: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        view: "default",
        data: {},
      }),
    });
    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toMatchObject({ code: "preview.stale_revision" });
  });
});
