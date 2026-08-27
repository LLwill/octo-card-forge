import type { ForgeRuntimeMode } from "@mlt-org/octo-card-spec";
import type { CardPackage, RenderProfileSource } from "../types.js";

export interface ServerContext {
  mode: ForgeRuntimeMode;
  card?: CardPackage;
  profile?: RenderProfileSource;
  publishedCatalog?: PublishedCatalogContext;
  catalogImageDigest?: string;
  forgeRevision?: string;
}

export interface PublishedCatalogContext {
  snapshotUrl?: string;
  root?: string;
  fetch: typeof fetch;
  snapshot?: Promise<import("@mlt-org/octo-card-catalog-snapshot").CatalogSnapshotV1>;
  bundle?: import("./catalog-bundle.js").LoadedCatalogBundle;
  ready: boolean;
  error?: string;
}

export interface ForgeServerOptions {
  port?: number;
  host?: string;
  cardRoot?: string;
  profile?: RenderProfileSource;
  basePath?: string;
  catalogSnapshotUrl?: string;
  catalogRoot?: string;
  catalogImageDigest?: string;
  catalogRevision?: string;
  forgeRevision?: string;
  catalogFetch?: typeof fetch;
  forgeWebRoot?: string;
}
