import Link from 'next/link'
import { SettingsForm } from '@/components/settings/settings-form'
import { Icons } from '@/components/ui/icons'
import { listAreas } from '@/lib/actions/areas'
import { listProductServices } from '@/lib/actions/product-services'
import { listProducts } from '@/lib/actions/products'
import { listQuoteLineTemplates } from '@/lib/actions/quote-line-templates'
import { getPricingSettings } from '@/lib/actions/settings'
import type { ActionResult } from '@/lib/actions/types'
import type { AreaRecord } from '@/lib/areas/types'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import type { ProductRecord } from '@/lib/products/types'
import type { PricingSettings } from '@/lib/calculator'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'

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
  productServices: ActionResult<ProductServiceRecord[]>
  quoteLineTemplates: ActionResult<QuoteLineTemplateRecord[]>
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
    rawProductServicesResult,
    rawQuoteLineTemplatesResult,
    rawAreasResult,
  ] = await Promise.all([
    safeResult(getPricingSettings(), 'Failed to load pricing settings'),
    safeResult(listProducts({ limit: 200 }), 'Failed to load products'),
    safeResult(listProductServices({ limit: 300 }), 'Failed to load product services'),
    safeResult(listQuoteLineTemplates(), 'Failed to load quote line templates'),
    safeResult(listAreas(), 'Failed to load areas'),
  ])

  const normalized: SettingsPageState = {
    settings: normalizeResult(rawSettingsResult as ActionResult<PricingSettings> | undefined, 'Failed to load pricing settings'),
    products: normalizeResult(rawProductsResult as ActionResult<ProductRecord[]> | undefined, 'Failed to load products'),
    productServices: normalizeResult(rawProductServicesResult as ActionResult<ProductServiceRecord[]> | undefined, 'Failed to load product services'),
    quoteLineTemplates: normalizeResult(rawQuoteLineTemplatesResult as ActionResult<QuoteLineTemplateRecord[]> | undefined, 'Failed to load quote line templates'),
    areas: normalizeResult(rawAreasResult as ActionResult<AreaRecord[]> | undefined, 'Failed to load areas'),
  }

  const loadErrors = [
    !normalized.settings.ok ? normalized.settings.error : null,
    !normalized.products.ok ? normalized.products.error : null,
    !normalized.productServices.ok ? normalized.productServices.error : null,
    !normalized.quoteLineTemplates.ok ? normalized.quoteLineTemplates.error : null,
    !normalized.areas.ok ? normalized.areas.error : null,
  ].filter((value): value is string => Boolean(value))

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb"><span>Admin</span>{Icons.arrowDown({ size: 14 })}<b>Settings</b></div>
        <div className="pbc-topbar__right">
          <Link href="/settings/inventory" className="pbc-btn pbc-btn--ghost">{Icons.layers({ size: 15 })} Inventory</Link>
          <Link href="/quotes/new" className="pbc-btn pbc-btn--ghost">{Icons.back({ size: 15 })} Back to quote</Link>
        </div>
      </header>
      <div className="pbc-page">
      <div className="pbc-pagehead">
        <h1>Settings</h1>
        <p>Control labour rates, margins, material pricing, work areas and quote templates.</p>
        {loadErrors.map((error) => (
          <p key={error} className="text-[var(--danger)]">{error}</p>
        ))}
      </div>
      <SettingsForm
        initialAreas={normalized.areas.ok ? normalized.areas.data : []}
        initialProducts={normalized.products.ok ? normalized.products.data : []}
        initialProductServices={normalized.productServices.ok ? normalized.productServices.data : []}
        initialQuoteLineTemplates={normalized.quoteLineTemplates.ok ? normalized.quoteLineTemplates.data : []}
        initialSettings={normalized.settings.ok ? normalized.settings.data : DEFAULT_PRICING_SETTINGS}
      />
      </div>
    </main>
  )
}
