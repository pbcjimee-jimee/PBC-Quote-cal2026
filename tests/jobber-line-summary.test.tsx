import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { JobberLineSummary } from '@/components/quote-form/jobber-line-summary'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'

const pricedLine: JobberQuoteLineItemDraft = {
  id: 'line-1',
  kind: 'line_item',
  name: 'Exterior repaint',
  description: 'Prepare and paint exterior walls',
  quantity: '2',
  unitPrice: '1500.00',
  taxable: true,
  clientVisible: true,
}

const textLine: JobberQuoteLineItemDraft = {
  id: 'text-1',
  kind: 'text',
  name: 'Access notes',
  description: 'Crew needs side gate access.',
  quantity: '1',
  unitPrice: '0',
  taxable: false,
  clientVisible: false,
}

describe('JobberLineSummary', () => {
  it('summarizes a priced public line with amount, tax, and visibility labels', () => {
    const markup = renderToStaticMarkup(createElement(JobberLineSummary, {
      line: pricedLine,
      isEditing: false,
      onEdit: () => undefined,
    }))

    expect(markup).toContain('Exterior repaint')
    expect(markup).toContain('Line item')
    expect(markup).toContain('$3000.00')
    expect(markup).toContain('Taxable')
    expect(markup).toContain('Client visible')
    expect(markup).toContain('aria-label="Edit Exterior repaint"')
  })

  it('preserves exact cents when displaying the Decimal line total', () => {
    const markup = renderToStaticMarkup(createElement(JobberLineSummary, {
      line: { ...pricedLine, quantity: '3', unitPrice: '30023997515803.31' },
      isEditing: false,
      onEdit: () => undefined,
    }))

    expect(markup).toContain('$90071992547409.93')
    expect(markup).not.toContain('CAD')
  })

  it('summarizes a text line with explicit non-taxable and hidden states', () => {
    const markup = renderToStaticMarkup(createElement(JobberLineSummary, {
      line: textLine,
      isEditing: false,
      onEdit: () => undefined,
    }))

    expect(markup).toContain('Access notes')
    expect(markup).toContain('Text')
    expect(markup).toContain('Not taxable')
    expect(markup).toContain('Hidden from client')
    expect(markup).not.toContain('$0.00')
  })
})
