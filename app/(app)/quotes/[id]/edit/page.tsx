import { notFound } from 'next/navigation'
import { QuoteForm } from '@/components/quote-form/quote-form'
import { QuoteLoadError } from '@/components/quote-form/quote-load-error'
import { listAreas } from '@/lib/actions/areas'
import { listQuoteLineTemplates } from '@/lib/actions/quote-line-templates'
import { getQuote } from '@/lib/actions/quotes'
import { getPricingSettings } from '@/lib/actions/settings'
import { isJobberDisabledInPreview, JOBBER_DISABLED_MESSAGE } from '@/lib/jobber/environment'

interface QuoteEditPageProps {
  params: Promise<{ id: string }>
}

export default async function QuoteEditPage({ params }: QuoteEditPageProps) {
  const jobberEnabled = !isJobberDisabledInPreview()
  const { id } = await params
  const [quote, settings, areas, quoteLineTemplates] = await Promise.allSettled([
    getQuote(id),
    getPricingSettings(),
    listAreas(),
    listQuoteLineTemplates(),
  ])

  if (quote.status !== 'fulfilled' || !quote.value.ok) {
    return <QuoteLoadError mode="edit" unavailable={['Quote']} />
  }
  if (!quote.value.data) notFound()

  const unavailable: Array<'Pricing settings' | 'Areas'> = []
  if (settings.status === 'rejected' || !settings.value.ok) unavailable.push('Pricing settings')
  if (areas.status === 'rejected' || !areas.value.ok) unavailable.push('Areas')

  if (settings.status !== 'fulfilled' || !settings.value.ok || areas.status !== 'fulfilled' || !areas.value.ok) {
    return <QuoteLoadError mode="edit" unavailable={unavailable} />
  }

  const templates = quoteLineTemplates.status === 'fulfilled' && quoteLineTemplates.value.ok
    ? quoteLineTemplates.value.data
    : null

  return (
    <>
      {templates === null ? (
        <p className="pbc-alert pbc-alert--warning mx-4 mt-4" role="status">
          Templates are unavailable. You can still add Product / Service lines manually. Save your work before reloading to try templates again.
        </p>
      ) : null}
      <QuoteForm
        areas={areas.value.data}
        quoteLineTemplates={templates ?? []}
        initialQuote={quote.value.data}
        settings={quote.value.data.pricingSettingsSnapshot ?? settings.value.data}
        jobberEnabled={jobberEnabled}
        jobberNotice={jobberEnabled ? undefined : JOBBER_DISABLED_MESSAGE}
      />
    </>
  )
}
