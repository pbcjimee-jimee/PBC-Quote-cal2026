import Decimal from 'decimal.js'
import type { JobberQuoteFinancialSummary } from '@/lib/jobber/mapper'
import type { AreaSubtotalBreakdown } from './quote-calculation-totals'

interface FinalSummaryProps {
  labourTotal: Decimal
  materialTotal: Decimal
  areaBreakdown: AreaSubtotalBreakdown
  jobberFinancialSummary: JobberQuoteFinancialSummary | null
  framed?: boolean
  className?: string
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
  if (value === null) return 'bg-[var(--muted-2)]'
  if (value < 20) return 'bg-[var(--danger)]'
  if (value < 35) return 'bg-amber-500'
  return 'bg-[var(--success)]'
}

export function FinalSummary({
  labourTotal,
  materialTotal,
  areaBreakdown,
  jobberFinancialSummary,
  framed = true,
  className = '',
}: FinalSummaryProps) {
  const visibleSubtotal = areaBreakdown.finalSubtotal
  const visibleFinalTotal = areaBreakdown.finalTotal
  const gstTotal = Decimal.max(visibleFinalTotal.sub(visibleSubtotal), 0)
  const unassignedLabel = areaBreakdown.unassigned.count === 1 ? 'material row needs' : 'material rows need'
  const sectionClassName = `${framed ? 'pbc-card pbc-summary' : 'pbc-summary'} ${className}`.trim()

  return (
    <section className={sectionClassName}>
      <div className="pbc-summary__hero">
        <span className="pbc-summary__heroLabel">Final subtotal</span>
        <div className="pbc-summary__heroValue mono">${visibleSubtotal.toFixed(2)}</div>
        <p className="pbc-summary__heroSub">Ex GST. Interior, exterior, and roof are calculated separately.</p>
      </div>
      <div className="pbc-summary__rows">
        <div className="pbc-srow pbc-srow--strong"><span>Final subtotal</span><span className="mono">${visibleSubtotal.toFixed(2)}</span></div>
        <div className="pbc-srow"><span>Labour total</span><span className="mono">${labourTotal.toFixed(2)}</span></div>
        <div className="pbc-srow"><span>Material total</span><span className="mono">${materialTotal.toFixed(2)}</span></div>
        <div className="pbc-srow"><span>GST 10%</span><span className="mono">${gstTotal.toFixed(2)}</span></div>
        {areaBreakdown.unassigned.count > 0 ? (
          <p className="pbc-alert pbc-alert--warning mt-3">
            {areaBreakdown.unassigned.count} {unassignedLabel} an Interior, Exterior, or Roof area before being included in grouped subtotals.
          </p>
        ) : null}
      </div>
      <div className="pbc-summary__chips">
        <span className="pbc-statchip">Interior subtotal <b className="mono">${areaBreakdown.interior.subtotal.toFixed(2)}</b></span>
        <span className="pbc-statchip">Exterior subtotal <b className="mono">${areaBreakdown.exterior.subtotal.toFixed(2)}</b></span>
        <span className="pbc-statchip">Roof subtotal <b className="mono">${areaBreakdown.roof.subtotal.toFixed(2)}</b></span>
      </div>
      {jobberFinancialSummary ? (
        <div className="border-t border-[var(--border-soft)] px-[22px] pb-5 pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="pbc-paneltitle">Jobber profit</span>
            <span className="pbc-moneytext text-sm">
              {formatMargin(jobberFinancialSummary.profitMarginPercent)}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-[var(--muted)]">Quote total</span>
              <span className="pbc-moneytext">{formatJobberMoney(jobberFinancialSummary.quoteTotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[var(--muted)]">Expenses total</span>
              <span className="pbc-moneytext">{formatJobberMoney(jobberFinancialSummary.expensesTotal)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[var(--muted)]">Profit</span>
              <span className="pbc-moneytext">{formatJobberMoney(jobberFinancialSummary.profit)}</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-[var(--muted)]">
              <span>Profit margin</span>
              <span className="font-mono">{formatMargin(jobberFinancialSummary.profitMarginPercent)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[var(--surface-soft)]">
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
