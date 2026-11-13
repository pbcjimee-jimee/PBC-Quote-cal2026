import { describe, expect, it } from 'vitest'
import { buildJobberSyncPlan } from '@/components/quote-form/jobber-sync-plan'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'

function line(overrides: Partial<JobberQuoteLineItemDraft> = {}): JobberQuoteLineItemDraft {
  return { id: 'local', kind: 'line_item', name: 'Painting', description: '', quantity: '1', unitPrice: '10', taxable: true, clientVisible: true, ...overrides }
}

describe('buildJobberSyncPlan', () => {
  it('counts visible linked and new rows, including text and unselected options', () => {
    expect(buildJobberSyncPlan({
      lines: [line({ jobberLineItemId: 'linked' }), line({ kind: 'text' }), line({ optional: true, selected: false }), line({ clientVisible: false })],
      deletedJobberLineItemIds: [], knownLineNames: new Map(),
    })).toEqual({ updateCount: 1, createCount: 2, deleteItems: [] })
  })

  it('merges hidden rows with pending deletions, deduplicates and cancels visible IDs', () => {
    expect(buildJobberSyncPlan({
      lines: [line({ jobberLineItemId: 'hidden', clientVisible: false }), line({ jobberLineItemId: 'visible', clientVisible: false }), line({ jobberLineItemId: 'visible' })],
      deletedJobberLineItemIds: ['removed', 'hidden', 'removed', 'visible', 'unknown'],
      knownLineNames: new Map([['removed', 'Old painting'], ['hidden', 'Hidden painting']]),
    })).toEqual({ updateCount: 1, createCount: 0, deleteItems: [
      { id: 'removed', name: 'Old painting' }, { id: 'hidden', name: 'Hidden painting' }, { id: 'unknown', name: null },
    ] })
  })

  it('adds a newly hidden linked row to the deletion set', () => {
    expect(buildJobberSyncPlan({ lines: [line({ jobberLineItemId: 'hidden', clientVisible: false })], deletedJobberLineItemIds: [], knownLineNames: new Map() }))
      .toEqual({ updateCount: 0, createCount: 0, deleteItems: [{ id: 'hidden', name: null }] })
  })
})
