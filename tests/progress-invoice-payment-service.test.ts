import { describe, expect, it, vi } from 'vitest'

import {
  ProgressInvoiceRepository,
  type ProgressInvoiceRpcExecutor,
} from '@/lib/progress-invoices/repository'
import {
  createManualProgressPaymentSchema,
  reviseManualProgressPaymentSchema,
} from '@/lib/progress-invoices/validators'

const SERIES_ID = '11111111-1111-4111-8111-111111111111'
const PAYMENT_ID = '22222222-2222-4222-8222-222222222222'
const KEY = '33333333-3333-4333-8333-333333333333'

describe('progress payment command contract', () => {
  it('requires the expected Series version and preserves an exact decimal string', () => {
    const result = createManualProgressPaymentSchema.safeParse({
      seriesId: SERIES_ID,
      expectedSeriesVersion: 7,
      receivedDate: '2026-07-20',
      amount: '1000.10',
      method: 'EFT',
      reference: null,
      correlationKey: KEY,
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.amount).toBe('1000.10')
  })

  it('names replacement explicitly and requires a reason', () => {
    expect(reviseManualProgressPaymentSchema.safeParse({
      paymentId: PAYMENT_ID,
      expectedVersion: 2,
      receivedDate: '2026-07-20',
      amount: '1200.00',
      method: 'EFT',
      reference: null,
      reason: '',
      correlationKey: KEY,
    }).success).toBe(false)
  })

  it('sends the exact create RPC envelope and parses a payment stale-current DTO', async () => {
    const execute = vi.fn().mockResolvedValue({
      data: [{
        id: PAYMENT_ID,
        series_id: SERIES_ID,
        series_version: 8,
        version: 1,
        revision_id: '44444444-4444-4444-8444-444444444444',
        conflict: false,
        current: null,
      }],
      error: null,
    })
    const repository = new ProgressInvoiceRepository({ execute } as ProgressInvoiceRpcExecutor)
    const payload = {
      series_id: SERIES_ID,
      expected_series_version: 7,
      received_date: '2026-07-20',
      amount: '1000.10',
      method: 'EFT',
      reference: null,
      correlation_key: KEY,
    }

    const result = await repository.call('create_manual_progress_payment' as never, payload as never)

    expect(execute).toHaveBeenCalledWith('create_manual_progress_payment', payload)
    expect(result).toEqual({
      ok: true,
      data: {
        id: PAYMENT_ID,
        series_id: SERIES_ID,
        series_version: 8,
        version: 1,
        revision_id: '44444444-4444-4444-8444-444444444444',
      },
    })
  })

  it('maps a cross-Series match rejection to the exact safe domain error', async () => {
    const execute = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'PROGRESS_PAYMENT_MATCH_PARENT_MISMATCH' },
    })
    const repository = new ProgressInvoiceRepository({ execute } as ProgressInvoiceRpcExecutor)

    await expect(repository.call('reconcile_progress_payment', {
      jobber_payment_id: PAYMENT_ID,
      manual_payment_id: '44444444-4444-4444-8444-444444444444',
      jobber_expected_version: 1,
      manual_expected_version: 1,
      reason: 'Same receipt',
      correlation_key: KEY,
    })).resolves.toEqual({
      ok: false,
      code: 'VALIDATION',
      error: 'PROGRESS_PAYMENT_MATCH_PARENT_MISMATCH',
    })
  })
})
