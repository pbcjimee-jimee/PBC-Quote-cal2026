import { describe, expect, it } from 'vitest'
import { buildJobberQuoteLinePayload } from '@/lib/jobber/quote-line-payload'

describe('buildJobberQuoteLinePayload', () => {
  it('builds priced public line items without internal material values', () => {
    const payload = buildJobberQuoteLinePayload({
      saveMode: 'priced_line_items',
      finalTotal: '3459.83',
      finalTotalIncludesGst: true,
      lines: [
        {
          kind: 'line_item',
          name: 'Interior painting',
          description: 'Walls and trim',
          quantity: '2',
          unitPrice: '650.25',
          taxable: true,
          clientVisible: true,
          linkedProductOrServiceId: 'Z2lkOi8vSm9iYmVyL1Byb2R1Y3QvMQ==',
          marketPrice: '999.99',
          actualPrice: '400.00',
          materialCost: 'Dulux material cost',
        },
        {
          kind: 'text',
          name: 'Preparation',
          description: 'Includes masking and patching',
          clientVisible: true,
          marketPrice: '100.00',
          actualPrice: '75.00',
        },
        {
          kind: 'line_item',
          name: 'Internal only line',
          description: 'Should not be sent',
          quantity: '1',
          unitPrice: '1',
          taxable: true,
          clientVisible: false,
        },
      ],
      internalMaterials: [
        {
          name: 'Dulux Wash&Wear Low Sheen',
          marketPrice: '200.00',
          actualPrice: '155.00',
          note: 'Dulux material cost',
        },
      ],
    })

    expect(payload.lineItems).toEqual([
      {
        name: 'Interior painting',
        description: 'Walls and trim',
        quantity: 2,
        unitPrice: 650.25,
        taxable: true,
        linkedProductOrServiceId: 'Z2lkOi8vSm9iYmVyL1Byb2R1Y3QvMQ==',
      },
      {
        name: 'Preparation',
        description: 'Includes masking and patching',
        quantity: 1,
        unitPrice: 0,
        taxable: false,
      },
    ])

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('actualPrice')
    expect(serialized).not.toContain('marketPrice')
    expect(serialized).not.toContain('actual_price')
    expect(serialized).not.toContain('market_price')
    expect(serialized).not.toContain('materialCost')
    expect(serialized).not.toContain('Dulux material cost')
    expect(serialized).not.toContain('Dulux Wash&Wear Low Sheen')
  })

  it('builds description lines and a GST-exclusive total line for description_total mode', () => {
    const payload = buildJobberQuoteLinePayload({
      saveMode: 'description_total',
      finalTotal: '3459.83',
      finalTotalIncludesGst: true,
      lines: [
        {
          kind: 'line_item',
          name: 'Interior painting',
          description: 'Walls and trim',
          quantity: '2',
          unitPrice: '650.25',
          taxable: true,
          clientVisible: true,
          actualPrice: '400.00',
          marketPrice: '999.99',
        },
        {
          kind: 'text',
          name: 'Preparation',
          description: 'Includes masking and patching',
          clientVisible: true,
        },
      ],
      internalMaterials: [
        {
          name: 'Dulux material cost',
          marketPrice: '200.00',
          actualPrice: '155.00',
        },
      ],
    })

    expect(payload.lineItems).toEqual([
      {
        name: 'Interior painting',
        description: 'Walls and trim',
        quantity: 1,
        unitPrice: 0,
        taxable: false,
      },
      {
        name: 'Preparation',
        description: 'Includes masking and patching',
        quantity: 1,
        unitPrice: 0,
        taxable: false,
      },
      {
        name: 'Total',
        description: '',
        quantity: 1,
        unitPrice: 3145.3,
        taxable: true,
      },
    ])
    expect(payload.lineItems.at(-1)).toMatchObject({
      name: 'Total',
      quantity: 1,
      unitPrice: 3145.30,
      taxable: true,
    })

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('actualPrice')
    expect(serialized).not.toContain('marketPrice')
    expect(serialized).not.toContain('Dulux material cost')
  })
})
