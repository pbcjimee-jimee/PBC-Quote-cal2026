import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { FinalSummary } from '@/components/quote-form/final-summary'
import { MaterialRow } from '@/components/quote-form/material-row'

describe('quote form pricing UI', () => {
  it('shows subtotal details for labour and material totals', () => {
    const markup = renderToStaticMarkup(
      createElement(FinalSummary, {
        labourTotal: new Decimal('1200'),
        materialTotal: new Decimal('255.74'),
        subtotal: new Decimal('1455.74'),
        finalTotal: new Decimal('1455.74'),
      })
    )

    expect(markup).toContain('Labour total')
    expect(markup).toContain('$1200.00')
    expect(markup).toContain('Material total')
    expect(markup).toContain('$255.74')
    expect(markup).toContain('Subtotal')
  })

  it('edits only a single RRP price for material rows', () => {
    const markup = renderToStaticMarkup(
      createElement(MaterialRow, {
        item: {
          id: 'item-1',
          name: 'Dulux Acratex Roof Membrane Satin Monument 15L',
          manufacturer: 'Dulux',
          unit: '15L',
          marketPrice: '255.74',
          actualPrice: '255.74',
          quantity: '1',
          isCustom: false,
        },
        onChange: () => undefined,
        onRemove: () => undefined,
      })
    )

    expect(markup).toContain('RRP')
    expect(markup).not.toContain('Market')
    expect(markup).not.toContain('Actual')
  })
})
