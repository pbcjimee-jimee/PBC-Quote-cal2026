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

## Mobile interaction rules

- Current mobile redesign specification: [2026-09-24 analysis and scope](superpowers/specs/2026-09-24-mobile-ux-redesign.md). Implementation, follow-up corrections and measured limits are recorded in [verification](superpowers/reviews/2026-09-24-mobile-ux-verification.md).
- At `max-width: 720px`, New/Edit Quote uses three sticky category buttons: Details, Work & materials, and Public quote. New starts in Details and Edit in Work. Buttons expose at least a 44px target and fit at 360px without document overflow. Review is not a selectable category; it remains last below the active input section. Review jumps and errors preserve the selected input category. The same input tree is used above this breakpoint; desktop shows all sections.
- Mobile material/public rows show summaries with an explicit Edit action. Only the selected row's editor is visible. Option expansion and row/scope selection are presentation state, never persisted quote data or dirty changes.
- The mobile quote workspace stretches the selected input section and Review to its full available width. Its column flex layout must override the desktop grid's `align-items: start` with `align-items: stretch`; zero horizontal overflow alone does not verify correct card width.
- Review leads with Main Final subtotal (Ex GST), GST 10%, Inc GST, then separate Options Ex GST. Labour/material/area breakdown, formula descriptions, internal memos and sync detail are disclosures. Low/High selection remains manual, with both labels when the same formula is selected twice.
- The mobile quote bar contains Review totals, local Save, and a direct Save & Sync action beside Save. It has no More menu. Validation reveals the relevant workspace, option, scope and row before moving focus; Review-level errors focus the always-visible Review without clearing the selected input category. Failed saves retain input and draft.
- Use `--secondary-text`/`--muted-2` (`#5f6f84`), Low/success (`#087653`), High (`#5b3cc4`), warning (`#8a5a14`) and danger (`#b42318`) for readable semantic text. Pair status colors with words. Both Low and High selected is a neutral state, not a warning.
- Shared mobile interaction values come from `app/styles/tokens.css`: 44px minimum target, 16px input text, 14px interactive text, and 16px narrow insets/gaps.
- At `max-width: 1023.98px`, default buttons, tabs, toggles, actionable dropdown rows, check rows, stock controls, back links, and disclosure summaries must expose at least a 44px target.
- Page topbars are non-sticky on the mobile shell and their action groups wrap. The app header and the quote category bar are the sticky top navigation surfaces; the quote bar sits below the app header, and focused-field scroll margins account for both sticky top surfaces and the quote action bar.
- Dense Settings/Users/expense tables may scroll inside `.pbc-tablewrap`, but the document must never scroll horizontally.
- At `max-width: 720px`, Inventory uses disclosure cards. Collapsed cards show Name, Category, Size / Serial, and Colour; missing Colour displays `-`, and long values wrap without document overflow. Desktop retains the twelve-column table.
- Inventory search and filters precede admin tools. At `max-width: 720px`, Add Item is initially collapsed; CSV actions sit in `CSV tools`. Simple close/reopen retains values, Cancel and successful save reset and close, failure preserves retry values, and pending locks the trigger/actions. Desktop keeps Add visible; supervisors receive neither its trigger nor form.
- Settings uses five directly visible section buttons with `aria-pressed` and a labelled content region. At `max-width: 720px`, they form two rows (three then two buttons), with wrapping labels, a 48px minimum height and a blue selected state. There is no section dropdown. A single table/editor tree is styled as summary cards. Material, Product / Service, Template and Area Add forms start collapsed. Areas have independent list scope/search filters. Existing lazy loading, retry, editing and pagination remain in their original controllers. The page header contains Users and Back to quote; Inventory stays in global navigation.
- Overview puts search/month filters before two-column mobile metrics. Metrics describe loaded quotes (up to 100, current filters) and Inc GST; quote rows show Ex GST. Quote Detail leads with Main money and keeps long collections and breakdowns expandable.
- Jobs uses a date/count grid and a selected-date agenda at `max-width: 720px`; above that it keeps the desktop calendar. Both share Sydney visit-date conversion, inclusive ranges and same-job/day deduplication. Date cells have at least 24px width/44px height; agenda detail links have 44px targets. Estimated/Actual cost labels are explicit.
- The application switches between its desktop shell/sidebar and mobile header/total bar at the Tailwind `lg` boundary. CSS max-width queries for that transition must use `1023.98px`; component-specific layout breakpoints may remain independent.
- At `max-width: 1023.98px`, form inputs, textareas, table inputs, search inputs, status controls, pricing inputs, and month selects must use a minimum `16px` font size to prevent iOS focus zoom. Preserve compact desktop type above this boundary.
- Standalone-safe surfaces must add `env(safe-area-inset-*)` to their existing padding. This applies to the mobile sticky header top, mobile total bar bottom, and the auth layout left, right, and bottom edges.
- Mobile `pbc-iconbtn`, `pbc-iconbtn--compact`, and `pbc-btn--sm` controls must provide at least a `44px` by `44px` hit target. Dense tables may retain internal horizontal scrolling rather than shrinking these targets.
- The mobile header preserves all role-allowed destinations: five for admin and two for supervisor, with visible active state and 12px minimum menu labels. It must remain usable without document horizontal scrolling.
- Standalone startup loading must use a safe-area-aware `100dvh` surface, show branded progress without user-specific data, and respect `prefers-reduced-motion`.
- Data-route loading placeholders preserve the final mobile layout shape. Jobs uses a seven-column date grid plus agenda placeholders at `max-width: 720px`.

## Current cleanup outcome

As of 2026-05-30:

- Login uses shared auth, form, input, and button classes.
- New/Edit quote calculation, alerts, draft dialog, and materials mini-stats use shared classes.
- Settings labour sections and material/product tables use shared form/table classes.
- The previous handoff CSS is consolidated under `app/styles/`; no separate removable raw HTML design file exists in the repository.
