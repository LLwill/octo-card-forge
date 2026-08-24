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
mkdir -p "$output_root"

verification_file="$output_root/verification.json"
"$OCTO_CARD_BIN" verify \
  --card "$card_root" \
  --profile-package "$PROFILE_PACKAGE" \
  --release \
  --format json > "$verification_file"

card_id="$(node -p "require(process.argv[1]).card.id" "$verification_file")"
card_version="$(node -p "require(process.argv[1]).card.version" "$verification_file")"
release_tag="card/$card_id/v$card_version"
artifact_file="$output_root/$card_id-$card_version.artifact.json"
artifact_digest_file="$output_root/$card_id-$card_version.artifact.sha256"
handoff_file="$output_root/$card_id-$card_version.handoff.zip"
handoff_digest_file="$output_root/$card_id-$card_version.handoff.sha256"
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

"$OCTO_CARD_BIN" handoff \
  --card "$card_root" \
  --profile-package "$PROFILE_PACKAGE" \
  --output "$handoff_file" \
  --format json >/dev/null
handoff_sha256="$(node -e '
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
console.log(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"));
' "$handoff_file")"
printf '%s\n' "$handoff_sha256" > "$handoff_digest_file"

{
  echo "card-id=$card_id"
  echo "card-version=$card_version"
  echo "release-tag=$release_tag"
  echo "verification-file=$verification_file"
  echo "artifact-file=$artifact_file"
  echo "artifact-digest-file=$artifact_digest_file"
  echo "artifact-sha256=$artifact_sha256"
  echo "handoff-file=$handoff_file"
  echo "handoff-digest-file=$handoff_digest_file"
  echo "handoff-sha256=$handoff_sha256"
  echo "output-dir=$output_root"
} >> "$GITHUB_OUTPUT"
