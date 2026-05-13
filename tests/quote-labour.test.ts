import { describe, expect, it } from 'vitest'
import { calculateLabourTotals } from '@/components/quote-form/labour-totals'

describe('quote labour totals', () => {
  it('sums visible working days and labour per day, and calculates labour days per line', () => {
    const totals = calculateLabourTotals([
      { workingDays: '2', labourPerDay: '1' },
      { workingDays: '1', labourPerDay: '2' },
    ])

    expect(totals.workingDays.toFixed(2)).toBe('3.00')
    expect(totals.labourPerDay.toFixed(2)).toBe('3.00')
    expect(totals.labourDays.toFixed(2)).toBe('4.00')
  })
})
