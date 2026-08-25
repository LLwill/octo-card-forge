# Forge Web visual audit

Date: 2026-08-25

## Scope

The audit covers the primary Forge Web surfaces at desktop width:

1. Published card detail and preview.
2. Workspace JSON playground.
3. Published install flow.
4. Workspace component catalog.

The intended user is a card author or integrator who needs to find an artifact,
inspect it, test JSON or template data, and install the matching toolchain.

## Evidence

- `01-card-detail.png`
- `02-playground.png`
- `03-install.png`
- `04-components.png`
- `05-playground-shadcn.png`
- `06-playground-shadcn-mobile.png`
- `07-install-shadcn.png`
- `08-install-shadcn-mobile.png`

The last two captures record the first implementation checkpoint using the
shadcn Nova preset, Base UI primitives, Tailwind CSS, and the existing Forge
green accent.

The final two captures show the second implementation checkpoint: the shared
lightweight tool rail and the redesigned Install workflow.

## Overall verdict

The information architecture is usable, but the visual system is too compressed
and too uniform. Most text sits at 10-12px, nearly every section is separated by
the same one-pixel gray border, and primary actions do not consistently dominate
secondary metadata. The result feels like a styled internal debug surface rather
than a mature authoring workbench.

This is primarily a design-system and component-quality problem. Replacing CSS
syntax alone will not fix it.

## Findings

### 1. Card detail

Health: structurally sound, visually dense.

- The card preview is the strongest part of the product and has a clear focal point.
- Global navigation, catalog navigation, detail tabs, preview controls, and facts
  all compete at similar visual weight.
- Metadata uses very small type and weak contrast, making the right rail harder to
  scan than it needs to be.
- The three-column composition works for a single card, but it leaves little room
  for more complex inspection or comparison tools.

### 2. Playground

Health: functional, but reads as a raw developer panel.

- The editor and preview split correctly expresses the main task.
- The header, mode switch, editor toolbar, success strip, and preview toolbar each
  introduce another horizontal band. This fragments the workflow.
- The preview surface has too much passive empty area and too little guidance about
  the active width, profile, and render state.
- The native textarea lacks the navigation and editing affordances expected from a
  serious JSON workbench.

### 3. Install

Health: understandable, but low-emphasis and visually flat.

- The recommended path is present, but it does not visually lead the page.
- Commands, supporting copy, compatibility data, and secondary downloads are all
  rendered with similar density and contrast.
- Long commands are fragile at narrower widths and the copy action is visually
  detached from the command it affects.

### 4. Components catalog

Health: useful reference material, difficult to browse at scale.

- Search, category filters, width controls, and specimens are the right primitives.
- Long category labels crowd the segmented control and will degrade as the catalog
  grows.
- Repeated horizontal rules make the page feel like a document table rather than an
  interactive component browser.
- Section identity and preview affordances need stronger grouping and more obvious
  scan anchors.

## Accessibility risks

- Frequent 10-11px interface text is likely too small for sustained use.
- Several interactive controls have compact heights around 30-34px, below a
  comfortable pointer target for many users.
- Icon-only controls depend on hover titles; persistent accessible names and visible
  tooltips should be standardized.
- Keyboard focus styling exists, which is a good foundation, but focus order,
  screen-reader announcements, contrast ratios, and zoom reflow still require
  interactive testing.

## Technology decision

Adopt Tailwind CSS for tokens, spacing, responsive layout, states, and consistent
component variants. Use Base UI selectively for behavior-heavy primitives such as
Select, Tabs, Tooltip, Dialog, Popover, and Toggle Group.

Do not replace simple layout and display components with Base UI. Keep the existing
React routes and data contracts, keep Lucide icons, and preserve the Adaptive Card
preview boundary.

Recommended structure:

- Tailwind CSS for the visual system and page composition.
- CSS custom properties for semantic color tokens shared with embedded previews.
- Base UI for accessible interaction behavior where native controls are insufficient.
- Small project-owned components for Button, Badge, Field, Toolbar, Empty State,
  Section Header, and Data Row.

## Proposed redesign order

1. Establish type, color, spacing, focus, radius, and elevation tokens.
2. Rebuild the app shell and navigation while preserving routes.
3. Rework Cards around preview-first inspection and quieter metadata.
4. Rework Playground into a coherent editor/preview workbench.
5. Rework Components into a searchable reference browser.
6. Rework Install into one clear recommended path with progressive detail.
7. Verify desktop, tablet, mobile, keyboard, and high-zoom behavior.

## Evidence limits

This audit is based on rendered desktop screenshots and source inspection. It does
not claim full accessibility compliance or cover every loading, error, empty, and
mobile state.
