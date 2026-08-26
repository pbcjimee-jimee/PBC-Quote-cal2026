# Main Materials to Option Copy Implementation Plan

**Model:** Codex 5.6-Sol high

**Spec:** `docs/superpowers/specs/2026-08-26-main-materials-to-option-copy-design.md`

## Scope

Replace the incorrectly sourced Product / Service copy action with a Main Materials snapshot action. Keep the change client-side and reuse existing Option calculation, draft, save, and restoration paths.

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

Run:

```powershell
npm.cmd run test:run -- tests/main-materials-option-copy.test.ts
```

## Task 2 — Wire the Options action to Main Materials

**Files:**

- `components/quote-form/quote-form.tsx`
- `components/quote-form/quote-options-panel.tsx`
- `tests/quote-ui.test.tsx`

Change `QuoteForm` so eligibility and the click handler use `materials`, not `jobberQuoteLines`. Rename presentation props to `canCopyMaterials` and `onCopyMaterials`.

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

## Task 3 — Correct project documentation

**Files:**

- `docs/UI-QUOTE-FORM.md`
- `docs/ARCHITECTURE.md`
- `PROGRESS.md`

Document Main Materials as the only source, the fresh-ID independent-copy contract, F4/F1 initialization, existing persistence reuse, and the absence of DB/Jobber changes. Remove the superseded Product / Service copy wording.

## Task 4 — Verification and review

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
