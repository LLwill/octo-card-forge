# Forge Web Design QA

## Evidence

- Source visual truth: `/Users/will/.codex/visualizations/2026/08/25/01a037b3-80bc-7a50-88a8-2af8d4a716fb/forge-7171ee-system/`
- Implementation captures: `/Users/will/.codex/visualizations/2026/08/25/01a037b3-80bc-7a50-88a8-2af8d4a716fb/forge-implementation-qa-final/`
- Card library capture after removing the overview: `/Users/will/.codex/visualizations/2026/08/25/01a037b3-80bc-7a50-88a8-2af8d4a716fb/forge-implementation-qa-final/card-library-no-home.png`
- Routes: component specification, card library, card detail, playground, and install. `/forge` redirects to `/forge/components`.
- State: Workspace mode with the repository's real `docs.access-request` Card Package and current install manifest
- Desktop viewport: `1440 x 810` CSS pixels, implementation capture `1440 x 810` pixels at 1x density
- Source images: `2048 x 1152` pixels, normalized to `1440 x 810` before comparison
- Mobile viewport: `390 x 844` CSS pixels at 1x density

## Findings

- No actionable P0, P1, or P2 findings remain.
- Typography: the implementation preserves the mock's editorial hierarchy, strong Chinese display headings, restrained UI text, monospace identifiers, and zero negative letter spacing. The shipped Geist/system fallback differs slightly from the generated mock but retains its intended weight and rhythm.
- Spacing and layout: all five product routes use the same top navigation, content alignment, open white surfaces, thin structural dividers, and unframed sections. Desktop and mobile captures have no horizontal overflow.
- Colors and tokens: the exact `#7171EE` accent is limited to active navigation, links, focus, selected controls, and primary actions. Neutral surfaces, dark text, and semantic status colors remain dominant; there are no gradients, glow, glass, or purple page washes.
- Image and asset fidelity: real Adaptive Card rendering is used instead of illustrative placeholders. The implementation intentionally reflects the repository's current Card data, so preview content differs from the generated mock while preserving the same scale and presentation role.
- Copy and content: navigation and page language are concise Chinese. Unsupported browser editing, AI generation, publish, and deploy claims are absent.
- Accessibility and interaction: landmark navigation, labeled search and selects, tab state, keyboard-native controls, and visible focus treatment are present. Card preview iframes report their rendered height to the host, use `scrolling="no"`, and hide internal overflow. Browser console errors: none.

## Full-View Comparison

The product no longer includes a standalone overview. The card library is the entry route and carries the product identity through real Card Package content. The remaining desktop routes preserve the selected Editorial Artifact Archive direction. The implementation uses one real Card Package because that is the only item exposed by the current Workspace data; the multi-item catalog in the mock remains a layout reference rather than invented product data.

## Focused Comparisons

- Card detail: `/Users/will/.codex/visualizations/2026/08/25/01a037b3-80bc-7a50-88a8-2af8d4a716fb/forge-design-comparisons-final/card-detail.png`
- Component specification: `/Users/will/.codex/visualizations/2026/08/25/01a037b3-80bc-7a50-88a8-2af8d4a716fb/forge-design-comparisons-final/components.png`
- Playground: `/Users/will/.codex/visualizations/2026/08/25/01a037b3-80bc-7a50-88a8-2af8d4a716fb/forge-design-comparisons-final/playground.png`

These regions were checked separately because their controls, JSON, rendered cards, and side navigation are too small to judge reliably in the full-page captures.

## Comparison History

1. P1: the component page still used the old multi-section catalog and did not match the selected documentation layout.
   Fix: rebuilt it as a sticky category/section directory with a single selected component detail, Preview/JSON modes, property tables, and guidance.
   Post-fix evidence: `forge-implementation-qa-final/components.png`.
2. P2: install method tabs changed visual selection but left CLI content on screen.
   Fix: added distinct CLI, Render Profile, and Portable Skill instructions with selected tab semantics and path-specific commands.
   Post-fix evidence: `forge-implementation-qa-final/install-portable.png`.
3. P2: the component page initially opened a foundation entry with no visual example, weakening the first-view product demonstration.
   Fix: defaulted the all-components view to the real `utility-badge` example while preserving category, search, and explicit selection behavior.
   Post-fix evidence: `forge-implementation-qa-final/components.png`.
4. Product simplification: the standalone overview was judged too promotional for a read-only engineering workbench.
   Fix: removed the overview route, component, and styles; `/forge` and the brand link now open the card library directly.
   Post-fix evidence: `forge-implementation-qa-final/card-library-no-home.png`.
5. P2: fixed-height preview iframes could expose nested scrollbars when the rendered Card exceeded the viewport.
   Fix: the preview document now reports its content height through `postMessage`; the host iframe resizes and disables internal scrolling.
   Post-fix evidence: card library iframe measured `356px` for `356px` of content with both document overflows hidden.
6. Information hierarchy: component specifications needed to be the primary entry, while the source catalog's technical group names and duplicated category filters added avoidable complexity.
   Fix: moved Component Specifications to the first navigation position and default route; replaced the filter hierarchy with four plain-language directory groups: Card Components, Extensions, Composition Examples, and Foundations.
   Post-fix evidence: `forge-implementation-qa-final/components-simplified.png` and `forge-implementation-qa-final/mobile-components-select.png`.
7. P2: non-renderable foundation entries displayed preview controls and an empty preview stage.
   Fix: preview width, Preview/JSON tabs, and the stage now render only when the selected item has Card JSON. Foundation entries go directly from the header to their property table.
   Post-fix evidence: `forge-implementation-qa-final/components-rule-no-preview.png`.
8. Information hierarchy: the playground mixed raw Card JSON rendering with template data, Card selection, View selection, sample selection, contract fields, and Server compilation.
   Fix: reduced the route to one purpose and renamed it Card Previewer. It now accepts only a complete Adaptive Card JSON document, with format, copy, render, and canvas-width controls. Template data and sample workflows remain on Card detail pages.
   Verification: default rendering, invalid JSON feedback, `390 x 844` responsive layout, and zero horizontal overflow.
9. Information hierarchy: CLI, Render Profile, and Portable Skill were presented as three equivalent installation choices even though they serve different layers and audiences.
   Fix: made CLI plus Render Profile the single standard project path. Render Profile-only and Agent Skill setup now appear as collapsed advanced integrations, and the summary lists only what standard installation includes.
   Verification: advanced sections expand independently, command copy controls stay aligned with wrapped labels, and the `390 x 844` layout has no horizontal overflow.

## Interactions Verified

- Global navigation and card detail navigation
- Card search and namespace filter presence
- Card Preview, Data Structure, and Validation tabs
- View, sample, and width controls
- Component category and item selection plus Preview/JSON switching
- Card Previewer JSON validation, width selection, format, copy, and render
- Standard installation steps, advanced integration expansion, and command copy
- Root-route redirect and scroll-free iframe resizing
- Component-first navigation, simplified directory groups, and non-preview foundation entries
- Desktop and mobile overflow checks

## Follow-up Polish

- P3: add more real Card Packages when repository data becomes available so the library index demonstrates comparison behavior without synthetic content.
- P3: the Vite production build still reports the existing JavaScript chunk-size warning; code splitting can be handled separately from this visual pass.

final result: passed
