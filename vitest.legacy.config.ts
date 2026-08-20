import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@mlt-org/octo-card-core": path.join(root, "packages/core/src/index.ts"),
      "@mlt-org/octo-card-spec": path.join(root, "packages/card-spec/src/index.ts"),
      "@mlt-org/octo-card-workspace": path.join(root, "packages/workspace/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
