import Decimal from 'decimal.js'
import {
  calculateAllFormulas,
  calculateFinal,
  calculateSubtotal,
  type FormulaResult,
  type PricingSettings,
} from '@/lib/calculator'
import { calculateLabourTotals, decimalFromInput, type LabourTotals } from '@/lib/quote-labour'
import { calculateAreaSubtotalBreakdown, type AreaSubtotalBreakdown } from './quote-calculation-totals'
import type { QuoteOptionItem } from './types'

export interface QuoteOptionTotals {
  materialMarket: Decimal
  materialActual: Decimal
  labour: LabourTotals
  results: FormulaResult[]
  subtotal: Decimal
  finalTotal: Decimal
  areaBreakdown: AreaSubtotalBreakdown
}

export function calculateQuoteOptionTotals(
  options: QuoteOptionItem[],
  settings: PricingSettings
): Record<string, QuoteOptionTotals> {
  const calculated: Record<string, QuoteOptionTotals> = {}

  for (const option of options) {
    const materialMarket = option.materials.reduce(
      (total, item) => total.add(decimalFromInput(item.marketPrice).mul(decimalFromInput(item.quantity))),
      new Decimal(0)
    )
    const materialActual = option.materials.reduce(
      (total, item) => total.add(decimalFromInput(item.actualPrice).mul(decimalFromInput(item.quantity))),
      new Decimal(0)
    )
    const labour = calculateLabourTotals(option.materials)
    const results = calculateAllFormulas(
      {
        workingDays: labour.labourDays,
        labourPerDay: 1,
        materialMarket,
        materialActual,
      },
      settings
    )
    const subtotal = calculateSubtotal(results, option.selectedMin, option.selectedMax)
    const areaBreakdown = calculateAreaSubtotalBreakdown({
      materials: option.materials,
      selectedMin: option.selectedMin,
      selectedMax: option.selectedMax,
      settings,
    })

    calculated[option.id] = {
      materialMarket,
      materialActual,
      labour,
      results,
      subtotal,
      finalTotal: calculateFinal(subtotal),
      areaBreakdown,
    }
  }

  return calculated
}
