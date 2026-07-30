import Decimal from 'decimal.js'
import { getMarginBarTone } from '@/components/quote-form/final-summary'
import type { DecimalFinancialSummary } from '@/lib/jobber/financial-summary'

export function formatAud(value: string): string {
  const [whole, fraction] = new Decimal(value).toFixed(2).split('.')
  const grouped = whole?.replace(/\B(?=(\d{3})+(?!\d))/g, ',') ?? '0'
  return `$${grouped}.${fraction ?? '00'}`
}

export function formatProfitMargin(value: string | null): string {
  return value === null ? '-' : `${new Decimal(value).toFixed(1)}%`
}

export function JobFinancials({ summary, compact = false }: {
  summary: DecimalFinancialSummary
  compact?: boolean
}) {
  const margin = summary.profitMarginPercent === null ? null : new Decimal(summary.profitMarginPercent)
  const marginNumber = margin?.toNumber() ?? null
  const width = margin === null ? '0%' : `${Decimal.min(Decimal.max(margin, 0), 100).toFixed(2)}%`

  if (compact) {
    return (
      <div className="min-w-32">
        <div className="flex justify-between gap-2 text-xs"><span>Expenses</span><b className="pbc-moneytext">{formatAud(summary.expensesTotal)}</b></div>
        <div className="mt-1 flex justify-between gap-2 text-xs"><span>Profit</span><b>{formatProfitMargin(summary.profitMarginPercent)}</b></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className={`h-full rounded-full ${getMarginBarTone(marginNumber)}`} style={{ width }} /></div>
      </div>
    )
  }

  return (
    <section className="pbc-card pbc-card--pad" aria-label="Jobber profit">
      <div className="flex items-center justify-between gap-3"><h2 className="pbc-paneltitle">Jobber profit</h2><b>{formatProfitMargin(summary.profitMarginPercent)}</b></div>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-[var(--muted)]">Job revenue</span><b className="pbc-moneytext">{formatAud(summary.revenue)}</b></div>
        <div className="flex justify-between"><span className="text-[var(--muted)]">Expenses total</span><b className="pbc-moneytext">{formatAud(summary.expensesTotal)}</b></div>
        <div className="flex justify-between"><span className="text-[var(--muted)]">Profit</span><b className="pbc-moneytext">{formatAud(summary.profit)}</b></div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--surface-soft)]"><div className={`h-full rounded-full ${getMarginBarTone(marginNumber)}`} style={{ width }} /></div>
    </section>
  )
}
