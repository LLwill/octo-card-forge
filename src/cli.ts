#!/usr/bin/env node
import path from "node:path";
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
import { buildHandoffPackage, writeHandoffPackage } from "./handoff.js";
import { initCard } from "./init.js";
import {
  bundleRenderProfile,
  packRenderProfile,
  validateRenderProfile,
} from "./profile.js";
import {
  loadRenderProfileFromDirectory,
  loadRenderProfileFromPackage,
} from "./profile-source.js";
import { getCard, listCards, loadCardPackage } from "./registry.js";
import { startServer } from "./server.js";
import type { JsonObject } from "./types.js";

const args = process.argv.slice(2);
const command = args.shift() ?? "help";
const VALUE_FLAGS = new Set([
  "--card",
  "--data",
  "--format",
  "--host",
  "--name",
  "--output",
  "--port",
  "--profile",
  "--profile-dir",
  "--profile-package",
  "--render-profile",
  "--sample",
  "--view",
  "--wire-profile",
]);

function flag(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(): void {
  console.log(`octo-card commands:
  init <card-id> --name <name> [--view default] [--wire-profile octo/v1] [--render-profile octo-chat@latest] [--format json]
  list
  discover [query] [--profile octo-chat@latest] [--profile-dir <dir> | --profile-package <pkg>] [--format json]
  explain utility <token> [--profile octo-chat@latest] [--profile-dir <dir> | --profile-package <pkg>] [--format json]
  lint [card-id] [--card <dir>] [--profile-dir <dir> | --profile-package <pkg>] [--format json]
  contract <card-id> [--format json]
  inspect <card-id> [--card <dir>] [--profile-dir <dir> | --profile-package <pkg>] [--sample <name>] [--format json]
  handoff <card-id> [--output dist] [--format json]
  handoff <card-id> --output -  # print the aggregate JSON to stdout
  render <card-id> --sample <name>
  render <card-id> --view <view> --data <file>
  render --card <dir> [--profile-dir <dir> | --profile-package <pkg>] --sample <name>
  render --card <dir> [--profile-dir <dir> | --profile-package <pkg>] --view <view> --data <file>
  check [card-id] [--card <dir>] [--profile-dir <dir> | --profile-package <pkg>] [--format json]
  profile validate <profile@version>
  profile bundle <profile@version> [--output .release]
  profile pack <profile@version> [--output .release]
  dev [card-id] [--host 127.0.0.1] [--port 4318]`);
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
    console.log(`\n${card.cardId}@${card.version}`);
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
      view: flag("--view"),
      renderProfile: flag("--render-profile"),
      wireProfile: flag("--wire-profile") as "octo/v1" | "octo/v2" | undefined,
    });
    if (flag("--format") === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Created ${result.cardId} (${result.name})`);
      for (const file of result.files) console.log(`  ${file}`);
      console.log(`Next: pnpm cli check ${result.cardId}`);
    }
  } else if (command === "list") {
    const cards = await listCards();
    console.log(
      cards
        .map(
          ({ manifest }) =>
            `${manifest.id}\t${manifest.version}\tcontract ${manifest.contractVersion}\t${manifest.name}`
        )
        .join("\n")
    );
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
        ? await compileSampleFromDirectory({ cardRoot, sample, profile: profileSource })
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
  } else if (command === "handoff") {
    const cardId = args[0];
    if (!cardId) throw new Error("card-id is required");
    const output = flag("--output") ?? "dist";
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
  } else if (command === "render") {
    const cardRoot = flag("--card");
    const profileSource = await explicitProfileForCardCommand(cardRoot);
    const cardId = cardRoot ? undefined : positional(0);
    if (!cardRoot && !cardId) throw new Error("card-id or --card is required");
    const sample = flag("--sample");
    const dataPath = flag("--data");
    if (!sample && !dataPath) throw new Error("--data is required without --sample");
    const result = sample
      ? cardRoot
        ? await compileSampleFromDirectory({ cardRoot, sample, profile: profileSource })
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
        console.log(`${card.cardId}@${card.version}`);
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
  } else if (command === "dev") {
    const port = Number(flag("--port") ?? "4318");
    const host = flag("--host") ?? "127.0.0.1";
    await startServer({ host, port });
  } else {
    usage();
    if (command !== "help" && command !== "--help") process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
