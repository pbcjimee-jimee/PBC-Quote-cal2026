import Link from 'next/link'
import type { QuoteRecord } from '@/lib/dev-data'

export function QuoteCard({ quote }: { quote: QuoteRecord }) {
  const title = quote.customerName || 'Untitled Quote'
  const savedDate = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(quote.createdAt))

  return (
    <article className="rounded-md border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">
            {quote.customerAddress || 'No address'} - {quote.workingDays} days x {quote.labourPerDay} labour - {savedDate}
          </p>
        </div>
        <div className="text-right">
          <div className="font-mono text-sm font-semibold text-gray-900">${quote.finalTotal}</div>
          <Link href={`/quotes/${quote.id}`} className="mt-2 inline-block text-sm text-blue-600 hover:text-blue-700">
            View
          </Link>
        </div>
      </div>
    </article>
  )
}
