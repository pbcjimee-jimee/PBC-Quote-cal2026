import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAllowedUser: vi.fn(),
  listJobberInvoicesForJob: vi.fn(),
  fetchJobberInvoiceObservation: vi.fn(),
  classifyJobberInvoiceError: vi.fn(),
}))

vi.mock('@/lib/security/require-allowed-user', () => ({
  requireAllowedUser: mocks.requireAllowedUser,
}))
vi.mock('@/lib/jobber/invoice-gateway', () => ({
  listJobberInvoicesForJob: mocks.listJobberInvoicesForJob,
  fetchJobberInvoiceObservation: mocks.fetchJobberInvoiceObservation,
  classifyJobberInvoiceError: mocks.classifyJobberInvoiceError,
}))

import { GET as listInvoices } from '@/app/api/jobber/progress-invoices/jobs/[jobId]/invoices/route'
import { GET as previewInvoice } from '@/app/api/jobber/progress-invoices/invoices/[invoiceId]/route'

const NO_STORE = 'private, no-store, max-age=0'

const observation = {
  accountId: 'account-secret-authority',
  invoiceId: 'invoice-1',
  invoiceNumber: 'INV-100',
  rawStatus: 'AWAITING_PAYMENT',
  normalizedStatus: 'awaiting_payment',
  jobberWebUri: 'https://secure.getjobber.com/invoices/invoice-1',
  amounts: {
    subtotal: '100.00', taxAmount: '10.00', total: '110.00',
    invoiceBalance: '60.00', paymentsTotal: '50.00',
  },
  issuedDate: '2026-01-01',
  dueDate: '2026-01-15',
  receivedDate: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  client: {
    id: 'client-1',
    name: 'Example Builder',
    companyName: 'Example Builder Pty Ltd',
    emails: ['accounts@example.test', 'owner@example.test'],
    phones: [{ number: '0400000000', primary: true }],
  },
  billingAddress: {
    street1: '1 Billing Street', street2: null, city: 'Sydney',
    province: 'NSW', postalCode: '2000', country: 'Australia',
  },
  jobs: [{ id: 'job-1' }, { id: 'job-2' }],
  properties: [{
    id: 'property-1',
    address: {
      street1: '4 Curra Close', street2: null, city: 'Frenchs Forest',
      province: 'NSW', postalCode: '2086', country: 'Australia',
    },
  }],
  selectedJobberJobId: null,
  selectedJobberPropertyId: 'property-1',
  payments: [{
    id: 'payment-secret', source: 'payment_record', rawAdjustmentType: 'PAYMENT',
    rawSignedAmount: '50.00', absoluteAmount: '50.00', direction: 'receipt',
    effectiveReceiptAmount: '50.00', entryDate: '2026-01-02', method: 'card',
    reference: 'txn-secret', externalStatus: 'SUCCEEDED', externalUpdatedAt: null,
    treatment: 'active',
  }],
  effectiveGraphqlVersion: '2025-04-16',
  paymentEligibilityPolicyVersion: 'v1',
  warnings: [{ code: 'no_invoice_jobs' }],
  fetchedAt: '2026-01-02T00:00:00Z',
  responseFingerprint: 'sensitive-persistence-fingerprint',
} as const

function params<T extends Record<string, string>>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAllowedUser.mockResolvedValue({
    ok: true,
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test' },
  })
  mocks.listJobberInvoicesForJob.mockResolvedValue({
    accountId: 'account-1',
    invoices: [{
      id: 'invoice-1', invoiceNumber: 'INV-100', rawStatus: 'PAID',
      normalizedStatus: 'paid', jobberWebUri: null, warnings: [],
    }],
  })
  mocks.fetchJobberInvoiceObservation.mockResolvedValue(observation)
  mocks.classifyJobberInvoiceError.mockReturnValue({
    code: 'JOBBER_TEMPORARY_FAILURE', status: 503, message: 'Jobber is temporarily unavailable',
  })
})

describe('Progress Invoice Jobber selector routes', () => {
  it('requires an allowed user before any Jobber gateway work', async () => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: false, error: 'Authentication required' })

    const jobResponse = await listInvoices(
      new NextRequest('http://localhost/api/jobber/progress-invoices/jobs/job-1/invoices'),
      params({ jobId: 'job-1' }),
    )
    const invoiceResponse = await previewInvoice(
      new NextRequest('http://localhost/api/jobber/progress-invoices/invoices/invoice-1'),
      params({ invoiceId: 'invoice-1' }),
    )

    expect(jobResponse.status).toBe(401)
    expect(invoiceResponse.status).toBe(401)
    expect(jobResponse.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(invoiceResponse.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(mocks.listJobberInvoicesForJob).not.toHaveBeenCalled()
    expect(mocks.fetchJobberInvoiceObservation).not.toHaveBeenCalled()
  })

  it('maps an authenticated but disallowed user to 403 before gateway work', async () => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: false, error: 'User is not allowed' })

    const response = await listInvoices(
      new NextRequest('http://localhost/api/jobber/progress-invoices/jobs/job-1/invoices'),
      params({ jobId: 'job-1' }),
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(mocks.listJobberInvoicesForJob).not.toHaveBeenCalled()
  })

  it.each([
    ['', 400],
    ['%E0%A4%A', 400],
    ['x'.repeat(513), 400],
  ])('rejects invalid decoded job IDs with no-store (%j)', async (jobId, status) => {
    const response = await listInvoices(
      new NextRequest(`http://localhost/api/jobber/progress-invoices/jobs/${jobId}/invoices`),
      params({ jobId }),
    )

    expect(response.status).toBe(status)
    expect(response.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(mocks.listJobberInvoicesForJob).not.toHaveBeenCalled()
  })

  it('rejects duplicate, extra, and overlong invoice preview selectors', async () => {
    for (const query of [
      '?selectedJobberJobId=job-1&selectedJobberJobId=job-2',
      '?extra=true',
      `?selectedJobberPropertyId=${'x'.repeat(513)}`,
    ]) {
      const response = await previewInvoice(
        new NextRequest(`http://localhost/api/jobber/progress-invoices/invoices/invoice-1${query}`),
        params({ invoiceId: 'invoice-1' }),
      )
      expect(response.status).toBe(400)
      expect(response.headers.get('Cache-Control')).toBe(NO_STORE)
    }
    expect(mocks.fetchJobberInvoiceObservation).not.toHaveBeenCalled()
  })

  it('returns a bounded invoice-candidate allowlist', async () => {
    const response = await listInvoices(
      new NextRequest('http://localhost/api/jobber/progress-invoices/jobs/job-1/invoices'),
      params({ jobId: 'job-1' }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(body).toEqual({
      ok: true,
      data: {
        accountId: 'account-1',
        jobId: 'job-1',
        invoices: [{
          id: 'invoice-1', invoiceNumber: 'INV-100', rawStatus: 'PAID',
          normalizedStatus: 'paid',
        }],
      },
    })
  })

  it('returns explicit candidates while omitting payments, authority, raw transport, and fingerprints', async () => {
    const response = await previewInvoice(
      new NextRequest(
        'http://localhost/api/jobber/progress-invoices/invoices/invoice-1?selectedJobberPropertyId=property-1',
      ),
      params({ invoiceId: 'invoice-1' }),
    )
    const body = await response.json()
    const serialized = JSON.stringify(body)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(mocks.fetchJobberInvoiceObservation).toHaveBeenCalledWith({
      jobberInvoiceId: 'invoice-1',
      selectedJobberPropertyId: 'property-1',
    })
    expect(body.data).toMatchObject({
      accountId: 'account-secret-authority',
      invoiceId: 'invoice-1',
      invoiceNumber: 'INV-100',
      amounts: { paymentsTotal: '50.00' },
      jobs: [{ id: 'job-1' }, { id: 'job-2' }],
      properties: [{ id: 'property-1' }],
      selectedJobberJobId: null,
      selectedJobberPropertyId: 'property-1',
    })
    for (const secret of [
      'payment-secret', 'txn-secret',
      'responseFingerprint', 'sensitive-persistence-fingerprint', 'effectiveGraphqlVersion',
    ]) expect(serialized).not.toContain(secret)
    expect(body.data).not.toHaveProperty('payments')
  })

  it.each([
    ['JOBBER_AUTH_FAILED', 401],
    ['JOBBER_SCOPE_MISSING', 403],
    ['JOBBER_NOT_FOUND', 404],
    ['JOBBER_RATE_LIMITED', 429],
    ['JOBBER_SCHEMA_MISMATCH', 502],
    ['JOBBER_TEMPORARY_FAILURE', 503],
  ])('maps %s safely with no-store', async (code, status) => {
    mocks.listJobberInvoicesForJob.mockRejectedValue(new Error('raw upstream and token data'))
    mocks.classifyJobberInvoiceError.mockReturnValue({ code, status, message: 'Safe Jobber error' })

    const response = await listInvoices(
      new NextRequest('http://localhost/api/jobber/progress-invoices/jobs/job-1/invoices'),
      params({ jobId: 'job-1' }),
    )

    expect(response.status).toBe(status)
    expect(response.headers.get('Cache-Control')).toBe(NO_STORE)
    expect(await response.json()).toEqual({ ok: false, error: 'Safe Jobber error', code })
  })
})
