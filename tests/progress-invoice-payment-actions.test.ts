import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAllowedUser: vi.fn(),
  create: vi.fn(),
  replace: vi.fn(),
  voidPayment: vi.fn(),
  reconcile: vi.fn(),
  undo: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/security/require-allowed-user', () => ({ requireAllowedUser: mocks.requireAllowedUser }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/progress-invoices/payment-service', () => ({
  createManualProgressPayment: mocks.create,
  replaceManualProgressPayment: mocks.replace,
  voidManualProgressPayment: mocks.voidPayment,
  reconcileProgressPayment: mocks.reconcile,
  undoProgressPaymentReconciliation: mocks.undo,
}))

import {
  createManualProgressPayment,
  replaceManualProgressPayment,
} from '@/lib/actions/progress-invoice-payments'

const SERIES_ID = '11111111-1111-4111-8111-111111111111'
const PAYMENT_ID = '22222222-2222-4222-8222-222222222222'
const KEY = '33333333-3333-4333-8333-333333333333'

const input = {
  seriesId: SERIES_ID, expectedSeriesVersion: 4, receivedDate: '2026-07-20',
  amount: '1000.10', method: 'EFT', reference: null, correlationKey: KEY,
}

describe('progress payment Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAllowedUser.mockResolvedValue({ ok: true, data: { id: 'actor' } })
  })

  it('validates before auth and data access', async () => {
    expect(await createManualProgressPayment({ ...input, amount: 10, retention: '1.00' })).toEqual({
      ok: false, error: 'PROGRESS_VALIDATION_FAILED', code: 'VALIDATION',
    })
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('requires an allowed user before repository-backed service access', async () => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: false, error: 'FORBIDDEN', code: 'FORBIDDEN' })
    expect(await createManualProgressPayment(input)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('preserves exact decimals and revalidates dashboard/detail only after success', async () => {
    mocks.create.mockResolvedValue({
      ok: true,
      data: { id: PAYMENT_ID, seriesId: SERIES_ID, seriesVersion: 5, version: 1, revisionId: KEY },
    })
    expect(await createManualProgressPayment(input)).toEqual({
      ok: true, data: { id: PAYMENT_ID, version: 1 },
    })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ amount: '1000.10' }))
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/progress-invoices'], [`/progress-invoices/${SERIES_ID}`],
    ])
  })

  it('requires replacement reasons and never revalidates on failure', async () => {
    expect(await replaceManualProgressPayment({
      paymentId: PAYMENT_ID, expectedVersion: 1, receivedDate: '2026-07-20', amount: '1.00',
      method: 'EFT', reference: null, reason: '', correlationKey: KEY,
    })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()

    mocks.replace.mockResolvedValue({ ok: false, error: 'PROGRESS_VERSION_CONFLICT', code: 'VERSION_CONFLICT' })
    expect(await replaceManualProgressPayment({
      paymentId: PAYMENT_ID, expectedVersion: 1, receivedDate: '2026-07-20', amount: '1.00',
      method: 'EFT', reference: null, reason: 'Correct amount', correlationKey: KEY,
    })).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
