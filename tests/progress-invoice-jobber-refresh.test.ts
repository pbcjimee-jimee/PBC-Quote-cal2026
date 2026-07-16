import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  requireAllowedUser: vi.fn(),
  revalidatePath: vi.fn(),
  createProgressInvoiceRepository: vi.fn(),
  createProgressInvoiceJobberPersistenceRepository: vi.fn(),
  authenticatedCall: vi.fn(),
  persistenceCall: vi.fn(),
  fetchJobberInvoiceObservation: vi.fn(),
  classifyJobberInvoiceError: vi.fn(),
}))

vi.mock('@/lib/security/require-allowed-user', () => ({
  requireAllowedUser: mocks.requireAllowedUser,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('@/lib/progress-invoices/repository', () => ({
  createProgressInvoiceRepository: mocks.createProgressInvoiceRepository,
  createProgressInvoiceJobberPersistenceRepository:
    mocks.createProgressInvoiceJobberPersistenceRepository,
}))
vi.mock('@/lib/jobber/invoice-gateway', () => ({
  fetchJobberInvoiceObservation: mocks.fetchJobberInvoiceObservation,
  classifyJobberInvoiceError: mocks.classifyJobberInvoiceError,
}))

import {
  buildProgressJobberObservationPayload,
  toSydneyCalendarDate,
} from '@/lib/progress-invoices/jobber-refresh-service'
import {
  acceptObservedJobberInvoiceNumber,
  linkJobberInvoice,
  refreshJobberInvoice,
} from '@/lib/actions/progress-invoice-jobber'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const SERIES_ID = '22222222-2222-4222-8222-222222222222'
const SNAPSHOT_ID = '33333333-3333-4333-8333-333333333333'
const KEY = '44444444-4444-4444-8444-444444444444'
const QUOTE_ID = '55555555-5555-4555-8555-555555555555'

const observation = {
  accountId: 'account-1',
  invoiceId: 'invoice-1',
  invoiceNumber: 'INV-100',
  rawStatus: 'AWAITING_PAYMENT',
  normalizedStatus: 'awaiting_payment',
  jobberWebUri: 'https://secure.getjobber.com/invoices/invoice-1',
  amounts: {
    subtotal: '1000.00', taxAmount: '100.00', total: '1100.00',
    invoiceBalance: '825.00', paymentsTotal: '275.00',
  },
  issuedDate: '2026-01-01T13:30:00Z',
  dueDate: '2026-01-15',
  receivedDate: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  client: {
    id: 'client-1',
    name: 'Example Builder',
    companyName: 'Example Builder Pty Ltd',
    emails: ['Accounts@Example.test', 'accounts@example.test'],
    phones: [
      { number: '0400000000', primary: true },
      { number: '0299999999', primary: false },
      { number: '0299999999', primary: false },
    ],
  },
  billingAddress: {
    street1: '1 Billing Street', street2: null, city: 'Sydney',
    province: 'NSW', postalCode: '2000', country: 'Australia',
  },
  jobs: [{ id: 'job-1' }, { id: 'job-2' }],
  properties: [
    {
      id: 'property-1',
      address: {
        street1: '4 Curra Close', street2: null, city: 'Frenchs Forest',
        province: 'NSW', postalCode: '2086', country: 'Australia',
      },
    },
    { id: 'property-2', address: null },
  ],
  selectedJobberJobId: 'job-2',
  selectedJobberPropertyId: 'property-1',
  payments: [{
    id: 'payment-1', source: 'payment_record', rawAdjustmentType: 'PAYMENT',
    rawSignedAmount: '275.00', absoluteAmount: '275.00', direction: 'receipt',
    effectiveReceiptAmount: '275.00', entryDate: '2026-01-02', method: null,
    reference: null, externalStatus: 'SUCCEEDED', externalUpdatedAt: null,
    treatment: 'active',
  }],
  effectiveGraphqlVersion: '2025-04-16',
  paymentEligibilityPolicyVersion: '2026-07-v1',
  warnings: [],
  fetchedAt: '2026-01-02T01:00:00Z',
  responseFingerprint: 'a'.repeat(64),
} as const

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAllowedUser.mockResolvedValue({
    ok: true,
    user: { id: ACTOR_ID, email: 'owner@example.test' },
  })
  mocks.createProgressInvoiceRepository.mockResolvedValue({ call: mocks.authenticatedCall })
  mocks.createProgressInvoiceJobberPersistenceRepository.mockReturnValue({
    call: mocks.persistenceCall,
  })
  mocks.fetchJobberInvoiceObservation.mockResolvedValue(observation)
  mocks.classifyJobberInvoiceError.mockReturnValue({
    code: 'JOBBER_TEMPORARY_FAILURE', status: 503, message: 'Jobber is temporarily unavailable',
  })
})

describe('Progress Invoice Jobber normalized persistence payload', () => {
  it('converts offset timestamps to Sydney dates and preserves calendar dates', () => {
    expect(toSydneyCalendarDate('2026-01-01')).toBe('2026-01-01')
    expect(toSydneyCalendarDate('2026-01-01T13:30:00Z')).toBe('2026-01-02')
    expect(toSydneyCalendarDate('2026-07-01T14:30:00Z')).toBe('2026-07-02')
    expect(() => toSydneyCalendarDate('2026-07-01T14:30:00')).toThrow('PROGRESS_JOBBER_ERROR')
  })

  it('preserves every candidate and chooses contacts only by deterministic uniqueness rules', () => {
    const payload = buildProgressJobberObservationPayload(observation)

    expect(payload).toMatchObject({
      account_id: 'account-1',
      invoice_id: 'invoice-1',
      invoice_payments_total: '275.00',
      invoice_issued_date: '2026-01-02',
      client_email: 'Accounts@Example.test',
      client_phone: '0400000000',
      selected_job_id: 'job-2',
      selected_property_id: 'property-1',
      payment_eligibility_policy_version: '2026-07-v1',
    })
    expect(payload.client_email_candidates).toEqual(['Accounts@Example.test'])
    expect(payload.client_phone_candidates).toEqual([
      { number: '0400000000', primary: true },
      { number: '0299999999', primary: false },
    ])
    expect(payload.job_ids).toEqual(['job-1', 'job-2'])
    expect(payload.property_ids).toEqual(['property-1', 'property-2'])
    expect(payload.site_address_candidates).toHaveLength(2)
    expect(payload.payments[0]).toMatchObject({
      jobber_payment_id: 'payment-1', method: null, reference: null,
      effective_amount: '275.00', treatment: 'active',
    })
  })

  it('does not choose candidate zero when contact evidence is ambiguous', () => {
    const payload = buildProgressJobberObservationPayload({
      ...observation,
      client: {
        ...observation.client,
        emails: ['one@example.test', 'two@example.test'],
        phones: [
          { number: '0400000000', primary: true },
          { number: '0411111111', primary: true },
        ],
      },
    })

    expect(payload.client_email).toBeNull()
    expect(payload.client_phone).toBeNull()
  })
})

describe('Progress Invoice Jobber actions and orchestration', () => {
  it('rejects forged authority before authentication or gateway work', async () => {
    const result = await linkJobberInvoice({
      seriesId: SERIES_ID,
      expectedVersion: 1,
      selectedJobberInvoiceId: 'invoice-1',
      accountId: 'forged-account',
      payments: [],
      correlationKey: KEY,
    })

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.fetchJobberInvoiceObservation).not.toHaveBeenCalled()
    expect(mocks.persistenceCall).not.toHaveBeenCalled()
  })

  it('authoritatively refetches link evidence and persists it with the authenticated actor', async () => {
    mocks.persistenceCall.mockResolvedValue({
      ok: true,
      data: { series_id: SERIES_ID, version: 2, quote_id: QUOTE_ID },
    })

    const result = await linkJobberInvoice({
      seriesId: SERIES_ID,
      expectedVersion: 1,
      selectedJobberInvoiceId: 'invoice-1',
      selectedJobberJobId: 'job-2',
      selectedJobberPropertyId: 'property-1',
      correlationKey: KEY,
    })

    expect(result).toEqual({ ok: true, data: { seriesId: SERIES_ID, version: 2 } })
    expect(mocks.fetchJobberInvoiceObservation).toHaveBeenCalledWith({
      jobberInvoiceId: 'invoice-1',
      selectedJobberJobId: 'job-2',
      selectedJobberPropertyId: 'property-1',
    })
    expect(mocks.persistenceCall).toHaveBeenCalledWith(
      'link_progress_jobber_invoice',
      expect.objectContaining({
        actor_id: ACTOR_ID,
        series_id: SERIES_ID,
        expected_version: 1,
        correlation_key: KEY,
        observation: expect.objectContaining({ invoice_id: 'invoice-1' }),
      }),
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/progress-invoices')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/progress-invoices/${SERIES_ID}`)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/quotes/${QUOTE_ID}`)
    expect(result.ok && result.data).not.toHaveProperty('quoteId')
  })

  it('does not misclassify a persistence exception as a Jobber transport failure', async () => {
    mocks.persistenceCall.mockRejectedValue(new Error('database connection detail'))

    const result = await linkJobberInvoice({
      seriesId: SERIES_ID,
      expectedVersion: 1,
      selectedJobberInvoiceId: 'invoice-1',
      selectedJobberJobId: 'job-2',
      selectedJobberPropertyId: 'property-1',
      correlationKey: KEY,
    })

    expect(result).toEqual({ ok: false, error: 'PROGRESS_REQUEST_FAILED' })
    expect(mocks.classifyJobberInvoiceError).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('loads locked context before refresh and applies one complete observation', async () => {
    mocks.authenticatedCall.mockResolvedValue({
      ok: true,
      data: {
        series_id: SERIES_ID,
        series_version: 4,
        jobber_account_id: 'account-1',
        jobber_invoice_id: 'invoice-1',
        selected_jobber_job_id: 'job-2',
        selected_jobber_property_id: 'property-1',
        current_snapshot_id: SNAPSHOT_ID,
      },
    })
    mocks.persistenceCall.mockResolvedValue({
      ok: true,
      data: {
        series_id: SERIES_ID,
        snapshot_id: SNAPSHOT_ID,
        series_version: 5,
        inserted_payments: 1,
        revised_payments: 2,
        unconfirmed_payments: 1,
      },
    })

    const result = await refreshJobberInvoice({
      seriesId: SERIES_ID,
      expectedVersion: 4,
      idempotencyKey: KEY,
    })

    expect(mocks.authenticatedCall).toHaveBeenCalledWith(
      'get_progress_invoice_jobber_context',
      { series_id: SERIES_ID },
    )
    expect(mocks.fetchJobberInvoiceObservation).toHaveBeenCalledWith({
      jobberInvoiceId: 'invoice-1',
      selectedJobberJobId: 'job-2',
      selectedJobberPropertyId: 'property-1',
    })
    expect(result).toEqual({
      ok: true,
      data: {
        seriesId: SERIES_ID,
        snapshotId: SNAPSHOT_ID,
        seriesVersion: 5,
        insertedPayments: 1,
        revisedPayments: 2,
        unconfirmedPayments: 1,
      },
    })
  })

  it('rejects stale refresh versions before gateway or service-role work', async () => {
    mocks.authenticatedCall.mockResolvedValue({
      ok: true,
      data: {
        series_id: SERIES_ID,
        series_version: 5,
        jobber_account_id: 'account-1',
        jobber_invoice_id: 'invoice-1',
        selected_jobber_job_id: null,
        selected_jobber_property_id: null,
        current_snapshot_id: SNAPSHOT_ID,
      },
    })

    const result = await refreshJobberInvoice({
      seriesId: SERIES_ID,
      expectedVersion: 4,
      idempotencyKey: KEY,
    })

    expect(result).toEqual({
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
    })
    expect(mocks.fetchJobberInvoiceObservation).not.toHaveBeenCalled()
    expect(mocks.createProgressInvoiceJobberPersistenceRepository).not.toHaveBeenCalled()
    expect(mocks.persistenceCall).not.toHaveBeenCalled()
  })

  it('records exactly one bounded failure after context load and never applies partial data', async () => {
    mocks.authenticatedCall.mockResolvedValue({
      ok: true,
      data: {
        series_id: SERIES_ID,
        series_version: 4,
        jobber_account_id: 'account-1',
        jobber_invoice_id: 'invoice-1',
        selected_jobber_job_id: null,
        selected_jobber_property_id: null,
        current_snapshot_id: SNAPSHOT_ID,
      },
    })
    mocks.fetchJobberInvoiceObservation.mockRejectedValue(
      new Error('raw cursor, customer PII, payment amount, and access token'),
    )
    mocks.persistenceCall.mockResolvedValue({
      ok: true,
      data: { series_id: SERIES_ID, version: 4 },
    })

    const result = await refreshJobberInvoice({
      seriesId: SERIES_ID,
      expectedVersion: 4,
      idempotencyKey: KEY,
    })

    expect(result).toEqual({
      ok: false,
      error: 'JOBBER_TEMPORARY_FAILURE',
      code: 'JOBBER_ERROR',
    })
    expect(mocks.persistenceCall).toHaveBeenCalledOnce()
    expect(mocks.persistenceCall).toHaveBeenCalledWith(
      'record_progress_jobber_refresh_failure',
      {
        actor_id: ACTOR_ID,
        series_id: SERIES_ID,
        expected_version: 4,
        jobber_account_id: 'account-1',
        jobber_invoice_id: 'invoice-1',
        idempotency_key: KEY,
        error_code: 'JOBBER_TEMPORARY_FAILURE',
      },
    )
    expect(mocks.persistenceCall).not.toHaveBeenCalledWith(
      'apply_progress_invoice_jobber_refresh',
      expect.anything(),
    )
    expect(JSON.stringify(mocks.persistenceCall.mock.calls)).not.toContain('raw cursor')
  })

  it('returns the original safe Jobber error when failure recording itself fails', async () => {
    mocks.authenticatedCall.mockResolvedValue({
      ok: true,
      data: {
        series_id: SERIES_ID,
        series_version: 4,
        jobber_account_id: 'account-1',
        jobber_invoice_id: 'invoice-1',
        selected_jobber_job_id: null,
        selected_jobber_property_id: null,
        current_snapshot_id: SNAPSHOT_ID,
      },
    })
    mocks.fetchJobberInvoiceObservation.mockRejectedValue(new Error('raw upstream failure'))
    mocks.persistenceCall.mockResolvedValue({
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
    })

    const result = await refreshJobberInvoice({
      seriesId: SERIES_ID,
      expectedVersion: 4,
      idempotencyKey: KEY,
    })

    expect(result).toEqual({
      ok: false,
      error: 'JOBBER_TEMPORARY_FAILURE',
      code: 'JOBBER_ERROR',
    })
    expect(mocks.persistenceCall).toHaveBeenCalledOnce()
  })

  it('does not record refresh failure before a linked context is loaded', async () => {
    mocks.authenticatedCall.mockResolvedValue({ ok: false, error: 'PROGRESS_NOT_FOUND', code: 'NOT_FOUND' })

    const result = await refreshJobberInvoice({
      seriesId: SERIES_ID,
      expectedVersion: 4,
      idempotencyKey: KEY,
    })

    expect(result).toEqual({ ok: false, error: 'PROGRESS_NOT_FOUND', code: 'NOT_FOUND' })
    expect(mocks.fetchJobberInvoiceObservation).not.toHaveBeenCalled()
    expect(mocks.persistenceCall).not.toHaveBeenCalled()
  })

  it('accepts a series-owned observation reference and never a caller-supplied base', async () => {
    mocks.authenticatedCall.mockResolvedValue({
      ok: true,
      data: { id: SERIES_ID, version: 6 },
    })

    const result = await acceptObservedJobberInvoiceNumber({
      seriesId: SERIES_ID,
      expectedVersion: 5,
      observationId: SNAPSHOT_ID,
      numberSource: 'latest',
      idempotencyKey: KEY,
    })

    expect(result).toEqual({ ok: true, data: { id: SERIES_ID, version: 6 } })
    expect(mocks.authenticatedCall).toHaveBeenCalledWith(
      'accept_progress_jobber_invoice_number',
      {
        series_id: SERIES_ID,
        expected_version: 5,
        observation_id: SNAPSHOT_ID,
        number_source: 'latest',
        idempotency_key: KEY,
      },
    )
  })

  it('stops after authorization denial and does not revalidate failures', async () => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: false, error: 'User is not allowed' })

    const result = await refreshJobberInvoice({
      seriesId: SERIES_ID,
      expectedVersion: 4,
      idempotencyKey: KEY,
    })

    expect(result).toEqual({ ok: false, error: 'User is not allowed' })
    expect(mocks.authenticatedCall).not.toHaveBeenCalled()
    expect(mocks.fetchJobberInvoiceObservation).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
