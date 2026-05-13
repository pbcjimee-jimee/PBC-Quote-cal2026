import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getQuote } from '@/lib/actions/quotes'

interface QuoteDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function QuoteDetailPage({ params }: QuoteDetailPageProps) {
  const { id } = await params
  const result = await getQuote(id)
  if (!result.ok || !result.data) notFound()

  const quote = result.data

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <Link href="/quotes" className="text-sm text-gray-500 hover:text-gray-900">Back to Quotes</Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{quote.customerName || 'Untitled Quote'}</h1>
        <p className="mt-1 text-sm text-gray-500">{quote.customerAddress || 'No address'}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
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

        <section className="rounded-md border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Materials</h2>
          <div className="mt-4 divide-y divide-gray-100">
            {quote.items.length === 0 ? <p className="text-sm text-gray-500">No materials saved.</p> : null}
            {quote.items.map((item) => (
              <div key={item.id} className="flex justify-between py-3 text-sm">
                <span className="text-gray-900">{item.productNameSnapshot}</span>
                <span className="font-mono text-gray-500">{item.quantity} x ${item.marketPriceSnapshot}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
