import { describe, expect, it, vi } from 'vitest'
import {
  fetchDurableJobberQuoteLineItems,
  JobberLineKindMismatchError,
  JobberKnownLineMissingError,
  JobberDeleteAllLinesError,
  syncJobberQuoteLineItems,
} from '@/lib/jobber/client'
import type { JobberSyncMutationStep } from '@/lib/jobber/sync-types'

function line(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, name: 'Line', category: 'SERVICE', description: '', quantity: 1,
    unitPrice: 10, totalPrice: 10, taxable: true, textOnly: false,
    linkedProductOrService: null, ...overrides,
  }
}

function page(nodes: unknown[], hasNextPage = false, endCursor: string | null = null) {
  return new Response(JSON.stringify({
    data: { quote: { id: 'quote-id', lineItems: { nodes, pageInfo: { hasNextPage, endCursor } } } },
  }), { status: 200 })
}

function durableOptions(
  fetcher: (input: string, init: RequestInit) => Promise<Response>,
  events: string[] = [],
) {
  return {
    accessToken: 'token', graphqlVersion: '2025-04-16', fetcher,
    journal: {
      beforeMutation: vi.fn(async (step: JobberSyncMutationStep) => {
        events.push(`begin:${step.key}`)
      }),
      afterMutation: vi.fn(async (stepKey: string) => {
        events.push(`complete:${stepKey}`)
      }),
    },
  }
}

describe('durable Jobber quote transport', () => {
  const input = {
    saveMode: 'priced_line_items' as const, finalTotal: '10', finalTotalIncludesGst: true,
    lines: [{ kind: 'line_item' as const, name: 'Line', quantity: 1, unitPrice: 10, position: 0 }],
  }
  const created = () => new Response(JSON.stringify({ data: {
    quoteCreateLineItems: { createdLineItems: [{ id: 'created' }], userErrors: [] },
  } }))

  it('throws a typed delete-all error before starting a mutation', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([line('only-line')]))
    const options = durableOptions(fetcher)
    await expect(syncJobberQuoteLineItems('quote-id', { ...input, lines: [], deletedJobberLineItemIds: ['only-line'] }, options))
      .rejects.toBeInstanceOf(JobberDeleteAllLinesError)
    expect(options.journal.beforeMutation).not.toHaveBeenCalled()
  })

  it('refreshes the initial 401 read once and uses the refreshed token through mutation and readback', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(created())
      .mockResolvedValueOnce(page([line('created')]))
    const options = durableOptions(fetcher)
    const refreshAccessToken = vi.fn(async () => {
      expect(options.journal.beforeMutation).not.toHaveBeenCalled()
      return 'refreshed'
    })
    await expect(syncJobberQuoteLineItems('quote-id', input, { ...options, refreshAccessToken }))
      .resolves.toMatchObject({ createdLineItemIds: ['created'] })
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls.map(([, init]) => init.headers.Authorization))
      .toEqual(['Bearer token', 'Bearer refreshed', 'Bearer refreshed', 'Bearer refreshed'])
    expect(options.accessToken).toBe('token')
  })

  it('does not refresh a second unauthorized preflight read', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(null, { status: 401 }))
    const options = durableOptions(fetcher)
    const refreshAccessToken = vi.fn().mockResolvedValue('refreshed')
    await expect(syncJobberQuoteLineItems('quote-id', input, { ...options, refreshAccessToken })).rejects.toMatchObject({ status: 401 })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(options.journal.beforeMutation).not.toHaveBeenCalled()
  })

  it.each(['writing', 'readback'])('does not refresh or resend on a 401 during %s after mutation begins', async (phase) => {
    const fetcher = vi.fn().mockResolvedValueOnce(page([]))
    if (phase === 'readback') fetcher.mockResolvedValueOnce(created())
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }))
    const options = durableOptions(fetcher)
    const refreshAccessToken = vi.fn().mockResolvedValue('refreshed')
    await expect(syncJobberQuoteLineItems('quote-id', input, { ...options, refreshAccessToken })).rejects.toMatchObject({ status: 401 })
    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(options.journal.beforeMutation).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(phase === 'readback' ? 3 : 2)
  })

  it.each([undefined, 25])('adds a fresh timeout signal on every query attempt with override %s', async (requestTimeoutMs) => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    try {
      const fetcher = vi.fn()
        .mockResolvedValueOnce(new Response(null, { status: 429 }))
        .mockResolvedValueOnce(page([]))
      await fetchDurableJobberQuoteLineItems('quote-id', {
        ...durableOptions(fetcher), throttleRetryDelayMs: 0, requestTimeoutMs,
      })
      expect(timeout.mock.calls).toEqual([[requestTimeoutMs ?? 30_000], [requestTimeoutMs ?? 30_000]])
      const signals = fetcher.mock.calls.map(([, init]) => init.signal)
      expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true)
      expect(signals[0]).not.toBe(signals[1])
    } finally { timeout.mockRestore() }
  })

  it.each([undefined, 25])('uses the mutation timeout without retrying its 429, override %s', async (requestTimeoutMs) => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    try {
      const fetcher = vi.fn().mockResolvedValueOnce(page([])).mockResolvedValueOnce(new Response(null, { status: 429 }))
      await expect(syncJobberQuoteLineItems('quote-id', input, { ...durableOptions(fetcher), requestTimeoutMs }))
        .rejects.toMatchObject({ status: 429 })
      expect(timeout.mock.calls).toEqual([[requestTimeoutMs ?? 30_000], [requestTimeoutMs ?? 60_000]])
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally { timeout.mockRestore() }
  })

  it('reads every page before treating the quote line set as complete', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page([line('first')], true, 'next-page'))
      .mockResolvedValueOnce(page([line('second')]))

    const result = await fetchDurableJobberQuoteLineItems('quote-id', {
      accessToken: 'token', graphqlVersion: '2025-04-16', fetcher,
    })

    expect(result.map(({ id }) => id)).toEqual(['first', 'second'])
    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies.map(({ variables }) => variables.after)).toEqual([null, 'next-page'])
    expect(bodies[0].query).toContain('taxable')
  })

  it.each(['textOnly', 'taxable'] as const)(
    'rejects a durable read with missing %s before any mutation',
    async (field) => {
      const malformed = line('known')
      delete malformed[field]
      const fetcher = vi.fn().mockResolvedValue(page([malformed]))
      const options = durableOptions(fetcher)

      await expect(syncJobberQuoteLineItems('quote-id', {
        saveMode: 'priced_line_items',
        lines: [{ kind: 'line_item', name: 'Known', jobberLineItemId: 'known', position: 0 }],
        finalTotal: '10', finalTotalIncludesGst: true,
      }, options)).rejects.toThrow('Invalid Jobber quote line item')

      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(options.journal.beforeMutation).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['textOnly', 'false'],
    ['taxable', 1],
  ] as const)('rejects a durable read with malformed %s before any mutation', async (field, value) => {
    const fetcher = vi.fn().mockResolvedValue(page([line('known', { [field]: value })]))
    const options = durableOptions(fetcher)

    await expect(syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [{ kind: 'line_item', name: 'Known', jobberLineItemId: 'known', position: 0 }],
      finalTotal: '10', finalTotalIncludesGst: true,
    }, options)).rejects.toThrow('Invalid Jobber quote line item')

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(options.journal.beforeMutation).not.toHaveBeenCalled()
  })

  it('persists each create before sending it and its returned ID before the next create', async () => {
    const events: string[] = []
    let reads = 0
    let creates = 0
    const fetcher = vi.fn(async (_input: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { query: string }
      if (body.query.includes('query PbcDurableQuoteLineItems')) {
        reads += 1
        return reads === 1 ? page([]) : page([
          line('created-a', { name: 'A' }),
          line('created-b', { name: 'B', unitPrice: 20, totalPrice: 20 }),
        ])
      }
      if (body.query.includes('quoteEditLineItems')) {
        return new Response(JSON.stringify({
          data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'created-b' }, { id: 'created-a' }], userErrors: [] } },
        }), { status: 200 })
      }
      const mutationIndex = creates++
      events.push(`remote:create:${mutationIndex}`)
      return new Response(JSON.stringify({
        data: { quoteCreateLineItems: { createdLineItems: [{ id: mutationIndex === 0 ? 'created-a' : 'created-b' }], userErrors: [] } },
      }), { status: 200 })
    })

    await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        { kind: 'line_item', name: 'A', quantity: 1, unitPrice: 10, position: 0 },
        { kind: 'line_item', name: 'B', quantity: 1, unitPrice: 20, position: 1 },
      ],
      finalTotal: '30', finalTotalIncludesGst: true,
    }, durableOptions(fetcher, events))

    expect(events.slice(0, 6)).toEqual([
      'begin:create:0', 'remote:create:0', 'complete:create:0',
      'begin:create:1', 'remote:create:1', 'complete:create:1',
    ])
  })

  it.each([
    ['priced to text', line('known', { textOnly: false }), 'text'],
    ['text to priced', line('known', { textOnly: true, quantity: 1, unitPrice: 0, totalPrice: 0 }), 'line_item'],
  ] as const)('blocks every mutation for a known-ID %s mismatch', async (_name, remoteLine, desiredKind) => {
    const fetcher = vi.fn().mockResolvedValue(page([remoteLine]))
    const options = durableOptions(fetcher)
    await expect(syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        { kind: 'line_item', name: 'Valid create', quantity: 1, unitPrice: 1, position: 0 },
        { kind: desiredKind, name: 'Known', jobberLineItemId: 'known', position: 1 },
      ],
      finalTotal: '1', finalTotalIncludesGst: true,
    }, options)).rejects.toBeInstanceOf(JobberLineKindMismatchError)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(options.journal.beforeMutation).not.toHaveBeenCalled()
  })

  it('fails closed when a known ID is absent from a complete durable read', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([]))
    const options = durableOptions(fetcher)
    await expect(syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [{ kind: 'line_item', name: 'Known', jobberLineItemId: 'missing', position: 0 }],
      finalTotal: '0', finalTotalIncludesGst: true,
    }, options)).rejects.toBeInstanceOf(JobberKnownLineMissingError)
    expect(options.journal.beforeMutation).not.toHaveBeenCalled()
  })

  it.each([
    ['missing nodes', { data: { quote: { lineItems: { pageInfo: { hasNextPage: false, endCursor: null } } } } }],
    ['duplicate IDs', { data: { quote: { lineItems: { nodes: [line('dup'), line('dup')], pageInfo: { hasNextPage: false, endCursor: null } } } } }],
    ['non-finite numeric value', { data: { quote: { lineItems: { nodes: [line('bad', { unitPrice: 'Infinity' })], pageInfo: { hasNextPage: false, endCursor: null } } } } }],
  ])('rejects malformed durable reads: %s', async (_name, payload) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }))
    await expect(syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items', lines: [], finalTotal: '0', finalTotalIncludesGst: true,
    }, durableOptions(fetcher))).rejects.toThrow()
  })

  it.each([
    ['throttled', 429],
    ['unauthorized', 401],
  ])('does not retry a %s mutation and does not complete the uncertain step', async (_name, status) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: 'Rejected' }] }), { status }))
    const options = durableOptions(fetcher)
    await expect(syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [{ kind: 'line_item', name: 'A', quantity: 1, unitPrice: 10, position: 0 }],
      finalTotal: '10', finalTotalIncludesGst: true,
    }, options)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(options.journal.beforeMutation).toHaveBeenCalledTimes(1)
    expect(options.journal.afterMutation).not.toHaveBeenCalled()
  })

  it('rejects an ambiguous create response without completing the step', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateLineItems: { createdLineItems: [], userErrors: [] } },
      }), { status: 200 }))
    const options = durableOptions(fetcher)
    await expect(syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [{ kind: 'line_item', name: 'A', quantity: 1, unitPrice: 10, position: 0 }],
      finalTotal: '10', finalTotalIncludesGst: true,
    }, options)).rejects.toThrow('exactly one')
    expect(options.journal.afterMutation).not.toHaveBeenCalled()
  })

  it('treats GraphQL errors with partial create data as uncertain', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateLineItems: { createdLineItems: [{ id: 'maybe-created' }], userErrors: [] } },
        errors: [{ message: 'Throttled' }],
      }), { status: 200 }))
    const options = durableOptions(fetcher)
    await expect(syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [{ kind: 'line_item', name: 'A', quantity: 1, unitPrice: 10, position: 0 }],
      finalTotal: '10', finalTotalIncludesGst: true,
    }, options)).rejects.toThrow('GraphQL error')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(options.journal.afterMutation).not.toHaveBeenCalled()
  })

  it('rejects malformed extra IDs in a one-item create response', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateLineItems: { createdLineItems: [{ id: 'created' }, {}], userErrors: [] } },
      }), { status: 200 }))
    const options = durableOptions(fetcher)
    await expect(syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [{ kind: 'line_item', name: 'A', quantity: 1, unitPrice: 10, position: 0 }],
      finalTotal: '10', finalTotalIncludesGst: true,
    }, options)).rejects.toThrow('Invalid Jobber mutation line item ID')
    expect(options.journal.afterMutation).not.toHaveBeenCalled()
  })

  it('rejects a create response that reuses an existing remote ID before completing the step', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page([line('existing', { name: 'Other' })]))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateLineItems: { createdLineItems: [{ id: 'existing' }], userErrors: [] } },
      }), { status: 200 }))
    const options = durableOptions(fetcher)
    await expect(syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [{ kind: 'line_item', name: 'New', quantity: 1, unitPrice: 10, position: 0 }],
      finalTotal: '10', finalTotalIncludesGst: true,
    }, options)).rejects.toThrow('new unique ID')
    expect(options.journal.afterMutation).not.toHaveBeenCalled()
  })

  it('reuses the confirmed Total ID across durable description-total versions without fingerprint matching', async () => {
    const confirmed = line('confirmed-total-id', {
      name: 'Total', unitPrice: 100, totalPrice: 100,
    })
    const decoy = line('decoy-total-id', {
      name: 'Total', unitPrice: 100, totalPrice: 100,
    })
    const updated = line('confirmed-total-id', {
      name: 'Total', unitPrice: 200, totalPrice: 200,
    })
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateLineItems: { createdLineItems: [{ id: 'confirmed-total-id' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(page([confirmed]))
      .mockResolvedValueOnce(page([decoy, confirmed]))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'confirmed-total-id' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(page([decoy, updated]))

    const first = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'description_total', lines: [],
      finalTotal: '110', finalTotalIncludesGst: true,
    }, durableOptions(fetcher))
    const second = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'description_total', lines: [],
      finalTotal: '220', finalTotalIncludesGst: true,
      totalLineItemId: 'confirmed-total-id',
    }, durableOptions(fetcher))

    expect(first.createdLineItemIds).toEqual(['confirmed-total-id'])
    expect(second.createdLineItemIds).toEqual([])
    expect(second.editedLineItemIds).toEqual(['confirmed-total-id'])
    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    const creates = bodies.filter(({ query }) => query.includes('quoteCreateLineItems'))
    const edits = bodies.filter(({ query }) => query.includes('quoteEditLineItems'))
    expect(creates).toHaveLength(1)
    expect(edits).toHaveLength(1)
    expect(edits[0].variables.lineItems).toEqual([expect.objectContaining({
      lineItemId: 'confirmed-total-id', name: 'Total', unitPrice: 200,
    })])
  })
})
