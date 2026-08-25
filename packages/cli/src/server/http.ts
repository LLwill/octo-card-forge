import type { IncomingMessage, ServerResponse } from "node:http";
import type { JsonObject } from "../types.js";

export function normalizeBasePath(value = "/"): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/+$/, "");
  const segments = normalized.split("/").slice(1);
  if (
    !normalized ||
    segments.some((segment) => segment === "." || segment === "..") ||
    !/^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+$/.test(normalized)
  ) {
    throw new Error(`Invalid BASE_PATH: ${value}`);
  }
  return normalized;
}

export function publicPath(basePath: string, pathname: string): string {
  return `${basePath}${pathname}` || "/";
}

export function stripBasePath(pathname: string, basePath: string): string | undefined {
  if (!basePath) return pathname;
  if (pathname === basePath || pathname === `${basePath}/`) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  return undefined;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function escapeInlineScript(value: string): string {
  return value
    .replaceAll("<", "\\u003C")
    .replaceAll(">", "\\u003E")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function renderHtml(value: string, basePath: string, appPath = ""): string {
  const baseHref = `${basePath}${appPath}/`;
  const runtimePath = escapeInlineScript(JSON.stringify(basePath));
  return value.replace(
    "<head>",
    `<head>\n    <base href="${escapeHtmlAttribute(baseHref)}" />\n    <script>window.__OCTO_BASE_PATH__ = ${runtimePath};</script>`,
  );
}

export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value, null, 2));
}

export function sendBinaryDownload(
  res: ServerResponse,
  fileName: string,
  contentType: string,
  value: Buffer,
): void {
  res.writeHead(200, {
    "content-type": contentType,
    "content-disposition": `attachment; filename="${fileName}"`,
    "content-length": value.byteLength,
    "cache-control": "no-store",
  });
  res.end(value);
}

export function sendText(
  res: ServerResponse,
  status: number,
  contentType: string,
  value: string,
): void {
  res.writeHead(status, { "content-type": `${contentType}; charset=utf-8` });
  res.end(value);
}

export function sendBuffer(
  res: ServerResponse,
  status: number,
  contentType: string,
  value: Buffer,
): void {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": value.byteLength,
  });
  res.end(value);
}

export async function readBody(req: IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 256 * 1024) throw new Error("Request body exceeds 256 KiB");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonObject;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
