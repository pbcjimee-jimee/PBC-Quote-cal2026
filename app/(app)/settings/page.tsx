import { SettingsForm } from '@/components/settings/settings-form'
import { listProducts } from '@/lib/actions/products'
import { getPricingSettings } from '@/lib/actions/settings'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'

export default async function SettingsPage() {
  const [settingsResult, productsResult] = await Promise.all([
    getPricingSettings(),
    listProducts({ limit: 200 }),
  ])

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        {!settingsResult.ok ? <p className="mt-1 text-sm text-red-600">{settingsResult.error}</p> : null}
        {!productsResult.ok ? <p className="mt-1 text-sm text-red-600">{productsResult.error}</p> : null}
      </div>
      <SettingsForm
        initialProducts={productsResult.ok ? productsResult.data : []}
        initialSettings={settingsResult.ok ? settingsResult.data : DEFAULT_PRICING_SETTINGS}
      />
    </main>
  )
}
