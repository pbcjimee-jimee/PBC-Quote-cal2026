import { QuoteForm } from '@/components/quote-form/quote-form'
import { getPricingSettings } from '@/lib/actions/settings'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

export default async function QuoteNewPage() {
  const settings = await getPricingSettings()

  return <QuoteForm settings={settings.ok ? settings.data : DEFAULT_PRICING_SETTINGS} />
}
