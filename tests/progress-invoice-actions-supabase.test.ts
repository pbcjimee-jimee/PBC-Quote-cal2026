import { beforeEach, describe, expect, it, vi } from 'vitest'

const serverMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: serverMocks.createClient,
}))

import {
  createProgressInvoiceRepository,
  type CreateProgressInvoiceSeriesPayload,
  type ProgressInvoiceRpcExecutor,
} from '@/lib/progress-invoices/repository'

const SERIES_ID = '11111111-1111-4111-8111-111111111111'
const QUOTE_ID = '22222222-2222-4222-8222-222222222222'
const CORRELATION_KEY = '33333333-3333-4333-8333-333333333333'

const createPayload: CreateProgressInvoiceSeriesPayload = {
  source_type: 'pbc_quote',
  quote_id: QUOTE_ID,
  base_contract_ex_gst: '1000.00',
  gst_rate: '0.10',
  recipient_name: 'Example Builder',
  recipient_company: 'Example Builder Pty Ltd',
  recipient_address: '1 Billing Street',
  recipient_email: 'accounts@example.test',
  recipient_phone: '0400000000',
  recipient_abn: '12345678901',
  site_name: 'Example Site',
  site_address: '2 Site Street',
  default_description: 'Painting works',
  reference: 'JOB-1',
  correlation_key: CORRELATION_KEY,
}

function executorReturning(
  response: Awaited<ReturnType<ProgressInvoiceRpcExecutor['execute']>>
): ProgressInvoiceRpcExecutor {
  return { execute: vi.fn().mockResolvedValue(response) }
}

describe('Progress Invoice authenticated RPC repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the request-authenticated client for create-series RPCs', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: SERIES_ID, version: 1 }],
      error: null,
    })
    serverMocks.createClient.mockResolvedValue({ rpc })

    const repository = await createProgressInvoiceRepository()
    const result = await repository.call('create_progress_invoice_series', createPayload)

    expect(serverMocks.createClient).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('create_progress_invoice_series', {
      payload: createPayload,
    })
    expect(result).toEqual({ ok: true, data: { id: SERIES_ID, version: 1 } })
  })

  it('returns the exact retry result and rejects a reused idempotency key safely', async () => {
    const retryExecutor = executorReturning({
      data: [{ id: SERIES_ID, version: 1 }],
      error: null,
    })
    const { ProgressInvoiceRepository } = await import('@/lib/progress-invoices/repository')
    const repository = new ProgressInvoiceRepository(retryExecutor)

    expect(await repository.call('create_progress_invoice_series', createPayload)).toEqual({
      ok: true,
      data: { id: SERIES_ID, version: 1 },
    })
    expect(await repository.call('create_progress_invoice_series', createPayload)).toEqual({
      ok: true,
      data: { id: SERIES_ID, version: 1 },
    })

    const reused = new ProgressInvoiceRepository(executorReturning({
      data: null,
      error: { message: 'IDEMPOTENCY_KEY_REUSED', code: 'P0001' },
    }))
    expect(await reused.call('create_progress_invoice_series', {
      ...createPayload,
      base_contract_ex_gst: '1001.00',
    })).toEqual({
      ok: false,
      error: 'IDEMPOTENCY_KEY_REUSED',
      code: 'VALIDATION',
    })
  })

  it('parses Quote prefill amounts only when PostgreSQL serialized them as strings', async () => {
    const { ProgressInvoiceRepository } = await import('@/lib/progress-invoices/repository')
    const valid = new ProgressInvoiceRepository(executorReturning({
      data: {
        quote: {
          id: QUOTE_ID,
          customer_name: 'Exact Builder',
          customer_address: '',
          work_type: '',
          subtotal: '99999999.99',
          final_total: '12345678.91',
        },
      },
      error: null,
    }))
    const numeric = new ProgressInvoiceRepository(executorReturning({
      data: {
        quote: {
          id: QUOTE_ID,
          customer_name: 'Rounded Builder',
          customer_address: '',
          work_type: '',
          subtotal: 99999999.99,
          final_total: 12345678.91,
        },
      },
      error: null,
    }))

    expect(await valid.call('get_progress_invoice_quote_prefill', { quote_id: QUOTE_ID })).toEqual({
      ok: true,
      data: expect.objectContaining({
        quote: expect.objectContaining({ subtotal: '99999999.99', final_total: '12345678.91' }),
      }),
    })
    expect(await numeric.call('get_progress_invoice_quote_prefill', { quote_id: QUOTE_ID })).toEqual({
      ok: false,
      error: 'PROGRESS_RESPONSE_INVALID',
    })
  })

  it('returns a stale series current DTO instead of leaking database detail', async () => {
    const current = {
      id: SERIES_ID,
      source_type: 'pbc_quote',
      quote_id: QUOTE_ID,
      version: 2,
      base_contract_ex_gst: '1000.00',
      gst_rate: '0.10',
      recipient_name: 'Current Builder',
      recipient_company: '',
      recipient_address: '1 Billing Street',
      recipient_email: '',
      recipient_phone: '',
      recipient_abn: '',
      site_name: 'Example Site',
      site_address: '2 Site Street',
      default_description: 'Painting works',
      reference: '',
      status: 'draft',
      accepted_numbering_base: null,
      jobber_link_locked_at: null,
      current_adjusted_contract_ex_gst: '1000.00',
      current_adjusted_contract_gst: '100.00',
      current_adjusted_contract_inc_gst: '1100.00',
      current_claimed_ex_gst: '0.00',
      current_claimed_gst: '0.00',
      current_claimed_inc_gst: '0.00',
      current_unclaimed_ex_gst: '1000.00',
      current_unclaimed_gst: '100.00',
      current_unclaimed_inc_gst: '1100.00',
      current_cumulative_percentage: '0.000000',
    }
    const repository = (await import('@/lib/progress-invoices/repository')).ProgressInvoiceRepository
    const instance = new repository(executorReturning({
      data: [{ conflict: true, current }],
      error: null,
    }))

    const result = await instance.call('update_progress_invoice_series', {
      series_id: SERIES_ID,
      expected_version: 1,
      recipient_name: 'Stale Builder',
      correlation_key: CORRELATION_KEY,
    })

    expect(result).toEqual({
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
      current: expect.objectContaining({ id: SERIES_ID, version: 2 }),
    })
  })

  it('returns a stale adjustment current DTO from versioned adjustment RPCs', async () => {
    const { ProgressInvoiceRepository } = await import('@/lib/progress-invoices/repository')
    const current = {
      id: '44444444-4444-4444-8444-444444444444',
      series_id: SERIES_ID,
      type: 'credit',
      status: 'draft',
      effective_date: '2026-07-16',
      display_order: 2,
      description: 'Current credit',
      amount_ex_gst: '50.00',
      gst_rate: '0.10',
      superseded_adjustment_id: null,
      reason: null,
      quote_item_id: null,
      version: 2,
    }
    const repository = new ProgressInvoiceRepository(executorReturning({
      data: [{
        id: current.id,
        series_id: SERIES_ID,
        version: 2,
        replacement_id: null,
        conflict: true,
        current,
      }],
      error: null,
    }))

    expect(await repository.call('approve_progress_adjustment', {
      adjustment_id: current.id,
      expected_version: 1,
      correlation_key: CORRELATION_KEY,
    })).toEqual({
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
      current,
    })
  })
})
