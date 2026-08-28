#!/bin/sh

set -eu

OUTPUT_ENV=${1:-package.env}

: "${PUSH_IMAGE_PATH:?PUSH_IMAGE_PATH is required}"
: "${CONTAINER_IMAGE:?CONTAINER_IMAGE is required}"
: "${NODE_IMAGE:?NODE_IMAGE is required}"
: "${NPM_REGISTRY:?NPM_REGISTRY is required}"
: "${PNPM_VERSION:?PNPM_VERSION is required}"
: "${CI_COMMIT_SHA:?CI_COMMIT_SHA is required}"
: "${CI_COMMIT_REF_NAME:?CI_COMMIT_REF_NAME is required}"

BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
docker build \
  -t "$PUSH_IMAGE_PATH" \
  --build-arg NODE_IMAGE="$NODE_IMAGE" \
  --build-arg NPM_REGISTRY="$NPM_REGISTRY" \
  --build-arg PNPM_VERSION="$PNPM_VERSION" \
  --build-arg GIT_COMMIT="$CI_COMMIT_SHA" \
  --build-arg GIT_BRANCH="$CI_COMMIT_REF_NAME" \
  --build-arg GIT_TAG="${CI_COMMIT_TAG:-}" \
  --build-arg BUILD_DATE="$BUILD_DATE" \
  -f ./Dockerfile.ci .
docker push "$PUSH_IMAGE_PATH"

IMAGE_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$PUSH_IMAGE_PATH" | cut -d@ -f2)
printf '%s' "$IMAGE_DIGEST" | grep -Eq '^sha256:[0-9a-f]{64}$' || {
  echo "ERROR: failed to resolve the Forge image digest"
  exit 1
}

echo "IMAGE_DIGEST=$IMAGE_DIGEST" | tee "$OUTPUT_ENV"

echo "packaged $PUSH_IMAGE_PATH @ $IMAGE_DIGEST"
