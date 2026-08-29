# Main Materials to Option Copy Design

**Date:** 2026-08-26

**Status:** Approved

## Goal

Let an estimator calculate a main quote with `Main Materials`, then create an independent Option containing the same material rows so the Option can be adjusted into an alternative price.

The source is the `materials` state rendered by `MaterialsPanel`. Public Product / Service lines in `jobberQuoteLines` are not part of this action.

## User flow

1. Add and edit rows in Main Materials.
2. Select `Copy Materials to Option` in the Options header.
3. The app appends one expanded Option named with the next `Option N` number.
4. Edit the copied Option without changing Main Materials.
5. Repeat the action to create another independent snapshot.

When Main Materials is empty, the button is disabled and the UI displays `Add at least one material first.` A zero-price material is still a material and does not disable copying.

## Copy contract

Every Main Materials row is copied in its current order. The copy preserves all `MaterialItem` data available in the form, including:

- product linkage and descriptive metadata
- quote-only name and memo
- visible RRP and custom-row hidden actual-price state
- quantity, working days, and labour per day
- area ID, area name, and area scope
- custom/linked status

The new Option and every copied material receive fresh client IDs. Main and Option IDs must never be reused because the save boundary sends row IDs as `sourceItemId` and rejects one identity appearing in both collections.

The transform creates new material objects. Later edits to either Main Materials or the Option do not synchronize to the other copy.

## Formula behavior

The copied Option starts with the same F4/F1 selection used by the existing `Add Option` flow. This change copies Material rows; it does not add per-area formula selections to Options.

Main quotes can use different Interior, Exterior, and Roof formula pairs, while an Option stores only one pair. Therefore the feature does not promise that a mixed-scope Option subtotal exactly equals the main subtotal. Extending Option persistence to per-area formula selections requires a separate approved design and database change.

## Price and persistence behavior

Visible RRP and every editable Material value are copied exactly in client state and serialized through the existing Option save payload. Existing draft, create, update, and edit restoration paths already support Option materials, so no database, RPC, RLS, or Jobber write-back change is required.

For a linked product, the copied row keeps `productId`. Because it has a fresh row ID, the server treats it as a new linked material and applies the existing trusted hidden-price snapshot policy at save time. Before appending the Option, a narrow authenticated batch Server Action resolves the same current trusted product-price basis and replaces only the copied linked row's hidden `actualPrice`. This keeps F3/F5 preview totals aligned with persistence while preserving the visible quote-local RRP and every other editable field. Custom rows keep their copied hidden price unchanged.

If a linked product price cannot be verified, the app appends no Option and shows an error beside the action. The lookup deduplicates exact product IDs, includes inactive linked products to match save-time resolution, and returns only `{ productId, trustedPrice }` snapshots.

The preview is aligned to the trusted price observed when the copy action runs. Quote save remains authoritative and revalidates current product prices; if the catalog changes between copy and save, the saved linked Option can use the newer value. Atomic copy-to-save price locking would require a separate versioned-price design.

## UI

`QuoteOptionsPanel` places `Copy Materials to Option` beside `Add Option` using the existing ghost button and panel-header action layout. The disabled explanation is visible and associated with the button through `aria-describedby`.

## Out of scope

- copying Product / Service lines
- choosing or replacing an existing Option
- keeping Main Materials and copied Options synchronized
- copying Main area-specific formula pairs
- database or external integration changes
- changes to quote save RPC, RLS, or Jobber integration

## Verification

- all linked and custom Material fields, including zero-price rows, copy in order
- source, repeated copies, Option IDs, and material IDs remain independent
- Main Materials alone enables the action; public price lines alone do not
- the real button appends expanded Options and does not mutate Main Materials or the main subtotal
- existing save payload preserves copied fields with non-conflicting source IDs
- linked rows use current trusted prices before preview, and lookup failure appends nothing
- typecheck, lint, focused tests, full tests, coverage, and production build pass
