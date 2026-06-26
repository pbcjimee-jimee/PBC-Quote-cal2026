import { describe, expect, it, beforeEach } from 'vitest'
import {
  createDevQuote,
  deleteDevQuote,
  createDevArea,
  getDevQuote,
  listDevAreas,
  listDevProducts,
  listDevQuotes,
  resetDevData,
  searchDevProducts,
  updateDevQuote,
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
      jobberSnapshot: {
        jobberQuoteId: 'encoded-quote-id',
        sourceType: 'quote',
        quoteNumber: '2345',
        createdAt: '2026-05-13T01:23:45Z',
        customerName: 'Smith Family',
        customerAddress: '123 Main St',
        workType: 'Exterior',
        areaSqft: null,
        customerType: 'Real Estate',
        sourceUrl: 'https://secure.getjobber.com/quotes/2345',
        productsAndServices: [
          {
            id: 'line-item-1',
            name: 'Exterior repaint',
            category: 'SERVICE',
            description: 'Walls and trim',
            quantity: 1,
            unitPrice: 2500,
            totalPrice: 2500,
            linkedName: null,
          },
        ],
        jobExpenses: [
          {
            jobId: 'job-id-1',
            jobNumber: 6789,
            jobTitle: 'Exterior repaint job',
            jobStatus: 'ACTIVE',
            jobUrl: 'https://secure.getjobber.com/jobs/6789',
            expenses: [
              {
                id: 'expense-id-1',
                title: 'Paint supplies',
                description: 'Primer',
                date: '2026-05-14T00:00:00Z',
                total: 245.5,
                enteredBy: 'Admin User',
                paidBy: 'Painter One',
                reimbursableTo: null,
              },
            ],
          },
        ],
        jobExpensesError: null,
        financialSummary: {
          quoteTotal: 2500,
          expensesTotal: 245.5,
          profit: 2254.5,
          profitMarginPercent: 90.2,
        },
      },
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

    expect(quote.labourPerDay).toBe('10.00')
    expect(quote.formula1Total).toBe('5342.50')
    expect(quote.formula4Total).toBe('5409.17')
    expect(quote.subtotal).toBe('5375.83')
    expect(quote.finalTotal).toBe('5913.42')
    expect(quote.pricingSettingsSnapshot).toEqual(DEFAULT_PRICING_SETTINGS)
    expect(getDevQuote(quote.id)?.items[0].productNameSnapshot).toBe('Dulux Exterior')
    expect(getDevQuote(quote.id)?.items[0].areaNameSnapshot).toBe('Eaves')
    expect(getDevQuote(quote.id)?.items[0].workingDays).toBe('5.00')
    expect(getDevQuote(quote.id)?.items[0].labourPerDay).toBe('2.00')
    expect(getDevQuote(quote.id)?.jobberSnapshot?.productsAndServices[0].name).toBe('Exterior repaint')
    expect(getDevQuote(quote.id)?.jobberSnapshot?.jobExpenses[0].expenses[0].title).toBe('Paint supplies')
  })

  it('uses main row labour days for formula totals while saving displayed labour column totals', () => {
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
    expect(quote.labourPerDay).toBe('4.00')
    expect(quote.formula1Total).toBe('2000.00')
    expect(quote.items[0].workingDays).toBe('2.00')
    expect(quote.items[0].labourPerDay).toBe('1.00')
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

  it('updates an existing quote and replaces its saved material items', () => {
    const quote = createDevQuote({
      customerName: 'Before Customer',
      customerAddress: '1 Before St',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 25,
      materialActual: 25,
      selectedMin: 1,
      selectedMax: 1,
      items: [
        {
          productNameSnapshot: 'Old item',
          marketPriceSnapshot: 25,
          actualPriceSnapshot: 25,
          quantity: 1,
          isCustom: true,
          position: 0,
        },
      ],
    })

    const updated = updateDevQuote(quote.id, {
      customerName: 'After Customer',
      customerAddress: '2 After St',
      workingDays: 2,
      labourPerDay: 2,
      materialMarket: 80,
      materialActual: 80,
      selectedMin: 4,
      selectedMax: 1,
      items: [
        {
          productNameSnapshot: 'New item',
          marketPriceSnapshot: 40,
          actualPriceSnapshot: 40,
          quantity: 2,
          isCustom: true,
          position: 0,
        },
      ],
    })

    expect(updated?.id).toBe(quote.id)
    expect(getDevQuote(quote.id)?.customerName).toBe('After Customer')
    expect(getDevQuote(quote.id)?.items).toHaveLength(1)
    expect(getDevQuote(quote.id)?.items[0].productNameSnapshot).toBe('New item')
  })

  it('stores roof formula selections in dev quote records', () => {
    const quote = createDevQuote({
      customerName: 'Roof Dev Customer',
      workingDays: 0,
      labourPerDay: 0,
      materialMarket: 120,
      materialActual: 120,
      selectedMin: 4,
      selectedMax: 1,
      areaFormulaSelections: {
        interior: { selectedMin: 4, selectedMax: 1 },
        exterior: { selectedMin: 4, selectedMax: 1 },
        roof: { selectedMin: 2, selectedMax: 5 },
      },
      items: [
        {
          productNameSnapshot: 'Roof membrane',
          marketPriceSnapshot: 120,
          actualPriceSnapshot: 120,
          quantity: 1,
          workingDays: 2,
          labourPerDay: 1,
          areaScopeSnapshot: 'roof',
          isCustom: true,
          position: 0,
        },
      ],
    })

    expect(quote.selectedMin).toBe(4)
    expect(quote.selectedMax).toBe(1)
    expect(quote.roofSelectedMin).toBe(2)
    expect(quote.roofSelectedMax).toBe(5)
    expect(getDevQuote(quote.id)?.roofSelectedMin).toBe(2)
    expect(getDevQuote(quote.id)?.roofSelectedMax).toBe(5)
  })

  it('deletes an existing quote', () => {
    const quote = createDevQuote({
      customerName: 'Delete Me',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 0,
      materialActual: 0,
      selectedMin: 1,
      selectedMax: 1,
      items: [],
    })

    expect(deleteDevQuote(quote.id)).toBe(true)
    expect(getDevQuote(quote.id)).toBeNull()
    expect(listDevQuotes()).toHaveLength(0)
  })
})
