import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/actions/quotes', () => ({ createQuote: vi.fn(), updateQuote: vi.fn() }))
import { getQuoteFormIssues } from '@/components/quote-form/quote-form-preflight'
import { createMaterialInput, createQuoteFormInput } from './fixtures/quote-form-input'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'

const publicLine: JobberQuoteLineItemDraft = { id: 'public-1', kind: 'line_item', name: 'Painting', description: '', quantity: '1', unitPrice: '10', taxable: true, clientVisible: true }

describe('quote form preflight', () => {
  it.each(['text', 'line_item'] as const)('requires a name for %s rows before payload fallback names can hide it', kind => {
    expect(getQuoteFormIssues(createQuoteFormInput({ jobberQuoteLines: [{ ...publicLine, kind, name: '  ' }] })))
      .toEqual([{ section: 'public', entityId: publicLine.id, field: 'name', message: 'Enter a line name.' }])
  })

  it.each(['', '.', '1,5', '2ea', '-1', '1e3'])('rejects malformed public quantity %s', quantity => {
    expect(getQuoteFormIssues(createQuoteFormInput({ jobberQuoteLines: [{ ...publicLine, quantity }] })))
      .toEqual([{ section: 'public', entityId: publicLine.id, field: 'quantity', message: 'Enter a valid quantity using numbers only.' }])
  })

  it.each(['quantity', 'unitPrice'] as const)('rejects excess %s precision without rounding silently', field => {
    expect(getQuoteFormIssues(createQuoteFormInput({ jobberQuoteLines: [{ ...publicLine, [field]: '1.005' }] })))
      .toEqual([{ section: 'public', entityId: publicLine.id, field, message: 'Use at most two decimal places.' }])
  })

  it.each(['text', 'line_item'] as const)('checks invalid unit prices for %s rows', kind => {
    expect(getQuoteFormIssues(createQuoteFormInput({ jobberQuoteLines: [{ ...publicLine, kind, unitPrice: '2ea' }] })))
      .toEqual([{ section: 'public', entityId: publicLine.id, field: 'unitPrice', message: 'Enter a valid signed unit price within the supported range.' }])
    expect(getQuoteFormIssues(createQuoteFormInput({ jobberQuoteLines: [{ ...publicLine, kind, unitPrice: '-.555' }] })))
      .toEqual([{ section: 'public', entityId: publicLine.id, field: 'unitPrice', message: 'Use at most two decimal places.' }])
  })

  it.each(['quantity', 'marketPrice', 'workingDays', 'labourPerDay'] as const)('maps invalid main and option %s inputs to their rows', field => {
    const main = createMaterialInput({ id: 'main', [field]: '.' })
    const option = createMaterialInput({ id: 'option', areaScope: undefined, [field]: '2ea' })
    expect(getQuoteFormIssues(createQuoteFormInput({ materials: [main], options: [{ id: 'opt', title: 'Option', selectedMin: 1, selectedMax: 4, isExpanded: false, materials: [option] }] })))
      .toEqual([
        { section: 'work', entityId: 'main', optionId: undefined, scope: 'interior', field, message: 'Enter a valid number.' },
        { section: 'work', entityId: 'option', optionId: 'opt', scope: 'unassigned', field, message: 'Enter a valid number.' },
      ])
  })

  it('returns all format issues before schema errors', () => {
    const issues = getQuoteFormIssues(createQuoteFormInput({
      jobberQuoteLines: [{ ...publicLine, name: '', quantity: '1,5', unitPrice: '-' }],
      materials: [createMaterialInput({ name: '', quantity: '2ea', marketPrice: '.', workingDays: 'bad', labourPerDay: '1e3' })],
    }))
    expect(issues.map(issue => issue.field)).toEqual(['name', 'quantity', 'unitPrice', 'quantity', 'marketPrice', 'workingDays', 'labourPerDay'])
  })

  it('accepts leading and trailing decimal points, signed prices and empty optional material numbers', () => {
    expect(getQuoteFormIssues(createQuoteFormInput({
      jobberQuoteLines: [{ ...publicLine, quantity: '.5', unitPrice: '-.5' }, { ...publicLine, id: 'text', kind: 'text', quantity: 'ignored', unitPrice: '5.' }],
      materials: [createMaterialInput({ quantity: '.5', marketPrice: '', workingDays: '', labourPerDay: '' })],
    }))).toEqual([])
  })

  it('leaves comparison-managed quantities and prices to comparison validation but still checks their names', () => {
    const issues = getQuoteFormIssues(createQuoteFormInput({ jobberQuoteLines: [{ ...publicLine, name: '', paintComparisonKey: 'comparison', quantity: 'bad', unitPrice: 'bad' }] }))
    expect(issues).toEqual([{ section: 'public', entityId: publicLine.id, field: 'name', message: 'Enter a line name.' }])
  })
  it('accepts current valid input without imposing Low High amount ordering', () => {
    expect(getQuoteFormIssues(createQuoteFormInput({ selectedMin: 1, selectedMax: 4 }))).toEqual([])
  })
  it('maps material schema names and hidden scope back to stable row identity', () => {
    const issues = getQuoteFormIssues(createQuoteFormInput({ materials: [createMaterialInput({ id: 'roof-row', name: '', quantity: '0', areaScope: 'roof' })] }))
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'work', entityId: 'roof-row', scope: 'roof', field: 'name', message: 'Enter a material name.' }),
      expect.objectContaining({ section: 'work', entityId: 'roof-row', scope: 'roof', field: 'quantity', message: 'Quantity must be greater than 0.' }),
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
    expect(issues[0]).toMatchObject({ section: 'public', entityId: 'public-9', field: 'name', message: 'Line name must be 200 characters or fewer.' })
  })
})
