import { QuoteForm } from '@/components/quote-form/quote-form'
import { QuoteLoadError } from '@/components/quote-form/quote-load-error'
import { listAreas } from '@/lib/actions/areas'
import { listQuoteLineTemplates } from '@/lib/actions/quote-line-templates'
import { getPricingSettings } from '@/lib/actions/settings'
import { isJobberDisabledInPreview, JOBBER_DISABLED_MESSAGE } from '@/lib/jobber/environment'
import { isDevNoAuthMode } from '@/lib/actions/types'
import { requireRole } from '@/lib/security/require-app-user'
import { getAiQuoteAvailabilityForUser } from '@/lib/ai-quote/access'
import { loadActiveKnowledge } from '@/lib/ai-quote/data'
import { createClient } from '@/lib/supabase/server'

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
  const appUser = isDevNoAuthMode() ? null : await requireRole('admin')
  const userId = appUser === null ? 'dev-no-auth' : appUser.ok ? appUser.user.id : undefined
  const aiAvailability = getAiQuoteAvailabilityForUser(appUser?.ok ? appUser.user.email ?? appUser.profile.email : null)
  let hasActiveAiKnowledge = false
  if (appUser?.ok && aiAvailability.enabled) {
    try {
      hasActiveAiKnowledge = await loadActiveKnowledge(await createClient()) !== null
    } catch {
      hasActiveAiKnowledge = false
    }
  }

  return (
    <>
      {templates === null ? (
        <p className="pbc-alert pbc-alert--warning mx-4 mt-4" role="status">
          Templates are unavailable. You can still add Product / Service lines manually. Save your work before reloading to try templates again.
        </p>
      ) : null}
      <QuoteForm
        key={userId}
        userId={userId}
        aiAvailability={aiAvailability}
        hasActiveAiKnowledge={hasActiveAiKnowledge}
        areas={areas.value.data}
        quoteLineTemplates={templates ?? []}
        settings={settings.value.data}
        jobberEnabled={jobberEnabled}
        jobberNotice={jobberEnabled ? undefined : JOBBER_DISABLED_MESSAGE}
      />
    </>
  )
}
