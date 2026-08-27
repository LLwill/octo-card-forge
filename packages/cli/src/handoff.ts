import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { resolveCardArtifactForCard, type ResolvedCardArtifact } from "./artifact.js";
import type { CardInspection, CardPackage, JsonObject, RenderProfileSource } from "./types.js";

/** Keep the persisted interaction report aligned with the strict server decoder. */
function toServerInteractionReport(inspection: CardInspection): JsonObject {
  return {
    actions: inspection.actions.map(({ path: _path, ...action }) => action),
    inputs: inspection.inputs.map(({ path: _path, ...input }) => input),
  };
}

function handoffFromArtifact(
  card: CardPackage,
  context: ResolvedCardArtifact
): JsonObject {
  const views: JsonObject = {};
  for (const [viewName, sourceView] of Object.entries(card.manifest.views)) {
    const artifactView = context.artifact.views[viewName];
    if (!artifactView) {
      throw new Error(`Artifact is missing view ${viewName}`);
    }
    const samplesByName = new Map(
      artifactView.samples.map((sample) => [sample.name, sample])
    );
    const samples = sourceView.samples.map((samplePath) => {
      const sampleName = path.basename(samplePath, path.extname(samplePath));
      const sample = samplesByName.get(sampleName);
      if (!sample) throw new Error(`Artifact is missing sample ${viewName}/${sampleName}`);
      return sample;
    });
    const reportSample = samples[0];
    views[viewName] = {
      wireProfile: artifactView.wireProfile,
      states: artifactView.states,
      submit_actions: artifactView.submit_actions,
      template: artifactView.template,
      samples,
      interactionReport: reportSample
        ? toServerInteractionReport(reportSample.inspection)
        : { actions: [], inputs: [] },
    };
  }

  return {
    formatVersion: 1,
    generatedBy: "octo-card-forge",
    card: card.manifest,
    renderProfile: {
      requested: context.requestedRenderProfile,
      resolved: context.artifact.profile.reference,
      manifest: context.artifact.profile.manifest,
      capabilities: context.artifact.profile.capabilities,
      server: {
        required: true,
        use: "Validate compiled Card JSON against these capabilities before sending or updating messages.",
      },
      web: {
        required: true,
        use: "Install the Render Profile package and load its hostConfig, theme, stylesheet, tokens and capabilities together.",
      },
    },
    dataContract: context.artifact.dataContract,
    views,
  };
}

/** Build a deterministic, self-contained package for manual backend handoff. */
export async function buildHandoffPackageForCard(
  card: CardPackage,
  profileSource?: RenderProfileSource
): Promise<JsonObject> {
  const context = await resolveCardArtifactForCard(card, profileSource);
  return handoffFromArtifact(card, context);
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function buildHandoffArchiveForCard(
  card: CardPackage,
  profileSource?: RenderProfileSource
): Promise<{ buffer: Buffer; fileName: string }> {
  const context = await resolveCardArtifactForCard(card, profileSource);
  const handoff = handoffFromArtifact(card, context);
  const manifest = handoff.card as JsonObject;
  const packageName = `${String(manifest.id)}@${String(manifest.version)}`;
  const zip = new JSZip();
  const fixedDate = new Date("1980-01-01T00:00:00.000Z");
  const addFile = (relativePath: string, content: string | Buffer) =>
    zip.file(`${packageName}/${relativePath}`, content, {
      date: fixedDate,
      createFolders: false,
    });
  const resolvedRenderProfile = String(
    (handoff.renderProfile as JsonObject).resolved
  );
  const renderProfile = context.profile;
  const profileManifestContent = json(
    (handoff.renderProfile as JsonObject).manifest
  );
  const profileChecksums: Record<string, string> = {
    "render-profile/manifest.json": createHash("sha256")
      .update(profileManifestContent)
      .digest("hex"),
  };

  addFile("manifest.json", json(manifest));
  addFile(
    "render-profile/manifest.json",
    profileManifestContent
  );
  const profileFiles = [
    renderProfile.manifest.hostConfig,
    renderProfile.manifest.theme,
    renderProfile.manifest.stylesheet,
    renderProfile.manifest.tokens,
    renderProfile.manifest.capabilities,
  ].filter((file): file is string => Boolean(file));
  for (const relativePath of new Set(profileFiles)) {
    if (
      path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/).some((segment) => segment === "..")
    ) {
      throw new Error("Render Profile resources must stay inside the profile package");
    }
    const content = await readFile(path.resolve(renderProfile.root, relativePath));
    const archivePath = `render-profile/${relativePath}`;
    addFile(archivePath, content);
    profileChecksums[archivePath] = createHash("sha256").update(content).digest("hex");
    const basename = path.basename(relativePath);
    if (archivePath !== `render-profile/${basename}`) {
      addFile(`render-profile/${basename}`, content);
      profileChecksums[`render-profile/${basename}`] = profileChecksums[archivePath];
    }
  }
  addFile(
    "render-profile/capabilities.json",
    json((handoff.renderProfile as JsonObject).capabilities)
  );
  profileChecksums["render-profile/capabilities.json"] ??= createHash("sha256")
    .update(json((handoff.renderProfile as JsonObject).capabilities))
    .digest("hex");
  addFile("render-profile/checksums.json", json(profileChecksums));
  addFile("contract/data.schema.json", json(handoff.dataContract));

  const views = handoff.views as JsonObject;
  for (const [viewName, rawView] of Object.entries(views)) {
    const view = rawView as JsonObject;
    addFile(`templates/${viewName}.template.json`, json(view.template));
    addFile(`reports/${viewName}.interaction.json`, json(view.interactionReport));
    for (const rawSample of view.samples as JsonObject[]) {
      const sampleName = String(rawSample.name);
      addFile(`samples/${sampleName}.json`, json(rawSample.data));
      addFile(`goldens/${sampleName}.card.json`, json(rawSample.card));
    }
  }

  const renderProfileLabel =
    manifest.renderProfile && manifest.renderProfile !== resolvedRenderProfile
      ? `${String(manifest.renderProfile)} → ${resolvedRenderProfile}`
      : resolvedRenderProfile;

  addFile(
    "README.md",
    `# ${String(manifest.name)} backend handoff\n\n` +
      `- Card: \`${packageName}\`\n` +
      `- Contract: \`${String(manifest.contractVersion)}\`\n` +
      `- Adaptive Card: \`${String(manifest.adaptiveCardVersion)}\`\n` +
      `- Render Profile: \`${renderProfileLabel}\`\n\n` +
      `Use \`contract/data.schema.json\` to map backend data. ` +
      `Use \`render-profile/capabilities.json\` for Server-side final validation. ` +
      `Octo Web must load the matching Render Profile package resources together; do not mix CSS/theme/tokens from another version. ` +
      `The \`goldens/\` directory contains expected compiled Card JSON for each sample. ` +
      `The \`reports/\` directory documents standard Action/Input/Toggle behavior.\n`
  );

  return {
    fileName: `${packageName}.handoff.zip`,
    buffer: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      platform: "UNIX",
    }),
  };
}

export async function writeHandoffPackageForCard(
  card: CardPackage,
  output: string,
  profileSource?: RenderProfileSource
): Promise<{ filePath: string; bytes: number }> {
  const archive = await buildHandoffArchiveForCard(card, profileSource);
  const resolved = path.resolve(output);
  const filePath = path.extname(resolved).toLowerCase() === ".zip"
    ? resolved
    : path.join(resolved, archive.fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, archive.buffer);
  return { filePath, bytes: archive.buffer.byteLength };
}
