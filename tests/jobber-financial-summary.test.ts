import { describe, expect, it } from 'vitest'
import {
  calculateEstimatedProfit,
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
