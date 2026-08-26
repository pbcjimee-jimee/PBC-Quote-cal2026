import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import {
  appendMainMaterialsOption,
  createMainMaterialsOption,
  hasCopyableMainMaterials,
} from '@/components/quote-form/main-materials-option-copy'
import { buildQuoteSavePayload } from '@/components/quote-form/quote-save-payload'
import type { MaterialItem, QuoteOptionItem } from '@/components/quote-form/types'

function sequentialIds() {
  let sequence = 0
  return (prefix: string) => `${prefix}-${++sequence}`
}

describe('main materials option copy', () => {
  it('copies every Main Materials field in order while replacing row identities', () => {
    const source: MaterialItem[] = [
      {
        id: 'main-material-1',
        productId: 'product-1',
        name: 'Dulux Weathershield Low Sheen Deep 2L',
        manufacturer: 'Dulux',
        type: 'Paint',
        unit: 'each',
        category: 'Exterior',
        productLine: 'Weathershield',
        base: 'Deep',
        sheen: 'Low Sheen',
        volumeLitres: '2',
        productCode: 'DWS-2L-DEEP',
        memo: 'Keep this quote note',
        marketPrice: '96.79',
        actualPrice: '71.25',
        quantity: '1',
        workingDays: '2.5',
        labourPerDay: '3',
        areaId: 'area-interior-1',
        areaName: 'balustrade',
        areaScope: 'interior',
        isCustom: false,
      },
      {
        id: 'main-material-2',
        name: 'Basic prep material each',
        memo: '',
        marketPrice: '0',
        actualPrice: '0',
        quantity: '1',
        workingDays: '0',
        labourPerDay: '0',
        areaId: 'area-interior-1',
        areaName: 'balustrade',
        areaScope: 'interior',
        isCustom: true,
      },
    ]
    const original = structuredClone(source)
    const option = createMainMaterialsOption(source, 2, sequentialIds())

    expect(option).toEqual({
      id: 'option-1',
      title: 'Option 2',
      selectedMin: 4,
      selectedMax: 1,
      isExpanded: true,
      materials: [
        {
          ...source[0],
          id: 'option-item-2',
        },
        {
          ...source[1],
          id: 'option-item-3',
        },
      ],
    })
    expect(option?.materials[0]).not.toBe(source[0])
    expect(source).toEqual(original)
  })

  it('is available for every non-empty Main Materials list, including a zero-price row', () => {
    const zeroPriceMaterial: MaterialItem = {
      id: 'zero-price-material',
      name: 'Zero-price allowance',
      marketPrice: '0',
      actualPrice: '0',
      quantity: '1',
      workingDays: '0',
      labourPerDay: '0',
      isCustom: true,
    }

    expect(hasCopyableMainMaterials([])).toBe(false)
    expect(hasCopyableMainMaterials([zeroPriceMaterial])).toBe(true)
  })

  it('appends independent Options with fresh Option and material identities on repeated copies', () => {
    const source: MaterialItem[] = [{
      id: 'main-material-1',
      name: 'Main material',
      marketPrice: '120.40',
      actualPrice: '100.00',
      quantity: '2',
      workingDays: '0',
      labourPerDay: '0',
      isCustom: true,
    }]
    const existing: QuoteOptionItem[] = [{
      id: 'existing-option',
      title: 'Option 1',
      materials: [],
      selectedMin: 4,
      selectedMax: 1,
      isExpanded: false,
    }]
    const createId = sequentialIds()

    const first = appendMainMaterialsOption(existing, source, createId)
    const second = appendMainMaterialsOption(first, source, createId)

    expect(first).toHaveLength(2)
    expect(first[1].title).toBe('Option 2')
    expect(second).toHaveLength(3)
    expect(second[2].title).toBe('Option 3')
    expect(second[2].id).not.toBe(first[1].id)
    expect(second[2].materials[0].id).not.toBe(first[1].materials[0].id)
    expect(source[0].id).toBe('main-material-1')
  })

  it('serializes copied fields with a source identity distinct from the Main Material', () => {
    const source: MaterialItem[] = [{
      id: 'main-material-1',
      productId: 'product-1',
      name: 'Main linked material',
      memo: 'Main memo',
      marketPrice: '96.79',
      actualPrice: '71.25',
      quantity: '2',
      workingDays: '1.5',
      labourPerDay: '2',
      areaId: 'area-interior-1',
      areaName: 'balustrade',
      areaScope: 'interior',
      isCustom: false,
    }]
    const option = createMainMaterialsOption(source, 1, sequentialIds())

    const payload = buildQuoteSavePayload({
      settings: DEFAULT_PRICING_SETTINGS,
      customerName: 'Jane Customer',
      customerAddress: '10 Main St',
      jobberQuoteId: '',
      jobberQuoteLookup: '',
      jobberQuoteDraft: null,
      deletedJobberLineItemIds: [],
      jobberQuoteLines: [],
      workType: 'Interior',
      selectedMin: 4,
      selectedMax: 1,
      areaFormulaSelections: {
        interior: { selectedMin: 4, selectedMax: 1 },
        exterior: { selectedMin: 4, selectedMax: 1 },
        roof: { selectedMin: 4, selectedMax: 1 },
      },
      materials: source,
      options: [option!],
      memos: [],
    })

    expect(payload.items[0].sourceItemId).toBe('main-material-1')
    expect(payload.options[0].items[0]).toMatchObject({
      sourceItemId: 'option-item-2',
      productId: 'product-1',
      productNameSnapshot: 'Main linked material',
      memo: 'Main memo',
      marketPriceSnapshot: 96.79,
      actualPriceSnapshot: 71.25,
      quantity: 2,
      workingDays: 1.5,
      labourPerDay: 2,
      areaId: 'area-interior-1',
      areaNameSnapshot: 'balustrade',
      areaScopeSnapshot: 'interior',
      isCustom: false,
    })
    expect(payload.options[0].items[0].sourceItemId).not.toBe(payload.items[0].sourceItemId)
  })
})
