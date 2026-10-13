import Decimal from 'decimal.js'
import type { PricingSettings } from '@/lib/calculator'
import { calculateAreaSubtotalBreakdown } from '@/lib/quote-calculation-totals'
import type { PaintComparison, PaintComparisonAlternative, TimberRole } from '@/lib/paint-comparison-types'
import type { AreaFormulaSelections, FormulaNumber, MaterialItem } from '@/components/quote-form/types'

export interface PaintComparisonIssue {
  code: 'invalid_scope' | 'invalid_number' | 'duplicate_key' | 'missing_finish' | 'missing_product' | 'source_product_changed' | 'unsupported_version'
  targetLogicalKey?: string
  variant?: 'super' | 'aqua'
  field?: string
}

export interface PaintComparisonCalculation {
  status: 'ready' | 'incomplete' | 'needs_review' | 'invalid'
  issues: PaintComparisonIssue[]
  superSubtotal: Decimal
  aquaSubtotal: Decimal | null
  differenceSubtotal: Decimal | null
  timberSuperSubtotal: Decimal
  timberAquaSubtotal: Decimal | null
  excludedUnassignedCount: number
}

export interface PaintComparisonCalculationInput {
  materials: MaterialItem[]
  comparison: PaintComparison
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  areaFormulaSelections?: AreaFormulaSelections
  settings: PricingSettings
}

const NUMERIC_FIELDS = ['marketPrice', 'actualPrice', 'quantity', 'workingDays', 'labourPerDay'] as const
const INHERITED_FIELDS = ['quantity', 'workingDays', 'labourPerDay'] as const

export function getMaterialLogicalKey(material: MaterialItem): string {
  return material.logicalKey ?? material.id
}

function createAlternative(material: MaterialItem): PaintComparisonAlternative {
  return {
    targetLogicalKey: getMaterialLogicalKey(material),
    previousRole: material.timberRole === 'finish' ? 'finish' : 'shared',
    acknowledgedSourceProductId: material.productId ?? null,
    quantity: { mode: 'inherit', value: material.quantity },
    workingDays: { mode: 'inherit', value: material.workingDays },
    labourPerDay: { mode: 'inherit', value: material.labourPerDay },
  }
}

export function reconcilePaintComparison(materials: MaterialItem[], comparison: PaintComparison): PaintComparison {
  const byKey = new Map(materials.map((material) => [getMaterialLogicalKey(material), material]))
  const alternatives = comparison.alternatives
    .filter((alternative) => byKey.has(alternative.targetLogicalKey))
    .map((alternative) => {
      const role = byKey.get(alternative.targetLogicalKey)?.timberRole
      return role === 'shared' || role === 'finish' ? { ...alternative, previousRole: role } : alternative
    })
  const configuredKeys = new Set(alternatives.map((alternative) => alternative.targetLogicalKey))
  for (const material of materials) {
    if (material.timberRole && material.timberRole !== 'none' && !configuredKeys.has(getMaterialLogicalKey(material))) {
      alternatives.push(createAlternative(material))
      configuredKeys.add(getMaterialLogicalKey(material))
    }
  }
  return { ...comparison, alternatives }
}

export function setMaterialTimberRole(material: MaterialItem, comparison: PaintComparison, role: TimberRole): {
  material: MaterialItem
  comparison: PaintComparison
} {
  const key = getMaterialLogicalKey(material)
  const existing = comparison.alternatives.find((alternative) => alternative.targetLogicalKey === key)
  const alternative = existing ?? createAlternative(material)
  const previousRole = role !== 'none' ? role : material.timberRole !== 'none' && material.timberRole
    ? material.timberRole : alternative.previousRole
  const updated = { ...alternative, previousRole }
  return {
    material: { ...material, logicalKey: key, timberRole: role },
    comparison: {
      ...comparison,
      alternatives: existing ? comparison.alternatives.map((entry) => entry.targetLogicalKey === key ? updated : entry)
        : [...comparison.alternatives, updated],
    },
  }
}

export function restoreMaterialTimberRole(material: MaterialItem, comparison: PaintComparison): {
  material: MaterialItem
  comparison: PaintComparison
} {
  const previousRole = comparison.alternatives.find((alternative) => alternative.targetLogicalKey === getMaterialLogicalKey(material))?.previousRole ?? 'shared'
  return setMaterialTimberRole(material, comparison, previousRole)
}

function hasStoredPrecision(value: string): boolean {
  return /^\d+(?:\.\d{0,2})?$/.test(value.trim()) && new Decimal(value.trim()).isFinite()
}

function validateNumbers(material: MaterialItem, variant: 'super' | 'aqua', issues: PaintComparisonIssue[]): void {
  for (const field of NUMERIC_FIELDS) {
    if (!hasStoredPrecision(material[field])) {
      issues.push({ code: 'invalid_number', targetLogicalKey: getMaterialLogicalKey(material), variant, field })
    }
  }
}

function cents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

export function calculatePaintComparison(input: PaintComparisonCalculationInput): PaintComparisonCalculation {
  const { materials, comparison } = input
  const issues: PaintComparisonIssue[] = []
  const mainBreakdown = calculateAreaSubtotalBreakdown(input)
  const timber = materials.filter((material) => material.timberRole === 'shared' || material.timberRole === 'finish')
  const timberBreakdown = calculateAreaSubtotalBreakdown({ ...input, materials: timber })
  const base: PaintComparisonCalculation = {
    status: 'incomplete', issues,
    superSubtotal: cents(mainBreakdown.finalSubtotal),
    aquaSubtotal: null, differenceSubtotal: null,
    timberSuperSubtotal: cents(timberBreakdown.finalSubtotal), timberAquaSubtotal: null,
    excludedUnassignedCount: mainBreakdown.unassigned.count,
  }
  if (comparison.version !== 1) issues.push({ code: 'unsupported_version' })
  const seenSources = new Set<string>()
  for (const material of materials) {
    const key = getMaterialLogicalKey(material)
    if (seenSources.has(key)) issues.push({ code: 'duplicate_key', targetLogicalKey: key })
    seenSources.add(key)
    if (material.areaScope === 'interior' || material.areaScope === 'exterior' || material.areaScope === 'roof') {
      validateNumbers(material, 'super', issues)
    }
  }
  const alternatives = new Map<string, PaintComparisonAlternative>()
  for (const alternative of comparison.alternatives) {
    if (alternatives.has(alternative.targetLogicalKey)) issues.push({ code: 'duplicate_key', targetLogicalKey: alternative.targetLogicalKey })
    alternatives.set(alternative.targetLogicalKey, alternative)
  }
  for (const material of timber) {
    if (material.areaScope !== 'interior') issues.push({ code: 'invalid_scope', targetLogicalKey: getMaterialLogicalKey(material) })
  }
  const finishes = timber.filter((material) => material.timberRole === 'finish' && material.areaScope === 'interior')
  if (!finishes.length) issues.push({ code: 'missing_finish' })
  const projected = materials.map((material): MaterialItem => {
    if (material.timberRole !== 'finish' || material.areaScope !== 'interior') return material
    const key = getMaterialLogicalKey(material)
    const alternative = alternatives.get(key)
    if (!alternative?.product?.productId) {
      issues.push({ code: 'missing_product', targetLogicalKey: key, variant: 'aqua', field: 'product' })
      return material
    }
    if (alternative.acknowledgedSourceProductId !== (material.productId ?? null)) {
      issues.push({ code: 'source_product_changed', targetLogicalKey: key, variant: 'super', field: 'product' })
    }
    const projectedMaterial: MaterialItem = {
      ...material,
      productId: alternative.product.productId,
      name: alternative.product.name,
      marketPrice: alternative.product.marketPrice,
      actualPrice: alternative.product.actualPrice,
      isCustom: false,
    }
    for (const field of INHERITED_FIELDS) {
      projectedMaterial[field] = alternative[field].mode === 'override' ? alternative[field].value : material[field]
    }
    validateNumbers(projectedMaterial, 'aqua', issues)
    return projectedMaterial
  })
  const invalid = issues.some((issue) => ['invalid_scope', 'invalid_number', 'duplicate_key', 'unsupported_version'].includes(issue.code))
  if (invalid) return { ...base, status: 'invalid' }
  if (issues.some((issue) => issue.code === 'source_product_changed')) return { ...base, status: 'needs_review' }
  if (issues.length) return base
  const aquaSubtotal = cents(calculateAreaSubtotalBreakdown({ ...input, materials: projected }).finalSubtotal)
  const aquaTimber = projected.filter((material) => material.timberRole === 'shared' || material.timberRole === 'finish')
  return {
    ...base, status: 'ready', aquaSubtotal,
    differenceSubtotal: aquaSubtotal.sub(base.superSubtotal),
    timberAquaSubtotal: cents(calculateAreaSubtotalBreakdown({ ...input, materials: aquaTimber }).finalSubtotal),
  }
}
