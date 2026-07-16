import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  fetchJobberInvoiceObservation: vi.fn(),
  classifyJobberInvoiceError: vi.fn(),
  buildProgressJobberObservationPayload: vi.fn(),
  createProgressInvoiceJobberPersistenceRepository: vi.fn(),
  call: vi.fn(),
}))

vi.mock('@/lib/jobber/invoice-gateway', () => ({
  fetchJobberInvoiceObservation: mocks.fetchJobberInvoiceObservation,
  classifyJobberInvoiceError: mocks.classifyJobberInvoiceError,
}))

vi.mock('@/lib/progress-invoices/jobber-refresh-service', () => ({
  buildProgressJobberObservationPayload: mocks.buildProgressJobberObservationPayload,
}))

vi.mock('@/lib/progress-invoices/repository', () => ({
  createProgressInvoiceJobberPersistenceRepository:
    mocks.createProgressInvoiceJobberPersistenceRepository,
}))

import { createStandaloneProgressInvoiceFromJobberService } from '@/lib/progress-invoices/standalone-import-service'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const CORRELATION_KEY = '22222222-2222-4222-8222-222222222222'
const input = {
  selectedJobberInvoiceId: 'invoice-1',
  selectedJobberJobId: 'job-1',
  selectedJobberPropertyId: 'property-1',
  baseContractExGst: '17220.50',
  gstRate: '0.10' as const,
  recipientName: 'Edited Builder',
  recipientCompany: null,
  recipientAddress: 'Edited billing address',
  recipientEmail: null,
  recipientPhone: null,
  recipientAbn: null,
  siteName: 'Edited site',
  siteAddress: 'Edited site address',
  defaultDescription: 'Progress painting works',
  reference: 'Jobber 2906',
  correlationKey: CORRELATION_KEY,
}
const normalized = {
  account_id: 'account-1',
  invoice_id: 'invoice-1',
  fetched_at: '2026-07-17T00:00:00Z',
  response_fingerprint: 'b'.repeat(64),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchJobberInvoiceObservation.mockResolvedValue({ invoiceId: 'invoice-1' })
  mocks.buildProgressJobberObservationPayload.mockReturnValue(normalized)
  mocks.createProgressInvoiceJobberPersistenceRepository.mockResolvedValue({ call: mocks.call })
  mocks.call.mockResolvedValue({
    ok: true,
    data: {
      series_id: 'series-1', version: 1, snapshot_id: 'snapshot-1', imported_payments: 3,
    },
  })
  mocks.classifyJobberInvoiceError.mockReturnValue({ code: 'JOBBER_TEMPORARY_FAILURE' })
})

describe('standalone Progress Invoice Jobber import service', () => {
  it('fetches a complete Save-time observation and sends one atomic command', async () => {
    const result = await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)

    expect(mocks.fetchJobberInvoiceObservation).toHaveBeenCalledWith({
      jobberInvoiceId: 'invoice-1',
      selectedJobberJobId: 'job-1',
      selectedJobberPropertyId: 'property-1',
    })
    const fingerprintInput = {
      selectedJobberInvoiceId: 'invoice-1',
      selectedJobberJobId: 'job-1',
      selectedJobberPropertyId: 'property-1',
      baseContractExGst: '17220.50',
      gstRate: '0.10',
      recipientName: 'Edited Builder',
      recipientCompany: null,
      recipientAddress: 'Edited billing address',
      recipientEmail: null,
      recipientPhone: null,
      recipientAbn: null,
      siteName: 'Edited site',
      siteAddress: 'Edited site address',
      defaultDescription: 'Progress painting works',
      reference: 'Jobber 2906',
      correlationKey: CORRELATION_KEY,
    }
    expect(mocks.call).toHaveBeenCalledWith('create_progress_invoice_series_from_jobber', {
      actor_id: ACTOR_ID,
      correlation_key: CORRELATION_KEY,
      request_fingerprint: createHash('sha256')
        .update(JSON.stringify(fingerprintInput))
        .digest('hex'),
      series: {
        source_type: 'jobber_invoice',
        quote_id: null,
        base_contract_ex_gst: '17220.50',
        gst_rate: '0.10',
        recipient_name: 'Edited Builder',
        recipient_company: null,
        recipient_address: 'Edited billing address',
        recipient_email: null,
        recipient_phone: null,
        recipient_abn: null,
        site_name: 'Edited site',
        site_address: 'Edited site address',
        default_description: 'Progress painting works',
        reference: 'Jobber 2906',
        correlation_key: CORRELATION_KEY,
      },
      observation: normalized,
    })
    expect(result).toEqual({
      ok: true,
      data: {
        series_id: 'series-1', version: 1, snapshot_id: 'snapshot-1', imported_payments: 3,
      },
    })
  })

  it('does not include volatile observation bytes in the request fingerprint', async () => {
    await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)
    const first = mocks.call.mock.calls[0]?.[1].request_fingerprint
    mocks.buildProgressJobberObservationPayload.mockReturnValue({
      ...normalized,
      fetched_at: '2026-07-18T00:00:00Z',
      response_fingerprint: 'c'.repeat(64),
    })
    await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)
    expect(mocks.call.mock.calls[1]?.[1].request_fingerprint).toBe(first)
  })

  it('maps gateway errors safely and repository exceptions generically', async () => {
    mocks.fetchJobberInvoiceObservation.mockRejectedValueOnce(new Error('raw PII'))
    expect(await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)).toEqual({
      ok: false,
      error: 'JOBBER_TEMPORARY_FAILURE',
      code: 'JOBBER_ERROR',
    })
    expect(mocks.createProgressInvoiceJobberPersistenceRepository).not.toHaveBeenCalled()

    mocks.createProgressInvoiceJobberPersistenceRepository.mockRejectedValueOnce(
      new Error('database detail'),
    )
    expect(await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)).toEqual({
      ok: false,
      error: 'PROGRESS_REQUEST_FAILED',
    })
  })
})
