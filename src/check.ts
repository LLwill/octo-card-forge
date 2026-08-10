import path from "node:path";
import { compileSampleFromPackage } from "./compiler.js";
import { getCard, listCards, loadCardPackage } from "./registry.js";
import type { CardPackage, CheckReport, RenderProfileSource } from "./types.js";

async function checkCardPackages(
  cards: CardPackage[],
  profile?: RenderProfileSource
): Promise<CheckReport> {
  const report: CheckReport = { valid: true, cards: [] };
  for (const card of cards) {
    const item: CheckReport["cards"][number] = {
      cardId: card.manifest.id,
      version: card.manifest.version,
      samples: [],
    };
    for (const [view, definition] of Object.entries(card.manifest.views)) {
      for (const samplePath of definition.samples) {
        const sample = path.basename(samplePath, path.extname(samplePath));
        try {
          const result = await compileSampleFromPackage({
            card,
            sample,
            view,
            profile,
          });
          const valid = !result.issues.some((issue) => issue.severity === "error");
          item.samples.push({
            name: sample,
            view,
            wireProfile: definition.wireProfile,
            valid,
            issues: result.issues,
          });
          report.valid &&= valid;
        } catch (error) {
          report.valid = false;
          item.samples.push({
            name: sample,
            view,
            wireProfile: definition.wireProfile,
            valid: false,
            issues: [
              {
                severity: "error",
                code: "compiler.failure",
                path: "$",
                message: error instanceof Error ? error.message : String(error),
              },
            ],
          });
        }
      }
    }
    report.cards.push(item);
  }
  return report;
}

export async function checkCards(cardId?: string): Promise<CheckReport> {
  return checkCardPackages(cardId ? [await getCard(cardId)] : await listCards());
}

export async function checkCardPackage(
  cardRoot: string,
  profile?: RenderProfileSource
): Promise<CheckReport> {
  return checkCardPackages([await loadCardPackage(cardRoot)], profile);
}
