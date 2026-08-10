# Inventory Mobile Add Disclosure and Colour Summary Design

**Date:** 2026-08-10

**Status:** User-approved design

**Model:** Codex 5.6-Sol high (design documented after explicit user approval)

## Goal

Reduce the initial complexity of the mobile Inventory screen by hiding the
admin-only item creation form behind an `Add item` disclosure, while making the
stored paint colour visible in every collapsed mobile item card.

## User-approved decisions

- The new Add interaction applies only at the Inventory mobile breakpoint,
  `max-width: 720px`.
- Admin sees an inline `Add item` disclosure; the form does not open in a modal
  and does not navigate to a separate route.
- Desktop keeps the existing always-visible Add Item form.
- Supervisor never receives the Add trigger or creation form.
- A collapsed mobile item card shows Name, Category, Size / Serial, and Colour.
- A missing stored colour is displayed as `-`; this feature does not backfill or
  infer missing colour data.
- Existing inventory permissions, database schema, Server Actions, CSV
  behavior, and desktop table behavior remain unchanged.

## Current behavior and constraints

`InventoryManager` currently renders the complete admin Add Item form at all
viewport sizes. The form already owns all required creation state and submits
through `createInventoryItem`. On success, the saved item is inserted at the
start of the local list and the form is reset; on failure, the existing action
returns an error without replacing the local item list.

The `warehouse_inventory.colour` field already flows through the Supabase query,
`InventoryItemRecord`, create/update actions, search, CSV import/export, the
desktop Colour column, and the expanded admin editor. The mobile collapsed card
is the only saved-item renderer that intentionally omits it. Because `colour`
is nullable, the mobile summary must use the same `-` fallback as the desktop
table.

The previously approved mobile Inventory contract limited collapsed cards to
exactly Name, Category, and Size / Serial. This design supersedes only that
three-field summary contract. All other safeguards from the prior Inventory
mobile design remain binding, including one expanded saved-item editor at a
time, the stable hidden editor target, pending-save locking, role-specific
fields, and failure-state preservation.

## Mobile Add interaction

### Placement and initial state

At `max-width: 720px`, an admin-only primary `Add item` button appears directly
below the Warehouse Inventory heading and item count and before the search and
filter controls. The complete creation form is initially hidden, so the first
mobile screen emphasizes search, filters, and saved inventory instead of twelve
empty inputs.

The trigger is hidden above 720px. The existing creation section remains
visible above 720px without requiring a click, preserving the current desktop
workflow.

### Disclosure semantics

The trigger is a native button with:

- a minimum 44px touch target;
- `aria-expanded` reflecting the mobile form state;
- `aria-controls` pointing to a stable creation-section ID;
- a visible `Add item` label and the existing plus icon.

The creation section stays mounted so desktop rendering and form state use one
source of truth. Mobile CSS hides the section only when its mobile disclosure
state is closed. The implementation must not use viewport JavaScript or render
a second copy of the form, avoiding hydration differences and duplicated form
state.

### Open form

The open mobile form reuses the existing creation fields in one column:

- Name
- Category
- Brand
- Model / Specification
- Colour
- Size / Serial
- Quantity
- Status
- Purchase Date
- Used Date
- Used Location
- Notes

The form ends with the existing primary `Add Item` submit action and a new
`Cancel` action. Inputs retain the shared 16px mobile font rule, and both actions
retain the shared 44px minimum target.

### State transitions

- **Open:** pressing `Add item` opens the inline form without mutating server
  data or clearing an already-entered form state.
- **Cancel:** pressing `Cancel` resets the creation state to `EMPTY_FORM` and
  closes the mobile form without calling a Server Action.
- **Successful save:** the saved item is inserted into the local list, success
  feedback is displayed, the form resets, and the mobile form closes.
- **Failed save:** the form remains open, all entered values remain available,
  and the existing error alert is displayed for retry.
- **Pending save:** the disclosure trigger, submit, and Cancel actions are
  disabled until the request settles so the form cannot close or submit twice.

Opening or closing the creation form does not silently reset the separate saved
item editor. This feature does not change the existing rule that only one saved
item card editor can be open at a time.

## Mobile saved-item colour summary

Every collapsed mobile item card renders:

1. Name as the primary wrapping line.
2. Category and Size / Serial as the existing metadata pair.
3. Colour as a labeled full-width metadata row.

The Colour row displays the stored `item.colour` string exactly as normalized by
the existing inventory data layer. Empty or null values display `-`. Long colour
names wrap inside the card and must not truncate required information or widen
the document.

Colour is read-only summary information for both roles. Supervisor can see it
in the collapsed card but still cannot edit Colour; the supervisor expanded
editor remains limited to Quantity, Used Date, Used Location, and Status.

The desktop twelve-column table already displays Colour and remains unchanged.

## Component and CSS boundaries

The implementation should stay within the existing Inventory component and
shared responsive CSS system:

- `components/inventory/inventory-manager.tsx`
  - add the mobile disclosure state and state transitions;
  - render the mobile-only trigger and Cancel action;
  - add Colour to `InventoryMobileList` summaries;
  - continue reusing the existing form state and Server Action callbacks.
- `app/styles/components.css`
  - hide the mobile trigger above 720px;
  - hide only the closed creation section at or below 720px;
  - add safe wrapping for the full-width Colour metadata row;
  - preserve 44px targets, 16px mobile inputs, and zero document overflow.

No new component library, route, API, database migration, or external
dependency is required.

## Data, permissions, and security

- Creation continues through the existing admin-authorized
  `createInventoryItem` Server Action and validation contract.
- The UI does not add a client-supplied role or weaken the server and RLS role
  checks.
- No stored inventory row is modified merely by displaying Colour.
- Missing colour values are not guessed, backfilled, or joined to the quote
  paint product catalog.
- CSV import/export and Inventory search continue to use the existing Colour
  field without contract changes.
- Service-worker caching, Jobber integration, quotes, and pricing are outside
  this feature and remain unchanged.

## Error handling

- Client-side validity remains Name required and Quantity finite/nonnegative.
- A create failure uses the existing error alert and preserves the form values.
- A create success uses the existing success alert and adds exactly the action
  result returned by the server.
- Cancel never calls create, update, delete, movement, or import actions.
- A null Colour value is a supported display state, not an error.

## Testing strategy

Implement test-first and extend the existing suites.

### Component contract tests

`tests/inventory-ui.test.tsx` must verify:

- admin receives a mobile Add disclosure trigger and the stable form target;
- supervisor receives neither the trigger nor creation form controls;
- the mobile summary renders Name, Category, Size / Serial, and Colour;
- a null Colour renders `-`;
- Brand, Quantity, dates, location, status, notes, and action labels remain
  absent from the collapsed summary;
- supervisor can read Colour but does not receive a Colour input;
- the desktop twelve-column table and Colour column remain present.

### Hydrated interaction tests

`tests/inventory-hydration.test.tsx` must verify:

- pressing Add opens the form and updates `aria-expanded`;
- Cancel resets and closes the form without a mutation;
- create failure leaves the form open and preserves entered values;
- create success adds the returned item, resets fields, and closes the form;
- pending create disables controls that could close or duplicate the request;
- the existing saved-card stable target and failed-update preservation tests
  continue to pass.

### Responsive CSS tests

The existing mobile CSS test suite must verify:

- the Add trigger is mobile-only;
- the closed creation section is hidden only at `max-width: 720px`;
- the Colour summary row wraps without fixed-width overflow;
- Add, Cancel, and disclosure targets retain the 44px mobile minimum.

### Verification commands

Run focused Inventory and mobile suites first, then the repository verification
pipeline:

```powershell
npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx tests/pwa-mobile-ux.test.tsx tests/inventory-actions.test.ts tests/inventory-actions-supabase.test.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run verify
git diff --check
```

### Browser QA

Verify authenticated admin behavior at `375x812`, `390x844`, and `1280x900`:

- mobile initial form closed;
- open, Cancel, failed-save preservation, and successful-save closure;
- saved Colour values and `-` fallbacks;
- a long Colour value wraps inside the card;
- document horizontal overflow is zero;
- desktop Add form remains initially visible;
- desktop table still has all twelve columns and existing edit actions.

Supervisor visibility and edit restrictions must be enforced by component tests
even if a supervisor browser session is unavailable.

## Documentation impact

Implementation completion must update:

- `docs/UI-DESIGN-SYSTEM.md` to replace the three-field mobile card contract
  with the four-field contract and document the Add disclosure;
- `docs/UI-PAGES.md` to describe the mobile Add state transitions and Colour
  summary;
- `PROGRESS.md` only with stable implementation and verification results, not
  transient inventory row data.

The earlier approved design remains historical evidence and is not rewritten.
This document is the later user decision for these two Inventory behaviors.

## Out of scope

- Filling or correcting missing Colour values.
- Inferring paint colours from product names, categories, Jobber, or the quote
  paint catalog.
- Changing the desktop Add workflow or twelve-column Inventory table.
- Changing Inventory validation, CRUD contracts, RLS, or role permissions.
- Adding a modal, bottom sheet, or `/inventory/new` route.
- Redesigning CSV controls, search, filters, category grouping, or saved-item
  editing.
- Production deployment.

## Acceptance criteria

- At 720px and below, admin initially sees one `Add item` trigger instead of
  the full creation form.
- Opening the trigger reveals the existing creation fields inline with Add Item
  and Cancel actions.
- Cancel closes and clears without mutation; successful save closes and clears;
  failed save stays open and preserves values.
- Desktop continues to show the creation form without requiring the trigger.
- Every collapsed mobile saved-item card displays Name, Category, Size / Serial,
  and Colour, with `-` for a missing Colour value.
- Supervisor sees Colour but receives no new creation or edit permission.
- Mobile layouts retain 44px targets, 16px inputs, and zero page-level
  horizontal overflow at 375px and 390px.
- Existing Inventory actions, desktop table, saved-item disclosure safeguards,
  tests, typecheck, lint, build, and audit remain green.
