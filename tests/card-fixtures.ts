import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCardPackage } from "../packages/cli/src/registry.js";

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "cards");

export const NOTICE_CARD_ROOT = path.join(fixturesRoot, "example.notice");
export const CHOICE_CARD_ROOT = path.join(fixturesRoot, "example.choice");
export const CARD_FIXTURE_ROOTS = [NOTICE_CARD_ROOT, CHOICE_CARD_ROOT] as const;

export function loadNoticeCard() {
  return loadCardPackage(NOTICE_CARD_ROOT);
}

export function loadChoiceCard() {
  return loadCardPackage(CHOICE_CARD_ROOT);
}
