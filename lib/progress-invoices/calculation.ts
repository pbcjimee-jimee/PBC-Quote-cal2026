import Decimal from 'decimal.js'

import type {
  AdjustedContractCalculation,
  AdjustedContractCalculationInput,
  ProgressClaimCalculation,
  ProgressClaimCalculationInput,
} from './types'
import { ProgressInvoiceCalculationError } from './types'

const FinancialDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
})

const GST_RATE_V1 = new FinancialDecimal('0.10')
const ONE_HUNDRED = new FinancialDecimal('100')

function parseDecimal(value: string, label: string): Decimal {
  try {
    const decimal = new FinancialDecimal(value)
    if (!decimal.isFinite()) {
      throw new Error('not finite')
    }
    return decimal
  } catch {
    throw new ProgressInvoiceCalculationError(`${label} must be a decimal string`)
  }
}

function parseCurrency(value: string, label: string): Decimal {
  const decimal = parseDecimal(value, label)
  if (decimal.isNegative() || decimal.decimalPlaces() > 2) {
    throw new ProgressInvoiceCalculationError(
      `${label} must be a non-negative currency amount with at most two decimals`,
    )
  }
  return decimal
}

function currency(value: Decimal): string {
  return value.toDecimalPlaces(2).toFixed(2)
}

function percentage(value: Decimal): string {
  return value.toDecimalPlaces(6).toFixed(6)
}

function assertGstRate(gstRate: string): void {
  if (!parseDecimal(gstRate, 'GST rate').eq(GST_RATE_V1)) {
    throw new ProgressInvoiceCalculationError('GST rate must be exactly 0.10')
  }
}

export function calculateAdjustedContract(
  input: AdjustedContractCalculationInput,
): AdjustedContractCalculation {
  assertGstRate(input.gstRate)

  let adjustedExGst = parseCurrency(input.baseContractExGst, 'Base contract Ex GST')
  for (const adjustment of input.approvedAdjustments) {
    const amount = parseCurrency(adjustment.amountExGst, 'Adjustment Ex GST')
    adjustedExGst = adjustment.type === 'variation'
      ? adjustedExGst.plus(amount)
      : adjustedExGst.minus(amount)
  }

  if (!adjustedExGst.gt(0)) {
    throw new ProgressInvoiceCalculationError('Adjusted contract must be positive')
  }

  const adjustedGst = adjustedExGst
    .times(GST_RATE_V1)
    .toDecimalPlaces(2)
  const adjustedIncGst = adjustedExGst.plus(adjustedGst)

  return {
    adjustedContractExGst: currency(adjustedExGst),
    adjustedContractGst: currency(adjustedGst),
    adjustedContractIncGst: currency(adjustedIncGst),
  }
}

export function calculateProgressClaim(
  input: ProgressClaimCalculationInput,
): ProgressClaimCalculation {
  const adjusted = calculateAdjustedContract(input)
  const adjustedExGst = parseCurrency(
    adjusted.adjustedContractExGst,
    'Adjusted contract Ex GST',
  )
  const adjustedGst = parseCurrency(
    adjusted.adjustedContractGst,
    'Adjusted contract GST',
  )
  const adjustedIncGst = parseCurrency(
    adjusted.adjustedContractIncGst,
    'Adjusted contract Inc GST',
  )

  let previousExGst = new FinancialDecimal(0)
  let previousGst = new FinancialDecimal(0)
  let previousIncGst = new FinancialDecimal(0)
  for (const claim of input.previousClaims) {
    const exGst = parseCurrency(claim.exGst, 'Previous claim Ex GST')
    const gst = parseCurrency(claim.gst, 'Previous claim GST')
    const incGst = parseCurrency(claim.incGst, 'Previous claim Inc GST')
    if (!exGst.plus(gst).eq(incGst)) {
      throw new ProgressInvoiceCalculationError('Previous claim GST figures do not reconcile')
    }
    previousExGst = previousExGst.plus(exGst)
    previousGst = previousGst.plus(gst)
    previousIncGst = previousIncGst.plus(incGst)
  }

  if (
    previousExGst.gt(adjustedExGst)
    || previousGst.gt(adjustedGst)
    || previousIncGst.gt(adjustedIncGst)
  ) {
    throw new ProgressInvoiceCalculationError(
      'Previous claims exceed the adjusted contract',
    )
  }

  let currentExGst: Decimal
  let currentGst: Decimal
  let currentIncGst: Decimal
  let cumulativeTargetExGst: Decimal
  let cumulativeTargetGst: Decimal
  let cumulativeTargetIncGst: Decimal
  let cumulativePercentage: Decimal

  if (input.kind === 'final') {
    currentExGst = adjustedExGst.minus(previousExGst)
    currentGst = adjustedGst.minus(previousGst)
    currentIncGst = currentExGst.plus(currentGst)

    if (!currentIncGst.gt(0)) {
      throw new ProgressInvoiceCalculationError('FINAL must have a positive residual')
    }

    const authoritativeValue = input.inputMode === 'cumulative_percentage'
      ? parseDecimal(input.authoritativeValue, 'FINAL cumulative percentage')
      : parseCurrency(input.authoritativeValue, 'FINAL current claim Inc GST')
    const finalInputMatches = input.inputMode === 'cumulative_percentage'
      ? authoritativeValue.eq(ONE_HUNDRED)
      : authoritativeValue.eq(currentIncGst)
    if (!finalInputMatches) {
      throw new ProgressInvoiceCalculationError(
        'FINAL must consume the exact full residual and reach 100 percent',
      )
    }

    cumulativeTargetExGst = adjustedExGst
    cumulativeTargetGst = adjustedGst
    cumulativeTargetIncGst = adjustedIncGst
    cumulativePercentage = ONE_HUNDRED
  } else {
    if (input.inputMode === 'cumulative_percentage') {
      cumulativePercentage = parseDecimal(
        input.authoritativeValue,
        'Cumulative percentage',
      )
      if (
        cumulativePercentage.isNegative()
        || cumulativePercentage.gt(ONE_HUNDRED)
      ) {
        throw new ProgressInvoiceCalculationError(
          'Cumulative percentage must be between 0 and 100',
        )
      }
      cumulativeTargetIncGst = adjustedIncGst
        .times(cumulativePercentage)
        .dividedBy(ONE_HUNDRED)
        .toDecimalPlaces(2)
      currentIncGst = cumulativeTargetIncGst.minus(previousIncGst)
    } else {
      currentIncGst = parseCurrency(
        input.authoritativeValue,
        'Current claim Inc GST',
      )
      cumulativeTargetIncGst = previousIncGst.plus(currentIncGst)
      cumulativePercentage = cumulativeTargetIncGst
        .dividedBy(adjustedIncGst)
        .times(ONE_HUNDRED)
    }

    if (currentIncGst.isNegative()) {
      throw new ProgressInvoiceCalculationError(
        'Cumulative target cannot be less than previous claims',
      )
    }
    if (cumulativeTargetIncGst.gt(adjustedIncGst)) {
      throw new ProgressInvoiceCalculationError(
        'Current claim cannot exceed the remaining contract value',
      )
    }

    currentExGst = currentIncGst
      .dividedBy(GST_RATE_V1.plus(1))
      .toDecimalPlaces(2)
    currentGst = currentIncGst.minus(currentExGst)
    cumulativeTargetExGst = previousExGst.plus(currentExGst)
    cumulativeTargetGst = previousGst.plus(currentGst)
    if (
      cumulativeTargetExGst.gt(adjustedExGst)
      || cumulativeTargetGst.gt(adjustedGst)
    ) {
      throw new ProgressInvoiceCalculationError(
        'Normal claim cannot exceed an adjusted contract tax component',
      )
    }
  }

  const remainingExGst = adjustedExGst.minus(cumulativeTargetExGst)
  const remainingGst = adjustedGst.minus(cumulativeTargetGst)
  const remainingIncGst = adjustedIncGst.minus(cumulativeTargetIncGst)

  return {
    ...adjusted,
    previousClaimsExGst: currency(previousExGst),
    previousClaimsGst: currency(previousGst),
    previousClaimsIncGst: currency(previousIncGst),
    cumulativeTargetExGst: currency(cumulativeTargetExGst),
    cumulativeTargetGst: currency(cumulativeTargetGst),
    cumulativeTargetIncGst: currency(cumulativeTargetIncGst),
    currentClaimExGst: currency(currentExGst),
    currentClaimGst: currency(currentGst),
    currentClaimIncGst: currency(currentIncGst),
    cumulativePercentage: percentage(cumulativePercentage),
    remainingExGst: currency(remainingExGst),
    remainingGst: currency(remainingGst),
    remainingIncGst: currency(remainingIncGst),
  }
}
