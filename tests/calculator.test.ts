import { describe, it, expect } from 'vitest'
import Decimal from 'decimal.js'
import {
  calculateAllFormulas,
  calculateSubtotal,
  calculateFinal,
  calculateRoofFormulaResults,
  calculateRoofSubtotal,
  ValidationError,
  DEFAULT_PRICING_SETTINGS,
  formatFormulaRate,
  getFormulaDescriptions,
  type PricingSettings,
  type CalculatorInput,
} from '@/lib/calculator'
import { HISTORICAL_FIXTURES } from './fixtures/historical-quotes'

const s = DEFAULT_PRICING_SETTINGS
const customSettings: PricingSettings = {
  ...s,
  f1LabourRate: 520,
  f2LabourRate: 470,
  f3LabourRate: 470,
  f4LabourRate: 390,
  f5LabourRate: 390,
  f2Margin: 0.42,
  f3Margin: 0.16,
  f4Margin: 0.22,
  f5Margin: 0.18,
}

describe('calculateAllFormulas', () => {
  const base: CalculatorInput = {
    workingDays: 5,
    labourPerDay: 1,
    materialMarket: 342.50,
    materialActual: 245.00,
  }

  it('returns 5 results', () => {
    const results = calculateAllFormulas(base, s)
    expect(results).toHaveLength(5)
    expect(results.map(r => r.formulaNum)).toEqual([1, 2, 3, 4, 5])
  })

  it('formula1: f1_rate × D + material_market', () => {
    const [f1] = calculateAllFormulas(base, s)
    // 500 × 5 + 342.50 = 2842.50
    expect(f1.total.toFixed(2)).toBe('2842.50')
  })

  it('formula2: (f2_rate × D / 0.70) + material_market', () => {
    const results = calculateAllFormulas(base, s)
    const f2 = results[1]
    expect(f2.total.toFixed(2)).toBe('3628.21')
  })

  it('formula3: (f3_rate × D + material_market) / 0.70', () => {
    const results = calculateAllFormulas(base, s)
    const f3 = results[2]
    expect(f3.total.toFixed(2)).toBe('3635.71')
  })

  it('formula4: (f4_rate × D / 0.75) + material_market', () => {
    const results = calculateAllFormulas(base, s)
    const f4 = results[3]
    expect(f4.total.toFixed(2)).toBe('2875.83')
  })

  it('formula5: (f5_rate × D + material_market) / 0.70', () => {
    const results = calculateAllFormulas(base, s)
    const f5 = results[4]
    expect(f5.total.toFixed(2)).toBe('3064.29')
  })

  it('keeps labour-only and total-margin formulas different when RRP is zero but material actual cost exists', () => {
    const results = calculateAllFormulas({
      workingDays: 1,
      labourPerDay: 1,
      materialMarket: 0,
      materialActual: 99,
    }, {
      ...s,
      f4Margin: 0.25,
      f5Margin: 0.25,
    })

    expect(results[1].total.toFixed(2)).toBe('657.14')
    expect(results[2].total.toFixed(2)).toBe('798.57')
    expect(results[3].total.toFixed(2)).toBe('506.67')
    expect(results[4].total.toFixed(2)).toBe('638.67')
  })

  it('falls back to defaults when pricing settings are undefined in main formulas', () => {
    const results = calculateAllFormulas(base, undefined)
    expect(results.map((item) => item.formulaNum)).toEqual([1, 2, 3, 4, 5])
    expect(results[0].name).toBe('L500 / Market / No Margin')
  })

  it('accepts Decimal inputs', () => {
    const results = calculateAllFormulas({
      workingDays: new Decimal(5),
      labourPerDay: new Decimal(1),
      materialMarket: new Decimal('342.50'),
      materialActual: new Decimal('245.00'),
    }, s)
    expect(results[0].total.toFixed(2)).toBe('2842.50')
  })

  it('updates formula descriptions when settings change', () => {
    const labels = getFormulaDescriptions(customSettings)
    const results = calculateAllFormulas(base, customSettings)

    expect(results.map((item) => item.name)).toEqual([
      labels.formula1Name,
      labels.formula2Name,
      labels.formula3Name,
      labels.formula4Name,
      labels.formula5Name,
    ])
  })

  it('keeps non-zero decimal places in formula rate labels', () => {
    expect(formatFormulaRate(new Decimal('500.25'))).toBe('L500.25')
    expect(formatFormulaRate(460.50)).toBe('L460.5')
  })

  it('works with 0.5 day increments', () => {
    const results = calculateAllFormulas({ ...base, workingDays: 0.5 }, s)
    // 500 × 0.5 + 342.50 = 592.50
    expect(results[0].total.toFixed(2)).toBe('592.50')
  })

  it('multiplies working days by labour per day before applying formula rates', () => {
    const results = calculateAllFormulas({ ...base, labourPerDay: 2 }, s)
    expect(results[0].total.toFixed(2)).toBe('5342.50')
    expect(results[3].total.toFixed(2)).toBe('5409.17')
  })

  it('works with zero material', () => {
    const results = calculateAllFormulas({ workingDays: 3, labourPerDay: 1, materialMarket: 0, materialActual: 0 }, s)
    // 500 × 3 + 0 = 1500
    expect(results[0].total.toFixed(2)).toBe('1500.00')
  })

  it('throws ValidationError for negative workingDays', () => {
    expect(() => calculateAllFormulas({ ...base, workingDays: -1 }, s)).toThrow(ValidationError)
  })

  it('throws ValidationError for negative labourPerDay', () => {
    expect(() => calculateAllFormulas({ ...base, labourPerDay: -1 }, s)).toThrow(ValidationError)
  })

  it('throws ValidationError for negative materialMarket', () => {
    expect(() => calculateAllFormulas({ ...base, materialMarket: -1 }, s)).toThrow(ValidationError)
  })

  it('throws ValidationError for negative materialActual', () => {
    expect(() => calculateAllFormulas({ ...base, materialActual: -1 }, s)).toThrow(ValidationError)
  })

  it('throws ValidationError when a margin is 100% or higher', () => {
    expect(() => calculateAllFormulas({
      ...base,
    }, {
      ...s,
      f2Margin: 1,
    })).toThrow(ValidationError)
  })

})

describe('calculateSubtotal', () => {
  const results = calculateAllFormulas({
    workingDays: 5,
    labourPerDay: 1,
    materialMarket: 342.50,
    materialActual: 245.00,
  }, s)

  it('averages min and max formula', () => {
    const subtotal = calculateSubtotal(results, 4, 1)
    // (2717.50 + 2842.50) / 2 = 2780.00
    expect(subtotal.toFixed(2)).toBe('2859.17')
  })

  it('returns single value when min === max', () => {
    const subtotal = calculateSubtotal(results, 1, 1)
    expect(subtotal.toFixed(2)).toBe('2842.50')
  })

  it('throws ValidationError for invalid formula number', () => {
    expect(() => calculateSubtotal(results, 1, 6 as 1)).toThrow(ValidationError)
  })

  it('throws ValidationError when the min formula is missing', () => {
    expect(() => calculateSubtotal(results, 6 as 1, 1)).toThrow(ValidationError)
  })
})

describe('calculateFinal', () => {
  it('adds 10% GST to subtotal for the final total', () => {
    const subtotal = new Decimal('2761.88')
    const final = calculateFinal(subtotal)
    expect(final.toFixed(2)).toBe('3038.07')
  })
})

describe('calculateRoofSubtotal', () => {
  it('falls back to defaults when pricing settings are undefined in roof formulas', () => {
    const results = calculateRoofFormulaResults({
      labourDays: 2,
      materialMarket: 100,
      materialActual: 100,
    }, undefined)

    expect(results.map((item) => item.formulaNum)).toEqual([1, 2, 3, 4, 5])
    expect(results[0].total.toFixed(2)).toBe('1500.00')
  })

  it('uses roof labour rate with the shared formula margins', () => {
    const results = calculateRoofFormulaResults({
      labourDays: new Decimal(2),
      materialMarket: new Decimal(100),
    }, {
      ...DEFAULT_PRICING_SETTINGS,
      roofLabourRate: 700,
      f2Margin: 0.30,
      f3Margin: 0.30,
      f4Margin: 0.25,
      f5Margin: 0.30,
    })

    expect(results.map((result) => result.total.toFixed(2))).toEqual([
      '1500.00',
      '2100.00',
      '2142.86',
      '1966.67',
      '2142.86',
    ])
  })

  it('calculates a 30% roof margin by dividing by 0.70, not multiplying by 1.30', () => {
    const results = calculateRoofFormulaResults({
      labourDays: 2,
      materialMarket: 100,
      materialActual: 100,
    }, {
      ...DEFAULT_PRICING_SETTINGS,
      roofLabourRate: 700,
      f3Margin: 0.30,
    })

    expect(results[2].total.toFixed(2)).toBe('2142.86')
    expect(results[2].total.toFixed(2)).not.toBe('1950.00')
  })

  it('uses selected roof formulas for subtotal', () => {
    const subtotal = calculateRoofSubtotal({
      labourDays: new Decimal(2),
      materialMarket: new Decimal(100),
    }, {
      ...DEFAULT_PRICING_SETTINGS,
      roofLabourRate: 700,
    }, 1, 3)

    expect(subtotal.toFixed(2)).toBe('1821.43')
  })

  it('throws ValidationError for negative roof labour days', () => {
    expect(() => calculateRoofSubtotal({ labourDays: -1, materialMarket: 0 }, s)).toThrow(ValidationError)
  })

  it('throws ValidationError for negative roof material price', () => {
    expect(() => calculateRoofSubtotal({ labourDays: 1, materialMarket: -1 }, s)).toThrow(ValidationError)
  })

  it('throws ValidationError for negative roof material actual price', () => {
    expect(() => calculateRoofFormulaResults({ labourDays: 1, materialMarket: 0, materialActual: -1 }, s)).toThrow(
      ValidationError
    )
  })
})

describe('Historical regression fixtures', () => {
  for (const fixture of HISTORICAL_FIXTURES) {
    it(`${fixture.name}`, () => {
      const results = calculateAllFormulas(fixture.input, fixture.settings)

      expect(results[0].total.toFixed(2)).toBe(fixture.expected.formula1.toFixed(2))
      expect(results[1].total.toFixed(2)).toBe(fixture.expected.formula2.toFixed(2))
      expect(results[2].total.toFixed(2)).toBe(fixture.expected.formula3.toFixed(2))
      expect(results[3].total.toFixed(2)).toBe(fixture.expected.formula4.toFixed(2))
      expect(results[4].total.toFixed(2)).toBe(fixture.expected.formula5.toFixed(2))
    })
  }
})
