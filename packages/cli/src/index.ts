// Public surface of the Octo Card CLI runtime.
//
// This package owns the whole application layer: the CLI command layer, the
// shared runtime (registry, compiler, profile loading, handoff, artifact,
// verify, agent, …), and the dev/preview HTTP server. The published binary is
// bin.ts (bundled to dist/cli.js) and the deploy server entry is server.ts
// (bundled to dist/server.js).

export { runCli } from "./cli.js";
export type {
  CliServerOptions,
  RunCliDependencies,
  StartServer,
} from "./cli.js";

export {
  createForgeServer,
  normalizeBasePath,
  startServer,
} from "./server.js";
export type { ForgeServerOptions } from "./server.js";

export {
  buildComponentBaseline,
  buildComponentBaselineGroups,
} from "./component-baseline.js";

export * from "./types.js";
export * from "./fs.js";
export * from "./registry.js";
export * from "./compiler.js";
export * from "./core-adapter.js";
export * from "./profile-source.js";
export * from "./profile.js";
export * from "./handoff.js";
export * from "./artifact.js";
export * from "./check.js";
export * from "./init.js";
export * from "./presets.js";
export * from "./verify.js";
export * from "./agent.js";
export * from "./agent-bootstrap.js";
