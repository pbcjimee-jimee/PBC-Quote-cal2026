import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MaterialSummary } from '@/components/quote-form/material-summary'
import { createMaterialInput } from './fixtures/quote-form-input'

describe('material summary', () => {
  it('shows current values without duplicating editable controls', () => {
    const html = renderToStaticMarkup(createElement(MaterialSummary, { item: createMaterialInput({ name: 'Long sample paint', areaName: 'Walls', quantity: '2.5', memo: 'Two coats' }), onEdit: () => {} }))
    expect(html).toContain('Long sample paint')
    expect(html).toContain('Walls')
    expect(html).toContain('$50.00')
    expect(html).toContain('Two coats')
    expect(html).toContain('Edit Long sample paint')
    expect(html).not.toContain('<input')
  })
})
