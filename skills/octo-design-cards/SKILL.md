---
name: octo-design-cards
description: Create, modify, validate, preview, and prepare versioned standard Adaptive Card packages for Octo. Use when an Agent needs to build a new Octo card from requirements or a design, change card layout or standard interactions, define the backend-facing Card ViewModel JSON Schema, add views or samples, use Octo Render Profile utilities, update an Octo Render Profile, or hand a card contract to a business backend.
---

# Octo Design Cards

Default to repo-free card authoring. A normal card-generating Agent should work in its own task directory with the installed `octo-card` CLI and the target Render Profile package; it should not clone or edit the Octo Card Forge repository just to produce Adaptive Card JSON.

Use CLI output for deterministic creation, compilation, and validation. Use only standard Adaptive Cards elements and actions; never introduce card-specific renderer markers. Keep machine-checkable rules in `octo-card check` / `octo-card lint`. Use this Skill for workflow, version judgment, component-tier choices, and when to stop and ask. Do not invent business behavior, private Adaptive Cards types, or shared profile CSS for a single card.

## Start safely

First classify the task:

- **Repo-free card authoring**: create a new card package, generate card JSON, preview, lint, or hand off a card contract. This is the default.
- **Forge platform work**: change the CLI, Skill, Render Profile, shared web showcase, package publishing, or existing repository fixtures.
- **Existing Forge card maintenance**: edit a card package that already lives under the Forge repository.

For repo-free authoring:

1. Work in the task directory or a small card workspace selected by the user.
2. Ensure `octo-card` is available through `pnpm exec octo-card`, `npx octo-card`, or the local environment.
3. Ensure the target Render Profile package is installed, usually `@mlt-org/octo-card-profile-octo-chat`.
4. Run `octo-card --help` and `octo-card discover --format json` instead of guessing commands or package IDs.

For Forge platform work or existing Forge card maintenance:

1. Inspect `git status` and preserve unrelated work.
2. Use the task's worktree or branch. When implementing directly from `main`, create `feat/card-<card-id>` first.
3. Run `pnpm install --frozen-lockfile` only when dependencies are missing.
4. Use `pnpm cli` as the repository-local equivalent of `octo-card`.

Do not commit, push, publish, or open a pull request unless the task authorizes it.

## Read screenshots and fuzzy requests

Treat a screenshot and natural-language request as evidence, not as a complete
backend contract.

- Extract visible facts from the screenshot: hierarchy, content density, states,
  controls, and obvious interaction affordances.
- Ask only about missing decisions that change the data contract, action behavior,
  permissions/security, or acceptance criteria. Ask a small grouped set of
  questions, then wait for the answer.
- Do not ask for exact spacing, colors, or element choices when the screenshot and
  the active Render Profile provide a reasonable default.
- If a missing detail is non-blocking, choose the closest standard/preset behavior
  and record the assumption in the handoff report.
- If the request and screenshot conflict, ask which source has priority.

## Create a card

1. Derive a lowercase namespaced ID, display name, initial view, Wire Profile, and existing Render Profile from the requirement.
2. If the contract, interaction, security, or acceptance target is still blocked by missing information, ask before creating files. Otherwise run:

   ```bash
   octo-card presets --format json
   octo-card init <card-id> --name "<display-name>" --out ./<card-id> [--preset <preset-id>]
   ```

   In the Forge repository, use `pnpm cli init <card-id> --name "<display-name>"` only when the card should intentionally become a repository fixture.

   Use a matching preset such as `bot-token` or `docs-forward` as an editable starting point when it fits the task. Do not force a preset when the scenario semantics differ.
   Use `--view`, `--wire-profile`, or `--render-profile` only when the defaults are unsuitable. Interactive views require `octo/v2`; display-only views should use `octo/v1`.
3. Immediately replace scaffold placeholders or preset demo values that do not match the requirement. A card is not implemented while generic sample text remains.
4. Design `contract/data.schema.json` first:
   - Define a display-ready Card ViewModel, not the backend's domain model.
   - Let the business backend decide where each value comes from and map it manually.
   - Use `additionalProperties: false`, explicit required fields, descriptions, and examples.
   - Use conditional requirements for state-specific data instead of making every field globally required.
   - Do not put authorization decisions, secrets, or fields unused by a template/action into the contract.
5. Add realistic, non-sensitive samples for every view and meaningful state. Each sample must satisfy the contract.
6. Implement templates using only elements/actions allowed by the referenced `capabilities.json`. Keep expressions in templates and data in samples.
7. Define stable action IDs, input guarantees, and local visibility state only in the standard Adaptive Card template:
   - Keep submit payloads small and include an action discriminator plus required business identifiers.
   - Make unrelated submit actions use `associatedInputs: "none"` when a hidden panel contains required inputs.
   - Implement mutually exclusive panels with explicit enter and cancel toggles that set both target visibilities.
   - Never create `interactions.json`; use `pnpm cli inspect` to view the derived interaction report.
8. Confirm every manifest view points to its template and samples.

Never copy an existing business card as scaffolding. Reuse patterns only after checking that their data and interaction semantics apply.

## Modify an existing card

1. Read its manifest, contract, relevant templates, samples, derived `inspect` output, and Render Profile capabilities.
2. Run `octo-card check --card <card-dir>` before editing to establish a clean baseline. In Forge card maintenance, run `pnpm cli check <card-id>`.
3. Preserve action/input IDs and ViewModel fields unless the requirement explicitly allows a breaking contract change.
4. Update the contract, samples, templates, and manifest together when the change crosses those boundaries.

Use a separate view when structure or available actions change materially. Use conditional template expressions when only status text, semantic color, icon, or optional content changes.

## Platform components

Platform visual primitives are not private Adaptive Cards types. They are semantic
element IDs enhanced by the pinned Render Profile CSS.

Canonical design:
[`docs/cli-skill-and-component-system.md`](../../docs/cli-skill-and-component-system.md).

### Expression tiers

1. **Tier 0**: standard Adaptive Cards + HostConfig only.
2. **Tier 1**: published `octo-*` components and `octo--...--uid-*` utilities from the pinned profile capabilities.
3. **Tier 2**: one-off standard Adaptive Cards composition inside the card.
   Do not invent a new `octo-*` family for a single card.
4. **Forbidden**: edit `render-profiles/` to finish one card, invent business CSS
   selectors, or introduce card-private renderer markers.

### ID grammar

Use only one of these public Profile ID forms:

```text
octo-<family>-<variant>-<free-suffix>
octo--<utility-token>--<utility-token>--uid-<unique-name>
```

Current validated families:

- `octo-badge-<neutral|accent|good|warning|attention>-...` on `TextBlock`
- `octo-surface-<accent|header-accent|footer-default>-...` on `Container` / `Column`

Rules:

- `variant` is from the published closed set and must not be prefix-compatible
  with another variant in the same family.
- Free suffixes make IDs unique inside the card; they never become CSS selectors.
- Business states choose a tone variant; they do not become family or variant names.
- Every `octo-*` element must still read correctly without Profile CSS. Keep the
  standard Adaptive Cards fallback attributes (`size`, `weight`, `color`,
  `isSubtle`, container structure) on the element itself.
- Unknown `octo-*` prefixes are invalid even if the preview looks acceptable.

Utility rules:

- Before using utilities, run `pnpm cli discover [query] --format json`.
- For repo-free authoring, use `octo-card discover [query] --format json`.
- For a chosen token, run `octo-card explain utility <token> --format json`.
- In Forge platform mode, `pnpm cli discover` and `pnpm cli explain utility` are equivalent.
- Use only tokens declared in `capabilities.utilities`; never invent token names.
- Keep fallback Adaptive Card fields required by the token on the element itself
  (for example `style`, `size`, `weight`, or `color`).
- Do not use two utilities from the same `group` on one element.
- Keep within `utilityRules.maxTokensPerElement`.
- The `uid-*` suffix is only a unique stable id segment. It is not a style name.

Prefer values declared in `capabilities.components` and `capabilities.utilities`
over this prose list when the pinned Render Profile changes.

When Tier 2 is used, or the same visual pattern appears repeatedly, record a
candidate component pattern in the handoff report instead of patching the shared
profile.

## Handle Render Profiles


Change a Render Profile only for renderer-wide behavior shared by multiple cards.
Repo-free card authoring must not modify a Render Profile. If the desired visual result requires a missing shared capability, finish the card with Tier 0/Tier 2 standard Adaptive Cards composition and report the missing capability as a candidate.

`render-profiles/<id>/` is the current source directory, not a version store.
Do not create `render-profiles/<id>/<version>/` directories for new releases.
When the current source becomes a new baseline, update its manifest version and
`CURRENT_RENDER_PROFILE`, then generate an immutable bundle/package. Released
versions live in the artifact registry. Do not add historical profile fixtures to
this repository; historical Card Packages are re-rendered from artifacts, not the
local Forge Catalog.

Card `renderProfile` references:
- `octo-chat@latest` (or omit): follow `CURRENT_RENDER_PROFILE` — preferred for draft cards.
- `octo-chat@x.y.z`: pin a concrete version for freeze / historical packages.

Updating the baseline does not require bulk-editing cards that already use `@latest`.

Keep card-specific CSS and frontend markers out of Render Profiles. Production Octo Web receives Render Profile changes through its normal source-control and release process. Prefer controlled HTTPS assets; flag third-party icon URLs as prototype dependencies.

## Version changes

Keep the scaffold's initial versions for a card's first release. After a version has been published, update `manifest.json` deliberately:

- Increment card `version` for every publishable package change.
  - Patch: presentation, template, or sample correction with unchanged compatible contract and interaction surface.
  - Minor: backward-compatible optional data, view, or interaction addition.
  - Major: removed/renamed behavior, incompatible action semantics, or other breaking package change.
- Change `contractVersion` only when the Card ViewModel contract changes.
  - Patch: descriptions/examples or corrections that do not change accepted data.
  - Minor: backward-compatible optional fields or accepted values.
  - Major: new required fields, removals, renames, type changes, stricter validation, or changed field meaning.
- Version Render Profiles independently; changing a card's pinned Render Profile (or switching between pin and `@latest`) still requires a card version increment.

## Validate and preview

For repo-free authoring, run:

```bash
octo-card verify --card ./<card-id> --emit-dir compiled --handoff handoff --format json
octo-card inspect --card ./<card-id> --format json
octo-card emit --card ./<card-id> --sample <sample-name>
octo-card dev --card ./<card-id>
```

For Forge platform work or repository fixture cards, run:

```bash
pnpm typecheck
pnpm test
pnpm cli check <card-id> --format json
pnpm cli lint <card-id> --format json
pnpm cli inspect <card-id> --format json
pnpm cli handoff <card-id> --output handoff --format json
pnpm cli render <card-id> --sample <sample-name>
```

`verify` checks every sample, compiles each one, and can write compiled JSON and
the handoff archive. Open the local preview URL printed by `octo-card dev --card`
or `pnpm dev`, and inspect every sample at desktop and mobile widths. Exercise
local toggles and inputs and inspect the final JSON.

Treat CLI errors, unresolved `${...}` expressions, unsupported host capabilities, contract failures, broken toggle targets, duplicate IDs, or insecure URLs as blockers. Never accept a visual preview as proof of correctness when validation fails.

## Hand off

Inspect the final diff and exclude unrelated files. Report:

- Card ID and version; contract version; Render Profile reference and each View's Wire Profile.
- Views and samples added or changed.
- Required/optional backend fields and state-specific requirements.
- Action IDs, input IDs, submit payload shape, and expected update-card behavior.
- Platform components used (`octo-badge-*`, `octo-surface-*`, etc.) and any Tier 2 candidate patterns.
- Whether the card depends on unpublished Render Profile capabilities.
- Commands run and their results; local preview command.
- Remaining prototype assets, unresolved product choices, or required Octo Web Render Profile work.

If backend field semantics or action behavior cannot be determined from the requirement, stop and list the contract questions. Do not invent business behavior to complete a visually plausible card.
