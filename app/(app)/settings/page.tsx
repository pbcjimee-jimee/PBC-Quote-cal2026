import { IntentLink } from '@/components/navigation/intent-link'
import { SettingsForm } from '@/components/settings/settings-form'
import { Icons } from '@/components/ui/icons'
import { getPricingSettings } from '@/lib/actions/settings'
import type { ActionResult } from '@/lib/actions/types'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import type { PricingSettings } from '@/lib/calculator'

function formatErrorMessage(error: unknown, label: string) {
  const text = error instanceof Error ? error.message : 'Unknown error'
  return `${label}: ${text}`
}

async function safeResult<T>(promise: Promise<ActionResult<T>>, label: string): Promise<ActionResult<T>> {
  try {
    return await promise
  } catch (error) {
    return { ok: false, error: formatErrorMessage(error, label) }
  }
}

function normalizeResult<T>(result: ActionResult<T> | undefined | null, label: string): ActionResult<T> {
  if (result && typeof result === 'object' && 'ok' in result) {
    return result
  }
  return { ok: false, error: `${label}: missing result` }
}

export default async function SettingsPage() {
  const rawSettingsResult = await safeResult(getPricingSettings(), 'Failed to load pricing settings')
  const settingsResult = normalizeResult(
    rawSettingsResult as ActionResult<PricingSettings> | undefined,
    'Failed to load pricing settings'
  )

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb"><span>Admin</span>{Icons.arrowDown({ size: 14 })}<b>Settings</b></div>
        <div className="pbc-topbar__right">
          <IntentLink href="/settings/inventory" prefetchOnViewport className="pbc-btn pbc-btn--ghost">{Icons.layers({ size: 15 })} Inventory</IntentLink>
          <IntentLink href="/quotes/new" prefetchOnViewport className="pbc-btn pbc-btn--ghost">{Icons.back({ size: 15 })} Back to quote</IntentLink>
        </div>
      </header>
      <div className="pbc-page">
      <div className="pbc-pagehead">
        <h1>Settings</h1>
        <p>Control labour rates, margins, material pricing, work areas and quote templates.</p>
        {!settingsResult.ok ? <p className="text-[var(--danger)]">{settingsResult.error}</p> : null}
      </div>
      <SettingsForm
        initialSettings={settingsResult.ok ? settingsResult.data : DEFAULT_PRICING_SETTINGS}
      />
      </div>
    </main>
  )
}
