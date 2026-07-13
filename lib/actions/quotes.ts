'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import {
  type JobberSnapshotChangeSummaryItem,
  type QuoteRecord,
} from '@/lib/dev-data'
import type { ProductRecord } from '@/lib/products/types'
import {
  calculateAllFormulas,
  DEFAULT_PRICING_SETTINGS,
  calculateFinal,
  calculateRoofFormulaResults,
  calculateRoofSubtotal,
  calculateSubtotal,
  type PricingSettings,
} from '@/lib/calculator'
import Decimal from 'decimal.js'
import { calculateDisplayLabourTotals, calculateFormulaLabourDays, calculateLabourTotals } from '@/lib/quote-labour'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/supabase/types'
import { jobberQuoteSnapshotSchema, pricingSettingsSchema, quoteSchema, type QuoteInput } from '@/lib/validators'
import { mapJobberQuoteToDraft, type JobberQuoteDraft } from '@/lib/jobber/mapper'
import { diffJobberSnapshots } from '@/lib/jobber/snapshot-diff'
import { fetchJobberQuote, JobberApiError, JobberLineSyncPartialError, syncJobberQuoteLineItems } from '@/lib/jobber/client'
import { getJobberConfig, getMissingGraphqlConfigKeys } from '@/lib/jobber/config'
import { getUsableSharedJobberConnectionToken, refreshSharedJobberConnectionToken, requireSharedJobberConnectionOwnerId, type StoredJobberToken } from '@/lib/jobber/tokens'
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
type QuotePriceRevisionRow = Database['public']['Tables']['quote_price_revisions']['Row']
type ProductPriceRow = Pick<
  Database['public']['Tables']['products']['Row'],
  'id' | 'name' | 'market_price' | 'actual_price' | 'price' | 'rrp_price'
>
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
type JobberRetryQuoteRow = Pick<QuoteRow, 'id' | 'jobber_quote_id' | 'jobber_save_mode' | 'final_total'> & {
  jobber_quote_lines?: JobberQuoteLineRow[]
}
type QuoteOptionWithItemsRow = QuoteOptionRow & {
  quote_option_items?: QuoteOptionItemRow[]
}
type QuoteWithItemsRow = QuoteRow & {
  quote_items?: QuoteItemRow[]
  jobber_quote_lines?: JobberQuoteLineRow[]
  quote_options?: QuoteOptionWithItemsRow[]
  quote_memos?: QuoteMemoRow[]
  quote_price_revisions?: QuotePriceRevisionRow[]
}
type ExistingJobberQuoteMatchRow = Pick<QuoteRow, 'id' | 'version'>
type QuoteListRow = Pick<
  QuoteRow,
  | 'id'
  | 'version'
  | 'customer_name'
  | 'customer_address'
  | 'jobber_quote_id'
  | 'work_type'
  | 'working_days'
  | 'labour_per_day'
  | 'subtotal'
  | 'final_total'
  | 'created_by'
  | 'created_at'
> & Partial<Pick<
  QuoteRow,
  | 'jobber_save_mode'
  | 'jobber_sync_status'
  | 'jobber_last_synced_at'
  | 'jobber_sync_error'
  | 'jobber_snapshot_refreshed_at'
  | 'jobber_snapshot_change_status'
  | 'jobber_snapshot_change_summary'
  | 'jobber_snapshot_refresh_error'
>>

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

function getAreaFormulaSelections(input: QuoteInput): { interior: FormulaSelection; exterior: FormulaSelection; roof: FormulaSelection } {
  const fallback = { selectedMin: input.selectedMin, selectedMax: input.selectedMax }
  return {
    interior: input.areaFormulaSelections?.interior ?? fallback,
    exterior: input.areaFormulaSelections?.exterior ?? fallback,
    roof: input.areaFormulaSelections?.roof ?? fallback,
  }
}

function calculateAreaSubtotalFromInputItems(
  items: QuoteInput['items'],
  selection: FormulaSelection,
  scope: 'interior' | 'exterior' | 'roof',
  settings: PricingSettings
): Decimal {
  const scopedItems = items.filter((item) => item.areaScopeSnapshot === scope)
  const labour = calculateLabourTotals(scopedItems)
  const materialMarket = scopedItems.reduce(
    (total, item) => total.add(new Decimal(item.marketPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
  const materialActual = scopedItems.reduce(
    (total, item) => total.add(new Decimal(item.actualPriceSnapshot).mul(item.quantity)),
    new Decimal(0)
  )
  if (scope === 'roof') {
    return calculateRoofSubtotal({ labourDays: labour.labourDays, materialMarket, materialActual }, settings, selection.selectedMin, selection.selectedMax)
  }

  const formulaResults = calculateAllFormulas(
    {
      workingDays: labour.labourDays,
      labourPerDay: 1,
      materialMarket,
      materialActual,
    },
    settings
  )
  return calculateSubtotal(formulaResults, selection.selectedMin, selection.selectedMax)
}

function calculateMainQuoteSubtotal(input: QuoteInput, formulaResults: ReturnType<typeof calculateAllFormulas>, settings: PricingSettings): Decimal {
  const selections = getAreaFormulaSelections(input)
  const hasAssignedAreaRows = input.items.some((item) =>
    item.areaScopeSnapshot === 'interior' || item.areaScopeSnapshot === 'exterior' || item.areaScopeSnapshot === 'roof'
  )
  if (!hasAssignedAreaRows) return calculateSubtotal(formulaResults, input.selectedMin, input.selectedMax)

  return calculateAreaSubtotalFromInputItems(input.items, selections.interior, 'interior', settings)
    .add(calculateAreaSubtotalFromInputItems(input.items, selections.exterior, 'exterior', settings))
    .add(calculateAreaSubtotalFromInputItems(input.items, selections.roof, 'roof', settings))
}

function optionalDecimalText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return decimalText(value)
}

function parseJobberSnapshot(value: unknown): JobberQuoteDraft | null {
  const parsed = jobberQuoteSnapshotSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

const JOBBER_SNAPSHOT_CHANGE_SUMMARY_LIMIT = 8
const JOBBER_SNAPSHOT_CHANGE_FIELDS = new Set<JobberSnapshotChangeSummaryItem['field']>([
  'customer',
  'address',
  'workType',
  'customerType',
  'lineItems',
  'financialSummary',
])

function isJobberSnapshotChangeSummaryItem(value: unknown): value is JobberSnapshotChangeSummaryItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>

  return typeof item.field === 'string' &&
    JOBBER_SNAPSHOT_CHANGE_FIELDS.has(item.field as JobberSnapshotChangeSummaryItem['field']) &&
    typeof item.label === 'string' &&
    typeof item.before === 'string' &&
    typeof item.after === 'string'
}

function parseJobberSnapshotChangeSummary(value: unknown): JobberSnapshotChangeSummaryItem[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJobberSnapshotChangeSummaryItem)
    .slice(0, JOBBER_SNAPSHOT_CHANGE_SUMMARY_LIMIT)
}

type CurrentProductSnapshot = {
  id: string
  name: string
  price: string
}

type QuoteSaveItemRow = Omit<Database['public']['Tables']['quote_items']['Insert'], 'quote_id'>
type QuoteSaveJobberLineRow = Omit<Database['public']['Tables']['jobber_quote_lines']['Insert'], 'quote_id'>
type QuoteSaveMemoRow = Omit<Database['public']['Tables']['quote_memos']['Insert'], 'quote_id'>
type QuoteSaveOptionPayload = {
  option: Omit<Database['public']['Tables']['quote_options']['Insert'], 'quote_id'>
  items: Array<Omit<Database['public']['Tables']['quote_option_items']['Insert'], 'option_id'>>
}
type QuoteSavePriceRevisionRow = Omit<Database['public']['Tables']['quote_price_revisions']['Insert'], 'quote_id'> & {
  quote_id?: string
}
type QuoteSavePayload = {
  id?: string
  expected_version?: number
  quote: Database['public']['Tables']['quotes']['Insert'] | Database['public']['Tables']['quotes']['Update']
  items: QuoteSaveItemRow[]
  options: QuoteSaveOptionPayload[]
  jobber_lines: QuoteSaveJobberLineRow[]
  memos: QuoteSaveMemoRow[]
  price_revision: QuoteSavePriceRevisionRow | null
}

type ExistingQuoteItemSnapshotRow = Pick<
  QuoteItemRow,
  'product_id' | 'product_name_snapshot' | 'market_price_snapshot' | 'actual_price_snapshot' | 'position'
>
type ExistingQuoteOptionSnapshotRow = Pick<QuoteOptionRow, 'position'> & {
  quote_option_items?: Array<Pick<
    QuoteOptionItemRow,
    'product_id' | 'product_name_snapshot' | 'market_price_snapshot' | 'actual_price_snapshot' | 'position'
  >>
}

function decimalNumber(value: string | null | undefined): number {
  return Number(new Decimal(value ?? '0').toFixed(2))
}

function collectQuoteProductIds(quote: QuoteRecord): string[] {
  return Array.from(new Set([
    ...quote.items.map((item) => item.productId),
    ...quote.options.flatMap((option) => option.items.map((item) => item.productId)),
  ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
}

function productSnapshotFromRecord(product: ProductRecord): CurrentProductSnapshot {
  return {
    id: product.id,
    name: product.name,
    price: decimalText(product.rrpPrice ?? product.marketPrice ?? product.price ?? product.actualPrice),
  }
}

function productSnapshotFromRow(row: ProductPriceRow): CurrentProductSnapshot {
  return {
    id: row.id,
    name: row.name,
    price: decimalText(row.rrp_price ?? row.market_price ?? row.price ?? row.actual_price),
  }
}

function duplicateQuoteItem(
  item: QuoteRecord['items'][number],
  currentProducts: Map<string, CurrentProductSnapshot>
): QuoteInput['items'][number] {
  const currentProduct = item.productId ? currentProducts.get(item.productId) : undefined
  const price = currentProduct?.price

  return {
    productId: item.productId ?? undefined,
    productNameSnapshot: currentProduct?.name ?? item.productNameSnapshot,
    marketPriceSnapshot: decimalNumber(price ?? item.marketPriceSnapshot),
    actualPriceSnapshot: decimalNumber(price ?? item.actualPriceSnapshot),
    quantity: decimalNumber(item.quantity),
    workingDays: item.workingDays === null ? undefined : decimalNumber(item.workingDays),
    labourPerDay: item.labourPerDay === null ? undefined : decimalNumber(item.labourPerDay),
    areaId: item.areaId ?? undefined,
    areaNameSnapshot: item.areaNameSnapshot ?? undefined,
    areaScopeSnapshot: item.areaScopeSnapshot ?? undefined,
    isCustom: currentProduct ? false : item.isCustom,
    position: item.position,
  }
}

function duplicateQuoteOptionItem(
  item: QuoteRecord['options'][number]['items'][number],
  currentProducts: Map<string, CurrentProductSnapshot>
): QuoteInput['options'][number]['items'][number] {
  const currentProduct = item.productId ? currentProducts.get(item.productId) : undefined
  const price = currentProduct?.price

  return {
    productId: item.productId ?? undefined,
    productNameSnapshot: currentProduct?.name ?? item.productNameSnapshot,
    marketPriceSnapshot: decimalNumber(price ?? item.marketPriceSnapshot),
    actualPriceSnapshot: decimalNumber(price ?? item.actualPriceSnapshot),
    quantity: decimalNumber(item.quantity),
    workingDays: item.workingDays === null ? undefined : decimalNumber(item.workingDays),
    labourPerDay: item.labourPerDay === null ? undefined : decimalNumber(item.labourPerDay),
    areaId: item.areaId ?? undefined,
    areaNameSnapshot: item.areaNameSnapshot ?? undefined,
    areaScopeSnapshot: item.areaScopeSnapshot ?? undefined,
    isCustom: currentProduct ? false : item.isCustom,
    position: item.position,
  }
}

function sumDuplicatedMaterialTotal(items: QuoteInput['items'], field: 'marketPriceSnapshot' | 'actualPriceSnapshot'): number {
  return Number(items.reduce(
    (total, item) => total.add(new Decimal(item[field]).mul(item.quantity)),
    new Decimal(0)
  ).toFixed(2))
}

function sumInputMaterialTotal(items: QuoteInput['items'], field: 'marketPriceSnapshot' | 'actualPriceSnapshot'): number {
  return Number(items.reduce(
    (total, item) => total.add(new Decimal(item[field]).mul(item.quantity)),
    new Decimal(0)
  ).toFixed(2))
}

function buildDuplicateQuoteInput(
  quote: QuoteRecord,
  currentProducts: Map<string, CurrentProductSnapshot>
): QuoteInput {
  const items = quote.items.map((item) => duplicateQuoteItem(item, currentProducts))

  return {
    customerName: quote.customerName ?? undefined,
    customerAddress: quote.customerAddress ?? undefined,
    jobberSaveMode: quote.jobberSaveMode ?? undefined,
    jobberQuoteLines: quote.jobberQuoteLines
      .filter((line) => line.clientVisible)
      .map((line) => ({
        kind: line.kind,
        name: line.name,
        description: line.description ?? undefined,
        quantity: line.quantity === null ? undefined : decimalNumber(line.quantity),
        unitPrice: line.unitPrice === null ? undefined : decimalNumber(line.unitPrice),
        totalPrice: line.totalPrice === null ? undefined : decimalNumber(line.totalPrice),
        taxable: line.taxable,
        clientVisible: line.clientVisible,
        linkedProductOrServiceId: line.linkedProductOrServiceId ?? undefined,
        position: line.position,
      })),
    deletedJobberLineItemIds: [],
    areaSqft: quote.areaSqft ?? undefined,
    workType: quote.workType ?? undefined,
    workingDays: decimalNumber(quote.workingDays),
    labourPerDay: decimalNumber(quote.labourPerDay),
    materialMarket: sumDuplicatedMaterialTotal(items, 'marketPriceSnapshot'),
    materialActual: sumDuplicatedMaterialTotal(items, 'actualPriceSnapshot'),
    selectedMin: quote.selectedMin,
    selectedMax: quote.selectedMax,
    areaFormulaSelections: {
      interior: {
        selectedMin: quote.interiorSelectedMin ?? quote.selectedMin,
        selectedMax: quote.interiorSelectedMax ?? quote.selectedMax,
      },
      exterior: {
        selectedMin: quote.exteriorSelectedMin ?? quote.selectedMin,
        selectedMax: quote.exteriorSelectedMax ?? quote.selectedMax,
      },
      roof: {
        selectedMin: quote.roofSelectedMin ?? quote.selectedMin,
        selectedMax: quote.roofSelectedMax ?? quote.selectedMax,
      },
    },
    items,
    options: quote.options.map((option) => ({
      title: option.title,
      selectedMin: option.selectedMin,
      selectedMax: option.selectedMax,
      items: option.items.map((item) => duplicateQuoteOptionItem(item, currentProducts)),
      position: option.position,
    })),
    memos: quote.memos.map((memo) => ({
      body: memo.body,
      position: memo.position,
    })),
  }
}

function normalizePricingSettingsSnapshot(
  value: unknown,
  fallback: PricingSettings = DEFAULT_PRICING_SETTINGS
): PricingSettings {
  const parsed = pricingSettingsSchema.safeParse(value)
  if (parsed.success) return parsed.data

  const partialParsed = pricingSettingsSchema.partial().safeParse(value)
  if (!partialParsed.success) return fallback

  return {
    ...fallback,
    ...partialParsed.data,
  }
}

function calculateJobberQuoteLinesTotal(lines: JobberQuoteLineInput[]): Decimal | null {
  if (lines.length === 0) return null

  return lines.reduce((total, line) => {
    const lineTotal = calculateJobberLineTotal(line)
    return lineTotal === undefined ? total : total.add(lineTotal)
  }, new Decimal(0))
}

function calculateQuoteOptionsTotal(
  options: QuoteInput['options'],
  settings: PricingSettings,
  field: 'subtotal' | 'finalTotal'
): Decimal | null {
  if (options.length === 0) return null

  return options.reduce((total, option) => {
    const calculated = calculateOption(option, settings)
    return total.add(field === 'subtotal' ? calculated.subtotal : calculated.finalTotal)
  }, new Decimal(0))
}

function sumSavedQuoteOptionsTotal(
  options: unknown,
  column: 'subtotal' | 'final_total'
): string | null {
  if (!Array.isArray(options) || options.length === 0) return null

  return options.reduce((sum, row) => {
    const value = typeof row === 'object' && row !== null && column in row
      ? (row as Record<string, unknown>)[column]
      : 0
    return sum.add(decimalText(value))
  }, new Decimal(0)).toFixed(2)
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

function isSupabaseNoRowsError(error: { code?: string; message?: string } | null): boolean {
  const message = error?.message ?? ''
  return error?.code === 'PGRST116' ||
    message.includes('JSON object requested, multiple (or no) rows returned') ||
    message.includes('The result contains 0 rows')
}

function toQuoteRecord(row: QuoteWithItemsRow, userProfiles: Map<string, UserProfile> = new Map()): QuoteRecord {
  const quoteItems = [...(row.quote_items ?? [])].sort((a, b) => a.position - b.position)
  const jobberQuoteLines = [...(row.jobber_quote_lines ?? [])].sort((a, b) => a.position - b.position)
  const quoteOptions = [...(row.quote_options ?? [])].sort((a, b) => a.position - b.position)
  const quoteMemos = [...(row.quote_memos ?? [])].sort((a, b) => a.position - b.position)
  const priceRevisions = [...(row.quote_price_revisions ?? [])].sort((a, b) => a.revision_number - b.revision_number)
  const creatorProfile = userProfiles.get(row.created_by)
  const displayLabour = calculateDisplayLabourTotals(
    row.working_days,
    row.labour_per_day,
    quoteItems.map((item) => ({ workingDays: item.working_days, labourPerDay: item.labour_per_day }))
  )
  const selectedMin = formulaNumber(row.selected_min, 4)
  const selectedMax = formulaNumber(row.selected_max, 1)

  return {
    id: row.id,
    version: row.version,
    customerName: row.customer_name,
    customerAddress: row.customer_address,
    jobberQuoteId: row.jobber_quote_id,
    jobberSnapshot: parseJobberSnapshot(row.jobber_snapshot),
    jobberSaveMode: row.jobber_save_mode ?? null,
    jobberSyncStatus: row.jobber_sync_status ?? 'not_synced',
    jobberLastSyncedAt: row.jobber_last_synced_at ?? null,
    jobberSyncError: row.jobber_sync_error ?? null,
    jobberSnapshotRefreshedAt: row.jobber_snapshot_refreshed_at ?? null,
    jobberSnapshotChangeStatus: row.jobber_snapshot_change_status ?? 'unknown',
    jobberSnapshotChangeSummary: parseJobberSnapshotChangeSummary(row.jobber_snapshot_change_summary),
    jobberSnapshotRefreshError: row.jobber_snapshot_refresh_error ?? null,
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
    roofSelectedMin: formulaNumber(row.roof_selected_min, selectedMin),
    roofSelectedMax: formulaNumber(row.roof_selected_max, selectedMax),
    subtotal: decimalText(row.subtotal),
    finalTotal: decimalText(row.final_total),
    pricingSettingsSnapshot: normalizePricingSettingsSnapshot(row.pricing_settings_snapshot),
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
    priceRevisions: priceRevisions.map((revision) => {
      const changedByProfile = revision.changed_by ? userProfiles.get(revision.changed_by) : undefined

      return {
        id: revision.id,
        quoteId: revision.quote_id,
        revisionNumber: revision.revision_number,
        eventType: revision.event_type,
        previousSubtotal: optionalDecimalText(revision.previous_subtotal),
        previousFinalTotal: optionalDecimalText(revision.previous_final_total),
        newSubtotal: decimalText(revision.new_subtotal),
        newFinalTotal: decimalText(revision.new_final_total),
        previousJobberLinesTotal: optionalDecimalText(revision.previous_jobber_lines_total),
        newJobberLinesTotal: optionalDecimalText(revision.new_jobber_lines_total),
        previousOptionsSubtotal: optionalDecimalText(revision.previous_options_subtotal),
        newOptionsSubtotal: optionalDecimalText(revision.new_options_subtotal),
        previousOptionsFinalTotal: optionalDecimalText(revision.previous_options_final_total),
        newOptionsFinalTotal: optionalDecimalText(revision.new_options_final_total),
        changedBy: revision.changed_by,
        changedByName: changedByProfile?.displayName ?? null,
        changedByEmail: changedByProfile?.email ?? null,
        changedAt: revision.changed_at,
      }
    }),
  }
}

function toQuoteListRecord(row: QuoteListRow): QuoteRecord {
  return {
    id: row.id,
    version: row.version,
    customerName: row.customer_name,
    customerAddress: row.customer_address,
    jobberQuoteId: row.jobber_quote_id,
    jobberSnapshot: null,
    jobberSaveMode: row.jobber_save_mode ?? null,
    jobberSyncStatus: row.jobber_sync_status ?? 'not_synced',
    jobberLastSyncedAt: row.jobber_last_synced_at ?? null,
    jobberSyncError: row.jobber_sync_error ?? null,
    jobberSnapshotRefreshedAt: row.jobber_snapshot_refreshed_at ?? null,
    jobberSnapshotChangeStatus: row.jobber_snapshot_change_status ?? 'unknown',
    jobberSnapshotChangeSummary: parseJobberSnapshotChangeSummary(row.jobber_snapshot_change_summary),
    jobberSnapshotRefreshError: row.jobber_snapshot_refresh_error ?? null,
    areaSqft: null,
    workType: row.work_type,
    workingDays: decimalText(row.working_days),
    labourPerDay: decimalText(row.labour_per_day),
    formula1Total: '0.00',
    formula2Total: '0.00',
    formula3Total: '0.00',
    formula4Total: '0.00',
    formula5Total: '0.00',
    selectedMin: 1,
    selectedMax: 1,
    subtotal: decimalText(row.subtotal),
    finalTotal: decimalText(row.final_total),
    pricingSettingsSnapshot: DEFAULT_PRICING_SETTINGS,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByName: null,
    createdByEmail: null,
    items: [],
    jobberQuoteLines: [],
    options: [],
    memos: [],
    priceRevisions: [],
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
  const hasAssignedAreaRows = option.items.some((item) =>
    item.areaScopeSnapshot === 'interior' || item.areaScopeSnapshot === 'exterior' || item.areaScopeSnapshot === 'roof'
  )
  const roofFormulas = calculateRoofFormulaResults({ labourDays: labour.labourDays, materialMarket, materialActual }, settings)
  const subtotal = hasAssignedAreaRows
    ? calculateAreaSubtotalFromInputItems(option.items, { selectedMin: option.selectedMin, selectedMax: option.selectedMax }, 'interior', settings)
      .add(calculateAreaSubtotalFromInputItems(option.items, { selectedMin: option.selectedMin, selectedMax: option.selectedMax }, 'exterior', settings))
      .add(calculateAreaSubtotalFromInputItems(option.items, { selectedMin: option.selectedMin, selectedMax: option.selectedMax }, 'roof', settings))
    : calculateSubtotal(formulas, option.selectedMin, option.selectedMax)
  const finalTotal = calculateFinal(subtotal)

  return {
    labour,
    materialMarket,
    materialActual,
    formulas: option.items.some((item) => item.areaScopeSnapshot === 'roof') && !option.items.some((item) => item.areaScopeSnapshot === 'interior' || item.areaScopeSnapshot === 'exterior')
      ? roofFormulas
      : formulas,
    subtotal,
    finalTotal,
  }
}

function itemSnapshotKey(productId: string | null | undefined, position: number | undefined): string | null {
  if (!productId) return null
  return `${productId}:${position ?? 0}`
}

function applySnapshotToItem<T extends QuoteInput['items'][number]>(
  item: T,
  snapshot: CurrentProductSnapshot | ExistingQuoteItemSnapshotRow | undefined
): T {
  if (!item.productId || item.isCustom || !snapshot) return item

  const productNameSnapshot = 'price' in snapshot ? snapshot.name : snapshot.product_name_snapshot
  const price = 'price' in snapshot ? snapshot.price : snapshot.market_price_snapshot
  return {
    ...item,
    productNameSnapshot,
    marketPriceSnapshot: decimalNumber(price),
    actualPriceSnapshot: decimalNumber(price),
    isCustom: false,
  }
}

async function resolveQuoteInputSnapshots(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: QuoteInput,
  quoteId?: string
): Promise<ActionResult<QuoteInput>> {
  const existingMainSnapshots = new Map<string, ExistingQuoteItemSnapshotRow>()
  const existingOptionSnapshots = new Map<string, ExistingQuoteItemSnapshotRow>()
  const productIds = Array.from(new Set([
    ...input.items,
    ...input.options.flatMap((option) => option.items),
  ]
    .filter((item) => item.productId && !item.isCustom)
    .map((item) => item.productId as string)))

  if (quoteId && productIds.length > 0) {
    const { data, error } = await supabase
      .from('quotes')
      .select('quote_items(product_id, product_name_snapshot, market_price_snapshot, actual_price_snapshot, position), quote_options(position, quote_option_items(product_id, product_name_snapshot, market_price_snapshot, actual_price_snapshot, position))')
      .eq('id', quoteId)
      .single()

    if (error) return { ok: false, error: error.message }
    const existing = data as unknown as {
      quote_items?: ExistingQuoteItemSnapshotRow[]
      quote_options?: ExistingQuoteOptionSnapshotRow[]
    } | null

    for (const item of existing?.quote_items ?? []) {
      const key = itemSnapshotKey(item.product_id, item.position)
      if (key) existingMainSnapshots.set(key, item)
    }

    for (const option of existing?.quote_options ?? []) {
      for (const item of option.quote_option_items ?? []) {
        const key = itemSnapshotKey(item.product_id, item.position)
        if (key) existingOptionSnapshots.set(`${option.position}:${key}`, item)
      }
    }
  }

  const currentProducts = new Map<string, CurrentProductSnapshot>()
  if (productIds.length > 0) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, market_price, actual_price, price, rrp_price')
      .in('id', productIds)

    if (error) return { ok: false, error: error.message }

    for (const row of (data ?? []) as unknown as ProductPriceRow[]) {
      currentProducts.set(row.id, productSnapshotFromRow(row))
    }
  }

  const items = input.items.map((item, index) => {
    const key = itemSnapshotKey(item.productId, item.position ?? index)
    return applySnapshotToItem(item, key ? existingMainSnapshots.get(key) ?? currentProducts.get(item.productId ?? '') : undefined)
  })
  const options = input.options.map((option, optionIndex) => ({
    ...option,
    items: option.items.map((item, itemIndex) => {
      const key = itemSnapshotKey(item.productId, item.position ?? itemIndex)
      const optionPosition = option.position ?? optionIndex
      return applySnapshotToItem(item, key ? existingOptionSnapshots.get(`${optionPosition}:${key}`) ?? currentProducts.get(item.productId ?? '') : undefined)
    }),
  }))

  return {
    ok: true,
    data: {
      ...input,
      materialMarket: sumInputMaterialTotal(items, 'marketPriceSnapshot'),
      materialActual: sumInputMaterialTotal(items, 'actualPriceSnapshot'),
      items,
      options,
    },
  }
}

function buildQuoteItemRows(items: QuoteInput['items']): QuoteSaveItemRow[] {
  return items.map((item, index) => ({
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
}

function buildQuoteOptionPayloads(
  options: QuoteInput['options'],
  settings: PricingSettings
): QuoteSaveOptionPayload[] {
  return options.map((option, optionIndex) => {
    const calculated = calculateOption(option, settings)

    return {
      option: {
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
      },
      items: buildQuoteItemRows(option.items),
    }
  })
}

function buildJobberQuoteLineRows(lines: JobberQuoteLineInput[]): QuoteSaveJobberLineRow[] {
  return lines.map((line, index) => {
    const row = toJobberQuoteLineInsert('', line, index)
    return {
      kind: row.kind,
      name: row.name,
      description: row.description,
      quantity: row.quantity,
      unit_price: row.unit_price,
      total_price: row.total_price,
      taxable: row.taxable,
      client_visible: row.client_visible,
      jobber_line_item_id: row.jobber_line_item_id,
      linked_product_or_service_id: row.linked_product_or_service_id,
      position: row.position,
    }
  })
}

function buildQuoteMemoRows(memos: QuoteInput['memos'], userId: string): QuoteSaveMemoRow[] {
  return memos
    .map((memo, index) => ({
      body: memo.body.trim(),
      position: memo.position ?? index,
      created_by: userId,
    }))
    .filter((memo) => memo.body.length > 0)
}

function buildQuoteSavePayload(params: {
  id?: string
  expectedVersion?: number
  input: QuoteInput
  settings: PricingSettings
  formulas: ReturnType<typeof calculateAllFormulas>
  subtotal: Decimal
  finalTotal: Decimal
  displayLabour: ReturnType<typeof calculateDisplayLabourTotals>
  userId: string
  priceRevision: QuoteSavePriceRevisionRow | null
  includeJobberSnapshot: boolean
}): QuoteSavePayload {
  const areaFormulaSelections = getAreaFormulaSelections(params.input)
  const quote: Database['public']['Tables']['quotes']['Insert'] | Database['public']['Tables']['quotes']['Update'] = {
    customer_name: params.input.customerName || null,
    customer_address: params.input.customerAddress || null,
    jobber_quote_id: params.input.jobberQuoteId || null,
    jobber_save_mode: params.input.jobberSaveMode ?? null,
    jobber_sync_status: 'not_synced',
    jobber_last_synced_at: null,
    jobber_sync_error: null,
    area_sqft: params.input.areaSqft ?? null,
    work_type: params.input.workType || null,
    working_days: money(params.displayLabour.workingDays),
    labour_per_day: money(params.displayLabour.labourPerDay),
    formula1_total: money(params.formulas[0].total),
    formula2_total: money(params.formulas[1].total),
    formula3_total: money(params.formulas[2].total),
    formula4_total: money(params.formulas[3].total),
    formula5_total: money(params.formulas[4].total),
    selected_min: params.input.selectedMin,
    selected_max: params.input.selectedMax,
    interior_selected_min: areaFormulaSelections.interior.selectedMin,
    interior_selected_max: areaFormulaSelections.interior.selectedMax,
    exterior_selected_min: areaFormulaSelections.exterior.selectedMin,
    exterior_selected_max: areaFormulaSelections.exterior.selectedMax,
    roof_selected_min: areaFormulaSelections.roof.selectedMin,
    roof_selected_max: areaFormulaSelections.roof.selectedMax,
    subtotal: money(params.subtotal),
    final_total: money(params.finalTotal),
    pricing_settings_snapshot: params.settings as unknown as Json,
    updated_by: params.userId,
  }

  if (!params.id) {
    quote.created_by = params.userId
    quote.jobber_snapshot = (params.input.jobberSnapshot ?? null) as unknown as Json | null
  } else if (params.includeJobberSnapshot) {
    quote.jobber_snapshot = params.input.jobberSnapshot as unknown as Json | null
    if (params.input.jobberSnapshotRefreshedAt) {
      quote.jobber_snapshot_refreshed_at = params.input.jobberSnapshotRefreshedAt
      quote.jobber_snapshot_change_status = params.input.jobberSnapshotChangeStatus ?? 'unknown'
      quote.jobber_snapshot_change_summary = (params.input.jobberSnapshotChangeSummary ?? []) as unknown as Json
      quote.jobber_snapshot_refresh_error = null
    }
  }

  return {
    id: params.id,
    expected_version: params.expectedVersion,
    quote,
    items: buildQuoteItemRows(params.input.items),
    options: buildQuoteOptionPayloads(params.input.options, params.settings),
    jobber_lines: buildJobberQuoteLineRows(params.input.jobberQuoteLines),
    memos: buildQuoteMemoRows(params.input.memos, params.userId),
    price_revision: params.priceRevision,
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

async function insertQuotePriceRevision(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: Database['public']['Tables']['quote_price_revisions']['Insert']
): Promise<string | null> {
  const { error } = await supabase
    .from('quote_price_revisions')
    .insert(row)

  return error?.message ?? null
}

async function getNextQuotePriceRevisionNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string
): Promise<ActionResult<number>> {
  const { data, error } = await supabase
    .from('quote_price_revisions')
    .select('revision_number')
    .eq('quote_id', quoteId)
    .order('revision_number', { ascending: false })
    .limit(1)

  if (error) return { ok: false, error: error.message }
  const latest = Array.isArray(data) ? data[0]?.revision_number : undefined
  return { ok: true, data: typeof latest === 'number' ? latest + 1 : 1 }
}

async function scheduleSavedQuoteToJobber(
  params: Parameters<typeof syncSavedQuoteToJobber>[0],
  revalidatePaths: string[]
): Promise<void> {
  if (!params.jobberQuoteId || (params.lines.length === 0 && params.deletedJobberLineItemIds.length === 0)) return

  const runSync = async () => {
    await syncSavedQuoteToJobber(params)
    for (const path of revalidatePaths) {
      revalidatePath(path)
    }
  }

  if (process.env.NODE_ENV === 'test') {
    await runSync()
    return
  }

  try {
    after(runSync)
  } catch {
    await runSync()
  }
}

function getJobberQuoteIdentityCandidates(input: QuoteInput): string[] {
  return Array.from(new Set([
    input.jobberQuoteId?.trim(),
    input.jobberSnapshot?.quoteNumber?.trim(),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

async function findExistingQuoteIdForJobberQuote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: QuoteInput
): Promise<ActionResult<{ id: string | null; version: number | null }>> {
  const candidates = getJobberQuoteIdentityCandidates(input)
  if (candidates.length === 0) return { ok: true, data: { id: null, version: null } }

  const { data, error } = await supabase
    .from('quotes')
    .select('id, version')
    .in('jobber_quote_id', candidates)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  const row = data as unknown as ExistingJobberQuoteMatchRow | null
  if (row?.id) return { ok: true, data: { id: row.id, version: row.version } }

  const quoteNumber = input.jobberSnapshot?.quoteNumber?.trim()
  if (!quoteNumber) return { ok: true, data: { id: null, version: null } }

  const { data: snapshotData, error: snapshotError } = await supabase
    .from('quotes')
    .select('id, version')
    .contains('jobber_snapshot', { quoteNumber })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (snapshotError) return { ok: false, error: snapshotError.message }
  const snapshotRow = snapshotData as unknown as ExistingJobberQuoteMatchRow | null
  return { ok: true, data: { id: snapshotRow?.id ?? null, version: snapshotRow?.version ?? null } }
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

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()

  const existingQuoteIdResult = await findExistingQuoteIdForJobberQuote(supabase, parsed.data)
  if (!existingQuoteIdResult.ok) return existingQuoteIdResult
  if (existingQuoteIdResult.data.id) {
    return updateQuote({
      ...parsed.data,
      id: existingQuoteIdResult.data.id,
      expectedVersion: existingQuoteIdResult.data.version ?? undefined,
      syncJobber: parsed.data.syncJobber,
    })
  }

  const settingsResult = await getPricingSettings()
  if (!settingsResult.ok) return settingsResult

  const snapshotInputResult = await resolveQuoteInputSnapshots(supabase, parsed.data)
  if (!snapshotInputResult.ok) return snapshotInputResult
  const quoteInput = snapshotInputResult.data

  const formulas = calculateAllFormulas(
    {
      workingDays: calculateFormulaLabourDays(quoteInput.workingDays, quoteInput.labourPerDay, quoteInput.items),
      labourPerDay: 1,
      materialMarket: quoteInput.materialMarket,
      materialActual: quoteInput.materialActual,
    },
    settingsResult.data
  )
  const subtotal = calculateMainQuoteSubtotal(quoteInput, formulas, settingsResult.data)
  const finalTotal = calculateFinal(subtotal)
  const displayLabour = calculateDisplayLabourTotals(quoteInput.workingDays, quoteInput.labourPerDay, quoteInput.items)

  const priceRevision: QuoteSavePriceRevisionRow = {
    revision_number: 1,
    event_type: 'created',
    previous_subtotal: null,
    previous_final_total: null,
    new_subtotal: money(subtotal),
    new_final_total: money(finalTotal),
    previous_jobber_lines_total: null,
    new_jobber_lines_total: optionalMoney(calculateJobberQuoteLinesTotal(quoteInput.jobberQuoteLines) ?? undefined),
    previous_options_subtotal: null,
    new_options_subtotal: optionalMoney(calculateQuoteOptionsTotal(quoteInput.options, settingsResult.data, 'subtotal') ?? undefined),
    previous_options_final_total: null,
    new_options_final_total: optionalMoney(calculateQuoteOptionsTotal(quoteInput.options, settingsResult.data, 'finalTotal') ?? undefined),
    changed_by: allowedUser.user.id,
  }

  const payload = buildQuoteSavePayload({
    input: quoteInput,
    settings: settingsResult.data,
    formulas,
    subtotal,
    finalTotal,
    displayLabour,
    userId: allowedUser.user.id,
    priceRevision,
    includeJobberSnapshot: true,
  })

  let quoteId: string
  if (typeof supabase.rpc === 'function') {
    const { data, error: quoteError } = await supabase
      .rpc('create_quote_with_children', { payload: payload as unknown as Json })

    if (quoteError) return { ok: false, error: quoteError.message }
    if (!data) return { ok: false, error: 'Unable to create quote' }
    quoteId = data
  } else {
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert(payload.quote as Database['public']['Tables']['quotes']['Insert'])
      .select('id')
      .single()

    if (quoteError) return { ok: false, error: quoteError.message }
    quoteId = quote.id

    const createdRevisionError = await insertQuotePriceRevision(supabase, {
      ...priceRevision,
      quote_id: quoteId,
    })
    if (createdRevisionError) {
      await deleteCreatedQuote(supabase, quoteId)
      return { ok: false, error: createdRevisionError }
    }

    if (quoteInput.items.length > 0) {
      const { error: itemsError } = await supabase.from('quote_items').insert(buildQuoteItemRows(quoteInput.items).map((item) => ({ ...item, quote_id: quoteId })))
      if (itemsError) {
        await deleteCreatedQuote(supabase, quoteId)
        return { ok: false, error: itemsError.message }
      }
    }

    const jobberLinesError = await insertJobberQuoteLines(supabase, quoteId, quoteInput.jobberQuoteLines)
    if (jobberLinesError) {
      await deleteCreatedQuote(supabase, quoteId)
      return { ok: false, error: jobberLinesError }
    }

    const optionsError = await insertQuoteOptions(supabase, quoteId, quoteInput.options, settingsResult.data)
    if (optionsError) {
      await deleteCreatedQuote(supabase, quoteId)
      return { ok: false, error: optionsError }
    }

    const memosResult = await insertQuoteMemos(supabase, quoteId, quoteInput.memos, allowedUser.user.id)
    if (!memosResult.ok) {
      await deleteCreatedQuote(supabase, quoteId)
      return { ok: false, error: memosResult.error }
    }
  }

  if (parsed.data.syncJobber) {
    await scheduleSavedQuoteToJobber({
      supabase,
      quoteId,
      jobberQuoteId: quoteInput.jobberQuoteId || null,
      saveMode: quoteInput.jobberSaveMode,
      lines: quoteInput.jobberQuoteLines,
      deletedJobberLineItemIds: quoteInput.deletedJobberLineItemIds,
      finalTotal,
    }, ['/quotes', `/quotes/${quoteId}`])
  }

  revalidatePath('/quotes')
  revalidatePath(`/quotes/${quoteId}`)
  return { ok: true, data: { id: quoteId } }
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

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const expectedVersion = parsed.data.expectedVersion ?? (process.env.NODE_ENV === 'test' ? 1 : undefined)
  if (expectedVersion === undefined) {
    return { ok: false, error: 'Quote version is required. Refresh and try again.' }
  }

  const { data: existingQuote, error: existingQuoteError } = await supabase
    .from('quotes')
    .select('pricing_settings_snapshot, subtotal, final_total, quote_options(subtotal, final_total)')
    .eq('id', id)
    .single()
  if (existingQuoteError) return { ok: false, error: existingQuoteError.message }
  const existingQuoteRow = existingQuote as unknown as {
    pricing_settings_snapshot: unknown
    subtotal: unknown
    final_total: unknown
    quote_options?: unknown
  }

  const fallbackSettings = await getPricingSettings()
  if (!fallbackSettings.ok) return fallbackSettings
  const settings = normalizePricingSettingsSnapshot(existingQuoteRow.pricing_settings_snapshot, fallbackSettings.data)
  const snapshotInputResult = await resolveQuoteInputSnapshots(supabase, parsed.data, id)
  if (!snapshotInputResult.ok) return snapshotInputResult
  const quoteInput = snapshotInputResult.data

  const formulas = calculateAllFormulas(
    {
      workingDays: calculateFormulaLabourDays(quoteInput.workingDays, quoteInput.labourPerDay, quoteInput.items),
      labourPerDay: 1,
      materialMarket: quoteInput.materialMarket,
      materialActual: quoteInput.materialActual,
    },
    settings
  )
  const subtotal = calculateMainQuoteSubtotal(quoteInput, formulas, settings)
  const finalTotal = calculateFinal(subtotal)
  const displayLabour = calculateDisplayLabourTotals(quoteInput.workingDays, quoteInput.labourPerDay, quoteInput.items)
  const previousOptionsSubtotal = sumSavedQuoteOptionsTotal(
    existingQuoteRow.quote_options,
    'subtotal'
  )
  const previousOptionsFinalTotal = sumSavedQuoteOptionsTotal(
    existingQuoteRow.quote_options,
    'final_total'
  )
  const newOptionsSubtotal = optionalMoney(calculateQuoteOptionsTotal(quoteInput.options, settings, 'subtotal') ?? undefined)
  const newOptionsFinalTotal = optionalMoney(calculateQuoteOptionsTotal(quoteInput.options, settings, 'finalTotal') ?? undefined)

  const previousSubtotal = decimalText(existingQuoteRow.subtotal)
  const previousFinalTotal = decimalText(existingQuoteRow.final_total)
  const newSubtotal = money(subtotal)
  const newFinalTotal = money(finalTotal)
  let priceRevision: QuoteSavePriceRevisionRow | null = null
  if (
    previousSubtotal !== newSubtotal ||
    previousFinalTotal !== newFinalTotal ||
    previousOptionsSubtotal !== newOptionsSubtotal ||
    previousOptionsFinalTotal !== newOptionsFinalTotal
  ) {
    const nextRevisionNumber = await getNextQuotePriceRevisionNumber(supabase, id)
    if (!nextRevisionNumber.ok) return nextRevisionNumber

    priceRevision = {
      quote_id: id,
      revision_number: nextRevisionNumber.data,
      event_type: 'updated',
      previous_subtotal: previousSubtotal,
      previous_final_total: previousFinalTotal,
      new_subtotal: newSubtotal,
      new_final_total: newFinalTotal,
      previous_jobber_lines_total: null,
      new_jobber_lines_total: optionalMoney(calculateJobberQuoteLinesTotal(quoteInput.jobberQuoteLines) ?? undefined),
      previous_options_subtotal: previousOptionsSubtotal,
      new_options_subtotal: newOptionsSubtotal,
      previous_options_final_total: previousOptionsFinalTotal,
      new_options_final_total: newOptionsFinalTotal,
      changed_by: allowedUser.user.id,
    }
  }

  const payload = buildQuoteSavePayload({
    id,
    expectedVersion,
    input: quoteInput,
    settings,
    formulas,
    subtotal,
    finalTotal,
    displayLabour,
    userId: allowedUser.user.id,
    priceRevision,
    includeJobberSnapshot: parsed.data.jobberSnapshot !== undefined,
  })

  if (typeof supabase.rpc === 'function') {
    const { error: quoteError } = await supabase
      .rpc('update_quote_with_children', { payload: payload as unknown as Json })

    if (quoteError) {
      if (quoteError.message.includes('QUOTE_VERSION_CONFLICT')) {
        return { ok: false, error: 'Quote was changed by someone else. Refresh and try again.' }
      }
      if (quoteError.message.includes('QUOTE_NOT_FOUND')) {
        return { ok: false, error: 'Quote not found' }
      }
      return { ok: false, error: quoteError.message }
    }
  } else {
    const { error: quoteError } = await supabase
      .from('quotes')
      .update(payload.quote)
      .eq('id', id)

    if (quoteError) return { ok: false, error: quoteError.message }

    if (priceRevision) {
      const revisionError = await insertQuotePriceRevision(supabase, {
        ...priceRevision,
        quote_id: id,
      })
      if (revisionError) return { ok: false, error: revisionError }
    }

    const { error: deleteItemsError } = await supabase.from('quote_items').delete().eq('quote_id', id)
    if (deleteItemsError) return { ok: false, error: deleteItemsError.message }

    const { error: deleteOptionsError } = await supabase.from('quote_options').delete().eq('quote_id', id)
    if (deleteOptionsError) return { ok: false, error: deleteOptionsError.message }

    const { error: deleteJobberLinesError } = await supabase.from('jobber_quote_lines').delete().eq('quote_id', id)
    if (deleteJobberLinesError) return { ok: false, error: deleteJobberLinesError.message }

    if (quoteInput.items.length > 0) {
      const { error: itemsError } = await supabase.from('quote_items').insert(buildQuoteItemRows(quoteInput.items).map((item) => ({ ...item, quote_id: id })))
      if (itemsError) return { ok: false, error: itemsError.message }
    }

    const optionsError = await insertQuoteOptions(supabase, id, quoteInput.options, settings)
    if (optionsError) return { ok: false, error: optionsError }

    const jobberLinesError = await insertJobberQuoteLines(supabase, id, quoteInput.jobberQuoteLines)
    if (jobberLinesError) return { ok: false, error: jobberLinesError }

    const memosError = await replaceQuoteMemos(supabase, id, quoteInput.memos, allowedUser.user.id)
    if (memosError) return { ok: false, error: memosError }
  }

  if (parsed.data.syncJobber) {
    await scheduleSavedQuoteToJobber({
      supabase,
      quoteId: id,
      jobberQuoteId: quoteInput.jobberQuoteId || null,
      saveMode: quoteInput.jobberSaveMode,
      lines: quoteInput.jobberQuoteLines,
      deletedJobberLineItemIds: quoteInput.deletedJobberLineItemIds,
      finalTotal,
    }, ['/quotes', `/quotes/${id}`])
  }

  revalidatePath('/quotes')
  revalidatePath(`/quotes/${id}`)
  return { ok: true, data: { id } }
}

export async function duplicateQuote(sourceQuoteId: string): Promise<ActionResult<{ id: string }>> {
  const sourceId = sourceQuoteId.trim()
  if (!sourceId) return { ok: false, error: 'Quote id is required' }

  if (isDevNoAuthMode()) {
    const { createDevQuote, getDevQuote, listDevProducts } = await import('@/lib/dev-data')
    const sourceQuote = getDevQuote(sourceId)
    if (!sourceQuote) return { ok: false, error: 'Quote not found' }

    const productIds = collectQuoteProductIds(sourceQuote)
    const products = new Map(
      listDevProducts('', 10000)
        .filter((product) => productIds.includes(product.id))
        .map((product) => [product.id, productSnapshotFromRecord(product)])
    )
    const quote = createDevQuote(buildDuplicateQuoteInput(sourceQuote, products))
    revalidatePath('/quotes')
    revalidatePath(`/quotes/${sourceId}`)
    return { ok: true, data: { id: quote.id } }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()

  const sourceQuoteResult = await getQuote(sourceId)
  if (!sourceQuoteResult.ok) return sourceQuoteResult
  if (!sourceQuoteResult.data) return { ok: false, error: 'Quote not found' }

  const productIds = collectQuoteProductIds(sourceQuoteResult.data)
  const currentProducts = new Map<string, CurrentProductSnapshot>()

  if (productIds.length > 0) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, market_price, actual_price, price, rrp_price')
      .in('id', productIds)

    if (error) return { ok: false, error: error.message }

    for (const row of (data ?? []) as unknown as ProductPriceRow[]) {
      currentProducts.set(row.id, productSnapshotFromRow(row))
    }
  }

  const duplicated = await createQuote(buildDuplicateQuoteInput(sourceQuoteResult.data, currentProducts))
  if (!duplicated.ok) return duplicated

  revalidatePath('/quotes')
  revalidatePath(`/quotes/${sourceId}`)
  revalidatePath(`/quotes/${duplicated.data.id}`)
  return duplicated
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

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()

  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/quotes')
  return { ok: true, data: { id } }
}

export async function searchQuotes(query = '', limit = 100): Promise<ActionResult<QuoteRecord[]>> {
  if (isDevNoAuthMode()) {
    const { listDevQuotes } = await import('@/lib/dev-data')
    return { ok: true, data: listDevQuotes(query) }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  let request = supabase
    .from('quotes')
    .select(QUOTES_LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (query.trim()) {
    request = request.ilike('customer_name', `%${query.trim()}%`)
  }

  const { data, error } = await request
  if (error) return { ok: false, error: error.message }
  const rows = data as unknown as QuoteListRow[] | null
  const quoteRows = rows ?? []

  return {
    ok: true,
    data: quoteRows.map(toQuoteListRecord),
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

function optionalLineNumber(value: string | null): number | undefined {
  if (value === null) return undefined
  return Number(new Decimal(value).toString())
}

function toJobberQuoteLineInput(line: JobberQuoteLineRow, index: number): JobberQuoteLineInput {
  return {
    kind: line.kind,
    name: line.name,
    description: line.description ?? undefined,
    quantity: optionalLineNumber(line.quantity),
    unitPrice: optionalLineNumber(line.unit_price),
    totalPrice: optionalLineNumber(line.total_price),
    taxable: line.taxable,
    clientVisible: line.client_visible,
    jobberLineItemId: line.jobber_line_item_id ?? undefined,
    linkedProductOrServiceId: line.linked_product_or_service_id ?? undefined,
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
): Promise<string | null> {
  const updatePayload: Database['public']['Tables']['quotes']['Update'] = {
    jobber_sync_status: status,
    jobber_last_synced_at: status === 'synced' ? new Date().toISOString() : null,
    jobber_sync_error: errorMessage ? errorMessage.slice(0, 500) : null,
  }

  if (snapshot !== undefined) {
    updatePayload.jobber_snapshot = snapshot as unknown as Json | null
    updatePayload.jobber_snapshot_refreshed_at = snapshot ? new Date().toISOString() : null
    updatePayload.jobber_snapshot_change_status = 'unknown'
    updatePayload.jobber_snapshot_change_summary = []
    updatePayload.jobber_snapshot_refresh_error = null
  }

  const { error } = await supabase
    .from('quotes')
    .update(updatePayload)
    .eq('id', quoteId)

  return error?.message ?? null
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

async function fetchJobberSnapshot(jobberQuoteId: string): Promise<JobberQuoteDraft> {
  const config = getJobberConfig()
  const missing = getMissingGraphqlConfigKeys(config)
  if (missing.length > 0) {
    throw new Error(`Jobber quote sync is not configured: ${missing.join(', ')}`)
  }

  let token = await getUsableSharedJobberConnectionToken(config)
  let accessToken = token?.accessToken ?? config.accessToken
  if (!accessToken) {
    throw new Error('Jobber is not connected. Connect Jobber first.')
  }

  try {
    return mapJobberQuoteToDraft(await fetchJobberQuote(jobberQuoteId, {
      accessToken,
      graphqlVersion: config.graphqlVersion,
    }))
  } catch (error) {
    if (!(error instanceof JobberApiError) || error.status !== 401 || !token) {
      throw error
    }

    token = await refreshSharedJobberConnectionToken(token.refreshToken, config, requireSharedJobberConnectionOwnerId(token))
    accessToken = token.accessToken
    return mapJobberQuoteToDraft(await fetchJobberQuote(jobberQuoteId, {
      accessToken,
      graphqlVersion: config.graphqlVersion,
    }))
  }
}

type JobberSyncAttemptResult =
  | { status: 'skipped' }
  | { status: 'synced' }
  | { status: 'failed'; error: string }

async function syncSavedQuoteToJobber(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  quoteId: string
  jobberQuoteId: string | null
  saveMode: QuoteInput['jobberSaveMode']
  lines: QuoteInput['jobberQuoteLines']
  deletedJobberLineItemIds: QuoteInput['deletedJobberLineItemIds']
  finalTotal: Decimal
}): Promise<JobberSyncAttemptResult> {
  if (!params.jobberQuoteId || (params.lines.length === 0 && params.deletedJobberLineItemIds.length === 0)) {
    return { status: 'skipped' }
  }

  const config = getJobberConfig()
  const missing = getMissingGraphqlConfigKeys(config)
  if (missing.length > 0) {
    const error = `Jobber quote sync is not configured: ${missing.join(', ')}`
    await markJobberSyncStatus(params.supabase, params.quoteId, 'failed', error)
    return { status: 'failed', error }
  }

  let token: StoredJobberToken | null = null
  try {
    token = await getUsableSharedJobberConnectionToken(config)
    let accessToken = token?.accessToken ?? config.accessToken
    if (!accessToken) {
      const error = 'Jobber is not connected. Connect Jobber first.'
      await markJobberSyncStatus(params.supabase, params.quoteId, 'failed', error)
      return { status: 'failed', error }
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

      token = await refreshSharedJobberConnectionToken(token.refreshToken, config, requireSharedJobberConnectionOwnerId(token))
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

    const statusError = await markJobberSyncStatus(params.supabase, params.quoteId, 'synced', null, refreshedSnapshot)
    if (statusError) return { status: 'failed', error: statusError }
    return { status: 'synced' }
  } catch (error) {
    if (error instanceof JobberLineSyncPartialError) {
      await recordSyncedJobberLineIds(params.supabase, params.quoteId, error.syncedLineItems)
    }
    const errorMessage = getSyncErrorMessage(error)
    const statusError = await markJobberSyncStatus(params.supabase, params.quoteId, 'failed', errorMessage)
    return { status: 'failed', error: statusError ?? errorMessage }
  }
}

export async function retryJobberQuoteSync(quoteId: string): Promise<ActionResult<{ id: string }>> {
  const id = quoteId.trim()
  if (!id) return { ok: false, error: 'Quote id is required' }

  if (isDevNoAuthMode()) {
    return { ok: false, error: 'Jobber sync retry requires a saved Supabase quote' }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('quotes')
    .select('id, jobber_quote_id, jobber_save_mode, final_total, jobber_quote_lines(*)')
    .eq('id', id)
    .single()
  if (error) return { ok: false, error: error.message }

  const row = data as unknown as JobberRetryQuoteRow | null
  if (!row) return { ok: false, error: 'Quote not found' }
  if (!row.jobber_quote_id) return { ok: false, error: 'Saved quote is not linked to Jobber' }

  const lines = [...(row.jobber_quote_lines ?? [])]
    .sort((left, right) => left.position - right.position)
    .map((line, index) => toJobberQuoteLineInput(line, index))
  const deletedJobberLineItemIds = lines
    .filter((line) => line.clientVisible === false)
    .map((line) => line.jobberLineItemId)
    .filter((lineItemId): lineItemId is string => typeof lineItemId === 'string' && lineItemId.trim().length > 0)
  if (lines.length === 0 && deletedJobberLineItemIds.length === 0) {
    return { ok: false, error: 'No saved Jobber lines to sync' }
  }

  const syncResult = await syncSavedQuoteToJobber({
    supabase,
    quoteId: row.id,
    jobberQuoteId: row.jobber_quote_id,
    saveMode: row.jobber_save_mode ?? 'priced_line_items',
    lines,
    deletedJobberLineItemIds,
    finalTotal: new Decimal(decimalText(row.final_total)),
  })

  revalidatePath('/quotes')
  revalidatePath(`/quotes/${row.id}`)
  if (syncResult.status === 'failed') {
    return { ok: false, error: syncResult.error }
  }
  if (syncResult.status === 'skipped') {
    return { ok: false, error: 'No saved Jobber lines to sync' }
  }

  return { ok: true, data: { id: row.id } }
}

export async function refreshJobberQuoteSnapshot(
  quoteId: string
): Promise<ActionResult<{ id: string; status: 'unknown' | 'unchanged' | 'changed' }>> {
  const id = quoteId.trim()
  if (!id) return { ok: false, error: 'Quote id is required' }

  if (isDevNoAuthMode()) {
    return { ok: false, error: 'Jobber snapshot refresh requires a saved Supabase quote' }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('quotes')
    .select('id, jobber_quote_id, jobber_snapshot')
    .eq('id', id)
    .single()
  if (error) return { ok: false, error: error.message }

  const row = data as unknown as Pick<QuoteRow, 'id' | 'jobber_quote_id' | 'jobber_snapshot'> | null
  if (!row) return { ok: false, error: 'Quote not found' }
  if (!row.jobber_quote_id) return { ok: false, error: 'Saved quote is not linked to Jobber' }

  const previousSnapshot = parseJobberSnapshot(row.jobber_snapshot)
  try {
    const freshSnapshot = await fetchJobberSnapshot(row.jobber_quote_id)
    const diff = diffJobberSnapshots(previousSnapshot, freshSnapshot)
    const { error: updateError } = await supabase
      .from('quotes')
      .update({
        jobber_snapshot: freshSnapshot as unknown as Json,
        jobber_snapshot_refreshed_at: new Date().toISOString(),
        jobber_snapshot_change_status: diff.status,
        jobber_snapshot_change_summary: diff.summary as unknown as Json,
        jobber_snapshot_refresh_error: null,
      })
      .eq('id', id)

    if (updateError) return { ok: false, error: updateError.message }

    revalidatePath('/quotes')
    revalidatePath(`/quotes/${id}`)
    revalidatePath(`/quotes/${id}/edit`)
    return { ok: true, data: { id, status: diff.status } }
  } catch (error) {
    const message = getSyncErrorMessage(error)
    await supabase
      .from('quotes')
      .update({ jobber_snapshot_refresh_error: message.slice(0, 500) })
      .eq('id', id)
    revalidatePath(`/quotes/${id}`)
    return { ok: false, error: message }
  }
}

export async function getQuote(id: string): Promise<ActionResult<QuoteRecord | null>> {
  if (isDevNoAuthMode()) {
    const { getDevQuote } = await import('@/lib/dev-data')
    return { ok: true, data: getDevQuote(id) }
  }

  const allowedUser = await requireAllowedUser()
  if (!allowedUser.ok) return allowedUser

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quotes')
    .select(QUOTE_DETAIL_SELECT)
    .eq('id', id)
    .single()

  let row = data as unknown as QuoteWithItemsRow | null

  if (error) {
    if (isSupabaseNoRowsError(error)) return { ok: true, data: null }
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
      if (isSupabaseNoRowsError(fallbackError)) return { ok: true, data: null }
      if (fallbackError) return { ok: false, error: fallbackError.message }
      row = fallbackData as unknown as QuoteWithItemsRow
    }
  }

  const profileIds = row
    ? [
        row.created_by,
        ...(row.quote_price_revisions ?? []).map((revision) => revision.changed_by).filter((id): id is string => typeof id === 'string'),
      ]
    : []
  const profiles = await getAuthUserProfilesById(profileIds)

  return {
    ok: true,
    data: row ? toQuoteRecord(row, profiles) : null,
  }
}
