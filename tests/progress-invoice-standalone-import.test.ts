import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  fetchJobberInvoiceObservation: vi.fn(),
  classifyJobberInvoiceError: vi.fn(),
  buildProgressJobberObservationPayload: vi.fn(),
  createProgressInvoiceRepository: vi.fn(),
  createProgressInvoiceJobberPersistenceRepository: vi.fn(),
  authenticatedCall: vi.fn(),
  persistenceCall: vi.fn(),
}))

vi.mock('@/lib/jobber/invoice-gateway', () => ({
  fetchJobberInvoiceObservation: mocks.fetchJobberInvoiceObservation,
  classifyJobberInvoiceError: mocks.classifyJobberInvoiceError,
}))

vi.mock('@/lib/progress-invoices/jobber-refresh-service', () => ({
  buildProgressJobberObservationPayload: mocks.buildProgressJobberObservationPayload,
}))

vi.mock('@/lib/progress-invoices/repository', () => ({
  createProgressInvoiceRepository: mocks.createProgressInvoiceRepository,
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
  invoice_number: '2906',
  fetched_at: '2026-07-17T00:00:00Z',
  response_fingerprint: 'b'.repeat(64),
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.fetchJobberInvoiceObservation.mockResolvedValue({ invoiceId: 'invoice-1' })
  mocks.buildProgressJobberObservationPayload.mockReturnValue(normalized)
  mocks.authenticatedCall.mockResolvedValue({
    ok: true,
    data: { items: [], page: 1, page_size: 100, total: 0 },
  })
  mocks.createProgressInvoiceRepository.mockResolvedValue({
    call: mocks.authenticatedCall,
  })
  mocks.createProgressInvoiceJobberPersistenceRepository.mockResolvedValue({
    call: mocks.persistenceCall,
  })
  mocks.persistenceCall.mockResolvedValue({
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
    expect(mocks.authenticatedCall).toHaveBeenCalledWith('list_progress_invoice_series', {
      query: '2906',
      statuses: ['draft', 'active', 'completed', 'reconciliation_required'],
      page: 1,
      page_size: 100,
      quote_id: null,
    })
    expect(mocks.persistenceCall).toHaveBeenCalledWith('create_progress_invoice_series_from_jobber', {
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
        series_id: 'series-1',
        version: 1,
        snapshot_id: 'snapshot-1',
        imported_payments: 3,
      },
    })
  })

  it('returns a safe duplicate failure when authenticated RPC lookup finds the exact identity', async () => {
    mocks.authenticatedCall
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [{ id: 'existing-series', version: 4 }],
          page: 1,
          page_size: 100,
          total: 1,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          series_id: 'existing-series',
          series_version: 4,
          jobber_account_id: 'account-1',
          jobber_invoice_id: 'invoice-1',
          selected_jobber_job_id: 'job-1',
          selected_jobber_property_id: 'property-1',
          current_snapshot_id: 'snapshot-1',
        },
      })

    const result = await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)

    expect(mocks.authenticatedCall).toHaveBeenNthCalledWith(
      2,
      'get_progress_invoice_jobber_context',
      { series_id: 'existing-series' },
    )
    expect(mocks.persistenceCall).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: 'PROGRESS_JOBBER_ALREADY_IMPORTED',
      code: 'VALIDATION',
      current: { series_id: 'existing-series', version: 4 },
    })
  })

  it('paginates authenticated candidates and only accepts an exact Jobber identity', async () => {
    mocks.authenticatedCall
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [{ id: 'wrong-series', version: 2 }],
          page: 1,
          page_size: 100,
          total: 101,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          series_id: 'wrong-series',
          series_version: 2,
          jobber_account_id: 'other-account',
          jobber_invoice_id: 'invoice-1',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [{ id: 'existing-series', version: 4 }],
          page: 2,
          page_size: 100,
          total: 101,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          series_id: 'existing-series',
          series_version: 4,
          jobber_account_id: 'account-1',
          jobber_invoice_id: 'invoice-1',
        },
      })

    const result = await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)

    expect(mocks.authenticatedCall).toHaveBeenCalledWith(
      'list_progress_invoice_series',
      expect.objectContaining({ page: 2, page_size: 100 }),
    )
    expect(result).toMatchObject({
      ok: false,
      error: 'PROGRESS_JOBBER_ALREADY_IMPORTED',
      current: { series_id: 'existing-series', version: 4 },
    })
  })

  it('falls back to full pagination and skips candidate ids already checked by targeted search', async () => {
    mocks.authenticatedCall
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [{ id: 'targeted-series', version: 2 }],
          page: 1,
          page_size: 100,
          total: 1,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          series_id: 'targeted-series',
          series_version: 2,
          jobber_account_id: 'account-1',
          jobber_invoice_id: 'different-invoice',
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [
            { id: 'targeted-series', version: 2 },
            { id: 'exact-series', version: 5 },
          ],
          page: 1,
          page_size: 100,
          total: 2,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          series_id: 'exact-series',
          series_version: 5,
          jobber_account_id: 'account-1',
          jobber_invoice_id: 'invoice-1',
        },
      })

    const result = await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)

    expect(mocks.authenticatedCall).toHaveBeenCalledWith(
      'list_progress_invoice_series',
      expect.objectContaining({ query: '' }),
    )
    expect(mocks.authenticatedCall.mock.calls.filter((call) => (
      call[0] === 'get_progress_invoice_jobber_context'
      && call[1]?.series_id === 'targeted-series'
    ))).toHaveLength(1)
    expect(result).toEqual({
      ok: false,
      error: 'PROGRESS_JOBBER_ALREADY_IMPORTED',
      code: 'VALIDATION',
      current: { series_id: 'exact-series', version: 5 },
    })
  })

  it('skips an unlinked candidate and continues to an exact identity', async () => {
    mocks.authenticatedCall
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [
            { id: 'manual-series', version: 1 },
            { id: 'exact-series', version: 3 },
          ],
          page: 1,
          page_size: 100,
          total: 2,
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: 'PROGRESS_JOBBER_ERROR',
        code: 'JOBBER_ERROR',
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          series_id: 'exact-series',
          series_version: 3,
          jobber_account_id: 'account-1',
          jobber_invoice_id: 'invoice-1',
        },
      })

    expect(await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)).toEqual({
      ok: false,
      error: 'PROGRESS_JOBBER_ALREADY_IMPORTED',
      code: 'VALIDATION',
      current: { series_id: 'exact-series', version: 3 },
    })
    expect(mocks.persistenceCall).not.toHaveBeenCalled()
  })

  it('treats a non-Jobber context failure as unavailable and falls through to atomic create', async () => {
    mocks.authenticatedCall
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [{ id: 'candidate-series', version: 1 }],
          page: 1,
          page_size: 100,
          total: 1,
        },
      })
      .mockResolvedValueOnce({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })

    const result = await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)

    expect(mocks.persistenceCall).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ ok: true, data: { series_id: 'series-1' } })
  })

  it('converts a create JOBBER_ERROR only when postflight finds the exact identity', async () => {
    mocks.authenticatedCall
      .mockResolvedValueOnce({
        ok: true,
        data: { items: [], page: 1, page_size: 100, total: 0 },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { items: [], page: 1, page_size: 100, total: 0 },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [{ id: 'concurrent-series', version: 1 }],
          page: 1,
          page_size: 100,
          total: 1,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          series_id: 'concurrent-series',
          series_version: 1,
          jobber_account_id: 'account-1',
          jobber_invoice_id: 'invoice-1',
        },
      })
    mocks.persistenceCall.mockResolvedValueOnce({
      ok: false,
      error: 'PROGRESS_JOBBER_ERROR',
      code: 'JOBBER_ERROR',
    })

    expect(await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)).toEqual({
      ok: false,
      error: 'PROGRESS_JOBBER_ALREADY_IMPORTED',
      code: 'VALIDATION',
      current: { series_id: 'concurrent-series', version: 1 },
    })
  })

  it('falls through to atomic create when authenticated lookup fails', async () => {
    mocks.authenticatedCall.mockResolvedValueOnce({
      ok: false,
      error: 'PROGRESS_REQUEST_FAILED',
    })

    const result = await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)

    expect(mocks.persistenceCall).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ ok: true, data: { series_id: 'series-1' } })
  })

  it('preserves an atomic create JOBBER_ERROR without reinterpreting it', async () => {
    mocks.authenticatedCall.mockResolvedValue({
      ok: true,
      data: { items: [], page: 1, page_size: 100, total: 0 },
    })
    mocks.persistenceCall.mockResolvedValueOnce({
      ok: false,
      error: 'PROGRESS_JOBBER_ERROR',
      code: 'JOBBER_ERROR',
    })

    const result = await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)

    expect(mocks.authenticatedCall).toHaveBeenCalledTimes(4)
    expect(result).toEqual({
      ok: false,
      error: 'PROGRESS_JOBBER_ERROR',
      code: 'JOBBER_ERROR',
    })
  })

  it('does not include volatile observation bytes in the request fingerprint', async () => {
    await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)
    const first = mocks.persistenceCall.mock.calls[0]?.[1].request_fingerprint
    mocks.buildProgressJobberObservationPayload.mockReturnValue({
      ...normalized,
      fetched_at: '2026-07-18T00:00:00Z',
      response_fingerprint: 'c'.repeat(64),
    })
    await createStandaloneProgressInvoiceFromJobberService(input, ACTOR_ID)
    expect(mocks.persistenceCall.mock.calls[1]?.[1].request_fingerprint).toBe(first)
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
