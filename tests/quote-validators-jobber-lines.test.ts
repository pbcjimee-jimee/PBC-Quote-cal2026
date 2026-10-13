import { describe, expect, it } from 'vitest'
import { jobberQuoteLineSchema, jobberSaveModeSchema, quoteSchema, paintComparisonSchema } from '@/lib/validators'

describe('Jobber quote line validators', () => {
  const base = { workingDays: 0, labourPerDay: 0, materialMarket: 10, materialActual: 10,
    selectedMin: 1, selectedMax: 1, items: [{ logicalKey: '00000000-0000-4000-8000-000000000201',
      timberRole: 'shared', productNameSnapshot: 'Prep', marketPriceSnapshot: 10,
      actualPriceSnapshot: 10, quantity: 1, areaId: 'area-1', areaScopeSnapshot: 'interior' }] }
  const comparison = { version: 1, key: '00000000-0000-4000-8000-000000000401', alternatives: [] }
  it.each([{ mode: 'inherit', value: '' }, { mode: 'override', value: '0.333' }])('retains remembered Aqua input $mode/$value without normalizing dormant strings', (field) => {
    const input = { ...comparison, alternatives: [{ targetLogicalKey: base.items[0].logicalKey,
      previousRole: 'finish', acknowledgedSourceProductId: null,
      quantity: field, workingDays: { mode: 'inherit', value: '0' }, labourPerDay: { mode: 'inherit', value: '0' } }] }
    const parsed = paintComparisonSchema.safeParse(input)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.alternatives[0].quantity).toEqual(field)
    expect(paintComparisonSchema.safeParse({ ...input, alternatives: [{ ...input.alternatives[0], quantity: { ...field, value: '0'.repeat(101) } }] }).success).toBe(false)
  })
  it('keeps comparison drafts but blocks timber outside Interior and option timber markers', () => {
    expect(quoteSchema.safeParse({ ...base, paintComparisons: [comparison] }).success).toBe(true)
    expect(quoteSchema.safeParse({ ...base, paintComparisons: [comparison],
      items: [{ ...base.items[0], areaScopeSnapshot: 'roof' }] }).success).toBe(false)
    expect(quoteSchema.safeParse({ ...base, options: [{ title: 'Normal option', selectedMin: 1,
      selectedMax: 1, items: base.items }] }).success).toBe(false)
  })
  it('rejects duplicate logical keys and extra decimal precision in compared materials', () => {
    expect(quoteSchema.safeParse({ ...base, items: [base.items[0], base.items[0]] }).success).toBe(false)
    expect(quoteSchema.safeParse({ ...base, paintComparisons: [comparison],
      items: [{ ...base.items[0], quantity: 0.333 }] }).success).toBe(false)
    expect(quoteSchema.safeParse({ ...base, items: [{ ...base.items[0], timberRole: 'none', quantity: 0.333 }] }).success).toBe(true)
  })
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

  it('rejects invalid save modes while accepting signed public discounts', () => {
    expect(jobberSaveModeSchema.safeParse('material_breakdown')).toMatchObject({ success: false })
    expect(jobberQuoteLineSchema.safeParse({
      kind: 'line_item',
      name: 'Bad line',
      quantity: 1,
      unitPrice: -1,
    })).toMatchObject({ success: true })
  })

  it('preserves unknown optional observations and explicit write policies', () => {
    expect(jobberQuoteLineSchema.parse({ kind: 'line_item', name: 'Discount', quantity: 1,
      unitPrice: -150, optional: null, recommended: null, selected: null,
      optionalWritePolicy: 'set_true', recommendedWritePolicy: 'preserve',
      paintComparisonKey: '00000000-0000-4000-8000-000000000401',
    })).toMatchObject({ optional: null, recommended: null, selected: null,
      optionalWritePolicy: 'set_true', recommendedWritePolicy: 'preserve',
      paintComparisonKey: '00000000-0000-4000-8000-000000000401' })
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
