import Decimal from 'decimal.js'
import type { JobberQuoteFinancialSummary } from '@/lib/jobber/mapper'

interface FinalSummaryProps {
  labourTotal: Decimal
  materialTotal: Decimal
  subtotal: Decimal
  finalTotal: Decimal
  jobberFinancialSummary: JobberQuoteFinancialSummary | null
}

function formatJobberMoney(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(value)
}

function formatMargin(value: number | null): string {
  return value === null ? '-' : `${value.toFixed(1)}%`
}

function getMarginBarWidth(value: number | null): string {
  if (value === null) return '0%'
  return `${Math.min(Math.max(value, 0), 100)}%`
}

export function FinalSummary({
  labourTotal,
  materialTotal,
  subtotal,
  finalTotal,
  jobberFinancialSummary,
}: FinalSummaryProps) {
  return (
    <section className="border-t border-gray-200 pt-4">
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Labour total</span>
          <span className="font-mono text-gray-900">${labourTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Material total</span>
          <span className="font-mono text-gray-900">${materialTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Subtotal</span>
          <span className="font-mono font-semibold text-gray-900">${subtotal.toFixed(2)}</span>
        </div>
      </div>
      <div className="mt-4 flex items-end justify-between border-t border-gray-200 pt-4">
        <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">Final</span>
        <span className="font-mono text-2xl font-bold tabular-nums text-gray-900">${finalTotal.toFixed(2)}</span>
      </div>
      {jobberFinancialSummary ? (
        <div className="mt-5 border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">Jobber profit</span>
            <span className="font-mono text-sm font-semibold text-gray-900">
              {formatMargin(jobberFinancialSummary.profitMarginPercent)}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Quote total</span>
              <span className="font-mono text-gray-900">{formatJobberMoney(jobberFinancialSummary.quoteTotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Expenses total</span>
              <span className="font-mono text-gray-900">{formatJobberMoney(jobberFinancialSummary.expensesTotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gray-500">Profit</span>
              <span className="font-mono font-semibold text-gray-900">{formatJobberMoney(jobberFinancialSummary.profit)}</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
              <span>Profit margin</span>
              <span className="font-mono">{formatMargin(jobberFinancialSummary.profitMarginPercent)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-green-600"
                style={{ width: getMarginBarWidth(jobberFinancialSummary.profitMarginPercent) }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
