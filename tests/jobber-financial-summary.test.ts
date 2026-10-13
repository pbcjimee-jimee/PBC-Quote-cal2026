import { describe, expect, it } from 'vitest'
import {
  calculateEstimatedProfit,
  calculateFinancialSummary,
  calculateFinancialSummaryFromAmounts,
} from '@/lib/jobber/financial-summary'

describe('Jobber financial summary', () => {
  it.each([
    [false, 100], [true, 85], [null, 100], [undefined, 100],
  ] as const)('includes the Optional discount in quote revenue only when selected is true (%s)', (selected, expected) => {
    expect(calculateFinancialSummary([
      { totalPrice: 100 }, { totalPrice: -15, optional: true, selected, recommended: true },
    ], []).quoteTotal).toBe(expected)
  })

  it('keeps legacy unknown Optional flags in ordinary totals and respects authoritative job totals', () => {
    expect(calculateFinancialSummary([{ totalPrice: 100 }, { totalPrice: 15, selected: false }], []).quoteTotal).toBe(115)
    expect(calculateFinancialSummary([{ totalPrice: 15, optional: true, selected: false }], [], '200').quoteTotal).toBe(200)
  })
  it('uses Decimal arithmetic for job revenue, expenses, profit, and margin', () => {
    expect(calculateFinancialSummaryFromAmounts('12437.02', ['603.89', '890'])).toEqual({
      revenue: '12437.02',
      expensesTotal: '1493.89',
      profit: '10943.13',
      profitMarginPercent: '87.988361',
    })
  })

  it('returns a null margin when revenue is zero', () => {
    expect(calculateFinancialSummaryFromAmounts('0', ['10'])).toEqual({
      revenue: '0',
      expensesTotal: '10',
      profit: '-10',
      profitMarginPercent: null,
    })
  })

  it('calculates estimated profit from revenue and estimated labour only', () => {
    expect(calculateEstimatedProfit('12437.02', '6300')).toEqual({
      profit: '6137.02',
      profitMarginPercent: '49.344779',
    })
  })

  it('returns a null estimated margin when revenue is zero', () => {
    expect(calculateEstimatedProfit('0', '450')).toEqual({
      profit: '-450',
      profitMarginPercent: null,
    })
  })

  it('preserves negative estimated profit and margin', () => {
    expect(calculateEstimatedProfit('450', '900')).toEqual({
      profit: '-450',
      profitMarginPercent: '-100',
    })
  })

  it('keeps the quote mapper summary contract on the shared calculation', () => {
    expect(calculateFinancialSummary(
      [{ totalPrice: 100.1 }, { totalPrice: 20.2 }],
      [{ expenses: [{ total: 10.15 }, { total: null }] }],
    )).toEqual({
      quoteTotal: 120.3,
      expensesTotal: 10.15,
      profit: 110.15,
      profitMarginPercent: 91.6,
    })
  })
})
