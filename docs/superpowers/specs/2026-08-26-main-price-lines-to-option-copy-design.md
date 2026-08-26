# Main Price Lines to Option Copy Design

## Status

- Intent confirmed by the user on 2026-08-26.
- This document defines the design boundary before the implementation plan is written.

## Goal

Allow an estimator to calculate and compose the main customer-facing price first, then copy that price list into a new, independently editable PBC Option. Repeating the copy creates multiple price alternatives without rebuilding the same line list by hand.

The copied option must start with the same eligible line names, quantities, unit prices, and ex-GST subtotal as the current main price list. Editing either side after the copy must not change the other side.

## Confirmed User Flow

On `/quotes/new` and `/quotes/[id]/edit`:

1. The estimator calculates the main quote with the existing Materials and formula workflow.
2. The estimator writes the customer-facing main price in `Public Product / Service Lines`.
3. In `Options`, the estimator selects `Copy Main Price to Option`.
4. The app appends and expands a new Option containing a snapshot of the eligible public priced lines.
5. The estimator renames and edits the copied Option to create a different scope or price.
6. The estimator may repeat the copy to create additional alternatives.
7. The main subtotal remains unchanged because Options continue to be priced and displayed separately.

## Source and Target

### Source

The source of truth at click time is the current in-form `JobberQuoteLineItemDraft[]` state rendered by `Public Product / Service Lines`.

This is deliberately not a copy of `quote_items` (the internal Materials calculation rows). The estimator has already translated the calculated main price into the public list that the customer is meant to see, so that list is the correct starting point for a customer-facing alternative.

### Target

The target is one new `QuoteOptionItem` appended to the current `options` state. Each copied public line becomes a custom, zero-labour `MaterialItem` owned by that Option.

This uses the existing `quote_options` and `quote_option_items` persistence model. No new table or persisted provenance field is required.

## Copy Eligibility

A source row is copied only when all of the following are true:

- `kind === 'line_item'`
- `clientVisible === true`
- quantity and unit price are complete, valid non-negative decimal inputs
- quantity is greater than zero
- `quantity × unitPrice` is greater than zero

The mapper preserves the relative order of eligible rows.

The following rows are not copied:

- text-only rows, because Options do not have a public text-row model
- client-hidden rows
- blank, incomplete, invalid, zero-quantity, or zero-total priced rows

The copy action is disabled when no eligible source rows exist. The disabled state should explain that at least one visible priced line is required.

## Field Mapping

| Public line | New Option material | Rule |
|---|---|---|
| `id` | `id` | Generate a fresh `option-item` client ID; never reuse the source ID. |
| `name` | `name` | Use the trimmed name; fall back to the trimmed description, then `Line item N`. |
| `quantity` | `quantity` | Preserve the positive decimal value. |
| `unitPrice` | `marketPrice` | Preserve the monetary value. |
| `unitPrice` | `actualPrice` | Use the same value so the copied customer price is not re-marked-up. |
| — | `workingDays` | Set to `0`. |
| — | `labourPerDay` | Set to `0`. |
| — | `isCustom` | Set to `true`. |
| description, taxable, Jobber IDs, linked Product / Service ID | — | Do not copy; the existing Option material schema has no equivalent customer-facing fields. |

The new Option uses:

- a fresh `option` client ID
- title `Option N`, following the existing next-position naming rule
- `selectedMin: 1`
- `selectedMax: 1`
- `isExpanded: true`
- no `sourceJobberLineItemIds`, because repeated copies are intentional and must not be deduplicated as Jobber option imports are

## Price Identity Invariant

All money and quantity operations use `decimal.js`; native floating-point arithmetic is not used.

For the eligible source rows:

```text
source ex-GST subtotal = Σ(quantity × unitPrice)
copied material total = Σ(quantity × marketPrice)
```

Because each copied material has:

- `marketPrice === actualPrice === source unitPrice`
- zero labour
- no area assignment
- Formula 1 selected for both min and max

Formula 1 resolves to the copied material market total. Therefore:

```text
new Option ex-GST subtotal === source ex-GST subtotal
```

The equality is numerical to the database/UI money precision; formatting differences such as `100` versus `100.00` are not meaningful.

The existing Option GST behavior remains unchanged: `finalTotal = subtotal × 1.10`. This feature preserves the ex-GST price list and does not introduce per-line tax handling.

## Independence and Repeat Behavior

The operation is a one-time snapshot, not a live link.

- Later edits to the main public lines do not update existing copied Options.
- Later edits to an Option do not update the main public lines.
- Repeating the action always creates another Option with fresh Option and item IDs.
- Existing Options are never overwritten or merged.
- The source array and source line objects are never mutated.

This behavior is required so the estimator can create several alternatives from the same main-price baseline.

## UI Design

Add `Copy Main Price to Option` to the `Options` panel header alongside the existing `Add Option` action.

The target-side placement makes the result clear and avoids adding Option-specific behavior to the reusable Product / Service editor.

On click:

- append one Option at the bottom of the list
- expand the new Option immediately
- preserve all existing Options
- do not show a confirmation dialog because the action is additive and reversible through the existing delete control

The newly rendered Option card is the success feedback. No new toast system is introduced.

On narrow layouts, the two header actions may wrap using the existing panel-header action styles. The copy action must remain a semantic `button` with `type="button"`, a clear accessible label, and a disabled state when copying is unavailable.

## Architecture

### Pure conversion module

Add a focused pure module under `components/quote-form/` that:

- identifies eligible source rows
- exposes whether copying is available
- converts the current public line state into a new `QuoteOptionItem`
- accepts the existing client-ID factory as a dependency so behavior is deterministic in tests

Keep this conversion separate from `jobber-option-mapping.ts`. Jobber option import converts external detected option totals into quantity-1 rows and deduplicates imports. Main-price copy must preserve source quantity/unit-price pairs and intentionally allow repeated copies.

### Quote form orchestration

`QuoteForm` owns the handler because it already owns both `jobberQuoteLines` and `options` state.

The handler builds the snapshot from the latest public-line state and appends it through a functional `setOptions` update. Existing draft persistence then captures the new Option without new storage logic.

### Options panel

`QuoteOptionsPanel` receives:

- whether a main-price copy is available
- a callback that requests the copy

It remains presentation-only and does not read or transform public-line state itself.

### Persistence

No save contract changes are needed. Existing paths already serialize and restore custom Option materials:

- draft persistence stores `options`
- `buildQuoteSavePayload` emits `quote_options` and `quote_option_items`
- quote record mapping restores them on edit

Fresh copied item IDs are important because the save payload uses each UI item ID as `sourceItemId`; source public-line IDs must not leak into that identity path.

## Error and Edge Handling

- An unavailable copy action does nothing and remains disabled.
- Invalid/incomplete numeric drafts are skipped rather than converted to zero-priced Option items.
- If a mix of eligible and ineligible rows exists, copy only eligible rows.
- Empty names use the documented fallback so the resulting Option remains server-valid.
- Very large values continue through existing server validation and database money limits; this feature does not weaken those controls.
- A copy does not change `deletedJobberLineItemIds`, Jobber sync state, main Materials, formulas, or totals.

## Test Strategy

### Pure mapping tests

- copies visible priced rows in source order
- preserves quantity and unit price in both Option price fields
- uses fresh Option/item IDs and never mutates source objects
- sets zero labour, custom rows, F1-F1, and expanded state
- falls back from blank name to description and then `Line item N`
- excludes text, hidden, invalid, zero-quantity, and zero-total rows
- allows repeated conversions and produces different IDs each time
- proves the Decimal source subtotal equals the calculated copied Option subtotal

### Component and orchestration tests

- renders `Copy Main Price to Option` beside `Add Option`
- disables the action when there are no eligible rows
- appends rather than replaces existing Options
- keeps repeated copies available
- leaves the main public lines and main quote subtotal unchanged

### Persistence regression tests

- copied Option materials are emitted by `buildQuoteSavePayload` with the expected snapshots and positions
- draft sanitization and restoration retain the copied Option
- saved quote mapping restores the copied Option as an independent editable Option

### Required verification

- focused Vitest suites pass
- full test suite passes
- TypeScript compilation passes
- ESLint passes

## No-Change Areas

This feature does not require changes to:

- Supabase migrations, tables, RPCs, or RLS policies
- Server Actions or quote validators
- pricing settings or calculation formulas
- the existing main quote final-total calculation
- Jobber fetch, refresh, sync, or write-back payloads
- external dependencies

## Out of Scope

- copying the internal main Materials rows instead of the public price list
- keeping copied Options synchronized with later main-price edits
- copying public descriptions, text-only rows, taxable flags, or Product / Service linkage into Option-owned public-line records
- writing PBC Options back to Jobber as Jobber option sections
- changing how Options are presented outside the existing PBC quote UI/detail flow
- introducing a new lossless Option Product / Service schema

If lossless public descriptions, per-line tax semantics, or Jobber option write-back become required, they need a separate approved design with new persistence and integration scope.

## Acceptance Criteria

- An estimator can create a new independent Option from the current visible priced public lines with one action.
- Eligible line names, quantities, unit prices, and order are retained.
- The copied Option's initial ex-GST subtotal exactly matches the eligible source lines' ex-GST subtotal.
- Repeated copies create distinct Options and never overwrite existing work.
- Main public lines, main Materials, and the main subtotal are unchanged by copying.
- Copied Options survive draft restoration and normal quote save/edit restoration through existing persistence.
- No database, authorization, Jobber mutation, or dependency change is introduced.
