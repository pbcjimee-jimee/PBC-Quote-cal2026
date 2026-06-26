import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { createQuote, deleteQuote, duplicateQuote, getQuote, retryJobberQuoteSync, updateQuote } from '@/lib/actions/quotes'
import { createProduct, updateProduct } from '@/lib/actions/products'
import { resetDevData } from '@/lib/dev-data'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('quote actions', () => {
  beforeEach(() => {
    resetDevData()
    vi.mocked(revalidatePath).mockClear()
  })

  it('updates a saved quote through the action layer', async () => {
    const created = await createQuote({
      customerName: 'Before Customer',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 10,
      materialActual: 10,
      selectedMin: 1,
      selectedMax: 1,
      items: [],
    })
    if (!created.ok) throw new Error(created.error)

    const updated = await updateQuote({
      id: created.data.id,
      customerName: 'After Customer',
      customerAddress: '2 After St',
      workingDays: 2,
      labourPerDay: 2,
      materialMarket: 60,
      materialActual: 60,
      selectedMin: 4,
      selectedMax: 1,
      items: [
        {
          productNameSnapshot: 'Updated material',
          marketPriceSnapshot: 30,
          actualPriceSnapshot: 30,
          quantity: 2,
          isCustom: true,
          position: 0,
        },
      ],
    })

    expect(updated.ok).toBe(true)
    const fetched = await getQuote(created.data.id)
    expect(fetched.ok).toBe(true)
    if (fetched.ok && fetched.data) {
      expect(fetched.data.customerName).toBe('After Customer')
      expect(fetched.data.items[0].productNameSnapshot).toBe('Updated material')
    }
    expect(revalidatePath).toHaveBeenCalledWith('/quotes')
    expect(revalidatePath).toHaveBeenCalledWith(`/quotes/${created.data.id}`)
  })

  it('stores optional quote add-ons separately from the main quote total', async () => {
    const created = await createQuote({
      customerName: 'Options Customer',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 100,
      materialActual: 100,
      selectedMin: 1,
      selectedMax: 1,
      items: [],
      options: [
        {
          title: 'Option 1 - Garage door repaint',
          selectedMin: 1,
          selectedMax: 1,
          items: [
            {
              productNameSnapshot: 'Garage paint',
              marketPriceSnapshot: 50,
              actualPriceSnapshot: 50,
              quantity: 1,
              workingDays: 1,
              labourPerDay: 1,
              isCustom: true,
              position: 0,
            },
          ],
          position: 0,
        },
      ],
    })
    if (!created.ok) throw new Error(created.error)

    const fetched = await getQuote(created.data.id)

    expect(fetched.ok).toBe(true)
    if (fetched.ok && fetched.data) {
      expect(fetched.data.finalTotal).toBe('660.00')
      expect(fetched.data.options).toHaveLength(1)
      expect(fetched.data.options[0].title).toBe('Option 1 - Garage door repaint')
      expect(fetched.data.options[0].finalTotal).toBe('605.00')
      expect(fetched.data.options[0].items[0].productNameSnapshot).toBe('Garage paint')
    }
  })

  it('stores area-specific formula selections and sums area subtotals for the main final subtotal', async () => {
    const created = await createQuote({
      customerName: 'Area Formula Customer',
      workingDays: 0,
      labourPerDay: 0,
      materialMarket: 300,
      materialActual: 300,
      selectedMin: 1,
      selectedMax: 1,
      areaFormulaSelections: {
        interior: { selectedMin: 5, selectedMax: 5 },
        exterior: { selectedMin: 1, selectedMax: 1 },
        roof: { selectedMin: 1, selectedMax: 1 },
      },
      items: [
        {
          productNameSnapshot: 'Interior wall paint',
          marketPriceSnapshot: 100,
          actualPriceSnapshot: 100,
          quantity: 1,
          workingDays: 2,
          labourPerDay: 1,
          areaScopeSnapshot: 'interior',
          isCustom: true,
          position: 0,
        },
        {
          productNameSnapshot: 'Exterior trim paint',
          marketPriceSnapshot: 200,
          actualPriceSnapshot: 200,
          quantity: 1,
          workingDays: 3,
          labourPerDay: 1,
          areaScopeSnapshot: 'exterior',
          isCustom: true,
          position: 1,
        },
      ],
    })
    if (!created.ok) throw new Error(created.error)

    const fetched = await getQuote(created.data.id)

    expect(fetched.ok).toBe(true)
    if (fetched.ok && fetched.data) {
      expect(fetched.data.interiorSelectedMin).toBe(5)
      expect(fetched.data.interiorSelectedMax).toBe(5)
      expect(fetched.data.exteriorSelectedMin).toBe(1)
      expect(fetched.data.exteriorSelectedMax).toBe(1)
      expect(fetched.data.subtotal).toBe('2928.57')
      expect(fetched.data.finalTotal).toBe('3221.43')
    }
  })

  it('persists roof formula selections separately from the legacy quote selection', async () => {
    const created = await createQuote({
      customerName: 'Roof Formula Customer',
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
    if (!created.ok) throw new Error(created.error)

    let fetched = await getQuote(created.data.id)

    expect(fetched.ok).toBe(true)
    if (fetched.ok && fetched.data) {
      expect(fetched.data.selectedMin).toBe(4)
      expect(fetched.data.selectedMax).toBe(1)
      expect(fetched.data.roofSelectedMin).toBe(2)
      expect(fetched.data.roofSelectedMax).toBe(5)
      expect(fetched.data.subtotal).toBe('2145.71')
      expect(fetched.data.finalTotal).toBe('2360.29')
    }

    const updated = await updateQuote({
      id: created.data.id,
      customerName: 'Roof Formula Customer',
      workingDays: 0,
      labourPerDay: 0,
      materialMarket: 120,
      materialActual: 120,
      selectedMin: 4,
      selectedMax: 1,
      areaFormulaSelections: {
        interior: { selectedMin: 4, selectedMax: 1 },
        exterior: { selectedMin: 4, selectedMax: 1 },
        roof: { selectedMin: 3, selectedMax: 3 },
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

    expect(updated.ok).toBe(true)
    fetched = await getQuote(created.data.id)
    expect(fetched.ok).toBe(true)
    if (fetched.ok && fetched.data) {
      expect(fetched.data.roofSelectedMin).toBe(3)
      expect(fetched.data.roofSelectedMax).toBe(3)
      expect(fetched.data.subtotal).toBe('2171.43')
      expect(fetched.data.finalTotal).toBe('2388.57')
    }
  })

  it('duplicates a quote without Jobber links and refreshes product material prices from current RRP', async () => {
    const product = await createProduct({
      name: 'Duplicate refresh paint',
      manufacturer: 'PBC',
      productLine: 'Interior Paint',
      unit: '4L',
      rrpPrice: 100,
    })
    if (!product.ok) throw new Error(product.error)

    const source = await createQuote({
      customerName: 'Duplicate Customer',
      customerAddress: '11 Copy Lane',
      jobberQuoteId: 'jobber-quote-123',
      jobberSnapshot: {
        jobberQuoteId: 'jobber-quote-123',
        sourceType: 'quote',
        quoteNumber: 'Q123',
        createdAt: '2026-06-26T00:00:00.000Z',
        customerName: 'Duplicate Customer',
        customerAddress: '11 Copy Lane',
        workType: 'Roof',
        areaSqft: 500,
        customerType: 'Residential',
        sourceUrl: 'https://secure.getjobber.com/quotes/Q123',
        productsAndServices: [],
        jobExpenses: [],
        jobExpensesError: null,
        financialSummary: {
          quoteTotal: 1500,
          expensesTotal: 0,
          profit: 1500,
          profitMarginPercent: 100,
        },
      },
      jobberSaveMode: 'priced_line_items',
      jobberQuoteLines: [
        {
          kind: 'line_item',
          name: 'Public painting line',
          description: 'Copied without Jobber id',
          quantity: 1,
          unitPrice: 900,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'jobber-line-visible',
          linkedProductOrServiceId: 'catalog-service-1',
          position: 0,
        },
        {
          kind: 'line_item',
          name: 'Deleted Jobber line',
          quantity: 1,
          unitPrice: 100,
          taxable: true,
          clientVisible: false,
          jobberLineItemId: 'jobber-line-deleted',
          position: 1,
        },
      ],
      areaSqft: 500,
      workType: 'Roof',
      workingDays: 0,
      labourPerDay: 0,
      materialMarket: 50,
      materialActual: 50,
      selectedMin: 4,
      selectedMax: 1,
      areaFormulaSelections: {
        interior: { selectedMin: 4, selectedMax: 1 },
        exterior: { selectedMin: 4, selectedMax: 1 },
        roof: { selectedMin: 2, selectedMax: 5 },
      },
      items: [
        {
          productId: product.data.id,
          productNameSnapshot: 'Old duplicate paint name',
          marketPriceSnapshot: 50,
          actualPriceSnapshot: 50,
          quantity: 2,
          workingDays: 2,
          labourPerDay: 1,
          areaNameSnapshot: 'Roof',
          areaScopeSnapshot: 'roof',
          isCustom: false,
          position: 0,
        },
      ],
      options: [
        {
          title: 'Option 1 - Fascia',
          selectedMin: 1,
          selectedMax: 1,
          items: [
            {
              productId: product.data.id,
              productNameSnapshot: 'Old option paint name',
              marketPriceSnapshot: 25,
              actualPriceSnapshot: 25,
              quantity: 1,
              workingDays: 1,
              labourPerDay: 1,
              areaScopeSnapshot: 'exterior',
              isCustom: false,
              position: 0,
            },
          ],
          position: 0,
        },
      ],
      memos: [{ body: 'Keep this internal memo.', position: 0 }],
    })
    if (!source.ok) throw new Error(source.error)

    const updatedProduct = await updateProduct({
      id: product.data.id,
      rrpPrice: 150,
    })
    if (!updatedProduct.ok) throw new Error(updatedProduct.error)

    const duplicated = await duplicateQuote(source.data.id)
    expect(duplicated.ok).toBe(true)
    if (!duplicated.ok) throw new Error(duplicated.error)
    expect(duplicated.data.id).not.toBe(source.data.id)

    const copied = await getQuote(duplicated.data.id)
    expect(copied.ok).toBe(true)
    if (copied.ok && copied.data) {
      expect(copied.data.customerName).toBe('Duplicate Customer')
      expect(copied.data.customerAddress).toBe('11 Copy Lane')
      expect(copied.data.workType).toBe('Roof')
      expect(copied.data.jobberQuoteId).toBeNull()
      expect(copied.data.jobberSnapshot).toBeNull()
      expect(copied.data.jobberSyncStatus).toBe('not_synced')
      expect(copied.data.roofSelectedMin).toBe(2)
      expect(copied.data.roofSelectedMax).toBe(5)
      expect(copied.data.items[0]).toEqual(expect.objectContaining({
        productId: product.data.id,
        productNameSnapshot: 'Duplicate refresh paint',
        marketPriceSnapshot: '150.00',
        actualPriceSnapshot: '150.00',
        quantity: '2.00',
        areaNameSnapshot: 'Roof',
        areaScopeSnapshot: 'roof',
      }))
      expect(copied.data.options[0].items[0]).toEqual(expect.objectContaining({
        productId: product.data.id,
        productNameSnapshot: 'Duplicate refresh paint',
        marketPriceSnapshot: '150.00',
        actualPriceSnapshot: '150.00',
      }))
      expect(copied.data.jobberQuoteLines).toHaveLength(1)
      expect(copied.data.jobberQuoteLines[0]).toEqual(expect.objectContaining({
        name: 'Public painting line',
        jobberLineItemId: null,
        linkedProductOrServiceId: 'catalog-service-1',
        clientVisible: true,
      }))
      expect(copied.data.jobberQuoteLines.map((line) => line.jobberLineItemId)).not.toContain('jobber-line-deleted')
      expect(copied.data.memos[0].body).toBe('Keep this internal memo.')
    }
  })

  it('stores multiple app-only internal memos with the quote', async () => {
    const created = await createQuote({
      customerName: 'Memo Customer',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 10,
      materialActual: 10,
      selectedMin: 1,
      selectedMax: 1,
      items: [],
      memos: [
        { body: '  Call before arriving.  ', position: 1 },
        { body: 'Use side gate access.', position: 0 },
      ],
    })
    if (!created.ok) throw new Error(created.error)

    const fetched = await getQuote(created.data.id)

    expect(fetched.ok).toBe(true)
    if (fetched.ok && fetched.data) {
      expect(fetched.data.memos.map((memo) => memo.body)).toEqual([
        'Use side gate access.',
        'Call before arriving.',
      ])
      expect(fetched.data.jobberQuoteLines).toHaveLength(0)
    }
  })

  it('stores public Jobber lines separately from internal material rows', async () => {
    const created = await createQuote({
      customerName: 'Jobber Line Customer',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 80,
      materialActual: 50,
      selectedMin: 1,
      selectedMax: 1,
      items: [
        {
          productNameSnapshot: 'Internal paint material',
          marketPriceSnapshot: 80,
          actualPriceSnapshot: 50,
          quantity: 1,
          isCustom: true,
          position: 0,
        },
      ],
      jobberSaveMode: 'priced_line_items',
      jobberQuoteLines: [
        {
          kind: 'line_item',
          name: 'Exterior painting',
          description: 'Public service line',
          quantity: 2,
          unitPrice: 1250,
          taxable: true,
          clientVisible: true,
          linkedProductOrServiceId: 'jobber-product-1',
          position: 0,
        },
        {
          kind: 'text',
          name: 'Scope notes',
          description: 'Materials are tracked internally only.',
          taxable: false,
          clientVisible: true,
          position: 1,
        },
      ],
    })
    if (!created.ok) throw new Error(created.error)

    const fetched = await getQuote(created.data.id)

    expect(fetched.ok).toBe(true)
    if (fetched.ok && fetched.data) {
      expect(fetched.data.items).toHaveLength(1)
      expect(fetched.data.items[0].productNameSnapshot).toBe('Internal paint material')
      expect(fetched.data.jobberSaveMode).toBe('priced_line_items')
      expect(fetched.data.jobberQuoteLines.map((line) => line.name)).toEqual(['Exterior painting', 'Scope notes'])
      expect(fetched.data.jobberQuoteLines[0].totalPrice).toBe('2500.00')
      expect(fetched.data.jobberQuoteLines[0]).not.toHaveProperty('actualPriceSnapshot')
    }
  })

  it('stores main labour column totals while pricing formulas use summed main row labour days', async () => {
    const created = await createQuote({
      customerName: 'Main Labour Customer',
      workingDays: 999,
      labourPerDay: 999,
      materialMarket: 60,
      materialActual: 60,
      selectedMin: 1,
      selectedMax: 1,
      items: [
        {
          productNameSnapshot: 'Main wall paint',
          marketPriceSnapshot: 40,
          actualPriceSnapshot: 40,
          quantity: 1,
          workingDays: 2,
          labourPerDay: 1,
          isCustom: true,
          position: 0,
        },
        {
          productNameSnapshot: 'Main trim paint',
          marketPriceSnapshot: 20,
          actualPriceSnapshot: 20,
          quantity: 1,
          workingDays: 1,
          labourPerDay: 2,
          isCustom: true,
          position: 1,
        },
      ],
      options: [
        {
          title: 'Option 1 - Excluded labour',
          selectedMin: 1,
          selectedMax: 1,
          items: [
            {
              productNameSnapshot: 'Option paint',
              marketPriceSnapshot: 999,
              actualPriceSnapshot: 999,
              quantity: 1,
              workingDays: 10,
              labourPerDay: 10,
              isCustom: true,
              position: 0,
            },
          ],
          position: 0,
        },
      ],
    })
    if (!created.ok) throw new Error(created.error)

    const fetched = await getQuote(created.data.id)

    expect(fetched.ok).toBe(true)
    if (fetched.ok && fetched.data) {
      expect(fetched.data.workingDays).toBe('3.00')
      expect(fetched.data.labourPerDay).toBe('4.00')
      expect(fetched.data.formula1Total).toBe('2060.00')
      expect(fetched.data.finalTotal).toBe('2266.00')
    }
  })

  it('deletes a saved quote through the action layer', async () => {
    const created = await createQuote({
      customerName: 'Delete Customer',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 0,
      materialActual: 0,
      selectedMin: 1,
      selectedMax: 1,
      items: [],
    })
    if (!created.ok) throw new Error(created.error)

    const deleted = await deleteQuote(created.data.id)

    expect(deleted.ok).toBe(true)
    const fetched = await getQuote(created.data.id)
    expect(fetched.ok).toBe(true)
    if (fetched.ok) expect(fetched.data).toBeNull()
    expect(revalidatePath).toHaveBeenCalledWith('/quotes')
  })

  it('rejects failed Jobber sync retry without a quote id', async () => {
    const result = await retryJobberQuoteSync(' ')

    expect(result).toEqual({ ok: false, error: 'Quote id is required' })
  })
})
