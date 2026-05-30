import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import {
  calculateAreaSubtotalBreakdown,
  calculateMainQuoteTotals,
} from '@/components/quote-form/quote-calculation-totals'

const areaSubtotalMaterials = [
  {
    id: 'interior-row',
    name: 'Interior wall paint',
    marketPrice: '100',
    actualPrice: '80',
    quantity: '1',
    workingDays: '2',
    labourPerDay: '1',
    areaScope: 'interior' as const,
    isCustom: true,
  },
  {
    id: 'exterior-row',
    name: 'Exterior trim paint',
    marketPrice: '200',
    actualPrice: '160',
    quantity: '1',
    workingDays: '3',
    labourPerDay: '1',
    areaScope: 'exterior' as const,
    isCustom: true,
  },
  {
    id: 'unassigned-row',
    name: 'Unassigned primer',
    marketPrice: '50',
    actualPrice: '40',
    quantity: '1',
    workingDays: '1',
    labourPerDay: '1',
    isCustom: true,
  },
]

describe('quote calculation totals', () => {
  it('calculates interior and exterior subtotals separately and excludes unassigned rows', () => {
    const breakdown = calculateAreaSubtotalBreakdown({
      materials: areaSubtotalMaterials,
      selectedMin: 1,
      selectedMax: 1,
      settings: DEFAULT_PRICING_SETTINGS,
    })

    expect(breakdown.interior.subtotal.toFixed(2)).toBe('1100.00')
    expect(breakdown.exterior.subtotal.toFixed(2)).toBe('1700.00')
    expect(breakdown.finalSubtotal.toFixed(2)).toBe('2800.00')
    expect(breakdown.unassigned.materialMarket.toFixed(2)).toBe('50.00')
    expect(breakdown.unassigned.count).toBe(1)
  })

  it('uses separate formula selections for interior and exterior subtotals', () => {
    const totals = calculateMainQuoteTotals({
      materials: areaSubtotalMaterials,
      selectedMin: 1,
      selectedMax: 1,
      areaFormulaSelections: {
        interior: { selectedMin: 5, selectedMax: 5 },
        exterior: { selectedMin: 1, selectedMax: 1 },
      },
      settings: DEFAULT_PRICING_SETTINGS,
    })

    expect(totals.areaBreakdown.interior.selectedMin).toBe(5)
    expect(totals.areaBreakdown.interior.selectedMax).toBe(5)
    expect(totals.areaBreakdown.interior.subtotal.toFixed(2)).toBe('1118.00')
    expect(totals.areaBreakdown.exterior.subtotal.toFixed(2)).toBe('1700.00')
    expect(totals.areaBreakdown.finalSubtotal.toFixed(2)).toBe('2818.00')
  })

  it('keeps the existing overall main subtotal and includes area breakdown', () => {
    const totals = calculateMainQuoteTotals({
      materials: areaSubtotalMaterials,
      selectedMin: 1,
      selectedMax: 1,
      settings: DEFAULT_PRICING_SETTINGS,
    })

    expect(totals.subtotal).toBeInstanceOf(Decimal)
    expect(totals.subtotal.toFixed(2)).toBe('3350.00')
    expect(totals.areaBreakdown.interior.subtotal.toFixed(2)).toBe('1100.00')
    expect(totals.areaBreakdown.exterior.subtotal.toFixed(2)).toBe('1700.00')
    expect(totals.areaBreakdown.finalSubtotal.toFixed(2)).toBe('2800.00')
  })

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
