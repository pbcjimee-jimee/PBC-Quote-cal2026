import { describe, expect, it, vi } from 'vitest'

import {
  ProgressInvoiceRepository,
  type ProgressInvoiceRpcExecutor,
} from '@/lib/progress-invoices/repository'

const ADJUSTMENT_ID = '11111111-1111-4111-8111-111111111111'
const SERIES_ID = '22222222-2222-4222-8222-222222222222'
const KEY = '33333333-3333-4333-8333-333333333333'

describe('progress adjustment rejection contract', () => {
  it('uses the exact reject RPC envelope and returns the terminal version', async () => {
    const execute = vi.fn().mockResolvedValue({
      data: [{
        id: ADJUSTMENT_ID,
        series_id: SERIES_ID,
        quote_id: null,
        version: 2,
        replacement_id: null,
        conflict: false,
        current: null,
      }],
      error: null,
    })
    const repository = new ProgressInvoiceRepository({ execute } as ProgressInvoiceRpcExecutor)
    const payload = {
      adjustment_id: ADJUSTMENT_ID,
      expected_version: 1,
      reason: 'Entered in error',
      correlation_key: KEY,
    }

    const result = await repository.call('reject_progress_adjustment' as never, payload as never)

    expect(execute).toHaveBeenCalledWith('reject_progress_adjustment', payload)
    expect(result).toEqual({
      ok: true,
      data: {
        id: ADJUSTMENT_ID,
        series_id: SERIES_ID,
        quote_id: null,
        version: 2,
      },
    })
  })

  it('maps atomic over-claimed Credit rollback to reconciliation-required', async () => {
    const repository = new ProgressInvoiceRepository({
      execute: async () => ({
        data: null,
        error: { message: 'PROGRESS_RECONCILIATION_REQUIRED', code: 'P0001' },
      }),
    })

    expect(await repository.call('approve_progress_adjustment', {
      adjustment_id: ADJUSTMENT_ID,
      expected_version: 1,
      correlation_key: KEY,
    })).toEqual({
      ok: false,
      error: 'PROGRESS_RECONCILIATION_REQUIRED',
      code: 'RECONCILIATION_REQUIRED',
    })
  })
})
