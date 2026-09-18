import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import { createJobberSyncStore, parseJobberSyncOperation } from '@/lib/jobber/sync-store'

const operationId = '00000000-0000-4000-8000-000000000701'
const quoteId = '00000000-0000-4000-8000-000000000101'
const claimToken = '00000000-0000-4000-8000-000000000801'

const rawOperation = {
  id: operationId,
  quote_id: quoteId,
  quote_version: 3,
  jobber_quote_id: 'remote-1',
  desired_payload: {
    saveMode: 'priced_line_items',
    finalTotal: '110.00',
    finalTotalIncludesGst: true,
    lines: [{
      kind: 'line_item', name: 'Paint', description: '', quantity: 1, unitPrice: 100,
      totalPrice: 100, taxable: true, clientVisible: true, position: 0,
    }],
    deletedJobberLineItemIds: ['deleted-1'],
  },
  status: 'queued',
  lease_expires_at: null,
  attempt_count: 0,
  failure_code: null,
  result: null,
  created_at: '2026-09-18T00:00:00.000Z',
  updated_at: '2026-09-18T00:00:00.000Z',
}

describe('Jobber sync store', () => {
  it('validates external operation JSON instead of accepting malformed payloads', () => {
    expect(() => parseJobberSyncOperation({ ...rawOperation, status: 'send_again', steps: [] }))
      .toThrow('Invalid Jobber sync operation data')
    expect(() => parseJobberSyncOperation({ ...rawOperation, steps: [], claim_token: 'not-a-uuid' }))
      .toThrow('Invalid Jobber sync operation data')
  })

  it('reads the exact operation and journal with explicitly permitted columns', async () => {
    const operationBuilder = {
      select: vi.fn(), eq: vi.fn(), single: vi.fn(),
    }
    operationBuilder.select.mockReturnValue(operationBuilder)
    operationBuilder.eq.mockReturnValue(operationBuilder)
    operationBuilder.single.mockResolvedValue({ data: rawOperation, error: null })
    const stepBuilder = {
      select: vi.fn(), eq: vi.fn(), order: vi.fn(),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
    }
    stepBuilder.select.mockReturnValue(stepBuilder)
    stepBuilder.eq.mockReturnValue(stepBuilder)
    stepBuilder.order.mockReturnValue(stepBuilder)
    const client = {
      from: vi.fn((table: string) => table === 'jobber_sync_operations' ? operationBuilder : stepBuilder),
      rpc: vi.fn(),
    }

    const result = await createJobberSyncStore(client as never).read(operationId)

    expect(result.id).toBe(operationId)
    expect(operationBuilder.select).toHaveBeenCalledWith(expect.not.stringContaining('*'))
    expect(operationBuilder.select).toHaveBeenCalledWith(expect.not.stringContaining('claim_token'))
    expect(operationBuilder.eq).toHaveBeenCalledWith('id', operationId)
    expect(stepBuilder.select).toHaveBeenCalledWith(expect.not.stringContaining('*'))
    expect(stepBuilder.eq).toHaveBeenCalledWith('operation_id', operationId)
  })

  it('requires a validated claim token and forwards allowlisted journal payloads to RPCs', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'claim_jobber_sync_operation'
        ? { claimed: true, operation: { ...rawOperation, status: 'running', claim_token: claimToken, steps: [] } }
        : null,
      error: null,
    }))
    const store = createJobberSyncStore({ rpc } as never)

    await expect(store.claim(operationId)).resolves.toMatchObject({
      claimed: true,
      operation: { id: operationId, claim_token: claimToken },
    })
    await store.begin(operationId, claimToken, {
      key: 'delete:0', kind: 'delete', request: { lineItems: [], lineItemIds: ['deleted-1'] },
    })
    await store.complete(operationId, claimToken, 'delete:0', { deletedLineItemIds: ['deleted-1'] })

    expect(rpc).toHaveBeenCalledWith('begin_jobber_sync_step', {
      operation_id: operationId,
      claim_token: claimToken,
      step_key: 'delete:0',
      step_kind: 'delete',
      request_payload: { lineItems: [], lineItemIds: ['deleted-1'] },
    })
    expect(rpc).toHaveBeenCalledWith('complete_jobber_sync_step', expect.objectContaining({
      operation_id: operationId,
      result_payload: { deletedLineItemIds: ['deleted-1'] },
    }))
  })
})
