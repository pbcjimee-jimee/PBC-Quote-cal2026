import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { createQuote, deleteQuote, getQuote, updateQuote } from '@/lib/actions/quotes'
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
      workingDays: 3,
      labourPerDay: 3,
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
      expect(fetched.data.labourPerDay).toBe('3.00')
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
})
