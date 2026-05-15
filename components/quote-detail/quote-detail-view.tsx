import Decimal from 'decimal.js'
import Link from 'next/link'
import type { QuoteRecord } from '@/lib/dev-data'
import { JobberQuoteSummary } from '@/components/quote-form/customer-panel'
import { FinalSummary } from '@/components/quote-form/final-summary'
import { OptionTotalsSummary } from '@/components/quote-form/option-totals-summary'
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

export function QuoteDetailView({ quote }: QuoteDetailViewProps) {
  const materialTotal = itemMaterialTotal(quote)
  const subtotal = new Decimal(quote.subtotal)
  const finalTotal = new Decimal(quote.finalTotal)
  const labourTotal = Decimal.max(subtotal.sub(materialTotal), 0)
  const optionSummaries = quote.options.map((option) => ({
    id: option.id,
    title: option.title,
    finalTotal: new Decimal(option.finalTotal),
  }))

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/quotes" className="text-sm text-gray-500 hover:text-gray-900">Back to Quotes</Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{quote.customerName || 'Untitled Quote'}</h1>
          <p className="mt-1 text-sm text-gray-500">{quote.customerAddress || 'No address'}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/quotes/${quote.id}/edit`} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Edit
          </Link>
          <QuoteDeleteButton quoteId={quote.id} redirectToQuotes />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {quote.jobberQuoteId ? (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Jobber ID</dt>
                <dd className="min-w-0 truncate font-mono text-gray-900">{quote.jobberQuoteId}</dd>
              </div>
            ) : null}
            {quote.workType ? (
              <div className="flex justify-between"><dt className="text-gray-500">Work Type</dt><dd className="text-gray-900">{quote.workType}</dd></div>
            ) : null}
            <div className="flex justify-between"><dt className="text-gray-500">Working Days</dt><dd className="font-mono text-gray-900">{quote.workingDays}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Labour Per Day</dt><dd className="font-mono text-gray-900">{quote.labourPerDay}</dd></div>
            <div className="flex justify-between border-t border-gray-200 pt-3"><dt className="font-semibold text-gray-900">Final</dt><dd className="font-mono font-bold text-gray-900">${quote.finalTotal}</dd></div>
          </dl>
        </section>

        <section className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Formula Results</h2>
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
                <div key={label} className="flex justify-between">
                  <dt className="text-gray-500">{label} {marker ? `- ${marker}` : ''}</dt>
                  <dd className="font-mono text-gray-900">${total}</dd>
                </div>
              )
            })}
          </dl>
        </section>

        {quote.jobberSnapshot ? (
          <section className="rounded-md border border-gray-200 bg-white p-5 lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Jobber Data</h2>
            <JobberQuoteSummary quote={quote.jobberSnapshot} />
          </section>
        ) : null}

        <section className="rounded-md border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Materials</h2>
          <div className="mt-4 divide-y divide-gray-100">
            {quote.items.length === 0 ? <p className="text-sm text-gray-500">No materials saved.</p> : null}
            {quote.items.map((item) => (
              <div key={item.id} className="flex justify-between py-3 text-sm">
                <span className="text-gray-900">
                  {item.productNameSnapshot}
                  {item.areaNameSnapshot ? <span className="ml-2 text-xs text-gray-500">{item.areaNameSnapshot}</span> : null}
                  {item.workingDays && item.labourPerDay ? (
                    <span className="ml-2 text-xs text-gray-500">{item.workingDays} days x {item.labourPerDay} labour</span>
                  ) : null}
                </span>
                <span className="font-mono text-gray-500">{item.quantity} x ${item.marketPriceSnapshot}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-gray-200 bg-white p-5 lg:col-span-2">
          <FinalSummary
            labourTotal={labourTotal}
            materialTotal={materialTotal}
            subtotal={subtotal}
            finalTotal={finalTotal}
            jobberFinancialSummary={quote.jobberSnapshot?.financialSummary ?? null}
          />
          <OptionTotalsSummary options={optionSummaries} />
        </section>
      </div>
    </main>
  )
}
