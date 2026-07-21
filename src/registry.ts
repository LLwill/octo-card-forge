import { readdir } from "node:fs/promises";
import path from "node:path";
import { readJson, resolveInProject } from "./fs.js";
import type {
  CardManifest,
  CardPackage,
  RenderCapabilities,
  RenderProfileManifest,
} from "./types.js";

function assertCardManifest(value: CardManifest, filePath: string): void {
  if (value.schemaVersion !== 2) {
    throw new Error(`${filePath}: unsupported schemaVersion ${String(value.schemaVersion)}`);
  }
  if (!value.id || !value.renderProfile || !value.dataSchema) {
    throw new Error(`${filePath}: id, renderProfile and dataSchema are required`);
  }
  if (!value.views || Object.keys(value.views).length === 0) {
    throw new Error(`${filePath}: at least one view is required`);
  }
  for (const [viewName, view] of Object.entries(value.views)) {
    if (view.wireProfile !== "octo/v1" && view.wireProfile !== "octo/v2") {
      throw new Error(`${filePath}: view ${viewName} has an invalid wireProfile`);
    }
  }
}

export async function listCards(): Promise<CardPackage[]> {
  const cardsRoot = resolveInProject("cards");
  const entries = await readdir(cardsRoot, { withFileTypes: true });
  const cards: CardPackage[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const root = path.join(cardsRoot, entry.name);
    const manifestPath = path.join(root, "manifest.json");
    const manifest = await readJson<CardManifest>(manifestPath);
    assertCardManifest(manifest, manifestPath);
    cards.push({ root, manifest });
  }
  return cards.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

export async function getCard(cardId: string): Promise<CardPackage> {
  const cards = await listCards();
  const card = cards.find((item) => item.manifest.id === cardId);
  if (!card) throw new Error(`Unknown card: ${cardId}`);
  return card;
}

export async function getRenderProfile(reference: string): Promise<{
  root: string;
  manifest: RenderProfileManifest;
  capabilities: RenderCapabilities;
  hostConfig: Record<string, unknown>;
}> {
  const at = reference.lastIndexOf("@");
  if (at <= 0) throw new Error(`Invalid render profile reference: ${reference}`);
  const id = reference.slice(0, at);
  const version = reference.slice(at + 1);
  const root = resolveInProject("render-profiles", id, version);
  const manifest = await readJson<RenderProfileManifest>(path.join(root, "manifest.json"));
  const [capabilities, hostConfig] = await Promise.all([
    readJson<RenderCapabilities>(path.join(root, manifest.capabilities)),
    readJson<Record<string, unknown>>(path.join(root, manifest.hostConfig)),
  ]);
  return { root, manifest, capabilities, hostConfig };
}
