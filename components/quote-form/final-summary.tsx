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

function getMarginBarTone(value: number | null): string {
  if (value === null) return 'bg-slate-300'
  if (value < 20) return 'bg-[var(--danger)]'
  if (value < 35) return 'bg-amber-500'
  return 'bg-[var(--success)]'
}

export function FinalSummary({
  labourTotal,
  materialTotal,
  subtotal,
  finalTotal,
  jobberFinancialSummary,
}: FinalSummaryProps) {
  const gstTotal = Decimal.max(finalTotal.sub(subtotal), 0)

  return (
    <section className="rounded-lg border border-[var(--border)] bg-white p-4">
      <div className="rounded-lg bg-[var(--primary-soft)] px-4 py-4">
        <span className="text-sm font-bold uppercase text-[var(--primary)]">Final total</span>
        <div className="mt-2 font-mono text-4xl font-bold tabular-nums text-slate-950">${subtotal.toFixed(2)}</div>
        <p className="mt-1 text-xs font-medium text-slate-500">Ex GST. GST is shown at the end.</p>
      </div>
      <div className="space-y-2 text-sm">
        <div className="mt-4 flex justify-between">
          <span className="text-slate-500">Labour total</span>
          <span className="font-mono text-slate-900">${labourTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Material total</span>
          <span className="font-mono text-slate-900">${materialTotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Subtotal price</span>
          <span className="font-mono font-semibold text-slate-950">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Total price</span>
          <span className="text-right text-xs font-semibold text-slate-500">Subtotal price + GST</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">GST 10%</span>
          <span className="font-mono text-slate-900">${gstTotal.toFixed(2)}</span>
        </div>
      </div>
      {jobberFinancialSummary ? (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold uppercase text-slate-400">Jobber profit</span>
            <span className="font-mono text-sm font-bold text-slate-950">
              {formatMargin(jobberFinancialSummary.profitMarginPercent)}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Quote total</span>
              <span className="font-mono text-slate-900">{formatJobberMoney(jobberFinancialSummary.quoteTotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Expenses total</span>
              <span className="font-mono text-slate-900">{formatJobberMoney(jobberFinancialSummary.expensesTotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Profit</span>
              <span className="font-mono font-semibold text-slate-950">{formatJobberMoney(jobberFinancialSummary.profit)}</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span>Profit margin</span>
              <span className="font-mono">{formatMargin(jobberFinancialSummary.profitMarginPercent)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${getMarginBarTone(jobberFinancialSummary.profitMarginPercent)}`}
                style={{ width: getMarginBarWidth(jobberFinancialSummary.profitMarginPercent) }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
