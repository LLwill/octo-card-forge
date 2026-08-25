#!/usr/bin/env bash

set -euo pipefail

: "${OCTO_CARD_BIN:?OCTO_CARD_BIN is required}"
: "${CLI_PACKAGE_ROOT:?CLI_PACKAGE_ROOT is required}"
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

forge_web_root="${FORGE_WEB_DIR:-$CLI_PACKAGE_ROOT/apps/forge-web/dist}"
if [[ ! -f "$forge_web_root/index.html" || ! -f "$forge_web_root/app.js" || ! -f "$forge_web_root/styles.css" ]]; then
  echo "Prebuilt Forge Web assets were not found: $forge_web_root" >&2
  exit 1
fi

preview_root="$output_root/preview"
preview_artifacts="$preview_root/artifacts"
preview_compiled="$preview_root/compiled"
preview_snapshot="$preview_root/catalog-snapshot.v1.json"
preview_snapshot_digest="$preview_root/catalog-snapshot.v1.sha256"
preview_entry="$preview_root/index.html"
artifact_name="$(basename "$artifact_file")"
preview_artifact="$preview_artifacts/$artifact_name"
mkdir -p "$preview_artifacts" "$preview_compiled"
cp -R "$forge_web_root/." "$preview_root/"
cp "$artifact_file" "$preview_artifact"
cp "$report_file" "$preview_root/verification.json"
cp -R "$compiled_dir/." "$preview_compiled/"

workspace_root="${GITHUB_WORKSPACE:-$PWD}"
source_path="$(node -e '
  const path = require("node:path");
  const relative = path.relative(process.argv[1], process.argv[2]).split(path.sep).join("/");
  if (!relative || relative === ".." || relative.startsWith("../")) process.exit(1);
  process.stdout.write(relative);
' "$workspace_root" "$card_root")"
source_repository="${GITHUB_REPOSITORY:-local/octo-card-catalog}"
source_commit="${GITHUB_SHA:-local-preview}"
pull_request_url=""
if [[ -n "${GITHUB_EVENT_PATH:-}" && -f "$GITHUB_EVENT_PATH" ]]; then
  pull_request_url="$(node -p "require(process.argv[1]).pull_request?.html_url || ''" "$GITHUB_EVENT_PATH")"
  event_repository="$(node -p "require(process.argv[1]).pull_request?.head?.repo?.full_name || ''" "$GITHUB_EVENT_PATH")"
  event_commit="$(node -p "require(process.argv[1]).pull_request?.head?.sha || ''" "$GITHUB_EVENT_PATH")"
  if [[ -n "$event_repository" ]]; then source_repository="$event_repository"; fi
  if [[ -n "$event_commit" ]]; then source_commit="$event_commit"; fi
fi

preview_records="$output_root/.preview-records.json"
preview_snapshot_result="$output_root/.preview-snapshot-build.json"
node "$GITHUB_ACTION_PATH/preview-record.mjs" \
  "$artifact_file" \
  "./artifacts/$artifact_name" \
  "$artifact_sha256" \
  "$source_repository" \
  "$source_commit" \
  "$source_path" \
  "$pull_request_url" > "$preview_records"

"$OCTO_CARD_BIN" snapshot build \
  --input "$preview_records" \
  --revision "$source_commit" \
  --channel preview \
  --out "$preview_snapshot" \
  --format json > "$preview_snapshot_result"
preview_snapshot_sha256="$(node -p "require(process.argv[1]).sha256" "$preview_snapshot_result")"
printf '%s\n' "$preview_snapshot_sha256" > "$preview_snapshot_digest"
"$OCTO_CARD_BIN" snapshot verify "$preview_snapshot" --sha256 "$preview_snapshot_sha256" --format json >/dev/null
node "$GITHUB_ACTION_PATH/embed-preview.mjs" "$preview_entry" "$preview_snapshot" "$preview_artifact"
rm "$preview_records" "$preview_snapshot_result"

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
  echo "preview-dir=$preview_root"
  echo "preview-entry=$preview_entry"
  echo "preview-snapshot-file=$preview_snapshot"
  echo "preview-snapshot-sha256=$preview_snapshot_sha256"
  echo "output-dir=$output_root"
  echo "workflow-artifact-name=$workflow_artifact_name"
} >> "$GITHUB_OUTPUT"
