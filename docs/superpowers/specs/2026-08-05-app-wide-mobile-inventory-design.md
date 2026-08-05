# App-wide Mobile UX and Inventory Cards Design

**Date:** 2026-08-05

**Status:** User-approved design

**Model:** Codex 5.6-Sol high (large UI change, tests, regression fixes)

## Goal

Make every current application route comfortable and complete at iPhone-sized
viewports while preserving the dense desktop experience. Replace the Inventory
mobile table scroller with a compact card summary that shows only Name,
Category, and Size / Serial and expands into the role-appropriate editor when
tapped.

## Approved decisions

- The work covers the whole application, not Inventory alone.
- Inventory mobile rows use a collapsed summary card and expand on tap.
- The collapsed Inventory card shows only:
  - Name
  - Category
  - Size / Serial
- Desktop Inventory keeps the existing twelve-column table.
- Existing admin and supervisor permissions remain unchanged.
- Shared mobile sizing and layout rules live in the existing CSS system.
- No external dependency, database migration, API change, Jobber mutation, or
  Vercel environment change is required.

## Evidence and current problems

At a 390px browser viewport, the document content width is 375px and the
Inventory table wrapper is approximately 309px wide after page and card
padding. The first Inventory table is approximately 935px wide because it
continues to render twelve desktop columns. The wrapper contains the overflow,
but Size / Serial, Stock, and Actions appear missing until the user scrolls the
inner table.

The application already has a useful mobile foundation: shared inputs become
16px, compact controls become 44px, safe-area padding exists, and the Jobs
calendar has a dedicated seven-column mobile layout. The remaining issues are
specific and should not be addressed by globally transforming every table.

Verified remaining issues include:

- the sticky page topbar can sit beneath the sticky two-row mobile app header;
- Settings topbar actions can exceed the available mobile width;
- the route progress bar retains the desktop sidebar left offset on mobile;
- default buttons, tabs, toggles, dropdown options, check rows, back links, and
  disclosure controls can be shorter than 44px;
- Formula Low / High choices have a tap target of roughly 21px;
- the mobile header has no sign-out control;
- supervisor navigation uses a five-column grid even though it has two items;
- `/settings/users` does not keep Settings highlighted;
- Inventory has no mobile summary or expansion layout.

## Design approach

Use a hybrid responsive architecture:

1. Keep global mobile interaction, typography, spacing, overflow, and shell
   rules in the shared CSS system.
2. Add page-scoped responsive adapters only where the information architecture
   changes, beginning with Inventory cards.
3. Preserve dense administrative tables that genuinely need many editable
   columns inside an explicit internal horizontal scroller.
4. Preserve desktop layouts unless a shared selector needs a mobile-only
   override.

This avoids the two rejected approaches:

- A CSS-only conversion of every table would damage table semantics and complex
  Settings editors.
- Separate mobile implementations of every route would duplicate too much state
  and behavior.

## Responsive foundations

### Breakpoints

- `max-width: 1023.98px`: application mobile shell and interaction rules.
- `max-width: 720px`: narrow layout and Inventory card mode.
- Existing component-specific breakpoints remain when required, including the
  Jobs calendar at `640px`.

### CSS values

The CSS token source records the following shared mobile values:

- minimum interactive target: `44px`;
- input and select font size: `16px`;
- primary content text: `14px` to `16px`;
- secondary metadata: no smaller than `12px` unless a documented compact
  geometry requires it;
- narrow page and padded card inset: `16px`;
- standard narrow vertical gap: `16px`.

The seven-column Jobs weekday and compact job labels remain a documented
exception because increasing them would break the calendar geometry. They
remain readable through their existing short labels and 44px job-cell targets.

### Shared interaction rules

On the mobile shell breakpoint, the following interactive surfaces receive at
least a 44px height:

- `.pbc-btn`, including default and small variants;
- `.pbc-tab`;
- `.pbc-toggle button`;
- actionable `.pbc-dropdownitem`;
- `.pbc-checkfield` and `.pbc-stocktoggle`;
- back-navigation controls and detail disclosure summaries;
- inputs, status controls, and month selects where their existing height is
  smaller than 44px.

Interactive text uses at least 14px unless it is paired with an icon and an
accessible label. Inputs remain 16px to prevent iOS focus zoom.

## Application shell behavior

### Header and topbars

- The mobile app header remains sticky and safe-area aware.
- Page-level `.pbc-topbar` becomes non-sticky below `1023.98px`. This avoids an
  unreliable offset because the app header changes from one to two rows at
  narrow widths.
- `.pbc-topbar__right` wraps and can occupy the full available width.
- Long action labels wrap into additional rows without causing document-level
  horizontal overflow.
- The route progress bar starts at the viewport's left edge on mobile instead
  of using `--app-sidebar-width`.

### Navigation

- Mobile navigation uses equal auto-generated columns based on the number of
  rendered role items: five for admin and two for supervisor.
- A 44px sign-out button is added to the mobile brand row. It submits the same
  existing sign-out server action as the desktop sidebar.
- Settings remains active for `/settings` and all `/settings/*` descendants.
- The visible labels and active state remain; navigation labels are not hidden
  to make room.

## Inventory mobile design

### Rendering modes

- Above 720px: render the existing twelve-column table and inline table editor.
- At or below 720px: hide the desktop table and render a dedicated mobile list.
- Both modes are driven by the same InventoryManager state and action callbacks.
  There is one source of truth for items, the active row ID, pending state,
  validation, errors, and server results.

### Collapsed card

Each item is one full-width disclosure button with `aria-expanded` and
`aria-controls`.

Layout:

- first row: Name, bold, allowed to wrap;
- second row: Category at the start and Size / Serial at the end;
- a chevron indicates collapsed or expanded state;
- the whole card has a minimum 44px target;
- long values wrap without increasing document width;
- an Out item keeps the existing danger accent and struck-through text.

Only the approved three values appear in the collapsed card. Brand, colour,
quantity, dates, location, status, notes, and action labels are not displayed
until the item is expanded.

### Expanded editor

Only one item can be expanded at a time. Opening another item closes the current
one after discarding only unsaved local field changes for that previous row;
the server data remains unchanged.

Admin sees the existing complete edit set:

- Name
- Category
- Brand
- Model / Specification
- Colour
- Size / Serial
- Quantity
- Purchase Date
- Used Date
- Used Location
- Status
- Notes
- Save, Cancel, and Delete

Supervisor sees only the existing movement controls:

- Quantity
- Used Date
- Used Location
- Status
- Save and Cancel

All form controls use the shared 16px input rule and all actions use the 44px
target. Category search and custom-category creation remain available to admin.

Save success updates the item, clears the row form, and collapses the card.
Cancel discards local row changes and collapses it. A server error leaves the
card open, preserves the entered values, and shows the existing error message.
Admin delete continues to use the existing admin-only delete action and removes
the card only after server success. This work does not add a new confirmation
step or change the delete contract.

### Inventory controls around the list

- Search and both filters remain full-width at narrow sizes.
- Add Item remains a one-column mobile form and keeps admin-only visibility.
- Import, Export, and Template actions wrap and use 44px targets.
- Category headers keep their count badge but wrap safely when either string is
  long.

## Page-specific mobile changes

### Login

- Keep the existing safe-area-aware `100dvh` card layout.
- Make Sign In at least 44px high.

### Quotes list

- Preserve the current one-column stats and compact quote-card layout.
- Apply the shared 44px button rule and prevent long text from widening the
  page.

### Quote new and edit

- Keep the existing single-column workspace and mobile total bar.
- Mark the top local Save as mobile-redundant and hide it at narrow widths;
  the sticky bottom Save remains the local-save action.
- Keep Cancel and Save & Sync to Jobber available in the wrapping topbar.
- Give each Formula Low and High label a minimum 44px target without enlarging
  informational chips.
- Keep the existing material-row compact layout and 16px inputs.

### Quote detail

- Preserve existing stacked summary, line-item, material, and formula layouts.
- Expand Back and disclosure summary controls to 44px.
- Allow long amounts and descriptions to wrap without page overflow.

### Settings and Users

- Wrap the Settings topbar actions.
- Make tabs, primary buttons, toggles, dropdown items, and check rows 44px.
- Preserve dense Settings and Users tables as internal horizontal scrollers.
  These are the explicit exception to card conversion because their editable
  columns must remain associated.
- The table wrapper may scroll internally, but the document must not.

### Jobs list and detail

- Preserve the existing seven-column calendar and financial-row wrapping.
- Apply shared button sizing to Today, Previous, Next, Refresh, Back, and Open
  Jobber actions.
- Preserve the existing compact calendar text exception and 44px job cells.

## Accessibility

- Inventory disclosure controls use native buttons with `aria-expanded` and a
  stable `aria-controls` target.
- Hidden desktop or mobile modes use CSS `display: none`, preventing duplicate
  interactive controls from entering the accessibility tree.
- Visible controls retain accessible labels, keyboard activation, focus-visible
  rings, disabled states, and role-based action names.
- The mobile sign-out control has an explicit accessible name.
- No zoom-blocking viewport metadata is introduced.

## Data and security boundaries

- No inventory schema or server-action contract changes.
- No role or RLS changes.
- No quote, Jobber, pricing, or financial calculation changes.
- No user data deletion beyond the already-authorized Inventory admin delete
  action.
- No new cache behavior or service-worker data caching.
- No new external dependency.

## Testing strategy

### Automated tests

Use test-driven development and extend the existing suites:

- Inventory UI tests:
  - three-field collapsed summary contract;
  - disclosure semantics;
  - admin expanded control set;
  - supervisor movement-only control set;
  - Out styling;
  - save/cancel/delete handler preservation;
  - desktop table remains present.
- PWA/mobile CSS tests:
  - shared token values;
  - 44px selector coverage;
  - non-sticky mobile topbar and wrapping actions;
  - full-width mobile route progress;
  - Inventory desktop/mobile visibility contracts.
- Header tests:
  - mobile sign-out;
  - auto-sized role navigation;
  - Settings descendant active state.
- Quote tests:
  - mobile-redundant top Save class;
  - 44px Formula Low / High choice class;
  - detail disclosure target classes.

Run focused tests first, then TypeScript, ESLint, the full Vitest suite,
coverage, production build, dependency audit, and `git diff --check` through
the repository verification command.

### Browser verification

Verify at `375x812`, `390x844`, and desktop `1280x900`:

- Login;
- Quotes list, new, edit, and detail;
- Settings and Users;
- Jobs calendar and job detail;
- Inventory normal, Out, expanded admin editor, and filters.

Acceptance measurements:

- `document.documentElement.scrollWidth` equals the document client width on
  every route;
- only explicitly dense table wrappers may have internal horizontal overflow;
- Inventory mobile list itself has no horizontal overflow;
- every scoped primary interaction is at least 44px high;
- inputs compute to 16px;
- mobile topbars are not hidden by the app header;
- no new browser console errors or warnings;
- desktop Inventory still displays all twelve columns.

Supervisor-only Inventory rendering is verified in automated component tests
when an authenticated supervisor browser session is unavailable.

## Documentation updates

After implementation, update:

- `docs/UI-DESIGN-SYSTEM.md` with the binding shared mobile rules and the dense
  table exception;
- `docs/UI-PAGES.md` with Inventory mobile card behavior and app-wide mobile
  shell behavior;
- `docs/PWA-QA.md` with actual viewport results;
- `PROGRESS.md` with completed implementation and verification evidence.

## Out of scope

- Desktop visual redesign.
- Converting every dense administrative table into a card editor.
- Offline data support, data prefetch redesign, or loading-performance work.
- App Store or Play Store packaging.
- Production deployment, environment changes, or database migration.

## Acceptance criteria

- Inventory mobile cards show only Name, Category, and Size / Serial while
  collapsed.
- Tapping an Inventory card opens the correct admin or supervisor editor.
- Desktop Inventory behavior and all permissions remain unchanged.
- Shared mobile buttons and interactive controls meet the documented sizing
  standard.
- Every current application route has no page-level horizontal overflow at
  375px and 390px.
- Existing calculations, server actions, database behavior, and Jobber
  integration remain unchanged.
- Focused tests and the full repository verification command pass.
