# Octo Card Profile Components

This reference is part of the distributed Skill package. The active Render
Profile artifact remains the source of truth for the exact component variants,
utility tokens, fallback values, and limits.

## Expression tiers

1. **Tier 0**: standard Adaptive Cards elements/actions plus HostConfig. Prefer
   this when the requirement can be met without Profile-specific styling.
2. **Tier 1**: published `octo-*` component IDs and
   `octo--...--uid-*` utility IDs declared by the active Profile.
3. **Tier 2**: one-off composition made from standard Adaptive Cards inside the
   card. Do not create a new `octo-*` family for a single card.
4. **Forbidden**: private Adaptive Card types, card-private renderer markers,
   business CSS selectors, and editing a shared Render Profile to finish one
   card.

## Component contract

Octo components are standard Adaptive Card elements with semantic IDs enhanced
by Profile CSS. They are not new Adaptive Card `type` values.

Use the component families and variants declared in
`capabilities.components`. Do not rely on a hard-coded list in this reference.
The ID shape is:

```text
octo-<family>-<variant>-<unique-suffix>
```

Rules:

- The family and variant must be declared by the active Profile.
- The component must apply to the element type declared by the Profile.
- The unique suffix only makes the ID unique inside the card; it is never a CSS
  selector or business state name.
- Business states choose an existing tone variant; they do not become new
  component families or variants.
- Copy every required fallback attribute from the Profile declaration onto the
  standard element, so the card remains readable without Profile CSS.
- Unknown `octo-*` IDs are invalid even if a local preview looks acceptable.

## Utility contract

Before using a utility, run:

```bash
octo-card discover [query] --format json
octo-card explain utility <token> --format json
```

Use only tokens declared in `capabilities.utilities`. Observe each token's
`appliesTo`, fallback, deprecation, and group rules. Do not combine two tokens
from the same group and stay within `utilityRules.maxTokensPerElement`.

The utility ID shape is:

```text
octo--<utility-token>--<utility-token>--uid-<unique-name>
```

The `uid-*` segment is only a stable unique ID; it is not a style name.

## Profile changes

Do not edit a Render Profile for one card. If the desired shared capability is
missing, finish with Tier 0 or Tier 2 and report the missing capability as a
candidate for a future Profile release. Promote a repeated Tier 2 pattern only
when it is shared by multiple cards and can be published with a fallback.
