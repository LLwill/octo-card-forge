# Card Package Workflow

Use this reference for reusable or backend-integrated cards. The active Render Profile artifact
and CLI output remain the source of truth for exact capabilities and validation.

## Create

1. Derive a lowercase namespaced card ID, display name, initial view, Wire Profile, and Profile
   reference. Ask before creating files if contract, interaction, security, or acceptance criteria
   are blocked.
2. Run:

   ```bash
   octo-card presets --format json
   octo-card init <card-id> --name "<display-name>" --out ./<card-id> [--preset <preset-id>]
   ```

   In the Forge repository, use `pnpm cli init` only for an intentional repository fixture.
3. Replace every scaffold placeholder. Do not copy a business card as scaffolding.
4. Design `contract/data.schema.json` first. It must describe a display-ready Card ViewModel,
   use `additionalProperties: false`, explicit required fields, descriptions, examples, and
   conditional requirements for state-specific data. Exclude secrets, authorization decisions,
   and fields unused by the template or actions.
5. Add realistic non-sensitive samples for every view and meaningful state. Each sample must
   satisfy the contract.
6. Keep expressions in templates and data in samples. Use only elements/actions allowed by the
   referenced Profile capabilities.
7. Confirm every manifest view points to its template and samples.

## Interactions

- Preserve stable action and input IDs unless a breaking change is explicitly approved.
- Keep submit payloads small and include an action discriminator plus required business IDs.
- Use `associatedInputs: "none"` for unrelated submit actions when hidden panels contain required
  inputs.
- Implement mutually exclusive panels with explicit enter and cancel toggles that set both target
  visibilities.
- Do not create `interactions.json`; use `octo-card inspect` for the derived report.
- Ask when backend field semantics or action behavior cannot be determined. Never invent business
  behavior to complete a visually plausible card.

## Maintain

Before editing an existing package, read its manifest, contract, templates, samples, inspect
output, and Profile capabilities. Run:

```bash
octo-card check --card ./<card-dir> --format json
```

Update contract, samples, templates, and manifest together when a change crosses those boundaries.
Use a separate view when structure or available actions change materially; use conditional
expressions when only status text, semantic color, icon, or optional content changes.

## Version

After publication, update `manifest.json` deliberately:

- Card patch: presentation, template, or sample correction with compatible contract/interactions.
- Card minor: backward-compatible optional data, view, or interaction addition.
- Card major: removed/renamed behavior or incompatible action semantics.
- Contract patch: descriptions/examples only.
- Contract minor: backward-compatible optional fields or values.
- Contract major: required fields, removals, renames, type changes, stricter validation, or changed
  field meaning.

Changing a pinned Profile or switching between a pin and `@latest` also increments the card version.

## Render Profiles

Change a Render Profile only for renderer-wide behavior shared by multiple cards. Repo-free card
authoring must not modify one. If a capability is missing, finish with Tier 0/Tier 2 and report a
candidate for a future Profile release.

`render-profiles/<id>/` is current source, not a version store. Do not create historical version
directories. Update the current manifest and `CURRENT_RENDER_PROFILE`, then generate an immutable
bundle/package. Historical versions belong in the artifact registry.

Use `octo-chat@latest` for drafts or a concrete `octo-chat@x.y.z` pin for freeze/historical work.
Profile changes reach production Octo Web through its normal release process. Keep card-specific
CSS and frontend markers out of Profiles.

## Handoff

Run:

```bash
octo-card verify --card ./<card-id> --emit-dir compiled --handoff handoff --format json
octo-card inspect --card ./<card-id> --format json
octo-card emit --card ./<card-id> --sample <sample-name>
octo-card dev --card ./<card-id>
```

Report:

- Card ID/version, contract version, Profile reference, and each View's Wire Profile.
- Views/samples changed, backend fields, state-specific requirements, and action/input payloads.
- Components/utilities used and Tier 2 candidate patterns.
- Whether unpublished Profile capabilities are required.
- Commands/results, preview command, prototype assets, unresolved choices, and remaining Web work.
