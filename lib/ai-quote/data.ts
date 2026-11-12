import 'server-only'

import Decimal from 'decimal.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeAreaKey, type KnowledgeSourceQuote } from '@/lib/ai-quote/knowledge-stats'
import type { SimilarQuoteCandidate } from '@/lib/ai-quote/similar-quotes'
import { normalizeRrpProduct, type ProductRecord } from '@/lib/products/types'
import type { Database } from '@/lib/supabase/types'
import type { EvalCandidate } from '@/lib/ai-quote/eval-select'
import type { AiDraftComparison } from '@/lib/ai-quote/eval-metrics'
import { redactContactDetails } from '@/lib/ai-quote/pii'
import { calculateDisplayLabourTotals } from '@/lib/quote-labour'

export interface DraftCatalog {
  productServices: Array<{
    id: string
    name: string
    category: string | null
    unitPrice: string
    taxable: boolean
    description: string | null
  }>
  products: ProductRecord[]
}

export interface QuoteExample {
  id: string
  workType: string
  publicLines: KnowledgeSourceQuote['publicLines']
  items: KnowledgeSourceQuote['items']
  options: Array<{
    title: string
    selectedMin: number
    selectedMax: number
    items: KnowledgeSourceQuote['items']
  }>
  formulaSelections: KnowledgeSourceQuote['formulaSelections']
}

export interface ActiveKnowledge {
  id: string
  version: number
  styleGuide: string
  pricingGuide: string
}

type Tables = Database['public']['Tables']
type SourceRow = Pick<Tables['quotes']['Row'],
  'id' | 'work_type' | 'final_total' | 'jobber_save_mode'
  | 'interior_selected_min' | 'interior_selected_max'
  | 'exterior_selected_min' | 'exterior_selected_max' | 'roof_selected_min' | 'roof_selected_max'
> & {
  quote_items: Array<Pick<Tables['quote_items']['Row'],
    'area_name_snapshot' | 'area_scope_snapshot' | 'product_id' | 'product_name_snapshot'
    | 'quantity' | 'working_days' | 'labour_per_day' | 'position'
  >>
  jobber_quote_lines: Array<Pick<Tables['jobber_quote_lines']['Row'],
    'kind' | 'name' | 'description' | 'quantity' | 'unit_price' | 'linked_product_or_service_id' | 'position'
  >>
}

const SOURCE_SELECT = [
  'id', 'work_type', 'final_total', 'jobber_save_mode',
  'interior_selected_min', 'interior_selected_max', 'exterior_selected_min', 'exterior_selected_max',
  'roof_selected_min', 'roof_selected_max',
  'quote_items(area_name_snapshot, area_scope_snapshot, product_id, product_name_snapshot, quantity, working_days, labour_per_day, position)',
  'jobber_quote_lines(kind, name, description, quantity, unit_price, linked_product_or_service_id, position)',
].join(', ')

function mapSource(row: SourceRow): KnowledgeSourceQuote {
  const items = [...row.quote_items].sort((a, b) => a.position - b.position).map(item => ({
    areaName: item.area_name_snapshot,
    areaScope: item.area_scope_snapshot,
    productId: item.product_id,
    productName: item.product_name_snapshot,
    quantity: String(item.quantity),
    workingDays: String(item.working_days ?? '0'),
    labourPerDay: String(item.labour_per_day ?? '0'),
  }))
  const formulaSelections: KnowledgeSourceQuote['formulaSelections'] = {}
  for (const scope of ['interior', 'exterior', 'roof'] as const) {
    if (items.some(item => item.areaScope === scope)) {
      formulaSelections[scope] = { min: row[`${scope}_selected_min`], max: row[`${scope}_selected_max`] }
    }
  }
  return {
    id: row.id,
    workType: row.work_type ?? '',
    finalTotal: String(row.final_total),
    jobberSaveMode: row.jobber_save_mode ?? 'priced_line_items',
    formulaSelections,
    items,
    publicLines: [...row.jobber_quote_lines].sort((a, b) => a.position - b.position).map(line => ({
      kind: line.kind,
      name: line.name,
      description: line.description ?? '',
      quantity: String(line.quantity ?? '0'),
      unitPrice: String(line.unit_price ?? '0'),
      linkedProductServiceId: line.linked_product_or_service_id,
    })),
  }
}

export async function loadKnowledgeSource(supabase: SupabaseClient<Database>): Promise<{
  quotes: KnowledgeSourceQuote[]
  counts: { quotes: number; publicLines: number; items: number }
}> {
  const rows = await loadPages((from, to) => supabase.from('quotes').select(SOURCE_SELECT)
    .is('deleted_at', null).order('created_at', { ascending: false }).order('id', { ascending: true })
    .range(from, to))
  const quotes = (rows as unknown as SourceRow[]).map(mapSource)
  return {
    quotes,
    counts: {
      quotes: quotes.length,
      publicLines: quotes.reduce((count, quote) => count + quote.publicLines.length, 0),
      items: quotes.reduce((count, quote) => count + quote.items.length, 0),
    },
  }
}

async function loadPages<T>(fetchPage: (from: number, to: number) => PromiseLike<{
  data: T[] | null
  error: unknown
}>): Promise<T[]> {
  const rows: T[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

function decimalText(value: string | number): string {
  return typeof value === 'number' ? new Decimal(value).toFixed() : value
}

export async function loadDraftCatalog(supabase: SupabaseClient<Database>): Promise<DraftCatalog> {
  const [services, products] = await Promise.all([
    loadPages((from, to) => supabase.from('product_services')
      .select('id, name, category, unit_price, taxable, description')
      .eq('active', true).order('id', { ascending: true }).range(from, to)),
    loadPages((from, to) => supabase.from('products').select([
      'id', 'name', 'manufacturer', 'type', 'unit', 'market_price', 'actual_price', 'color_code', 'active',
      'category', 'product_line', 'base', 'sheen', 'volume_litres', 'price', 'rrp_price', 'product_code', 'source_url',
    ].join(', ')).eq('active', true).order('id', { ascending: true }).range(from, to)),
  ])
  return {
    productServices: services.map(row => ({
      id: row.id, name: row.name, category: row.category,
      unitPrice: decimalText(row.unit_price), taxable: row.taxable, description: row.description,
    })),
    products: (products as unknown as Tables['products']['Row'][]).map(row => normalizeRrpProduct({
      id: row.id, name: row.name, manufacturer: row.manufacturer, type: row.type, unit: row.unit,
      marketPrice: decimalText(row.market_price), actualPrice: decimalText(row.actual_price ?? row.market_price),
      colorCode: row.color_code, active: row.active, category: row.category, productLine: row.product_line,
      base: row.base, sheen: row.sheen,
      volumeLitres: row.volume_litres === null ? null : decimalText(row.volume_litres),
      price: row.price === null ? null : decimalText(row.price),
      rrpPrice: row.rrp_price === null ? null : decimalText(row.rrp_price),
      productCode: row.product_code, sourceUrl: row.source_url,
    })),
  }
}

export async function loadSimilarQuoteCandidates(
  supabase: SupabaseClient<Database>, limit = 200, excludeQuoteIds: string[] = [],
): Promise<SimilarQuoteCandidate[]> {
  let query = supabase.from('quotes').select([
    'id', 'work_type', 'customer_type:jobber_snapshot->>customerType', 'created_at',
    'quote_items(area_name_snapshot)', 'jobber_quote_lines(name, position)',
  ].join(', ')).is('deleted_at', null)
  if (excludeQuoteIds.length) query = query.not('id', 'in', `(${excludeQuoteIds.map(id => JSON.stringify(id)).join(',')})`)
  const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: true }).limit(limit)
  if (error) throw error
  type CandidateRow = Pick<Tables['quotes']['Row'], 'id' | 'work_type' | 'created_at'> & {
    customer_type: string | null
    quote_items: Array<{ area_name_snapshot: string | null }>
    jobber_quote_lines: Array<{ name: string; position: number }>
  }
  return ((data ?? []) as unknown as CandidateRow[]).map(row => ({
    id: row.id,
    workType: row.work_type ?? '',
    customerType: row.customer_type ?? '',
    areaKeys: [...new Set(row.quote_items.map(item => normalizeAreaKey(item.area_name_snapshot ?? '')).filter(Boolean))],
    lineNames: [...row.jobber_quote_lines].sort((a, b) => a.position - b.position).map(line => line.name),
    createdAt: row.created_at,
  }))
}

export async function loadQuoteExamples(supabase: SupabaseClient<Database>, ids: string[]): Promise<QuoteExample[]> {
  if (!ids.length) return []
  const select = `${SOURCE_SELECT}, quote_options(title, position, selected_min, selected_max, quote_option_items(area_name_snapshot, area_scope_snapshot, product_id, product_name_snapshot, quantity, working_days, labour_per_day, position))`
  const { data, error } = await supabase.from('quotes').select(select).is('deleted_at', null).in('id', ids)
  if (error) throw error
  type Row = SourceRow & {
    quote_options: Array<Pick<Tables['quote_options']['Row'], 'title' | 'position' | 'selected_min' | 'selected_max'> & {
      quote_option_items: SourceRow['quote_items']
    }>
  }
  return ((data ?? []) as unknown as Row[]).map(row => {
    const { id, workType, publicLines, items, formulaSelections } = mapSource(row)
    const options = [...row.quote_options].sort((a, b) => a.position - b.position).slice(0, 10).map(option => ({
      title: option.title, selectedMin: option.selected_min, selectedMax: option.selected_max,
      items: [...option.quote_option_items].sort((a, b) => a.position - b.position).slice(0, 30).map(item => ({
        areaName: item.area_name_snapshot, areaScope: item.area_scope_snapshot,
        productId: item.product_id, productName: item.product_name_snapshot, quantity: String(item.quantity),
        workingDays: String(item.working_days ?? '0'), labourPerDay: String(item.labour_per_day ?? '0'),
      })),
    }))
    return { id, workType, publicLines, items, options, formulaSelections }
  })
}

export async function loadActiveKnowledge(supabase: SupabaseClient<Database>): Promise<ActiveKnowledge | null> {
  const { data, error } = await supabase.from('ai_quote_knowledge')
    .select('id, version, style_guide, pricing_guide').eq('status', 'active').maybeSingle()
  if (error) throw error
  return data ? { id: data.id, version: data.version, styleGuide: data.style_guide, pricingGuide: data.pricing_guide } : null
}

export async function loadEvalCandidates(supabase: SupabaseClient<Database>): Promise<EvalCandidate[]> {
  const rows = await loadPages((from, to) => supabase.from('quotes').select([
    'id', 'created_at', 'final_total', 'quote_items(area_scope_snapshot)', 'jobber_quote_lines(kind, unit_price, client_visible)',
  ].join(', ')).is('deleted_at', null).order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to))
  type Row = Pick<Tables['quotes']['Row'], 'id' | 'created_at' | 'final_total'> & {
    quote_items: Array<Pick<Tables['quote_items']['Row'], 'area_scope_snapshot'>>
    jobber_quote_lines: Array<Pick<Tables['jobber_quote_lines']['Row'], 'kind' | 'unit_price' | 'client_visible'>>
  }
  return (rows as unknown as Row[]).map(row => ({
    id: row.id, createdAt: row.created_at, finalTotal: String(row.final_total), itemCount: row.quote_items.length,
    scopes: [...new Set(row.quote_items.flatMap(item => item.area_scope_snapshot ? [item.area_scope_snapshot] : []))],
    pricedLineCount: row.jobber_quote_lines.filter(line => line.client_visible !== false
      && line.kind === 'line_item' && new Decimal(line.unit_price ?? 0).gt(0)).length,
  }))
}

export interface EvalReference extends KnowledgeSourceQuote {
  areas: Array<{ scope: NonNullable<KnowledgeSourceQuote['items'][number]['areaScope']>; name: string }>
  areaNames: string[]
  productIds: string[]
  productNames: string[]
  totalWorkingDays: string
  publicLineCount: number
}

export async function loadEvalReference(supabase: SupabaseClient<Database>, quoteId: string): Promise<EvalReference | null> {
  const select = `working_days, labour_per_day, ${SOURCE_SELECT.replace('jobber_quote_lines(', 'jobber_quote_lines(client_visible, ')}`
  const { data, error } = await supabase.from('quotes').select(select)
    .is('deleted_at', null).eq('id', quoteId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as Omit<SourceRow, 'jobber_quote_lines'> & Pick<Tables['quotes']['Row'], 'working_days' | 'labour_per_day'> & {
    jobber_quote_lines: Array<SourceRow['jobber_quote_lines'][number] & { client_visible: boolean }>
  }
  const source = mapSource({ ...row, jobber_quote_lines: row.jobber_quote_lines.filter(line => line.client_visible !== false) })
  const labour = calculateDisplayLabourTotals(row.working_days, row.labour_per_day,
    row.quote_items.map(item => ({ workingDays: item.working_days, labourPerDay: item.labour_per_day })))
  const areas: EvalReference['areas'] = []
  const seen = new Set<string>()
  for (const item of source.items) {
    if (!item.areaScope || !item.areaName?.trim()) continue
    const key = `${item.areaScope}:${item.areaName.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    areas.push({ scope: item.areaScope, name: item.areaName })
  }
  return {
    ...source, areas, areaNames: areas.map(area => area.name),
    productIds: [...new Set(source.items.flatMap(item => item.productId ? [item.productId] : []))],
    productNames: [...new Set(source.items.map(item => item.productName).filter(Boolean))],
    totalWorkingDays: labour.workingDays.toFixed(),
    publicLineCount: source.publicLines.length,
  }
}

export type EvalCase = Tables['ai_quote_eval_cases']['Row'] & { leaks: string[] }

const EVAL_CASE_SELECT = [
  'id', 'set_label', 'quote_id', 'memo', 'memo_run_id', 'last_draft_run_id', 'last_metrics',
  'created_by', 'created_at', 'updated_at', 'memo_run:ai_quote_runs!ai_quote_eval_cases_memo_run_id_fkey(output)',
].join(', ')

function mapEvalCase(row: Tables['ai_quote_eval_cases']['Row'] & { memo_run: { output: unknown } | null }): EvalCase {
  const { memo_run: memoRun, ...record } = row
  const output = memoRun?.output
  const leaks = output && typeof output === 'object' && 'leaks' in output && Array.isArray(output.leaks)
    ? output.leaks.filter((value): value is string => typeof value === 'string') : []
  return { ...record, leaks }
}

export async function loadEvalCases(supabase: SupabaseClient<Database>, setLabel: string): Promise<EvalCase[]> {
  const rows = await loadPages((from, to) => supabase.from('ai_quote_eval_cases').select(EVAL_CASE_SELECT)
    .eq('set_label', setLabel).order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to))
  return (rows as unknown as Parameters<typeof mapEvalCase>[0][]).map(mapEvalCase)
}

export async function loadEvalCase(supabase: SupabaseClient<Database>, caseId: string): Promise<EvalCase | null> {
  const { data, error } = await supabase.from('ai_quote_eval_cases').select(EVAL_CASE_SELECT).eq('id', caseId).maybeSingle()
  if (error) throw error
  return data ? mapEvalCase(data as unknown as Parameters<typeof mapEvalCase>[0]) : null
}

export async function upsertEvalCase(supabase: SupabaseClient<Database>, input: {
  setLabel: string; quoteId: string; memo: string; memoRunId: string
}): Promise<string> {
  const { data, error } = await supabase.from('ai_quote_eval_cases').upsert({
    set_label: input.setLabel, quote_id: input.quoteId, memo: redactContactDetails(input.memo), memo_run_id: input.memoRunId,
    last_draft_run_id: null, last_metrics: null,
  }, { onConflict: 'set_label,quote_id' }).select('id').single()
  if (error) throw error
  return data.id
}

export async function saveEvalResult(supabase: SupabaseClient<Database>, caseId: string, input: {
  runId: string; metrics: AiDraftComparison
}): Promise<void> {
  const { error } = await supabase.from('ai_quote_eval_cases').update({
    last_draft_run_id: input.runId, last_metrics: { ...input.metrics },
  }).eq('id', caseId)
  if (error) throw error
}
