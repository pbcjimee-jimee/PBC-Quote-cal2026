# Quote Workspace Area Subtotals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Interior/Exterior grouped subtotals, GST-exclusive option summaries, Product / Service row-list scrolling, collapsible app sidebar, and faster Product / Service sorting controls.

**Architecture:** Keep persistence unchanged and derive grouped totals from existing material `areaScope` / `areaScopeSnapshot` values. Add focused helpers in quote-form modules, reuse the existing calculator functions, and update UI components without introducing new dependencies.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, decimal.js, Vitest.

**Implementation status (2026-05-28):** Implemented. Grouped Interior/Exterior subtotals, option subtotal ex GST display, Materials and Calculation Interior/Exterior labour totals, faster Product / Service row movement controls, a collapsible sidebar, and internal memo documentation were applied with focused tests and full build verification. A later UI pass restored the original two-column page-scroll editor: the left panel is Customer Info -> Product / Service -> Materials -> Options -> Internal Memos, the right Calculation panel is sticky without its own scroll container, and only the Product / Service row list uses internal scrolling. Product / Service catalog dropdowns open only from the active row input.

---

## File Structure

- Modify: `components/quote-form/quote-calculation-totals.ts`
  - Add reusable grouped subtotal helpers for main quote state and saved quote records.
- Modify: `components/quote-form/final-summary.tsx`
  - Render Interior subtotal, Exterior subtotal, Final subtotal ex GST, unassigned warning, and GST rows.
- Modify: `components/quote-form/option-totals-summary.tsx`
  - Render option subtotal ex GST and optional Interior/Exterior subtotal rows.
- Modify: `components/quote-form/quote-options-panel.tsx`
  - Show option subtotal ex GST in option headers and preserve expanded formula editing.
- Modify: `components/quote-form/jobber-product-service-editor.tsx`
  - Add top/up/down/bottom reorder helpers and row controls.
- Modify: `components/quote-form/quote-form.tsx`
  - Use grouped totals, pass option subtotal summaries, and convert the form to a fixed-height desktop workspace with scrollable sections.
- Modify: `components/quote-detail/quote-detail-view.tsx`
  - Derive grouped totals from saved item snapshots and show option subtotals ex GST.
- Modify: `components/layout/app-header.tsx`
  - Add collapsible desktop sidebar with localStorage preference.
- Modify: `app/(app)/layout.tsx`
  - Let `AppHeader` control shell padding through CSS variables or a wrapper class.
- Test: `tests/quote-calculation-totals.test.ts`
- Test: `tests/quote-ui.test.tsx`
- Test: `tests/jobber-product-service-editor.test.tsx`

---

### Task 1: Add Grouped Area Subtotal Helpers

**Files:**
- Modify: `components/quote-form/quote-calculation-totals.ts`
- Test: `tests/quote-calculation-totals.test.ts`

- [ ] **Step 1: Write failing tests for grouped Interior/Exterior totals**

Add this test to `tests/quote-calculation-totals.test.ts`:

```typescript
import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import {
  calculateAreaSubtotalBreakdown,
  calculateMainQuoteTotals,
} from '@/components/quote-form/quote-calculation-totals'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

describe('calculateAreaSubtotalBreakdown', () => {
  it('calculates interior and exterior subtotals separately and excludes unassigned rows', () => {
    const breakdown = calculateAreaSubtotalBreakdown({
      materials: [
        {
          id: 'interior-row',
          name: 'Interior wall paint',
          marketPrice: '100',
          actualPrice: '80',
          quantity: '1',
          workingDays: '2',
          labourPerDay: '1',
          areaScope: 'interior',
          isCustom: true,
        },
        {
          id: 'exterior-row',
          name: 'Exterior trim paint',
          marketPrice: '200',
          actualPrice: '160',
          quantity: '1',
          workingDays: '3',
          labourPerDay: '1',
          areaScope: 'exterior',
          isCustom: true,
        },
        {
          id: 'unassigned-row',
          name: 'Unassigned primer',
          marketPrice: '50',
          actualPrice: '40',
          quantity: '1',
          workingDays: '1',
          labourPerDay: '1',
          isCustom: true,
        },
      ],
      selectedMin: 1,
      selectedMax: 1,
      settings: DEFAULT_PRICING_SETTINGS,
    })

    expect(breakdown.interior.subtotal.toFixed(2)).toBe('1100.00')
    expect(breakdown.exterior.subtotal.toFixed(2)).toBe('1700.00')
    expect(breakdown.finalSubtotal.toFixed(2)).toBe('2800.00')
    expect(breakdown.unassigned.materialMarket.toFixed(2)).toBe('50.00')
    expect(breakdown.unassigned.count).toBe(1)
  })

  it('keeps the existing overall main total available', () => {
    const totals = calculateMainQuoteTotals({
      materials: [
        {
          id: 'interior-row',
          name: 'Interior wall paint',
          marketPrice: '100',
          actualPrice: '80',
          quantity: '1',
          workingDays: '2',
          labourPerDay: '1',
          areaScope: 'interior',
          isCustom: true,
        },
      ],
      selectedMin: 1,
      selectedMax: 1,
      settings: DEFAULT_PRICING_SETTINGS,
    })

    expect(totals.subtotal).toBeInstanceOf(Decimal)
    expect(totals.areaBreakdown.interior.subtotal.toFixed(2)).toBe('1100.00')
  })
})
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
npm.cmd run test:run -- tests/quote-calculation-totals.test.ts
```

Expected: FAIL because `calculateAreaSubtotalBreakdown` and `areaBreakdown` do not exist.

- [ ] **Step 3: Add grouped subtotal types and helper**

In `components/quote-form/quote-calculation-totals.ts`, add these types and helper functions above `calculateMainQuoteTotals`:

```typescript
type AreaScope = 'interior' | 'exterior'

interface AreaSubtotalBreakdownInput {
  materials: MaterialItem[]
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  settings: PricingSettings
}

export interface AreaSubtotalGroup {
  scope: AreaScope
  materialMarket: Decimal
  materialActual: Decimal
  labour: LabourTotals
  results: FormulaResult[]
  subtotal: Decimal
  finalTotal: Decimal
}

export interface UnassignedSubtotalGroup {
  count: number
  materialMarket: Decimal
  labourDays: Decimal
}

export interface AreaSubtotalBreakdown {
  interior: AreaSubtotalGroup
  exterior: AreaSubtotalGroup
  finalSubtotal: Decimal
  finalTotal: Decimal
  unassigned: UnassignedSubtotalGroup
}

function materialMarketTotal(materials: MaterialItem[]): Decimal {
  return materials.reduce(
    (total, item) => total.add(decimalFromInput(item.marketPrice).mul(decimalFromInput(item.quantity))),
    new Decimal(0)
  )
}

function calculateScopedGroup(
  scope: AreaScope,
  materials: MaterialItem[],
  selectedMin: FormulaNumber,
  selectedMax: FormulaNumber,
  settings: PricingSettings
): AreaSubtotalGroup {
  const scopedMaterials = materials.filter((item) => item.areaScope === scope)
  const materialMarket = materialMarketTotal(scopedMaterials)
  const materialActual = materialMarket
  const labour = calculateLabourTotals(scopedMaterials)
  const results = calculateAllFormulas(
    {
      workingDays: labour.labourDays,
      labourPerDay: 1,
      materialMarket,
      materialActual,
    },
    settings
  )
  const subtotal = calculateSubtotal(results, selectedMin, selectedMax)

  return {
    scope,
    materialMarket,
    materialActual,
    labour,
    results,
    subtotal,
    finalTotal: calculateFinal(subtotal),
  }
}

export function calculateAreaSubtotalBreakdown({
  materials,
  selectedMin,
  selectedMax,
  settings,
}: AreaSubtotalBreakdownInput): AreaSubtotalBreakdown {
  const interior = calculateScopedGroup('interior', materials, selectedMin, selectedMax, settings)
  const exterior = calculateScopedGroup('exterior', materials, selectedMin, selectedMax, settings)
  const unassignedMaterials = materials.filter((item) => item.areaScope !== 'interior' && item.areaScope !== 'exterior')
  const unassignedLabour = calculateLabourTotals(unassignedMaterials)
  const finalSubtotal = interior.subtotal.add(exterior.subtotal)

  return {
    interior,
    exterior,
    finalSubtotal,
    finalTotal: calculateFinal(finalSubtotal),
    unassigned: {
      count: unassignedMaterials.length,
      materialMarket: materialMarketTotal(unassignedMaterials),
      labourDays: unassignedLabour.labourDays,
    },
  }
}
```

- [ ] **Step 4: Attach the breakdown to `MainQuoteTotals`**

Update the `MainQuoteTotals` interface:

```typescript
export interface MainQuoteTotals {
  materialMarket: Decimal
  materialActual: Decimal
  materialLabour: LabourTotals
  totalWorkingDays: Decimal
  totalLabourPerDay: Decimal
  totalLabourDays: Decimal
  results: FormulaResult[]
  subtotal: Decimal
  subtotalLabour: Decimal
  finalTotal: Decimal
  areaBreakdown: AreaSubtotalBreakdown
}
```

Inside `calculateMainQuoteTotals`, compute and return it:

```typescript
const areaBreakdown = calculateAreaSubtotalBreakdown({
  materials,
  selectedMin,
  selectedMax,
  settings,
})
```

Add `areaBreakdown` to the returned object.

- [ ] **Step 5: Run the test and verify it passes**

Run:

```bash
npm.cmd run test:run -- tests/quote-calculation-totals.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/quote-form/quote-calculation-totals.ts tests/quote-calculation-totals.test.ts
git commit -m "Add area subtotal calculation helpers"
```

---

### Task 2: Render Main Quote Grouped Subtotals

**Files:**
- Modify: `components/quote-form/final-summary.tsx`
- Modify: `components/quote-form/quote-form.tsx`
- Modify: `components/quote-detail/quote-detail-view.tsx`
- Test: `tests/quote-ui.test.tsx`

- [ ] **Step 1: Write failing UI tests for grouped totals**

Add this test to `tests/quote-ui.test.tsx`:

```typescript
it('shows interior, exterior, and final subtotal ex GST in the quote form summary', () => {
  const markup = renderToStaticMarkup(
    createElement(QuoteForm, {
      settings: quoteRecord.pricingSettingsSnapshot,
      areas: [],
      productServices: [],
      quoteLineTemplates: [],
      initialQuote: {
        ...quoteRecord,
        items: [
          {
            id: 'item-interior',
            quoteId: quoteRecord.id,
            productId: null,
            productNameSnapshot: 'Interior paint',
            marketPriceSnapshot: '100.00',
            actualPriceSnapshot: '100.00',
            quantity: '1.00',
            workingDays: '2.00',
            labourPerDay: '1.00',
            areaId: null,
            areaNameSnapshot: 'Bedroom',
            areaScopeSnapshot: 'interior',
            isCustom: true,
            position: 0,
          },
          {
            id: 'item-exterior',
            quoteId: quoteRecord.id,
            productId: null,
            productNameSnapshot: 'Exterior paint',
            marketPriceSnapshot: '200.00',
            actualPriceSnapshot: '200.00',
            quantity: '1.00',
            workingDays: '3.00',
            labourPerDay: '1.00',
            areaId: null,
            areaNameSnapshot: 'Fence',
            areaScopeSnapshot: 'exterior',
            isCustom: true,
            position: 1,
          },
        ],
      },
    })
  )

  expect(markup).toContain('Interior subtotal')
  expect(markup).toContain('Exterior subtotal')
  expect(markup).toContain('Final subtotal')
  expect(markup).toContain('Ex GST')
})
```

- [ ] **Step 2: Run the UI test and verify it fails**

Run:

```bash
npm.cmd run test:run -- tests/quote-ui.test.tsx
```

Expected: FAIL because the summary does not render grouped subtotal labels.

- [ ] **Step 3: Extend `FinalSummary` props**

In `components/quote-form/final-summary.tsx`, import the type:

```typescript
import type { AreaSubtotalBreakdown } from './quote-calculation-totals'
```

Update props:

```typescript
interface FinalSummaryProps {
  labourTotal: Decimal
  materialTotal: Decimal
  subtotal: Decimal
  finalTotal: Decimal
  areaBreakdown: AreaSubtotalBreakdown
  jobberFinancialSummary: JobberQuoteFinancialSummary | null
}
```

- [ ] **Step 4: Render grouped totals in `FinalSummary`**

Replace the top amount block and subtotal rows with:

```tsx
const visibleSubtotal = areaBreakdown.finalSubtotal
const visibleFinalTotal = areaBreakdown.finalTotal
const gstTotal = Decimal.max(visibleFinalTotal.sub(visibleSubtotal), 0)

<div className="rounded-lg bg-[var(--primary-soft)] px-4 py-4">
  <span className="text-sm font-bold uppercase text-[var(--primary)]">Final subtotal</span>
  <div className="mt-2 font-mono text-4xl font-bold tabular-nums text-slate-950">${visibleSubtotal.toFixed(2)}</div>
  <p className="mt-1 text-xs font-medium text-slate-500">Ex GST. Interior and exterior are calculated separately.</p>
</div>
<div className="space-y-2 text-sm">
  <div className="mt-4 flex justify-between">
    <span className="text-slate-500">Interior subtotal</span>
    <span className="font-mono font-semibold text-slate-950">${areaBreakdown.interior.subtotal.toFixed(2)}</span>
  </div>
  <div className="flex justify-between">
    <span className="text-slate-500">Exterior subtotal</span>
    <span className="font-mono font-semibold text-slate-950">${areaBreakdown.exterior.subtotal.toFixed(2)}</span>
  </div>
  <div className="flex justify-between border-t border-slate-100 pt-2">
    <span className="text-slate-500">Final subtotal</span>
    <span className="font-mono font-bold text-slate-950">${visibleSubtotal.toFixed(2)}</span>
  </div>
  <div className="flex justify-between">
    <span className="text-slate-500">GST 10%</span>
    <span className="font-mono text-slate-900">${gstTotal.toFixed(2)}</span>
  </div>
  {areaBreakdown.unassigned.count > 0 ? (
    <p className="rounded-lg border border-amber-100 bg-[var(--warning-soft)] px-3 py-2 text-xs font-medium text-amber-800">
      {areaBreakdown.unassigned.count} material row needs an Interior or Exterior area before it is included in grouped subtotals.
    </p>
  ) : null}
</div>
```

Keep the Jobber profit block below this section.

- [ ] **Step 5: Pass breakdown from `QuoteForm`**

In `components/quote-form/quote-form.tsx`, update the `FinalSummary` call:

```tsx
<FinalSummary
  labourTotal={totals.subtotalLabour}
  materialTotal={totals.materialMarket}
  subtotal={totals.subtotal}
  finalTotal={totals.finalTotal}
  areaBreakdown={totals.areaBreakdown}
  jobberFinancialSummary={jobberQuoteDraft && !jobberQuoteDraft.jobExpensesError ? jobberQuoteDraft.financialSummary : null}
/>
```

- [ ] **Step 6: Add saved quote breakdown in detail view**

In `components/quote-detail/quote-detail-view.tsx`, map saved items into the helper input:

```typescript
const savedMaterials = quote.items.map((item) => ({
  id: item.id,
  productId: item.productId ?? undefined,
  name: item.productNameSnapshot,
  marketPrice: item.marketPriceSnapshot,
  actualPrice: item.actualPriceSnapshot,
  quantity: item.quantity,
  workingDays: item.workingDays ?? '0',
  labourPerDay: item.labourPerDay ?? '0',
  areaId: item.areaId ?? undefined,
  areaName: item.areaNameSnapshot ?? undefined,
  areaScope: item.areaScopeSnapshot ?? undefined,
  isCustom: item.isCustom,
}))
const areaBreakdown = calculateAreaSubtotalBreakdown({
  materials: savedMaterials,
  selectedMin: quote.selectedMin,
  selectedMax: quote.selectedMax,
  settings: quote.pricingSettingsSnapshot,
})
```

Pass `areaBreakdown` into `FinalSummary`.

- [ ] **Step 7: Run UI tests**

Run:

```bash
npm.cmd run test:run -- tests/quote-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/quote-form/final-summary.tsx components/quote-form/quote-form.tsx components/quote-detail/quote-detail-view.tsx tests/quote-ui.test.tsx
git commit -m "Show grouped quote subtotals"
```

---

### Task 3: Show Option Subtotals Ex GST

**Files:**
- Modify: `components/quote-form/option-totals-summary.tsx`
- Modify: `components/quote-form/quote-options-panel.tsx`
- Modify: `components/quote-form/quote-form.tsx`
- Modify: `components/quote-detail/quote-detail-view.tsx`
- Test: `tests/quote-ui.test.tsx`

- [ ] **Step 1: Write failing tests for option subtotal display**

Update the existing option summary tests in `tests/quote-ui.test.tsx` so option summaries pass both subtotal and finalTotal:

```typescript
it('shows option subtotal ex GST instead of GST-inclusive option final total', () => {
  const markup = renderToStaticMarkup(
    createElement(OptionTotalsSummary, {
      options: [
        {
          id: 'option-1',
          title: 'Option 1 - Garage door repaint',
          subtotal: new Decimal('500.00'),
          finalTotal: new Decimal('550.00'),
        },
      ],
    })
  )

  expect(markup).toContain('$500.00')
  expect(markup).not.toContain('$550.00')
  expect(markup).toContain('Ex GST')
})
```

- [ ] **Step 2: Run the UI test and verify it fails**

Run:

```bash
npm.cmd run test:run -- tests/quote-ui.test.tsx
```

Expected: FAIL because `OptionTotalsSummary` currently receives and renders `finalTotal`.

- [ ] **Step 3: Update `OptionTotalsSummary` props and rendering**

In `components/quote-form/option-totals-summary.tsx`, change the props:

```typescript
interface OptionTotalsSummaryProps {
  options: Array<{
    id: string
    title: string
    subtotal: Decimal
    finalTotal?: Decimal
    interiorSubtotal?: Decimal
    exteriorSubtotal?: Decimal
  }>
}
```

Render subtotal:

```tsx
<span className="font-mono font-semibold text-gray-900">${option.subtotal.toFixed(2)}</span>
```

Change the heading note:

```tsx
<span className="text-xs text-gray-500">Ex GST, not included in main total</span>
```

If `interiorSubtotal` or `exteriorSubtotal` exists, render compact subrows:

```tsx
{option.interiorSubtotal || option.exteriorSubtotal ? (
  <span className="mt-1 block text-xs text-gray-500">
    Interior ${option.interiorSubtotal?.toFixed(2) ?? '0.00'} · Exterior ${option.exteriorSubtotal?.toFixed(2) ?? '0.00'}
  </span>
) : null}
```

- [ ] **Step 4: Pass option subtotal data from `QuoteForm`**

In `components/quote-form/quote-form.tsx`, update `optionTotals` record type to include `areaBreakdown`:

```typescript
areaBreakdown: ReturnType<typeof calculateAreaSubtotalBreakdown>
```

After calculating option `subtotal`, calculate grouped option subtotals:

```typescript
const areaBreakdown = calculateAreaSubtotalBreakdown({
  materials: option.materials,
  selectedMin: option.selectedMin,
  selectedMax: option.selectedMax,
  settings,
})
```

Store `areaBreakdown` in the option totals record.

Update `optionPanelTotals`:

```typescript
subtotal: totalsForOption.subtotal.toFixed(2),
finalTotal: totalsForOption.finalTotal.toFixed(2),
```

Update `optionSummaryItems`:

```typescript
const optionSummaryItems = useMemo(() => options.map((option, index) => {
  const totalsForOption = optionTotals[option.id]
  return {
    id: option.id,
    title: option.title.trim() || `Option ${index + 1}`,
    subtotal: totalsForOption.subtotal,
    finalTotal: totalsForOption.finalTotal,
    interiorSubtotal: totalsForOption.areaBreakdown.interior.subtotal,
    exteriorSubtotal: totalsForOption.areaBreakdown.exterior.subtotal,
  }
}), [optionTotals, options])
```

- [ ] **Step 5: Update option panel header total**

In `components/quote-form/quote-options-panel.tsx`, extend `QuoteOptionTotals`:

```typescript
interface QuoteOptionTotals {
  results: FormulaResult[]
  subtotal: string
  finalTotal: string
  materialTotal: string
  workingDays: string
  labourPerDay: string
}
```

Render `totals.subtotal` in the collapsed option header:

```tsx
<span className="font-mono text-sm font-bold text-slate-950">${totals.subtotal}</span>
```

Add a screen-reader-safe label nearby:

```tsx
<span className="text-xs font-medium text-slate-500">Ex GST</span>
```

- [ ] **Step 6: Use saved option subtotal on detail page**

In `components/quote-detail/quote-detail-view.tsx`, change `optionSummaries`:

```typescript
const optionSummaries = quote.options.map((option) => ({
  id: option.id,
  title: option.title,
  subtotal: new Decimal(option.subtotal),
  finalTotal: new Decimal(option.finalTotal),
}))
```

- [ ] **Step 7: Run UI tests**

Run:

```bash
npm.cmd run test:run -- tests/quote-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/quote-form/option-totals-summary.tsx components/quote-form/quote-options-panel.tsx components/quote-form/quote-form.tsx components/quote-detail/quote-detail-view.tsx tests/quote-ui.test.tsx
git commit -m "Show option subtotals ex GST"
```

---

### Task 4: Add Fast Product / Service Sorting Controls

**Files:**
- Modify: `components/quote-form/jobber-product-service-editor.tsx`
- Test: `tests/jobber-product-service-editor.test.tsx`

- [ ] **Step 1: Write failing tests for move helpers**

Add tests to `tests/jobber-product-service-editor.test.tsx`:

```typescript
import {
  moveJobberQuoteLine,
  reorderJobberQuoteLines,
} from '@/components/quote-form/jobber-product-service-editor'

it('moves line items to top, up, down, and bottom without mutating the original list', () => {
  const threeLines = [
    ...lines,
    {
      id: 'line-2',
      kind: 'line_item',
      name: 'Final total',
      description: '',
      quantity: '1',
      unitPrice: '1000.00',
      taxable: true,
      clientVisible: true,
    },
  ] satisfies JobberQuoteLineItemDraft[]

  expect(moveJobberQuoteLine(threeLines, 'line-2', 'top').map((line) => line.id)).toEqual(['line-2', 'line-1', 'text-1'])
  expect(moveJobberQuoteLine(threeLines, 'line-2', 'up').map((line) => line.id)).toEqual(['line-1', 'line-2', 'text-1'])
  expect(moveJobberQuoteLine(threeLines, 'line-1', 'down').map((line) => line.id)).toEqual(['text-1', 'line-1', 'line-2'])
  expect(moveJobberQuoteLine(threeLines, 'line-1', 'bottom').map((line) => line.id)).toEqual(['text-1', 'line-2', 'line-1'])
  expect(threeLines.map((line) => line.id)).toEqual(['line-1', 'text-1', 'line-2'])
})

it('renders fast sort controls for each Product Service row', () => {
  const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
    value: lines,
    saveMode: 'priced_line_items',
    onChange: () => undefined,
    onSaveModeChange: () => undefined,
  }))

  expect(markup).toContain('Move Exterior repaint to top')
  expect(markup).toContain('Move Exterior repaint down')
  expect(markup).toContain('Move Access notes to bottom')
})
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```bash
npm.cmd run test:run -- tests/jobber-product-service-editor.test.tsx
```

Expected: FAIL because `moveJobberQuoteLine` and controls do not exist.

- [ ] **Step 3: Add move helper**

In `components/quote-form/jobber-product-service-editor.tsx`, add:

```typescript
type MoveDirection = 'top' | 'up' | 'down' | 'bottom'

export function moveJobberQuoteLine(
  lines: JobberQuoteLineItemDraft[],
  lineId: string,
  direction: MoveDirection
): JobberQuoteLineItemDraft[] {
  const currentIndex = lines.findIndex((line) => line.id === lineId)
  if (currentIndex < 0) return lines

  const lastIndex = lines.length - 1
  const nextIndex = direction === 'top'
    ? 0
    : direction === 'bottom'
      ? lastIndex
      : direction === 'up'
        ? Math.max(currentIndex - 1, 0)
        : Math.min(currentIndex + 1, lastIndex)

  if (nextIndex === currentIndex) return lines

  const nextLines = [...lines]
  const [line] = nextLines.splice(currentIndex, 1)
  nextLines.splice(nextIndex, 0, line)
  return nextLines
}
```

- [ ] **Step 4: Add shared sort controls component**

In the same file, add:

```tsx
interface SortControlsProps {
  line: JobberQuoteLineItemDraft
  index: number
  total: number
  onMove: (lineId: string, direction: MoveDirection) => void
}

function SortControls({ line, index, total, onMove }: SortControlsProps) {
  const label = line.name || (line.kind === 'text' ? 'text line' : 'line item')

  return (
    <div className="grid grid-cols-2 gap-1" aria-label={`Sort controls for ${label}`}>
      <button type="button" disabled={index === 0} onClick={() => onMove(line.id, 'top')} aria-label={`Move ${label} to top`} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500 disabled:opacity-40">Top</button>
      <button type="button" disabled={index === 0} onClick={() => onMove(line.id, 'up')} aria-label={`Move ${label} up`} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500 disabled:opacity-40">Up</button>
      <button type="button" disabled={index === total - 1} onClick={() => onMove(line.id, 'down')} aria-label={`Move ${label} down`} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500 disabled:opacity-40">Down</button>
      <button type="button" disabled={index === total - 1} onClick={() => onMove(line.id, 'bottom')} aria-label={`Move ${label} to bottom`} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500 disabled:opacity-40">Bottom</button>
    </div>
  )
}
```

- [ ] **Step 5: Wire controls into rows**

In `JobberProductServiceEditor`, add:

```typescript
function moveLine(lineId: string, direction: MoveDirection) {
  onChange(moveJobberQuoteLine(value, lineId, direction))
}
```

When mapping rows, include `index`:

```typescript
{value.map((line, index) => {
```

Pass `sortControls` into both row components:

```tsx
sortControls={<SortControls line={line} index={index} total={value.length} onMove={moveLine} />}
```

Add `sortControls: ReactNode` to both row prop interfaces and render it under the drag handle:

```tsx
<div className="flex shrink-0 flex-col gap-2">
  <button ...>::</button>
  {sortControls}
</div>
```

Also import `type ReactNode` from React:

```typescript
import { useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm.cmd run test:run -- tests/jobber-product-service-editor.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/quote-form/jobber-product-service-editor.tsx tests/jobber-product-service-editor.test.tsx
git commit -m "Add fast quote line sorting controls"
```

---

### Task 5: Convert Quote Form to Scrollable Workspace

**Files:**
- Modify: `components/quote-form/quote-form.tsx`
- Modify: `components/quote-form/jobber-product-service-editor.tsx`
- Modify: `components/quote-form/materials-panel.tsx`
- Modify: `components/quote-form/quote-options-panel.tsx`
- Test: `tests/quote-ui.test.tsx`

- [ ] **Step 1: Write failing layout test**

Add this test to `tests/quote-ui.test.tsx`:

```typescript
it('renders the quote editor in the original two-column page-scroll layout', () => {
  const markup = renderToStaticMarkup(
    createElement(QuoteForm, {
      settings: quoteRecord.pricingSettingsSnapshot,
      areas: [],
      productServices: [],
      quoteLineTemplates: [],
      initialQuote: quoteRecord,
    })
  )

  expect(markup).toContain('grid gap-6 xl:grid-cols-[minmax(0,1.06fr)_minmax(360px,0.94fr)]')
  expect(markup).toContain('product-service-scroll-list')
  expect(markup).not.toContain('quote-workspace')
  expect(markup).not.toContain('quote-scroll-section')
  expect(markup).toContain('xl:sticky')
  expect(markup).toContain('xl:top-24')
})
```

- [ ] **Step 2: Run the UI test and verify it fails**

Run:

```bash
npm.cmd run test:run -- tests/quote-ui.test.tsx
```

Expected: FAIL because the original page-scroll layout and Product / Service internal row-list scroll do not exist.

- [ ] **Step 3: Update the main quote form layout**

In `components/quote-form/quote-form.tsx`, keep the original page wrapper:

```tsx
<main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
```

Keep the original two-column content grid:

```tsx
<div className="grid gap-6 xl:grid-cols-[minmax(0,1.06fr)_minmax(360px,0.94fr)]">
```

Place all input sections in the left panel in this order:

```tsx
<div className="space-y-8 rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)]">
  <CustomerPanel ... />
  <JobberProductServiceEditor ... />
  <MaterialsPanel ... />
  <QuoteOptionsPanel ... />
  <QuoteMemosPanel ... />
</div>

<aside className="space-y-6 rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)] xl:sticky xl:top-24 xl:self-start">
  ...
</aside>
```

Keep the existing sticky save action bar above the editor. Do not add `overflow-y-auto` or `max-h` to the overall editor layout or Calculation aside.

In `components/quote-form/jobber-product-service-editor.tsx`, wrap only the row list:

```tsx
<div className="product-service-scroll-list max-h-[30rem] space-y-3 overflow-y-auto pr-1">
  {value.map(...)}
</div>
```

- [ ] **Step 4: Reduce duplicate section top borders inside scroll panels**

In `components/quote-form/jobber-product-service-editor.tsx`, change:

```tsx
<section className="space-y-4 border-t border-slate-100 pt-6">
```

to:

```tsx
<section className="space-y-4">
```

In `components/quote-form/quote-options-panel.tsx`, change:

```tsx
<section className="space-y-4 border-t border-slate-100 pt-6">
```

to:

```tsx
<section className="mt-6 space-y-4 border-t border-slate-100 pt-6">
```

- [ ] **Step 5: Run UI tests**

Run:

```bash
npm.cmd run test:run -- tests/quote-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/quote-form/quote-form.tsx components/quote-form/jobber-product-service-editor.tsx components/quote-form/quote-options-panel.tsx tests/quote-ui.test.tsx
git commit -m "Reflow quote editor into scrollable workspace"
```

---

### Task 6: Add Collapsible App Sidebar

**Files:**
- Modify: `components/layout/app-header.tsx`
- Modify: `app/(app)/layout.tsx`
- Test: add a new test block in `tests/quote-ui.test.tsx` or create `tests/app-header-ui.test.tsx`

- [ ] **Step 1: Write failing server-render test for sidebar toggle markup**

Create `tests/app-header-ui.test.tsx`:

```typescript
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppHeader } from '@/components/layout/app-header'

vi.mock('next/navigation', () => ({
  usePathname: () => '/quotes/new',
}))

vi.mock('@/lib/actions/auth', () => ({
  signOut: vi.fn(),
}))

describe('AppHeader', () => {
  it('renders a collapsible desktop sidebar toggle', () => {
    const markup = renderToStaticMarkup(createElement(AppHeader, {
      userProfile: {
        displayName: 'PBC User',
        email: 'user@example.com',
      },
    }))

    expect(markup).toContain('Toggle sidebar')
    expect(markup).toContain('data-sidebar-state')
    expect(markup).toContain('Overview')
    expect(markup).toContain('New Quote')
    expect(markup).toContain('Settings')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm.cmd run test:run -- tests/app-header-ui.test.tsx
```

Expected: FAIL because there is no toggle markup.

- [ ] **Step 3: Add collapsed state and localStorage preference**

In `components/layout/app-header.tsx`, import `useEffect`:

```typescript
import { useEffect, useState } from 'react'
```

Add state inside `AppHeader`:

```typescript
const [isCollapsed, setIsCollapsed] = useState(false)

useEffect(() => {
  const stored = window.localStorage.getItem('pbc-sidebar-collapsed')
  setIsCollapsed(stored === 'true')
}, [])

useEffect(() => {
  document.documentElement.style.setProperty('--app-sidebar-width', isCollapsed ? '4.5rem' : '16rem')
  window.localStorage.setItem('pbc-sidebar-collapsed', String(isCollapsed))
}, [isCollapsed])
```

- [ ] **Step 4: Update sidebar classes and toggle**

Change the desktop aside class to:

```tsx
<aside
  data-sidebar-state={isCollapsed ? 'collapsed' : 'expanded'}
  className={`fixed inset-y-0 left-0 z-40 hidden border-r border-white/80 bg-white/75 px-4 py-5 shadow-[12px_0_45px_rgb(37_77_128_/_8%)] backdrop-blur transition-[width] lg:block ${isCollapsed ? 'w-[4.5rem]' : 'w-64'}`}
>
```

Add a toggle button near the logo:

```tsx
<button
  type="button"
  onClick={() => setIsCollapsed((current) => !current)}
  aria-label="Toggle sidebar"
  className="mt-4 grid h-9 w-9 place-items-center rounded-lg border border-[var(--border)] bg-white text-sm font-bold text-slate-500 hover:text-slate-950"
>
  {isCollapsed ? '>' : '<'}
</button>
```

Hide labels when collapsed:

```tsx
{isCollapsed ? <span className="sr-only">{item.label}</span> : item.label}
```

Add `title={item.label}` to each nav link.

- [ ] **Step 5: Update app layout padding**

In `app/(app)/layout.tsx`, change:

```tsx
<div className="min-h-screen bg-[var(--background)] text-slate-900 lg:pl-64">
```

to:

```tsx
<div className="min-h-screen bg-[var(--background)] text-slate-900 lg:pl-[var(--app-sidebar-width,16rem)]">
```

- [ ] **Step 6: Run app header test**

Run:

```bash
npm.cmd run test:run -- tests/app-header-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/layout/app-header.tsx "app/(app)/layout.tsx" tests/app-header-ui.test.tsx
git commit -m "Add collapsible app sidebar"
```

---

### Task 7: Update Documentation

**Files:**
- Modify: `docs/CALCULATION.md`
- Modify: `docs/CALCULATION-API.md`
- Modify: `docs/UI-QUOTE-FORM.md`
- Modify: `docs/UI-DESIGN.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DB-SCHEMA.md`
- Modify: `docs/AGENT-MAP.md`
- Modify: `PROGRESS.md`

- [ ] **Step 1: Update calculation docs**

In `docs/CALCULATION.md`, add a section after "Subtotal & final quote calculation":

```markdown
### Interior / Exterior grouped subtotals

The stored quote subtotal remains the overall calculator subtotal. The quote form and quote detail pages also derive display-only grouped subtotals from material row area snapshots:

- Interior subtotal: rows where `area_scope_snapshot = 'interior'`
- Exterior subtotal: rows where `area_scope_snapshot = 'exterior'`
- Final subtotal: Interior subtotal + Exterior subtotal

Rows without an Interior or Exterior scope are shown as unassigned and excluded from grouped subtotals until assigned. This is a UI calculation only and does not require new DB columns.
```

Add this sentence to the option paragraph:

```markdown
Option summary UI displays `quote_options.subtotal` (ex GST). `quote_options.final_total` remains stored as GST-inclusive for audit consistency.
```

- [ ] **Step 2: Update UI docs**

In `docs/UI-QUOTE-FORM.md`, add a "2026-05-27 workspace update" section:

```markdown
## 2026-05-27 Workspace update

- `/quotes/new` and `/quotes/[id]/edit` use a desktop workspace layout with independently scrollable sections.
- The summary shows Interior subtotal, Exterior subtotal, and Final subtotal, all ex GST.
- Optional add-ons display subtotal ex GST and remain separate from the main quote total.
- Product / Service line items keep drag sorting and add Top/Up/Down/Bottom controls for long line lists.
- Unassigned material rows are allowed but are excluded from grouped Interior/Exterior subtotals and shown as a warning.
```

In `docs/UI-DESIGN.md`, update App Shell:

```markdown
### Collapsible desktop sidebar

Desktop app navigation uses a left sidebar with Overview, New Quote, and Settings. The sidebar can collapse to an icon rail and stores the preference in localStorage. Mobile keeps the compact top navigation.
```

- [ ] **Step 3: Update architecture and schema docs**

In `docs/ARCHITECTURE.md`, add:

```markdown
Area subtotal grouping is derived from existing `quote_items.area_scope_snapshot` and `quote_option_items.area_scope_snapshot` values. No schema change is required for grouped Interior/Exterior display totals.
```

In `docs/DB-SCHEMA.md`, add:

```markdown
Interior/Exterior grouped totals are not stored as columns. They are derived from saved item area snapshots when rendering quote forms and detail pages.
```

- [ ] **Step 4: Update progress and agent map**

In `docs/AGENT-MAP.md`, add the new spec and plan rows under workflow files.

In `PROGRESS.md`, add a 2026-05-27 entry noting the design and plan documents were added before implementation.

- [ ] **Step 5: Run Markdown self-review**

Read the new spec, this implementation plan, and every doc changed by this task. Confirm that each requirement has an implementation task, that file names match existing project paths, and that the new docs do not contain unresolved placeholder language. Existing historical backlog references outside changed sections may remain.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-05-27-quote-workspace-area-subtotals-design.md docs/superpowers/plans/2026-05-27-quote-workspace-area-subtotals.md docs/CALCULATION.md docs/CALCULATION-API.md docs/UI-QUOTE-FORM.md docs/UI-DESIGN.md docs/ARCHITECTURE.md docs/DB-SCHEMA.md docs/AGENT-MAP.md PROGRESS.md
git commit -m "Document quote workspace area subtotal plan"
```

---

### Task 8: Final Verification

**Files:**
- All files changed in Tasks 1-7.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm.cmd run test:run -- tests/quote-calculation-totals.test.ts tests/quote-ui.test.tsx tests/jobber-product-service-editor.test.tsx tests/app-header-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm.cmd run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm.cmd run lint
```

Expected: PASS.

- [ ] **Step 4: Run full unit test suite**

Run:

```bash
npm.cmd run test:run
```

Expected: PASS, with the existing skipped tests unchanged.

- [ ] **Step 5: Run build**

Run:

```bash
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 6: Browser QA**

Start the dev server:

```bash
npm.cmd run dev -- --port 3000
```

Open `http://localhost:3000/quotes/new` and verify:

- Sidebar toggles between expanded and collapsed.
- Quote editor uses the original two-column page-scroll layout, with internal scrolling only in the Product / Service row list.
- Materials with Interior and Exterior areas show separate subtotal rows.
- Materials and the right Calculation panel show Interior/Exterior Working Days and Labour Days from assigned material rows.
- Unassigned material rows show a warning.
- Option summary values are ex GST.
- Product / Service rows can be moved Top, Up, Down, and Bottom, and the row list auto-scrolls while dragging near its top or bottom edge.
- Save/Update button remains reachable.

- [ ] **Step 7: Commit verification fixes if needed**

If verification required code changes:

```bash
git add <changed-files>
git commit -m "Fix quote workspace verification issues"
```
