import { describe, expect, it } from 'vitest'
import { jobberQuoteLineSchema, jobberSaveModeSchema, quoteSchema } from '@/lib/validators'

describe('Jobber quote line validators', () => {
  it('accepts priced public line items and applies public visibility defaults', () => {
    const parsed = jobberQuoteLineSchema.parse({
      kind: 'line_item',
      name: 'Exterior painting labour',
      quantity: 2,
      unitPrice: 1250,
      position: 1,
    })

    expect(parsed).toMatchObject({
      kind: 'line_item',
      name: 'Exterior painting labour',
      quantity: 2,
      unitPrice: 1250,
      taxable: true,
      clientVisible: true,
      position: 1,
    })
  })

  it('accepts public text lines without price fields', () => {
    const parsed = jobberQuoteLineSchema.parse({
      kind: 'text',
      name: 'Scope notes',
      description: 'Includes prep and two finish coats.',
    })

    expect(parsed.quantity).toBeUndefined()
    expect(parsed.unitPrice).toBeUndefined()
  })

  it('accepts public line descriptions up to the Product Service catalog limit', () => {
    const parsed = jobberQuoteLineSchema.parse({
      kind: 'text',
      name: 'Long public terms',
      description: 'a'.repeat(4000),
    })

    expect(parsed.description).toHaveLength(4000)
  })

  it('rejects public line descriptions over the Product Service catalog limit', () => {
    const parsed = jobberQuoteLineSchema.safeParse({
      kind: 'text',
      name: 'Too long public terms',
      description: 'a'.repeat(4001),
    })

    expect(parsed).toMatchObject({ success: false })
  })

  it('rejects invalid save modes and negative public prices', () => {
    expect(jobberSaveModeSchema.safeParse('material_breakdown')).toMatchObject({ success: false })
    expect(jobberQuoteLineSchema.safeParse({
      kind: 'line_item',
      name: 'Bad line',
      quantity: 1,
      unitPrice: -1,
    })).toMatchObject({ success: false })
  })

  it('allows quote inputs to include Jobber save mode and public lines', () => {
    const parsed = quoteSchema.parse({
      customerName: 'Jobber Customer',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 10,
      materialActual: 10,
      selectedMin: 1,
      selectedMax: 1,
      items: [],
      jobberSaveMode: 'priced_line_items',
      jobberQuoteLines: [
        {
          kind: 'line_item',
          name: 'Public labour',
          quantity: 1,
          unitPrice: 500,
        },
      ],
    })

    expect(parsed.jobberSaveMode).toBe('priced_line_items')
    expect(parsed.jobberQuoteLines).toHaveLength(1)
  })

  it('accepts material memos up to 4000 characters and rejects longer memos', () => {
    const quote = {
      customerName: 'Memo Customer',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 10,
      materialActual: 8,
      selectedMin: 1,
      selectedMax: 1,
      items: [{
        productNameSnapshot: 'Paint',
        marketPriceSnapshot: 10,
        actualPriceSnapshot: 8,
        quantity: 1,
        isCustom: true,
        position: 0,
      }],
    }

    const accepted = quoteSchema.safeParse({
      ...quote,
      items: [{ ...quote.items[0], memo: 'a'.repeat(4000) }],
    })
    const rejected = quoteSchema.safeParse({
      ...quote,
      items: [{ ...quote.items[0], memo: 'a'.repeat(4001) }],
    })

    expect(accepted).toMatchObject({ success: true })
    if (accepted.success) expect(accepted.data.items[0]).toHaveProperty('memo', 'a'.repeat(4000))
    expect(rejected).toMatchObject({ success: false })
  })

  it('accepts Supabase offset timestamps for saved Jobber refresh metadata', () => {
    const parsed = quoteSchema.parse({
      customerName: 'Jobber Customer',
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 10,
      materialActual: 10,
      selectedMin: 1,
      selectedMax: 1,
      items: [],
      jobberSnapshotRefreshedAt: '2026-06-30T00:53:00+00:00',
    })

    expect(parsed.jobberSnapshotRefreshedAt).toBe('2026-06-30T00:53:00+00:00')
  })
})
