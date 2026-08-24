#!/usr/bin/env bash

set -euo pipefail

: "${CLI_VERSION:?CLI_VERSION is required}"
: "${PROFILE_PACKAGE:?PROFILE_PACKAGE is required}"
: "${PROFILE_VERSION:?PROFILE_VERSION is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

semver_pattern='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z]+([.-][0-9A-Za-z]+)*)?$'
package_pattern='^(@[a-z0-9._-]+/)?[a-z0-9._-]+$'

if [[ ! "$CLI_VERSION" =~ $semver_pattern ]]; then
  echo "cli-version must be an exact semantic version." >&2
  exit 1
fi
if [[ ! "$PROFILE_VERSION" =~ $semver_pattern ]]; then
  echo "profile-version must be an exact semantic version." >&2
  exit 1
fi
if [[ ! "$PROFILE_PACKAGE" =~ $package_pattern ]]; then
  echo "profile-package must be an npm package name." >&2
  exit 1
fi

tool_root="$RUNNER_TEMP/octo-card-tools/$CLI_VERSION/$PROFILE_VERSION"
cli_package='@mlt-org/octo-card-cli'
cli_bin="$tool_root/node_modules/.bin/octo-card"

installed=false
if [[ -x "$cli_bin" ]]; then
  if node - "$tool_root" "$CLI_VERSION" "$PROFILE_PACKAGE" "$PROFILE_VERSION" <<'NODE'
const path = require("node:path");

const [root, cliVersion, profilePackage, profileVersion] = process.argv.slice(2);
const packagePath = (name) => path.join(root, "node_modules", ...name.split("/"), "package.json");
const cli = require(packagePath("@mlt-org/octo-card-cli"));
const profile = require(packagePath(profilePackage));
if (cli.version !== cliVersion || profile.version !== profileVersion) process.exit(1);
NODE
  then
    installed=true
  fi
fi

if [[ "$installed" != true ]]; then
  rm -rf "$tool_root"
  npm install \
    --prefix "$tool_root" \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    "$cli_package@$CLI_VERSION" \
    "$PROFILE_PACKAGE@$PROFILE_VERSION"
fi

test -x "$cli_bin"
echo "octo-card-bin=$cli_bin" >> "$GITHUB_OUTPUT"
