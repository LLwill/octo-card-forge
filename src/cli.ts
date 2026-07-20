#!/usr/bin/env node
import path from "node:path";
import { checkCards } from "./check.js";
import { compileCard, compileSample } from "./compiler.js";
import { readJson } from "./fs.js";
import { initCard } from "./init.js";
import { getCard, listCards } from "./registry.js";
import { startServer } from "./server.js";
import type { JsonObject } from "./types.js";

const args = process.argv.slice(2);
const command = args.shift() ?? "help";

function flag(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage(): void {
  console.log(`octo-card commands:
  init <card-id> --name <name> [--view default] [--host-profile octo-web@1.0.0] [--format json]
  list
  contract <card-id>
  render <card-id> --sample <name>
  render <card-id> --view <view> --data <file>
  check [card-id] [--format json]
  dev [card-id] [--port 4318]`);
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
      hostProfile: flag("--host-profile"),
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
  } else if (command === "contract") {
    const cardId = args[0];
    if (!cardId) throw new Error("card-id is required");
    const card = await getCard(cardId);
    console.log(
      JSON.stringify(
        {
          card: card.manifest,
          schema: await readJson(path.join(card.root, card.manifest.dataSchema)),
          interactions: await readJson(
            path.join(card.root, card.manifest.interactions)
          ),
        },
        null,
        2
      )
    );
  } else if (command === "render") {
    const cardId = args[0];
    if (!cardId) throw new Error("card-id is required");
    const sample = flag("--sample");
    const result = sample
      ? await compileSample({ cardId, sample })
      : await compileCard({
          cardId,
          view: flag("--view") ?? "pending",
          data: await readJson<JsonObject>(path.resolve(flag("--data") ?? "")),
        });
    if (result.issues.some((issue) => issue.severity === "error")) {
      console.error(JSON.stringify(result.issues, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result.payload, null, 2));
    }
  } else if (command === "check") {
    const cardId = args[0]?.startsWith("--") ? undefined : args[0];
    const report = await checkCards(cardId);
    if (flag("--format") === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const card of report.cards) {
        console.log(`${card.cardId}@${card.version}`);
        for (const sample of card.samples) {
          console.log(`  ${sample.valid ? "✓" : "✗"} ${sample.name} (${sample.view})`);
          for (const issue of sample.issues) {
            console.log(`    ${issue.severity}: ${issue.code} ${issue.path} ${issue.message}`);
          }
        }
      }
    }
    if (!report.valid) process.exitCode = 1;
  } else if (command === "dev") {
    const port = Number(flag("--port") ?? "4318");
    await startServer({ port });
  } else {
    usage();
    if (command !== "help" && command !== "--help") process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
