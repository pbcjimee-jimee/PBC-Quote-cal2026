import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import {
  fetchJobberAccountIdentity,
  fetchJobberInvoiceDetail,
  fetchJobberInvoiceJobsPage,
  fetchJobberInvoicePaymentsPage,
  fetchJobberInvoicePropertiesPage,
  fetchJobberInvoiceSearchPage,
  fetchJobberJobInvoicesPage,
  fetchJobberPaymentDetail,
  fetchJobberPaymentRefundsPage,
  JobberInvoiceApiError,
} from '@/lib/jobber/invoice-client'
import jobInvoicesPageOne from './fixtures/progress-invoices/jobber-job-invoices-page-1.json'
import jobInvoicesPageTwo from './fixtures/progress-invoices/jobber-job-invoices-page-2.json'
import invoicePaymentsPageOne from './fixtures/progress-invoices/jobber-invoice-payments-page-1.json'
import invoicePaymentsPageTwo from './fixtures/progress-invoices/jobber-invoice-payments-page-2.json'

const options = { accessToken: 'secret-token', graphqlVersion: '2025-04-16' }
const version = { versioning: { version: '2025-04-16' } }

const queries = {
  account: `query JobberInvoiceAccountIdentity { account { id } }`,
  jobInvoices: `query JobberJobInvoices($jobId: EncodedId!, $first: Int!, $after: String) {
    job(id: $jobId) { id invoices(first: $first, after: $after) {
      nodes { id invoiceNumber invoiceStatus }
      pageInfo { endCursor hasNextPage }
    } }
  }`,
  detail: `query JobberInvoiceDetail($invoiceId: EncodedId!) {
    invoice(id: $invoiceId) {
      id invoiceNumber invoiceStatus jobberWebUri
      amounts { subtotal taxAmount total invoiceBalance paymentsTotal }
      issuedDate dueDate receivedDate createdAt updatedAt
      client { id name companyName defaultEmails phones { number primary } }
      billingAddress { street1 street2 city province postalCode country }
    }
  }`,
  jobs: `query JobberInvoiceJobs($invoiceId: EncodedId!, $first: Int!, $after: String) {
    invoice(id: $invoiceId) { id jobs(first: $first, after: $after) {
      nodes { id } pageInfo { endCursor hasNextPage }
    } }
  }`,
  properties: `query JobberInvoiceProperties($invoiceId: EncodedId!, $first: Int!, $after: String) {
    invoice(id: $invoiceId) { id properties(first: $first, after: $after) {
      nodes { id address { street1 street2 city province postalCode country } }
      pageInfo { endCursor hasNextPage }
    } }
  }`,
  payments: `query JobberInvoicePayments($invoiceId: EncodedId!, $first: Int!, $after: String) {
    invoice(id: $invoiceId) { id paymentRecords(first: $first, after: $after) {
      nodes { id amount entryDate adjustmentType jobberPaymentPaymentMethod jobberPaymentTransactionStatus }
      pageInfo { endCursor hasNextPage }
    } }
  }`,
  refunds: `query JobberPaymentRefunds($paymentId: EncodedId!, $first: Int!, $after: String) {
    paymentRecord(id: $paymentId) { id refunds(first: $first, after: $after) {
      nodes { id amount entryDate jobberPaymentTransactionStatus }
      pageInfo { endCursor hasNextPage }
    } }
  }`,
  payment: `query JobberPaymentDetail($paymentId: EncodedId!) {
    paymentRecord(id: $paymentId) {
      __typename id adjustmentType amount rawAmount entryDate paymentType paymentOrigin details
      ... on CheckPaymentRecord { checkNumber }
      ... on JobberPaymentsACHPaymentRecord { transactionId }
      ... on JobberPaymentsCreditCardPaymentRecord { transactionId }
      ... on JobberPaymentsRefundPaymentRecord { transactionId }
    }
  }`,
  search: `query JobberInvoiceSearch($term: String!, $first: Int!, $after: String) {
    invoices(searchTerm: $term, first: $first, after: $after) {
      nodes { id invoiceNumber invoiceStatus jobberWebUri }
      pageInfo { endCursor hasNextPage }
    }
  }`,
} as const

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function response(data: unknown, extensions: unknown = version, status = 200): Response {
  return new Response(JSON.stringify({ data, extensions }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function terminal(nodes: unknown[] = []) {
  return { nodes, pageInfo: { endCursor: null, hasNextPage: false } }
}

afterEach(() => vi.unstubAllGlobals())

describe('Progress Invoice Jobber query client', () => {
  it('sends every confirmed query with exact variables and pinned headers', async () => {
    const calls = [
      { expected: queries.account, variables: {}, invoke: () => fetchJobberAccountIdentity(options), data: { account: { id: 'account-1' } } },
      { expected: queries.jobInvoices, variables: { jobId: 'job-1', first: 50, after: null }, invoke: () => fetchJobberJobInvoicesPage('job-1', { first: 50, after: null }, options), data: { job: { id: 'job-1', invoices: terminal() } } },
      { expected: queries.detail, variables: { invoiceId: 'invoice-1' }, invoke: () => fetchJobberInvoiceDetail('invoice-1', options), data: { invoice: invoiceDetail() } },
      { expected: queries.jobs, variables: { invoiceId: 'invoice-1', first: 50, after: 'jobs-cursor' }, invoke: () => fetchJobberInvoiceJobsPage('invoice-1', { first: 50, after: 'jobs-cursor' }, options), data: { invoice: { id: 'invoice-1', jobs: terminal() } } },
      { expected: queries.properties, variables: { invoiceId: 'invoice-1', first: 50, after: null }, invoke: () => fetchJobberInvoicePropertiesPage('invoice-1', { first: 50, after: null }, options), data: { invoice: { id: 'invoice-1', properties: terminal() } } },
      { expected: queries.payments, variables: { invoiceId: 'invoice-1', first: 50, after: null }, invoke: () => fetchJobberInvoicePaymentsPage('invoice-1', { first: 50, after: null }, options), data: { invoice: { id: 'invoice-1', paymentRecords: terminal() } } },
      { expected: queries.refunds, variables: { paymentId: 'payment-1', first: 50, after: null }, invoke: () => fetchJobberPaymentRefundsPage('payment-1', { first: 50, after: null }, options), data: { paymentRecord: { id: 'payment-1', refunds: terminal() } } },
      { expected: queries.payment, variables: { paymentId: 'payment-1' }, invoke: () => fetchJobberPaymentDetail('payment-1', options), data: { paymentRecord: paymentDetail() } },
      { expected: queries.search, variables: { term: 'INV-1', first: 50, after: null }, invoke: () => fetchJobberInvoiceSearchPage('INV-1', { first: 50, after: null }, options), data: { invoices: terminal() } },
    ]

    for (const call of calls) {
      const fetchMock = vi.fn<typeof fetch>(async () => response(call.data))
      vi.stubGlobal('fetch', fetchMock)
      await call.invoke()
      const [url, init] = fetchMock.mock.calls[0]!
      const body = JSON.parse(String(init?.body)) as { query: string; variables: unknown }
      expect(url).toBe('https://api.getjobber.com/api/graphql')
      expect(init?.method).toBe('POST')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-token')
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
      expect(new Headers(init?.headers).get('X-JOBBER-GRAPHQL-VERSION')).toBe('2025-04-16')
      expect(compact(body.query)).toBe(compact(call.expected))
      expect(body.query).not.toMatch(/\bmutation\b/i)
      expect(body.variables).toEqual(call.variables)
    }
  })

  it('normalizes amounts to canonical decimal text and strips raw envelopes and unknown fields', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ invoice: { ...invoiceDetail(), unexpected: 'secret' } }))
      .mockResolvedValueOnce(response({ invoice: { id: 'invoice-1', paymentRecords: terminal([{
        id: 'payment-1', amount: 300.5, entryDate: '2026-07-02T00:00:00Z', adjustmentType: 'FUTURE',
        jobberPaymentPaymentMethod: null, jobberPaymentTransactionStatus: null, unexpected: 'secret',
      }]) } }))
      .mockResolvedValueOnce(response({ paymentRecord: { ...paymentDetail(), rawAmount: -300.5, unexpected: 'secret' } }))
    vi.stubGlobal('fetch', fetchMock)

    const detail = await fetchJobberInvoiceDetail('invoice-1', options)
    const payments = await fetchJobberInvoicePaymentsPage('invoice-1', { first: 50, after: null }, options)
    const payment = await fetchJobberPaymentDetail('payment-1', options)

    expect(detail?.amounts).toEqual({
      subtotal: '1000', taxAmount: '100', total: '1100', invoiceBalance: '799.5', paymentsTotal: '300.5',
    })
    expect(detail).not.toHaveProperty('unexpected')
    expect(detail).not.toHaveProperty('extensions')
    expect(payments?.nodes[0]).toEqual({
      id: 'payment-1', amount: '300.5', entryDate: '2026-07-02T00:00:00Z', adjustmentType: 'FUTURE',
      jobberPaymentPaymentMethod: null, jobberPaymentTransactionStatus: null,
    })
    expect(payment).toMatchObject({ amount: '300.5', rawAmount: '-300.5', paymentType: 'BANK_TRANSFER', transactionId: null, checkNumber: null, details: null })
  })

  it('parses the recorded two-page invoice and payment fixtures without losing unknown enums or nulls', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(jobInvoicesPageOne)))
      .mockResolvedValueOnce(new Response(JSON.stringify(jobInvoicesPageTwo)))
      .mockResolvedValueOnce(new Response(JSON.stringify(invoicePaymentsPageOne)))
      .mockResolvedValueOnce(new Response(JSON.stringify(invoicePaymentsPageTwo)))
    vi.stubGlobal('fetch', fetchMock)

    const invoiceOne = await fetchJobberJobInvoicesPage('job-1', { first: 50, after: null }, options)
    const invoiceTwo = await fetchJobberJobInvoicesPage('job-1', { first: 50, after: 'invoice-cursor-1' }, options)
    const paymentOne = await fetchJobberInvoicePaymentsPage('invoice-1', { first: 50, after: null }, options)
    const paymentTwo = await fetchJobberInvoicePaymentsPage('invoice-1', { first: 50, after: 'payment-cursor-1' }, options)

    expect(invoiceOne?.nodes[0]).toEqual({ id: 'invoice-1', invoiceNumber: 'INV-1', invoiceStatus: 'awaiting_payment' })
    expect(invoiceTwo?.nodes[0]?.invoiceStatus).toBe('FUTURE_STATUS')
    expect(paymentOne?.nodes[0]).toMatchObject({ amount: '300.5', jobberPaymentPaymentMethod: null, jobberPaymentTransactionStatus: null })
    expect(paymentTwo?.nodes[0]).toMatchObject({ amount: '25', adjustmentType: 'REFUND', jobberPaymentTransactionStatus: 'SUCCEEDED' })
  })

  it('preserves nullable account, detail, refund connection, method, reference, and status values', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ account: null }))
      .mockResolvedValueOnce(response({ invoice: null }))
      .mockResolvedValueOnce(response({ paymentRecord: { id: 'payment-1', refunds: null } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchJobberAccountIdentity(options)).resolves.toBeNull()
    await expect(fetchJobberInvoiceDetail('invoice-1', options)).resolves.toBeNull()
    await expect(fetchJobberPaymentRefundsPage('payment-1', { first: 50, after: null }, options)).resolves.toBeNull()
  })

  it.each([
    ['missing version', { data: { account: { id: 'a' } }, extensions: {} }],
    ['mismatched version', { data: { account: { id: 'a' } }, extensions: { versioning: { version: '2026-01-01' } } }],
    ['GraphQL errors', { data: null, errors: [{ message: 'schema failure' }], extensions: version }],
  ])('rejects %s safely', async (_name, envelope) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(envelope), { status: 200 })))
    await expect(fetchJobberAccountIdentity(options)).rejects.toThrow()
  })

  it('wraps malformed and non-JSON upstream bodies in a stable typed error', async () => {
    const upstreamFragment = '<html>secret upstream failure</html>'
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => ({
      ok: true,
      status: 200,
      json: vi.fn(async () => { throw new SyntaxError(upstreamFragment) }),
    } as unknown as Response)))

    const error = await fetchJobberAccountIdentity(options).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(JobberInvoiceApiError)
    expect(error).toMatchObject({ message: 'Invalid Jobber GraphQL response', status: 502 })
    expect(String(error)).not.toContain(upstreamFragment)
  })

  it.each([
    ['non-array errors', { message: 'bad shape' }],
    ['null error item', [null]],
    ['missing error message', [{ extensions: { code: 'THROTTLED' } }]],
    ['non-object extensions', [{ message: 'bad', extensions: 'THROTTLED' }]],
    ['non-string extension code', [{ message: 'bad', extensions: { code: 429 } }]],
  ])('rejects malformed GraphQL errors: %s', async (_name, errors) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      data: { account: { id: 'account-1' } },
      errors,
      extensions: version,
    }))))

    await expect(fetchJobberAccountIdentity(options)).rejects.toMatchObject({
      message: 'Invalid Jobber GraphQL errors',
      status: 502,
    })
  })

  it.each(['issuedDate', 'dueDate', 'receivedDate'])('rejects a missing queried nullable invoice field: %s', async (field) => {
    const detail = { ...invoiceDetail() } as Record<string, unknown>
    delete detail[field]
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response({ invoice: detail })))

    await expect(fetchJobberInvoiceDetail('invoice-1', options)).rejects.toThrow('Invalid Jobber invoice detail response')
  })

  it('rejects missing queried nullable payment fields but allows absent conditional fragment fields', async () => {
    const legacy = {
      id: 'payment-1', amount: 10, entryDate: '2026-07-02T00:00:00Z', adjustmentType: 'PAYMENT',
      jobberPaymentTransactionStatus: null,
    }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response({
      invoice: { id: 'invoice-1', paymentRecords: terminal([legacy]) },
    })))
    await expect(fetchJobberInvoicePaymentsPage('invoice-1', { first: 50, after: null }, options))
      .rejects.toThrow('Invalid Jobber invoice payment')

    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response({ paymentRecord: {
      __typename: 'BankTransferPaymentRecord', id: 'payment-1', adjustmentType: 'PAYMENT', amount: 10,
      rawAmount: -10, entryDate: '2026-07-02T00:00:00Z', paymentType: null, paymentOrigin: null, details: null,
    } })))
    await expect(fetchJobberPaymentDetail('payment-1', options)).resolves.toMatchObject({
      transactionId: null,
      checkNumber: null,
    })
  })

  it.each([
    'JobberPaymentsACHPaymentRecord',
    'JobberPaymentsCreditCardPaymentRecord',
    'JobberPaymentsRefundPaymentRecord',
  ])('requires transactionId for matching concrete type %s', async (typename) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response({ paymentRecord: {
      ...paymentDetail(),
      __typename: typename,
      transactionId: undefined,
    } })))

    await expect(fetchJobberPaymentDetail('payment-1', options))
      .rejects.toThrow('Invalid Jobber payment detail response')
  })

  it.each([
    'JobberPaymentsACHPaymentRecord',
    'JobberPaymentsCreditCardPaymentRecord',
    'JobberPaymentsRefundPaymentRecord',
  ])('preserves explicit null transactionId for matching concrete type %s', async (typename) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response({ paymentRecord: {
      ...paymentDetail(),
      __typename: typename,
      transactionId: null,
    } })))

    await expect(fetchJobberPaymentDetail('payment-1', options)).resolves.toMatchObject({
      typename,
      transactionId: null,
      checkNumber: null,
    })
  })

  it('requires checkNumber for CheckPaymentRecord and preserves explicit null', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response({ paymentRecord: {
      ...paymentDetail(),
      __typename: 'CheckPaymentRecord',
      checkNumber: undefined,
    } })))
    await expect(fetchJobberPaymentDetail('payment-1', options))
      .rejects.toThrow('Invalid Jobber payment detail response')

    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response({ paymentRecord: {
      ...paymentDetail(),
      __typename: 'CheckPaymentRecord',
      checkNumber: null,
    } })))
    await expect(fetchJobberPaymentDetail('payment-1', options)).resolves.toMatchObject({
      transactionId: null,
      checkNumber: null,
    })
  })

  it('strips impossible inline-fragment values from nonmatching concrete types', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response({ paymentRecord: {
      ...paymentDetail(),
      __typename: 'BankTransferPaymentRecord',
      transactionId: 'impossible-transaction',
      checkNumber: 'impossible-check',
    } })))

    await expect(fetchJobberPaymentDetail('payment-1', options)).resolves.toMatchObject({
      typename: 'BankTransferPaymentRecord',
      transactionId: null,
      checkNumber: null,
    })
  })

  it.each(['NaN', 'Infinity', '-Infinity', '1e999999'])('rejects non-finite monetary text: %s', async (amount) => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => response({
      invoice: { id: 'invoice-1', paymentRecords: terminal([{
        id: 'payment-1', amount, entryDate: '2026-07-02T00:00:00Z', adjustmentType: 'PAYMENT',
        jobberPaymentPaymentMethod: null, jobberPaymentTransactionStatus: null,
      }]) },
    })))

    await expect(fetchJobberInvoicePaymentsPage('invoice-1', { first: 50, after: null }, options))
      .rejects.toThrow('Invalid Jobber invoice payment')
  })

  it('rejects non-finite numeric money returned by a custom fetch implementation', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => ({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        data: { invoice: { id: 'invoice-1', paymentRecords: terminal([{
          id: 'payment-1', amount: Number.POSITIVE_INFINITY, entryDate: '2026-07-02T00:00:00Z',
          adjustmentType: 'PAYMENT', jobberPaymentPaymentMethod: null, jobberPaymentTransactionStatus: null,
        }]) } },
        extensions: version,
      })),
    } as unknown as Response)))

    await expect(fetchJobberInvoicePaymentsPage('invoice-1', { first: 50, after: null }, options))
      .rejects.toThrow('Invalid Jobber invoice payment')
  })

  it('rejects wrong parents and malformed connection shapes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ job: { id: 'wrong', invoices: terminal() } })))
    await expect(fetchJobberJobInvoicesPage('job-1', { first: 50, after: null }, options))
      .rejects.toThrow('Jobber job response did not match the requested ID')

    vi.stubGlobal('fetch', vi.fn(async () => response({ invoices: { nodes: null, pageInfo: null } })))
    await expect(fetchJobberInvoiceSearchPage('INV', { first: 50, after: null }, options))
      .rejects.toThrow('Invalid Jobber invoice search connection')
  })

  it('retries bounded HTTP and GraphQL throttling but never retries past the limit', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: 'slow', extensions: { code: 'THROTTLED' } }], extensions: version }), { status: 200 }))
      .mockResolvedValueOnce(response({ account: { id: 'account-1' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchJobberAccountIdentity({ ...options, retryDelayMs: 0 })).resolves.toEqual({ id: 'account-1' })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })))
    await expect(fetchJobberAccountIdentity({ ...options, retryDelayMs: 0, maxThrottleRetries: 1 }))
      .rejects.toMatchObject({ status: 429 })
  })

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 6])(
    'rejects invalid maxThrottleRetries=%s before network work',
    async (maxThrottleRetries) => {
      const fetchMock = vi.fn<typeof fetch>()
      vi.stubGlobal('fetch', fetchMock)

      await expect(fetchJobberAccountIdentity({ ...options, maxThrottleRetries }))
        .rejects.toThrow('maxThrottleRetries must be an integer between 0 and 5')
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('accepts the retry bounds 0 and 5', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response({ account: { id: 'account-1' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchJobberAccountIdentity({ ...options, maxThrottleRetries: 0 })).resolves.toEqual({ id: 'account-1' })
    await expect(fetchJobberAccountIdentity({ ...options, maxThrottleRetries: 5 })).resolves.toEqual({ id: 'account-1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces 401 as a typed error for whole-operation restart at the gateway', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })))
    await expect(fetchJobberAccountIdentity(options)).rejects.toBeInstanceOf(JobberInvoiceApiError)
    await expect(fetchJobberAccountIdentity(options)).rejects.toMatchObject({ status: 401 })
  })
})

function invoiceDetail() {
  return {
    id: 'invoice-1', invoiceNumber: 'INV-1', invoiceStatus: 'awaiting_payment', jobberWebUri: 'https://example.invalid/invoice-1',
    amounts: { subtotal: 1000, taxAmount: 100, total: 1100, invoiceBalance: 799.5, paymentsTotal: 300.5 },
    issuedDate: '2026-07-01T00:00:00Z', dueDate: null, receivedDate: null,
    createdAt: '2026-06-30T00:00:00Z', updatedAt: '2026-07-02T00:00:00Z',
    client: { id: 'client-1', name: 'Client', companyName: null, defaultEmails: ['one@example.invalid', 'two@example.invalid'], phones: [{ number: '0400', primary: true }] },
    billingAddress: { street1: '1 Street', street2: null, city: 'Sydney', province: 'NSW', postalCode: '2000', country: 'Australia' },
  }
}

function paymentDetail() {
  return {
    __typename: 'BankTransferPaymentRecord', id: 'payment-1', adjustmentType: 'PAYMENT', amount: 300.5,
    rawAmount: -300.5, entryDate: '2026-07-02T00:00:00Z', paymentType: 'BANK_TRANSFER', paymentOrigin: null,
    details: null, transactionId: null, checkNumber: null,
  }
}
