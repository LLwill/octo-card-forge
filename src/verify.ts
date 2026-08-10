import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkCardPackage } from "./check.js";
import { compileSampleFromDirectory } from "./compiler.js";
import {
  writeHandoffPackageForCard,
} from "./handoff.js";
import { lintCardPackageForAgent } from "./agent.js";
import { loadCardPackage } from "./registry.js";
import type { JsonObject, RenderProfileSource } from "./types.js";

export interface VerifyCardOptions {
  cardRoot: string;
  profile?: RenderProfileSource;
  sample?: string;
  /** Apply the immutable release-package gate instead of draft validation. */
  release?: boolean;
  emitDir?: string;
  handoffDir?: string;
}

export interface VerifyCardReport {
  valid: boolean;
  package: {
    kind: "draft" | "release";
    mutable: boolean;
  };
  card: {
    id: string;
    version: string;
  };
  check: Awaited<ReturnType<typeof checkCardPackage>>;
  lint: Awaited<ReturnType<typeof lintCardPackageForAgent>>;
  samples: Array<{
    name: string;
    view: string;
    wireProfile: string;
    valid: boolean;
    bytes: number;
    output?: string;
    issues: Array<{
      severity: "error" | "warning";
      code: string;
      path: string;
      message: string;
    }>;
  }>;
  handoff?: {
    filePath: string;
    bytes: number;
  };
}

function sampleEntries(
  card: Awaited<ReturnType<typeof loadCardPackage>>,
  sampleName?: string
): Array<{ name: string; view: string; wireProfile: string }> {
  const entries = [];
  for (const [view, definition] of Object.entries(card.manifest.views)) {
    for (const samplePath of definition.samples) {
      const name = path.basename(samplePath, path.extname(samplePath));
      if (sampleName && name !== sampleName) continue;
      entries.push({ name, view, wireProfile: definition.wireProfile });
    }
  }
  return entries;
}

function hasErrors(issues: Array<{ severity: "error" | "warning" }>): boolean {
  return issues.some((issue) => issue.severity === "error");
}

export async function verifyCardPackage(
  options: VerifyCardOptions
): Promise<VerifyCardReport> {
  const card = await loadCardPackage(options.cardRoot);
  if (options.release && card.kind !== "release") {
    throw new Error(
      `Release verification requires a versioned package under versions/${card.manifest.version}`
    );
  }
  const entries = sampleEntries(card, options.sample);
  if (entries.length === 0) {
    throw new Error(
      options.sample
        ? `Unknown sample ${options.sample} for ${card.manifest.id}`
        : `No samples found for ${card.manifest.id}`
    );
  }

  const [check, lint] = await Promise.all([
    checkCardPackage(options.cardRoot, options.profile),
    lintCardPackageForAgent(options.cardRoot, options.profile),
  ]);
  const samples: VerifyCardReport["samples"] = [];
  const emitDir = options.emitDir ? path.resolve(options.emitDir) : undefined;
  if (emitDir) await mkdir(emitDir, { recursive: true });

  for (const entry of entries) {
    const result = await compileSampleFromDirectory({
      cardRoot: options.cardRoot,
      sample: entry.name,
      view: entry.view,
      profile: options.profile,
    });
    const output = emitDir
      ? path.join(emitDir, `${entry.view}.${entry.name}.card.json`)
      : undefined;
    if (output) {
      await writeFile(output, `${JSON.stringify(result.payload, null, 2)}\n`);
    }
    samples.push({
      name: entry.name,
      view: entry.view,
      wireProfile: entry.wireProfile,
      valid: !hasErrors(result.issues),
      bytes: Buffer.byteLength(JSON.stringify(result.payload)),
      output,
      issues: result.issues,
    });
  }

  const handoff = options.handoffDir
    ? await writeHandoffPackageForCard(card, options.handoffDir, options.profile)
    : undefined;
  return {
    valid: check.valid && lint.valid && samples.every((sample) => sample.valid),
    package: {
      kind: card.kind,
      mutable: card.mutable,
    },
    card: {
      id: card.manifest.id,
      version: card.manifest.version,
    },
    check,
    lint,
    samples,
    handoff,
  };
}

export function verifySummary(report: VerifyCardReport): JsonObject {
  return {
    valid: report.valid,
    package: report.package,
    card: report.card,
    samples: report.samples.map((sample) => ({
      name: sample.name,
      view: sample.view,
      valid: sample.valid,
      bytes: sample.bytes,
      output: sample.output,
      errors: sample.issues.filter((issue) => issue.severity === "error").length,
      warnings: sample.issues.filter((issue) => issue.severity === "warning").length,
      issues: sample.issues,
    })),
    check: {
      valid: report.check.valid,
      errors: report.check.cards.flatMap((card) =>
        card.samples.flatMap((sample) =>
          sample.issues.filter((issue) => issue.severity === "error")
        )
      ).length,
    },
    lint: {
      valid: report.lint.valid,
      errors: report.lint.summary.errors,
      warnings: report.lint.summary.warnings,
      utilityTokens: report.lint.summary.tokens,
    },
    handoff: report.handoff,
  };
}
