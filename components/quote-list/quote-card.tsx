import Link from 'next/link'
import type { QuoteRecord } from '@/lib/dev-data'
import { buttonClassName } from '@/components/ui/card'
import { Icons } from '@/components/ui/icons'
import { QuoteDeleteButton } from './quote-delete-button'
import { QuoteDuplicateButton } from './quote-duplicate-button'

const OVERVIEW_DATE_FORMATTER = new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
const CARD_DATE_FORMATTER = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' })

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

function isExterior(workType: string | null): boolean {
  return (workType ?? '').toLowerCase().includes('exterior')
}

/** Overview 리스트 행 (디자인 .pbc-qrow) */
export function OverviewQuoteRow({ quote }: { quote: QuoteRecord }) {
  const title = quote.customerName || 'Untitled Quote'
  const tone = isExterior(quote.workType) ? 'ext' : 'int'
  const savedDate = OVERVIEW_DATE_FORMATTER.format(new Date(quote.createdAt))

  return (
    <Link className="pbc-qrow" href={`/quotes/${quote.id}`}>
      <span className={`pbc-qrow__av pbc-qrow__av--${tone}`}>{initials(title)}</span>
      <span className="pbc-qrow__main">
        <span className="pbc-qrow__name">{title}</span>
        <span className="pbc-qrow__addr">{quote.customerAddress || 'No address'}</span>
      </span>
      <span className="pbc-qrow__scope">
        <span className={`pbc-tag pbc-tag--${tone}`}>{tone === 'ext' ? 'Exterior' : 'Interior'}</span>
      </span>
      <span className="pbc-qrow__days">{quote.workingDays} <i>days</i></span>
      <span className="pbc-qrow__date">{savedDate}</span>
      <span className="pbc-qrow__amt mono">${quote.subtotal}</span>
      <span className="pbc-qrow__go">{Icons.arrowDown({ size: 16 })}</span>
    </Link>
  )
}

/** 카드형 (보존용) */
export function QuoteCard({ quote }: { quote: QuoteRecord }) {
  const title = quote.customerName || 'Untitled Quote'
  const savedDate = CARD_DATE_FORMATTER.format(new Date(quote.createdAt))
  const creatorName = quote.createdByName ?? quote.createdByEmail ?? 'Unknown user'

  return (
    <article className="pbc-card pbc-card--pad hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-[var(--foreground)]">{title}</h2>
          <p className="mt-1 truncate text-sm text-[var(--muted)]">{quote.customerAddress || 'No address'}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[var(--muted)]">
            <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1">{quote.workingDays} days</span>
            <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1">{quote.labourPerDay} total labour</span>
            <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1">{savedDate}</span>
            <span className="rounded-full bg-[var(--surface-soft)] px-2.5 py-1">Created by {creatorName}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-lg font-bold text-[var(--foreground)]">${quote.subtotal}</div>
          <div className="text-xs font-semibold text-[var(--muted-2)]">ex GST</div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Link href={`/quotes/${quote.id}`} className={buttonClassName({ variant: 'soft', size: 'sm' })}>
              View
            </Link>
            <Link href={`/quotes/${quote.id}/edit`} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
              Edit
            </Link>
            <QuoteDuplicateButton quoteId={quote.id} />
            <QuoteDeleteButton quoteId={quote.id} />
          </div>
        </div>
      </div>
    </article>
  )
}
