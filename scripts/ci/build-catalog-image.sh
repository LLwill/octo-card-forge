#!/bin/sh

set -eu

OUTPUT_ENV=${1:-catalog-package.env}

: "${CATALOG_IMAGE:?CATALOG_IMAGE is required}"
: "${CATALOG_REVISION:?CATALOG_REVISION is required}"
: "${CATALOG_TRANSFER_SHA256:?CATALOG_TRANSFER_SHA256 is required}"
: "${FORGE_BUILDER_IMAGE:?FORGE_BUILDER_IMAGE is required}"
: "${GIT_IMAGE:?GIT_IMAGE is required}"
: "${CURL_IMAGE:?CURL_IMAGE is required}"
: "${CI_API_V4_URL:?CI_API_V4_URL is required}"
: "${CI_PROJECT_ID:?CI_PROJECT_ID is required}"
: "${CI_JOB_TOKEN:?CI_JOB_TOKEN is required}"
: "${CI_PIPELINE_ID:?CI_PIPELINE_ID is required}"

CATALOG_DATA_BASE_IMAGE=${CATALOG_DATA_BASE_IMAGE:-$GIT_IMAGE}

printf '%s' "$CATALOG_REVISION" | grep -Eq '^[0-9a-f]{40}$' || {
  echo "CATALOG_REVISION must be a lowercase 40-character SHA"
  exit 1
}
printf '%s' "$CATALOG_TRANSFER_SHA256" | grep -Eq '^[0-9a-f]{64}$' || {
  echo "CATALOG_TRANSFER_SHA256 must be a lowercase SHA-256 digest"
  exit 1
}
printf '%s' "$FORGE_BUILDER_IMAGE" | grep -Eq '^.+@sha256:[0-9a-f]{64}$' || {
  echo "FORGE_BUILDER_IMAGE must be pinned by digest"
  exit 1
}

docker pull "$CATALOG_DATA_BASE_IMAGE"
CATALOG_DATA_BASE_IMAGE_RESOLVED=$(docker image inspect "$CATALOG_DATA_BASE_IMAGE" --format '{{index .RepoDigests 0}}' 2>/dev/null || true)
printf '%s' "$CATALOG_DATA_BASE_IMAGE_RESOLVED" | grep -Eq '^.+@sha256:[0-9a-f]{64}$' || {
  echo "Unable to resolve CATALOG_DATA_BASE_IMAGE to an immutable digest"
  exit 1
}
CATALOG_DATA_BASE_IMAGE_DIGEST=${CATALOG_DATA_BASE_IMAGE_RESOLVED##*@}
docker run --rm --entrypoint sh "$CATALOG_DATA_BASE_IMAGE_RESOLVED" -c \
  'command -v cp >/dev/null && command -v chown >/dev/null' || {
  echo "CATALOG_DATA_BASE_IMAGE must provide sh, cp, and chown"
  exit 1
}

docker pull "$FORGE_BUILDER_IMAGE"
BUILDER_IMAGE_DIGEST=${FORGE_BUILDER_IMAGE##*@}
FORGE_BUILDER_REVISION=$(docker image inspect "$FORGE_BUILDER_IMAGE" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
printf '%s' "$FORGE_BUILDER_REVISION" | grep -Eq '^[0-9a-f]{40}$' || {
  echo "Forge Builder image does not carry a full revision label"
  exit 1
}

TRANSFER_PACKAGE_URL="${CI_API_V4_URL%/}/projects/${CI_PROJECT_ID}/packages/generic/catalog-transfer/${CATALOG_REVISION}/catalog-transfer.tgz"
BUILDER_CONTAINER="catalog-builder-${CI_PIPELINE_ID}"
SMOKE_CONTAINER="catalog-smoke-${CI_PIPELINE_ID}"
SMOKE_NETWORK="catalog-smoke-${CI_PIPELINE_ID}"
SMOKE_VOLUME="catalog-smoke-${CI_PIPELINE_ID}"
TRANSFER_VOLUME="catalog-transfer-${CI_PIPELINE_ID}"

cleanup() {
  docker rm -f "$BUILDER_CONTAINER" "$SMOKE_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$SMOKE_NETWORK" >/dev/null 2>&1 || true
  docker volume rm "$SMOKE_VOLUME" >/dev/null 2>&1 || true
  docker volume rm "$TRANSFER_VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "$TRANSFER_VOLUME" >/dev/null
printf '%s\n' "$CI_JOB_TOKEN" | docker run --rm -i --entrypoint sh \
  -e TRANSFER_PACKAGE_URL="$TRANSFER_PACKAGE_URL" \
  -e CATALOG_TRANSFER_SHA256="$CATALOG_TRANSFER_SHA256" \
  -v "$TRANSFER_VOLUME:/transfer" \
  "$CURL_IMAGE" -c '
    set -eu
    IFS= read -r job_token
    curl --location --fail --show-error --silent \
      --header "JOB-TOKEN: ${job_token}" \
      --output /transfer/catalog-transfer.tgz \
      "$TRANSFER_PACKAGE_URL"
    printf "%s  %s\n" "$CATALOG_TRANSFER_SHA256" /transfer/catalog-transfer.tgz | sha256sum -c -
    mkdir -p /transfer/input
    tar -xzf /transfer/catalog-transfer.tgz -C /transfer/input
    test -f /transfer/input/catalog-snapshot.v1.json
    test -f /transfer/input/transfer-manifest.json
    test -d /transfer/input/resources
  '

docker create --name "$BUILDER_CONTAINER" \
  -e CATALOG_SNAPSHOT=/tmp/catalog-transfer/input/catalog-snapshot.v1.json \
  -e CATALOG_RESOURCE_ROOT=/tmp/catalog-transfer/input/resources \
  -e CATALOG_REVISION="$CATALOG_REVISION" \
  -e FORGE_REVISION="$FORGE_BUILDER_REVISION" \
  -e BUILDER_IMAGE_DIGEST="$BUILDER_IMAGE_DIGEST" \
  -v "$TRANSFER_VOLUME:/tmp/catalog-transfer:ro" \
  "$FORGE_BUILDER_IMAGE" \
  node dist/catalog-bundle.js --output /tmp/catalog
docker start -a "$BUILDER_CONTAINER"

rm -rf .release/catalog
mkdir -p .release
docker cp "$BUILDER_CONTAINER:/tmp/catalog" .release/catalog

BUILDER_SUFFIX=$(printf '%s' "$BUILDER_IMAGE_DIGEST" | cut -d: -f2 | cut -c1-12)
PUSH_CATALOG_IMAGE="${CATALOG_IMAGE}:${CATALOG_REVISION}-${BUILDER_SUFFIX}"
docker build \
  -t "$PUSH_CATALOG_IMAGE" \
  --build-arg CATALOG_DATA_BASE_IMAGE="$CATALOG_DATA_BASE_IMAGE_RESOLVED" \
  --build-arg CATALOG_DATA_BASE_IMAGE_DIGEST="$CATALOG_DATA_BASE_IMAGE_DIGEST" \
  --build-arg CATALOG_REVISION="$CATALOG_REVISION" \
  --build-arg FORGE_REVISION="$FORGE_BUILDER_REVISION" \
  --build-arg BUILDER_IMAGE_DIGEST="$BUILDER_IMAGE_DIGEST" \
  -f Dockerfile.catalog .

docker network create "$SMOKE_NETWORK"
docker volume create "$SMOKE_VOLUME"
docker run --rm --user 0 --entrypoint sh -v "$SMOKE_VOLUME:/catalog-data" "$CATALOG_DATA_BASE_IMAGE_RESOLVED" -c 'chown 10001:10001 /catalog-data'
docker run --rm -v "$SMOKE_VOLUME:/catalog-data" "$PUSH_CATALOG_IMAGE"
docker run -d --name "$SMOKE_CONTAINER" --network "$SMOKE_NETWORK" \
  -e CATALOG_ROOT=/app/catalog \
  -e CATALOG_IMAGE_DIGEST=sha256:local-smoke \
  -e CATALOG_REVISION="$CATALOG_REVISION" \
  -e FORGE_REVISION="$FORGE_BUILDER_REVISION" \
  -v "$SMOKE_VOLUME:/app/catalog:ro" \
  "$FORGE_BUILDER_IMAGE"
docker run --rm --network "$SMOKE_NETWORK" -e SMOKE_HOST="$SMOKE_CONTAINER" "$CURL_IMAGE" sh -c \
  'i=0; until curl --fail --silent "http://${SMOKE_HOST}:4318/readyz" | grep -Eq '"'"'"status"[[:space:]]*:[[:space:]]*"ready"'"'"'; do i=$((i + 1)); [ "$i" -lt 30 ] || exit 1; sleep 1; done'
docker run --rm --network "$SMOKE_NETWORK" -e SMOKE_HOST="$SMOKE_CONTAINER" -e EXPECTED_CATALOG_REVISION="$CATALOG_REVISION" "$CURL_IMAGE" sh -c \
  'curl --fail --silent "http://${SMOKE_HOST}:4318/api/v1/runtime" | grep -Eq "\"catalogRevision\"[[:space:]]*:[[:space:]]*\"${EXPECTED_CATALOG_REVISION}\""'

docker push "$PUSH_CATALOG_IMAGE"
CATALOG_IMAGE_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$PUSH_CATALOG_IMAGE" | cut -d@ -f2)
printf '%s' "$CATALOG_IMAGE_DIGEST" | grep -Eq '^sha256:[0-9a-f]{64}$' || {
  echo "ERROR: failed to resolve the Catalog image digest"
  exit 1
}

{
  echo "CATALOG_IMAGE_DIGEST=$CATALOG_IMAGE_DIGEST"
  echo "CATALOG_REVISION=$CATALOG_REVISION"
  echo "FORGE_BUILDER_REVISION=$FORGE_BUILDER_REVISION"
  echo "CATALOG_DATA_BASE_IMAGE_DIGEST=$CATALOG_DATA_BASE_IMAGE_DIGEST"
} | tee "$OUTPUT_ENV"

echo "packaged $PUSH_CATALOG_IMAGE @ $CATALOG_IMAGE_DIGEST"
