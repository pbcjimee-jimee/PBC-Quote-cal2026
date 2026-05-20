import Decimal from 'decimal.js'
import {
  calculateAllFormulas,
  calculateFinal,
  calculateSubtotal,
  type FormulaResult,
  type PricingSettings,
} from '@/lib/calculator'
import { calculateLabourTotals, decimalFromInput, type LabourTotals } from '@/lib/quote-labour'
import type { FormulaNumber, MaterialItem } from './types'

interface MainQuoteTotalsInput {
  materials: MaterialItem[]
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  settings: PricingSettings
}

export interface MainQuoteTotals {
  materialMarket: Decimal
  materialActual: Decimal
  materialLabour: LabourTotals
  totalWorkingDays: Decimal
  totalLabourPerDay: Decimal
  totalLabourDays: Decimal
  results: FormulaResult[]
  subtotal: Decimal
  subtotalLabour: Decimal
  finalTotal: Decimal
}

export function calculateMainQuoteTotals({
  materials,
  selectedMin,
  selectedMax,
  settings,
}: MainQuoteTotalsInput): MainQuoteTotals {
  const materialMarket = materials.reduce(
    (total, item) => total.add(decimalFromInput(item.marketPrice).mul(decimalFromInput(item.quantity))),
    new Decimal(0)
  )
  const materialActual = materialMarket
  const materialLabour = calculateLabourTotals(materials)
  const results = calculateAllFormulas(
    {
      workingDays: materialLabour.labourDays,
      labourPerDay: 1,
      materialMarket,
      materialActual,
    },
    settings
  )
  const subtotal = calculateSubtotal(results, selectedMin, selectedMax)
  const finalTotal = calculateFinal(subtotal)
  const subtotalLabour = Decimal.max(subtotal.sub(materialMarket), 0)

  return {
    materialMarket,
    materialActual,
    materialLabour,
    totalWorkingDays: materialLabour.workingDays,
    totalLabourPerDay: materialLabour.labourDays,
    totalLabourDays: materialLabour.labourDays,
    results,
    subtotal,
    subtotalLabour,
    finalTotal,
  }
}
