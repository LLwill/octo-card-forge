import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildComponentCatalogDocument,
  serializeComponentCatalog,
} from "../scripts/generate-component-catalog.mjs";
import { decodeComponentCatalogV1 } from "../packages/card-spec/src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "render-profiles/octo-chat/component-catalog.json");

describe("generated component catalog", () => {
  it("stays byte-identical to a fresh generation from the active profile", async () => {
    const checkedIn = await readFile(catalogPath, "utf8");
    const fresh = serializeComponentCatalog(await buildComponentCatalogDocument());
    expect(fresh).toBe(checkedIn);
  });

  it("checked-in document satisfies ComponentCatalogV1", async () => {
    const parsed = JSON.parse(await readFile(catalogPath, "utf8")) as unknown;
    const decoded = decodeComponentCatalogV1(parsed);
    expect(decoded.ok, JSON.stringify(!decoded.ok ? decoded.issues : [])).toBe(true);
  });
});
