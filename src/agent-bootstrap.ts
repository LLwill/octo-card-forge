import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJson, projectRoot } from "./fs.js";
import { loadRenderProfileForReference } from "./profile-source.js";
import type { RenderProfileSource } from "./types.js";

const STATE_DIR = ".octo-card";
const STATE_FILE = "agent.json";
const AGENTS_FILE = "AGENTS.md";
const MANAGED_START = "<!-- octo-card:managed:start -->";
const MANAGED_END = "<!-- octo-card:managed:end -->";
const CLI_PACKAGE = "@mlt-org/octo-card-cli";
const SKILL_ROOT = path.join("skills", "octo-design-cards");

interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export interface SkillManifest {
  schemaVersion: 1;
  skill: { name: string; version: string; entry: string };
  cli: { package: string; compatibleRange: string; recommendedVersion: string };
  renderProfiles: Array<{
    id: string;
    package: string;
    compatibleRange: string;
    recommendedVersion: string;
  }>;
}

export interface AgentState {
  schemaVersion: 1;
  target: string;
  skill: { name: string; source: "embedded"; version: string; path: string };
  cli: { package: string; version: string };
  renderProfile: { package: string; reference: string; version: string };
  generatedFiles: string[];
}

export interface AgentCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export interface AgentDoctorReport {
  valid: boolean;
  workspace: string;
  checks: AgentCheck[];
  state?: AgentState;
  skillManifest?: SkillManifest;
  cli?: { package: string; version: string };
  renderProfile?: { reference: string; package?: string; version: string };
}

export interface AgentInitResult {
  workspace: string;
  statePath: string;
  agentsPath: string;
  state: AgentState;
  created: string[];
}

export interface AgentUpgradeReport {
  valid: boolean;
  workspace: string;
  checkOnly: true;
  needsUpgrade: boolean;
  current?: {
    skill: string;
    cli: string;
    renderProfile: string;
  };
  recommended: {
    skill: string;
    cli: string;
    renderProfile: string;
  };
  changes: string[];
  checks: AgentCheck[];
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageVersion(): Promise<string> {
  const packageJson = await readJson<{ name?: string; version?: string }>(
    path.join(projectRoot(), "package.json")
  );
  if (packageJson.name !== CLI_PACKAGE || !packageJson.version) {
    throw new Error(`Unable to determine ${CLI_PACKAGE} version`);
  }
  return packageJson.version;
}

export async function loadSkillManifest(): Promise<SkillManifest> {
  const manifestPath = path.join(projectRoot(), SKILL_ROOT, "skill-manifest.json");
  const manifest = await readJson<SkillManifest>(manifestPath);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.skill.name !== "octo-design-cards" ||
    !manifest.skill.version ||
    !manifest.skill.entry ||
    manifest.cli.package !== CLI_PACKAGE
  ) {
    throw new Error(`${manifestPath}: invalid octo-design-cards skill manifest`);
  }
  return manifest;
}

function parseVersion(value: string): Semver | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim());
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareVersion(left: Semver, right: Semver): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1;
  if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1;
  for (let index = 0; index < Math.max(left.prerelease.length, right.prerelease.length); index++) {
    const a = left.prerelease[index];
    const b = right.prerelease[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumber = /^\d+$/.test(a);
    const bNumber = /^\d+$/.test(b);
    if (aNumber && bNumber) return Number(a) > Number(b) ? 1 : -1;
    if (aNumber !== bNumber) return aNumber ? -1 : 1;
    return a > b ? 1 : -1;
  }
  return 0;
}

function satisfiesRange(version: string, range: string): boolean {
  const actual = parseVersion(version);
  if (!actual) return false;
  return range.trim().split(/\s+/).every((term) => {
    const match = /^(>=|<=|>|<|=)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(term);
    if (!match) return false;
    const expected = parseVersion(match[2]);
    if (!expected) return false;
    const comparison = compareVersion(actual, expected);
    switch (match[1] ?? "=") {
      case ">=": return comparison >= 0;
      case "<=": return comparison <= 0;
      case ">": return comparison > 0;
      case "<": return comparison < 0;
      default: return comparison === 0;
    }
  });
}

function relativePath(workspace: string, filePath: string): string {
  const relative = path.relative(workspace, filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}

function managedInstructions(state: AgentState): string {
  return [
    MANAGED_START,
    "## Octo Card Agent",
    "",
    "- Read the Octo card Skill at `" + state.skill.path + "`.",
    "- Use `octo-card` for Adaptive Card validation and Card Package verification.",
    `- Active Render Profile: \`${state.renderProfile.reference}\`.`,
    "- Run `octo-card agent doctor --format json` before reporting a completed card workflow.",
    MANAGED_END,
  ].join("\n");
}

async function updateAgentsFile(workspace: string, state: AgentState): Promise<"created" | "updated" | "unchanged"> {
  const filePath = path.join(workspace, AGENTS_FILE);
  const block = managedInstructions(state);
  let current = "";
  if (await exists(filePath)) current = await readFile(filePath, "utf8");
  const start = current.indexOf(MANAGED_START);
  const end = current.indexOf(MANAGED_END);
  let next: string;
  if ((start >= 0) !== (end >= 0) || (start >= 0 && end < start)) {
    throw new Error(`${filePath}: incomplete octo-card managed block; repair it before running agent init`);
  }
  if (start >= 0 && end >= start) {
    next = `${current.slice(0, start)}${block}${current.slice(end + MANAGED_END.length)}`;
  } else {
    next = `${current.replace(/\s*$/, "")}${current.trim() ? "\n\n" : ""}${block}\n`;
  }
  if (next === current) return "unchanged";
  await writeFile(filePath, next);
  return current ? "updated" : "created";
}

function hasValidManagedBlock(content: string): boolean {
  const start = content.indexOf(MANAGED_START);
  const end = content.indexOf(MANAGED_END);
  return start >= 0 && end > start && content.indexOf(MANAGED_START, start + MANAGED_START.length) < 0;
}

async function profileForState(reference: string): Promise<RenderProfileSource> {
  return loadRenderProfileForReference(reference);
}

export async function initAgent(options: {
  workspace?: string;
  target?: string;
  profile?: string;
} = {}): Promise<AgentInitResult> {
  const workspace = path.resolve(options.workspace ?? process.cwd());
  const target = options.target?.trim() || "generic";
  if (target !== "generic") throw new Error(`unsupported agent target: ${target}`);
  const manifest = await loadSkillManifest();
  const cliVersion = await readPackageVersion();
  const profileManifest = manifest.renderProfiles[0];
  const requestedProfile = options.profile?.trim() || `${profileManifest.id}@${profileManifest.recommendedVersion}`;
  const profile = await profileForState(requestedProfile);
  const skillFile = path.join(projectRoot(), SKILL_ROOT, manifest.skill.entry);
  if (!(await exists(skillFile))) throw new Error(`Skill entry does not exist: ${skillFile}`);
  if (!satisfiesRange(cliVersion, manifest.cli.compatibleRange)) {
    throw new Error(`CLI ${cliVersion} is outside Skill range ${manifest.cli.compatibleRange}`);
  }
  if (!satisfiesRange(profile.manifest.version, profileManifest.compatibleRange)) {
    throw new Error(`Render Profile ${profile.reference} is outside Skill range ${profileManifest.compatibleRange}`);
  }
  const state: AgentState = {
    schemaVersion: 1,
    target,
    skill: {
      name: manifest.skill.name,
      source: "embedded",
      version: manifest.skill.version,
      path: relativePath(workspace, skillFile),
    },
    cli: { package: CLI_PACKAGE, version: cliVersion },
    renderProfile: {
      package: profile.manifest.packageName ?? profileManifest.package,
      reference: profile.reference,
      version: profile.manifest.version,
    },
    generatedFiles: [AGENTS_FILE],
  };
  await mkdir(path.join(workspace, STATE_DIR), { recursive: true });
  const statePath = path.join(workspace, STATE_DIR, STATE_FILE);
  const previous = await exists(statePath) ? await readFile(statePath, "utf8") : undefined;
  await writeFile(statePath, json(state));
  const agentsChange = await updateAgentsFile(workspace, state);
  const created = [];
  if (!previous) created.push(statePath);
  if (agentsChange !== "unchanged") created.push(path.join(workspace, AGENTS_FILE));
  return { workspace, statePath, agentsPath: path.join(workspace, AGENTS_FILE), state, created };
}

async function loadState(workspace: string): Promise<AgentState | undefined> {
  const statePath = path.join(workspace, STATE_DIR, STATE_FILE);
  if (!(await exists(statePath))) return undefined;
  return readJson<AgentState>(statePath);
}

function check(id: string, status: AgentCheck["status"], message: string): AgentCheck {
  return { id, status, message };
}

async function packageDependencyChecks(workspace: string, cliVersion: string): Promise<AgentCheck[]> {
  const packagePath = path.join(workspace, "package.json");
  if (!(await exists(packagePath))) return [check("workspace.package", "warn", "package.json not found; dependency drift was not checked")];
  const packageJson = await readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(packagePath);
  const declared = packageJson.dependencies?.[CLI_PACKAGE] ?? packageJson.devDependencies?.[CLI_PACKAGE];
  const checks: AgentCheck[] = [];
  if (!declared) {
    checks.push(check("workspace.cli-dependency", "warn", `${CLI_PACKAGE} is not declared in package.json`));
  } else if (declared.startsWith("file:") || declared.startsWith("workspace:")) {
    checks.push(check("workspace.cli-dependency", "pass", `${CLI_PACKAGE} uses local dependency ${declared}`));
  } else if (!satisfiesRange(cliVersion, declared.replace(/^\^|^~/, ""))) {
    checks.push(check("workspace.cli-dependency", "warn", `package.json declares ${CLI_PACKAGE}@${declared}; current CLI is ${cliVersion}`));
  } else {
    checks.push(check("workspace.cli-dependency", "pass", `${CLI_PACKAGE}@${cliVersion} satisfies ${declared}`));
  }
  const lockfiles = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"];
  let lockfile: string | undefined;
  for (const name of lockfiles) {
    if (await exists(path.join(workspace, name))) {
      lockfile = name;
      break;
    }
  }
  if (!lockfile) {
    checks.push(check("workspace.lockfile", "warn", "No supported lockfile found; resolved dependency drift was not checked"));
  } else if (!declared || declared.startsWith("file:") || declared.startsWith("workspace:")) {
    checks.push(check("workspace.lockfile", "warn", `${lockfile} found, but no registry CLI dependency can be compared`));
  } else if (!(await readFile(path.join(workspace, lockfile), "utf8")).includes(CLI_PACKAGE)) {
    checks.push(check("workspace.lockfile", "warn", `${lockfile} does not mention ${CLI_PACKAGE}`));
  } else {
    checks.push(check("workspace.lockfile", "pass", `${lockfile} contains ${CLI_PACKAGE}`));
  }
  return checks;
}

export async function doctorAgent(options: { workspace?: string } = {}): Promise<AgentDoctorReport> {
  const workspace = path.resolve(options.workspace ?? process.cwd());
  const checks: AgentCheck[] = [];
  let manifest: SkillManifest | undefined;
  let state: AgentState | undefined;
  let cliVersion: string | undefined;
  let profile: RenderProfileSource | undefined;
  try {
    manifest = await loadSkillManifest();
    const skillFile = path.join(projectRoot(), SKILL_ROOT, manifest.skill.entry);
    checks.push((await exists(skillFile))
      ? check("skill.entry", "pass", `Skill entry is present: ${skillFile}`)
      : check("skill.entry", "fail", `Skill entry is missing: ${skillFile}`));
    cliVersion = await readPackageVersion();
    checks.push(satisfiesRange(cliVersion, manifest.cli.compatibleRange)
      ? check("cli.compatibility", "pass", `CLI ${cliVersion} satisfies ${manifest.cli.compatibleRange}`)
      : check("cli.compatibility", "fail", `CLI ${cliVersion} does not satisfy ${manifest.cli.compatibleRange}`));
  } catch (error) {
    checks.push(check("skill.manifest", "fail", error instanceof Error ? error.message : String(error)));
  }
  try {
    state = await loadState(workspace);
    checks.push(state ? check("agent.state", "pass", `Agent state loaded from ${path.join(workspace, STATE_DIR, STATE_FILE)}`) : check("agent.state", "fail", "Agent is not initialized; run octo-card agent init"));
  } catch (error) {
    checks.push(check("agent.state", "fail", error instanceof Error ? error.message : String(error)));
  }
  if (state && manifest && cliVersion) {
    checks.push(state.skill.version === manifest.skill.version
      ? check("skill.version", "pass", `Skill ${state.skill.version} is current`)
      : check("skill.version", "fail", `State has Skill ${state.skill.version}; current bundle is ${manifest.skill.version}`));
    checks.push(state.cli.version === cliVersion
      ? check("cli.version", "pass", `CLI ${state.cli.version} matches agent state`)
      : check("cli.version", "fail", `State has CLI ${state.cli.version}; current CLI is ${cliVersion}`));
    try {
      profile = await profileForState(state.renderProfile.reference);
      checks.push(profile.reference === state.renderProfile.reference
        ? check("render-profile", "pass", `Render Profile ${profile.reference} is loadable`)
        : check("render-profile", "fail", `Loaded Render Profile ${profile.reference} does not match state`));
      checks.push(state.renderProfile.version === profile.manifest.version
        ? check("render-profile.version", "pass", `Render Profile version ${profile.manifest.version} matches agent state`)
        : check("render-profile.version", "fail", "Render Profile version drifted from agent state"));
      checks.push(...await packageDependencyChecks(workspace, cliVersion));
    } catch (error) {
      checks.push(check("render-profile", "fail", error instanceof Error ? error.message : String(error)));
    }
  }
  const agentsPath = path.join(workspace, AGENTS_FILE);
  const agents = await (await exists(agentsPath) ? readFile(agentsPath, "utf8") : Promise.resolve(""));
  checks.push(state && hasValidManagedBlock(agents)
    ? check("agents.managed-block", "pass", "AGENTS.md managed block is present")
    : check("agents.managed-block", "fail", "AGENTS.md managed block is missing or incomplete"));
  if (profile) {
    checks.push(profile.capabilities.allowedElements.length > 0
      ? check("render-profile.capabilities", "pass", "Render Profile capabilities are readable")
      : check("render-profile.capabilities", "fail", "Render Profile has no allowed elements"));
  }
  return {
    valid: !checks.some((item) => item.status === "fail"),
    workspace,
    checks,
    state,
    skillManifest: manifest,
    cli: cliVersion ? { package: CLI_PACKAGE, version: cliVersion } : undefined,
    renderProfile: profile ? {
      reference: profile.reference,
      package: profile.manifest.packageName,
      version: profile.manifest.version,
    } : undefined,
  };
}

export async function checkAgentUpgrade(options: { workspace?: string } = {}): Promise<AgentUpgradeReport> {
  const workspace = path.resolve(options.workspace ?? process.cwd());
  const manifest = await loadSkillManifest();
  const cliVersion = await readPackageVersion();
  const state = await loadState(workspace);
  const profileManifest = manifest.renderProfiles[0];
  const recommended = {
    skill: manifest.skill.version,
    cli: manifest.cli.recommendedVersion,
    renderProfile: `${profileManifest.id}@${profileManifest.recommendedVersion}`,
  };
  const checks: AgentCheck[] = [];
  if (!state) {
    checks.push(check("agent.state", "fail", "Agent is not initialized; run octo-card agent init"));
    return { valid: false, workspace, checkOnly: true, needsUpgrade: false, recommended, changes: [], checks };
  }
  checks.push(check("upgrade.no-side-effects", "pass", "Upgrade check only; no dependencies or lockfiles were changed"));
  const changes: string[] = [];
  if (state.skill.version !== recommended.skill) changes.push(`Skill ${state.skill.version} -> ${recommended.skill}`);
  if (state.cli.version !== recommended.cli || cliVersion !== recommended.cli) changes.push(`CLI ${state.cli.version} -> ${recommended.cli}`);
  if (state.renderProfile.reference !== recommended.renderProfile) {
    checks.push(check("render-profile.pin", "pass", `Keeping existing exact Render Profile pin ${state.renderProfile.reference}`));
  }
  if (state.skill.version === recommended.skill && state.cli.version === recommended.cli) {
    checks.push(check("upgrade.status", "pass", "Skill and CLI are already at the recommended versions"));
  } else {
    checks.push(check("upgrade.status", "warn", "A newer compatible Skill or CLI is available in this bundle"));
  }
  return {
    valid: !checks.some((item) => item.status === "fail"),
    workspace,
    checkOnly: true,
    needsUpgrade: changes.length > 0,
    current: { skill: state.skill.version, cli: state.cli.version, renderProfile: state.renderProfile.reference },
    recommended,
    changes,
    checks,
  };
}
