import 'server-only'

import Decimal from 'decimal.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeAreaKey, type KnowledgeSourceQuote } from '@/lib/ai-quote/knowledge-stats'
import type { SimilarQuoteCandidate } from '@/lib/ai-quote/similar-quotes'
import { normalizeRrpProduct, type ProductRecord } from '@/lib/products/types'
import type { Database } from '@/lib/supabase/types'

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
  const { data, error } = await supabase.from('quotes').select(SOURCE_SELECT).is('deleted_at', null).in('id', ids)
  if (error) throw error
  return ((data ?? []) as unknown as SourceRow[]).map(row => {
    const { id, workType, publicLines, items, formulaSelections } = mapSource(row)
    return { id, workType, publicLines, items, formulaSelections }
  })
}

export async function loadActiveKnowledge(supabase: SupabaseClient<Database>): Promise<ActiveKnowledge | null> {
  const { data, error } = await supabase.from('ai_quote_knowledge')
    .select('id, version, style_guide, pricing_guide').eq('status', 'active').maybeSingle()
  if (error) throw error
  return data ? { id: data.id, version: data.version, styleGuide: data.style_guide, pricingGuide: data.pricing_guide } : null
}
