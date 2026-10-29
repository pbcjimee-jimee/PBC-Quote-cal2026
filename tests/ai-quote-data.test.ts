import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import {
  loadActiveKnowledge, loadDraftCatalog, loadKnowledgeSource,
  loadQuoteExamples, loadSimilarQuoteCandidates,
} from '@/lib/ai-quote/data'

type Response = { data: unknown; error: unknown }

function database(responses: Record<string, Response | Response[]>) {
  const queries: Array<{ table: string; chain: ReturnType<typeof chainFor> }> = []
  function chainFor(table: string) {
    const response = responses[table]
    const current = Array.isArray(response) ? response.shift() : response
    const chain = {
      select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(current).then(resolve),
    }
    return chain
  }
  const from = vi.fn((table: string) => {
    const chain = chainFor(table)
    queries.push({ table, chain })
    return chain
  })
  return { client: { from } as unknown as SupabaseClient<Database>, from, queries }
}

function quote() {
  return {
    id: 'quote-1', work_type: 'Interior', customer_type: 'Residential',
    final_total: '1100.00', jobber_save_mode: 'description_total',
    created_at: '2026-10-29T00:00:00Z',
    interior_selected_min: 2, interior_selected_max: 4,
    exterior_selected_min: 1, exterior_selected_max: 5,
    roof_selected_min: 3, roof_selected_max: 5,
    quote_items: [
      { area_name_snapshot: 'Bedroom 1', area_scope_snapshot: 'interior', product_id: 'paint-1',
        product_name_snapshot: 'Wall paint', quantity: '2.00', working_days: '1.50', labour_per_day: '2.00', position: 1 },
      { area_name_snapshot: null, area_scope_snapshot: null, product_id: null,
        product_name_snapshot: 'Custom', quantity: '1.00', working_days: null, labour_per_day: null, position: 0 },
    ],
    jobber_quote_lines: [
      { kind: 'line_item', name: 'Bedroom', description: 'Walls', quantity: '1.00',
        unit_price: '1000.00', linked_product_or_service_id: 'service-1', position: 1 },
      { kind: 'text', name: 'Notes', description: null, quantity: null,
        unit_price: null, linked_product_or_service_id: null, position: 0 },
    ],
  }
}

describe('AI quote data loaders', () => {
  it('maps knowledge rows and counts without inventing unused scope selections', async () => {
    const db = database({ quotes: { data: [quote()], error: null } })
    const result = await loadKnowledgeSource(db.client)
    expect(result.counts).toEqual({ quotes: 1, publicLines: 2, items: 2 })
    expect(result.quotes[0]).toMatchObject({
      id: 'quote-1', workType: 'Interior', finalTotal: '1100.00',
      jobberSaveMode: 'description_total', formulaSelections: { interior: { min: 2, max: 4 } },
    })
    expect(result.quotes[0].formulaSelections).toEqual({ interior: { min: 2, max: 4 } })
    expect(result.quotes[0].items[0]).toEqual({
      areaName: null, areaScope: null, productId: null, productName: 'Custom',
      quantity: '1.00', workingDays: '0', labourPerDay: '0',
    })
    expect(result.quotes[0].publicLines[0]).toEqual({
      kind: 'text', name: 'Notes', description: '', quantity: '0', unitPrice: '0', linkedProductServiceId: null,
    })
    expect(result.quotes[0].publicLines[1].linkedProductServiceId).toBe('service-1')
  })

  it('never selects customer identity or the full Jobber snapshot and excludes trashed quotes', async () => {
    const db = database({ quotes: { data: [], error: null } })
    await loadKnowledgeSource(db.client)
    await loadSimilarQuoteCandidates(db.client)
    await loadQuoteExamples(db.client, ['quote-1'])
    expect(db.queries).toHaveLength(3)
    for (const { chain } of db.queries) {
      const select = chain.select.mock.calls[0][0] as string
      expect(select).not.toMatch(/customer_name|customer_address|customer_phone|customer_email/)
      expect(select).not.toMatch(/(?:^|,)\s*jobber_snapshot\s*(?:,|$)/)
      expect(select).not.toContain('*')
      expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    }
    expect(db.queries[1].chain.select.mock.calls[0][0]).toContain('customer_type:jobber_snapshot->>customerType')
  })

  it('normalizes candidate area keys and excludes ids before applying the limit', async () => {
    const db = database({ quotes: { data: [quote(), { ...quote(), id: 'quote-2', customer_type: null }], error: null } })
    expect(await loadSimilarQuoteCandidates(db.client, 10, ['held-out'])).toEqual([
      { id: 'quote-1', workType: 'Interior', customerType: 'Residential', areaKeys: ['bedroom'],
        lineNames: ['Notes', 'Bedroom'], createdAt: '2026-10-29T00:00:00Z' },
      { id: 'quote-2', workType: 'Interior', customerType: '', areaKeys: ['bedroom'],
        lineNames: ['Notes', 'Bedroom'], createdAt: '2026-10-29T00:00:00Z' },
    ])
    const chain = db.queries[0].chain
    expect(chain.limit).toHaveBeenCalledWith(10)
    expect(chain.not).toHaveBeenCalledWith('id', 'in', '("held-out")')
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('uses the default candidate limit without an empty exclusion filter', async () => {
    const db = database({ quotes: { data: [], error: null } })
    expect(await loadSimilarQuoteCandidates(db.client)).toEqual([])
    expect(db.queries[0].chain.limit).toHaveBeenCalledWith(200)
    expect(db.queries[0].chain.not).not.toHaveBeenCalled()
  })

  it('loads examples by id using the same mapping and skips an empty id list', async () => {
    const db = database({ quotes: { data: [quote()], error: null } })
    expect(await loadQuoteExamples(db.client, [])).toEqual([])
    expect(db.from).not.toHaveBeenCalled()
    const [example] = await loadQuoteExamples(db.client, ['quote-1'])
    expect(db.queries[0].chain.in).toHaveBeenCalledWith('id', ['quote-1'])
    expect(example.formulaSelections).toEqual({ interior: { min: 2, max: 4 } })
    expect(Object.keys(example).sort()).toEqual(['formulaSelections', 'id', 'items', 'publicLines', 'workType'])
  })

  it('loads only active catalog rows and reuses RRP price normalization', async () => {
    const db = database({
      product_services: { data: [{ id: 'service-1', name: 'Paint walls', category: null,
        unit_price: '100.00', taxable: true, description: 'Two coats' }], error: null },
      products: { data: [{ id: 'paint-1', name: 'Paint', manufacturer: null, type: null, unit: 'tin',
        market_price: 100, actual_price: 80.5, color_code: null, active: true, category: 'paint',
        product_line: 'Wash', base: 'White', sheen: 'Matt', volume_litres: 10,
        price: 80.5, rrp_price: 120.25, product_code: null, source_url: null }], error: null },
    })
    const catalog = await loadDraftCatalog(db.client)
    expect(catalog.productServices).toEqual([{ id: 'service-1', name: 'Paint walls', category: null,
      unitPrice: '100.00', taxable: true, description: 'Two coats' }])
    expect(catalog.products[0]).toMatchObject({ id: 'paint-1', marketPrice: '120.25', actualPrice: '80.5',
      rrpPrice: '120.25', volumeLitres: '10', productLine: 'Wash' })
    for (const { chain } of db.queries) expect(chain.eq).toHaveBeenCalledWith('active', true)
  })

  it('returns null when no knowledge is active and maps active knowledge', async () => {
    const empty = database({ ai_quote_knowledge: { data: null, error: null } })
    expect(await loadActiveKnowledge(empty.client)).toBeNull()
    expect(empty.queries[0].chain.eq).toHaveBeenCalledWith('status', 'active')
    const active = database({ ai_quote_knowledge: { data: { id: 'knowledge-1', version: 2,
      style_guide: 'Style', pricing_guide: 'Pricing' }, error: null } })
    expect(await loadActiveKnowledge(active.client)).toEqual({
      id: 'knowledge-1', version: 2, styleGuide: 'Style', pricingGuide: 'Pricing',
    })
  })

  it('reads every active catalog page instead of truncating at the API row cap', async () => {
    const service = { id: 'service', name: 'Painting', category: null, unit_price: '10', taxable: true, description: null }
    const db = database({
      product_services: [{ data: Array.from({ length: 1000 }, () => service), error: null },
        { data: [{ ...service, id: 'last-service' }], error: null }],
      products: { data: [], error: null },
    })
    const result = await loadDraftCatalog(db.client)
    expect(result.productServices).toHaveLength(1001)
    expect(result.productServices[1000].id).toBe('last-service')
    const pages = db.queries.filter(query => query.table === 'product_services')
    expect(pages[0].chain.range).toHaveBeenCalledWith(0, 999)
    expect(pages[1].chain.range).toHaveBeenCalledWith(1000, 1999)
    for (const { chain } of pages) expect(chain.eq).toHaveBeenCalledWith('active', true)
  })

  it.each(['knowledge', 'candidates', 'examples', 'catalog', 'active'])('throws original database errors for %s', async kind => {
    const error = { code: '42501', message: 'denied' }
    const db = database(Object.fromEntries(['quotes', 'products', 'product_services', 'ai_quote_knowledge']
      .map(table => [table, { data: null, error }])))
    const operation = {
      knowledge: () => loadKnowledgeSource(db.client), candidates: () => loadSimilarQuoteCandidates(db.client),
      examples: () => loadQuoteExamples(db.client, ['quote-1']), catalog: () => loadDraftCatalog(db.client),
      active: () => loadActiveKnowledge(db.client),
    }[kind]!
    await expect(operation()).rejects.toBe(error)
  })
})
