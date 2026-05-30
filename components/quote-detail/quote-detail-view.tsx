import Decimal from 'decimal.js'
import Link from 'next/link'
import type { QuoteRecord } from '@/lib/dev-data'
import { JobberQuoteSummary } from '@/components/quote-form/customer-panel'
import { FinalSummary } from '@/components/quote-form/final-summary'
import { OptionTotalsSummary } from '@/components/quote-form/option-totals-summary'
import { calculateAreaSubtotalBreakdown } from '@/components/quote-form/quote-calculation-totals'
import { mapSavedItemsToMaterials } from '@/components/quote-form/quote-record-mappers'
import { QuoteDeleteButton } from '@/components/quote-list/quote-delete-button'

interface QuoteDetailViewProps {
  quote: QuoteRecord
}

function itemMaterialTotal(quote: QuoteRecord): Decimal {
  return quote.items.reduce(
    (total, item) => total.add(new Decimal(item.marketPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
}

function jobberLineTotal(line: QuoteRecord['jobberQuoteLines'][number]): string | null {
  if (line.totalPrice) return new Decimal(line.totalPrice).toFixed(2)
  if (!line.quantity || !line.unitPrice) return null
  return new Decimal(line.quantity).mul(line.unitPrice).toFixed(2)
}

export function QuoteDetailView({ quote }: QuoteDetailViewProps) {
  const materialTotal = itemMaterialTotal(quote)
  const subtotal = new Decimal(quote.subtotal)
  const labourTotal = Decimal.max(subtotal.sub(materialTotal), 0)
  const areaBreakdown = calculateAreaSubtotalBreakdown({
    materials: mapSavedItemsToMaterials(quote.items),
    selectedMin: quote.selectedMin,
    selectedMax: quote.selectedMax,
    areaFormulaSelections: {
      interior: {
        selectedMin: quote.interiorSelectedMin ?? quote.selectedMin,
        selectedMax: quote.interiorSelectedMax ?? quote.selectedMax,
      },
      exterior: {
        selectedMin: quote.exteriorSelectedMin ?? quote.selectedMin,
        selectedMax: quote.exteriorSelectedMax ?? quote.selectedMax,
      },
    },
    settings: quote.pricingSettingsSnapshot,
  })
  const jobberFinancialSummary = quote.jobberSnapshot && !quote.jobberSnapshot.jobExpensesError
    ? quote.jobberSnapshot.financialSummary
    : null
  const creatorName = quote.createdByName ?? quote.createdByEmail ?? 'Unknown user'
  const optionSummaries = quote.options.map((option) => {
    const optionAreaBreakdown = calculateAreaSubtotalBreakdown({
      materials: mapSavedItemsToMaterials(option.items),
      selectedMin: option.selectedMin,
      selectedMax: option.selectedMax,
      settings: quote.pricingSettingsSnapshot,
    })

    return {
      id: option.id,
      title: option.title,
      subtotal: new Decimal(option.subtotal),
      finalTotal: new Decimal(option.finalTotal),
      interiorSubtotal: optionAreaBreakdown.interior.subtotal,
      exteriorSubtotal: optionAreaBreakdown.exterior.subtotal,
    }
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/quotes" className="text-sm font-semibold text-slate-400 hover:text-[var(--primary)]">Back to Quotes</Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{quote.customerName || 'Untitled Quote'}</h1>
          <p className="mt-1 text-sm text-slate-500">{quote.customerAddress || 'No address'}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/quotes/${quote.id}/edit`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
            Edit
          </Link>
          <QuoteDeleteButton quoteId={quote.id} redirectToQuotes />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)]">
          <h2 className="text-sm font-bold uppercase text-slate-400">Summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {quote.jobberQuoteId ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Jobber ID</dt>
                <dd className="min-w-0 truncate font-mono text-slate-950">{quote.jobberQuoteId}</dd>
              </div>
            ) : null}
            {quote.workType ? (
              <div className="flex justify-between"><dt className="text-slate-500">Work Type</dt><dd className="text-slate-950">{quote.workType}</dd></div>
            ) : null}
            <div className="flex justify-between gap-4"><dt className="text-slate-500">Created by</dt><dd className="min-w-0 truncate text-slate-950">{creatorName}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Total Working Days</dt><dd className="font-mono text-slate-950">{quote.workingDays}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Total Labour</dt><dd className="font-mono text-slate-950">{quote.labourPerDay}</dd></div>
            <div className="rounded-lg bg-[var(--primary-soft)] px-4 py-3">
              <dt className="text-xs font-bold uppercase text-[var(--primary)]">Final subtotal ex GST</dt>
              <dd className="mt-1 font-mono text-3xl font-bold text-slate-950">${areaBreakdown.finalSubtotal.toFixed(2)}</dd>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Interior</span>
                  <span className="font-mono font-semibold text-slate-900">${areaBreakdown.interior.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Exterior</span>
                  <span className="font-mono font-semibold text-slate-900">${areaBreakdown.exterior.subtotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)]">
          <h2 className="text-sm font-bold uppercase text-slate-400">Formula Results</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {[
              ['F1', quote.formula1Total],
              ['F2', quote.formula2Total],
              ['F3', quote.formula3Total],
              ['F4', quote.formula4Total],
              ['F5', quote.formula5Total],
            ].map(([label, total], index) => {
              const num = index + 1
              const marker = quote.selectedMin === num ? 'MIN' : quote.selectedMax === num ? 'MAX' : ''
              return (
                <div key={label} className={`flex justify-between rounded-lg px-3 py-2 ${marker === 'MIN' ? 'bg-emerald-50' : marker === 'MAX' ? 'bg-rose-50' : 'bg-slate-50'}`}>
                  <dt className="font-semibold text-slate-600">{label} {marker ? `- ${marker}` : ''}</dt>
                  <dd className="font-mono font-semibold text-slate-950">${total}</dd>
                </div>
              )
            })}
          </dl>
        </section>

        {quote.jobberSnapshot ? (
          <section className="rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)] lg:col-span-2">
            <h2 className="mb-4 text-sm font-bold uppercase text-slate-400">Jobber Data</h2>
            <JobberQuoteSummary quote={quote.jobberSnapshot} />
          </section>
        ) : null}

        <section className="rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)] lg:col-span-2">
          <h2 className="text-sm font-bold uppercase text-slate-400">Internal Memos</h2>
          <div className="mt-4 space-y-3">
            {quote.memos.length === 0 ? <p className="text-sm text-slate-500">No internal memos saved.</p> : null}
            {quote.memos.map((memo, index) => (
              <article key={memo.id} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <h3 className="text-xs font-bold uppercase text-slate-400">Memo {index + 1}</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{memo.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)] lg:col-span-2">
          <h2 className="text-sm font-bold uppercase text-slate-400">App Product / Service</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {quote.jobberQuoteLines.length === 0 ? <p className="text-sm text-slate-500">No product or service lines saved.</p> : null}
            {quote.jobberQuoteLines.map((line) => {
              const total = jobberLineTotal(line)
              return (
                <div key={line.id} className="grid gap-3 py-4 text-sm md:grid-cols-[minmax(0,1fr)_8rem]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-950">{line.name}</h3>
                      <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-500">
                        {line.kind === 'text' ? 'Text' : 'Line item'}
                      </span>
                    </div>
                    {line.description ? <p className="mt-2 whitespace-pre-line text-slate-600">{line.description}</p> : null}
                  </div>
                  <div className="font-mono text-slate-500 md:text-right">
                    {line.kind === 'line_item' && total ? (
                      <>
                        <div>{line.quantity ?? '1'} x ${line.unitPrice ?? '0.00'}</div>
                        <div className="mt-1 font-semibold text-slate-950">${total}</div>
                      </>
                    ) : (
                      <span className="text-xs font-sans font-semibold text-slate-400">Description only</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)] lg:col-span-2">
          <h2 className="text-sm font-bold uppercase text-slate-400">Materials</h2>
          <div className="mt-4 divide-y divide-slate-100">
            {quote.items.length === 0 ? <p className="text-sm text-slate-500">No materials saved.</p> : null}
            {quote.items.map((item) => (
              <div key={item.id} className="flex justify-between py-3 text-sm">
                <span className="text-slate-950">
                  {item.productNameSnapshot}
                  {item.areaNameSnapshot ? <span className="ml-2 text-xs text-slate-500">{item.areaNameSnapshot}</span> : null}
                  {item.workingDays && item.labourPerDay ? (
                    <span className="ml-2 text-xs text-slate-500">{item.workingDays} days x {item.labourPerDay} labour</span>
                  ) : null}
                </span>
                <span className="font-mono text-slate-500">{item.quantity} x ${item.marketPriceSnapshot}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white bg-white/90 p-5 shadow-[var(--shadow-soft)] lg:col-span-2">
          <FinalSummary
            labourTotal={labourTotal}
            materialTotal={materialTotal}
            areaBreakdown={areaBreakdown}
            jobberFinancialSummary={jobberFinancialSummary}
          />
          <OptionTotalsSummary options={optionSummaries} />
        </section>
      </div>
    </main>
  )
}
