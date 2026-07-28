---
name: octo-design-cards
description: Create, modify, validate, preview, and prepare versioned standard Adaptive Card packages in Octo Card Forge. Use when an Agent needs to build a new Octo card from requirements or a design, change card layout or standard interactions, define the backend-facing Card ViewModel JSON Schema, add views or samples, update an Octo Render Profile, or hand a card contract to a business backend.
---

# Octo Design Cards

Work from the Octo Card Forge repository root. Use its CLI for deterministic creation, compilation, and validation. Use only standard Adaptive Cards elements and actions; never introduce card-specific renderer markers.

Keep machine-checkable rules in `pnpm cli check`. Use this Skill for workflow, version judgment, component-tier choices, and when to stop and ask. Do not invent business behavior, private Adaptive Cards types, or shared profile CSS for a single card.

## Start safely

1. Inspect `git status` and preserve unrelated work.
2. Use the task's worktree or branch. When implementing directly from `main`, create `feat/card-<card-id>` first.
3. Run `pnpm install --frozen-lockfile` only when dependencies are missing.
4. Run `pnpm cli --help` and `pnpm cli list` instead of guessing commands or package IDs.

Do not commit, push, publish, or open a pull request unless the task authorizes it.

## Create a card

1. Derive a lowercase namespaced ID, display name, initial view, Wire Profile, and existing Render Profile from the requirement.
2. Run:

   ```bash
   pnpm cli init <card-id> --name "<display-name>"
   ```

   Use `--view`, `--wire-profile`, or `--render-profile` only when the defaults are unsuitable. Interactive views require `octo/v2`; display-only views should use `octo/v1`.
3. Immediately replace the generated `title` and `message` placeholders. A card is not implemented while scaffold fields or sample text remain.
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
2. Run `pnpm cli check <card-id>` before editing to establish a clean baseline.
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
2. **Tier 1**: published `octo-*` components from the pinned profile capabilities.
3. **Tier 2**: one-off standard Adaptive Cards composition inside the card.
   Do not invent a new `octo-*` family for a single card.
4. **Forbidden**: edit `render-profiles/` to finish one card, invent business CSS
   selectors, or introduce card-private renderer markers.

### ID grammar

Use only:

```text
octo-<family>-<variant>-<free-suffix>
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

Prefer values declared in `capabilities.components` over this prose list when the
pinned Render Profile changes.

When Tier 2 is used, or the same visual pattern appears repeatedly, record a
candidate component pattern in the handoff report instead of patching the shared
profile.

## Handle Render Profiles


Change a Render Profile only for renderer-wide behavior shared by multiple cards.
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

Run:

```bash
pnpm typecheck
pnpm test
pnpm cli check <card-id> --format json
pnpm cli inspect <card-id> --format json
pnpm cli handoff <card-id> --output dist --format json
pnpm cli render <card-id> --sample <sample-name>
```

Render every sample, not only the happy path. Then run `pnpm dev`, open `http://127.0.0.1:4318`, and inspect every sample at desktop and mobile widths. Exercise local toggles and inputs and inspect the final JSON.

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
