#!/usr/bin/env node
import path from "node:path";
import { checkAgentUpgrade, doctorAgent, initAgent } from "./agent-bootstrap.js";
import {
  discoverUtilities,
  explainUtility,
  lintCardPackageForAgent,
  lintCardsForAgent,
} from "./agent.js";
import { checkCardPackage, checkCards } from "./check.js";
import {
  compileCard,
  compileCardDirectory,
  compileSample,
  compileSampleFromDirectory,
} from "./compiler.js";
import { readJson } from "./fs.js";
import {
  buildHandoffPackage,
  buildHandoffPackageForCard,
  writeHandoffPackage,
  writeHandoffPackageForCard,
} from "./handoff.js";
import { initCard, listInitPresets } from "./init.js";
import {
  bundleRenderProfile,
  packRenderProfile,
  validateRenderProfile,
} from "./profile.js";
import {
  buildCardArtifact,
  buildCardArtifactForCard,
} from "./artifact.js";
import { verifyCardArtifact, artifactSha256 } from "@mlt-org/octo-card-artifact";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import {
  loadRenderProfileFromDirectory,
  loadRenderProfileFromPackage,
  loadRenderProfileForReference,
} from "./profile-source.js";
import { getCard, listCards, loadCardPackage } from "./registry.js";
import { startServer } from "./server.js";
import type { JsonObject, WireProfile } from "./types.js";
import { validateCompiledCard } from "./validate.js";
import { verifyCardPackage, verifySummary } from "./verify.js";

const args = process.argv.slice(2);
const command = args.shift() ?? "help";
const DEFAULT_HANDOFF_OUTPUT = "handoff";
const VALUE_FLAGS = new Set([
  "--card",
  "--data",
  "--emit-dir",
  "--format",
  "--host",
  "--handoff",
  "--input",
  "--name",
  "--output",
  "--out",
  "--port",
  "--profile",
  "--profile-dir",
  "--profile-package",
  "--preset",
  "--render-profile",
  "--sample",
  "--view",
  "--wire-profile",
  "--target",
  "--workspace",
]);

function flag(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(): void {
  console.log(`octo-card commands:
  init <card-id> --name <name> [--out <dir>] [--preset blank|bot-token|docs-forward] [--view default] [--wire-profile octo/v1|octo/v2] [--render-profile octo-chat@latest] [--format json]
  presets [--format json]
  list [--format json]
  discover [query] [--profile octo-chat@latest] [--profile-dir <dir> | --profile-package <pkg>] [--format json]
  explain utility <token> [--profile octo-chat@latest] [--profile-dir <dir> | --profile-package <pkg>] [--format json]
  lint [card-id] [--card <dir>] [--profile-dir <dir> | --profile-package <pkg>] [--format json]
  validate --input <card.json> [--wire-profile octo/v1|octo/v2] [--profile octo-chat@latest] [--profile-dir <dir> | --profile-package <pkg>] [--format json]
  contract <card-id> [--format json]
  inspect <card-id> [--card <dir>] [--profile-dir <dir> | --profile-package <pkg>] [--sample <name>] [--format json]
  verify --card <dir> [--release] [--sample <name>] [--emit-dir <dir>] [--handoff <dir>] [--format json]
  handoff <card-id> [--output handoff] [--format json]
  handoff --card <dir> [--profile-dir <dir> | --profile-package <pkg>] [--output handoff] [--format json]
  handoff <card-id> --output -  # print the aggregate JSON to stdout
  handoff --card <dir> --output -  # print the aggregate JSON to stdout
  render <card-id> --sample <name>
  render <card-id> --view <view> --data <file>
  render --card <dir> [--profile-dir <dir> | --profile-package <pkg>] --sample <name>
  render --card <dir> [--profile-dir <dir> | --profile-package <pkg>] --view <view> --data <file>
  emit <card-id|--card dir> --sample <name>  # alias for render
  check [card-id] [--card <dir>] [--profile-dir <dir> | --profile-package <pkg>] [--format json]
  profile validate <profile@version>
  profile bundle <profile@version> [--output .release]
  profile pack <profile@version> [--output .release]
  artifact build <card-id> [--out <file>] [--format json]
  artifact build --card <dir> [--out <file>] [--profile-dir <dir> | --profile-package <pkg>] [--format json]
  artifact verify <file> [--sha256 <hash>] [--format json]
  agent init [--target generic] [--workspace <dir>] [--profile octo-chat@version] [--format json]
  agent doctor [--workspace <dir>] [--format json]
  agent upgrade --check [--workspace <dir>] [--format json]
  dev [card-id] [--card <dir>] [--profile-dir <dir> | --profile-package <pkg>] [--host 127.0.0.1] [--port 4318]`);
}

function positional(index: number): string | undefined {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      if (VALUE_FLAGS.has(args[i])) i++;
      continue;
    }
    values.push(args[i]);
  }
  return values[index];
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadExplicitProfileSource() {
  const profileDir = flag("--profile-dir");
  const profilePackage = flag("--profile-package");
  if (profileDir && profilePackage) {
    throw new Error("--profile-dir and --profile-package cannot be used together");
  }
  if (profileDir) return loadRenderProfileFromDirectory(profileDir);
  if (profilePackage) return loadRenderProfileFromPackage(profilePackage);
  return undefined;
}

async function explicitProfileForCardCommand(cardRoot?: string) {
  const profile = await loadExplicitProfileSource();
  if (profile && !cardRoot) {
    throw new Error("--profile-dir/--profile-package currently require --card <dir>");
  }
  return profile;
}

function printDiscoverText(report: Awaited<ReturnType<typeof discoverUtilities>>): void {
  console.log(`Profile: ${report.profile}`);
  console.log(`ID syntax: ${report.idSyntax}`);
  console.log(`Max tokens per element: ${report.maxTokensPerElement}`);
  for (const group of report.groups) {
    console.log(`\n${group.group}`);
    for (const token of group.tokens) {
      const fallback = token.fallback
        ? ` fallback=${JSON.stringify(token.fallback)}`
        : "";
      console.log(
        `  ${token.token}\t${token.appliesTo.join(", ")}\t${token.description}${fallback}`
      );
    }
  }
}

function printExplainText(report: Awaited<ReturnType<typeof explainUtility>>): void {
  console.log(`${report.token} (${report.group})`);
  console.log(report.description);
  console.log(`Profile: ${report.profile}`);
  console.log(`Applies to: ${report.appliesTo.join(", ")}`);
  if (report.fallback) console.log(`Fallback: ${JSON.stringify(report.fallback)}`);
  console.log(`ID: ${report.idExample}`);
  console.log(`Rule: ${report.groupConflictRule}`);
  if (report.recommendedCombinations.length > 0) {
    console.log(`Can combine with: ${report.recommendedCombinations.join(", ")}`);
  }
  console.log(`Example:\n${JSON.stringify(report.cardExample, null, 2)}`);
}

function printLintText(report: Awaited<ReturnType<typeof lintCardsForAgent>>): void {
  console.log(
    `${report.valid ? "✓" : "✗"} ${report.summary.cards} cards · ${report.summary.samples} samples · ${report.summary.errors} errors · ${report.summary.warnings} warnings`
  );
  if (report.summary.tokens.length > 0) {
    console.log(`Utility tokens: ${report.summary.tokens.join(", ")}`);
  }
  for (const card of report.cards) {
    console.log(
      `\n${card.cardId}@${card.version}\t${card.reference}\t${card.kind}\t${card.mutable ? "mutable" : "immutable"}`
    );
    for (const sample of card.samples) {
      const tokens =
        sample.utilities.tokens.length > 0
          ? ` utilities=${sample.utilities.tokens.join(",")}`
          : "";
      console.log(
        `  ${sample.valid ? "✓" : "✗"} ${sample.name} (${sample.view}, ${sample.wireProfile})${tokens}`
      );
      for (const issue of sample.issues) {
        console.log(`    ${issue.severity}: ${issue.code} ${issue.path} ${issue.message}`);
      }
    }
  }
}

try {
  if (command === "init") {
    const cardId = args[0];
    if (!cardId) throw new Error("card-id is required");
    const name = flag("--name");
    if (!name) throw new Error("--name is required");
    const result = await initCard({
      cardId,
      name,
      preset: flag("--preset"),
      view: flag("--view"),
      renderProfile: flag("--render-profile"),
      wireProfile: flag("--wire-profile") as "octo/v1" | "octo/v2" | undefined,
      outputRoot: flag("--out"),
    });
    if (flag("--format") === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Created ${result.cardId} (${result.name})`);
      console.log(`Preset: ${result.preset}`);
      for (const file of result.files) console.log(`  ${file}`);
      const next = flag("--out")
        ? `npx --no-install octo-card check --card ${result.root}`
        : `npx --no-install octo-card check ${result.cardId}`;
      console.log(`Next: ${next}`);
    }
  } else if (command === "agent") {
    const action = args[0];
    const formatJson = flag("--format") === "json";
    const workspace = flag("--workspace");
    if (action === "init") {
      const result = await initAgent({
        workspace,
        target: flag("--target"),
        profile: flag("--profile"),
      });
      if (formatJson) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`Initialized Octo Card Agent in ${result.workspace}`);
        console.log(`Skill: ${result.state.skill.version}`);
        console.log(`CLI: ${result.state.cli.version}`);
        console.log(`Render Profile: ${result.state.renderProfile.reference}`);
        for (const file of result.created) console.log(`  ${file}`);
      }
    } else if (action === "doctor") {
      const report = await doctorAgent({ workspace });
      if (formatJson) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`${report.valid ? "✓" : "✗"} Agent doctor · ${report.workspace}`);
        for (const item of report.checks) console.log(`  ${item.status}: ${item.id} ${item.message}`);
      }
      if (!report.valid) process.exitCode = 1;
    } else if (action === "upgrade") {
      if (!args.includes("--check")) throw new Error("agent upgrade currently supports --check only");
      const report = await checkAgentUpgrade({ workspace });
      if (formatJson) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`${report.needsUpgrade ? "Upgrade available" : "Up to date"} · check only`);
        for (const change of report.changes) console.log(`  ${change}`);
        for (const item of report.checks) console.log(`  ${item.status}: ${item.id} ${item.message}`);
      }
      if (!report.valid) process.exitCode = 1;
    } else {
      throw new Error("agent action must be init, doctor or upgrade");
    }
  } else if (command === "presets") {
    const presets = listInitPresets();
    if (flag("--format") === "json") {
      console.log(JSON.stringify({ presets }, null, 2));
    } else {
      for (const preset of presets) {
        console.log(`${preset.id}\t${preset.wireProfile}\t${preset.description}`);
      }
    }
  } else if (command === "list") {
    const cards = await listCards();
    if (flag("--format") === "json") {
      console.log(
        JSON.stringify(
          {
            cards: cards.map(({ reference, kind, mutable, manifest }) => ({
              reference,
              kind,
              mutable,
              id: manifest.id,
              name: manifest.name,
              version: manifest.version,
              contractVersion: manifest.contractVersion,
              renderProfile: manifest.renderProfile,
            })),
          },
          null,
          2
        )
      );
    } else {
      console.log(
        cards
          .map(
            ({ reference, kind, mutable, manifest }) =>
              `${manifest.id}\t${manifest.version}\tcontract ${manifest.contractVersion}\t${manifest.name}\t${reference}\t${kind}\t${mutable ? "mutable" : "immutable"}`
          )
          .join("\n")
      );
    }
  } else if (command === "discover") {
    const query = positional(0);
    const profileSource = await loadExplicitProfileSource();
    const report = await discoverUtilities({
      query,
      profile: flag("--profile"),
      profileSource,
    });
    if (flag("--format") === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printDiscoverText(report);
    }
  } else if (command === "explain") {
    const subject = positional(0);
    const token = subject === "utility" ? positional(1) : subject;
    if (!token) throw new Error("utility token is required");
    const profileSource = await loadExplicitProfileSource();
    const report = await explainUtility({
      token,
      profile: flag("--profile"),
      profileSource,
    });
    if (flag("--format") === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printExplainText(report);
    }
  } else if (command === "lint") {
    const cardRoot = flag("--card");
    const profileSource = await explicitProfileForCardCommand(cardRoot);
    const cardId = cardRoot ? undefined : positional(0);
    const report = cardRoot
      ? await lintCardPackageForAgent(cardRoot, profileSource)
      : await lintCardsForAgent(cardId);
    if (flag("--format") === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printLintText(report);
    }
    if (!report.valid) process.exitCode = 1;
  } else if (command === "validate") {
    const inputPath = flag("--input") ?? positional(0);
    if (!inputPath) throw new Error("validate requires --input <card.json>");
    const requestedWireProfile = flag("--wire-profile") ?? "octo/v1";
    if (requestedWireProfile !== "octo/v1" && requestedWireProfile !== "octo/v2") {
      throw new Error("wire profile must be octo/v1 or octo/v2");
    }
    const profileSource = await loadExplicitProfileSource();
    const profile = await loadRenderProfileForReference(flag("--profile"), profileSource);
    const payload = await readJson<unknown>(path.resolve(inputPath));
    const issues = isJsonObject(payload)
      ? validateCompiledCard(
          payload,
          profile.capabilities,
          requestedWireProfile as WireProfile
        )
      : [
          {
            severity: "error" as const,
            code: "schema.root_object",
            path: "$",
            message: "Adaptive Card JSON root must be an object",
          },
        ];
    const report = {
      valid: !issues.some((issue) => issue.severity === "error"),
      input: path.resolve(inputPath),
      profile: profile.reference,
      wireProfile: requestedWireProfile as WireProfile,
      issues,
    };
    if (flag("--format") === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(
        `${report.valid ? "✓" : "✗"} ${inputPath} · ${report.profile} · ${report.wireProfile}`
      );
      for (const issue of issues) {
        console.log(`  ${issue.severity}: ${issue.code} ${issue.path} ${issue.message}`);
      }
    }
    if (!report.valid) process.exitCode = 1;
  } else if (command === "contract") {
    const cardId = args[0];
    if (!cardId) throw new Error("card-id is required");
    const card = await getCard(cardId);
    const reports = [];
    for (const [view, definition] of Object.entries(card.manifest.views)) {
      for (const samplePath of definition.samples) {
        const sample = path.basename(samplePath, path.extname(samplePath));
        const result = await compileSample({ cardId, sample });
        reports.push({
          sample,
          view,
          wireProfile: definition.wireProfile,
          inspection: result.inspection,
        });
      }
    }
    console.log(
      JSON.stringify(
        {
          card: card.manifest,
          schema: await readJson(path.join(card.root, card.manifest.dataSchema)),
          interactionReports: reports,
        },
        null,
        2
      )
    );
  } else if (command === "inspect") {
    const cardRoot = flag("--card");
    const profileSource = await explicitProfileForCardCommand(cardRoot);
    const cardId = cardRoot ? undefined : positional(0);
    if (!cardRoot && !cardId) throw new Error("card-id or --card is required");
    const sample = flag("--sample");
    if (sample) {
      const result = cardRoot
        ? await compileSampleFromDirectory({
            cardRoot,
            sample,
            view: flag("--view"),
            profile: profileSource,
          })
        : await compileSample({ cardId: cardId!, sample });
      if (result.issues.some((issue) => issue.severity === "error")) {
        throw new Error(`Cannot inspect invalid sample ${sample}`);
      }
      console.log(
        JSON.stringify(
          {
            cardId: result.cardId,
            cardVersion: result.cardVersion,
            sample,
            view: result.view,
            wireProfile: result.wireProfile,
            ...result.inspection,
          },
          null,
          2
        )
      );
    } else {
      const card = cardRoot ? await loadCardPackage(cardRoot) : await getCard(cardId!);
      const samples = [];
      for (const [view, definition] of Object.entries(card.manifest.views)) {
        for (const samplePath of definition.samples) {
          const sampleName = path.basename(samplePath, path.extname(samplePath));
          const result = cardRoot
            ? await compileSampleFromDirectory({
                cardRoot,
                sample: sampleName,
                view,
                profile: profileSource,
              })
            : await compileSample({ cardId: cardId!, sample: sampleName });
          samples.push({
            sample: sampleName,
            view,
            wireProfile: definition.wireProfile,
            ...result.inspection,
            issues: result.issues,
          });
        }
      }
      console.log(JSON.stringify({ cardId: card.manifest.id, samples }, null, 2));
    }
  } else if (command === "verify") {
    const cardRoot = flag("--card");
    if (!cardRoot) throw new Error("verify requires --card <dir>");
    const profileSource = await explicitProfileForCardCommand(cardRoot);
    const report = await verifyCardPackage({
      cardRoot,
      profile: profileSource,
      release: args.includes("--release"),
      sample: flag("--sample"),
      emitDir: flag("--emit-dir"),
      handoffDir: flag("--handoff"),
    });
    if (flag("--format") === "json") {
      console.log(JSON.stringify(verifySummary(report), null, 2));
    } else {
      console.log(
        `${report.valid ? "✓" : "✗"} ${report.card.id}@${report.card.version} · ` +
          `${report.samples.length} samples · ` +
          `${report.lint.summary.errors} errors · ${report.lint.summary.warnings} warnings`
      );
      for (const sample of report.samples) {
        console.log(
          `  ${sample.valid ? "✓" : "✗"} ${sample.view}/${sample.name} (${sample.bytes} bytes)`
        );
        for (const issue of sample.issues) {
          console.log(`    ${issue.severity}: ${issue.code} ${issue.path} ${issue.message}`);
        }
      }
      if (report.handoff) console.log(`Handoff: ${report.handoff.filePath}`);
      if (report.samples.some((sample) => sample.output)) {
        console.log(`Compiled cards: ${flag("--emit-dir")}`);
      }
    }
    if (!report.valid) process.exitCode = 1;
  } else if (command === "handoff") {
    const cardRoot = flag("--card");
    const output = flag("--output") ?? DEFAULT_HANDOFF_OUTPUT;
    if (cardRoot) {
      const profileSource = await explicitProfileForCardCommand(cardRoot);
      const card = await loadCardPackage(cardRoot);
      if (output === "-") {
        console.log(JSON.stringify(await buildHandoffPackageForCard(card, profileSource), null, 2));
      } else {
        const result = await writeHandoffPackageForCard(card, output, profileSource);
        if (flag("--format") === "json") {
          console.log(JSON.stringify({ cardId: card.manifest.id, ...result }, null, 2));
        } else {
          console.log(`Created backend handoff package: ${result.filePath}`);
        }
      }
    } else {
      const cardId = args[0];
      if (!cardId) throw new Error("card-id or --card is required");
      if (output === "-") {
        console.log(JSON.stringify(await buildHandoffPackage(cardId), null, 2));
      } else {
        const result = await writeHandoffPackage(cardId, output);
        if (flag("--format") === "json") {
          console.log(JSON.stringify({ cardId, ...result }, null, 2));
        } else {
          console.log(`Created backend handoff package: ${result.filePath}`);
        }
      }
    }
  } else if (command === "render" || command === "emit") {
    const cardRoot = flag("--card");
    const profileSource = await explicitProfileForCardCommand(cardRoot);
    const cardId = cardRoot ? undefined : positional(0);
    if (!cardRoot && !cardId) throw new Error("card-id or --card is required");
    const sample = flag("--sample");
    const dataPath = flag("--data");
    if (!sample && !dataPath) throw new Error("--data is required without --sample");
    const result = sample
      ? cardRoot
        ? await compileSampleFromDirectory({
            cardRoot,
            sample,
            view: flag("--view"),
            profile: profileSource,
          })
        : await compileSample({ cardId: cardId!, sample })
      : cardRoot
        ? await compileCardDirectory({
            cardRoot,
            view: flag("--view") ?? "pending",
            data: await readJson<JsonObject>(path.resolve(dataPath!)),
            profile: profileSource,
          })
        : await compileCard({
            cardId: cardId!,
            view: flag("--view") ?? "pending",
            data: await readJson<JsonObject>(path.resolve(dataPath!)),
          });
    if (result.issues.some((issue) => issue.severity === "error")) {
      console.error(JSON.stringify(result.issues, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result.payload, null, 2));
    }
  } else if (command === "check") {
    const cardRoot = flag("--card");
    const profileSource = await explicitProfileForCardCommand(cardRoot);
    const cardId = cardRoot ? undefined : positional(0);
    const report = cardRoot
      ? await checkCardPackage(cardRoot, profileSource)
      : await checkCards(cardId);
    if (flag("--format") === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const card of report.cards) {
        console.log(
          `${card.cardId}@${card.version}\t${card.reference}\t${card.kind}\t${card.mutable ? "mutable" : "immutable"}`
        );
        for (const sample of card.samples) {
          console.log(
            `  ${sample.valid ? "✓" : "✗"} ${sample.name} (${sample.view}, ${sample.wireProfile})`
          );
          for (const issue of sample.issues) {
            console.log(`    ${issue.severity}: ${issue.code} ${issue.path} ${issue.message}`);
          }
        }
      }
    }
    if (!report.valid) process.exitCode = 1;
  } else if (command === "profile") {
    const action = args[0];
    const reference = args[1];
    if (action !== "validate" && action !== "bundle" && action !== "pack") {
      throw new Error("profile action must be validate, bundle or pack");
    }
    if (!reference) throw new Error("profile reference is required");
    const result =
      action === "validate"
        ? await validateRenderProfile(reference)
        : action === "bundle"
          ? await bundleRenderProfile(reference, flag("--output") ?? ".release")
          : await packRenderProfile(reference, flag("--output") ?? ".release");
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "artifact") {
    const action = args[0];
    if (action === "build") {
      const outFile = flag("--out");
      const cardRoot = flag("--card");
      const profileSource = cardRoot ? await explicitProfileForCardCommand(cardRoot) : undefined;
      const cardId = cardRoot ? undefined : args[1];
      if (!cardRoot && !cardId) throw new Error("card-id or --card is required");
      const artifact = cardRoot
        ? await buildCardArtifactForCard(await loadCardPackage(cardRoot), profileSource)
        : await buildCardArtifact(cardId!);
      if (outFile) {
        const outPath = path.resolve(outFile);
        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(outPath, JSON.stringify(artifact, null, 2) + "\n");
        if (flag("--format") === "json") {
          console.log(JSON.stringify({ file: outPath, sha256: artifactSha256(artifact) }, null, 2));
        } else {
          console.log(`Built card artifact: ${outPath} (sha256: ${artifactSha256(artifact)})`);
        }
      } else {
        if (flag("--format") === "json") {
          console.log(JSON.stringify({ artifact, sha256: artifactSha256(artifact) }, null, 2));
        } else {
          console.log(JSON.stringify(artifact, null, 2));
        }
      }
    } else if (action === "verify") {
      const filePath = args[1];
      if (!filePath) throw new Error("artifact file path is required");
      const raw = await readFile(path.resolve(filePath), "utf8");
      const expectedSha = flag("--sha256");
      const result = verifyCardArtifact(raw, expectedSha);
      if (flag("--format") === "json") {
        console.log(JSON.stringify(result, null, 2));
        if (!result.valid) process.exitCode = 1;
      } else if (result.valid) {
        console.log(`✓ Valid artifact (sha256: ${result.sha256})`);
      } else {
        console.log(`✗ Invalid artifact:`);
        for (const issue of result.issues) {
          console.log(`  ${issue.code}: ${issue.path} ${issue.message}`);
        }
        process.exitCode = 1;
      }
    } else {
      throw new Error("artifact action must be build or verify");
    }
  } else if (command === "dev") {
    const port = Number(flag("--port") ?? "4318");
    const host = flag("--host") ?? "127.0.0.1";
    const cardRoot = flag("--card");
    const profileSource = await explicitProfileForCardCommand(cardRoot);
    await startServer({ host, port, cardRoot, profile: profileSource });
  } else {
    usage();
    if (command !== "help" && command !== "--help") process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
