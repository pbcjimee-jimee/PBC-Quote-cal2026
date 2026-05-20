import Link from 'next/link'
import type { QuoteRecord } from '@/lib/dev-data'
import { QuoteDeleteButton } from './quote-delete-button'

export function QuoteCard({ quote }: { quote: QuoteRecord }) {
  const title = quote.customerName || 'Untitled Quote'
  const savedDate = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(quote.createdAt))
  const creatorName = quote.createdByName ?? quote.createdByEmail ?? 'Unknown user'

  return (
    <article className="rounded-lg border border-white bg-white/90 p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-slate-950">{title}</h2>
          <p className="mt-1 truncate text-sm text-slate-500">
            {quote.customerAddress || 'No address'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
            <span className="rounded-full bg-slate-50 px-2.5 py-1">{quote.workingDays} days</span>
            <span className="rounded-full bg-slate-50 px-2.5 py-1">{quote.labourPerDay} total labour</span>
            <span className="rounded-full bg-slate-50 px-2.5 py-1">{savedDate}</span>
            <span className="rounded-full bg-slate-50 px-2.5 py-1">Created by {creatorName}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-bold text-slate-950">${quote.subtotal}</div>
          <div className="text-xs font-semibold text-slate-400">ex GST</div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Link href={`/quotes/${quote.id}`} className="rounded-lg bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-bold text-[var(--primary)] hover:bg-blue-100">
              View
            </Link>
            <Link href={`/quotes/${quote.id}/edit`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
              Edit
            </Link>
            <QuoteDeleteButton quoteId={quote.id} />
          </div>
        </div>
      </div>
    </article>
  )
}
