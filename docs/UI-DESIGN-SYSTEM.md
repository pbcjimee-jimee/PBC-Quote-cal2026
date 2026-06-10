# UI-DESIGN-SYSTEM.md — PBC UI handoff analysis

This document is the current implementation guide for shared UI components.
Current UI source of truth: shared visual styling must come from this file,
`app/styles/tokens.css`, `app/styles/components.css`, and `components/ui/`.
When this file conflicts with older UI docs (`UI-DESIGN.md`, `UI-QUOTE-FORM.md`,
`UI-PAGES.md`, or historic implementation plans), follow this file for visual
styling, shared component classes, radius, shadow, spacing, and responsive
behavior.

## Source status

- The Anthropic design handoff URLs used during the redesign no longer return the original HTML in this workspace (`not found` on 2026-05-30).
- The usable source of truth is the already-imported handoff in `app/styles/tokens.css`, `app/styles/components.css`, and the React primitives in `components/ui/`.
- Old page-local Tailwind card/input/button styling should be treated as legacy unless it is only layout utility glue.

## Design direction

The app should feel like a dense internal operations tool: calm, scan-friendly, and consistent across Overview, New Quote, Edit Quote, Quote Detail, Settings, and Login.

Core visual traits:

- Light blue-grey app background with white surfaces.
- Compact typography with strong section labels and tabular money values.
- Cards share the same radius and shadow.
- Inputs share the same border, focus ring, and text color.
- Primary actions use the blue gradient button.
- Destructive actions use the shared danger button or icon button.
- Mobile stacks content vertically without horizontal overflow.

## Global tokens

Token source: `app/styles/tokens.css`.

Use these variables instead of hard-coded component colors:

- `--background`, `--bg-grad`
- `--surface`, `--surface-soft`
- `--foreground`, `--muted`, `--muted-2`
- `--border`, `--border-soft`
- `--primary`, `--primary-strong`, `--primary-soft`
- `--lo`, `--lo-soft`, `--hi`, `--hi-soft`
- `--warning`, `--warning-soft`, `--danger`, `--danger-soft`, `--success`, `--success-soft`
- `--r-lg`, `--r-md`, `--r-sm`
- `--shadow`, `--shadow-soft`, `--shadow-pop`
- `--font-body`, `--mono`

## Shared component classes

Primary shared classes live in `app/styles/components.css`.

Layout and shell:

- `pbc-side`, `pbc-brand`, `pbc-nav`, `pbc-usercard`, `pbc-signout`
- `pbc-topbar`, `pbc-crumb`, `pbc-page`, `pbc-pagehead`
- `pbc-grid`, `pbc-editgrid`, `pbc-workspace`, `pbc-calcstack`

Surfaces:

- `pbc-card`, `pbc-card--pad`
- `pbc-summary`, `pbc-summary__hero`, `pbc-summary__rows`, `pbc-summary__chips`
- `pbc-ministats`, `pbc-ministat`

Controls:

- `pbc-btn`, `pbc-btn--primary`, `pbc-btn--ghost`, `pbc-btn--danger`, `pbc-btn--sm`, `pbc-btn--full`
- `pbc-iconbtn`, `pbc-iconbtn--danger`
- `pbc-input`, `pbc-textarea`, `pbc-field`, `pbc-field__label`, `pbc-field__hint`
- `pbc-toggle`, `pbc-search`

Messaging and overlays:

- `pbc-alert`, `pbc-alert--danger`, `pbc-alert--warning`, `pbc-alert--success`
- `pbc-dialogbackdrop`, `pbc-dialog`, `pbc-dialog__actions`
- `pbc-empty`

Tables and settings:

- `pbc-formsection`, `pbc-formgroup`
- `pbc-tablewrap`, `pbc-table`, `pbc-tableinput`
- `pbc-tabs`, `pbc-tab`, `pbc-rate`, `pbc-rate__money`

## React primitives

Use `components/ui/card.tsx` when a component needs a reusable card or section header:

- `Card`
- `SectionLabel`

Prefer these primitives before recreating card/header markup in page components.

## Implementation rules

- New cards must use `pbc-card` and `pbc-card--pad`, or the `Card` primitive.
- New labels/section headers must use `SectionLabel`, `pbc-panelhead`, or `pbc-paneltitle`.
- Inputs must use `pbc-input`, `pbc-textarea`, or a specialized wrapper such as `pbc-rate__money`.
- Inline panels must use `pbc-softpanel`, `pbc-inlinepanel`, or a named component class built on those tokens.
- Dropdowns must use `pbc-dropdown` and `pbc-dropdownitem` instead of rebuilding border/radius/shadow recipes.
- Tables must use `pbc-tablewrap`, `pbc-table`, and `pbc-tableinput`.
- Notices must use `pbc-alert` variants.
- Dialogs must use `pbc-dialogbackdrop` and `pbc-dialog`.
- Tailwind utility classes are allowed for layout only: grid columns, flex, spacing, responsive visibility, and one-off alignment.
- Avoid raw visual Tailwind recipes such as `rounded-lg border border-slate-200 bg-white shadow-sm` in app components.
- Do not use inline `style` for standard component states such as soft buttons; add a shared `pbc-*` class instead.
- After visual changes, validate desktop and one mobile viewport for `/quotes/new`, `/quotes/[id]/edit`, `/quotes/[id]`, `/quotes`, or `/settings`, depending on the touched surface.

## Current cleanup outcome

As of 2026-05-30:

- Login uses shared auth, form, input, and button classes.
- New/Edit quote calculation, alerts, draft dialog, and materials mini-stats use shared classes.
- Settings labour sections and material/product tables use shared form/table classes.
- The previous handoff CSS is consolidated under `app/styles/`; no separate removable raw HTML design file exists in the repository.
