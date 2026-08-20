import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createForgeServer, normalizeBasePath } from "../src/server.js";

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
      renderProfile: "octo-chat@1.2.0-rc.3",
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
});
