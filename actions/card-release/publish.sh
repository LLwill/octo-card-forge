#!/usr/bin/env bash

set -euo pipefail

: "${GH_TOKEN:?github-token is required when publish is true}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"
: "${GITHUB_REF_TYPE:?GITHUB_REF_TYPE is required}"
: "${GITHUB_REF_NAME:?GITHUB_REF_NAME is required}"
: "${RELEASE_BRANCH:?RELEASE_BRANCH is required}"
: "${RELEASE_TAG:?RELEASE_TAG is required}"
: "${CARD_ID:?CARD_ID is required}"
: "${CARD_VERSION:?CARD_VERSION is required}"
: "${ARTIFACT_FILE:?ARTIFACT_FILE is required}"
: "${ARTIFACT_DIGEST_FILE:?ARTIFACT_DIGEST_FILE is required}"
: "${HANDOFF_FILE:?HANDOFF_FILE is required}"
: "${HANDOFF_DIGEST_FILE:?HANDOFF_DIGEST_FILE is required}"
: "${VERIFICATION_FILE:?VERIFICATION_FILE is required}"
: "${ARTIFACT_SHA256:?ARTIFACT_SHA256 is required}"
: "${HANDOFF_SHA256:?HANDOFF_SHA256 is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

if [[ "$GITHUB_REF_TYPE" != "branch" || "$GITHUB_REF_NAME" != "$RELEASE_BRANCH" ]]; then
  echo "Card Releases may only be created from branch $RELEASE_BRANCH." >&2
  exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/$RELEASE_TAG" >/dev/null 2>&1; then
  echo "Card Release tag already exists and cannot be overwritten: $RELEASE_TAG" >&2
  exit 1
fi
if gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
  echo "Card Release already exists and cannot be overwritten: $RELEASE_TAG" >&2
  exit 1
fi

notes_file="$(dirname "$ARTIFACT_FILE")/release-notes.md"
cat > "$notes_file" <<EOF
Immutable Octo Card release for \`$CARD_ID@$CARD_VERSION\`.

- Card Artifact canonical SHA-256: \`$ARTIFACT_SHA256\`
- Backend Handoff ZIP SHA-256: \`$HANDOFF_SHA256\`
- Source commit: \`$GITHUB_SHA\`
EOF

gh release create "$RELEASE_TAG" \
  "$ARTIFACT_FILE" \
  "$ARTIFACT_DIGEST_FILE" \
  "$HANDOFF_FILE" \
  "$HANDOFF_DIGEST_FILE" \
  "$VERIFICATION_FILE" \
  --repo "$GITHUB_REPOSITORY" \
  --target "$GITHUB_SHA" \
  --title "$CARD_ID v$CARD_VERSION" \
  --notes-file "$notes_file"

release_url="$(gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --json url --jq .url)"
echo "release-url=$release_url" >> "$GITHUB_OUTPUT"
