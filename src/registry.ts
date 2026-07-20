import { readdir } from "node:fs/promises";
import path from "node:path";
import { readJson, resolveInProject } from "./fs.js";
import type {
  CardManifest,
  CardPackage,
  HostCapabilities,
  HostProfileManifest,
} from "./types.js";

export async function listCards(): Promise<CardPackage[]> {
  const cardsRoot = resolveInProject("cards");
  const entries = await readdir(cardsRoot, { withFileTypes: true });
  const cards: CardPackage[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const root = path.join(cardsRoot, entry.name);
    const manifest = await readJson<CardManifest>(path.join(root, "manifest.json"));
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

export async function getHostProfile(reference: string): Promise<{
  root: string;
  manifest: HostProfileManifest;
  capabilities: HostCapabilities;
  hostConfig: Record<string, unknown>;
}> {
  const at = reference.lastIndexOf("@");
  if (at <= 0) throw new Error(`Invalid host profile reference: ${reference}`);
  const id = reference.slice(0, at);
  const version = reference.slice(at + 1);
  const root = resolveInProject("host-profiles", id, version);
  const manifest = await readJson<HostProfileManifest>(path.join(root, "manifest.json"));
  const [capabilities, hostConfig] = await Promise.all([
    readJson<HostCapabilities>(path.join(root, manifest.capabilities)),
    readJson<Record<string, unknown>>(path.join(root, manifest.hostConfig)),
  ]);
  return { root, manifest, capabilities, hostConfig };
}
