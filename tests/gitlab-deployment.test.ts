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
    const catalogDockerfile = await readFile("Dockerfile.catalog", "utf8");

    expect(forge).toContain('echo "IMAGE_DIGEST=$IMAGE_DIGEST"');
    expect(forge).toContain("^sha256:[0-9a-f]{64}$");
    expect(catalog).toContain("FORGE_BUILDER_IMAGE must be pinned by digest");
    expect(catalog).toContain('CATALOG_DATA_BASE_IMAGE=${CATALOG_DATA_BASE_IMAGE:-$GIT_IMAGE}');
    expect(catalog).toContain('docker pull "$CATALOG_DATA_BASE_IMAGE"');
    expect(catalog).toContain("CATALOG_DATA_BASE_IMAGE_RESOLVED");
    expect(catalog).toContain("CATALOG_DATA_BASE_IMAGE must provide sh, cp, and chown");
    expect(catalog).toContain('--entrypoint sh');
    expect(catalog).toContain("org.opencontainers.image.revision");
    expect(catalogDockerfile).toContain("ENTRYPOINT []");
    expect(catalogDockerfile).toContain("octo.card-catalog.base-image-digest");
  });

  it("builds Catalog images from a verified same-project transfer package", async () => {
    const ci = await readFile(".gitlab-ci.yml", "utf8");
    const catalog = await readFile("scripts/ci/build-catalog-image.sh", "utf8");
    const builder = await readFile("scripts/build-catalog-bundle.mjs", "utf8");

    expect(ci).toContain('$CI_PIPELINE_SOURCE == "trigger" && $PIPELINE_MODE == "bootstrap"');
    expect(catalog).toContain("CATALOG_TRANSFER_SHA256 is required");
    expect(catalog).toContain("/projects/${CI_PROJECT_ID}/packages/generic/catalog-transfer/${CATALOG_REVISION}/catalog-transfer.tgz");
    expect(catalog).toContain('JOB-TOKEN: ${job_token}');
    expect(catalog).toContain("sha256sum -c -");
    expect(catalog).not.toContain("sha256sum --check");
    expect(catalog).toContain("CATALOG_RESOURCE_ROOT=/tmp/catalog-transfer/input/resources");
    expect(catalog).not.toContain("github.com/LLwill/octo-card-catalog");
    expect(builder).toContain("CATALOG_RESOURCE_ROOT");
    expect(builder).toContain("transfer resource digest mismatch");
  });

  it("allows the first bootstrap to complete before an external URL exists", async () => {
    const ci = await readFile(".gitlab-ci.yml", "utf8");

    expect(ci).toContain('if [ -z "${PROD_URL:-}" ]; then');
    expect(ci).toContain('if [ "${PIPELINE_MODE:-}" = "bootstrap" ]; then');
    expect(ci).toContain("Skipping external smoke test during bootstrap");
    expect(ci).toContain("PROD_URL is required for release smoke testing");
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

  it("updates the production GitOps branch before the manual ArgoCD gate", async () => {
    const ci = await readFile(".gitlab-ci.yml", "utf8");
    const argocdJob = ci.slice(ci.indexOf("argocd_sync:"), ci.indexOf("smoke_prod:"));

    expect(ci.match(/git push "\$DEPLOY_REPO_URL" "HEAD:\$TARGET_BRANCH"/g)).toHaveLength(2);
    expect(ci).not.toContain("merge_request.create");
    expect(ci).not.toContain('SOURCE_BRANCH="deploy/');
    expect(argocdJob).toContain("when: manual");
    expect(argocdJob).toContain("image: $CURL_IMAGE");
    expect(argocdJob).not.toContain("git clone");
    expect(argocdJob).not.toContain("CODE_TOKEN");
  });
});
