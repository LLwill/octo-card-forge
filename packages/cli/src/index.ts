// Public surface of the Octo Card CLI runtime.
//
// This package owns the CLI command layer and the shared application runtime
// (registry, compiler, profile loading, handoff, artifact, verify, agent, …).
// The legacy application server (`src/server.ts`) and the root CLI entry
// (`src/cli.ts`) consume this package instead of the other way around, so the
// dependency direction stays root → package.

export { runCli } from "./cli.js";
export type {
  CliServerOptions,
  RunCliDependencies,
  StartServer,
} from "./cli.js";

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
