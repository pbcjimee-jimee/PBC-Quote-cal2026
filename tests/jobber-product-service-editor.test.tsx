import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  JobberProductServiceEditor,
  reorderJobberQuoteLines,
} from '@/components/quote-form/jobber-product-service-editor'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'

describe('JobberProductServiceEditor', () => {
  const lines: JobberQuoteLineItemDraft[] = [
    {
      id: 'line-1',
      kind: 'line_item',
      name: 'Exterior repaint',
      description: 'Prepare, prime, and paint exterior walls',
      quantity: '2',
      unitPrice: '1500.00',
      taxable: true,
      clientVisible: true,
    },
    {
      id: 'text-1',
      kind: 'text',
      name: 'Access notes',
      description: 'Crew needs side gate access.',
      quantity: '1',
      unitPrice: '0',
      taxable: false,
      clientVisible: false,
    },
  ]

  it('renders priced line item and description total save modes without Build Option Set', () => {
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: lines,
      saveMode: 'priced_line_items',
      onChange: () => undefined,
      onSaveModeChange: () => undefined,
    }))

    expect(markup).toContain('Product / Service')
    expect(markup).toContain('Priced Line Items')
    expect(markup).toContain('Description + Total')
    expect(markup).not.toContain('Build Option Set')
  })

  it('renders editable priced line item fields and text rows without price fields', () => {
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: lines,
      saveMode: 'priced_line_items',
      onChange: () => undefined,
      onSaveModeChange: () => undefined,
    }))

    expect(markup).toContain('aria-label="Line item name"')
    expect(markup).toContain('value="Exterior repaint"')
    expect(markup).toContain('Prepare, prime, and paint exterior walls')
    expect(markup).toContain('Qty')
    expect(markup).toContain('Unit price')
    expect(markup).toContain('Taxable')
    expect(markup).toContain('Client visible')
    expect(markup).toContain('aria-label="Text title"')
    expect(markup).toContain('Access notes')
    expect(markup).toContain('Crew needs side gate access.')
    expect(markup).not.toContain('aria-label="Text unit price"')
  })

  it('renders Add Line Item and Add Text controls', () => {
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: [],
      saveMode: 'description_total',
      onChange: () => undefined,
      onSaveModeChange: () => undefined,
    }))

    expect(markup).toContain('Add Line Item')
    expect(markup).toContain('Add Text')
    expect(markup).toContain('Add the public Jobber-facing product and service lines for this quote.')
  })

  it('renders drag handles for reordering line items', () => {
    const markup = renderToStaticMarkup(createElement(JobberProductServiceEditor, {
      value: lines,
      saveMode: 'priced_line_items',
      onChange: () => undefined,
      onSaveModeChange: () => undefined,
    }))

    expect(markup).toContain('draggable="true"')
    expect(markup).toContain('aria-label="Drag Exterior repaint"')
    expect(markup).toContain('aria-label="Drag Access notes"')
  })

  it('reorders line items by dragged and dropped ids', () => {
    const reordered = reorderJobberQuoteLines(lines, 'text-1', 'line-1')

    expect(reordered.map((line) => line.id)).toEqual(['text-1', 'line-1'])
    expect(lines.map((line) => line.id)).toEqual(['line-1', 'text-1'])
  })
})
