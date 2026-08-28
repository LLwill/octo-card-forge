import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("GitLab deployment pipeline", () => {
  it("builds both immutable images in one guarded bootstrap pipeline", async () => {
    const ci = await readFile(".gitlab-ci.yml", "utf8");

    expect(ci).toContain('$CI_PIPELINE_SOURCE == "web" && $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH && $PIPELINE_MODE == "bootstrap"');
    expect(ci).toContain("package_bootstrap:");
    expect(ci).toContain('sh scripts/ci/build-forge-image.sh package.env');
    expect(ci).toContain('export FORGE_BUILDER_IMAGE="${CONTAINER_IMAGE}@${IMAGE_DIGEST}"');
    expect(ci).toContain('sh scripts/ci/build-catalog-image.sh catalog-package.env');
    expect(ci).toContain("cat package.env catalog-package.env > bootstrap-package.env");
    expect(ci).toContain('if [ "${PIPELINE_MODE:-}" = "bootstrap" ]; then');
  });

  it("resolves the normal Catalog builder from the deployed Forge digest", async () => {
    const ci = await readFile(".gitlab-ci.yml", "utf8");

    expect(ci).toContain("resolve_forge_builder:");
    expect(ci).toContain('git clone -b "$APP_NAME-prod"');
    expect(ci).toContain('prefix = repo "@"');
    expect(ci).toContain('echo "FORGE_BUILDER_IMAGE=$FORGE_BUILDER_IMAGE" | tee forge-builder.env');
  });

  it("keeps image construction digest-pinned and reusable", async () => {
    const forge = await readFile("scripts/ci/build-forge-image.sh", "utf8");
    const catalog = await readFile("scripts/ci/build-catalog-image.sh", "utf8");

    expect(forge).toContain('echo "IMAGE_DIGEST=$IMAGE_DIGEST"');
    expect(forge).toContain("^sha256:[0-9a-f]{64}$");
    expect(catalog).toContain("FORGE_BUILDER_IMAGE must be pinned by digest");
    expect(catalog).toContain("CATALOG_DATA_BASE_IMAGE must be pinned by digest");
    expect(catalog).toContain("org.opencontainers.image.revision");
  });

  it("renders a portable base path without coupling probes to ingress routing", async () => {
    const ci = await readFile(".gitlab-ci.yml", "utf8");
    const manifest = await readFile("manifests/deploy.yaml", "utf8");

    expect(manifest).toContain("name: BASE_PATH");
    expect(manifest).toContain('value: "{{BASE_PATH}}"');
    expect(manifest).toContain("path: /readyz");
    expect(manifest).toContain("path: /healthz");
    expect(manifest).toContain("targetPort: 4318");

    expect(ci).toContain("CURRENT_BASE_PATH_CONFIGURED=true");
    expect(ci).toContain('BASE_PATH="${CURRENT_BASE_PATH:-}"');
    expect(ci).toContain('BASE_PATH="${DEPLOY_BASE_PATH:-}"');
    expect(ci).toContain("BASE_PATH must be a URL path prefix");
    expect(ci).toContain('sed -i "s|{{BASE_PATH}}|${BASE_PATH}|g" manifests/deploy.yaml');
  });
});
