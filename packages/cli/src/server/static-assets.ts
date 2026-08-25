import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readText } from "../fs.js";
import { publicPath, renderHtml, sendBuffer, sendText } from "./http.js";

interface StaticAssetOptions {
  basePath: string;
  forgeWebRoot: string;
  webRoot: string;
}

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const LEGACY_FILES: Record<string, [string, string]> = {
  "/preview-kit.js": ["preview-kit.js", "text/javascript"],
};

const LEGACY_REDIRECTS: Record<string, string> = {
  "/": "/forge/cards",
  "/components": "/forge/components",
  "/components/": "/forge/components",
  "/install": "/forge/install",
  "/install/": "/forge/install",
};

export async function handleStaticAsset(
  req: IncomingMessage,
  res: ServerResponse,
  routePath: string,
  options: StaticAssetOptions,
): Promise<boolean> {
  if (req.method !== "GET") return false;

  const redirect = LEGACY_REDIRECTS[routePath];
  if (redirect) {
    res.writeHead(308, { location: publicPath(options.basePath, redirect) });
    res.end();
    return true;
  }

  if (routePath === "/forge" || routePath.startsWith("/forge/")) {
    const requestedPath = decodeForgePath(routePath);
    if (requestedPath === undefined) return false;
    const asset = await readForgeAsset(options.forgeWebRoot, requestedPath);
    if (asset) {
      if (asset.fileName === "index.html") {
        sendText(res, 200, "text/html", renderHtml(asset.buffer.toString("utf8"), options.basePath, "/forge"));
      } else {
        sendBuffer(res, 200, contentTypeFor(asset.fileName), asset.buffer);
      }
      return true;
    }

    if (!requestedPath.startsWith("assets/")) {
      const index = await readFile(path.join(options.forgeWebRoot, "index.html"));
      sendText(res, 200, "text/html", renderHtml(index.toString("utf8"), options.basePath, "/forge"));
      return true;
    }
  }

  const legacyFile = LEGACY_FILES[routePath];
  if (legacyFile) {
    const content = await readText(path.join(options.webRoot, legacyFile[0]));
    sendText(
      res,
      200,
      legacyFile[1],
      legacyFile[1] === "text/html" ? renderHtml(content, options.basePath) : content,
    );
    return true;
  }

  return false;
}

function decodeForgePath(routePath: string): string | undefined {
  try {
    const relative = decodeURIComponent(routePath.slice("/forge/".length)) || "index.html";
    if (relative.split("/").some((segment) => segment === "..")) return undefined;
    return relative;
  } catch {
    return undefined;
  }
}

async function readForgeAsset(
  root: string,
  relativePath: string,
): Promise<{ fileName: string; buffer: Buffer } | undefined> {
  const resolvedRoot = path.resolve(root);
  const fileName = path.resolve(resolvedRoot, relativePath);
  if (fileName !== resolvedRoot && !fileName.startsWith(`${resolvedRoot}${path.sep}`)) return undefined;
  try {
    return { fileName: relativePath, buffer: await readFile(fileName) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function contentTypeFor(fileName: string): string {
  return CONTENT_TYPES[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
}
