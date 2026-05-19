import { describe, expect, it, vi } from 'vitest'
import { syncJobberQuoteLineItems } from '@/lib/jobber/client'

describe('jobber quote write client', () => {
  it('edits tracked quote line items without deleting unrelated Jobber-only lines', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'quote-id',
            quoteNumber: '3535',
            title: null,
            createdAt: '2026-05-19T00:00:00Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/59439251',
            client: null,
            property: null,
            lineItems: {
              nodes: [
                {
                  id: 'old-line-1',
                  name: 'Walls',
                  category: 'SERVICE',
                  description: 'Old line',
                  quantity: 1,
                  unitPrice: 13,
                  totalPrice: 13,
                  linkedProductOrService: null,
                },
                {
                  id: 'jobber-only-line',
                  name: 'Added in Jobber',
                  category: 'SERVICE',
                  description: 'This line was not fetched into the app form',
                  quantity: 1,
                  unitPrice: 25,
                  totalPrice: 25,
                  linkedProductOrService: null,
                },
              ],
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'old-line-1' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateLineItems: { createdLineItems: [{ id: 'new-line-1' }], userErrors: [] } },
      }), { status: 200 }))

    const result = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'line_item',
          name: 'Walls updated',
          description: 'Updated wall scope',
          quantity: 2,
          unitPrice: 50,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'old-line-1',
        },
        {
          kind: 'line_item',
          name: 'New ceiling',
          description: 'New line from app',
          quantity: 1,
          unitPrice: 100,
          taxable: true,
          clientVisible: true,
        },
      ],
      finalTotal: '110.00',
      finalTotalIncludesGst: true,
    }, {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(result.editedLineItemIds).toEqual(['old-line-1'])
    expect(result.createdLineItemIds).toEqual(['new-line-1'])
    expect(result.deletedLineItemIds).toEqual([])

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies[1].query).toContain('quoteEditLineItems')
    expect(bodies[1].variables.lineItems).toEqual([
      {
        lineItemId: 'old-line-1',
        name: 'Walls updated',
        description: 'Updated wall scope',
        category: 'SERVICE',
        taxable: true,
        quantity: 2,
        unitPrice: 50,
        totalPrice: 100,
      },
    ])
    expect(bodies[2].query).toContain('quoteCreateLineItems')
    expect(bodies[2].variables.lineItems).toEqual([
      expect.objectContaining({
        name: 'New ceiling',
        quantity: 1,
        unitPrice: 100,
        taxable: true,
        saveToProductsAndServices: false,
      }),
    ])
    expect(bodies.some((body) => String(body.query).includes('quoteDeleteLineItems'))).toBe(false)
  })

  it('sends reordered tracked line items in one Jobber edit request with sort order', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'quote-id',
            quoteNumber: '3535',
            title: null,
            createdAt: '2026-05-19T00:00:00Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/59439251',
            client: null,
            property: null,
            lineItems: {
              nodes: [
                {
                  id: 'line-a',
                  name: 'First',
                  category: 'SERVICE',
                  description: '',
                  quantity: 1,
                  unitPrice: 10,
                  totalPrice: 10,
                  linkedProductOrService: null,
                },
                {
                  id: 'line-b',
                  name: 'Second',
                  category: 'SERVICE',
                  description: '',
                  quantity: 1,
                  unitPrice: 20,
                  totalPrice: 20,
                  linkedProductOrService: null,
                },
              ],
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'line-b' }, { id: 'line-a' }], userErrors: [] } },
      }), { status: 200 }))

    await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'line_item',
          name: 'Second now first',
          description: '',
          quantity: 1,
          unitPrice: 20,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'line-b',
          position: 0,
        },
        {
          kind: 'line_item',
          name: 'First now second',
          description: '',
          quantity: 1,
          unitPrice: 10,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'line-a',
          position: 1,
        },
      ],
      finalTotal: '0',
      finalTotalIncludesGst: true,
    }, {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies[1].query).toContain('quoteEditLineItems')
    expect(bodies[1].variables.lineItems).toEqual([
      expect.objectContaining({
        lineItemId: 'line-b',
        name: 'Second now first',
        sortOrder: 0,
      }),
      expect.objectContaining({
        lineItemId: 'line-a',
        name: 'First now second',
        sortOrder: 1,
      }),
    ])
  })

  it('relinks stale app line ids to the current Jobber session before reordering', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'quote-id',
            quoteNumber: '3535',
            title: null,
            createdAt: '2026-05-19T00:00:00Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/59439251',
            client: null,
            property: null,
            lineItems: {
              nodes: [
                {
                  id: 'current-a',
                  name: 'Walls',
                  category: 'SERVICE',
                  description: 'Wall scope',
                  quantity: 1,
                  unitPrice: 10,
                  totalPrice: 10,
                  linkedProductOrService: null,
                },
                {
                  id: 'current-b',
                  name: 'Ceiling',
                  category: 'SERVICE',
                  description: 'Ceiling scope',
                  quantity: 1,
                  unitPrice: 20,
                  totalPrice: 20,
                  linkedProductOrService: null,
                },
              ],
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'current-b' }, { id: 'current-a' }], userErrors: [] } },
      }), { status: 200 }))

    const result = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'line_item',
          name: 'Ceiling',
          description: 'Ceiling scope',
          quantity: 1,
          unitPrice: 20,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'stale-b',
          position: 0,
        },
        {
          kind: 'line_item',
          name: 'Walls',
          description: 'Wall scope',
          quantity: 1,
          unitPrice: 10,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'stale-a',
          position: 1,
        },
      ],
      finalTotal: '0',
      finalTotalIncludesGst: true,
    }, {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(result.createdLineItemIds).toEqual([])
    expect(result.editedLineItemIds).toEqual(['current-b', 'current-a'])
    expect(result.syncedLineItems).toEqual([
      { sourcePosition: 0, jobberLineItemId: 'current-b' },
      { sourcePosition: 1, jobberLineItemId: 'current-a' },
    ])

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies.some((body) => String(body.query).includes('quoteCreateLineItems'))).toBe(false)
    expect(bodies[1].variables.lineItems).toEqual([
      expect.objectContaining({ lineItemId: 'current-b', sortOrder: 0 }),
      expect.objectContaining({ lineItemId: 'current-a', sortOrder: 1 }),
    ])
  })

  it('deletes only line item ids explicitly removed from the app editor', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'quote-id',
            quoteNumber: '3535',
            title: null,
            createdAt: '2026-05-19T00:00:00Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/59439251',
            client: null,
            property: null,
            lineItems: {
              nodes: [
                {
                  id: 'removed-line',
                  name: 'Removed',
                  category: 'SERVICE',
                  description: 'Removed in app',
                  quantity: 1,
                  unitPrice: 10,
                  totalPrice: 10,
                  linkedProductOrService: null,
                },
                {
                  id: 'jobber-only-line',
                  name: 'Added in Jobber',
                  category: 'SERVICE',
                  description: 'Keep this',
                  quantity: 1,
                  unitPrice: 25,
                  totalPrice: 25,
                  linkedProductOrService: null,
                },
              ],
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteDeleteLineItems: { deletedLineItems: [{ id: 'removed-line' }], userErrors: [] } },
      }), { status: 200 }))

    const result = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [],
      finalTotal: '0',
      finalTotalIncludesGst: true,
      deletedJobberLineItemIds: ['removed-line', 'missing-line'],
    }, {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(result.deletedLineItemIds).toEqual(['removed-line'])

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies[1].query).toContain('quoteDeleteLineItems')
    expect(bodies[1].variables).toEqual({ quoteId: 'quote-id', lineItemIds: ['removed-line'] })
  })
})
