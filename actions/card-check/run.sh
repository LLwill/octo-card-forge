#!/usr/bin/env bash

set -euo pipefail

: "${OCTO_CARD_BIN:?OCTO_CARD_BIN is required}"
: "${CARD_PATH:?CARD_PATH is required}"
: "${PROFILE_PACKAGE:?PROFILE_PACKAGE is required}"
: "${OUTPUT_DIR:?OUTPUT_DIR is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

if [[ ! -d "$CARD_PATH" ]]; then
  echo "Card path does not exist: $CARD_PATH" >&2
  exit 1
fi

card_root="$(cd "$CARD_PATH" && pwd)"
output_root="$(node -e 'console.log(require("node:path").resolve(process.argv[1]))' "$OUTPUT_DIR")"
compiled_dir="$output_root/compiled"
report_file="$output_root/verification.json"
mkdir -p "$compiled_dir"

"$OCTO_CARD_BIN" verify \
  --card "$card_root" \
  --profile-package "$PROFILE_PACKAGE" \
  --emit-dir "$compiled_dir" \
  --format json > "$report_file"

card_id="$(node -p "require(process.argv[1]).card.id" "$report_file")"
card_version="$(node -p "require(process.argv[1]).card.version" "$report_file")"
artifact_file="$output_root/$card_id-$card_version.artifact.json"
artifact_digest_file="$output_root/$card_id-$card_version.artifact.sha256"
artifact_result="$output_root/.artifact-build.json"

"$OCTO_CARD_BIN" artifact build \
  --card "$card_root" \
  --profile-package "$PROFILE_PACKAGE" \
  --out "$artifact_file" \
  --format json > "$artifact_result"

artifact_sha256="$(node -p "require(process.argv[1]).sha256" "$artifact_result")"
printf '%s\n' "$artifact_sha256" > "$artifact_digest_file"
"$OCTO_CARD_BIN" artifact verify "$artifact_file" --sha256 "$artifact_sha256" --format json >/dev/null
rm "$artifact_result"

short_sha="${GITHUB_SHA:-local}"
short_sha="${short_sha:0:12}"
workflow_artifact_name="card-check-$card_id-$card_version-$short_sha"

{
  echo "card-id=$card_id"
  echo "card-version=$card_version"
  echo "report-file=$report_file"
  echo "compiled-dir=$compiled_dir"
  echo "artifact-file=$artifact_file"
  echo "artifact-digest-file=$artifact_digest_file"
  echo "artifact-sha256=$artifact_sha256"
  echo "output-dir=$output_root"
  echo "workflow-artifact-name=$workflow_artifact_name"
} >> "$GITHUB_OUTPUT"
