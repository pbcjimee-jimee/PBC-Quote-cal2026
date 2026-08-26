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
