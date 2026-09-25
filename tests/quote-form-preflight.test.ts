import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/actions/quotes', () => ({ createQuote: vi.fn(), updateQuote: vi.fn() }))
import { getQuoteFormIssues } from '@/components/quote-form/quote-form-preflight'
import { createMaterialInput, createQuoteFormInput } from './fixtures/quote-form-input'

describe('quote form preflight', () => {
  it('accepts current valid input without imposing Low High amount ordering', () => {
    expect(getQuoteFormIssues(createQuoteFormInput({ selectedMin: 1, selectedMax: 4 }))).toEqual([])
  })
  it('maps material schema names and hidden scope back to stable row identity', () => {
    const issues = getQuoteFormIssues(createQuoteFormInput({ materials: [createMaterialInput({ id: 'roof-row', name: '', quantity: '0', areaScope: 'roof' })] }))
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'work', entityId: 'roof-row', scope: 'roof', field: 'name' }),
      expect.objectContaining({ section: 'work', entityId: 'roof-row', scope: 'roof', field: 'quantity' }),
    ]))
  })
  it('maps option unassigned rows and memo positions after empty memo filtering', () => {
    const issues = getQuoteFormIssues(createQuoteFormInput({ options: [{ id: 'opt-1', title: 'Option', isExpanded: false, selectedMin: 4, selectedMax: 1, materials: [createMaterialInput({ areaScope: undefined, quantity: '0' })] }], memos: [{ id: 'empty', body: '' }, { id: 'long', body: 'x'.repeat(4001) }] }))
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ optionId: 'opt-1', entityId: 'material-1', scope: 'unassigned', field: 'quantity' }),
      expect.objectContaining({ section: 'review', entityId: 'long', field: 'body' }),
    ]))
  })
  it('addresses public errors by current ID after reorder', () => {
    const issues = getQuoteFormIssues(createQuoteFormInput({ jobberQuoteLines: [{ id: 'public-9', kind: 'text', name: 'x'.repeat(201), description: '', quantity: '0', unitPrice: '0', taxable: false, clientVisible: true }] }))
    expect(issues[0]).toMatchObject({ section: 'public', entityId: 'public-9', field: 'name' })
  })
})
