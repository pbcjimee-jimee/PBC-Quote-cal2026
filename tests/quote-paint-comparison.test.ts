import { describe, expect, it } from 'vitest'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import { calculateAreaSubtotalBreakdown } from '@/lib/quote-calculation-totals'
import { calculatePaintComparison, reconcilePaintComparison, restoreMaterialTimberRole, setMaterialTimberRole } from '@/lib/quote-paint-comparison'
import type { PaintComparison } from '@/lib/paint-comparison-types'
import type { MaterialItem } from '@/components/quote-form/types'

function source(overrides: Partial<MaterialItem> = {}): MaterialItem {
  return {
    id: 'source-row', logicalKey: 'finish-key', timberRole: 'finish', productId: 'super',
    name: 'Super finish', marketPrice: '100', actualPrice: '80', quantity: '1',
    workingDays: '1', labourPerDay: '1', areaScope: 'interior', areaId: 'doors', isCustom: false,
    ...overrides,
  }
}

function comparison(price = '150'): PaintComparison {
  return {
    version: 1, key: 'comparison-key', alternatives: [{
      targetLogicalKey: 'finish-key', previousRole: 'finish', acknowledgedSourceProductId: 'super',
      product: { productId: 'aqua', name: 'Aqua finish', marketPrice: price, actualPrice: price },
      quantity: { mode: 'inherit', value: '1' },
      workingDays: { mode: 'inherit', value: '1' },
      labourPerDay: { mode: 'inherit', value: '1' },
    }],
  }
}

function calculate(materials: MaterialItem[], config = comparison()) {
  return calculatePaintComparison({ materials, comparison: config, selectedMin: 1, selectedMax: 1, settings: DEFAULT_PRICING_SETTINGS })
}

describe('Timber full quote comparison', () => {
  it('replaces only finish in the full quote while shared, other scopes and unassigned rows stay single', () => {
    const materials = [source(), source({ id: 'prep', logicalKey: 'prep-key', timberRole: 'shared', marketPrice: '50', actualPrice: '40' }),
      source({ id: 'exterior', logicalKey: 'other', timberRole: 'none', areaScope: 'exterior', marketPrice: '200' }),
      source({ id: 'unassigned', logicalKey: 'unassigned', timberRole: 'none', areaScope: undefined, marketPrice: '999' })]
    const result = calculate(materials)
    expect(result.status).toBe('ready')
    expect(result.superSubtotal.toFixed(2)).toBe('1850.00')
    expect(result.aquaSubtotal?.toFixed(2)).toBe('1900.00')
    expect(result.differenceSubtotal?.toFixed(2)).toBe('50.00')
    expect(result.timberSuperSubtotal?.toFixed(2)).toBe('1150.00')
    expect(result.timberAquaSubtotal?.toFixed(2)).toBe('1200.00')
    expect(result.excludedUnassignedCount).toBe(1)
    expect(materials).toHaveLength(4)
    expect(materials[0].productId).toBe('super')
  })

  it.each([['500', '400.00'], ['0', '-100.00'], ['100', '0.00']])('keeps signed difference for Aqua price %s', (price, expected) => {
    expect(calculate([source()], comparison(price)).differenceSubtotal?.toFixed(2)).toBe(expected)
  })

  it('uses current Main values only for inherited fields while preserving overrides', () => {
    const config = comparison()
    config.alternatives[0].workingDays = { mode: 'override', value: '0.5' }
    const result = calculate([source({ quantity: '2', workingDays: '3', labourPerDay: '2' })], config)
    expect(result.superSubtotal.toFixed(2)).toBe('3200.00')
    expect(result.aquaSubtotal?.toFixed(2)).toBe('800.00')
    expect(result.differenceSubtotal?.toFixed(2)).toBe('-2400.00')
    expect(config.alternatives[0].quantity.value).toBe('1')
  })

  it('rounds both full quote totals before subtracting instead of rounding the raw difference', () => {
    const config = comparison('0.01')
    const materials = [source({ marketPrice: '0.01', actualPrice: '0.01', workingDays: '0' })]
    const result = calculatePaintComparison({ materials, comparison: config, selectedMin: 1, selectedMax: 3,
      settings: DEFAULT_PRICING_SETTINGS })
    expect(result.superSubtotal.toFixed(2)).toBe('0.01')
    config.alternatives[0].product!.actualPrice = '0.02'
    const changed = calculatePaintComparison({ materials, comparison: config, selectedMin: 1, selectedMax: 3,
      settings: DEFAULT_PRICING_SETTINGS })
    expect(changed.aquaSubtotal?.toFixed(2)).toBe('0.02')
    expect(changed.differenceSubtotal?.toFixed(2)).toBe('0.01')
  })

  it('keeps shared rounding in the whole quote rather than adding rounded Timber and non-Timber details', () => {
    const materials = [source({ marketPrice: '0.01', actualPrice: '0.01', workingDays: '0' }),
      source({ id: 'non-timber', logicalKey: 'non-timber', timberRole: 'none', marketPrice: '0.01', actualPrice: '0.01', workingDays: '0' })]
    const config = comparison('0.02')
    const result = calculatePaintComparison({ materials, comparison: config, selectedMin: 1, selectedMax: 3, settings: DEFAULT_PRICING_SETTINGS })
    expect(result.superSubtotal.toFixed(2)).toBe('0.02')
    expect(result.aquaSubtotal?.toFixed(2)).toBe('0.04')
    expect(result.differenceSubtotal?.toFixed(2)).toBe('0.02')
  })

  it('does not fabricate a completed zero difference when there is no finish or no Aqua product', () => {
    for (const materials of [[source({ timberRole: 'shared' })], []]) {
      expect(calculate(materials).status).toBe('incomplete')
      expect(calculate(materials).aquaSubtotal).toBeNull()
      expect(calculate(materials).differenceSubtotal).toBeNull()
    }
    const config = comparison()
    delete config.alternatives[0].product
    expect(calculate([source()], config).status).toBe('incomplete')
  })

  it('blocks completion until changed source product is explicitly acknowledged, across reconciliation', () => {
    const materials = [source({ productId: 'replacement-super' })]
    const config = reconcilePaintComparison(materials, comparison())
    expect(config.alternatives[0].acknowledgedSourceProductId).toBe('super')
    expect(config.alternatives[0].product?.productId).toBe('aqua')
    expect(calculate(materials, config).status).toBe('needs_review')
    expect(calculate(materials, config).differenceSubtotal).toBeNull()
    config.alternatives[0].acknowledgedSourceProductId = 'replacement-super'
    expect(calculate(materials, config).status).toBe('ready')
  })

  it.each(['exterior', 'roof', undefined] as const)('marks active Timber outside Interior %s invalid even without Aqua', (areaScope) => {
    const config = comparison()
    delete config.alternatives[0].product
    const result = calculate([source({ areaScope })], config)
    expect(result.status).toBe('invalid')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'invalid_scope', targetLogicalKey: 'finish-key' }))
  })

  it.each(['marketPrice', 'actualPrice', 'quantity', 'workingDays', 'labourPerDay'] as const)('rejects precision beyond stored 2 decimals in source %s', (field) => {
    expect(calculate([source({ [field]: '0.333' })]).issues).toContainEqual(expect.objectContaining({ code: 'invalid_number', field }))
  })

  it('rejects active Aqua precision and negative inputs but ignores dormant invalid Aqua values', () => {
    const config = comparison()
    config.alternatives[0].workingDays = { mode: 'override', value: '-0.01' }
    expect(calculate([source()], config).status).toBe('invalid')
    config.alternatives[0].workingDays.value = '0.005'
    expect(calculate([source()], config).status).toBe('invalid')
    const materials = [source({ timberRole: 'none' }), source({ id: 'active', logicalKey: 'active', timberRole: 'finish' })]
    const reconciled = reconcilePaintComparison(materials, config)
    reconciled.alternatives[1].product = { productId: 'aqua', name: 'Aqua', marketPrice: '100', actualPrice: '80' }
    expect(calculate(materials, reconciled).status).toBe('ready')
  })

  it('rejects duplicate logical keys instead of replacing multiple unrelated source rows', () => {
    expect(calculate([source(), source({ id: 'another-row' })]).status).toBe('invalid')
  })

  it('keeps the area and formula selection from Main and the trusted actual price for F3/F5', () => {
    const result = calculatePaintComparison({ materials: [source()], comparison: comparison('150'), selectedMin: 1, selectedMax: 1,
      areaFormulaSelections: { interior: { selectedMin: 3, selectedMax: 3 }, exterior: { selectedMin: 1, selectedMax: 1 }, roof: { selectedMin: 1, selectedMax: 1 } }, settings: DEFAULT_PRICING_SETTINGS })
    expect(result.superSubtotal.toFixed(2)).toBe('771.43')
    expect(result.aquaSubtotal?.toFixed(2)).toBe('871.43')
    expect(result.differenceSubtotal?.toFixed(2)).toBe('100.00')
  })

  it('does not change Main totals when Timber membership alone changes', () => {
    const config = comparison()
    const before = calculateAreaSubtotalBreakdown({ materials: [source({ timberRole: 'none' })], selectedMin: 1, selectedMax: 1, settings: DEFAULT_PRICING_SETTINGS })
    expect(calculate([source()], config).superSubtotal.toFixed(2)).toBe(before.finalSubtotal.toFixed(2))
  })
})

describe('comparison input preservation', () => {
  it('retains Aqua inputs and previous finish role on uncheck/recheck and finish/shared changes', () => {
    const config = comparison()
    config.alternatives[0].workingDays = { mode: 'override', value: '2' }
    const unchecked = setMaterialTimberRole(source(), config, 'none')
    const dormant = reconcilePaintComparison([unchecked.material], unchecked.comparison)
    expect(dormant.alternatives[0].previousRole).toBe('finish')
    const restored = restoreMaterialTimberRole(unchecked.material, dormant)
    expect(restored.material.timberRole).toBe('finish')
    expect(restored.comparison.alternatives[0].workingDays).toEqual({ mode: 'override', value: '2' })
    const shared = setMaterialTimberRole(restored.material, restored.comparison, 'shared')
    expect(shared.comparison.alternatives[0].product?.productId).toBe('aqua')
    expect(restoreMaterialTimberRole(shared.material, shared.comparison).material.timberRole).toBe('shared')
    expect(config.alternatives[0].previousRole).toBe('finish')
  })

  it('prunes deleted sources, uses logical identity after product replacement, and initializes new markers without guessing Aqua', () => {
    const config = reconcilePaintComparison([source({ id: 'replacement-row' }), source({ id: 'prep', logicalKey: 'prep', timberRole: 'shared' })], comparison())
    expect(config.alternatives[0].product?.productId).toBe('aqua')
    expect(config.alternatives[1].product).toBeUndefined()
    expect(config.alternatives[1].acknowledgedSourceProductId).toBe('super')
    expect(reconcilePaintComparison([], config).alternatives).toEqual([])
  })
})
