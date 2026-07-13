import { QuoteForm } from '@/components/quote-form/quote-form'
import { listAreas } from '@/lib/actions/areas'
import { listQuoteLineTemplates } from '@/lib/actions/quote-line-templates'
import { getPricingSettings } from '@/lib/actions/settings'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

export default async function QuoteNewPage() {
  const [settings, areas, quoteLineTemplates] = await Promise.all([
    getPricingSettings(),
    listAreas(),
    listQuoteLineTemplates(),
  ])

  return (
    <QuoteForm
      areas={areas.ok ? areas.data : []}
      quoteLineTemplates={quoteLineTemplates.ok ? quoteLineTemplates.data : []}
      settings={settings.ok ? settings.data : DEFAULT_PRICING_SETTINGS}
    />
  )
}
