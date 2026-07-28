import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getQuote } from '@/lib/actions/quotes'
import { QuoteDetailView } from '@/components/quote-detail/quote-detail-view'
import { Alert } from '@/components/ui/card'

interface QuoteDetailPageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function QuoteDetailPage({ params, searchParams }: QuoteDetailPageProps) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const result = await getQuote(id)
  if (!result.ok) {
    return (
      <main>
        <div className="pbc-page">
          <div className="pbc-pagehead">
            <h1>Quote could not be loaded</h1>
            <p>Refresh and try again. If this keeps happening, the quote was saved but the detail view could not read it.</p>
          </div>
          <Alert tone="danger" live={false}>{result.error}</Alert>
          <Link href="/quotes" className="pbc-btn pbc-btn--ghost">
            Back to Quotes
          </Link>
        </div>
      </main>
    )
  }
  if (!result.data) notFound()

  const quote = result.data
  // sync는 저장 응답 후 백그라운드로 진행되므로, 실제 synced 상태일 때만 성공 배너를 신뢰한다
  const showSyncedNotice = resolvedSearchParams?.synced === '1' && quote.jobberSyncStatus === 'synced'

  return <QuoteDetailView quote={quote} showSyncedNotice={showSyncedNotice} />
}
