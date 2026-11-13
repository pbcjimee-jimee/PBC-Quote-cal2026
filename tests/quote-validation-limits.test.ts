import { describe, expect, it } from 'vitest'
import { formatQuoteValidationError, jobberQuoteLineSchema, quoteSchema } from '@/lib/validators'

const material = { productNameSnapshot: 'Paint', marketPriceSnapshot: 10, actualPriceSnapshot: 8, quantity: 1, workingDays: 1, labourPerDay: 1 }
const quote = { workingDays: 1, labourPerDay: 1, materialMarket: 10, materialActual: 8, selectedMin: 1, selectedMax: 1, items: [material] }
const materialLimits = [
  ['marketPriceSnapshot', 99999999.99, 'Market price must be 99,999,999.99 or less.'],
  ['actualPriceSnapshot', 99999999.99, 'Actual price must be 99,999,999.99 or less.'],
  ['quantity', 99999999.99, 'Quantity must be 99,999,999.99 or less.'],
  ['workingDays', 999.99, 'Working days must be 999.99 or less.'],
  ['labourPerDay', 999.99, 'Labour per day must be 999.99 or less.'],
] as const

describe('quote input limits', () => {
  describe.each(['main', 'option'])('%s materials', section => {
    it.each(materialLimits)('accepts %s at its limit and explains values above it', (field, limit, message) => {
      const input = (value: number) => section === 'main'
        ? { ...quote, items: [{ ...material, [field]: value }] }
        : { ...quote, options: [{ title: 'Extra', selectedMin: 1, selectedMax: 1, items: [{ ...material, [field]: value }] }] }
      expect(quoteSchema.safeParse(input(limit)).success).toBe(true)
      expect(quoteSchema.safeParse(input(limit + 0.01))).toMatchObject({ success: false, error: { issues: [{ message }] } })
    })
  })

  it.each([
    ['workingDays', 999.99, 'Total working days must be 999.99 or less.'],
    ['labourPerDay', 999.99, 'Total labour days must be 999.99 or less.'],
    ['materialMarket', 99999999.99, 'Material market total must be 99,999,999.99 or less.'],
    ['materialActual', 99999999.99, 'Material actual total must be 99,999,999.99 or less.'],
  ] as const)('bounds quote-level %s', (field, limit, message) => {
    expect(quoteSchema.safeParse({ ...quote, [field]: limit }).success).toBe(true)
    expect(quoteSchema.safeParse({ ...quote, [field]: limit + 0.01 })).toMatchObject({ success: false, error: { issues: [{ message }] } })
  })

  it.each([
    ['workingDays', -1, 'Total working days must be 0 or more.'],
    ['labourPerDay', -1, 'Total labour days must be 0 or more.'],
    ['workingDays', 'bad', 'Enter valid total working days.'],
    ['labourPerDay', 'bad', 'Enter valid total labour days.'],
  ] as const)('gives a readable quote-level %s error', (field, value, message) => {
    expect(quoteSchema.safeParse({ ...quote, [field]: value })).toMatchObject({ success: false, error: { issues: [{ message }] } })
  })

  it('bounds public quantity while preserving the allowed zero quantity', () => {
    const line = { kind: 'line_item', name: 'Painting', unitPrice: 1 }
    for (const quantity of [0, 99999999.99]) expect(jobberQuoteLineSchema.safeParse({ ...line, quantity }).success).toBe(true)
    expect(jobberQuoteLineSchema.safeParse({ ...line, quantity: 100000000 })).toMatchObject({ success: false, error: { issues: [{ message: 'Quantity must be 99,999,999.99 or less.' }] } })
  })

  it.each([
    ['productNameSnapshot', '', 'Enter a material name.'],
    ['quantity', 0, 'Quantity must be greater than 0.'],
    ['quantity', 'bad', 'Enter a valid quantity.'],
    ['marketPriceSnapshot', -1, 'Market price must be 0 or more.'],
    ['actualPriceSnapshot', -1, 'Actual price must be 0 or more.'],
    ['workingDays', -1, 'Working days must be 0 or more.'],
    ['labourPerDay', -1, 'Labour per day must be 0 or more.'],
    ['memo', 'x'.repeat(4001), 'Material memo must be 4000 characters or fewer.'],
  ] as const)('gives a readable material %s error', (field, value, message) => {
    expect(quoteSchema.safeParse({ ...quote, items: [{ ...material, [field]: value }] })).toMatchObject({ success: false, error: { issues: [{ message }] } })
  })

  it.each([
    ['name', '', 'Enter a line name.'],
    ['name', 'x'.repeat(201), 'Line name must be 200 characters or fewer.'],
    ['description', 'x'.repeat(4001), 'Line description must be 4000 characters or fewer.'],
    ['quantity', -1, 'Quantity must be 0 or more.'],
    ['quantity', undefined, 'Enter a line quantity.'],
    ['unitPrice', undefined, 'Enter a line unit price.'],
    ['unitPrice', -100000000, 'Unit price must be -99,999,999.99 or more.'],
    ['unitPrice', 100000000, 'Unit price must be 99,999,999.99 or less.'],
    ['totalPrice', -100000000, 'Line total must be -99,999,999.99 or more.'],
    ['totalPrice', 100000000, 'Line total must be 99,999,999.99 or less.'],
  ] as const)('gives a readable public %s error', (field, value, message) => {
    expect(jobberQuoteLineSchema.safeParse({ kind: 'line_item', name: 'Painting', quantity: 1, unitPrice: 1, [field]: value })).toMatchObject({ success: false, error: { issues: [{ message }] } })
  })

  it('keeps unrelated area and ordinary stored precision rules unchanged', () => {
    expect(quoteSchema.safeParse({ ...quote, areaSqft: 100000000, items: [{ ...material, quantity: 1.234 }] }).success).toBe(true)
  })
})

describe('formatQuoteValidationError', () => {
  it.each([
    [{ workingDays: -1 }, 'Check the quote values: Total working days must be 0 or more.'],
    [{ workingDays: -1, labourPerDay: -1, materialMarket: -1 }, 'Check the quote values: Total working days must be 0 or more. (+2 more)'],
    [{ items: [{ ...material, quantity: 0 }] }, 'Check the quote values: Quantity must be greater than 0.'],
  ])('summarizes issues without JSON or paths', (invalid, expected) => {
    const result = quoteSchema.safeParse({ ...quote, ...invalid })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected invalid quote')
    const message = formatQuoteValidationError(result.error)
    expect(message).toBe(expected)
    expect(message).not.toMatch(/[\[\]{}]|"path"|items\.0/)
  })
})
