import { describe, expect, it, vi } from 'vitest'
import { JobberLineSyncPartialError, syncJobberQuoteLineItems } from '@/lib/jobber/client'

describe('jobber quote write client', () => {
  it('loads only current Jobber line items before writing to avoid heavy quote fetch throttling', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'quote-id',
            lineItems: {
              nodes: [
                {
                  id: 'existing-line',
                  name: 'Walls',
                  category: 'SERVICE',
                  description: 'Old wall line',
                  quantity: 1,
                  unitPrice: 100,
                  totalPrice: 100,
                  linkedProductOrService: null,
                },
              ],
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'existing-line' }], userErrors: [] } },
      }), { status: 200 }))

    await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'line_item',
          name: 'Walls',
          description: 'Updated wall line',
          quantity: 1,
          unitPrice: 125,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'existing-line',
        },
      ],
      finalTotal: '125.00',
      finalTotalIncludesGst: true,
    }, {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies[0].query).toContain('query PbcQuoteLineItems')
    expect(bodies[0].query).toContain('lineItems(first: 100)')
    expect(bodies[0].query).not.toContain('customFields')
    expect(bodies[0].query).not.toContain('tags(first: 20)')
    expect(bodies[0].query).not.toContain('client {')
    expect(bodies[0].query).not.toContain('property {')
  })

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
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quoteEditLineItems: {
            modifiedLineItems: [{ id: 'old-line-1' }, { id: 'new-line-1' }],
            userErrors: [],
          },
        },
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
        sortOrder: 0,
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
    expect(bodies[2].variables.lineItems[0]).not.toHaveProperty('sortOrder')
    expect(bodies[3].query).toContain('quoteEditLineItems')
    expect(bodies[3].variables.lineItems).toEqual([
      expect.objectContaining({ lineItemId: 'old-line-1', name: 'Walls updated', sortOrder: 0 }),
      expect.objectContaining({ lineItemId: 'new-line-1', name: 'New ceiling', sortOrder: 1 }),
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

  it('creates priced line items without sort order and reorders after creation when inserted before tracked lines', async () => {
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
                  id: 'existing-line',
                  name: 'Ceiling',
                  category: 'SERVICE',
                  description: 'Existing ceiling scope',
                  quantity: 1,
                  unitPrice: 13,
                  totalPrice: 13,
                  linkedProductOrService: null,
                },
              ],
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'existing-line' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateLineItems: { createdLineItems: [{ id: 'created-priced-line' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quoteEditLineItems: {
            modifiedLineItems: [{ id: 'created-priced-line' }, { id: 'existing-line' }],
            userErrors: [],
          },
        },
      }), { status: 200 }))

    const result = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'line_item',
          name: 'Walls',
          description: 'New wall scope',
          quantity: 1,
          unitPrice: 1200,
          taxable: true,
          clientVisible: true,
          position: 0,
        },
        {
          kind: 'line_item',
          name: 'Ceiling',
          description: 'Existing ceiling scope',
          quantity: 1,
          unitPrice: 13,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'existing-line',
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

    expect(result.createdLineItemIds).toEqual(['created-priced-line'])
    expect(result.syncedLineItems).toEqual([
      { sourcePosition: 1, jobberLineItemId: 'existing-line' },
      { sourcePosition: 0, jobberLineItemId: 'created-priced-line' },
    ])

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies[2].query).toContain('quoteCreateLineItems')
    expect(bodies[2].variables.lineItems).toEqual([
      {
        name: 'Walls',
        description: 'New wall scope',
        category: 'SERVICE',
        taxable: true,
        saveToProductsAndServices: false,
        quantity: 1,
        unitPrice: 1200,
        totalPrice: 1200,
      },
    ])
    expect(bodies[3].query).toContain('quoteEditLineItems')
    expect(bodies[3].variables.lineItems).toEqual([
      expect.objectContaining({ lineItemId: 'created-priced-line', name: 'Walls', unitPrice: 1200, sortOrder: 0 }),
      expect.objectContaining({ lineItemId: 'existing-line', name: 'Ceiling', unitPrice: 13, sortOrder: 1 }),
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

  it('relinks zero-priced Jobber line items as priced rows when Jobber says they are not text-only', async () => {
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
                  id: 'fresh-total',
                  name: 'Total',
                  category: 'SERVICE',
                  description: 'Final quote total',
                  quantity: 1,
                  unitPrice: 0,
                  totalPrice: 0,
                  textOnly: false,
                  linkedProductOrService: null,
                },
              ],
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'fresh-total' }], userErrors: [] } },
      }), { status: 200 }))

    const result = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'line_item',
          name: 'Total',
          description: 'Final quote total',
          quantity: 1,
          unitPrice: 5000,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'stale-total',
          position: 0,
        },
      ],
      finalTotal: '5000',
      finalTotalIncludesGst: true,
    }, {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(result.createdLineItemIds).toEqual([])
    expect(result.editedLineItemIds).toEqual(['fresh-total'])
    expect(result.syncedLineItems).toEqual([
      { sourcePosition: 0, jobberLineItemId: 'fresh-total' },
    ])

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies.some((body) => String(body.query).includes('quoteCreateLineItems'))).toBe(false)
    expect(bodies[1].query).toContain('quoteEditLineItems')
    expect(bodies[1].variables.lineItems).toEqual([
      expect.objectContaining({
        lineItemId: 'fresh-total',
        name: 'Total',
        quantity: 1,
        unitPrice: 5000,
        totalPrice: 5000,
        sortOrder: 0,
      }),
    ])
  })

  it('relinks stale text and priced ids from a refreshed Jobber session before updating mixed lines', async () => {
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
                  id: 'fresh-text',
                  name: 'Dulux Accredited Painting Company',
                  category: 'SERVICE',
                  description: 'Old accreditation paragraph',
                  quantity: 1,
                  unitPrice: 0,
                  totalPrice: 0,
                  textOnly: true,
                  linkedProductOrService: null,
                },
                {
                  id: 'fresh-priced',
                  name: 'Ceiling',
                  category: 'SERVICE',
                  description: 'Ceiling scope',
                  quantity: 1,
                  unitPrice: 14.5,
                  totalPrice: 14.5,
                  linkedProductOrService: null,
                },
              ],
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'fresh-priced' }, { id: 'fresh-text' }], userErrors: [] } },
      }), { status: 200 }))

    const result = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'line_item',
          name: 'Ceiling',
          description: 'Ceiling scope',
          quantity: 1,
          unitPrice: 14.5,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'stale-priced',
          position: 0,
        },
        {
          kind: 'text',
          name: 'Dulux Accredited Painting Company',
          description: 'Updated accreditation paragraph',
          quantity: 1,
          unitPrice: 0,
          taxable: false,
          clientVisible: true,
          jobberLineItemId: 'stale-text',
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
    expect(result.editedLineItemIds).toEqual(['fresh-priced', 'fresh-text'])
    expect(result.syncedLineItems).toEqual([
      { sourcePosition: 0, jobberLineItemId: 'fresh-priced' },
      { sourcePosition: 1, jobberLineItemId: 'fresh-text' },
    ])

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies.some((body) => String(body.query).includes('quoteCreateLineItems'))).toBe(false)
    expect(bodies.some((body) => String(body.query).includes('quoteCreateTextLineItems'))).toBe(false)
    expect(bodies[1].variables.lineItems).toEqual([
      expect.objectContaining({ lineItemId: 'fresh-priced', name: 'Ceiling', sortOrder: 0 }),
      expect.objectContaining({ lineItemId: 'fresh-text', name: 'Dulux Accredited Painting Company', sortOrder: 1 }),
    ])
  })

  it('creates text line items without sort order because Jobber rejects sortOrder on text create attributes', async () => {
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
            lineItems: { nodes: [] },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateTextLineItems: { createdLineItems: [{ id: 'created-text-line' }], userErrors: [] } },
      }), { status: 200 }))

    const result = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'text',
          name: 'Door & Window Trim',
          description: 'All exterior door & window frames',
          clientVisible: true,
          position: 2,
        },
      ],
      finalTotal: '0',
      finalTotalIncludesGst: true,
    }, {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(result.createdLineItemIds).toEqual(['created-text-line'])
    expect(result.syncedLineItems).toEqual([
      { sourcePosition: 2, jobberLineItemId: 'created-text-line' },
    ])

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies[1].query).toContain('quoteCreateTextLineItems')
    expect(bodies[1].variables.lineItems).toEqual([
      {
        name: 'Door & Window Trim',
        description: 'All exterior door & window frames',
        category: 'SERVICE',
      },
    ])
  })

  it('creates priced line items without sort order because Jobber rejects sortOrder on line item create attributes', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'quote-id',
            quoteNumber: '4192',
            title: null,
            createdAt: '2026-05-20T00:00:00Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/59441915',
            client: null,
            property: null,
            lineItems: { nodes: [] },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateLineItems: { createdLineItems: [{ id: 'created-total-line' }], userErrors: [] } },
      }), { status: 200 }))

    const result = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'line_item',
          name: 'Total',
          description: '',
          quantity: 1,
          unitPrice: 410.18,
          taxable: true,
          clientVisible: true,
          position: 7,
        },
      ],
      finalTotal: '451.20',
      finalTotalIncludesGst: true,
    }, {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(result.createdLineItemIds).toEqual(['created-total-line'])
    expect(result.syncedLineItems).toEqual([
      { sourcePosition: 7, jobberLineItemId: 'created-total-line' },
    ])

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies[1].query).toContain('quoteCreateLineItems')
    expect(bodies[1].variables.lineItems).toEqual([
      expect.not.objectContaining({ sortOrder: expect.any(Number) }),
    ])
    expect(bodies[1].variables.lineItems[0]).toEqual(expect.objectContaining({
      name: 'Total',
      quantity: 1,
      unitPrice: 410.18,
      totalPrice: 410.18,
      taxable: true,
      saveToProductsAndServices: false,
    }))
  })

  it('applies final Jobber sort order after creating a text line item', async () => {
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
                  id: 'existing-line',
                  name: 'Walls',
                  category: 'SERVICE',
                  description: 'Existing wall scope',
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
        data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'existing-line' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateTextLineItems: { createdLineItems: [{ id: 'created-text-line' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quoteEditLineItems: {
            modifiedLineItems: [{ id: 'created-text-line' }, { id: 'existing-line' }],
            userErrors: [],
          },
        },
      }), { status: 200 }))

    const result = await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'text',
          name: 'Door & Window Trim',
          description: 'All exterior door & window frames',
          clientVisible: true,
          position: 0,
        },
        {
          kind: 'line_item',
          name: 'Walls',
          description: 'Existing wall scope',
          quantity: 1,
          unitPrice: 25,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'existing-line',
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

    expect(result.syncedLineItems).toEqual([
      { sourcePosition: 1, jobberLineItemId: 'existing-line' },
      { sourcePosition: 0, jobberLineItemId: 'created-text-line' },
    ])

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(bodies[2].query).toContain('quoteCreateTextLineItems')
    expect(bodies[2].variables.lineItems).toEqual([
      {
        name: 'Door & Window Trim',
        description: 'All exterior door & window frames',
        category: 'SERVICE',
      },
    ])
    expect(bodies[3].query).toContain('quoteEditLineItems')
    expect(bodies[3].variables.lineItems).toEqual([
      expect.objectContaining({ lineItemId: 'created-text-line', name: 'Door & Window Trim', sortOrder: 0 }),
      expect.objectContaining({ lineItemId: 'existing-line', name: 'Walls', sortOrder: 1 }),
    ])
  })

  it('normalizes final Jobber sort order from submitted line order when new text items have no position', async () => {
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
                  id: 'existing-line',
                  name: 'Walls',
                  category: 'SERVICE',
                  description: 'Existing wall scope',
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
        data: { quoteEditLineItems: { modifiedLineItems: [{ id: 'existing-line' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateTextLineItems: { createdLineItems: [{ id: 'created-top-text' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateTextLineItems: { createdLineItems: [{ id: 'created-bottom-text' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quoteEditLineItems: {
            modifiedLineItems: [
              { id: 'created-top-text' },
              { id: 'existing-line' },
              { id: 'created-bottom-text' },
            ],
            userErrors: [],
          },
        },
      }), { status: 200 }))

    await syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'text',
          name: 'Preparation Notes',
          description: 'Before work starts',
          clientVisible: true,
        },
        {
          kind: 'line_item',
          name: 'Walls',
          description: 'Existing wall scope',
          quantity: 1,
          unitPrice: 25,
          taxable: true,
          clientVisible: true,
          jobberLineItemId: 'existing-line',
        },
        {
          kind: 'text',
          name: 'Completion Notes',
          description: 'After work finishes',
          clientVisible: true,
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
    expect(bodies[2].query).toContain('quoteCreateTextLineItems')
    expect(bodies[2].variables.lineItems[0]).not.toHaveProperty('sortOrder')
    expect(bodies[3].query).toContain('quoteCreateTextLineItems')
    expect(bodies[3].variables.lineItems[0]).not.toHaveProperty('sortOrder')
    expect(bodies[4].query).toContain('quoteEditLineItems')
    expect(bodies[4].variables.lineItems).toEqual([
      expect.objectContaining({ lineItemId: 'created-top-text', name: 'Preparation Notes', sortOrder: 0 }),
      expect.objectContaining({ lineItemId: 'existing-line', name: 'Walls', sortOrder: 1 }),
      expect.objectContaining({ lineItemId: 'created-bottom-text', name: 'Completion Notes', sortOrder: 2 }),
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

  it('does not retry create mutations after a throttled response and preserves prior created line ids', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'quote-id',
            lineItems: { nodes: [] },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: { quoteCreateLineItems: { createdLineItems: [{ id: 'created-first-line' }], userErrors: [] } },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: 'Throttled' }] }), { status: 429 }))

    await expect(syncJobberQuoteLineItems('quote-id', {
      saveMode: 'priced_line_items',
      lines: [
        {
          kind: 'line_item',
          name: 'First line',
          description: 'Created before throttle',
          quantity: 1,
          unitPrice: 100,
          taxable: true,
          clientVisible: true,
          position: 0,
        },
        {
          kind: 'line_item',
          name: 'Second line',
          description: 'Should not be retried automatically',
          quantity: 1,
          unitPrice: 200,
          taxable: true,
          clientVisible: true,
          position: 1,
        },
      ],
      finalTotal: '300.00',
      finalTotalIncludesGst: true,
    }, {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
      throttleRetryDelayMs: 0,
      maxThrottleRetries: 4,
    })).rejects.toMatchObject({
      name: 'JobberLineSyncPartialError',
      syncedLineItems: [{ sourcePosition: 0, jobberLineItemId: 'created-first-line' }],
    } satisfies Partial<JobberLineSyncPartialError>)

    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(bodies.filter((body) => String(body.query).includes('quoteCreateLineItems'))).toHaveLength(2)
  })
})
