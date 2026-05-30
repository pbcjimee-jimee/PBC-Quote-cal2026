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
import { calculateDisplayLabourTotals, calculateFormulaLabourDays, calculateLabourTotals } from '@/lib/quote-labour'
import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/supabase/types'
import { jobberQuoteSnapshotSchema, pricingSettingsSchema, quoteSchema, type QuoteInput } from '@/lib/validators'
import { mapJobberQuoteToDraft, type JobberQuoteDraft } from '@/lib/jobber/mapper'
import { fetchJobberQuote, JobberApiError, syncJobberQuoteLineItems } from '@/lib/jobber/client'
import { getJobberConfig, getMissingGraphqlConfigKeys } from '@/lib/jobber/config'
import { getUsableJobberToken, refreshStoredJobberToken, type StoredJobberToken } from '@/lib/jobber/tokens'
import { QUOTE_DETAIL_SELECT, QUOTE_DETAIL_WITHOUT_MEMOS_SELECT, QUOTES_LIST_SELECT } from '@/lib/quote-query-shape'
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
type QuoteMemoRow = Database['public']['Tables']['quote_memos']['Row']
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
  quote_memos?: QuoteMemoRow[]
}

function money(value: { toFixed(decimalPlaces: number): string } | number): string {
  return typeof value === 'number' ? value.toFixed(2) : value.toFixed(2)
}

function optionalMoney(value: { toFixed(decimalPlaces: number): string } | number | undefined): string | null {
  if (value === undefined) return null
  return money(value)
}

function decimalText(value: unknown): string {
  if (typeof value === 'number') return new Decimal(value).toFixed(2)
  if (typeof value === 'string') return value
  return '0.00'
}

type FormulaSelection = {
  selectedMin: 1 | 2 | 3 | 4 | 5
  selectedMax: 1 | 2 | 3 | 4 | 5
}

function formulaNumber(value: unknown, fallback: 1 | 2 | 3 | 4 | 5): 1 | 2 | 3 | 4 | 5 {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : fallback
}

function getAreaFormulaSelections(input: QuoteInput): { interior: FormulaSelection; exterior: FormulaSelection } {
  const fallback = { selectedMin: input.selectedMin, selectedMax: input.selectedMax }
  return {
    interior: input.areaFormulaSelections?.interior ?? fallback,
    exterior: input.areaFormulaSelections?.exterior ?? fallback,
  }
}

function calculateAreaSubtotalFromInputItems(
  items: QuoteInput['items'],
  selection: FormulaSelection,
  scope: 'interior' | 'exterior',
  settings: PricingSettings
): Decimal {
  const scopedItems = items.filter((item) => item.areaScopeSnapshot === scope)
  const labour = calculateLabourTotals(scopedItems)
  const materialMarket = scopedItems.reduce(
    (total, item) => total.add(new Decimal(item.marketPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
  const formulaResults = calculateAllFormulas(
    {
      workingDays: labour.labourDays,
      labourPerDay: 1,
      materialMarket,
      materialActual: materialMarket,
    },
    settings
  )
  return calculateSubtotal(formulaResults, selection.selectedMin, selection.selectedMax)
}

function calculateMainQuoteSubtotal(input: QuoteInput, formulaResults: ReturnType<typeof calculateAllFormulas>, settings: PricingSettings): Decimal {
  const selections = getAreaFormulaSelections(input)
  const hasAssignedAreaRows = input.items.some((item) => item.areaScopeSnapshot === 'interior' || item.areaScopeSnapshot === 'exterior')
  if (!hasAssignedAreaRows) return calculateSubtotal(formulaResults, input.selectedMin, input.selectedMax)

  return calculateAreaSubtotalFromInputItems(input.items, selections.interior, 'interior', settings)
    .add(calculateAreaSubtotalFromInputItems(input.items, selections.exterior, 'exterior', settings))
}

function optionalDecimalText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return decimalText(value)
}

function parseJobberSnapshot(value: unknown): JobberQuoteDraft | null {
  const parsed = jobberQuoteSnapshotSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function parsePricingSettingsSnapshot(value: unknown): PricingSettings | null {
  const parsed = pricingSettingsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function isMissingRelationError(error: { message?: string } | null, relationNames: string[]): boolean {
  const message = error?.message ?? ''
  const isSchemaError = message.includes('relationship') ||
    message.includes('does not exist') ||
    message.includes('schema cache')

  return isSchemaError && relationNames.some((relationName) =>
    message.includes(`'${relationName}'`) || message.includes(`"${relationName}"`)
  )
}

function isMissingMemoRelationError(error: { message?: string } | null): boolean {
  return isMissingRelationError(error, ['quote_memos'])
}

function isMissingLegacyDetailRelationError(error: { message?: string } | null): boolean {
  return isMissingRelationError(error, ['quote_options', 'quote_option_items', 'jobber_quote_lines'])
}

function toQuoteRecord(row: QuoteWithItemsRow, creatorProfile?: UserProfile): QuoteRecord {
  const quoteItems = [...(row.quote_items ?? [])].sort((a, b) => a.position - b.position)
  const jobberQuoteLines = [...(row.jobber_quote_lines ?? [])].sort((a, b) => a.position - b.position)
  const quoteOptions = [...(row.quote_options ?? [])].sort((a, b) => a.position - b.position)
  const quoteMemos = [...(row.quote_memos ?? [])].sort((a, b) => a.position - b.position)
  const displayLabour = calculateDisplayLabourTotals(
    row.working_days,
    row.labour_per_day,
    quoteItems.map((item) => ({ workingDays: item.working_days, labourPerDay: item.labour_per_day }))
  )
  const selectedMin = formulaNumber(row.selected_min, 4)
  const selectedMax = formulaNumber(row.selected_max, 1)

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
    workingDays: money(displayLabour.workingDays),
    labourPerDay: money(displayLabour.labourPerDay),
    formula1Total: decimalText(row.formula1_total),
    formula2Total: decimalText(row.formula2_total),
    formula3Total: decimalText(row.formula3_total),
    formula4Total: decimalText(row.formula4_total),
    formula5Total: decimalText(row.formula5_total),
    selectedMin,
    selectedMax,
    interiorSelectedMin: formulaNumber(row.interior_selected_min, selectedMin),
    interiorSelectedMax: formulaNumber(row.interior_selected_max, selectedMax),
    exteriorSelectedMin: formulaNumber(row.exterior_selected_min, selectedMin),
    exteriorSelectedMax: formulaNumber(row.exterior_selected_max, selectedMax),
    subtotal: decimalText(row.subtotal),
    finalTotal: decimalText(row.final_total),
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
      marketPriceSnapshot: decimalText(item.market_price_snapshot),
      actualPriceSnapshot: decimalText(item.actual_price_snapshot),
      quantity: decimalText(item.quantity),
      workingDays: optionalDecimalText(item.working_days),
      labourPerDay: optionalDecimalText(item.labour_per_day),
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
      quantity: optionalDecimalText(line.quantity),
      unitPrice: optionalDecimalText(line.unit_price),
      totalPrice: optionalDecimalText(line.total_price),
      taxable: line.taxable,
      clientVisible: line.client_visible,
      jobberLineItemId: line.jobber_line_item_id,
      linkedProductOrServiceId: line.linked_product_or_service_id,
      position: line.position,
      createdAt: line.created_at,
      updatedAt: line.updated_at,
    })),
    options: quoteOptions.map((option) => {
      const optionItems = [...(option.quote_option_items ?? [])].sort((a, b) => a.position - b.position)
      const optionDisplayLabour = calculateDisplayLabourTotals(
        option.working_days,
        option.labour_per_day,
        optionItems.map((item) => ({ workingDays: item.working_days, labourPerDay: item.labour_per_day }))
      )

      return {
        id: option.id,
        quoteId: option.quote_id,
        title: option.title,
        workingDays: money(optionDisplayLabour.workingDays),
        labourPerDay: money(optionDisplayLabour.labourPerDay),
        materialMarket: decimalText(option.material_market),
        materialActual: decimalText(option.material_actual),
        formula1Total: decimalText(option.formula1_total),
        formula2Total: decimalText(option.formula2_total),
        formula3Total: decimalText(option.formula3_total),
        formula4Total: decimalText(option.formula4_total),
        formula5Total: decimalText(option.formula5_total),
        selectedMin: option.selected_min as 1 | 2 | 3 | 4 | 5,
        selectedMax: option.selected_max as 1 | 2 | 3 | 4 | 5,
        subtotal: decimalText(option.subtotal),
        finalTotal: decimalText(option.final_total),
        position: option.position,
        items: optionItems.map((item) => ({
          id: item.id,
          optionId: item.option_id,
          productId: item.product_id,
          productNameSnapshot: item.product_name_snapshot,
          marketPriceSnapshot: decimalText(item.market_price_snapshot),
          actualPriceSnapshot: decimalText(item.actual_price_snapshot),
          quantity: decimalText(item.quantity),
          workingDays: optionalDecimalText(item.working_days),
          labourPerDay: optionalDecimalText(item.labour_per_day),
          areaId: item.area_id,
          areaNameSnapshot: item.area_name_snapshot,
          areaScopeSnapshot: item.area_scope_snapshot,
          isCustom: item.is_custom,
          position: item.position,
        })),
      }
    }),
    memos: quoteMemos.map((memo) => ({
      id: memo.id,
      quoteId: memo.quote_id,
      body: memo.body,
      position: memo.position,
      createdAt: memo.created_at,
      updatedAt: memo.updated_at,
      createdBy: memo.created_by,
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
        labour_per_day: money(calculated.labour.labourDays),
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

async function insertQuoteMemos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
  memos: QuoteInput['memos'],
  userId: string
): Promise<{ ok: true; ids: string[] } | { ok: false; error: string }> {
  const rows = memos
    .map((memo, index) => ({
      quote_id: quoteId,
      body: memo.body.trim(),
      position: memo.position ?? index,
      created_by: userId,
    }))
    .filter((memo) => memo.body.length > 0)

  if (rows.length === 0) return { ok: true, ids: [] }

  const { data, error } = await supabase
    .from('quote_memos')
    .insert(rows)
    .select('id')
  if (error) return { ok: false, error: error.message }
  return { ok: true, ids: (data ?? []).map((row) => row.id) }
}

async function deleteQuoteMemos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
  keepIds: string[] = []
): Promise<string | null> {
  let request = supabase.from('quote_memos').delete().eq('quote_id', quoteId)
  if (keepIds.length > 0) {
    request = request.not('id', 'in', `(${keepIds.join(',')})`)
  }

  const { error } = await request
  return error?.message ?? null
}

async function replaceQuoteMemos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
  memos: QuoteInput['memos'],
  userId: string
): Promise<string | null> {
  const inserted = await insertQuoteMemos(supabase, quoteId, memos, userId)
  if (!inserted.ok) return inserted.error
  return deleteQuoteMemos(supabase, quoteId, inserted.ids)
}

async function deleteCreatedQuote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string
): Promise<void> {
  await supabase.from('quotes').delete().eq('id', quoteId)
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
  const areaFormulaSelections = getAreaFormulaSelections(parsed.data)
  const subtotal = calculateMainQuoteSubtotal(parsed.data, formulas, settingsResult.data)
  const finalTotal = calculateFinal(subtotal)
  const displayLabour = calculateDisplayLabourTotals(parsed.data.workingDays, parsed.data.labourPerDay, parsed.data.items)

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
      working_days: money(displayLabour.workingDays),
      labour_per_day: money(displayLabour.labourPerDay),
      formula1_total: money(formulas[0].total),
      formula2_total: money(formulas[1].total),
      formula3_total: money(formulas[2].total),
      formula4_total: money(formulas[3].total),
      formula5_total: money(formulas[4].total),
      selected_min: parsed.data.selectedMin,
      selected_max: parsed.data.selectedMax,
      interior_selected_min: areaFormulaSelections.interior.selectedMin,
      interior_selected_max: areaFormulaSelections.interior.selectedMax,
      exterior_selected_min: areaFormulaSelections.exterior.selectedMin,
      exterior_selected_max: areaFormulaSelections.exterior.selectedMax,
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
    if (itemsError) {
      await deleteCreatedQuote(supabase, quote.id)
      return { ok: false, error: itemsError.message }
    }
  }

  const jobberLinesError = await insertJobberQuoteLines(supabase, quote.id, parsed.data.jobberQuoteLines)
  if (jobberLinesError) {
    await deleteCreatedQuote(supabase, quote.id)
    return { ok: false, error: jobberLinesError }
  }

  const optionsError = await insertQuoteOptions(supabase, quote.id, parsed.data.options, settingsResult.data)
  if (optionsError) {
    await deleteCreatedQuote(supabase, quote.id)
    return { ok: false, error: optionsError }
  }

  const memosResult = await insertQuoteMemos(supabase, quote.id, parsed.data.memos, userData.user.id)
  if (!memosResult.ok) {
    await deleteCreatedQuote(supabase, quote.id)
    return { ok: false, error: memosResult.error }
  }

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
  const areaFormulaSelections = getAreaFormulaSelections(parsed.data)
  const subtotal = calculateMainQuoteSubtotal(parsed.data, formulas, settings)
  const finalTotal = calculateFinal(subtotal)
  const displayLabour = calculateDisplayLabourTotals(parsed.data.workingDays, parsed.data.labourPerDay, parsed.data.items)

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
      working_days: money(displayLabour.workingDays),
      labour_per_day: money(displayLabour.labourPerDay),
      formula1_total: money(formulas[0].total),
      formula2_total: money(formulas[1].total),
      formula3_total: money(formulas[2].total),
      formula4_total: money(formulas[3].total),
      formula5_total: money(formulas[4].total),
      selected_min: parsed.data.selectedMin,
      selected_max: parsed.data.selectedMax,
      interior_selected_min: areaFormulaSelections.interior.selectedMin,
      interior_selected_max: areaFormulaSelections.interior.selectedMax,
      exterior_selected_min: areaFormulaSelections.exterior.selectedMin,
      exterior_selected_max: areaFormulaSelections.exterior.selectedMax,
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

  const memosError = await replaceQuoteMemos(supabase, id, parsed.data.memos, userData.user.id)
  if (memosError) return { ok: false, error: memosError }

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

    await recordSyncedJobberLineIds(params.supabase, params.quoteId, syncResult.syncedLineItems)
    let refreshedSnapshot: JobberQuoteDraft | undefined
    try {
      refreshedSnapshot = mapJobberQuoteToDraft(await fetchJobberQuote(params.jobberQuoteId, {
        accessToken,
        graphqlVersion: config.graphqlVersion,
      }))
    } catch {
      refreshedSnapshot = undefined
    }

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
    if (!isMissingMemoRelationError(error) && !isMissingLegacyDetailRelationError(error)) {
      return { ok: false, error: error.message }
    }

    if (isMissingMemoRelationError(error)) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('quotes')
        .select(QUOTE_DETAIL_WITHOUT_MEMOS_SELECT)
        .eq('id', id)
        .single()

      if (!fallbackError) {
        row = fallbackData as unknown as QuoteWithItemsRow
      } else if (!isMissingLegacyDetailRelationError(fallbackError)) {
        return { ok: false, error: fallbackError.message }
      }
    }

    if (!row) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('quotes')
        .select(QUOTES_LIST_SELECT)
        .eq('id', id)
        .single()
      if (fallbackError) return { ok: false, error: fallbackError.message }
      row = fallbackData as unknown as QuoteWithItemsRow
    }
  }

  return {
    ok: true,
    data: row ? toQuoteRecord(row, (await getAuthUserProfilesById([row.created_by])).get(row.created_by)) : null,
  }
}
