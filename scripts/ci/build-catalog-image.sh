#!/bin/sh

set -eu

OUTPUT_ENV=${1:-catalog-package.env}

: "${CATALOG_IMAGE:?CATALOG_IMAGE is required}"
: "${CATALOG_REVISION:?CATALOG_REVISION is required}"
: "${FORGE_BUILDER_IMAGE:?FORGE_BUILDER_IMAGE is required}"
: "${CATALOG_DATA_BASE_IMAGE:?CATALOG_DATA_BASE_IMAGE is required}"
: "${CURL_IMAGE:?CURL_IMAGE is required}"
: "${CI_PIPELINE_ID:?CI_PIPELINE_ID is required}"

printf '%s' "$CATALOG_REVISION" | grep -Eq '^[0-9a-f]{40}$' || {
  echo "CATALOG_REVISION must be a lowercase 40-character SHA"
  exit 1
}
printf '%s' "$FORGE_BUILDER_IMAGE" | grep -Eq '^.+@sha256:[0-9a-f]{64}$' || {
  echo "FORGE_BUILDER_IMAGE must be pinned by digest"
  exit 1
}
printf '%s' "$CATALOG_DATA_BASE_IMAGE" | grep -Eq '^.+@sha256:[0-9a-f]{64}$' || {
  echo "CATALOG_DATA_BASE_IMAGE must be pinned by digest"
  exit 1
}

docker pull "$FORGE_BUILDER_IMAGE"
BUILDER_IMAGE_DIGEST=${FORGE_BUILDER_IMAGE##*@}
FORGE_BUILDER_REVISION=$(docker image inspect "$FORGE_BUILDER_IMAGE" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
printf '%s' "$FORGE_BUILDER_REVISION" | grep -Eq '^[0-9a-f]{40}$' || {
  echo "Forge Builder image does not carry a full revision label"
  exit 1
}

SNAPSHOT_URL="https://github.com/LLwill/octo-card-catalog/releases/download/catalog-snapshot/${CATALOG_REVISION}/catalog-snapshot.v1.json"
BUILDER_CONTAINER="catalog-builder-${CI_PIPELINE_ID}"
SMOKE_CONTAINER="catalog-smoke-${CI_PIPELINE_ID}"
SMOKE_NETWORK="catalog-smoke-${CI_PIPELINE_ID}"
SMOKE_VOLUME="catalog-smoke-${CI_PIPELINE_ID}"

cleanup() {
  docker rm -f "$BUILDER_CONTAINER" "$SMOKE_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$SMOKE_NETWORK" >/dev/null 2>&1 || true
  docker volume rm "$SMOKE_VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker create --name "$BUILDER_CONTAINER" \
  -e CATALOG_SNAPSHOT="$SNAPSHOT_URL" \
  -e CATALOG_REVISION="$CATALOG_REVISION" \
  -e FORGE_REVISION="$FORGE_BUILDER_REVISION" \
  -e BUILDER_IMAGE_DIGEST="$BUILDER_IMAGE_DIGEST" \
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
  --build-arg CATALOG_DATA_BASE_IMAGE="$CATALOG_DATA_BASE_IMAGE" \
  --build-arg CATALOG_REVISION="$CATALOG_REVISION" \
  --build-arg FORGE_REVISION="$FORGE_BUILDER_REVISION" \
  --build-arg BUILDER_IMAGE_DIGEST="$BUILDER_IMAGE_DIGEST" \
  -f Dockerfile.catalog .

docker network create "$SMOKE_NETWORK"
docker volume create "$SMOKE_VOLUME"
docker run --rm --user 0 -v "$SMOKE_VOLUME:/catalog-data" "$CATALOG_DATA_BASE_IMAGE" sh -c 'chown 10001:10001 /catalog-data'
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
} | tee "$OUTPUT_ENV"

echo "packaged $PUSH_CATALOG_IMAGE @ $CATALOG_IMAGE_DIGEST"
