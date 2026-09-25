import { QuoteForm } from '@/components/quote-form/quote-form'
import { QuoteLoadError } from '@/components/quote-form/quote-load-error'
import { listAreas } from '@/lib/actions/areas'
import { listQuoteLineTemplates } from '@/lib/actions/quote-line-templates'
import { getPricingSettings } from '@/lib/actions/settings'
import { isJobberDisabledInPreview, JOBBER_DISABLED_MESSAGE } from '@/lib/jobber/environment'

export default async function QuoteNewPage() {
  const jobberEnabled = !isJobberDisabledInPreview()
  const [settings, areas, quoteLineTemplates] = await Promise.allSettled([
    getPricingSettings(),
    listAreas(),
    listQuoteLineTemplates(),
  ])

  const unavailable: Array<'Pricing settings' | 'Areas'> = []
  if (settings.status === 'rejected' || !settings.value.ok) unavailable.push('Pricing settings')
  if (areas.status === 'rejected' || !areas.value.ok) unavailable.push('Areas')

  if (settings.status !== 'fulfilled' || !settings.value.ok || areas.status !== 'fulfilled' || !areas.value.ok) {
    return <QuoteLoadError mode="new" unavailable={unavailable} />
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
        settings={settings.value.data}
        jobberEnabled={jobberEnabled}
        jobberNotice={jobberEnabled ? undefined : JOBBER_DISABLED_MESSAGE}
      />
    </>
  )
}
