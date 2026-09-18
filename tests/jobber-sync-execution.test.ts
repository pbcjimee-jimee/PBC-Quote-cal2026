import { describe, expect, it, vi } from 'vitest'
import { runDurableJobberSync } from '@/lib/jobber/sync-execution'
import type { DurableJobberTransport, JobberSyncStore, SyncOperation } from '@/lib/jobber/sync-types'

function operation(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    id: 'operation-id', quote_id: 'quote-id', quote_version: 1,
    jobber_quote_id: 'jobber-quote-id',
    desired_payload: {
      saveMode: 'priced_line_items', lines: [], finalTotal: '0',
      finalTotalIncludesGst: true, deletedJobberLineItemIds: [],
    },
    status: 'running', lease_expires_at: '2099-01-01T00:00:00Z', attempt_count: 1,
    failure_code: null, result: null, steps: [], claim_token: 'claim-token', ...overrides,
  }
}

function store(op = operation()): JobberSyncStore & { events: string[]; current: SyncOperation } {
  const state = { ...op }
  const events: string[] = []
  return {
    events, current: state,
    claim: vi.fn(async () => { events.push('claim'); return { claimed: true, operation: state } }),
    begin: vi.fn(async (_id, _token, step) => { events.push(`begin:${step.key}`) }),
    complete: vi.fn(async (_id, _token, key) => { events.push(`complete:${key}`) }),
    record: vi.fn(async () => { events.push('record') }),
    finish: vi.fn(async (_id, _token, outcome) => {
      events.push(`finish:${outcome}`)
      state.status = outcome === 'succeeded' ? 'succeeded' : outcome
    }),
    resolve: vi.fn(async () => { events.push('resolve'); state.status = 'succeeded' }),
    read: vi.fn(async () => { events.push('read'); return state }),
  }
}

function transport(sync: DurableJobberTransport['sync']): DurableJobberTransport {
  return { sync, read: vi.fn(async () => []) }
}

describe('runDurableJobberSync', () => {
  it('does not mutate when the claim is not acquired', async () => {
    const current = operation({ status: 'running', claim_token: undefined })
    const storage = store(current)
    vi.mocked(storage.claim).mockResolvedValue({ claimed: false, operation: current })
    const remoteMutation = vi.fn()
    const result = await runDurableJobberSync(storage, current.id, transport(remoteMutation))
    expect(remoteMutation).not.toHaveBeenCalled()
    expect(result.status).toBe('not_claimed')
  })

  it('does not mutate when claiming fails', async () => {
    const storage = store()
    vi.mocked(storage.claim).mockRejectedValue(new Error('claim unavailable'))
    const remoteMutation = vi.fn()
    await expect(runDurableJobberSync(storage, 'operation-id', transport(remoteMutation))).resolves.toMatchObject({
      status: 'failed', reason: 'claim_failed',
    })
    expect(remoteMutation).not.toHaveBeenCalled()
  })

  it('persists begin and completion hooks in transport order, then finalizes and reads exact state', async () => {
    const storage = store()
    const remote = transport(async (_quoteId, _payload, journal) => {
      await journal.beforeMutation({ key: 'create:0', kind: 'create', request: { lineItems: [] } })
      storage.events.push('remote:create:0')
      await journal.afterMutation('create:0', { createdLineItemIds: ['new-id'] })
      return {
        createdLineItemIds: ['new-id'], editedLineItemIds: [], deletedLineItemIds: [], syncedLineItems: [],
        expectedLineItems: [{
          kind: 'line_item', name: 'A', description: '', quantity: 1, unitPrice: 1,
          totalPrice: 1, taxable: true, sortOrder: 0, jobberLineItemId: 'new-id',
        }],
      }
    })
    const result = await runDurableJobberSync(storage, 'operation-id', remote)
    expect(storage.events).toEqual([
      'claim', 'begin:create:0', 'remote:create:0', 'complete:create:0',
      'record', 'finish:succeeded', 'read',
    ])
    expect(result.status).toBe('succeeded')
  })

  it('marks a crash after create as uncertain and never retries it', async () => {
    const storage = store()
    let calls = 0
    const result = await runDurableJobberSync(storage, 'operation-id', transport(async (_id, _payload, journal) => {
      await journal.beforeMutation({ key: 'create:0', kind: 'create', request: { lineItems: [] } })
      calls += 1
      throw new Error('connection lost after send')
    }))
    expect(calls).toBe(1)
    expect(storage.finish).toHaveBeenCalledWith(
      'operation-id', 'claim-token', 'reconciliation_required', undefined,
    )
    expect(result.status).toBe('blocked')
  })

  it('does not continue when complete-step persistence fails', async () => {
    const storage = store()
    vi.mocked(storage.complete).mockRejectedValue(new Error('database unavailable'))
    let continued = false
    const result = await runDurableJobberSync(storage, 'operation-id', transport(async (_id, _payload, journal) => {
      await journal.beforeMutation({ key: 'create:0', kind: 'create', request: { lineItems: [] } })
      await journal.afterMutation('create:0', { createdLineItemIds: ['new-id'] })
      continued = true
      throw new Error('must not run')
    }))
    expect(continued).toBe(false)
    expect(result.status).toBe('blocked')
  })

  it('keeps a no-step preflight failure retryable', async () => {
    const storage = store()
    const result = await runDurableJobberSync(storage, 'operation-id', transport(async () => {
      throw new Error('token unavailable')
    }))
    expect(storage.finish).toHaveBeenCalledWith('operation-id', 'claim-token', 'retryable', undefined)
    expect(result.status).toBe('retryable')
  })

  it('reports readback failure instead of trusting a successful finish call', async () => {
    const storage = store()
    vi.mocked(storage.read).mockRejectedValue(new Error('read failed'))
    const result = await runDurableJobberSync(storage, 'operation-id', transport(async () => ({
      createdLineItemIds: [], editedLineItemIds: [], deletedLineItemIds: [],
      syncedLineItems: [], expectedLineItems: [],
    })))
    expect(result).toMatchObject({ status: 'failed', reason: 'readback_failed' })
  })

  it('does not send when the lease is lost while persisting begin', async () => {
    const storage = store()
    vi.mocked(storage.begin).mockImplementation(async () => {
      storage.current.status = 'reconciliation_required'
      storage.current.failure_code = 'lease_expired'
      throw new Error('lease expired')
    })
    vi.mocked(storage.finish).mockImplementation(async () => undefined)
    let remoteSent = false
    const result = await runDurableJobberSync(storage, 'operation-id', transport(async (_id, _payload, journal) => {
      await journal.beforeMutation({ key: 'create:0', kind: 'create', request: { lineItems: [] } })
      remoteSent = true
      throw new Error('unreachable')
    }))
    expect(remoteSent).toBe(false)
    expect(result).toMatchObject({ status: 'blocked', reason: 'lease_expired' })
  })

  it('does not report success when finalization fails and the operation remains running', async () => {
    const storage = store()
    vi.mocked(storage.finish).mockRejectedValue(new Error('finish unavailable'))
    const result = await runDurableJobberSync(storage, 'operation-id', transport(async () => ({
      createdLineItemIds: [], editedLineItemIds: [], deletedLineItemIds: [],
      syncedLineItems: [], expectedLineItems: [],
    })))
    expect(result).toMatchObject({ status: 'blocked', reason: 'finalization_failed' })
    expect(storage.finish).toHaveBeenCalledTimes(1)
    expect(storage.finish).toHaveBeenCalledWith('operation-id', 'claim-token', 'succeeded')
    expect(storage.read).toHaveBeenCalledTimes(1)
  })

  it('reads once and never finalizes again when the success acknowledgement is lost', async () => {
    const storage = store()
    vi.mocked(storage.finish).mockImplementation(async (_id, _token, outcome) => {
      storage.events.push(`finish:${outcome}`)
      if (outcome === 'succeeded') {
        storage.current.status = 'succeeded'
        throw new Error('success acknowledgement lost')
      }
    })

    const result = await runDurableJobberSync(storage, 'operation-id', transport(async () => ({
      createdLineItemIds: [], editedLineItemIds: [], deletedLineItemIds: [],
      syncedLineItems: [], expectedLineItems: [],
    })))

    expect(storage.finish).toHaveBeenCalledTimes(1)
    expect(storage.finish).toHaveBeenCalledWith('operation-id', 'claim-token', 'succeeded')
    expect(storage.read).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('succeeded')
  })

  it('records the full desired absence set, not only dispatched deletions', async () => {
    const storage = store(operation({
      desired_payload: {
        saveMode: 'priced_line_items', lines: [], finalTotal: '0', finalTotalIncludesGst: true,
        deletedJobberLineItemIds: ['actually-deleted', 'already-absent'],
      },
    }))
    await runDurableJobberSync(storage, 'operation-id', transport(async () => ({
      createdLineItemIds: [], editedLineItemIds: [], deletedLineItemIds: ['actually-deleted'],
      syncedLineItems: [], expectedLineItems: [],
    })))
    expect(storage.record).toHaveBeenCalledWith('operation-id', 'claim-token', expect.objectContaining({
      deletedLineItemIds: ['actually-deleted', 'already-absent'],
    }))
  })
})
