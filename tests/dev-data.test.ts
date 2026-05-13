import { describe, expect, it, beforeEach } from 'vitest'
import {
  createDevQuote,
  createDevArea,
  getDevQuote,
  listDevAreas,
  listDevProducts,
  listDevQuotes,
  resetDevData,
  searchDevProducts,
  updateDevPricingSettings,
} from '@/lib/dev-data'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

beforeEach(() => {
  resetDevData()
})

describe('dev data store', () => {
  it('searches active products by name or metadata', () => {
    expect(searchDevProducts('primer').length).toBeGreaterThan(1)
    expect(searchDevProducts('dulux').length).toBeGreaterThan(3)
    expect(searchDevProducts('missing')).toEqual([])
  })

  it('loads all Dulux paint rows with RRP fallback and searchable material fields', () => {
    const products = listDevProducts()

    expect(products).toHaveLength(102)
    expect(products[0]).toMatchObject({
      manufacturer: 'Dulux',
      type: 'Acratex Acrashield Low Gloss',
      unit: '15L',
      marketPrice: '305.21',
      actualPrice: '305.21',
      base: 'Deep Base',
      sheen: 'Low Gloss',
      volumeLitres: '15',
    })

    const fallback = products.find((product) => product.productCode === '194292')
    expect(fallback?.marketPrice).toBe('242.95')
    expect(fallback?.actualPrice).toBe('242.95')

    expect(searchDevProducts('Monument')[0].base).toBe('Monument')
    expect(searchDevProducts('Semi Gloss').some((product) => product.sheen === 'Semi Gloss')).toBe(true)
    expect(searchDevProducts('monument roof').some((product) => product.name.includes('Monument'))).toBe(true)
  })

  it('creates selectable quote areas by scope', () => {
    const area = createDevArea({ scope: 'exterior', name: 'Eaves' })

    expect(area).toMatchObject({ scope: 'exterior', name: 'Eaves', active: true })
    expect(listDevAreas().some((item) => item.name === 'Eaves')).toBe(true)
  })

  it('creates a quote with formula totals and snapshots', () => {
    const quote = createDevQuote({
      customerName: 'Smith Family',
      customerAddress: '123 Main St',
      workingDays: 5,
      labourPerDay: 2,
      materialMarket: 342.5,
      materialActual: 245,
      selectedMin: 4,
      selectedMax: 1,
      items: [
        {
          productNameSnapshot: 'Dulux Exterior',
          marketPriceSnapshot: 171.25,
          actualPriceSnapshot: 122.5,
          quantity: 2,
          workingDays: 5,
          labourPerDay: 2,
          areaId: 'area-eaves',
          areaNameSnapshot: 'Eaves',
          areaScopeSnapshot: 'exterior',
          isCustom: false,
          position: 0,
        },
      ],
    })

    expect(quote.labourPerDay).toBe('2.00')
    expect(quote.formula1Total).toBe('5342.50')
    expect(quote.formula4Total).toBe('5056.25')
    expect(quote.subtotal).toBe('5199.38')
    expect(quote.finalTotal).toBe('5199.38')
    expect(quote.pricingSettingsSnapshot).toEqual(DEFAULT_PRICING_SETTINGS)
    expect(getDevQuote(quote.id)?.items[0].productNameSnapshot).toBe('Dulux Exterior')
    expect(getDevQuote(quote.id)?.items[0].areaNameSnapshot).toBe('Eaves')
    expect(getDevQuote(quote.id)?.items[0].workingDays).toBe('5.00')
    expect(getDevQuote(quote.id)?.items[0].labourPerDay).toBe('2.00')
  })

  it('uses summed item labour days for formula totals while saving visible field totals', () => {
    const quote = createDevQuote({
      workingDays: 3,
      labourPerDay: 3,
      materialMarket: 0,
      materialActual: 0,
      selectedMin: 1,
      selectedMax: 1,
      items: [
        {
          productNameSnapshot: 'Eaves labour',
          marketPriceSnapshot: 0,
          actualPriceSnapshot: 0,
          quantity: 1,
          workingDays: 2,
          labourPerDay: 1,
          isCustom: true,
          position: 0,
        },
        {
          productNameSnapshot: 'Fascia labour',
          marketPriceSnapshot: 0,
          actualPriceSnapshot: 0,
          quantity: 1,
          workingDays: 1,
          labourPerDay: 2,
          isCustom: true,
          position: 1,
        },
      ],
    })

    expect(quote.workingDays).toBe('3.00')
    expect(quote.labourPerDay).toBe('3.00')
    expect(quote.formula1Total).toBe('2000.00')
  })

  it('lists newest quotes first and filters by customer or address', () => {
    const first = createDevQuote({
      customerName: 'Alpha',
      customerAddress: '1 First St',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 0,
      materialActual: 0,
      selectedMin: 1,
      selectedMax: 1,
      items: [],
    })
    const second = createDevQuote({
      customerName: 'Beta',
      customerAddress: '2 Second St',
      workingDays: 2,
      labourPerDay: 1,
      materialMarket: 0,
      materialActual: 0,
      selectedMin: 1,
      selectedMax: 1,
      items: [],
    })

    expect(listDevQuotes().map((quote) => quote.id)).toEqual([second.id, first.id])
    expect(listDevQuotes('first')).toHaveLength(1)
    expect(listDevQuotes('beta')[0].customerName).toBe('Beta')
  })

  it('uses updated pricing settings for future quotes only', () => {
    updateDevPricingSettings({
      ...DEFAULT_PRICING_SETTINGS,
      f1LabourRate: 600,
    })

    const quote = createDevQuote({
      workingDays: 2,
      labourPerDay: 2,
      materialMarket: 50,
      materialActual: 40,
      selectedMin: 1,
      selectedMax: 1,
      items: [],
    })

    expect(quote.formula1Total).toBe('2450.00')
    expect(quote.pricingSettingsSnapshot.f1LabourRate).toBe(600)
  })
})
