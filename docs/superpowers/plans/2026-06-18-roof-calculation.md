# Roof Calculation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Roof as a third quote material scope beside Interior and Exterior, calculated with a configurable roof labour rate defaulting to 700 and the same five formula margin rules used by Interior/Exterior.

**Architecture:** Keep the existing five-formula calculator intact. Add Roof as a scoped subtotal group that uses `roof_labour_rate` as the labour rate for F1-F5, then applies the shared F2-F5 margin settings with the existing margin formula: divide by `(1 - margin)`, not multiply by `(1 + margin)`. Extend persisted area scopes and quote totals so the main quote subtotal becomes `interior + exterior + roof`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, decimal.js, Supabase migrations/RLS, Zod, Vitest.

---

## Assumptions To Confirm Before Execution

- Roof is a separate third scope, not Formula 6.
- Roof uses min/max formula selection like Interior/Exterior.
- Roof subtotal is GST-exclusive; final total still applies GST through existing `calculateFinal`.
- Roof material price means the existing material market total for rows assigned to Roof.
- Roof does not store a separate margin. It uses shared F2-F5 margin settings.

---

## File Structure

- Modify `supabase/migrations/0015_add_roof_scope_and_pricing.sql`: add roof pricing columns and widen scope checks.
- Modify `lib/calculator.ts`: extend `PricingSettings` and defaults with `roofLabourRate`; add roof formula/subtotal helpers that reuse the five existing formula rules.
- Modify `lib/validators.ts`: allow `roof` scope and validate roof pricing settings.
- Modify `lib/supabase/types.ts`: update manual Supabase types for the new columns and scope union.
- Modify `lib/actions/settings.ts`: read/write roof settings.
- Modify `lib/areas/types.ts` and `components/quote-form/types.ts`: extend `AreaScope` and scoped totals.
- Modify `components/quote-form/quote-calculation-totals.ts`: calculate roof subtotal and include it in final subtotal.
- Modify `components/quote-form/materials-panel.tsx` and `components/quote-form/material-row.tsx`: add Roof toggle/dropdown labels.
- Modify `components/quote-form/final-summary.tsx`: show Roof subtotal.
- Modify `components/quote-form/quote-form.tsx`, `quote-save-payload.ts`, `quote-record-mappers.ts`, `quote-draft.ts`, and option helpers where scope assumptions exist.
- Modify `components/settings/settings-form.tsx`: add Roof labour field and Roof area management.
- Modify `components/quote-detail/quote-detail-view.tsx`: show saved Roof subtotal/details.
- Modify tests under `tests/`: calculator, quote totals, settings actions/UI, area actions, quote actions, draft, UI, RLS migration checks.

---

### Task 1: Schema And Types

**Files:**
- Create: `supabase/migrations/0015_add_roof_scope_and_pricing.sql`
- Modify: `lib/supabase/types.ts`
- Modify: `lib/areas/types.ts`
- Modify: `components/quote-form/types.ts`
- Modify: `lib/validators.ts`

- [ ] **Step 1: Add failing schema/type tests**

Add tests that expect `roof` to be valid in `areaSchema`, `quoteSchema.items[].areaScopeSnapshot`, and option item scopes. Add settings validation expectations for `roofLabourRate`.

- [ ] **Step 2: Add migration**

Migration should:

```sql
ALTER TABLE pricing_settings
  ADD COLUMN roof_labour_rate NUMERIC(10,2) NOT NULL DEFAULT 700 CHECK (roof_labour_rate >= 0);

ALTER TABLE quote_areas
  DROP CONSTRAINT IF EXISTS quote_areas_scope_check,
  ADD CONSTRAINT quote_areas_scope_check CHECK (scope IN ('interior', 'exterior', 'roof'));

ALTER TABLE quote_items
  DROP CONSTRAINT IF EXISTS quote_items_area_scope_snapshot_check,
  ADD CONSTRAINT quote_items_area_scope_snapshot_check
    CHECK (area_scope_snapshot IS NULL OR area_scope_snapshot IN ('interior', 'exterior', 'roof'));

ALTER TABLE quote_option_items
  DROP CONSTRAINT IF EXISTS quote_option_items_area_scope_snapshot_check,
  ADD CONSTRAINT quote_option_items_area_scope_snapshot_check
    CHECK (area_scope_snapshot IS NULL OR area_scope_snapshot IN ('interior', 'exterior', 'roof'));
```

- [ ] **Step 3: Extend TypeScript unions and validators**

Change area scope unions from:

```typescript
export type AreaScope = 'interior' | 'exterior'
```

to:

```typescript
export type AreaScope = 'interior' | 'exterior' | 'roof'
```

Change Zod enums to include `roof`.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm.cmd run test:run -- tests/areas-actions.test.ts tests/quote-validators-jobber-lines.test.ts
```

Expected: related validation tests pass.

---

### Task 2: Calculator And Settings

**Files:**
- Modify: `lib/calculator.ts`
- Modify: `lib/actions/settings.ts`
- Modify: `lib/dev-data.ts`
- Modify: `components/settings/settings-form.tsx`
- Test: `tests/calculator.test.ts`, `tests/settings-actions.test.ts`, `tests/settings-actions-supabase.test.ts`, `tests/settings-ui.test.tsx`

- [ ] **Step 1: Write failing roof formula test**

Add calculator coverage for:

```typescript
const subtotal = calculateRoofSubtotal({
  labourDays: new Decimal(2),
  materialMarket: new Decimal(100),
}, {
  ...DEFAULT_PRICING_SETTINGS,
  roofLabourRate: 700,
}, 1, 3)

expect(subtotal.toFixed(2)).toBe('1821.43')
```

Calculation: average of F1 `700 * 2 + 100 = 1500` and F3 `(700 * 2 + 100) / 0.70 = 2142.86`, so subtotal is `1821.43`. A 30% margin is calculated by dividing by `0.70`, not multiplying by `1.30`.

- [ ] **Step 2: Implement calculator helper**

Add to `PricingSettings`:

```typescript
roofLabourRate: Decimal | number
```

Add default:

```typescript
roofLabourRate: 700,
```

Add pure helper:

```typescript
export function calculateRoofSubtotal(
  input: { labourDays: Decimal | number; materialMarket: Decimal | number; materialActual?: Decimal | number },
  settings: PricingSettings,
  selectedMin: 1 | 2 | 3 | 4 | 5 = 1,
  selectedMax: 1 | 2 | 3 | 4 | 5 = 1
): Decimal {
  const results = calculateRoofFormulaResults(input, settings)
  return calculateSubtotal(results, selectedMin, selectedMax)
}
```

- [ ] **Step 3: Wire settings read/write**

Map Supabase row fields:

```typescript
roof_labour_rate <-> roofLabourRate
```

Use `.toFixed(2)` for rate.

- [ ] **Step 4: Add Settings UI controls**

In Labour Rates tab, add Roof fields:

- Roof Labour Rate, default `$700/day`

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm.cmd run test:run -- tests/calculator.test.ts tests/settings-actions.test.ts tests/settings-actions-supabase.test.ts tests/settings-ui.test.tsx
```

Expected: calculator and settings tests pass.

---

### Task 3: Quote Totals

**Files:**
- Modify: `components/quote-form/quote-calculation-totals.ts`
- Modify: `components/quote-form/quote-option-totals.ts`
- Test: `tests/quote-calculation-totals.test.ts`

- [ ] **Step 1: Write failing grouped subtotal test**

Add a test with Interior subtotal `1100`, Exterior subtotal `1700`, Roof subtotal based on shared F1-F5 margin rules, expecting final subtotal to include all three scopes.

- [ ] **Step 2: Extend `AreaSubtotalBreakdown`**

Add:

```typescript
roof: AreaSubtotalGroup
```

Roof group should use `calculateRoofSubtotal`, which internally reuses `calculateRoofFormulaResults` and the shared F1-F5 margin rules.

- [ ] **Step 3: Include roof in final subtotal**

Change:

```typescript
const finalSubtotal = interior.subtotal.add(exterior.subtotal)
```

to:

```typescript
const finalSubtotal = interior.subtotal.add(exterior.subtotal).add(roof.subtotal)
```

- [ ] **Step 4: Keep unassigned logic strict**

Rows with scope not in `interior | exterior | roof` remain unassigned.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm.cmd run test:run -- tests/quote-calculation-totals.test.ts
```

Expected: grouped subtotal tests pass.

---

### Task 4: Quote UI

**Files:**
- Modify: `components/quote-form/materials-panel.tsx`
- Modify: `components/quote-form/material-row.tsx`
- Modify: `components/quote-form/final-summary.tsx`
- Modify: `components/quote-form/quote-form.tsx`
- Modify: `components/quote-detail/quote-detail-view.tsx`
- Test: `tests/quote-ui.test.tsx`

- [ ] **Step 1: Add failing UI tests**

Expect:

- Materials toggle renders Interior, Exterior, Roof.
- Selecting Roof filters to roof rows.
- New material added while Roof is active gets `areaScope: 'roof'`.
- Final summary displays Roof subtotal.
- Roof rows appear in quote detail.

- [ ] **Step 2: Add scope metadata helper**

Use a shared local constant where touched:

```typescript
const AREA_SCOPES = ['interior', 'exterior', 'roof'] as const
const AREA_SCOPE_LABELS = {
  interior: 'Interior',
  exterior: 'Exterior',
  roof: 'Roof',
} satisfies Record<AreaScope, string>
```

- [ ] **Step 3: Update Materials toggle and summaries**

Render all three scopes from `AREA_SCOPES`, and use the label map for display.

- [ ] **Step 4: Update detail and final summary**

Show:

- Interior subtotal
- Exterior subtotal
- Roof subtotal
- Final subtotal
- GST
- Total inc GST

- [ ] **Step 5: Run focused UI tests**

Run:

```powershell
npm.cmd run test:run -- tests/quote-ui.test.tsx
```

Expected: quote UI tests pass.

---

### Task 5: Persistence, Drafts, And Dev Data

**Files:**
- Modify: `lib/actions/quotes.ts`
- Modify: `lib/dev-data.ts`
- Modify: `components/quote-form/quote-save-payload.ts`
- Modify: `components/quote-form/quote-record-mappers.ts`
- Modify: `components/quote-form/quote-draft.ts`
- Test: `tests/quote-actions.test.ts`, `tests/quote-actions-supabase.test.ts`, `tests/quote-draft.test.ts`, `tests/dev-data.test.ts`

- [ ] **Step 1: Add failing persistence tests**

Expect quote create/update/get to preserve a material row with:

```typescript
areaScopeSnapshot: 'roof'
```

and expected saved totals to include roof subtotal.

- [ ] **Step 2: Normalize draft parsing**

Draft parser should preserve valid `roof` scope and drop only invalid unknown scopes.

- [ ] **Step 3: Update quote action mappers**

Ensure quote items and quote option items accept and return `roof` scope without coercing it to unassigned.

- [ ] **Step 4: Run focused persistence tests**

Run:

```powershell
npm.cmd run test:run -- tests/quote-actions.test.ts tests/quote-actions-supabase.test.ts tests/quote-draft.test.ts tests/dev-data.test.ts
```

Expected: quote save/load and draft tests pass.

---

### Task 6: Area Management And RLS Tests

**Files:**
- Modify: `components/settings/settings-form.tsx`
- Modify: `tests/areas-actions.test.ts`
- Modify: `tests/areas-actions-supabase.test.ts`
- Modify: `tests/rls.test.ts`
- Modify: `tests/rls-local-integration.test.ts`

- [ ] **Step 1: Add Roof area UI tests**

Settings Area tab should allow creating and listing Roof labels.

- [ ] **Step 2: Update Settings Area tab**

Add Roof to:

- create-area scope dropdown
- grouped area list
- edit-area scope dropdown

- [ ] **Step 3: Update RLS migration tests**

Migration checks should expect `quote_areas.scope`, `quote_items.area_scope_snapshot`, and `quote_option_items.area_scope_snapshot` to allow `roof`.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
npm.cmd run test:run -- tests/areas-actions.test.ts tests/areas-actions-supabase.test.ts tests/rls.test.ts tests/rls-local-integration.test.ts
```

Expected: area and migration/RLS tests pass, with local integration skipped if env is absent.

---

### Task 7: Full Verification

**Files:**
- No new files unless test failures expose missed references.

- [ ] **Step 1: Search for remaining two-scope assumptions**

Run:

```powershell
rg -n "interior', 'exterior|interior \\| exterior|Interior.*Exterior|exterior.*interior|area_scope_snapshot.*interior.*exterior" lib components app tests supabase docs --glob "!node_modules"
```

Expected: no production code remains that accidentally excludes Roof, except historical docs or deliberately legacy selected-min/max DB columns.

- [ ] **Step 2: Run full verification**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:run
npm.cmd run build
git diff --check
```

Expected: all pass.

---

## Execution Notes

- Do not add external dependencies.
- Do not apply the migration to production Supabase without explicit user approval.
- Existing quotes without roof rows should keep their previous totals.
- Existing Interior/Exterior min/max selection columns remain unchanged; Roof stores its own min/max formula selection columns in the later persistence upgrade.
