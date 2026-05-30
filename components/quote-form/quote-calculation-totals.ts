import Decimal from 'decimal.js'
import {
  calculateAllFormulas,
  calculateFinal,
  calculateSubtotal,
  type FormulaResult,
  type PricingSettings,
} from '@/lib/calculator'
import { calculateLabourTotals, decimalFromInput, type LabourTotals } from '@/lib/quote-labour'
import type { AreaFormulaSelections, AreaScope, FormulaNumber, FormulaSelection, MaterialItem } from './types'

interface MainQuoteTotalsInput {
  materials: MaterialItem[]
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  areaFormulaSelections?: AreaFormulaSelections
  settings: PricingSettings
}

interface AreaSubtotalBreakdownInput {
  materials: MaterialItem[]
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  areaFormulaSelections?: AreaFormulaSelections
  settings: PricingSettings
}

export interface AreaSubtotalGroup {
  scope: AreaScope
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  materialMarket: Decimal
  materialActual: Decimal
  labour: LabourTotals
  results: FormulaResult[]
  subtotal: Decimal
  finalTotal: Decimal
}

export interface UnassignedSubtotalGroup {
  count: number
  materialMarket: Decimal
  labourDays: Decimal
}

export interface AreaSubtotalBreakdown {
  interior: AreaSubtotalGroup
  exterior: AreaSubtotalGroup
  finalSubtotal: Decimal
  finalTotal: Decimal
  unassigned: UnassignedSubtotalGroup
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
  areaBreakdown: AreaSubtotalBreakdown
}

function calculateMaterialMarketTotal(materials: MaterialItem[]): Decimal {
  return materials.reduce(
    (total, item) => total.add(decimalFromInput(item.marketPrice).mul(decimalFromInput(item.quantity))),
    new Decimal(0)
  )
}

function calculateScopedGroup(
  scope: AreaScope,
  materials: MaterialItem[],
  selection: FormulaSelection,
  settings: PricingSettings
): AreaSubtotalGroup {
  const scopedMaterials = materials.filter((item) => item.areaScope === scope)
  const materialMarket = calculateMaterialMarketTotal(scopedMaterials)
  const materialActual = materialMarket
  const labour = calculateLabourTotals(scopedMaterials)
  const results = calculateAllFormulas(
    {
      workingDays: labour.labourDays,
      labourPerDay: 1,
      materialMarket,
      materialActual,
    },
    settings
  )
  const subtotal = calculateSubtotal(results, selection.selectedMin, selection.selectedMax)

  return {
    scope,
    selectedMin: selection.selectedMin,
    selectedMax: selection.selectedMax,
    materialMarket,
    materialActual,
    labour,
    results,
    subtotal,
    finalTotal: calculateFinal(subtotal),
  }
}

export function calculateAreaSubtotalBreakdown({
  materials,
  selectedMin,
  selectedMax,
  areaFormulaSelections,
  settings,
}: AreaSubtotalBreakdownInput): AreaSubtotalBreakdown {
  const fallbackSelection = { selectedMin, selectedMax }
  const interior = calculateScopedGroup('interior', materials, areaFormulaSelections?.interior ?? fallbackSelection, settings)
  const exterior = calculateScopedGroup('exterior', materials, areaFormulaSelections?.exterior ?? fallbackSelection, settings)
  const unassignedMaterials = materials.filter((item) => item.areaScope !== 'interior' && item.areaScope !== 'exterior')
  const unassignedLabour = calculateLabourTotals(unassignedMaterials)
  const finalSubtotal = interior.subtotal.add(exterior.subtotal)

  return {
    interior,
    exterior,
    finalSubtotal,
    finalTotal: calculateFinal(finalSubtotal),
    unassigned: {
      count: unassignedMaterials.length,
      materialMarket: calculateMaterialMarketTotal(unassignedMaterials),
      labourDays: unassignedLabour.labourDays,
    },
  }
}

export function calculateMainQuoteTotals({
  materials,
  selectedMin,
  selectedMax,
  areaFormulaSelections,
  settings,
}: MainQuoteTotalsInput): MainQuoteTotals {
  const materialMarket = calculateMaterialMarketTotal(materials)
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
  const areaBreakdown = calculateAreaSubtotalBreakdown({
    materials,
    selectedMin,
    selectedMax,
    areaFormulaSelections,
    settings,
  })
  const subtotalLabour = Decimal.max(areaBreakdown.finalSubtotal.sub(materialMarket), 0)

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
    areaBreakdown,
  }
}
