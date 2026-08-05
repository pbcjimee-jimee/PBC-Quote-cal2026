import Decimal from 'decimal.js'

export interface JobberQuoteFinancialSummary {
  quoteTotal: number
  expensesTotal: number
  profit: number
  profitMarginPercent: number | null
}

export interface DecimalFinancialSummary {
  revenue: string
  expensesTotal: string
  profit: string
  profitMarginPercent: string | null
}

export interface EstimatedProfitSummary {
  readonly profit: string
  readonly profitMarginPercent: string | null
}

type FinancialLineItem = { readonly totalPrice: Decimal.Value }
type FinancialExpenseJob = {
  readonly expenses: readonly { readonly total: Decimal.Value | null }[]
}

export function calculateFinancialSummaryFromAmounts(
  revenueValue: Decimal.Value,
  expenseValues: readonly Decimal.Value[],
): DecimalFinancialSummary {
  const revenue = new Decimal(revenueValue)
  const expensesTotal = expenseValues.reduce<Decimal>((total, value) => total.add(value), new Decimal(0))
  const profit = revenue.sub(expensesTotal)
  const profitMarginPercent = revenue.gt(0)
    ? profit.div(revenue).mul(100).toDecimalPlaces(6).toString()
    : null

  return {
    revenue: revenue.toDecimalPlaces(2).toString(),
    expensesTotal: expensesTotal.toDecimalPlaces(2).toString(),
    profit: profit.toDecimalPlaces(2).toString(),
    profitMarginPercent,
  }
}

export function calculateEstimatedProfit(
  revenueValue: Decimal.Value,
  estimatedLabourValue: Decimal.Value,
): EstimatedProfitSummary {
  const revenue = new Decimal(revenueValue)
  const profit = revenue.sub(estimatedLabourValue)
  const profitMarginPercent = revenue.gt(0)
    ? profit.div(revenue).mul(100).toDecimalPlaces(6).toString()
    : null

  return {
    profit: profit.toDecimalPlaces(2).toString(),
    profitMarginPercent,
  }
}

export function calculateFinancialSummary(
  productsAndServices: readonly FinancialLineItem[],
  jobExpenses: readonly FinancialExpenseJob[],
  sourceTotal?: Decimal.Value,
): JobberQuoteFinancialSummary {
  const quoteTotal = sourceTotal === undefined
    ? productsAndServices.reduce<Decimal>((total, item) => total.add(item.totalPrice), new Decimal(0))
    : new Decimal(sourceTotal)
  const expenseValues = jobExpenses.flatMap((job) => (
    job.expenses.flatMap((expense) => expense.total === null ? [] : [expense.total])
  ))
  const summary = calculateFinancialSummaryFromAmounts(quoteTotal, expenseValues)

  return {
    quoteTotal: new Decimal(summary.revenue).toNumber(),
    expensesTotal: new Decimal(summary.expensesTotal).toNumber(),
    profit: new Decimal(summary.profit).toNumber(),
    profitMarginPercent: summary.profitMarginPercent === null
      ? null
      : new Decimal(summary.profitMarginPercent).toDecimalPlaces(1).toNumber(),
  }
}
