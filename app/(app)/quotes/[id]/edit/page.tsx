import { notFound } from 'next/navigation'
import { QuoteForm } from '@/components/quote-form/quote-form'
import { listAreas } from '@/lib/actions/areas'
import { listQuoteLineTemplates } from '@/lib/actions/quote-line-templates'
import { getQuote } from '@/lib/actions/quotes'
import { getPricingSettings } from '@/lib/actions/settings'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

interface QuoteEditPageProps {
  params: Promise<{ id: string }>
}

export default async function QuoteEditPage({ params }: QuoteEditPageProps) {
  const { id } = await params
  const [quote, settings, areas, quoteLineTemplates] = await Promise.all([
    getQuote(id),
    getPricingSettings(),
    listAreas(),
    listQuoteLineTemplates(),
  ])

  if (!quote.ok || !quote.data) notFound()

  return (
    <QuoteForm
      areas={areas.ok ? areas.data : []}
      quoteLineTemplates={quoteLineTemplates.ok ? quoteLineTemplates.data : []}
      initialQuote={quote.data}
      settings={quote.data.pricingSettingsSnapshot ?? (settings.ok ? settings.data : DEFAULT_PRICING_SETTINGS)}
    />
  )
}
