import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { readText } from "../fs.js";
import { renderHtml, sendText } from "./http.js";

interface StaticAssetOptions {
  basePath: string;
  forgeWebRoot: string;
  webRoot: string;
}

const FORGE_FILES: Record<string, [string, string]> = {
  "/forge/": ["index.html", "text/html"],
  "/forge/app.js": ["app.js", "text/javascript"],
  "/forge/app.js.map": ["app.js.map", "application/json"],
  "/forge/styles.css": ["styles.css", "text/css"],
};

const LEGACY_FILES: Record<string, [string, string]> = {
  "/": ["index.html", "text/html"],
  "/components": ["components.html", "text/html"],
  "/components/": ["components.html", "text/html"],
  "/install": ["install.html", "text/html"],
  "/install/": ["install.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/preview-kit.js": ["preview-kit.js", "text/javascript"],
  "/components.js": ["components.js", "text/javascript"],
  "/install.js": ["install.js", "text/javascript"],
  "/styles.css": ["styles.css", "text/css"],
};

export async function handleStaticAsset(
  req: IncomingMessage,
  res: ServerResponse,
  routePath: string,
  options: StaticAssetOptions,
): Promise<boolean> {
  if (req.method !== "GET") return false;

  const forgeFile = FORGE_FILES[routePath];
  if (forgeFile) {
    const content = await readText(path.join(options.forgeWebRoot, forgeFile[0]));
    sendText(res, 200, forgeFile[1], content);
    return true;
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
