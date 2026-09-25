import { describe, expect, it } from 'vitest'
import { createQuoteMobileState, revealQuoteUiTarget, getQuoteErrorKey } from '@/components/quote-form/quote-mobile-state'
import { createEmptyQuoteFormDraft, getComparableQuoteDraftValue, parseQuoteFormDraft, sanitizeQuoteFormDraftForStorage } from '@/components/quote-form/quote-draft'

describe('mobile quote navigation', () => {
  it('starts new quotes in details and edits in work', () => {
    expect(createQuoteMobileState(false).activeSection).toBe('details')
    expect(createQuoteMobileState(true).activeSection).toBe('work')
  })

  it('reveals the exact option, scope and material without changing another selection', () => {
    const state = createQuoteMobileState(true)
    state.editingPublicLineId = 'public-1'
    const next = revealQuoteUiTarget(state, { section: 'work', optionId: 'opt-1', entityId: 'mat-1', scope: 'roof', field: 'quantity' })
    expect(next.expandedOptionId).toBe('opt-1')
    expect(next.expandedOptionIds).toEqual(['opt-1'])
    expect(next.optionScopes['opt-1']).toBe('roof')
    expect(next.editingOptionMaterial).toEqual({ optionId: 'opt-1', materialId: 'mat-1' })
    expect(next.editingPublicLineId).toBe('public-1')
    expect(state.expandedOptionId).toBeNull()
  })

  it('opens unassigned material errors and distinct public fields', () => {
    const target = { section: 'work' as const, scope: 'unassigned' as const, entityId: 'item-1', field: 'name' }
    expect(revealQuoteUiTarget(createQuoteMobileState(false), target).activeMainScope).toBe('unassigned')
    expect(getQuoteErrorKey(target)).not.toBe(getQuoteErrorKey({ ...target, optionId: 'option-1' }))
    expect(revealQuoteUiTarget(createQuoteMobileState(false), { section: 'public', entityId: 'line-2', field: 'description' }).editingPublicLineId).toBe('line-2')
  })

  it('focuses Review without replacing the selected input category', () => {
    const state = createQuoteMobileState(true)
    const target = { section: 'review' as const, field: 'summary' }
    const next = revealQuoteUiTarget(state, target)
    expect(next.activeSection).toBe('work')
    expect(next.focusTarget).toEqual(target)
  })

  it('reads legacy expanded options, omits expansion from new storage and dirty comparison', () => {
    const draft = { ...createEmptyQuoteFormDraft(), updatedAt: new Date().toISOString(), version: 1, customerName: 'Sample', options: [{ id: 'opt-1', title: 'Option', materials: [], selectedMin: 4 as const, selectedMax: 1 as const, isExpanded: true }] }
    const restored = parseQuoteFormDraft(JSON.stringify(draft))
    expect(restored?.version).toBe(2)
    const stored = sanitizeQuoteFormDraftForStorage(draft)
    expect(stored.version).toBe(2)
    expect(stored.options[0]).not.toHaveProperty('isExpanded')
    expect(parseQuoteFormDraft(JSON.stringify(stored))?.options[0].id).toBe('opt-1')
    expect(getComparableQuoteDraftValue(draft)).toBe(getComparableQuoteDraftValue({ ...draft, options: [{ ...draft.options[0], isExpanded: false }] }))
    expect(getComparableQuoteDraftValue(draft)).not.toBe(getComparableQuoteDraftValue({ ...draft, customerName: 'Changed' }))
  })
})
