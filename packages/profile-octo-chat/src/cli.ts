#!/usr/bin/env node
import { validateProfile } from "./index.js";

const args = process.argv.slice(2);
const command = args[0] ?? "validate";

async function main() {
  if (command === "validate") {
    const result = await validateProfile();
    if (result.errors.length > 0) {
      console.error(`Profile ${result.reference} has ${result.errors.length} error(s):`);
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
    console.log(`✓ ${result.reference} valid (package: ${result.packageName})`);
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Usage: octo-card-profile [validate]");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
