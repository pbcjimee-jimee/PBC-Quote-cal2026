import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getJobberConfig: vi.fn(),
  getJobberInvoiceReadContract: vi.fn(),
  getUsableSharedJobberConnectionToken: vi.fn(),
  refreshSharedJobberConnectionToken: vi.fn(),
  requireSharedJobberConnectionOwnerId: vi.fn(),
  fetchJobberAccountIdentity: vi.fn(),
  fetchJobberJobInvoicesPage: vi.fn(),
  fetchJobberInvoiceDetail: vi.fn(),
  fetchJobberInvoiceJobsPage: vi.fn(),
  fetchJobberInvoicePropertiesPage: vi.fn(),
  fetchJobberInvoicePaymentsPage: vi.fn(),
  fetchJobberPaymentRefundsPage: vi.fn(),
  fetchJobberPaymentDetail: vi.fn(),
  fetchJobberInvoiceSearchPage: vi.fn(),
}))

vi.mock('@/lib/jobber/config', () => ({
  getJobberConfig: mocks.getJobberConfig,
}))
vi.mock('@/lib/jobber/invoice-contract', () => ({
  getJobberInvoiceReadContract: mocks.getJobberInvoiceReadContract,
}))
vi.mock('@/lib/jobber/tokens', () => ({
  getUsableSharedJobberConnectionToken: mocks.getUsableSharedJobberConnectionToken,
  refreshSharedJobberConnectionToken: mocks.refreshSharedJobberConnectionToken,
  requireSharedJobberConnectionOwnerId: mocks.requireSharedJobberConnectionOwnerId,
}))
vi.mock('@/lib/jobber/invoice-client', async (importOriginal) => {
  class JobberInvoiceApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message)
    }
  }
  return {
    ...(await importOriginal<object>()),
    JobberInvoiceApiError,
    fetchJobberAccountIdentity: mocks.fetchJobberAccountIdentity,
    fetchJobberJobInvoicesPage: mocks.fetchJobberJobInvoicesPage,
    fetchJobberInvoiceDetail: mocks.fetchJobberInvoiceDetail,
    fetchJobberInvoiceJobsPage: mocks.fetchJobberInvoiceJobsPage,
    fetchJobberInvoicePropertiesPage: mocks.fetchJobberInvoicePropertiesPage,
    fetchJobberInvoicePaymentsPage: mocks.fetchJobberInvoicePaymentsPage,
    fetchJobberPaymentRefundsPage: mocks.fetchJobberPaymentRefundsPage,
    fetchJobberPaymentDetail: mocks.fetchJobberPaymentDetail,
    fetchJobberInvoiceSearchPage: mocks.fetchJobberInvoiceSearchPage,
  }
})

import { JobberInvoiceApiError } from '@/lib/jobber/invoice-client'
import {
  fetchJobberInvoiceObservation,
  listJobberInvoicesForJob,
  searchJobberInvoiceCandidates,
} from '@/lib/jobber/invoice-gateway'

const scopes = ['read_clients', 'read_jobs', 'read_invoices', 'read_jobber_payments'] as const
const config = { clientId: '', clientSecret: '', redirectUri: '', graphqlVersion: '2025-04-16', accessToken: '' }
const contract = {
  effectiveGraphqlVersion: '2025-04-16',
  requiredReadScopes: scopes,
  supportsDirectInvoiceSearch: true,
  invoiceAmountFields: ['subtotal', 'taxAmount', 'total', 'invoiceBalance', 'paymentsTotal'],
  paymentEligibilityPolicyVersion: 'jobber-2025-04-16-v1',
}
const token = { ownerUserId: 'owner-1', accessToken: 'access-1', refreshToken: 'refresh-1', scope: scopes.join(' '), expiresAt: null }
const pageOptions = { first: 50, after: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  mocks.getJobberConfig.mockReturnValue(config)
  mocks.getJobberInvoiceReadContract.mockReturnValue(contract)
  mocks.getUsableSharedJobberConnectionToken.mockResolvedValue(token)
  mocks.requireSharedJobberConnectionOwnerId.mockReturnValue('owner-1')
  mocks.refreshSharedJobberConnectionToken.mockResolvedValue({ ...token, accessToken: 'access-2', refreshToken: 'refresh-2' })
  mocks.fetchJobberAccountIdentity.mockResolvedValue({ id: 'account-1' })
})

describe('Progress Invoice Jobber gateway discovery', () => {
  it('validates version before token DB access, requests exact scopes, and collects every job invoice page', async () => {
    mocks.fetchJobberJobInvoicesPage
      .mockResolvedValueOnce(connection([{ id: 'invoice-1', invoiceNumber: 'INV-1', invoiceStatus: 'awaiting_payment' }], 'c1', true))
      .mockResolvedValueOnce(connection([{ id: 'invoice-2', invoiceNumber: 'INV-2', invoiceStatus: 'FUTURE_STATUS' }]))

    const result = await listJobberInvoicesForJob({ jobberJobId: 'job-1' })

    expect(mocks.getJobberInvoiceReadContract.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.getUsableSharedJobberConnectionToken.mock.invocationCallOrder[0]!)
    expect(mocks.getUsableSharedJobberConnectionToken).toHaveBeenCalledWith(config, { requiredScopes: scopes })
    expect(mocks.fetchJobberAccountIdentity).toHaveBeenCalledWith(clientOptions('access-1'))
    expect(mocks.fetchJobberJobInvoicesPage.mock.calls).toEqual([
      ['job-1', pageOptions, clientOptions('access-1')],
      ['job-1', { first: 50, after: 'c1' }, clientOptions('access-1')],
    ])
    expect(result).toMatchObject({
      accountId: 'account-1',
      invoices: [
        { id: 'invoice-1', rawStatus: 'awaiting_payment', normalizedStatus: 'awaiting_payment', warnings: [] },
        { id: 'invoice-2', rawStatus: 'FUTURE_STATUS', normalizedStatus: 'unknown' },
      ],
    })
    expect(result.invoices[1]?.warnings).toEqual([{ code: 'unknown_invoice_status' }])
  })

  it('fails an unsupported version before token storage or network access', async () => {
    mocks.getJobberInvoiceReadContract.mockImplementationOnce(() => { throw new Error('Unsupported Jobber invoice read contract version') })
    await expect(listJobberInvoicesForJob({ jobberJobId: 'job-1' })).rejects.toThrow('Unsupported')
    expect(mocks.getUsableSharedJobberConnectionToken).not.toHaveBeenCalled()
    expect(mocks.fetchJobberAccountIdentity).not.toHaveBeenCalled()
  })

  it('fails closed when the contract disables direct search', async () => {
    mocks.getJobberInvoiceReadContract.mockReturnValueOnce({ ...contract, supportsDirectInvoiceSearch: false })
    await expect(searchJobberInvoiceCandidates({ term: 'INV' })).rejects.toThrow('Direct Jobber invoice search is not supported')
    expect(mocks.getUsableSharedJobberConnectionToken).not.toHaveBeenCalled()
  })

  it('fully paginates direct search and includes verified account identity', async () => {
    mocks.fetchJobberInvoiceSearchPage
      .mockResolvedValueOnce(connection([{ id: 'invoice-1', invoiceNumber: 'INV-1', invoiceStatus: 'draft', jobberWebUri: 'https://example.invalid/1' }], 's1', true))
      .mockResolvedValueOnce(connection([{ id: 'invoice-2', invoiceNumber: 'INV-2', invoiceStatus: 'paid', jobberWebUri: 'https://example.invalid/2' }]))

    await expect(searchJobberInvoiceCandidates({ term: ' INV ' })).resolves.toMatchObject({
      accountId: 'account-1',
      invoices: [{ id: 'invoice-1' }, { id: 'invoice-2' }],
    })
    expect(mocks.fetchJobberInvoiceSearchPage.mock.calls).toEqual([
      ['INV', pageOptions, clientOptions('access-1')],
      ['INV', { first: 50, after: 's1' }, clientOptions('access-1')],
    ])
  })

  it('refreshes once on 401 and restarts the whole operation from account and page one', async () => {
    mocks.fetchJobberJobInvoicesPage.mockImplementation(async (_id, page, options) => {
      if (options.accessToken === 'access-1') {
        if (page.after === null) return connection([{ id: 'stale', invoiceNumber: 'STALE', invoiceStatus: 'draft' }], 'c1', true)
        throw new JobberInvoiceApiError('unauthorized', 401)
      }
      return connection([{ id: 'fresh', invoiceNumber: 'FRESH', invoiceStatus: 'paid' }])
    })

    const result = await listJobberInvoicesForJob({ jobberJobId: 'job-1' })

    expect(result.invoices.map(({ id }) => id)).toEqual(['fresh'])
    expect(mocks.fetchJobberAccountIdentity).toHaveBeenCalledTimes(2)
    expect(mocks.refreshSharedJobberConnectionToken).toHaveBeenCalledWith(
      'refresh-1', config, 'owner-1', { storedScope: scopes.join(' '), requiredScopes: scopes },
    )
    expect(mocks.fetchJobberJobInvoicesPage.mock.calls.at(-1)?.[1]).toEqual(pageOptions)
  })

  it('does not loop after a second 401', async () => {
    mocks.fetchJobberAccountIdentity.mockRejectedValue(new JobberInvoiceApiError('unauthorized', 401))
    await expect(listJobberInvoicesForJob({ jobberJobId: 'job-1' })).rejects.toMatchObject({ status: 401 })
    expect(mocks.refreshSharedJobberConnectionToken).toHaveBeenCalledOnce()
    expect(mocks.fetchJobberAccountIdentity).toHaveBeenCalledTimes(2)
  })
})

describe('Progress Invoice Jobber observation normalization', () => {
  beforeEach(() => {
    mocks.fetchJobberInvoiceDetail.mockResolvedValue(invoiceDetail())
    mocks.fetchJobberInvoiceJobsPage.mockResolvedValue(connection([{ id: 'job-1' }, { id: 'job-2' }]))
    mocks.fetchJobberInvoicePropertiesPage.mockResolvedValue(connection([
      { id: 'property-1', address: address('1 Street') },
      { id: 'property-2', address: address('2 Street') },
    ]))
    mocks.fetchJobberInvoicePaymentsPage.mockResolvedValue(connection(paymentRows()))
    mocks.fetchJobberPaymentRefundsPage.mockImplementation(async (id: string) => (
      id === 'p-refunded'
        ? connection([{ id: 'refund-child', amount: '10', entryDate: '2026-07-12T00:00:00Z', jobberPaymentTransactionStatus: 'SUCCEEDED' }])
        : null
    ))
    mocks.fetchJobberPaymentDetail.mockImplementation(async (id: string) => paymentDetailFor(id))
  })

  it('requires explicit valid selection when multiple jobs or properties are present', async () => {
    await expect(fetchJobberInvoiceObservation({ jobberInvoiceId: 'invoice-1' }))
      .rejects.toThrow('Select a Jobber job explicitly')
    await expect(fetchJobberInvoiceObservation({
      jobberInvoiceId: 'invoice-1', selectedJobberJobId: 'missing', selectedJobberPropertyId: 'property-1',
    })).rejects.toThrow('Selected Jobber job was not found')
    await expect(fetchJobberInvoiceObservation({
      jobberInvoiceId: 'invoice-1', selectedJobberJobId: 'job-1', selectedJobberPropertyId: 'missing',
    })).rejects.toThrow('Selected Jobber property was not found')
  })

  it('preserves complete invoice/contact data and applies discriminator/status payment policy without inferring receivedDate', async () => {
    const result = await fetchJobberInvoiceObservation({
      jobberInvoiceId: 'invoice-1', selectedJobberJobId: 'job-2', selectedJobberPropertyId: 'property-2',
    })

    expect(result).toMatchObject({
      accountId: 'account-1', invoiceId: 'invoice-1', invoiceNumber: 'INV-1', rawStatus: 'sent_not_due',
      normalizedStatus: 'awaiting_payment', selectedJobberJobId: 'job-2', selectedJobberPropertyId: 'property-2',
      amounts: { subtotal: '1000', taxAmount: '100', total: '1100', invoiceBalance: '710', paymentsTotal: '390' },
      issuedDate: '2026-07-01T00:00:00Z', receivedDate: '2026-07-10T00:00:00Z',
      client: { id: 'client-1', emails: ['one@example.invalid', 'two@example.invalid'], phones: [{ number: '0400', primary: true }, { number: '0500', primary: false }] },
    })
    expect(result.jobs.map(({ id }) => id)).toEqual(['job-1', 'job-2'])
    expect(result.properties.map(({ id }) => id)).toEqual(['property-1', 'property-2'])
    expect(result.payments).toHaveLength(21)
    expect(result.payments.map(({ id }) => id)).not.toContain('invoice-received-date')
    expect(paymentEffects(result.payments)).toMatchObject({
      'p-payment': ['receipt', '100', 'active'],
      'p-deposit': ['receipt', '50', 'active'],
      'p-refund': ['refund', '-25', 'active'],
      'p-reversal': ['reversal', '-10', 'active'],
      'p-correction': ['ambiguous', '0', 'unconfirmed'],
      'p-unknown': ['ambiguous', '0', 'unconfirmed'],
      'p-invoice': ['excluded', '0', 'unconfirmed'],
      'p-initial': ['excluded', '0', 'unconfirmed'],
      'p-bad-debt': ['excluded', '0', 'unconfirmed'],
      'p-voided': ['excluded', '0', 'unconfirmed'],
      'p-pending': ['receipt', '0', 'unconfirmed'],
      'p-failed': ['receipt', '0', 'unconfirmed'],
      'p-dispute': ['receipt', '0', 'unconfirmed'],
      'p-unknown-status': ['receipt', '0', 'unconfirmed'],
      'p-refunded': ['receipt', '80', 'active'],
      'refund-child': ['refund', '-10', 'active'],
      'p-null': ['receipt', '20', 'active'],
      'p-jobber-null': ['receipt', '0', 'unconfirmed'],
      'p-check': ['receipt', '15', 'active'],
      'p-details': ['receipt', '16', 'active'],
      'p-conflict': ['ambiguous', '0', 'unconfirmed'],
    })
    expect(result.payments.find(({ id }) => id === 'p-null')).toMatchObject({ method: null, reference: null, externalStatus: null, externalUpdatedAt: null })
    expect(result.payments.find(({ id }) => id === 'p-payment')).toMatchObject({ method: 'JOBBER_PAYMENTS', reference: 'tx-p-payment' })
    expect(result.payments.find(({ id }) => id === 'p-check')).toMatchObject({ method: 'CHECK', reference: 'CHK-1' })
    expect(result.payments.find(({ id }) => id === 'p-details')).toMatchObject({ method: 'OTHER', reference: 'detail reference' })
    expect(result.warnings).toEqual(expect.arrayContaining([
      { code: 'ambiguous_payment_evidence', paymentId: 'p-conflict' },
      { code: 'ambiguous_payment_adjustment', paymentId: 'p-correction' },
      { code: 'missing_jobber_payment_status', paymentId: 'p-jobber-null' },
      { code: 'unknown_payment_adjustment_type', paymentId: 'p-unknown' },
      { code: 'unknown_payment_status', paymentId: 'p-unknown-status' },
    ]))
    expect(result.responseFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('selects a sole candidate, warns on zero candidates, and keeps fingerprints stable across fetched time/page partition', async () => {
    mocks.fetchJobberInvoiceJobsPage.mockResolvedValue(connection([{ id: 'job-1' }]))
    mocks.fetchJobberInvoicePropertiesPage.mockResolvedValue(connection([]))
    mocks.fetchJobberInvoicePaymentsPage.mockResolvedValue(connection([]))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T00:00:00Z'))
    const first = await fetchJobberInvoiceObservation({ jobberInvoiceId: 'invoice-1' })
    vi.setSystemTime(new Date('2026-07-17T00:00:00Z'))
    mocks.fetchJobberInvoiceJobsPage
      .mockResolvedValueOnce(connection([], 'j1', true))
      .mockResolvedValueOnce(connection([{ id: 'job-1' }]))
    const second = await fetchJobberInvoiceObservation({ jobberInvoiceId: 'invoice-1' })

    expect(first.selectedJobberJobId).toBe('job-1')
    expect(first.selectedJobberPropertyId).toBeNull()
    expect(first.warnings).toContainEqual({ code: 'no_invoice_properties' })
    expect(first.fetchedAt).not.toBe(second.fetchedAt)
    expect(first.responseFingerprint).toBe(second.responseFingerprint)
  })
})

function connection<T>(nodes: T[], endCursor: string | null = null, hasNextPage = false) {
  return { nodes, pageInfo: { endCursor, hasNextPage } }
}

function clientOptions(accessToken: string) {
  return { accessToken, graphqlVersion: '2025-04-16' }
}

function address(street1: string) {
  return { street1, street2: null, city: 'Sydney', province: 'NSW', postalCode: '2000', country: 'Australia' }
}

function invoiceDetail() {
  return {
    id: 'invoice-1', invoiceNumber: 'INV-1', invoiceStatus: 'sent_not_due', jobberWebUri: 'https://example.invalid/invoice-1',
    amounts: { subtotal: '1000', taxAmount: '100', total: '1100', invoiceBalance: '710', paymentsTotal: '390' },
    issuedDate: '2026-07-01T00:00:00Z', dueDate: '2026-07-15T00:00:00Z', receivedDate: '2026-07-10T00:00:00Z',
    createdAt: '2026-06-30T00:00:00Z', updatedAt: '2026-07-11T00:00:00Z',
    client: { id: 'client-1', name: 'Client', companyName: null, defaultEmails: ['one@example.invalid', 'two@example.invalid'], phones: [{ number: '0400', primary: true }, { number: '0500', primary: false }] },
    billingAddress: address('Billing Street'),
  }
}

function paymentRows() {
  const values: Array<[string, string, string, string | null]> = [
    ['p-payment', 'PAYMENT', '100', 'SUCCEEDED'], ['p-deposit', 'DEPOSIT', '50', null], ['p-refund', 'REFUND', '25', 'SUCCEEDED'],
    ['p-reversal', 'FAILED_ACH_PAYMENT', '10', null], ['p-correction', 'CORRECTION', '5', null], ['p-unknown', 'FUTURE_TYPE', '5', null],
    ['p-invoice', 'INVOICE', '5', null], ['p-initial', 'INITIAL_BALANCE', '5', null], ['p-bad-debt', 'BAD_DEBT', '5', null],
    ['p-voided', 'VOIDED', '5', null], ['p-pending', 'PAYMENT', '5', 'PENDING'], ['p-failed', 'PAYMENT', '5', 'FAILED'],
    ['p-dispute', 'PAYMENT', '5', 'IN_DISPUTE'], ['p-unknown-status', 'PAYMENT', '5', 'FUTURE_STATUS'],
    ['p-refunded', 'PAYMENT', '80', 'REFUNDED'], ['p-null', 'PAYMENT', '20', null],
    ['p-jobber-null', 'PAYMENT', '5', null], ['p-check', 'PAYMENT', '15', null], ['p-details', 'PAYMENT', '16', null],
    ['p-conflict', 'PAYMENT', '10', null],
  ]
  return values.map(([id, adjustmentType, amount, status], index) => ({
    id, adjustmentType, amount, entryDate: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    jobberPaymentPaymentMethod: id === 'p-payment' ? 'LEGACY_METHOD' : null,
    jobberPaymentTransactionStatus: status,
  }))
}

function paymentDetailFor(id: string) {
  if (id === 'refund-child') return { __typename: 'JobberPaymentsRefundPaymentRecord', id, adjustmentType: 'REFUND', amount: '10', rawAmount: '10', entryDate: '2026-07-12T00:00:00Z', paymentType: 'JOBBER_PAYMENTS', paymentOrigin: null, details: null, transactionId: 'refund-tx', checkNumber: null }
  const legacy = paymentRows().find((row) => row.id === id)
  if (!legacy) return null
  return {
    __typename: 'BankTransferPaymentRecord', id, adjustmentType: legacy.adjustmentType,
    amount: id === 'p-conflict' ? '11' : legacy.amount, rawAmount: `-${legacy.amount}`,
    entryDate: legacy.entryDate,
    paymentType: id === 'p-null' ? null : id === 'p-deposit' ? 'CASH' : id === 'p-reversal' ? 'ACH_BANK_PAYMENT' : id === 'p-check' ? 'CHECK' : id === 'p-details' ? 'OTHER' : 'JOBBER_PAYMENTS',
    paymentOrigin: null, details: id === 'p-details' ? 'detail reference' : null,
    transactionId: id === 'p-payment' ? 'tx-p-payment' : null, checkNumber: id === 'p-check' ? 'CHK-1' : null,
  }
}

function paymentEffects(payments: readonly { id: string; direction: string; effectiveReceiptAmount: string; treatment: string }[]) {
  return Object.fromEntries(payments.map((payment) => [payment.id, [payment.direction, payment.effectiveReceiptAmount, payment.treatment]]))
}
