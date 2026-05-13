'use server'

import {
  type QuoteRecord,
} from '@/lib/dev-data'
import {
  calculateAllFormulas,
  calculateFinal,
  calculateSubtotal,
} from '@/lib/calculator'
import { calculateFormulaLabourDays } from '@/lib/quote-labour'
import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/supabase/types'
import { quoteSchema } from '@/lib/validators'
import { getPricingSettings } from './settings'
import type { ActionResult } from './types'
import { isDevNoAuthMode } from './types'

type QuoteRow = Database['public']['Tables']['quotes']['Row']
type QuoteItemRow = Database['public']['Tables']['quote_items']['Row']
type QuoteWithItemsRow = QuoteRow & {
  quote_items?: QuoteItemRow[]
}

function money(value: { toFixed(decimalPlaces: number): string } | number): string {
  return typeof value === 'number' ? value.toFixed(2) : value.toFixed(2)
}

function optionalMoney(value: { toFixed(decimalPlaces: number): string } | number | undefined): string | null {
  if (value === undefined) return null
  return money(value)
}

export async function createQuote(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = quoteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  if (isDevNoAuthMode()) {
    const { createDevQuote } = await import('@/lib/dev-data')
    const quote = createDevQuote(parsed.data)
    return { ok: true, data: { id: quote.id } }
  }

  const settingsResult = await getPricingSettings()
  if (!settingsResult.ok) return settingsResult

  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, error: 'Authentication required' }
  }

  const formulas = calculateAllFormulas(
    {
      workingDays: calculateFormulaLabourDays(parsed.data.workingDays, parsed.data.labourPerDay, parsed.data.items),
      labourPerDay: 1,
      materialMarket: parsed.data.materialMarket,
      materialActual: parsed.data.materialActual,
    },
    settingsResult.data
  )
  const subtotal = calculateSubtotal(formulas, parsed.data.selectedMin, parsed.data.selectedMax)
  const finalTotal = calculateFinal(subtotal)

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert({
      customer_name: parsed.data.customerName || null,
      customer_address: parsed.data.customerAddress || null,
      jobber_quote_id: parsed.data.jobberQuoteId || null,
      area_sqft: parsed.data.areaSqft ?? null,
      work_type: parsed.data.workType || null,
      working_days: parsed.data.workingDays.toFixed(2),
      labour_per_day: parsed.data.labourPerDay.toFixed(2),
      formula1_total: money(formulas[0].total),
      formula2_total: money(formulas[1].total),
      formula3_total: money(formulas[2].total),
      formula4_total: money(formulas[3].total),
      formula5_total: money(formulas[4].total),
      selected_min: parsed.data.selectedMin,
      selected_max: parsed.data.selectedMax,
      subtotal: money(subtotal),
      final_total: money(finalTotal),
      pricing_settings_snapshot: settingsResult.data as unknown as Json,
      created_by: userData.user.id,
      updated_by: userData.user.id,
    })
    .select('id')
    .single()

  if (quoteError) return { ok: false, error: quoteError.message }

  const items = parsed.data.items.map((item, index) => ({
    quote_id: quote.id,
    product_id: item.productId ?? null,
    product_name_snapshot: item.productNameSnapshot,
    market_price_snapshot: item.marketPriceSnapshot.toFixed(2),
    actual_price_snapshot: item.actualPriceSnapshot.toFixed(2),
    quantity: item.quantity.toFixed(2),
    working_days: optionalMoney(item.workingDays),
    labour_per_day: optionalMoney(item.labourPerDay),
    area_id: item.areaId ?? null,
    area_name_snapshot: item.areaNameSnapshot ?? null,
    area_scope_snapshot: item.areaScopeSnapshot ?? null,
    is_custom: item.isCustom,
    position: item.position ?? index,
  }))

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from('quote_items').insert(items)
    if (itemsError) return { ok: false, error: itemsError.message }
  }

  return { ok: true, data: { id: quote.id } }
}

export async function searchQuotes(query = ''): Promise<ActionResult<QuoteRecord[]>> {
  if (isDevNoAuthMode()) {
    const { listDevQuotes } = await import('@/lib/dev-data')
    return { ok: true, data: listDevQuotes(query) }
  }

  const supabase = await createClient()
  let request = supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .order('created_at', { ascending: false })
    .limit(20)

  if (query.trim()) {
    request = request.ilike('customer_name', `%${query.trim()}%`)
  }

  const { data, error } = await request
  if (error) return { ok: false, error: error.message }
  const rows = data as unknown as QuoteWithItemsRow[]

  return {
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      customerAddress: row.customer_address,
      jobberQuoteId: row.jobber_quote_id,
      areaSqft: row.area_sqft,
      workType: row.work_type,
      workingDays: row.working_days,
      labourPerDay: row.labour_per_day,
      formula1Total: row.formula1_total,
      formula2Total: row.formula2_total,
      formula3Total: row.formula3_total,
      formula4Total: row.formula4_total,
      formula5Total: row.formula5_total,
      selectedMin: row.selected_min as 1 | 2 | 3 | 4 | 5,
      selectedMax: row.selected_max as 1 | 2 | 3 | 4 | 5,
      subtotal: row.subtotal,
      finalTotal: row.final_total,
      pricingSettingsSnapshot: row.pricing_settings_snapshot as never,
      createdAt: row.created_at,
      items: row.quote_items?.map((item) => ({
        id: item.id,
        quoteId: item.quote_id,
        productId: item.product_id,
        productNameSnapshot: item.product_name_snapshot,
        marketPriceSnapshot: item.market_price_snapshot,
        actualPriceSnapshot: item.actual_price_snapshot,
        quantity: item.quantity,
        workingDays: item.working_days,
        labourPerDay: item.labour_per_day,
        areaId: item.area_id,
        areaNameSnapshot: item.area_name_snapshot,
        areaScopeSnapshot: item.area_scope_snapshot,
        isCustom: item.is_custom,
        position: item.position,
      })) ?? [],
    })),
  }
}

export async function getQuote(id: string): Promise<ActionResult<QuoteRecord | null>> {
  if (isDevNoAuthMode()) {
    const { getDevQuote } = await import('@/lib/dev-data')
    return { ok: true, data: getDevQuote(id) }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', id)
    .single()

  if (error) return { ok: false, error: error.message }
  const row = data as unknown as QuoteWithItemsRow
  return {
    ok: true,
    data: {
      id: row.id,
      customerName: row.customer_name,
      customerAddress: row.customer_address,
      jobberQuoteId: row.jobber_quote_id,
      areaSqft: row.area_sqft,
      workType: row.work_type,
      workingDays: row.working_days,
      labourPerDay: row.labour_per_day,
      formula1Total: row.formula1_total,
      formula2Total: row.formula2_total,
      formula3Total: row.formula3_total,
      formula4Total: row.formula4_total,
      formula5Total: row.formula5_total,
      selectedMin: row.selected_min as 1 | 2 | 3 | 4 | 5,
      selectedMax: row.selected_max as 1 | 2 | 3 | 4 | 5,
      subtotal: row.subtotal,
      finalTotal: row.final_total,
      pricingSettingsSnapshot: row.pricing_settings_snapshot as never,
      createdAt: row.created_at,
      items: row.quote_items?.map((item) => ({
        id: item.id,
        quoteId: item.quote_id,
        productId: item.product_id,
        productNameSnapshot: item.product_name_snapshot,
        marketPriceSnapshot: item.market_price_snapshot,
        actualPriceSnapshot: item.actual_price_snapshot,
        quantity: item.quantity,
        workingDays: item.working_days,
        labourPerDay: item.labour_per_day,
        areaId: item.area_id,
        areaNameSnapshot: item.area_name_snapshot,
        areaScopeSnapshot: item.area_scope_snapshot,
        isCustom: item.is_custom,
        position: item.position,
      })) ?? [],
    },
  }
}
