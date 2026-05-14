import { describe, it, expect } from 'vitest'
import Decimal from 'decimal.js'
import {
  calculateAllFormulas,
  calculateSubtotal,
  calculateFinal,
  ValidationError,
  DEFAULT_PRICING_SETTINGS,
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

  it('formula2: (f2_rate × D × 1.30) + material_market', () => {
    const results = calculateAllFormulas(base, s)
    const f2 = results[1]
    // (460 × 5 × 1.30) + 342.50 = 2990 + 342.50 = 3332.50... wait
    // 460 × 5 = 2300, × 1.30 = 2990, + 342.50 = 3332.50
    expect(f2.total.toFixed(2)).toBe('3332.50')
  })

  it('formula3: (f3_rate × D + material_market) × 1.30', () => {
    const results = calculateAllFormulas(base, s)
    const f3 = results[2]
    // (460 × 5 + 342.50) × 1.30 = (2300 + 342.50) × 1.30 = 2642.50 × 1.30 = 3435.25
    expect(f3.total.toFixed(2)).toBe('3435.25')
  })

  it('formula4: (f4_rate × D × 1.25) + material_market', () => {
    const results = calculateAllFormulas(base, s)
    const f4 = results[3]
    // (380 × 5 × 1.25) + 342.50 = 2375 + 342.50 = 2717.50
    expect(f4.total.toFixed(2)).toBe('2717.50')
  })

  it('formula5: (f5_rate × D + material_market) × 1.30', () => {
    const results = calculateAllFormulas(base, s)
    const f5 = results[4]
    // (380 × 5 + 342.50) × 1.30 = 2242.50 × 1.30 = 2915.25
    expect(f5.total.toFixed(2)).toBe('2915.25')
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

  it('works with 0.5 day increments', () => {
    const results = calculateAllFormulas({ ...base, workingDays: 0.5 }, s)
    // 500 × 0.5 + 342.50 = 592.50
    expect(results[0].total.toFixed(2)).toBe('592.50')
  })

  it('multiplies working days by labour per day before applying formula rates', () => {
    const results = calculateAllFormulas({ ...base, labourPerDay: 2 }, s)
    expect(results[0].total.toFixed(2)).toBe('5342.50')
    expect(results[3].total.toFixed(2)).toBe('5092.50')
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
    expect(subtotal.toFixed(2)).toBe('2780.00')
  })

  it('returns single value when min === max', () => {
    const subtotal = calculateSubtotal(results, 1, 1)
    expect(subtotal.toFixed(2)).toBe('2842.50')
  })

  it('throws ValidationError for invalid formula number', () => {
    expect(() => calculateSubtotal(results, 1, 6 as 1)).toThrow(ValidationError)
  })
})

describe('calculateFinal', () => {
  it('adds 10% GST to subtotal for the final total', () => {
    const subtotal = new Decimal('2761.88')
    const final = calculateFinal(subtotal)
    expect(final.toFixed(2)).toBe('3038.07')
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
