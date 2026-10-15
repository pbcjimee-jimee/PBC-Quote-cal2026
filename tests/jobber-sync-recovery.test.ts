import { describe, expect, it } from 'vitest'
import { buildSyncRecoveryPreview, recoveryKnownIds } from '@/lib/jobber/sync-recovery'
import type { SyncOperation } from '@/lib/jobber/sync-types'
import type { JobberQuoteLineItem } from '@/lib/jobber/client'

export function recoveryOperation(): SyncOperation {
  return {
    id: '00000000-0000-4000-8000-000000000701',
    quote_id: '00000000-0000-4000-8000-000000000101', quote_version: 1,
    jobber_quote_id: 'remote-quote', status: 'reconciliation_required',
    desired_payload: { saveMode: 'priced_line_items', finalTotal: '100', finalTotalIncludesGst: true, lines: [] },
    lease_expires_at: null, attempt_count: 1, failure_code: 'quote_changed', result: null,
    steps: [{ id: 'step', operation_id: '00000000-0000-4000-8000-000000000701',
      step_key: 'create:0', sequence: 0, kind: 'create', status: 'applied',
      request_payload: { lineItems: [{ kind: 'text', name: 'Walls', description: 'Original', sourcePosition: 0 }] },
      result_payload: { createdLineItemIds: ['known'], syncedLineItems: [{ sourcePosition: 0, jobberLineItemId: 'known' }] },
    }],
  }
}

export function recoveryQuote() {
  return { id: '00000000-0000-4000-8000-000000000101', version: 6, jobber_quote_id: 'remote-quote', jobber_save_mode: 'priced_line_items' as const }
}

export function recoveryLine() {
  return { id: '00000000-0000-4000-8000-000000000301', position: 1, kind: 'text' as const,
    name: 'Walls', description: 'Original', jobber_line_item_id: null, client_visible: true }
}

export function remoteLine(id = 'known'): JobberQuoteLineItem {
  return { id, name: 'Walls', description: 'Original', textOnly: true, category: 'SERVICE',
    quantity: 1, unitPrice: 0, totalPrice: 0, linkedProductOrService: null }
}

describe('reviewed sync recovery', () => {
  it('allows a partial applied journal without reconstructing completion or mapping old positions', () => {
    const preview = buildSyncRecoveryPreview(recoveryOperation(), recoveryQuote(), [recoveryLine()], [remoteLine()])
    expect(preview.expectedVersion).toBe(6)
    expect(preview.lines[0]).toMatchObject({ position: 1, suggestedJobberLineItemId: 'known' })
    expect(preview.remoteFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it.each(['sending', 'missing-result', 'unknown-create', 'legacy', 'wrong-quote', 'wrong-remote', 'future-lease', 'invalid-lease', 'no-steps', 'wrong-step'])(
    'rejects unsafe evidence: %s', (scenario) => {
      const op = recoveryOperation()
      if (scenario === 'sending') op.steps[0].status = 'sending'
      if (scenario === 'missing-result') op.steps[0].result_payload = null
      if (scenario === 'unknown-create') op.steps[0].result_payload = { createdLineItemIds: [] }
      if (scenario === 'legacy') op.failure_code = 'legacy_unjournaled'
      if (scenario === 'wrong-quote') op.quote_id = 'other'
      if (scenario === 'wrong-remote') op.jobber_quote_id = 'other'
      if (scenario === 'future-lease') op.lease_expires_at = '2999-01-01T00:00:00Z'
      if (scenario === 'invalid-lease') op.lease_expires_at = 'invalid'
      if (scenario === 'no-steps') op.steps = []
      if (scenario === 'wrong-step') op.steps[0].operation_id = 'other'
      expect(() => recoveryKnownIds(op, recoveryQuote())).toThrow()
    },
  )

  it('labels all live IDs but only suggests journal-owned IDs, without using stale positions', () => {
    const line = { ...recoveryLine(), name: 'Changed locally', description: 'New detail' }
    const preview = buildSyncRecoveryPreview(recoveryOperation(), recoveryQuote(), [line], [remoteLine(), remoteLine('unknown')])
    expect(preview.remoteLines.map((row) => [row.id, row.ownedByOperation])).toEqual([['known', true], ['unknown', false]])
    expect(preview.lines[0]).toMatchObject({ name: 'Changed locally', description: 'New detail', suggestedJobberLineItemId: null })
  })

  it('never suggests an unrelated remote row even if its text is an exact unique match', () => {
    const local = { ...recoveryLine(), name: 'New remote row' }
    const preview = buildSyncRecoveryPreview(recoveryOperation(), recoveryQuote(), [local], [remoteLine(), { ...remoteLine('unknown'), name: 'New remote row' }])
    expect(preview.lines[0].suggestedJobberLineItemId).toBeNull()
  })

  it('keeps a current known confirmed ID even when its public text was edited locally', () => {
    const line = { ...recoveryLine(), name: 'Edited', jobber_line_item_id: 'known' }
    expect(buildSyncRecoveryPreview(recoveryOperation(), recoveryQuote(), [line], [remoteLine()]).lines[0].suggestedJobberLineItemId).toBe('known')
  })

  it('does not guess duplicate remote or local fingerprints', () => {
    const op = recoveryOperation()
    op.desired_payload.lines = [{ kind: 'text', name: 'Walls', jobberLineItemId: 'second' }]
    const result = buildSyncRecoveryPreview(op, recoveryQuote(), [recoveryLine()], [remoteLine(), remoteLine('second')])
    expect(result.lines[0].suggestedJobberLineItemId).toBeNull()
    const localDuplicate = buildSyncRecoveryPreview(recoveryOperation(), recoveryQuote(), [recoveryLine(), { ...recoveryLine(), id: 'second' }], [remoteLine()])
    expect(localDuplicate.lines.map((row) => row.suggestedJobberLineItemId)).toEqual([null, null])
  })

  it('fingerprints the full read including unknown lines, order, and public optional flags', () => {
    const make = (remote: JobberQuoteLineItem[]) => buildSyncRecoveryPreview(recoveryOperation(), recoveryQuote(), [recoveryLine()], remote).remoteFingerprint
    const original = [remoteLine(), remoteLine('unknown')]
    expect(make(original)).not.toBe(make([...original].reverse()))
    expect(make(original)).not.toBe(make([original[0], { ...original[1], selected: true }]))
    expect(() => make([remoteLine(), remoteLine()])).toThrow()
  })

  it.each(['edit', 'delete', 'reorder'] as const)('requires exact known results for %s steps', (kind) => {
    const op = recoveryOperation()
    op.desired_payload.lines = [{ kind: 'text', name: 'Walls', jobberLineItemId: 'existing' }]
    op.steps.push({ ...op.steps[0], id: 'second', kind, step_key: `${kind}:0`, sequence: 1,
      request_payload: kind === 'delete' ? { lineItems: [], lineItemIds: ['existing'] }
        : { lineItems: [{ kind: 'text', name: 'Walls', description: '', jobberLineItemId: 'existing' }] },
      result_payload: kind === 'delete' ? { deletedLineItemIds: ['existing'] } : { editedLineItemIds: ['existing'] },
    })
    expect([...recoveryKnownIds(op, recoveryQuote())]).toEqual(['existing', 'known'])
    op.steps[1].result_payload = kind === 'delete' ? { deletedLineItemIds: ['wrong'] } : { editedLineItemIds: ['wrong'] }
    expect(() => recoveryKnownIds(op, recoveryQuote())).toThrow()
  })

  it('rejects a create response that reuses an existing known ID', () => {
    const op = recoveryOperation()
    op.desired_payload.lines = [{ kind: 'text', name: 'Walls', jobberLineItemId: 'known' }]
    expect(() => recoveryKnownIds(op, recoveryQuote())).toThrow()
  })

  it('does not leak hidden local rows and removes conflicting current-ID suggestions', () => {
    const local = { ...recoveryLine(), jobber_line_item_id: 'known' }
    const preview = buildSyncRecoveryPreview(recoveryOperation(), recoveryQuote(), [local,
      { ...local, id: 'second', name: 'Other' }, { ...local, id: 'hidden', client_visible: false }], [remoteLine()])
    expect(preview.lines).toHaveLength(2)
    expect(preview.lines.map((line) => line.suggestedJobberLineItemId)).toEqual([null, null])
  })

  it.each(['description_total', null])('refuses unsupported current save mode %s', (mode) => {
    expect(() => recoveryKnownIds(recoveryOperation(), { ...recoveryQuote(), jobber_save_mode: mode })).toThrow()
  })

  it('includes hidden links, prior pending IDs and the recorded total line in deletion candidates without widening suggestions', () => {
    const op = recoveryOperation()
    op.desired_payload.totalLineItemId = 'old-total'
    const quote = { ...recoveryQuote(), jobber_pending_deleted_line_item_ids: ['prior-delete', 'known', 'already-absent'] }
    const hidden = { ...recoveryLine(), id: 'hidden-local', client_visible: false, jobber_line_item_id: 'hidden-remote' }
    const preview = buildSyncRecoveryPreview(op, quote, [recoveryLine(), hidden], [remoteLine(), remoteLine('hidden-remote'), remoteLine('prior-delete')])
    expect(new Set(preview.deletionCandidateIds)).toEqual(new Set(['known', 'old-total', 'hidden-remote', 'prior-delete', 'already-absent']))
    expect(preview.lines).toHaveLength(1)
    expect(preview.remoteLines.filter((line) => line.ownedByOperation).map((line) => line.id)).toEqual(['known'])
    expect(preview.lines[0].suggestedJobberLineItemId).toBe('known')
  })
})
