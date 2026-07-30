import { describe, expect, it } from 'vitest'
import {
  calculateFinancialSummary,
  calculateFinancialSummaryFromAmounts,
} from '@/lib/jobber/financial-summary'

describe('Jobber financial summary', () => {
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
