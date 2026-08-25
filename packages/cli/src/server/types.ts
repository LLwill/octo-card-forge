import type { ForgeRuntimeMode } from "@mlt-org/octo-card-spec";
import type { CardPackage, RenderProfileSource } from "../types.js";

export interface ServerContext {
  mode: ForgeRuntimeMode;
  card?: CardPackage;
  profile?: RenderProfileSource;
}

export interface PublishedCatalogContext {
  snapshotUrl: string;
  fetch: typeof fetch;
  snapshot?: Promise<import("@mlt-org/octo-card-catalog-snapshot").CatalogSnapshotV1>;
}

export interface ForgeServerOptions {
  port?: number;
  host?: string;
  cardRoot?: string;
  profile?: RenderProfileSource;
  basePath?: string;
  catalogSnapshotUrl?: string;
  catalogFetch?: typeof fetch;
  forgeWebRoot?: string;
}
