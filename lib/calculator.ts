import Decimal from 'decimal.js'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export interface CalculatorInput {
  workingDays: Decimal | number
  labourPerDay: Decimal | number
  materialMarket: Decimal | number
  materialActual: Decimal | number
}

export interface PricingSettings {
  f1LabourRate: Decimal | number
  f2LabourRate: Decimal | number
  f3LabourRate: Decimal | number
  f4LabourRate: Decimal | number
  f5LabourRate: Decimal | number
  f2Margin: Decimal | number
  f3Margin: Decimal | number
  f4Margin: Decimal | number
  f5Margin: Decimal | number
}

export interface FormulaResult {
  formulaNum: 1 | 2 | 3 | 4 | 5
  name: string
  total: Decimal
}

function toDecimal(value: Decimal | number): Decimal {
  return value instanceof Decimal ? value : new Decimal(value)
}

function validateInput(input: CalculatorInput): void {
  const D = toDecimal(input.workingDays)
  const labourPerDay = toDecimal(input.labourPerDay)
  const mm = toDecimal(input.materialMarket)
  const ma = toDecimal(input.materialActual)

  if (D.lt(0)) throw new ValidationError('Working days cannot be negative')
  if (labourPerDay.lt(0)) throw new ValidationError('Labour per day cannot be negative')
  if (mm.lt(0)) throw new ValidationError('Material market price cannot be negative')
  if (ma.lt(0)) throw new ValidationError('Material actual price cannot be negative')
}

// formula_1 = f1_labour_rate × D + material_market
function formula1(D: Decimal, mm: Decimal, s: PricingSettings): Decimal {
  return toDecimal(s.f1LabourRate).mul(D).add(mm)
}

// formula_2 = (f2_labour_rate × D × (1 + f2_margin)) + material_market
function formula2(D: Decimal, mm: Decimal, s: PricingSettings): Decimal {
  const labour = toDecimal(s.f2LabourRate).mul(D).mul(toDecimal(s.f2Margin).add(1))
  return labour.add(mm)
}

// formula_3 = (f3_labour_rate × D + material_market) × (1 + f3_margin)
function formula3(D: Decimal, mm: Decimal, s: PricingSettings): Decimal {
  return toDecimal(s.f3LabourRate).mul(D).add(mm).mul(toDecimal(s.f3Margin).add(1))
}

// formula_4 = (f4_labour_rate × D + material_actual) × (1 + f4_margin)
function formula4(D: Decimal, ma: Decimal, s: PricingSettings): Decimal {
  return toDecimal(s.f4LabourRate).mul(D).add(ma).mul(toDecimal(s.f4Margin).add(1))
}

// formula_5 = (f5_labour_rate × D + material_actual) × (1 + f5_margin)
function formula5(D: Decimal, ma: Decimal, s: PricingSettings): Decimal {
  return toDecimal(s.f5LabourRate).mul(D).add(ma).mul(toDecimal(s.f5Margin).add(1))
}

export function calculateAllFormulas(
  input: CalculatorInput,
  settings: PricingSettings
): FormulaResult[] {
  validateInput(input)

  const D = toDecimal(input.workingDays).mul(toDecimal(input.labourPerDay))
  const mm = toDecimal(input.materialMarket)
  const ma = toDecimal(input.materialActual)

  return [
    { formulaNum: 1, name: 'L500 / Market / No Margin', total: formula1(D, mm, settings) },
    { formulaNum: 2, name: 'L460 / Labour 30% / Market', total: formula2(D, mm, settings) },
    { formulaNum: 3, name: 'L460 / Market / Total 30%', total: formula3(D, mm, settings) },
    { formulaNum: 4, name: 'L380 / Actual / Total 25%', total: formula4(D, ma, settings) },
    { formulaNum: 5, name: 'L380 / Actual / Total 30%', total: formula5(D, ma, settings) },
  ]
}

export function calculateSubtotal(
  results: FormulaResult[],
  minFormula: 1 | 2 | 3 | 4 | 5,
  maxFormula: 1 | 2 | 3 | 4 | 5
): Decimal {
  const minResult = results.find(r => r.formulaNum === minFormula)
  const maxResult = results.find(r => r.formulaNum === maxFormula)

  if (!minResult) throw new ValidationError(`Formula ${minFormula} not found`)
  if (!maxResult) throw new ValidationError(`Formula ${maxFormula} not found`)

  if (minFormula === maxFormula) return minResult.total

  return minResult.total.add(maxResult.total).div(2)
}

export function calculateFinal(subtotal: Decimal): Decimal {
  return subtotal
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  f1LabourRate: 500,
  f2LabourRate: 460,
  f3LabourRate: 460,
  f4LabourRate: 380,
  f5LabourRate: 380,
  f2Margin: 0.30,
  f3Margin: 0.30,
  f4Margin: 0.25,
  f5Margin: 0.30,
}
