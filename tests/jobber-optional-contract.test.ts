import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { buildJobberQuoteLineMutationItems } from '@/lib/jobber/quote-line-payload'
import { jobberReadMatchesCompletion } from '@/lib/jobber/sync-reconciliation'
import { parseJobberSyncOperation } from '@/lib/jobber/sync-store'
import { fetchDurableJobberQuoteLineItems, fetchJobberQuote, syncJobberQuoteLineItems } from '@/lib/jobber/client'
import { mapJobberQuoteToDraft } from '@/lib/jobber/mapper'

const input = {
  saveMode: 'priced_line_items' as const, finalTotal: '100', finalTotalIncludesGst: false,
  lines: [{ kind: 'line_item' as const, name: 'Aqua', description: '', position: 0,
    quantity: 1, unitPrice: '-150', paintComparisonKey: 'comparison',
    optionalWritePolicy: 'set_true' as const, recommendedWritePolicy: 'set_false' as const }],
}
const remote = {
  id: 'known', name: 'Aqua', description: '', category: 'SERVICE', quantity: 1,
  unitPrice: -150, totalPrice: -150, taxable: true, textOnly: false,
  optional: true, recommended: false, selected: false, linkedProductOrService: null,
}

const configuredQuoteLineItemFields = new Set([
  'category', 'createdAt', 'description', 'id', 'linkedProductOrService', 'markup', 'name',
  'optional', 'quantity', 'recommended', 'sortOrder', 'taxable', 'textOnly', 'totalCost',
  'totalPrice', 'unitCost', 'unitPrice', 'updatedAt',
])

function quotePayload(lineItems: unknown[]) {
  return { data: { quote: { id: 'quote', quoteNumber: '1', createdAt: '', title: '', message: '',
    jobberWebUri: '', client: null, property: null,
    lineItems: { nodes: lineItems, pageInfo: { hasNextPage: false, endCursor: null } },
  } } }
}

describe('Jobber Optional write contract', () => {
  it.each(['full', 'lightweight', 'legacy lines', 'durable lines'] as const)(
    'uses only configured QuoteLineItem schema fields in the %s query', async (mode) => {
    let query = ''
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      query = JSON.parse(String(init.body)).query
      return new Response(JSON.stringify(quotePayload([])))
    })
    const options = { accessToken: 'test', graphqlVersion: '2025-04-16', fetcher }
    if (mode === 'durable lines') await fetchDurableJobberQuoteLineItems('quote', options)
    else if (mode === 'legacy lines') await syncJobberQuoteLineItems('quote', { ...input, lines: [] }, options)
    else await fetchJobberQuote('quote', { ...options, preferFullQuoteQuery: mode === 'full' })

    const lineSelection = query.match(/lineItems\([^)]*\)\s*{\s*nodes\s*{([\s\S]*?)linkedProductOrService/)
    expect(lineSelection).not.toBeNull()
    const fields = lineSelection![1].match(/\b\w+\b/g) ?? []
    expect(fields.filter(field => !configuredQuoteLineItemFields.has(field))).toEqual([])
    expect(fields).toEqual(expect.arrayContaining(['optional', 'recommended', 'textOnly']))
    expect(query).not.toMatch(/\b(?:selected|isOptional|isRecommended|isSelected)\b/)
  })

  it.each(['full', 'lightweight', 'durable lines'] as const)(
    'preserves missing customer selection as null in the %s response', async (mode) => {
      const { selected, ...unobservedSelection } = remote
      void selected
      const fetcher = vi.fn(async () => new Response(JSON.stringify(quotePayload([unobservedSelection]))))
      const options = { accessToken: 'test', graphqlVersion: '2025-04-16', fetcher }
      if (mode === 'durable lines') {
        const lines = await fetchDurableJobberQuoteLineItems('quote', options)
        expect(lines[0]).toMatchObject({ optional: true, recommended: false, selected: null })
      } else {
        const quote = await fetchJobberQuote('quote', { ...options, preferFullQuoteQuery: mode === 'full' })
        expect(mapJobberQuoteToDraft(quote).productsAndServices[0])
          .toMatchObject({ optional: true, recommended: false, selected: null })
      }
    },
  )

  it('leaves missing Optional and recommendation observations unknown alongside null selection', async () => {
    const { optional, recommended, selected, ...legacy } = remote
    void optional; void recommended; void selected
    const fetcher = vi.fn(async () => new Response(JSON.stringify(quotePayload([legacy]))))
    const lines = await fetchDurableJobberQuoteLineItems('quote', {
      accessToken: 'test', graphqlVersion: '2025-04-16', fetcher,
    })
    expect(lines[0].selected).toBeNull()
    expect(lines[0].optional).toBeUndefined()
    expect(lines[0].recommended).toBeUndefined()
  })
  it.each(['400', '-150'])('creates a signed %s Optional with explicit recommendation defaults', (price) => {
    const items = buildJobberQuoteLineMutationItems({ ...input, lines: [{ ...input.lines[0], unitPrice: price }] })
    expect(items[0]).toMatchObject({ unitPrice: Number(price), optional: true, recommended: false })
    expect(items[0]).not.toHaveProperty('selected')
    expect(items[0]).not.toHaveProperty('paintComparisonKey')
  })

  it('enforces Optional on an existing comparison and preserves the remote recommendation', () => {
    const items = buildJobberQuoteLineMutationItems({ ...input, lines: [{ ...input.lines[0],
      jobberLineItemId: 'known', recommended: true, recommendedWritePolicy: 'preserve',
    }] })
    expect(items[0]).toHaveProperty('optional', true)
    expect(items[0]).not.toHaveProperty('recommended')
  })

  it('preserves legacy missing flags and unchanged description-total conversion', () => {
    const legacy = { kind: 'line_item' as const, name: 'Legacy', optional: true, selected: true }
    expect(buildJobberQuoteLineMutationItems({ ...input, lines: [legacy] })[0]).not.toHaveProperty('optional')
    for (const line of buildJobberQuoteLineMutationItems({ ...input, saveMode: 'description_total' })) {
      expect(line).not.toHaveProperty('optional')
      expect(line).not.toHaveProperty('recommended')
    }
  })

  it('uses explicit false defaults on new normal public lines without trusting observations', () => {
    const item = buildJobberQuoteLineMutationItems({ ...input, lines: [{ kind: 'line_item', name: 'Normal',
      optional: true, recommended: true, optionalWritePolicy: 'preserve', recommendedWritePolicy: 'preserve' }] })[0]
    expect(item).toMatchObject({ optional: false, recommended: false })
  })

  it('compares requested flags, ignores selected and leaves missing legacy flags unconstrained', () => {
    const expected = { kind: 'line_item' as const, name: 'Aqua', description: '', quantity: 1,
      unitPrice: -150, totalPrice: -150, taxable: true, jobberLineItemId: 'known', optional: true, recommended: false }
    const completion = { syncedLineItems: [], expectedLineItems: [expected], deletedLineItemIds: [] }
    expect(jobberReadMatchesCompletion([{ ...remote, optional: false }], completion)).toBe(false)
    expect(jobberReadMatchesCompletion([{ ...remote, recommended: true }], completion)).toBe(false)
    expect(jobberReadMatchesCompletion([{ ...remote, selected: true }], completion)).toBe(true)
    const { optional, recommended, ...legacy } = expected
    void optional; void recommended
    expect(jobberReadMatchesCompletion([{ ...remote, optional: false }], { ...completion, expectedLineItems: [legacy] })).toBe(true)
  })

  it('parses policies and nullable observations without injecting them into legacy operations', () => {
    const operation = { id: '00000000-0000-4000-8000-000000000701', quote_id: '00000000-0000-4000-8000-000000000101',
      quote_version: 1, jobber_quote_id: 'remote', desired_payload: input, status: 'queued',
      lease_expires_at: null, attempt_count: 0, failure_code: null, result: null, steps: [] }
    expect(parseJobberSyncOperation(operation).desired_payload.lines[0]).toMatchObject({ optionalWritePolicy: 'set_true' })
    const legacy = parseJobberSyncOperation({ ...operation, desired_payload: { ...input, lines: [{ kind: 'line_item', name: 'Legacy' }] } })
    expect(legacy.desired_payload.lines[0]).not.toHaveProperty('optionalWritePolicy')
  })

  it('sends signed Optional attributes, journals only requested flags and omits selected', async () => {
    const sent: Array<Record<string, unknown>> = []
    let reads = 0
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { query: string; variables: { lineItems: Array<Record<string, unknown>> } }
      if (body.query.includes('query PbcDurableQuoteLineItems')) {
        reads++
        return new Response(JSON.stringify({ data: { quote: { lineItems: {
          nodes: reads === 1 ? [] : [remote], pageInfo: { hasNextPage: false, endCursor: null },
        } } } }))
      }
      sent.push(...body.variables.lineItems)
      return new Response(JSON.stringify({ data: { quoteCreateLineItems: { createdLineItems: [{ id: 'known' }], userErrors: [] } } }))
    })
    const result = await syncJobberQuoteLineItems('quote', input, { accessToken: 'test', graphqlVersion: '2025-04-16', fetcher,
      journal: { beforeMutation: vi.fn(), afterMutation: vi.fn() } })
    expect(sent).toEqual([expect.objectContaining({ optional: true, recommended: false, unitPrice: -150 })])
    expect(sent[0]).not.toHaveProperty('selected')
    expect(result.expectedLineItems[0]).toMatchObject({ optional: true, recommended: false, jobberLineItemId: 'known' })
  })

  it('re-syncs the known comparison without creating or overwriting recommendation and selection', async () => {
    const sent: Array<Record<string, unknown>> = []
    const queries: string[] = []
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { query: string; variables: { lineItems: Array<Record<string, unknown>> } }
      queries.push(body.query)
      if (body.query.includes('query PbcDurableQuoteLineItems')) {
        return new Response(JSON.stringify({ data: { quote: { lineItems: {
          nodes: [{ ...remote, recommended: true, selected: true }], pageInfo: { hasNextPage: false, endCursor: null },
        } } } }))
      }
      sent.push(...body.variables.lineItems)
      return new Response(JSON.stringify({ data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'known' }], userErrors: [] } } }))
    })
    const result = await syncJobberQuoteLineItems('quote', { ...input, lines: [{ ...input.lines[0], jobberLineItemId: 'known', recommendedWritePolicy: 'preserve' }] },
      { accessToken: 'test', graphqlVersion: '2025-04-16', fetcher, journal: { beforeMutation: vi.fn(), afterMutation: vi.fn() } })
    expect(result.createdLineItemIds).toEqual([])
    expect(queries.some(query => query.includes('mutation PbcQuoteCreate'))).toBe(false)
    expect(sent[0]).toMatchObject({ lineItemId: 'known', optional: true, unitPrice: -150 })
    expect(sent[0]).not.toHaveProperty('recommended')
    expect(sent[0]).not.toHaveProperty('selected')
    expect(result.expectedLineItems[0]).not.toHaveProperty('recommended')
  })

  it('blocks malformed Optional observations before the first mutation', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ data: { quote: { lineItems: {
      nodes: [{ ...remote, optional: 'true' }], pageInfo: { hasNextPage: false, endCursor: null },
    } } } })))
    const beforeMutation = vi.fn()
    await expect(syncJobberQuoteLineItems('quote', { ...input, lines: [{ ...input.lines[0], jobberLineItemId: 'known' }] },
      { accessToken: 'test', graphqlVersion: '2025-04-16', fetcher, journal: { beforeMutation, afterMutation: vi.fn() } }))
      .rejects.toThrow('Invalid Jobber quote line item')
    expect(beforeMutation).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
