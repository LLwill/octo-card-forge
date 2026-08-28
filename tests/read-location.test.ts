import { describe, expect, it, vi } from "vitest";
import {
  catalogDownloadOptions,
  readLocation,
} from "../scripts/lib/read-location.mjs";

const allowedOrigins = new Set(["https://example.test"]);

describe("bounded resource downloads", () => {
  it("retries a transient timeout", async () => {
    const successfulResponse = new Response("catalog", {
      status: 200,
      headers: { "content-length": "7" },
    });
    Object.defineProperty(successfulResponse, "url", {
      value: "https://example.test/catalog.json",
    });
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(successfulResponse);
    const log = vi.fn();

    const result = await readLocation("https://example.test/catalog.json", 32, {
      allowedOrigins,
      attempts: 3,
      fetchImpl,
      log,
      retryDelayMs: 1,
      sleep: async () => {},
      timeoutMs: 100,
    });

    expect(result.toString()).toBe("catalog");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("retrying"));
  });

  it("does not retry a permanent HTTP failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("missing", {
      status: 404,
    }));

    await expect(readLocation("https://example.test/missing.json", 32, {
      allowedOrigins,
      attempts: 3,
      fetchImpl,
      log: () => {},
      retryDelayMs: 1,
      sleep: async () => {},
      timeoutMs: 100,
    })).rejects.toThrow("Download failed (404)");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses resilient defaults without requiring CI variables", () => {
    expect(catalogDownloadOptions({})).toEqual({
      timeoutMs: 60_000,
      attempts: 3,
    });
  });
});
