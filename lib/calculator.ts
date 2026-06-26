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
  roofLabourRate: Decimal | number
  f2Margin: Decimal | number
  f3Margin: Decimal | number
  f4Margin: Decimal | number
  f5Margin: Decimal | number
}

function toPricingSettings(value: PricingSettings | null | undefined): PricingSettings {
  const fallback = DEFAULT_PRICING_SETTINGS

  if (!value) return fallback

  return {
    f1LabourRate: value.f1LabourRate ?? fallback.f1LabourRate,
    f2LabourRate: value.f2LabourRate ?? fallback.f2LabourRate,
    f3LabourRate: value.f3LabourRate ?? fallback.f3LabourRate,
    f4LabourRate: value.f4LabourRate ?? fallback.f4LabourRate,
    f5LabourRate: value.f5LabourRate ?? fallback.f5LabourRate,
    roofLabourRate: value.roofLabourRate ?? fallback.roofLabourRate,
    f2Margin: value.f2Margin ?? fallback.f2Margin,
    f3Margin: value.f3Margin ?? fallback.f3Margin,
    f4Margin: value.f4Margin ?? fallback.f4Margin,
    f5Margin: value.f5Margin ?? fallback.f5Margin,
  }
}

export interface FormulaResult {
  formulaNum: 1 | 2 | 3 | 4 | 5
  name: string
  total: Decimal
}

function toDecimal(value: Decimal | number): Decimal {
  return value instanceof Decimal ? value : new Decimal(value)
}

function toCompactDecimal(value: Decimal | number): string {
  const text = toDecimal(value).toFixed(2)
  const [integerPart, fractionPart = ''] = text.split('.')
  if (Number(fractionPart) === 0) return integerPart
  return `${integerPart}.${fractionPart.replace(/0+$/, '')}`
}

export function formatFormulaRate(value: Decimal | number): string {
  return `L${toCompactDecimal(value)}`
}

function formatPercent(value: Decimal | number): string {
  return `${toCompactDecimal(toDecimal(value).mul(100))}%`
}

export function getFormulaDescriptions(settings: PricingSettings) {
  const normalized = toPricingSettings(settings)

  return {
    formula1Name: `${formatFormulaRate(normalized.f1LabourRate)} / Market / No Margin`,
    formula2Name: `${formatFormulaRate(normalized.f2LabourRate)} / Labour ${formatPercent(normalized.f2Margin)} / Market`,
    formula3Name: `${formatFormulaRate(normalized.f3LabourRate)} / Material / Total ${formatPercent(normalized.f3Margin)}`,
    formula4Name: `${formatFormulaRate(normalized.f4LabourRate)} / Labour ${formatPercent(normalized.f4Margin)} / Market`,
    formula5Name: `${formatFormulaRate(normalized.f5LabourRate)} / Material / Total ${formatPercent(normalized.f5Margin)}`,
  }
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

function applyMargin(amount: Decimal, marginValue: Decimal | number): Decimal {
  const margin = toDecimal(marginValue)
  if (margin.gte(1)) throw new ValidationError('Margin must be less than 100%')
  return amount.div(new Decimal(1).sub(margin))
}

// formula_1 = f1_labour_rate × D + material_market
function formula1(D: Decimal, mm: Decimal, s: PricingSettings): Decimal {
  return toDecimal(s.f1LabourRate).mul(D).add(mm)
}

// formula_2 = (f2_labour_rate × D / (1 - f2_margin)) + material_market
function formula2(D: Decimal, mm: Decimal, s: PricingSettings): Decimal {
  const labour = applyMargin(toDecimal(s.f2LabourRate).mul(D), s.f2Margin)
  return labour.add(mm)
}

// formula_3 = (f3_labour_rate × D + material_market) / (1 - f3_margin)
function formula3(D: Decimal, ma: Decimal, s: PricingSettings): Decimal {
  return applyMargin(toDecimal(s.f3LabourRate).mul(D).add(ma), s.f3Margin)
}

// formula_4 = (f4_labour_rate × D / (1 - f4_margin)) + material_market
function formula4(D: Decimal, mm: Decimal, s: PricingSettings): Decimal {
  const labour = applyMargin(toDecimal(s.f4LabourRate).mul(D), s.f4Margin)
  return labour.add(mm)
}

// formula_5 = (f5_labour_rate × D + material_market) / (1 - f5_margin)
function formula5(D: Decimal, ma: Decimal, s: PricingSettings): Decimal {
  return applyMargin(toDecimal(s.f5LabourRate).mul(D).add(ma), s.f5Margin)
}

export function calculateAllFormulas(
  input: CalculatorInput,
  settings: PricingSettings | null | undefined
): FormulaResult[] {
  const normalizedSettings = toPricingSettings(settings)

  validateInput(input)

  const D = toDecimal(input.workingDays).mul(toDecimal(input.labourPerDay))
  const mm = toDecimal(input.materialMarket)
  const ma = toDecimal(input.materialActual)
  const names = getFormulaDescriptions(normalizedSettings)

  return [
    { formulaNum: 1, name: names.formula1Name, total: formula1(D, mm, normalizedSettings) },
    { formulaNum: 2, name: names.formula2Name, total: formula2(D, mm, normalizedSettings) },
    { formulaNum: 3, name: names.formula3Name, total: formula3(D, ma, normalizedSettings) },
    { formulaNum: 4, name: names.formula4Name, total: formula4(D, mm, normalizedSettings) },
    { formulaNum: 5, name: names.formula5Name, total: formula5(D, ma, normalizedSettings) },
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
  return subtotal.mul(1.10)
}

export function calculateRoofFormulaResults(
  input: { labourDays: Decimal | number; materialMarket: Decimal | number; materialActual?: Decimal | number },
  settings: PricingSettings | null | undefined
): FormulaResult[] {
  const normalizedSettings = toPricingSettings(settings)

  const labourDays = toDecimal(input.labourDays)
  const materialMarket = toDecimal(input.materialMarket)
  const materialActual = input.materialActual === undefined ? materialMarket : toDecimal(input.materialActual)

  if (labourDays.lt(0)) throw new ValidationError('Roof labour days cannot be negative')
  if (materialMarket.lt(0)) throw new ValidationError('Roof material price cannot be negative')
  if (materialActual.lt(0)) throw new ValidationError('Roof material actual price cannot be negative')

  return calculateAllFormulas(
    {
      workingDays: labourDays,
      labourPerDay: 1,
      materialMarket,
      materialActual,
    },
    {
      ...normalizedSettings,
      f1LabourRate: normalizedSettings.roofLabourRate,
      f2LabourRate: normalizedSettings.roofLabourRate,
      f3LabourRate: normalizedSettings.roofLabourRate,
      f4LabourRate: normalizedSettings.roofLabourRate,
      f5LabourRate: normalizedSettings.roofLabourRate,
    }
  )
}

export function calculateRoofSubtotal(
  input: { labourDays: Decimal | number; materialMarket: Decimal | number; materialActual?: Decimal | number },
  settings: PricingSettings,
  selectedMin: 1 | 2 | 3 | 4 | 5 = 1,
  selectedMax: 1 | 2 | 3 | 4 | 5 = 1
): Decimal {
  const results = calculateRoofFormulaResults(input, settings)
  return calculateSubtotal(results, selectedMin, selectedMax)
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  f1LabourRate: 500,
  f2LabourRate: 460,
  f3LabourRate: 460,
  f4LabourRate: 380,
  f5LabourRate: 380,
  roofLabourRate: 700,
  f2Margin: 0.30,
  f3Margin: 0.30,
  f4Margin: 0.25,
  f5Margin: 0.30,
}
