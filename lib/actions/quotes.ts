'use server'

import { revalidatePath } from 'next/cache'
import {
  type QuoteRecord,
} from '@/lib/dev-data'
import {
  calculateAllFormulas,
  calculateFinal,
  calculateSubtotal,
  type PricingSettings,
} from '@/lib/calculator'
import Decimal from 'decimal.js'
import { calculateFormulaLabourDays, calculateLabourTotals } from '@/lib/quote-labour'
import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/supabase/types'
import { jobberQuoteSnapshotSchema, pricingSettingsSchema, quoteSchema, type QuoteInput } from '@/lib/validators'
import { mapJobberQuoteToDraft, type JobberQuoteDraft } from '@/lib/jobber/mapper'
import { fetchJobberQuote, JobberApiError, syncJobberQuoteLineItems } from '@/lib/jobber/client'
import { getJobberConfig, getMissingGraphqlConfigKeys } from '@/lib/jobber/config'
import { getUsableJobberToken, refreshStoredJobberToken, type StoredJobberToken } from '@/lib/jobber/tokens'
import { QUOTE_DETAIL_SELECT, QUOTES_LIST_SELECT } from '@/lib/quote-query-shape'
import { getAuthUserProfilesById, type UserProfile } from '@/lib/user-profiles'
import { getPricingSettings } from './settings'
import type { ActionResult } from './types'
import { isDevNoAuthMode } from './types'
import type { JobberQuoteLineInput, JobberSaveModeInput } from '@/lib/validators'

type JobberSyncStatus = 'not_synced' | 'synced' | 'failed'
type QuoteRow = Database['public']['Tables']['quotes']['Row'] & {
  jobber_save_mode?: JobberSaveModeInput | null
  jobber_sync_status?: JobberSyncStatus
  jobber_last_synced_at?: string | null
  jobber_sync_error?: string | null
}
type QuoteItemRow = Database['public']['Tables']['quote_items']['Row']
type QuoteOptionRow = Database['public']['Tables']['quote_options']['Row']
type QuoteOptionItemRow = Database['public']['Tables']['quote_option_items']['Row']
type JobberQuoteLineRow = {
  id: string
  quote_id: string
  kind: 'line_item' | 'text'
  name: string
  description: string | null
  quantity: string | null
  unit_price: string | null
  total_price: string | null
  taxable: boolean
  client_visible: boolean
  jobber_line_item_id: string | null
  linked_product_or_service_id: string | null
  position: number
  created_at: string
  updated_at: string
}
type QuoteOptionWithItemsRow = QuoteOptionRow & {
  quote_option_items?: QuoteOptionItemRow[]
}
type QuoteWithItemsRow = QuoteRow & {
  quote_items?: QuoteItemRow[]
  jobber_quote_lines?: JobberQuoteLineRow[]
  quote_options?: QuoteOptionWithItemsRow[]
}

function money(value: { toFixed(decimalPlaces: number): string } | number): string {
  return typeof value === 'number' ? value.toFixed(2) : value.toFixed(2)
}

function optionalMoney(value: { toFixed(decimalPlaces: number): string } | number | undefined): string | null {
  if (value === undefined) return null
  return money(value)
}

function parseJobberSnapshot(value: unknown): JobberQuoteDraft | null {
  const parsed = jobberQuoteSnapshotSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function parsePricingSettingsSnapshot(value: unknown): PricingSettings | null {
  const parsed = pricingSettingsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function isMissingOptionsRelationError(error: { message?: string } | null): boolean {
  const message = error?.message ?? ''
  return message.includes("relationship between 'quotes' and 'quote_options'") ||
    message.includes("relation \"quote_options\" does not exist") ||
    message.includes("relation \"quote_option_items\" does not exist") ||
    message.includes("relationship between 'quotes' and 'jobber_quote_lines'") ||
    message.includes("relation \"jobber_quote_lines\" does not exist")
}

function toQuoteRecord(row: QuoteWithItemsRow, creatorProfile?: UserProfile): QuoteRecord {
  const quoteItems = [...(row.quote_items ?? [])].sort((a, b) => a.position - b.position)
  const jobberQuoteLines = [...(row.jobber_quote_lines ?? [])].sort((a, b) => a.position - b.position)
  const quoteOptions = [...(row.quote_options ?? [])].sort((a, b) => a.position - b.position)

  return {
    id: row.id,
    customerName: row.customer_name,
    customerAddress: row.customer_address,
    jobberQuoteId: row.jobber_quote_id,
    jobberSnapshot: parseJobberSnapshot(row.jobber_snapshot),
    jobberSaveMode: row.jobber_save_mode ?? null,
    jobberSyncStatus: row.jobber_sync_status ?? 'not_synced',
    jobberLastSyncedAt: row.jobber_last_synced_at ?? null,
    jobberSyncError: row.jobber_sync_error ?? null,
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
    createdBy: row.created_by,
    createdByName: creatorProfile?.displayName ?? null,
    createdByEmail: creatorProfile?.email ?? null,
    items: quoteItems.map((item) => ({
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
    })),
    jobberQuoteLines: jobberQuoteLines.map((line) => ({
      id: line.id,
      quoteId: line.quote_id,
      kind: line.kind,
      name: line.name,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      totalPrice: line.total_price,
      taxable: line.taxable,
      clientVisible: line.client_visible,
      jobberLineItemId: line.jobber_line_item_id,
      linkedProductOrServiceId: line.linked_product_or_service_id,
      position: line.position,
      createdAt: line.created_at,
      updatedAt: line.updated_at,
    })),
    options: quoteOptions.map((option) => ({
      id: option.id,
      quoteId: option.quote_id,
      title: option.title,
      workingDays: option.working_days,
      labourPerDay: option.labour_per_day,
      materialMarket: option.material_market,
      materialActual: option.material_actual,
      formula1Total: option.formula1_total,
      formula2Total: option.formula2_total,
      formula3Total: option.formula3_total,
      formula4Total: option.formula4_total,
      formula5Total: option.formula5_total,
      selectedMin: option.selected_min as 1 | 2 | 3 | 4 | 5,
      selectedMax: option.selected_max as 1 | 2 | 3 | 4 | 5,
      subtotal: option.subtotal,
      finalTotal: option.final_total,
      position: option.position,
      items: [...(option.quote_option_items ?? [])].sort((a, b) => a.position - b.position).map((item) => ({
        id: item.id,
        optionId: item.option_id,
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
      })),
    })),
  }
}

function calculateOption(option: QuoteInput['options'][number], settings: PricingSettings) {
  const labour = calculateLabourTotals(option.items)
  const materialMarket = option.items.reduce(
    (total, item) => total.add(new Decimal(item.marketPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
  const materialActual = option.items.reduce(
    (total, item) => total.add(new Decimal(item.actualPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
  const formulas = calculateAllFormulas(
    {
      workingDays: labour.labourDays,
      labourPerDay: 1,
      materialMarket,
      materialActual,
    },
    settings
  )
  const subtotal = calculateSubtotal(formulas, option.selectedMin, option.selectedMax)
  const finalTotal = calculateFinal(subtotal)

  return {
    labour,
    materialMarket,
    materialActual,
    formulas,
    subtotal,
    finalTotal,
  }
}

async function insertQuoteOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
  options: QuoteInput['options'],
  settings: PricingSettings
): Promise<string | null> {
  for (const [optionIndex, option] of options.entries()) {
    const calculated = calculateOption(option, settings)
    const { data: optionRow, error: optionError } = await supabase
      .from('quote_options')
      .insert({
        quote_id: quoteId,
        title: option.title.trim(),
        working_days: money(calculated.labour.workingDays),
        labour_per_day: money(calculated.labour.labourPerDay),
        material_market: money(calculated.materialMarket),
        material_actual: money(calculated.materialActual),
        formula1_total: money(calculated.formulas[0].total),
        formula2_total: money(calculated.formulas[1].total),
        formula3_total: money(calculated.formulas[2].total),
        formula4_total: money(calculated.formulas[3].total),
        formula5_total: money(calculated.formulas[4].total),
        selected_min: option.selectedMin,
        selected_max: option.selectedMax,
        subtotal: money(calculated.subtotal),
        final_total: money(calculated.finalTotal),
        position: option.position ?? optionIndex,
      })
      .select('id')
      .single()

    if (optionError) return optionError.message

    const items = option.items.map((item, itemIndex) => ({
      option_id: optionRow.id,
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
      position: item.position ?? itemIndex,
    }))

    if (items.length > 0) {
      const { error: itemsError } = await supabase.from('quote_option_items').insert(items)
      if (itemsError) return itemsError.message
    }
  }

  return null
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
      jobber_snapshot: (parsed.data.jobberSnapshot ?? null) as unknown as Json | null,
      jobber_save_mode: parsed.data.jobberSaveMode ?? null,
      jobber_sync_status: 'not_synced',
      jobber_last_synced_at: null,
      jobber_sync_error: null,
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

  const jobberLinesError = await insertJobberQuoteLines(supabase, quote.id, parsed.data.jobberQuoteLines)
  if (jobberLinesError) return { ok: false, error: jobberLinesError }

  const optionsError = await insertQuoteOptions(supabase, quote.id, parsed.data.options, settingsResult.data)
  if (optionsError) return { ok: false, error: optionsError }

  await syncSavedQuoteToJobber({
    supabase,
    quoteId: quote.id,
    userId: userData.user.id,
    jobberQuoteId: parsed.data.jobberQuoteId || null,
    saveMode: parsed.data.jobberSaveMode,
    lines: parsed.data.jobberQuoteLines,
    deletedJobberLineItemIds: parsed.data.deletedJobberLineItemIds,
    finalTotal,
  })

  revalidatePath('/quotes')
  return { ok: true, data: { id: quote.id } }
}

export async function updateQuote(input: unknown): Promise<ActionResult<{ id: string }>> {
  const inputRecord = typeof input === 'object' && input !== null ? input as Record<string, unknown> : {}
  const id = typeof inputRecord.id === 'string' ? inputRecord.id : ''
  if (!id.trim()) return { ok: false, error: 'Quote id is required' }

  const parsed = quoteSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message }
  }

  if (isDevNoAuthMode()) {
    const { updateDevQuote } = await import('@/lib/dev-data')
    const quote = updateDevQuote(id, parsed.data)
    if (!quote) return { ok: false, error: 'Quote not found' }
    revalidatePath('/quotes')
    revalidatePath(`/quotes/${id}`)
    return { ok: true, data: { id } }
  }

  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, error: 'Authentication required' }
  }

  const { data: existingQuote, error: existingQuoteError } = await supabase
    .from('quotes')
    .select('pricing_settings_snapshot')
    .eq('id', id)
    .single()
  if (existingQuoteError) return { ok: false, error: existingQuoteError.message }

  const fallbackSettings = await getPricingSettings()
  if (!fallbackSettings.ok) return fallbackSettings
  const settings = parsePricingSettingsSnapshot(existingQuote.pricing_settings_snapshot) ?? fallbackSettings.data

  const formulas = calculateAllFormulas(
    {
      workingDays: calculateFormulaLabourDays(parsed.data.workingDays, parsed.data.labourPerDay, parsed.data.items),
      labourPerDay: 1,
      materialMarket: parsed.data.materialMarket,
      materialActual: parsed.data.materialActual,
    },
    settings
  )
  const subtotal = calculateSubtotal(formulas, parsed.data.selectedMin, parsed.data.selectedMax)
  const finalTotal = calculateFinal(subtotal)

  const { error: quoteError } = await supabase
    .from('quotes')
    .update({
      customer_name: parsed.data.customerName || null,
      customer_address: parsed.data.customerAddress || null,
      jobber_quote_id: parsed.data.jobberQuoteId || null,
      jobber_snapshot: (parsed.data.jobberSnapshot ?? null) as unknown as Json | null,
      jobber_save_mode: parsed.data.jobberSaveMode ?? null,
      jobber_sync_status: 'not_synced',
      jobber_last_synced_at: null,
      jobber_sync_error: null,
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
      pricing_settings_snapshot: settings as unknown as Json,
      updated_by: userData.user.id,
    })
    .eq('id', id)

  if (quoteError) return { ok: false, error: quoteError.message }

  const { error: deleteItemsError } = await supabase.from('quote_items').delete().eq('quote_id', id)
  if (deleteItemsError) return { ok: false, error: deleteItemsError.message }

  const { error: deleteOptionsError } = await supabase.from('quote_options').delete().eq('quote_id', id)
  if (deleteOptionsError) return { ok: false, error: deleteOptionsError.message }

  const { error: deleteJobberLinesError } = await supabase.from('jobber_quote_lines').delete().eq('quote_id', id)
  if (deleteJobberLinesError) return { ok: false, error: deleteJobberLinesError.message }

  const items = parsed.data.items.map((item, index) => ({
    quote_id: id,
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

  const optionsError = await insertQuoteOptions(supabase, id, parsed.data.options, settings)
  if (optionsError) return { ok: false, error: optionsError }

  const jobberLinesError = await insertJobberQuoteLines(supabase, id, parsed.data.jobberQuoteLines)
  if (jobberLinesError) return { ok: false, error: jobberLinesError }

  await syncSavedQuoteToJobber({
    supabase,
    quoteId: id,
    userId: userData.user.id,
    jobberQuoteId: parsed.data.jobberQuoteId || null,
    saveMode: parsed.data.jobberSaveMode,
    lines: parsed.data.jobberQuoteLines,
    deletedJobberLineItemIds: parsed.data.deletedJobberLineItemIds,
    finalTotal,
  })

  revalidatePath('/quotes')
  revalidatePath(`/quotes/${id}`)
  return { ok: true, data: { id } }
}

export async function deleteQuote(id: string): Promise<ActionResult<{ id: string }>> {
  if (!id.trim()) return { ok: false, error: 'Quote id is required' }

  if (isDevNoAuthMode()) {
    const { deleteDevQuote } = await import('@/lib/dev-data')
    const deleted = deleteDevQuote(id)
    if (!deleted) return { ok: false, error: 'Quote not found' }
    revalidatePath('/quotes')
    return { ok: true, data: { id } }
  }

  const supabase = await createClient()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, error: 'Authentication required' }
  }

  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/quotes')
  return { ok: true, data: { id } }
}

export async function searchQuotes(query = ''): Promise<ActionResult<QuoteRecord[]>> {
  if (isDevNoAuthMode()) {
    const { listDevQuotes } = await import('@/lib/dev-data')
    return { ok: true, data: listDevQuotes(query) }
  }

  const supabase = await createClient()
  let request = supabase
    .from('quotes')
    .select(QUOTES_LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(20)

  if (query.trim()) {
    request = request.ilike('customer_name', `%${query.trim()}%`)
  }

  const { data, error } = await request
  if (error) return { ok: false, error: error.message }
  const rows = data as unknown as QuoteWithItemsRow[] | null
  const quoteRows = rows ?? []
  const creatorProfiles = await getAuthUserProfilesById(quoteRows.map((row) => row.created_by))

  return {
    ok: true,
    data: quoteRows.map((row) => toQuoteRecord(row, creatorProfiles.get(row.created_by))),
  }
}

function calculateJobberLineTotal(line: JobberQuoteLineInput): Decimal | number | undefined {
  if (line.totalPrice !== undefined) return line.totalPrice
  if (line.quantity === undefined || line.unitPrice === undefined) return undefined
  return new Decimal(line.quantity).mul(line.unitPrice)
}

function optionalTrimmedText(value: string | undefined): string | null {
  return value?.trim() || null
}

function toJobberQuoteLineInsert(quoteId: string, line: JobberQuoteLineInput, index: number) {
  return {
    quote_id: quoteId,
    kind: line.kind,
    name: line.name.trim(),
    description: optionalTrimmedText(line.description),
    quantity: optionalMoney(line.quantity),
    unit_price: optionalMoney(line.unitPrice),
    total_price: optionalMoney(calculateJobberLineTotal(line)),
    taxable: line.taxable,
    client_visible: line.clientVisible,
    jobber_line_item_id: optionalTrimmedText(line.jobberLineItemId),
    linked_product_or_service_id: optionalTrimmedText(line.linkedProductOrServiceId),
    position: line.position ?? index,
  }
}

async function insertJobberQuoteLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
  lines: JobberQuoteLineInput[]
): Promise<string | null> {
  if (lines.length === 0) return null

  const { error } = await supabase
    .from('jobber_quote_lines')
    .insert(lines.map((line, index) => toJobberQuoteLineInsert(quoteId, line, index)))

  return error?.message ?? null
}

async function markJobberSyncStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
  status: JobberSyncStatus,
  errorMessage: string | null,
  snapshot?: JobberQuoteDraft | null
): Promise<void> {
  const updatePayload: Database['public']['Tables']['quotes']['Update'] = {
    jobber_sync_status: status,
    jobber_last_synced_at: status === 'synced' ? new Date().toISOString() : null,
    jobber_sync_error: errorMessage ? errorMessage.slice(0, 500) : null,
  }

  if (snapshot !== undefined) {
    updatePayload.jobber_snapshot = snapshot as unknown as Json | null
  }

  await supabase
    .from('quotes')
    .update(updatePayload)
    .eq('id', quoteId)
}

async function recordSyncedJobberLineIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
  syncedLineItems: Array<{ sourcePosition: number; jobberLineItemId: string }>
): Promise<void> {
  for (const line of syncedLineItems) {
    await supabase
      .from('jobber_quote_lines')
      .update({ jobber_line_item_id: line.jobberLineItemId })
      .eq('quote_id', quoteId)
      .eq('position', line.sourcePosition)
  }
}

function getSyncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to sync quote to Jobber'
}

async function syncSavedQuoteToJobber(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  quoteId: string
  userId: string
  jobberQuoteId: string | null
  saveMode: QuoteInput['jobberSaveMode']
  lines: QuoteInput['jobberQuoteLines']
  deletedJobberLineItemIds: QuoteInput['deletedJobberLineItemIds']
  finalTotal: Decimal
}): Promise<void> {
  if (!params.jobberQuoteId || (params.lines.length === 0 && params.deletedJobberLineItemIds.length === 0)) return

  const config = getJobberConfig()
  const missing = getMissingGraphqlConfigKeys(config)
  if (missing.length > 0) {
    await markJobberSyncStatus(params.supabase, params.quoteId, 'failed', `Jobber quote sync is not configured: ${missing.join(', ')}`)
    return
  }

  let token: StoredJobberToken | null = null
  try {
    token = await getUsableJobberToken(params.userId, config)
    let accessToken = token?.accessToken ?? config.accessToken
    if (!accessToken) {
      await markJobberSyncStatus(params.supabase, params.quoteId, 'failed', 'Jobber is not connected. Connect Jobber first.')
      return
    }

    const syncInput = {
      saveMode: params.saveMode ?? 'priced_line_items',
      lines: params.lines,
      finalTotal: params.finalTotal,
      finalTotalIncludesGst: true,
      deletedJobberLineItemIds: params.deletedJobberLineItemIds,
    }

    let syncResult: Awaited<ReturnType<typeof syncJobberQuoteLineItems>>
    try {
      syncResult = await syncJobberQuoteLineItems(params.jobberQuoteId, syncInput, {
        accessToken,
        graphqlVersion: config.graphqlVersion,
      })
    } catch (error) {
      if (!(error instanceof JobberApiError) || error.status !== 401 || !token) {
        throw error
      }

      token = await refreshStoredJobberToken(params.userId, token.refreshToken, config, token.ownerUserId ?? params.userId)
      accessToken = token.accessToken
      syncResult = await syncJobberQuoteLineItems(params.jobberQuoteId, syncInput, {
        accessToken,
        graphqlVersion: config.graphqlVersion,
      })
    }

    const refreshedSnapshot = mapJobberQuoteToDraft(await fetchJobberQuote(params.jobberQuoteId, {
      accessToken,
      graphqlVersion: config.graphqlVersion,
    }))

    await recordSyncedJobberLineIds(params.supabase, params.quoteId, syncResult.syncedLineItems)
    await markJobberSyncStatus(params.supabase, params.quoteId, 'synced', null, refreshedSnapshot)
  } catch (error) {
    await markJobberSyncStatus(params.supabase, params.quoteId, 'failed', getSyncErrorMessage(error))
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
    .select(QUOTE_DETAIL_SELECT)
    .eq('id', id)
    .single()

  let row = data as unknown as QuoteWithItemsRow | null

  if (error) {
    if (!isMissingOptionsRelationError(error)) return { ok: false, error: error.message }

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('quotes')
      .select(QUOTES_LIST_SELECT)
      .eq('id', id)
      .single()
    if (fallbackError) return { ok: false, error: fallbackError.message }
    row = fallbackData as unknown as QuoteWithItemsRow
  }

  return {
    ok: true,
    data: row ? toQuoteRecord(row, (await getAuthUserProfilesById([row.created_by])).get(row.created_by)) : null,
  }
}
