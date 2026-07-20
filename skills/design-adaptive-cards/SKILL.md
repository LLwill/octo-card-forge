---
name: design-adaptive-cards
description: Design, modify, validate, and preview versioned Adaptive Card packages in Octo Card Forge. Use when creating a card, changing its standard Adaptive Cards layout or interactions, defining the backend-facing Card ViewModel JSON Schema, adding samples or views, updating an Octo Host Profile, or preparing a card change for backend consumption.
---

# Design Adaptive Cards

Work inside the Octo Card Forge repository and use its CLI as the source of truth. Keep templates host-neutral and composed only of standard Adaptive Cards elements and actions.

## Inspect before editing

1. Run `pnpm cli list` to discover packages.
2. Read the target `cards/<card-id>/manifest.json`.
3. Read its data schema, interaction contract, templates, and relevant samples.
4. Read the referenced `host-profiles/<id>/<version>/capabilities.json` before choosing elements or actions.
5. Run `pnpm cli check <card-id>` to establish a clean baseline.

Do not infer backend domain fields from visual labels. Treat `contract/data.schema.json` as the Card ViewModel boundary that the backend will map into manually.

## Modify a card package

For a new card, start with `pnpm cli init <card-id> --name "<name>"`. Use `--view` or `--host-profile` only when the defaults are unsuitable. Never copy an existing business card as scaffolding.

- Put backend-provided display data in the JSON Schema and document every field with `description` and useful examples.
- Put template expressions only in `templates/*.template.json`.
- Put realistic, non-sensitive preview data in `samples/*.json`.
- Put stable action IDs, input requirements, and local UI-state guarantees in `interactions.json`.
- Use a separate view when the card structure or available actions change materially. Reuse one view with conditional expressions for small state variations such as approved versus rejected.
- Keep action `data` small and stable. Include identifiers needed by the business backend; never embed authorization decisions in the card.
- Use HTTPS for images and `Action.OpenUrl` targets.
- Prefer semantic styles such as `good`, `warning`, and `attention`; let the Host Profile own product-wide visual tokens.

For required inputs hidden behind `Action.ToggleVisibility`, set unrelated submit actions to `associatedInputs: "none"`. Model mutually exclusive panels with explicit enter and cancel toggles that set both target visibilities.

## Modify a Host Profile

Change a Host Profile only for renderer-wide behavior shared by cards. Version `host-config.json`, `adaptive-card.css`, and `capabilities.json` together under a new immutable profile directory, then point card manifests at the new `<id>@<version>` reference.

Do not add card-specific frontend markers or runtime HostConfig mutation. Production Octo Web consumes an approved Host Profile through its normal source-control and release process.

## Validate and preview

Run all of the following after edits:

```bash
pnpm typecheck
pnpm test
pnpm cli check <card-id> --format json
pnpm cli render <card-id> --sample <sample-name>
```

For visual review, run `pnpm dev` and open `http://127.0.0.1:4318`. Check every sample at desktop and mobile widths, exercise local toggles, and inspect the final JSON.

Never accept a visual preview as proof of correctness when CLI validation fails.

## Version and hand off

- Patch: visual or template fix without changing required backend data or action semantics.
- Minor: backward-compatible fields, views, samples, or actions.
- Major: removed/renamed required fields or incompatible interaction changes.

Report the changed card version, contract version, Host Profile reference, required backend fields, action/input IDs, validation results, and preview command. Do not claim that production HostConfig is active until the corresponding Octo Web change is released.
