---
name: octo-design-cards
description: Create and prepare standard Adaptive Cards for Octo, including one-time Quick Cards and reusable Card Packages. Use when an Agent needs to design, modify, validate, preview, or hand off an Octo card. Render Profile and Forge platform changes require an explicitly authorized Forge workspace.
---

# Octo Design Cards

## Capability modes

Detect available commands and artifacts before choosing a workflow:

- **Skill-only**: create Quick Cards with standard Adaptive Cards Tier 0. Mark output
  `unverified`; do not claim machine validation.
- **Skill + CLI**: create or modify Card Packages and run available CLI checks. A resolved
  Render Profile is still required for Octo-specific capability validation.
- **Skill + CLI + resolved Profile**: use Profile components/utilities and run complete
  validation, verification, and preview.

The Skill is usable without Node, npm, or the CLI. If a reusable Card Package is requested but
the CLI is unavailable, ask for a runtime or deliver only a clearly labeled draft artifact.

## Route the task

Choose exactly one mode:

- **Quick Card**: one-time message, notification, summary, or status card. Return one standard
  Adaptive Card JSON payload. Do not create a manifest, contract, version directory, or handoff.
- **Card Package**: reusable or backend-integrated card. Create a contract, templates, samples,
  manifest, and optional handoff. Read [the package workflow](references/card-package-workflow.md).
- **Existing card maintenance**: inspect and preserve the existing package contract before editing.
- **Forge platform work**: change CLI, Skill, Render Profile, Web showcase, or repository fixtures;
  use the repository's `pnpm cli` workflow and explicit authorization.

Default to repo-free work. Do not clone or edit the Forge repository just to produce card JSON.

## Quick Card

1. Preserve the message meaning with a simple hierarchy: heading, supporting text, key facts,
   and only actions explicitly supported by the request.
2. Use standard Adaptive Cards elements and actions. Never invent business action IDs, submit
   payloads, private element types, renderer markers, or CSS.
3. Prefer read-only output when no real interaction contract is provided. Use HTTPS for images
   and URLs, standard fallback attributes, and a small readable payload.
4. If a CLI and resolved Profile are available, inspect them first:

   ```bash
   octo-card --help
   octo-card discover --format json
   ```

   Use the resolved Profile as the capability boundary. Without a Profile, use Tier 0 only;
   do not guess `octo-*` components, utilities, or limits.
5. Write `card.json`. With CLI and Profile, validate it:

   ```bash
   octo-card validate --input ./card.json --wire-profile octo/v1 --profile octo-chat@latest --format json
   ```

   Use `octo/v2` when inputs or `Action.Submit` are present. Use `--profile-dir` or
   `--profile-package` when the Profile is supplied explicitly.
6. Treat malformed JSON, unsupported elements/actions, invalid URLs, duplicate IDs, unresolved
   expressions, and failed available checks as blockers. Without CLI/Profile, perform standard
   schema reasoning only and state the missing checks.
7. Return the JSON, assumptions, and this status:

   ```text
   verification: verified | unverified
   cli: available | unavailable
   renderProfile: resolved | unavailable
   ```

Quick Cards do not need `manifest.json`, `contract/data.schema.json`, version folders, Samples,
or a handoff archive unless the user asks to promote them into a reusable package.

## Card Package

With a CLI and resolved Profile:

```bash
octo-card agent init --target generic
octo-card agent doctor --format json
octo-card presets --format json
octo-card init <card-id> --name "<display-name>" --out ./<card-id> [--preset <preset-id>]
octo-card verify --card ./<card-id> --emit-dir compiled --handoff handoff --format json
octo-card inspect --card ./<card-id> --format json
```

Use `bot-token` or `docs-forward` only when the preset semantics fit. Replace all scaffold
placeholders, design a display-ready ViewModel contract, add realistic non-sensitive samples,
and keep template expressions separate from sample data. Interactive cards use `octo/v2`;
display-only cards use `octo/v1`.

For screenshots, treat visible layout as evidence rather than a backend contract. Ask only about
missing decisions that affect data, actions, permissions, security, or acceptance criteria. Record
non-blocking assumptions. Read the full workflow before creating or changing a package:

[`references/card-package-workflow.md`](references/card-package-workflow.md)

## Profile components and utilities

Platform primitives are standard Adaptive Card elements with semantic IDs enhanced by Profile CSS;
they are not private Adaptive Card types.

- Tier 0: standard Adaptive Cards + HostConfig.
- Tier 1: only Profile-declared `octo-*` components and `octo--...--uid-*` utilities.
- Tier 2: one-off standard composition; do not invent a new shared component family.
- Forbidden: card-private renderer markers, business CSS selectors, or editing a shared Profile for
  one card.

Before using Tier 1, read the resolved Profile capabilities and
[`references/component-system.md`](references/component-system.md). Use only declared families,
variants, tokens, fallbacks, appliesTo rules, and group limits. Without a resolved Profile, use
Tier 0 only.

## Validate and hand off

For a Card Package, run `verify` before delivery. For Quick Card, run `validate` when the runtime
is available; otherwise mark it `unverified`. Never treat a visual preview as proof of validation.

Report the final artifact, assumptions, verification status, Profile reference, Wire Profile,
contract and action changes, commands run, and remaining risks. Read
[`references/card-package-workflow.md`](references/card-package-workflow.md) for versioning,
Render Profile changes, maintenance, and handoff requirements.

Do not commit, push, publish, or open a pull request unless the task authorizes it.

## Optional Agent runtime setup

For a newly installed CLI, initialize a consumer workspace:

```bash
octo-card agent init --target generic
octo-card agent doctor --format json
octo-card agent upgrade --check --format json
```

`upgrade --check` only compares the workspace with the locally installed bundle's recommended
versions. It does not discover remote releases or modify dependencies, lockfiles, or Profile pins.
