# Main Price Lines to Option Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an estimator copy the current visible priced `Public Product / Service Lines` into a new independent PBC Option while preserving eligible line names, quantities, unit prices, order, and ex-GST subtotal.

**Architecture:** Add a pure client-side conversion module that validates and snapshots the current `JobberQuoteLineItemDraft[]` into a F1-F1, zero-labour `QuoteOptionItem`. `QuoteForm` owns the state transition and passes availability plus a callback to the presentation-only `QuoteOptionsPanel`; existing draft, save payload, RPC, and quote restoration paths persist the resulting ordinary Option unchanged.

**Tech Stack:** TypeScript strict, React 19, Next.js 16 App Router, `decimal.js`, Vitest, React server rendering tests, existing quote form state and save pipeline.

**Spec:** `docs/superpowers/specs/2026-08-26-main-price-lines-to-option-copy-design.md`

## Global Constraints

- Work only on `codex/quote-price-option-copy-plan`; never implement on `main`.
- The source is the current in-form `JobberQuoteLineItemDraft[]` shown by `Public Product / Service Lines`, not internal `quote_items` and not another saved quote.
- Copy only rows where `kind === 'line_item'`, `clientVisible === true`, quantity and unit price are complete non-negative decimals, quantity is greater than zero, and `quantity × unitPrice` is greater than zero.
- Preserve eligible source order, name, positive quantity, and unit price; use a trimmed description and then `Line item N` only as the empty-name fallback.
- Generate fresh `option` and `option-item` IDs; never reuse public-line, Jobber, linked Product / Service, main-material, or saved option-item identity.
- Set copied rows to `marketPrice === actualPrice === source unitPrice`, `workingDays: '0'`, `labourPerDay: '0'`, and `isCustom: true`.
- Set the new Option to `selectedMin: 1`, `selectedMax: 1`, and `isExpanded: true`, and title it with the existing `Option ${current.length + 1}` rule.
- Repeated copies intentionally append distinct independent Options; do not deduplicate, replace, merge, or live-link them.
- Use `decimal.js` for numeric validation and multiplication; do not use native floating-point arithmetic for price calculations.
- Preserve the existing Option GST rule (`finalTotal = subtotal × 1.10`) and keep Options outside the main quote subtotal/final total.
- Do not add a database migration, RPC, Server Action, validator, RLS change, Jobber mutation/write-back change, persisted provenance field, or external dependency.
- Do not copy public text rows, descriptions as public Option content, taxable flags, Jobber IDs, or Product / Service linkage.
- Follow TDD: add each behavior test first, run it, and confirm the expected failure before production code is written.

---

### Task 1: Pure main-price snapshot conversion

**Files:**
- Create: `components/quote-form/main-price-option-copy.ts`
- Create: `tests/main-price-option-copy.test.ts`

**Interfaces:**
- Consumes: `JobberQuoteLineItemDraft`, `QuoteOptionItem`, and `MaterialItem` from `components/quote-form/types.ts`; `Decimal` from `decimal.js`; `calculateQuoteOptionTotals` and `DEFAULT_PRICING_SETTINGS` for behavioral verification only.
- Produces: `hasCopyableMainPriceLines(lines: JobberQuoteLineItemDraft[]): boolean`, `createMainPriceOption(lines: JobberQuoteLineItemDraft[], optionNumber: number, createId: (prefix: string) => string): QuoteOptionItem | null`, and `appendMainPriceOption(options: QuoteOptionItem[], lines: JobberQuoteLineItemDraft[], createId: (prefix: string) => string): QuoteOptionItem[]`.

- [ ] **Step 1: Write the failing conversion and identity tests**

Create `tests/main-price-option-copy.test.ts` with fixtures that exercise real conversion behavior:

```ts
import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import {
  appendMainPriceOption,
  createMainPriceOption,
  hasCopyableMainPriceLines,
} from '@/components/quote-form/main-price-option-copy'
import { calculateQuoteOptionTotals } from '@/components/quote-form/quote-option-totals'
import { buildQuoteSavePayload } from '@/components/quote-form/quote-save-payload'
import type { JobberQuoteLineItemDraft, QuoteOptionItem } from '@/components/quote-form/types'

function line(overrides: Partial<JobberQuoteLineItemDraft> = {}): JobberQuoteLineItemDraft {
  return {
    id: 'public-line-1',
    kind: 'line_item',
    name: 'Interior painting',
    description: 'Walls and ceilings',
    quantity: '2.5',
    unitPrice: '120.40',
    taxable: true,
    clientVisible: true,
    jobberLineItemId: 'jobber-line-1',
    linkedProductOrServiceId: 'service-1',
    ...overrides,
  }
}

function sequentialIds() {
  let sequence = 0
  return (prefix: string) => `${prefix}-${++sequence}`
}

describe('main price option copy', () => {
  it('preserves eligible line order, names, quantities, unit prices, and ex-GST subtotal', () => {
    const source = [
      line(),
      line({ id: 'public-line-2', name: 'Door painting', quantity: '2', unitPrice: '5.00' }),
    ]

    const option = createMainPriceOption(source, 3, sequentialIds())

    expect(option).toEqual({
      id: 'option-1',
      title: 'Option 3',
      selectedMin: 1,
      selectedMax: 1,
      isExpanded: true,
      materials: [
        {
          id: 'option-item-2',
          name: 'Interior painting',
          marketPrice: '120.40',
          actualPrice: '120.40',
          quantity: '2.5',
          workingDays: '0',
          labourPerDay: '0',
          isCustom: true,
        },
        {
          id: 'option-item-3',
          name: 'Door painting',
          marketPrice: '5.00',
          actualPrice: '5.00',
          quantity: '2',
          workingDays: '0',
          labourPerDay: '0',
          isCustom: true,
        },
      ],
    })

    const sourceSubtotal = new Decimal('2.5').mul('120.40').add(new Decimal('2').mul('5.00'))
    const optionSubtotal = calculateQuoteOptionTotals([option!], DEFAULT_PRICING_SETTINGS)[option!.id].subtotal
    expect(sourceSubtotal.toFixed(2)).toBe('311.00')
    expect(optionSubtotal.toFixed(2)).toBe('311.00')
  })

  it('excludes text, hidden, incomplete, invalid, zero-quantity, and zero-total rows', () => {
    const source = [
      line({ id: 'text', kind: 'text', unitPrice: '100' }),
      line({ id: 'hidden', clientVisible: false }),
      line({ id: 'blank', quantity: '' }),
      line({ id: 'partial', unitPrice: '/' }),
      line({ id: 'zero-quantity', quantity: '0' }),
      line({ id: 'zero-total', unitPrice: '0' }),
      line({ id: 'valid', name: 'Valid row', quantity: '1', unitPrice: '45.25' }),
    ]

    expect(hasCopyableMainPriceLines(source)).toBe(true)
    expect(createMainPriceOption(source, 1, sequentialIds())?.materials.map((item) => item.name)).toEqual(['Valid row'])
    expect(hasCopyableMainPriceLines(source.slice(0, -1))).toBe(false)
    expect(createMainPriceOption(source.slice(0, -1), 1, sequentialIds())).toBeNull()
  })

  it('uses safe name fallbacks and creates independent fresh snapshots on repeated copies', () => {
    const source = [
      line({ name: '   ', description: '  Description fallback  ', quantity: '1', unitPrice: '10.10' }),
      line({ id: 'public-line-2', name: '', description: '', quantity: '1', unitPrice: '0.01' }),
    ]
    const original = structuredClone(source)
    const existing: QuoteOptionItem[] = [{
      id: 'existing-option',
      title: 'Option 1',
      materials: [],
      selectedMin: 4,
      selectedMax: 1,
      isExpanded: false,
    }]
    const createId = sequentialIds()

    const first = appendMainPriceOption(existing, source, createId)
    const second = appendMainPriceOption(first, source, createId)

    expect(first).not.toBe(existing)
    expect(first[1].title).toBe('Option 2')
    expect(first[1].materials.map((item) => item.name)).toEqual(['Description fallback', 'Line item 2'])
    expect(second[2].title).toBe('Option 3')
    expect(second[2].id).not.toBe(first[1].id)
    expect(second[2].materials.map((item) => item.id)).not.toEqual(first[1].materials.map((item) => item.id))
    expect(source).toEqual(original)
    expect(first[1].materials[0]).not.toHaveProperty('productId')
    expect(first[1]).not.toHaveProperty('sourceJobberLineItemIds')
  })

  it('serializes a copied option through the existing save contract without Jobber identity', () => {
    const source = [line({ quantity: '2', unitPrice: '99.95' })]
    const option = createMainPriceOption(source, 1, sequentialIds())

    const payload = buildQuoteSavePayload({
      settings: DEFAULT_PRICING_SETTINGS,
      customerName: 'Jane Customer',
      customerAddress: '10 Main St',
      jobberQuoteId: '',
      jobberQuoteLookup: '',
      jobberQuoteDraft: null,
      deletedJobberLineItemIds: [],
      jobberQuoteLines: source,
      workType: 'Interior',
      selectedMin: 4,
      selectedMax: 1,
      areaFormulaSelections: {
        interior: { selectedMin: 4, selectedMax: 1 },
        exterior: { selectedMin: 4, selectedMax: 1 },
        roof: { selectedMin: 4, selectedMax: 1 },
      },
      materials: [],
      options: [option!],
      memos: [],
    })

    expect(payload.options).toEqual([{
      title: 'Option 1',
      selectedMin: 1,
      selectedMax: 1,
      position: 0,
      items: [{
        sourceItemId: 'option-item-2',
        productId: undefined,
        productNameSnapshot: 'Interior painting',
        memo: '',
        marketPriceSnapshot: 99.95,
        actualPriceSnapshot: 99.95,
        quantity: 2,
        workingDays: 0,
        labourPerDay: 0,
        areaId: undefined,
        areaNameSnapshot: undefined,
        areaScopeSnapshot: undefined,
        isCustom: true,
        position: 0,
      }],
    }])
    expect(JSON.stringify(payload.options)).not.toContain('jobber-line-1')
    expect(JSON.stringify(payload.options)).not.toContain('service-1')
  })
})
```

The production break each test catches is respectively: changing the copied price basis/order, admitting a non-copyable row, reusing/linking mutable source identity, or leaking public/Jobber identity through the existing Option save boundary.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```powershell
npm run test:run -- tests/main-price-option-copy.test.ts
```

Expected: FAIL because `@/components/quote-form/main-price-option-copy` does not exist.

- [ ] **Step 3: Implement the minimal pure conversion module**

Create `components/quote-form/main-price-option-copy.ts`:

```ts
import Decimal from 'decimal.js'
import type { JobberQuoteLineItemDraft, MaterialItem, QuoteOptionItem } from './types'

type CreateClientId = (prefix: string) => string

interface CopyableMainPriceLine {
  sourceIndex: number
  name: string
  quantity: string
  unitPrice: string
}

function parseCompleteDecimal(value: string): Decimal | null {
  const text = value.trim()
  if (!/^\d+(?:\.\d*)?$/.test(text)) return null

  try {
    const decimal = new Decimal(text)
    return decimal.isNegative() ? null : decimal
  } catch {
    return null
  }
}

function getCopyableMainPriceLines(lines: JobberQuoteLineItemDraft[]): CopyableMainPriceLine[] {
  const copyable: CopyableMainPriceLine[] = []

  lines.forEach((line, sourceIndex) => {
    if (line.kind !== 'line_item' || line.clientVisible !== true) return

    const quantity = parseCompleteDecimal(line.quantity)
    const unitPrice = parseCompleteDecimal(line.unitPrice)
    if (!quantity || !unitPrice || !quantity.gt(0) || !quantity.mul(unitPrice).gt(0)) return

    copyable.push({
      sourceIndex,
      name: line.name.trim() || line.description.trim() || `Line item ${sourceIndex + 1}`,
      quantity: line.quantity.trim(),
      unitPrice: line.unitPrice.trim(),
    })
  })

  return copyable
}

export function hasCopyableMainPriceLines(lines: JobberQuoteLineItemDraft[]): boolean {
  return getCopyableMainPriceLines(lines).length > 0
}

export function createMainPriceOption(
  lines: JobberQuoteLineItemDraft[],
  optionNumber: number,
  createId: CreateClientId
): QuoteOptionItem | null {
  const copyableLines = getCopyableMainPriceLines(lines)
  if (copyableLines.length === 0) return null

  return {
    id: createId('option'),
    title: `Option ${optionNumber}`,
    selectedMin: 1,
    selectedMax: 1,
    isExpanded: true,
    materials: copyableLines.map((line): MaterialItem => ({
      id: createId('option-item'),
      name: line.name,
      marketPrice: line.unitPrice,
      actualPrice: line.unitPrice,
      quantity: line.quantity,
      workingDays: '0',
      labourPerDay: '0',
      isCustom: true,
    })),
  }
}

export function appendMainPriceOption(
  options: QuoteOptionItem[],
  lines: JobberQuoteLineItemDraft[],
  createId: CreateClientId
): QuoteOptionItem[] {
  const option = createMainPriceOption(lines, options.length + 1, createId)
  return option ? [...options, option] : options
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm run test:run -- tests/main-price-option-copy.test.ts tests/jobber-option-mapping.test.ts tests/quote-calculation-totals.test.ts
```

Expected: all selected suites PASS with no warnings or unhandled errors.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- components/quote-form/main-price-option-copy.ts tests/main-price-option-copy.test.ts
git commit -m "feat: convert main price lines to quote options"
```

---

### Task 2: Quote Form action and Options panel UI

**Files:**
- Modify: `components/quote-form/quote-form.tsx:21-35,572-600,640-652,940-949`
- Modify: `components/quote-form/quote-options-panel.tsx:20-46,52-70`
- Modify: `tests/quote-ui.test.tsx:6-30` and the quote-form UI test section near the existing panel-order and Jobber option-import tests

**Interfaces:**
- Consumes: `appendMainPriceOption` and `hasCopyableMainPriceLines` from Task 1.
- Produces: `QuoteOptionsPanelProps.canCopyMainPrice: boolean`, `QuoteOptionsPanelProps.onCopyMainPrice: () => void`, and a `QuoteForm` handler that appends one independent Option from the latest `jobberQuoteLines` state.

- [ ] **Step 1: Write failing UI availability tests**

Add `QuoteOptionsPanel` to the imports in `tests/quote-ui.test.tsx` and add a small renderer plus two tests:

```tsx
function renderQuoteOptionsPanel(canCopyMainPrice: boolean) {
  return renderToStaticMarkup(
    createElement(QuoteOptionsPanel, {
      options: [],
      optionTotals: {},
      areas: [],
      canCopyMainPrice,
      onCopyMainPrice: () => undefined,
      onAddOption: () => undefined,
      onChangeOption: () => undefined,
      onRemoveOption: () => undefined,
    })
  )
}

it('disables main-price copy when there are no eligible public price lines', () => {
  const markup = renderQuoteOptionsPanel(false)
  const copyButton = markup.match(/<button[^>]*>Copy Main Price to Option<\/button>/)?.[0]

  expect(copyButton).toBeDefined()
  expect(copyButton).toContain('disabled=""')
  expect(copyButton).toContain('title="Add at least one visible priced line first."')
})

it('enables main-price copy when eligible public price lines exist', () => {
  const markup = renderQuoteOptionsPanel(true)
  const copyButton = markup.match(/<button[^>]*>Copy Main Price to Option<\/button>/)?.[0]

  expect(copyButton).toBeDefined()
  expect(copyButton).not.toContain('disabled')
})
```

Add a Quote Form integration assertion using an `initialQuote` with one visible priced `jobberQuoteLines` row:

```tsx
it('enables copying the current quote public price list into an Option', () => {
  const markup = renderToStaticMarkup(createElement(QuoteForm, {
    settings: quoteRecord.pricingSettingsSnapshot,
    areas: [],
    productServices: [],
    quoteLineTemplates: [],
    initialQuote: {
      ...quoteRecord,
      jobberQuoteLines: [{
        id: 'public-line-1',
        quoteId: quoteRecord.id,
        kind: 'line_item',
        name: 'Main painting price',
        description: '',
        quantity: '1.00',
        unitPrice: '1250.00',
        totalPrice: '1250.00',
        taxable: true,
        clientVisible: true,
        jobberLineItemId: null,
        linkedProductOrServiceId: null,
        position: 0,
        createdAt: '2026-08-26T00:00:00.000Z',
        updatedAt: '2026-08-26T00:00:00.000Z',
      }],
    },
  }))
  const copyButton = markup.match(/<button[^>]*>Copy Main Price to Option<\/button>/)?.[0]

  expect(copyButton).toBeDefined()
  expect(copyButton).not.toContain('disabled')
})
```

The production break these tests catch is removing the disabled guard or failing to derive availability from the current Quote Form public-line state.

- [ ] **Step 2: Run the UI tests and verify RED**

Run:

```powershell
npm run test:run -- tests/quote-ui.test.tsx
```

Expected: FAIL because `QuoteOptionsPanel` does not yet render `Copy Main Price to Option` and does not accept the new props.

- [ ] **Step 3: Add the presentation-only copy action**

Extend `QuoteOptionsPanelProps` in `components/quote-form/quote-options-panel.tsx`:

```ts
canCopyMainPrice: boolean
onCopyMainPrice: () => void
```

Destructure both props and replace the single header action with the two-action group:

```tsx
<div className="pbc-panelhead__actions">
  <Button
    type="button"
    onClick={onCopyMainPrice}
    disabled={!canCopyMainPrice}
    title={canCopyMainPrice
      ? 'Create an independent Option from the current visible priced lines.'
      : 'Add at least one visible priced line first.'}
    variant="ghost"
  >
    Copy Main Price to Option
  </Button>
  <Button type="button" onClick={onAddOption} variant="ghost">
    {Icons.plus({ size: 15 })} Add Option
  </Button>
</div>
```

Do not move conversion logic into `QuoteOptionsPanel`.

- [ ] **Step 4: Wire the action to the latest Quote Form state**

Import the Task 1 functions in `components/quote-form/quote-form.tsx`:

```ts
import { appendMainPriceOption, hasCopyableMainPriceLines } from './main-price-option-copy'
```

Derive availability next to the existing option totals:

```ts
const canCopyMainPrice = useMemo(
  () => hasCopyableMainPriceLines(jobberQuoteLines),
  [jobberQuoteLines]
)
```

Add the state transition beside `addOption()`:

```ts
function copyMainPriceToOption() {
  setOptions((current) => appendMainPriceOption(current, jobberQuoteLines, createClientId))
}
```

Pass the two props to `QuoteOptionsPanel`:

```tsx
canCopyMainPrice={canCopyMainPrice}
onCopyMainPrice={copyMainPriceToOption}
```

No other state is changed; existing `currentDraft` persistence observes the updated `options` state automatically.

- [ ] **Step 5: Run focused tests and typecheck**

Run:

```powershell
npm run test:run -- tests/main-price-option-copy.test.ts tests/quote-ui.test.tsx tests/jobber-option-mapping.test.ts tests/material-drag-reorder.test.ts
npm run typecheck
```

Expected: all selected suites and TypeScript compilation PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- components/quote-form/quote-form.tsx components/quote-form/quote-options-panel.tsx tests/quote-ui.test.tsx
git commit -m "feat: copy main price into quote options"
```

---

### Task 3: Documentation and full verification

**Files:**
- Modify: `docs/UI-QUOTE-FORM.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: the reviewed behavior and verification evidence from Tasks 1–2.
- Produces: synchronized feature documentation and full-repository verification evidence.

- [ ] **Step 1: Document the completed workflow**

Update `docs/UI-QUOTE-FORM.md` in the Product / Service and Options behavior sections with these exact facts:

```md
- `Copy Main Price to Option`은 현재 client-visible priced Product / Service 행의 이름·수량·단가를 새 독립 PBC Option으로 복사한다.
- 복사된 행은 custom·zero-labour·F1-F1로 초기화되어 복사 시점의 ex-GST 소계를 유지하며, 원본과 이후 변경을 동기화하지 않는다.
- text/hidden/invalid/zero-total 행과 description·taxable·Jobber/Product Service identity는 복사하지 않는다. 같은 동작을 반복하면 새 Option을 계속 추가한다.
```

Update `docs/ARCHITECTURE.md` in the quote form/client calculation section:

```md
- Main-price-to-Option copy is a client-side snapshot transform from current `jobberQuoteLines` state to ordinary custom `QuoteOptionItem` rows. Existing draft and quote option persistence handles the result; no DB, RPC, RLS, or Jobber write-back path is added.
```

Add a dated `2026-08-26` completed entry near the top of `PROGRESS.md` naming the feature, the no-migration boundary, and the verification commands run. Do not edit `docs/BACKLOG.md` or `docs/DECISIONS.md`.

- [ ] **Step 2: Run full repository verification**

Run:

```powershell
git diff --check
npm run typecheck
npm run lint
npm run test:run
npm run test:coverage
npm run build
```

Expected:

- `git diff --check`: no whitespace errors
- TypeScript: zero errors
- ESLint: zero errors
- Vitest full suite: zero failed tests and no unhandled errors
- Coverage: configured thresholds pass
- Next.js production build: success

- [ ] **Step 3: Commit Task 3**

```powershell
git add -- docs/UI-QUOTE-FORM.md docs/ARCHITECTURE.md PROGRESS.md
git commit -m "docs: document main price option copies"
```

---

## Final Review Checklist

- Confirm every spec requirement maps to Task 1 conversion tests, Task 2 UI/orchestration tests, or Task 3 persistence/docs verification.
- Confirm no plan step adds database, Server Action, validator, Jobber write-back, persisted provenance, or dependency work.
- Confirm the three exported function names and signatures are identical between Tasks 1–3.
- Confirm repeated copy remains intentional and no Jobber option fingerprint/deduplication logic is reused.
- Confirm the final branch diff contains only the approved feature, its tests, its design/plan, and synchronized docs.
