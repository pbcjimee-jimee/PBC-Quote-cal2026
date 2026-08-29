# Main Materials to Option Copy Implementation Plan

**Model:** Codex 5.6-Sol high

**Spec:** `docs/superpowers/specs/2026-08-26-main-materials-to-option-copy-design.md`

## Scope

Replace the incorrectly sourced Product / Service copy action with a Main Materials snapshot action. Reuse existing Option calculation, draft, save, and restoration paths, and align fresh linked Option rows with the existing save-time trusted-price policy through one read-only batch lookup.

## Task 1 — Pure Main Materials snapshot transform

**Files:**

- `components/quote-form/main-materials-option-copy.ts`
- `tests/main-materials-option-copy.test.ts`

Implement and test:

- `hasCopyableMainMaterials(materials)` returns true for every non-empty list, including zero-price rows.
- `createMainMaterialsOption(materials, optionNumber, createId)` returns null for an empty list.
- A created Option is expanded, titled `Option N`, and starts with F4/F1.
- Every source row is shallow-cloned because `MaterialItem` contains scalar fields, and every clone receives a fresh `option-item` ID.
- `appendMainMaterialsOption` appends without mutating the current Options array or Main Materials.
- Repeated copies receive distinct Option and material IDs.
- The existing save payload serializes copied values and never reuses a Main Material `sourceItemId`.
- Linked rows can receive resolved trusted prices without mutating visible RRP, custom prices, or Main Materials.
- Empty input returns `null`, missing linked prices are rejected, and copied objects remain mutation-independent.

Run:

```powershell
npm.cmd run test:run -- tests/main-materials-option-copy.test.ts
```

## Task 2 — Resolve current trusted linked-product prices

**Files:**

- `lib/validators.ts`
- `lib/actions/products.ts`
- `lib/dev-data.ts`
- `tests/products-actions.test.ts`
- `tests/products-actions-supabase.test.ts`

Add a Zod-validated, authenticated exact-ID batch action that returns only `{ productId, trustedPrice }`. Deduplicate IDs, do not filter inactive rows, use the same RRP-first precedence as quote save, and fail when any linked product cannot be verified.

## Task 3 — Wire the Options action to Main Materials

**Files:**

- `components/quote-form/quote-form.tsx`
- `components/quote-form/quote-options-panel.tsx`
- `tests/quote-ui.test.tsx`

Change `QuoteForm` so eligibility and the click handler use `materials`, not `jobberQuoteLines`. Rename presentation props to `canCopyMaterials` and `onCopyMaterials`. Custom-only copies stay synchronous; linked copies resolve current trusted prices first, prevent concurrent requests, append nothing on failure, and show the error beside the action.

Render the exact label `Copy Materials to Option`. When disabled, show `Add at least one material first.` and associate it with the button through `aria-describedby`.

Exercise the real `QuoteForm` interaction:

- Materials with no public price lines enable the button.
- Public price lines with no Materials leave it disabled.
- Clicking twice appends two expanded, independently identified Options.
- Copied cards contain Main Materials and exclude public Product / Service rows.
- Main state and main subtotal remain unchanged.

Run:

```powershell
npm.cmd run test:run -- tests/main-materials-option-copy.test.ts tests/quote-ui.test.tsx
```

## Task 4 — Correct project documentation

**Files:**

- `docs/UI-QUOTE-FORM.md`
- `docs/ARCHITECTURE.md`
- `PROGRESS.md`

Document Main Materials as the only source, the fresh-ID independent-copy contract, F4/F1 initialization, trusted linked-price preview alignment, existing persistence reuse, and the absence of DB/RPC/RLS/Jobber changes. Remove the superseded Product / Service copy wording.

## Task 5 — Verification and review

Run:

```powershell
git diff --check
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:run
npm.cmd run test:coverage
npm.cmd run build
```

Request an independent code review focused on data source correctness, identity safety, source immutability, accessibility, save persistence, and stale Product / Service copy references. Address actionable findings and repeat affected verification.
