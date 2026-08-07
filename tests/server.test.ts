import { describe, expect, it } from "vitest";
import { normalizeBasePath } from "../src/server.js";

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
