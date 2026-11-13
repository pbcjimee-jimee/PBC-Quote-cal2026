import { notFound } from 'next/navigation'
import { getQuote } from '@/lib/actions/quotes'
import { QuoteDetailView } from '@/components/quote-detail/quote-detail-view'
import { isJobberDisabledInPreview, JOBBER_DISABLED_MESSAGE } from '@/lib/jobber/environment'

interface QuoteDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sync?: string | string[] }>
}

export default async function QuoteDetailPage({ params, searchParams }: QuoteDetailPageProps) {
  const jobberEnabled = !isJobberDisabledInPreview()
  const { id } = await params
  const { sync } = await searchParams
  const result = await getQuote(id)
  if (!result.ok) {
    return (
      <main>
        <div className="pbc-page">
          <div className="pbc-pagehead">
            <h1>Quote could not be loaded</h1>
            <p>Refresh and try again. If this keeps happening, the quote was saved but the detail view could not read it.</p>
            <p className="pbc-alert pbc-alert--danger">{result.error}</p>
          </div>
        </div>
      </main>
    )
  }
  if (!result.data) notFound()

  const quote = result.data

  return (
    <QuoteDetailView
      quote={quote}
      jobberEnabled={jobberEnabled}
      syncNotStarted={sync === 'not-started'}
      jobberNotice={jobberEnabled ? undefined : JOBBER_DISABLED_MESSAGE}
    />
  )
}
