import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import { calculateMainQuoteTotals } from '@/components/quote-form/quote-calculation-totals'

describe('quote calculation totals', () => {
  it('uses only main material rows for displayed labour totals and formula labour days', () => {
    const totals = calculateMainQuoteTotals({
      materials: [
        {
          id: 'main-1',
          name: 'Main wall paint',
          marketPrice: '40',
          actualPrice: '40',
          quantity: '1',
          workingDays: '2',
          labourPerDay: '1',
          isCustom: true,
        },
        {
          id: 'main-2',
          name: 'Main trim paint',
          marketPrice: '20',
          actualPrice: '20',
          quantity: '1',
          workingDays: '1',
          labourPerDay: '2',
          isCustom: true,
        },
      ],
      selectedMin: 1,
      selectedMax: 1,
      settings: DEFAULT_PRICING_SETTINGS,
    })

    expect(totals.totalWorkingDays.toFixed(2)).toBe('3.00')
    expect(totals.totalLabourPerDay.toFixed(2)).toBe('4.00')
    expect(totals.totalLabourDays.toFixed(2)).toBe('4.00')
    expect(totals.materialMarket.toFixed(2)).toBe('60.00')
    expect(totals.results[0].total.toFixed(2)).toBe('2060.00')
  })

  it('reports total labour as the sum of each row working days times labour', () => {
    const totals = calculateMainQuoteTotals({
      materials: [
        {
          id: 'main-1',
          name: 'Prep',
          marketPrice: '0',
          actualPrice: '0',
          quantity: '1',
          workingDays: '0.5',
          labourPerDay: '2',
          isCustom: true,
        },
        {
          id: 'main-2',
          name: 'Coat 1',
          marketPrice: '0',
          actualPrice: '0',
          quantity: '1',
          workingDays: '2',
          labourPerDay: '3',
          isCustom: true,
        },
        {
          id: 'main-3',
          name: 'Coat 2',
          marketPrice: '0',
          actualPrice: '0',
          quantity: '1',
          workingDays: '2',
          labourPerDay: '2',
          isCustom: true,
        },
        {
          id: 'main-4',
          name: 'Clean up',
          marketPrice: '0',
          actualPrice: '0',
          quantity: '1',
          workingDays: '0.5',
          labourPerDay: '2',
          isCustom: true,
        },
      ],
      selectedMin: 1,
      selectedMax: 1,
      settings: DEFAULT_PRICING_SETTINGS,
    })

    expect(totals.totalWorkingDays.toFixed(2)).toBe('5.00')
    expect(totals.totalLabourPerDay.toFixed(2)).toBe('12.00')
    expect(totals.totalLabourDays.toFixed(2)).toBe('12.00')
  })
})
