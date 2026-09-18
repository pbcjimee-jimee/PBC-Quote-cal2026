import { describe, expect, it, vi } from 'vitest'
import { checkDurableJobberSync } from '@/lib/jobber/sync-reconciliation'
import type { DurableJobberTransport, JobberSyncStore, SyncOperation } from '@/lib/jobber/sync-types'

function operation(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    id: 'operation-id', quote_id: 'quote-id', quote_version: 1, jobber_quote_id: 'remote-id',
    desired_payload: { saveMode: 'priced_line_items', lines: [], finalTotal: '0', finalTotalIncludesGst: true, deletedJobberLineItemIds: [] },
    status: 'reconciliation_required', lease_expires_at: null, attempt_count: 1,
    failure_code: 'mutation_begun', result: null, steps: [], ...overrides,
  }
}

function storage(current: SyncOperation): JobberSyncStore {
  return {
    claim: vi.fn(), begin: vi.fn(), complete: vi.fn(), record: vi.fn(), finish: vi.fn(),
    resolve: vi.fn(async () => { current.status = 'succeeded' }),
    read: vi.fn(async () => current),
  }
}

describe('checkDurableJobberSync', () => {
  it('never mutates and keeps an unknown create result blocked', async () => {
    const current = operation({ steps: [{
      id: 'step', operation_id: 'operation-id', step_key: 'create:0', sequence: 0,
      kind: 'create', request_payload: { lineItems: [] }, status: 'sending', result_payload: null,
    }] })
    const store = storage(current)
    const transport: DurableJobberTransport = { sync: vi.fn(), read: vi.fn() }
    const result = await checkDurableJobberSync(store, current, transport)
    expect(transport.sync).not.toHaveBeenCalled()
    expect(transport.read).not.toHaveBeenCalled()
    expect(store.resolve).not.toHaveBeenCalled()
    expect(result.status).toBe('blocked')
  })

  it('resolves only a recorded completion that matches an exact read and confirms deletions absent', async () => {
    const expected = {
      kind: 'line_item' as const, name: 'Walls', description: '', quantity: 1, unitPrice: 10,
      totalPrice: 10, taxable: true, sortOrder: 0, jobberLineItemId: 'known', sourcePosition: 0,
    }
    const current = operation({ result: {
      syncedLineItems: [{ sourcePosition: 0, jobberLineItemId: 'known' }],
      expectedLineItems: [expected], deletedLineItemIds: ['gone'],
    } })
    const store = storage(current)
    const transport: DurableJobberTransport = {
      sync: vi.fn(),
      read: vi.fn(async () => [{
        id: 'known', name: 'Walls', category: 'SERVICE', description: '', quantity: 1,
        unitPrice: 10, totalPrice: 10, taxable: true, textOnly: false,
        linkedProductOrService: { id: 'legacy-link', name: 'Legacy', category: 'SERVICE', description: '' },
      }]),
    }
    const result = await checkDurableJobberSync(store, current, transport)
    expect(store.resolve).toHaveBeenCalledWith('operation-id')
    expect(result.status).toBe('succeeded')
  })

  it('keeps partial readback blocked', async () => {
    const current = operation({ result: {
      syncedLineItems: [],
      expectedLineItems: [{ kind: 'text', name: 'A', description: '', sortOrder: 0, jobberLineItemId: 'missing' }],
      deletedLineItemIds: [],
    } })
    const store = storage(current)
    const result = await checkDurableJobberSync(store, current, {
      sync: vi.fn(), read: vi.fn(async () => []),
    })
    expect(store.resolve).not.toHaveBeenCalled()
    expect(result.status).toBe('blocked')
  })

  it('uses Decimal rounding at half-cent boundaries when checking money', async () => {
    const current = operation({ result: {
      syncedLineItems: [{ sourcePosition: 0, jobberLineItemId: 'known' }],
      expectedLineItems: [{
        kind: 'line_item', name: 'Walls', description: '', quantity: 1,
        unitPrice: 1.004, totalPrice: 1, taxable: true, sortOrder: 0,
        sourcePosition: 0, jobberLineItemId: 'known',
      }],
      deletedLineItemIds: [],
    } })
    const store = storage(current)
    const result = await checkDurableJobberSync(store, current, {
      sync: vi.fn(),
      read: vi.fn(async () => [{
        id: 'known', name: 'Walls', category: 'SERVICE', description: '', quantity: 1,
        unitPrice: 1.005, totalPrice: 1, taxable: true, textOnly: false, linkedProductOrService: null,
      }]),
    })
    expect(store.resolve).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'blocked', reason: 'remote_state_mismatch' })
  })

  it('keeps a priced completion blocked when the remote taxable value differs', async () => {
    const current = operation({ result: {
      syncedLineItems: [{ sourcePosition: 0, jobberLineItemId: 'known' }],
      expectedLineItems: [{
        kind: 'line_item', name: 'Walls', description: '', quantity: 1,
        unitPrice: 10, totalPrice: 10, taxable: true, sortOrder: 0,
        sourcePosition: 0, jobberLineItemId: 'known',
      }],
      deletedLineItemIds: [],
    } })
    const store = storage(current)
    const result = await checkDurableJobberSync(store, current, {
      sync: vi.fn(),
      read: vi.fn(async () => [{
        id: 'known', name: 'Walls', category: 'SERVICE', description: '', quantity: 1,
        unitPrice: 10, totalPrice: 10, taxable: false, textOnly: false,
        linkedProductOrService: null,
      }]),
    })

    expect(store.resolve).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'blocked', reason: 'remote_state_mismatch' })
  })

  it('keeps the operation blocked when resolve persistence fails', async () => {
    const current = operation({ result: {
      syncedLineItems: [], expectedLineItems: [], deletedLineItemIds: [],
    } })
    const store = storage(current)
    vi.mocked(store.resolve).mockRejectedValue(new Error('resolve unavailable'))
    const result = await checkDurableJobberSync(store, current, {
      sync: vi.fn(), read: vi.fn(async () => []),
    })
    expect(result).toMatchObject({ status: 'blocked', reason: 'resolve_failed' })
  })
})
