import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import {
  loadActiveKnowledge, loadDraftCatalog, loadKnowledgeSource,
  loadQuoteExamples, loadSimilarQuoteCandidates,
  loadEvalCandidates, loadEvalCases, loadEvalCase, loadEvalReference, upsertEvalCase, saveEvalResult,
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
    quote_options: [],
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
    expect(Object.keys(example).sort()).toEqual(['formulaSelections', 'id', 'items', 'options', 'publicLines', 'workType'])
    expect(example.options).toEqual([])
  })

  it('loads positioned example options and items without changing knowledge inputs', async () => {
    const source = { ...quote(), quote_options: [
      { title: 'Garage', position: 1, selected_min: 2, selected_max: 4, quote_option_items: [
        { ...quote().quote_items[0], area_name_snapshot: 'Garage', position: 1 },
        { ...quote().quote_items[1], position: 0 },
      ] },
      { title: 'Doors', position: 0, selected_min: 4, selected_max: 1, quote_option_items: [] },
    ] }
    const db = database({ quotes: { data: [source], error: null } })
    const [example] = await loadQuoteExamples(db.client, ['quote-1'])
    expect(example.options).toEqual([
      { title: 'Doors', selectedMin: 4, selectedMax: 1, items: [] },
      { title: 'Garage', selectedMin: 2, selectedMax: 4, items: [
        { areaName: null, areaScope: null, productId: null, productName: 'Custom', quantity: '1.00',
          workingDays: '0', labourPerDay: '0' },
        { areaName: 'Garage', areaScope: 'interior', productId: 'paint-1', productName: 'Wall paint', quantity: '2.00',
          workingDays: '1.50', labourPerDay: '2.00' },
      ] },
    ])
    expect(db.queries[0].chain.select.mock.calls[0][0]).toContain('quote_options(title, position, selected_min, selected_max, quote_option_items(')
    const result = await loadKnowledgeSource(db.client)
    expect(result.quotes[0]).not.toHaveProperty('options')
    expect(result.counts).toEqual({ quotes: 1, publicLines: 2, items: 2 })
    expect(db.queries[1].chain.select.mock.calls[0][0]).not.toContain('quote_options')
  })

  it('caps examples at ten options and thirty items after sorting by position', async () => {
    const source = { ...quote(), quote_options: Array.from({ length: 11 }, (_, i) => ({
      title: `Option ${10 - i}`, position: 10 - i, selected_min: 1, selected_max: 5,
      quote_option_items: Array.from({ length: 31 }, (_, j) => ({ ...quote().quote_items[0],
        product_name_snapshot: `Paint ${30 - j}`, position: 30 - j })),
    })) }
    const db = database({ quotes: { data: [source], error: null } })
    const [example] = await loadQuoteExamples(db.client, ['quote-1'])
    expect(example.options).toHaveLength(10)
    expect(example.options[0].title).toBe('Option 0')
    expect(example.options[9].title).toBe('Option 9')
    expect(example.options.every(option => option.items.length === 30)).toBe(true)
    expect(example.options[0].items[0].productName).toBe('Paint 0')
    expect(example.options[0].items[29].productName).toBe('Paint 29')
    expect(source.quote_options[0].title).toBe('Option 10')
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

describe('AI eval data', () => {
  function evalDatabase(response: Response) {
    const chain = { select: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(), single: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(), upsert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve) }
    const from = vi.fn().mockReturnValue(chain)
    return { client: { from } as unknown as SupabaseClient<Database>, from, chain }
  }

  it('loads candidate counts, distinct scopes and creation dates without customer identity columns', async () => {
    const db = evalDatabase({ data: [quote()], error: null })
    expect(await loadEvalCandidates(db.client)).toEqual([{ id: 'quote-1', createdAt: '2026-10-29T00:00:00Z',
      scopes: ['interior'], itemCount: 2, pricedLineCount: 1, finalTotal: '1100.00' }])
    expect(db.chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(db.chain.range).toHaveBeenCalledWith(0, 999)
    expect(db.chain.select.mock.calls[0][0]).not.toMatch(/customer|address|phone|email|jobber_snapshot|\*/i)
  })

  it('loads reference text and comparison values without selecting identity columns', async () => {
    const source = quote()
    source.quote_items[1].working_days = '0.25'
    const db = evalDatabase({ data: source, error: null })
    expect(await loadEvalReference(db.client, 'quote-1')).toMatchObject({ id: 'quote-1', workType: 'Interior',
      finalTotal: '1100.00', areaNames: ['Bedroom 1'], productIds: ['paint-1'],
      productNames: ['Custom', 'Wall paint'], totalWorkingDays: '1.75', publicLineCount: 2,
      areas: [{ scope: 'interior', name: 'Bedroom 1' }] })
    expect(db.chain.select.mock.calls[0][0]).not.toMatch(/customer|address|phone|email|jobber_snapshot|\*/i)
    expect(db.chain.eq).toHaveBeenCalledWith('id', 'quote-1')
    expect(db.chain.is).toHaveBeenCalledWith('deleted_at', null)
    const empty = evalDatabase({ data: null, error: null })
    expect(await loadEvalReference(empty.client, 'gone')).toBeNull()
  })

  it('loads cases by set label and exposes persisted memo leak flags', async () => {
    const db = evalDatabase({ data: [{ id: 'case-1', memo: 'Paint', memo_run: { output: { memo: 'Paint', leaks: ['product'] } } }], error: null })
    expect(await loadEvalCases(db.client, 'Launch')).toEqual([expect.objectContaining({ id: 'case-1', leaks: ['product'] })])
    expect(db.chain.eq).toHaveBeenCalledWith('set_label', 'Launch')
    const single = evalDatabase({ data: { id: 'case-1', quote_id: 'quote-1', memo: 'Paint' }, error: null })
    expect(await loadEvalCase(single.client, 'case-1')).toMatchObject({ id: 'case-1', quote_id: 'quote-1' })
    expect(single.chain.eq).toHaveBeenCalledWith('id', 'case-1')
  })

  it('uses legacy quote-level days when historical items have no row-level labour', async () => {
    const source = { ...quote(), working_days: '4.50', labour_per_day: '2.00',
      quote_items: quote().quote_items.map(item => ({ ...item, working_days: null, labour_per_day: null })) }
    const db = evalDatabase({ data: source, error: null })
    expect((await loadEvalReference(db.client, 'quote-1'))?.totalWorkingDays).toBe('4.5')
    expect(db.chain.select.mock.calls[0][0]).toContain('working_days')
  })

  it('never counts private Jobber lines as public or sends them to the memo source', async () => {
    const source = { ...quote(), jobber_quote_lines: quote().jobber_quote_lines.map(line => ({ ...line, client_visible: false })) }
    const candidates = evalDatabase({ data: [source], error: null })
    expect((await loadEvalCandidates(candidates.client))[0].pricedLineCount).toBe(0)
    const reference = evalDatabase({ data: source, error: null })
    expect(await loadEvalReference(reference.client, 'quote-1')).toMatchObject({ publicLines: [], publicLineCount: 0 })
  })

  it('upserts only eval cases and invalidates stale comparison results on memo regeneration', async () => {
    const db = evalDatabase({ data: { id: 'case-1' }, error: null })
    expect(await upsertEvalCase(db.client, { setLabel: 'Launch', quoteId: 'quote-1', memo: 'Call private@example.com', memoRunId: 'memo-run' })).toBe('case-1')
    expect(db.from).toHaveBeenCalledExactlyOnceWith('ai_quote_eval_cases')
    expect(db.chain.upsert).toHaveBeenCalledWith({ set_label: 'Launch', quote_id: 'quote-1', memo: 'Call [email]',
      memo_run_id: 'memo-run', last_draft_run_id: null, last_metrics: null }, { onConflict: 'set_label,quote_id' })
  })

  it('saves comparison results only on the case', async () => {
    const db = evalDatabase({ data: null, error: null })
    const metrics = { finalTotalDiffPct: '1.00', workingDaysDiffPct: '2.00', productMatchRate: '0.60',
      areaRecall: '1.00', areaPrecision: '1.00', publicLineCountDiff: -1 }
    await saveEvalResult(db.client, 'case-1', { runId: 'draft-run', metrics })
    expect(db.from).toHaveBeenCalledExactlyOnceWith('ai_quote_eval_cases')
    expect(db.chain.update).toHaveBeenCalledWith({ last_draft_run_id: 'draft-run', last_metrics: metrics })
    expect(db.chain.eq).toHaveBeenCalledWith('id', 'case-1')
  })

  it.each(['candidates', 'cases', 'case', 'reference', 'upsert', 'save'])('throws database errors for eval %s', async kind => {
    const error = { code: '42501' }
    const db = evalDatabase({ data: null, error })
    const metrics = { finalTotalDiffPct: '0.00', workingDaysDiffPct: '0.00', productMatchRate: '0.00',
      areaRecall: '0.00', areaPrecision: '0.00', publicLineCountDiff: 0 }
    const operation = { candidates: () => loadEvalCandidates(db.client), cases: () => loadEvalCases(db.client, 'set'),
      case: () => loadEvalCase(db.client, 'id'), reference: () => loadEvalReference(db.client, 'id'),
      upsert: () => upsertEvalCase(db.client, { setLabel: 'set', quoteId: 'id', memo: 'Paint', memoRunId: 'run' }),
      save: () => saveEvalResult(db.client, 'id', { runId: 'run', metrics }) }[kind]!
    await expect(operation()).rejects.toBe(error)
  })
})
