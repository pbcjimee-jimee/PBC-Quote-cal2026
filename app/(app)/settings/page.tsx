import { SettingsForm } from '@/components/settings/settings-form'
import { listAreas } from '@/lib/actions/areas'
import { listProducts } from '@/lib/actions/products'
import { getPricingSettings } from '@/lib/actions/settings'
import type { ActionResult } from '@/lib/actions/types'
import type { AreaRecord } from '@/lib/areas/types'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import type { ProductRecord } from '@/lib/products/types'
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

type SettingsPageState = {
  settings: ActionResult<PricingSettings>
  products: ActionResult<ProductRecord[]>
  areas: ActionResult<AreaRecord[]>
}

function normalizeResult<T>(result: ActionResult<T> | undefined | null, label: string): ActionResult<T> {
  if (result && typeof result === 'object' && 'ok' in result) {
    return result
  }
  return { ok: false, error: `${label}: missing result` }
}

export default async function SettingsPage() {
  const [
    rawSettingsResult,
    rawProductsResult,
    rawAreasResult,
  ] = await Promise.all([
    safeResult(getPricingSettings(), 'Failed to load pricing settings'),
    safeResult(listProducts({ limit: 200 }), 'Failed to load products'),
    safeResult(listAreas(), 'Failed to load areas'),
  ])

  const normalized: SettingsPageState = {
    settings: normalizeResult(rawSettingsResult as ActionResult<PricingSettings> | undefined, 'Failed to load pricing settings'),
    products: normalizeResult(rawProductsResult as ActionResult<ProductRecord[]> | undefined, 'Failed to load products'),
    areas: normalizeResult(rawAreasResult as ActionResult<AreaRecord[]> | undefined, 'Failed to load areas'),
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        {!normalized.settings.ok ? (
          <p className="mt-1 text-sm text-red-600">{normalized.settings.error}</p>
        ) : null}
        {!normalized.products.ok ? (
          <p className="mt-1 text-sm text-red-600">{normalized.products.error}</p>
        ) : null}
        {!normalized.areas.ok ? <p className="mt-1 text-sm text-red-600">{normalized.areas.error}</p> : null}
      </div>
      <SettingsForm
        initialAreas={normalized.areas.ok ? normalized.areas.data : []}
        initialProducts={normalized.products.ok ? normalized.products.data : []}
        initialSettings={normalized.settings.ok ? normalized.settings.data : DEFAULT_PRICING_SETTINGS}
      />
    </main>
  )
}
