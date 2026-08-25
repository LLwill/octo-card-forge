import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import {
  buildHandoffArchive,
  buildHandoffArchiveForCard,
} from "../handoff.js";
import {
  compileCard,
  compileCardPackage,
  compileSample,
  compileSampleFromPackage,
} from "../compiler.js";
import {
  getCard,
  getCurrentRenderProfile,
  getRenderProfile,
  listCards,
  resolveCardAssetPath,
} from "../registry.js";
import { readJson, readText, resolveInProject } from "../fs.js";
import type { JsonObject } from "../types.js";
import {
  publicPath,
  readBody,
  sendBinaryDownload,
  sendJson,
  sendText,
} from "./http.js";
import type { ServerContext } from "./types.js";

export async function handleLegacyApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  context: ServerContext,
  basePath: string,
): Promise<boolean> {
  if (req.method === "GET" && url.pathname === "/healthz") {
    sendJson(res, 200, { status: "ok" });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/cards") {
    const cards = context.card ? [context.card] : await listCards();
    sendJson(
      res,
      200,
      cards.map((card) => ({
        reference: card.reference,
        id: card.manifest.id,
        name: card.manifest.name,
        kind: card.kind,
        mutable: card.mutable,
        version: card.manifest.version,
        contractVersion: card.manifest.contractVersion,
        renderProfile: card.manifest.renderProfile,
        samples: Object.fromEntries(
          Object.entries(card.manifest.views).map(([view, definition]) => [
            view,
            definition.samples.map((sample) => path.basename(sample, ".json")),
          ]),
        ),
      })),
    );
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/install") {
    const packageManifest = await readJson<{
      name: string;
      version: string;
    }>(resolveInProject("package.json"));
    const skillManifest = await readJson<{
      skill: { name: string; version: string; entry: string };
      cli: { package: string; compatibleRange: string; recommendedVersion: string };
      renderProfiles: Array<{
        id: string;
        package: string;
        compatibleRange: string;
        recommendedVersion: string;
      }>;
    }>(resolveInProject("skills", "octo-design-cards", "skill-manifest.json"));
    const installManifest = await readJson<{
      skill: { bundleUrl: string; releaseUrl: string; sha256: string };
    }>(resolveInProject("web", "install-manifest.json"));
    const profile = context.profile ?? await getCurrentRenderProfile();
    const profileManifest = skillManifest.renderProfiles.find(
      (candidate) => candidate.id === profile.manifest.id,
    ) ?? skillManifest.renderProfiles[0];
    sendJson(res, 200, {
      cli: {
        package: packageManifest.name,
        version: packageManifest.version,
        compatibleRange: skillManifest.cli.compatibleRange,
        npmUrl: `https://www.npmjs.com/package/${packageManifest.name}/v/${packageManifest.version}`,
        installCommand: `npm install --save-dev ${packageManifest.name}@${packageManifest.version} ${profile.manifest.packageName}@${profile.manifest.version}`,
        initCommand: "npx --no-install octo-card agent init --target generic",
      },
      skill: {
        name: skillManifest.skill.name,
        version: skillManifest.skill.version,
        entry: skillManifest.skill.entry,
        bundleUrl: installManifest.skill.bundleUrl,
        releaseUrl: installManifest.skill.releaseUrl,
        sha256: installManifest.skill.sha256,
      },
      renderProfile: {
        id: profile.manifest.id,
        version: profile.manifest.version,
        source: profile.source ?? "workspace",
        package: profile.manifest.packageName,
        compatibility: profile.manifest.compatibility,
        compatibleRange: profileManifest?.compatibleRange,
      },
    });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/component-baseline") {
    const profile = context.profile ?? await getCurrentRenderProfile();
    if (!profile.componentCatalog) {
      sendJson(res, 500, {
        code: "component_catalog_missing",
        message: `Render profile ${profile.reference} does not carry a static component catalog`,
      });
      return true;
    }
    sendJson(res, 200, {
      reference: profile.reference,
      renderProfile: profile.manifest,
      hostConfig: profile.hostConfig,
      capabilities: profile.capabilities,
      stylesheetUrl: publicPath(basePath, `/api/render-styles/${encodeURIComponent(profile.reference)}`),
      catalog: profile.componentCatalog,
    });
    return true;
  }

  const handoffMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/handoff$/);
  if (req.method === "GET" && handoffMatch) {
    const cardId = decodeURIComponent(handoffMatch[1]);
    const archive = context.card
      ? await buildHandoffArchiveForCard(context.card, context.profile)
      : await buildHandoffArchive(cardId);
    sendBinaryDownload(res, archive.fileName, "application/zip", archive.buffer);
    return true;
  }

  const cardMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/(contract|context)$/);
  if (req.method === "GET" && cardMatch) {
    const cardReference = decodeURIComponent(cardMatch[1]);
    const card = context.card ?? await getCard(cardReference);
    if (cardMatch[2] === "contract") {
      const interactionReports = [];
      for (const [view, definition] of Object.entries(card.manifest.views)) {
        for (const samplePath of definition.samples) {
          const sample = path.basename(samplePath, path.extname(samplePath));
          const result = context.card
            ? await compileSampleFromPackage({
                card,
                sample,
                view,
                profile: context.profile,
              })
            : await compileSample({ cardId: card.reference, sample });
          interactionReports.push({
            sample,
            view,
            wireProfile: definition.wireProfile,
            inspection: result.inspection,
          });
        }
      }
      sendJson(res, 200, {
        cardId: card.manifest.id,
        cardReference: card.reference,
        cardVersion: card.manifest.version,
        contractVersion: card.manifest.contractVersion,
        schema: await readJson(
          resolveCardAssetPath(card.root, card.manifest.dataSchema, "dataSchema"),
        ),
        interactionReports,
      });
    } else {
      const profile = context.profile ?? await getRenderProfile(card.manifest.renderProfile);
      sendJson(res, 200, {
        card: card.manifest,
        package: {
          reference: card.reference,
          kind: card.kind,
          mutable: card.mutable,
        },
        renderProfile: profile.manifest,
        renderProfileSource: profile.source ?? "workspace",
        hostConfig: profile.hostConfig,
        stylesheetUrl: publicPath(basePath, `/api/render-styles/${encodeURIComponent(profile.reference)}`),
      });
    }
    return true;
  }

  const sampleMatch = url.pathname.match(/^\/api\/cards\/([^/]+)\/samples\/([^/]+)$/);
  if (req.method === "GET" && sampleMatch) {
    const sample = decodeURIComponent(sampleMatch[2]);
    const result = context.card
      ? await compileSampleFromPackage({
          card: context.card,
          sample,
          view: url.searchParams.get("view") ?? undefined,
          profile: context.profile,
        })
      : await compileSample({
          cardId: decodeURIComponent(sampleMatch[1]),
          sample,
        });
    sendJson(res, 200, result);
    return true;
  }

  const templateMatch = url.pathname.match(
    /^\/api\/cards\/([^/]+)\/views\/([^/]+)\/template$/,
  );
  if (req.method === "GET" && templateMatch) {
    const card = context.card ?? await getCard(decodeURIComponent(templateMatch[1]));
    const viewName = decodeURIComponent(templateMatch[2]);
    const view = card.manifest.views[viewName];
    if (!view) {
      sendJson(res, 404, { code: "view_not_found", message: `Unknown view: ${viewName}` });
      return true;
    }
    sendJson(res, 200, {
      cardId: card.manifest.id,
      cardReference: card.reference,
      view: viewName,
      wireProfile: view.wireProfile,
      template: await readJson(
        resolveCardAssetPath(card.root, view.template, `views.${viewName}.template`),
      ),
    });
    return true;
  }

  const styleMatch = url.pathname.match(/^\/api\/render-styles\/(.+)$/);
  if (req.method === "GET" && styleMatch) {
    const requested = decodeURIComponent(styleMatch[1]);
    const profile = context.profile && requested === context.profile.reference
      ? context.profile
      : await getRenderProfile(requested);
    const stylesheets = profile.stylesheets ?? [
      profile.manifest.theme
        ? await readText(path.join(profile.root, profile.manifest.theme))
        : "",
      await readText(path.join(profile.root, profile.manifest.stylesheet)),
    ].filter(Boolean);
    sendText(res, 200, "text/css", stylesheets.join("\n"));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/render") {
    const body = await readBody(req);
    if (
      typeof body.cardId !== "string" ||
      typeof body.view !== "string" ||
      typeof body.data !== "object" ||
      body.data === null ||
      Array.isArray(body.data)
    ) {
      sendJson(res, 400, {
        code: "invalid_request",
        message: "cardId, view and object data are required",
      });
      return true;
    }
    const result = context.card
      ? await compileCardPackage({
          card: context.card,
          view: body.view,
          data: body.data as JsonObject,
          profile: context.profile,
        })
      : await compileCard({
          cardId: body.cardId,
          view: body.view,
          data: body.data as JsonObject,
        });
    const valid = !result.issues.some((issue) => issue.severity === "error");
    sendJson(res, valid ? 200 : 422, { valid, ...result });
    return true;
  }

  return false;
}
