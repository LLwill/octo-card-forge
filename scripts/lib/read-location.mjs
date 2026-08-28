import { readFile } from "node:fs/promises";

export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 60_000;
export const DEFAULT_DOWNLOAD_ATTEMPTS = 3;

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function catalogDownloadOptions(env = process.env) {
  return {
    timeoutMs: positiveInteger(env.CATALOG_DOWNLOAD_TIMEOUT_MS, DEFAULT_DOWNLOAD_TIMEOUT_MS, "CATALOG_DOWNLOAD_TIMEOUT_MS"),
    attempts: positiveInteger(env.CATALOG_DOWNLOAD_ATTEMPTS, DEFAULT_DOWNLOAD_ATTEMPTS, "CATALOG_DOWNLOAD_ATTEMPTS"),
  };
}

function assertAllowedUrl(location, allowedOrigins) {
  const url = new URL(location);
  if (!allowedOrigins.has(url.origin)) throw new Error(`Resource origin is not allowed: ${url.origin}`);
  return url;
}

function retryable(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError" || error instanceof TypeError) return true;
  return Number.isInteger(error?.status) && (error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500);
}

function httpError(status, location) {
  const error = new Error(`Download failed (${status}): ${location}`);
  error.status = status;
  return error;
}

export async function readLocation(location, maximumBytes, options = {}) {
  if (!/^https:\/\//.test(location)) {
    if (/^[a-z]+:/i.test(location)) throw new Error(`Unsupported resource URL: ${location}`);
    const bytes = await readFile(location);
    if (bytes.byteLength > maximumBytes) throw new Error(`Resource exceeds size limit: ${location}`);
    return bytes;
  }

  const {
    allowedOrigins,
    attempts = DEFAULT_DOWNLOAD_ATTEMPTS,
    fetchImpl = fetch,
    log = console.error,
    retryDelayMs = 1_000,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS,
  } = options;
  if (!(allowedOrigins instanceof Set)) throw new Error("allowedOrigins is required for HTTPS resources");
  assertAllowedUrl(location, allowedOrigins);

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      log(`Downloading ${location} (attempt ${attempt}/${attempts})`);
      const response = await fetchImpl(location, {
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw httpError(response.status, location);
      assertAllowedUrl(response.url, allowedOrigins);
      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (contentLength > maximumBytes) throw new Error(`Resource exceeds size limit: ${location}`);
      if (!response.body) return Buffer.alloc(0);
      const chunks = [];
      let total = 0;
      for await (const chunk of response.body) {
        const bytes = Buffer.from(chunk);
        total += bytes.byteLength;
        if (total > maximumBytes) throw new Error(`Resource exceeds size limit: ${location}`);
        chunks.push(bytes);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !retryable(error)) throw error;
      log(`Download attempt ${attempt} failed for ${location}: ${error.message}; retrying`);
      await sleep(retryDelayMs * attempt);
    }
  }
  throw lastError;
}
