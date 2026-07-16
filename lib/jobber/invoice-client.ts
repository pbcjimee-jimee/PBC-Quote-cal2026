import 'server-only'

import Decimal from 'decimal.js'
import { JOBBER_GRAPHQL_URL } from './config'
import type {
  JobberAccountIdentity,
  JobberAddress,
  JobberConnectionPage,
  JobberInvoiceCandidate,
  JobberInvoiceClient,
  JobberInvoiceClientOptions,
  JobberInvoiceDetail,
  JobberInvoiceJob,
  JobberInvoicePaymentRecord,
  JobberInvoiceProperty,
  JobberPageRequest,
  JobberPaymentDetail,
  JobberPaymentRefund,
} from './invoice-types'

const ACCOUNT_QUERY = `query JobberInvoiceAccountIdentity { account { id } }`
const JOB_INVOICES_QUERY = `query JobberJobInvoices($jobId: EncodedId!, $first: Int!, $after: String) {
  job(id: $jobId) { id invoices(first: $first, after: $after) {
    nodes { id invoiceNumber invoiceStatus }
    pageInfo { endCursor hasNextPage }
  } }
}`
const INVOICE_DETAIL_QUERY = `query JobberInvoiceDetail($invoiceId: EncodedId!) {
  invoice(id: $invoiceId) {
    id invoiceNumber invoiceStatus jobberWebUri
    amounts { subtotal taxAmount total invoiceBalance paymentsTotal }
    issuedDate dueDate receivedDate createdAt updatedAt
    client { id name companyName defaultEmails phones { number primary } }
    billingAddress { street1 street2 city province postalCode country }
  }
}`
const INVOICE_JOBS_QUERY = `query JobberInvoiceJobs($invoiceId: EncodedId!, $first: Int!, $after: String) {
  invoice(id: $invoiceId) { id jobs(first: $first, after: $after) {
    nodes { id } pageInfo { endCursor hasNextPage }
  } }
}`
const INVOICE_PROPERTIES_QUERY = `query JobberInvoiceProperties($invoiceId: EncodedId!, $first: Int!, $after: String) {
  invoice(id: $invoiceId) { id properties(first: $first, after: $after) {
    nodes { id address { street1 street2 city province postalCode country } }
    pageInfo { endCursor hasNextPage }
  } }
}`
const INVOICE_PAYMENTS_QUERY = `query JobberInvoicePayments($invoiceId: EncodedId!, $first: Int!, $after: String) {
  invoice(id: $invoiceId) { id paymentRecords(first: $first, after: $after) {
    nodes { id amount entryDate adjustmentType jobberPaymentPaymentMethod jobberPaymentTransactionStatus }
    pageInfo { endCursor hasNextPage }
  } }
}`
const PAYMENT_REFUNDS_QUERY = `query JobberPaymentRefunds($paymentId: EncodedId!, $first: Int!, $after: String) {
  paymentRecord(id: $paymentId) { id refunds(first: $first, after: $after) {
    nodes { id amount entryDate jobberPaymentTransactionStatus }
    pageInfo { endCursor hasNextPage }
  } }
}`
const PAYMENT_DETAIL_QUERY = `query JobberPaymentDetail($paymentId: EncodedId!) {
  paymentRecord(id: $paymentId) {
    __typename id adjustmentType amount rawAmount entryDate paymentType paymentOrigin details
    ... on CheckPaymentRecord { checkNumber }
    ... on JobberPaymentsACHPaymentRecord { transactionId }
    ... on JobberPaymentsCreditCardPaymentRecord { transactionId }
    ... on JobberPaymentsRefundPaymentRecord { transactionId }
  }
}`
const TRANSACTION_ID_PAYMENT_TYPENAMES = new Set([
  'JobberPaymentsACHPaymentRecord',
  'JobberPaymentsCreditCardPaymentRecord',
  'JobberPaymentsRefundPaymentRecord',
])
const INVOICE_SEARCH_QUERY = `query JobberInvoiceSearch($term: String!, $first: Int!, $after: String) {
  invoices(searchTerm: $term, first: $first, after: $after) {
    nodes { id invoiceNumber invoiceStatus jobberWebUri }
    pageInfo { endCursor hasNextPage }
  }
}`
const MAX_THROTTLE_RETRIES = 5

export class JobberInvoiceApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'JobberInvoiceApiError'
  }
}

export async function fetchJobberAccountIdentity(options: JobberInvoiceClientOptions): Promise<JobberAccountIdentity | null> {
  const data = await request(ACCOUNT_QUERY, {}, options)
  const account = nullableObject(data.account, 'Invalid Jobber account response')
  return account === null ? null : { id: stringField(account.id, 'Invalid Jobber account response') }
}

export async function fetchJobberJobInvoicesPage(
  jobberJobId: string,
  page: JobberPageRequest,
  options: JobberInvoiceClientOptions,
): Promise<JobberConnectionPage<JobberInvoiceCandidate> | null> {
  const data = await request(JOB_INVOICES_QUERY, { jobId: jobberJobId, first: page.first, after: page.after }, options)
  const job = nullableObject(data.job, 'Invalid Jobber job response')
  if (job === null) return null
  assertParentId(job, jobberJobId, 'Jobber job response did not match the requested ID')
  return parseConnection(job.invoices, 'Invalid Jobber job invoices connection', parseInvoiceCandidate)
}

export async function fetchJobberInvoiceDetail(
  jobberInvoiceId: string,
  options: JobberInvoiceClientOptions,
): Promise<JobberInvoiceDetail | null> {
  const data = await request(INVOICE_DETAIL_QUERY, { invoiceId: jobberInvoiceId }, options)
  const invoice = nullableObject(data.invoice, 'Invalid Jobber invoice detail response')
  if (invoice === null) return null
  assertParentId(invoice, jobberInvoiceId, 'Jobber invoice response did not match the requested ID')
  return parseInvoiceDetail(invoice)
}

export async function fetchJobberInvoiceJobsPage(
  jobberInvoiceId: string,
  page: JobberPageRequest,
  options: JobberInvoiceClientOptions,
): Promise<JobberConnectionPage<JobberInvoiceJob> | null> {
  const invoice = await requestInvoiceParent(INVOICE_JOBS_QUERY, jobberInvoiceId, page, options)
  return invoice === null ? null : parseConnection(invoice.jobs, 'Invalid Jobber invoice jobs connection', parseIdentity)
}

export async function fetchJobberInvoicePropertiesPage(
  jobberInvoiceId: string,
  page: JobberPageRequest,
  options: JobberInvoiceClientOptions,
): Promise<JobberConnectionPage<JobberInvoiceProperty> | null> {
  const invoice = await requestInvoiceParent(INVOICE_PROPERTIES_QUERY, jobberInvoiceId, page, options)
  return invoice === null ? null : parseConnection(invoice.properties, 'Invalid Jobber invoice properties connection', parseProperty)
}

export async function fetchJobberInvoicePaymentsPage(
  jobberInvoiceId: string,
  page: JobberPageRequest,
  options: JobberInvoiceClientOptions,
): Promise<JobberConnectionPage<JobberInvoicePaymentRecord> | null> {
  const invoice = await requestInvoiceParent(INVOICE_PAYMENTS_QUERY, jobberInvoiceId, page, options)
  return invoice === null ? null : parseConnection(invoice.paymentRecords, 'Invalid Jobber invoice payments connection', parsePaymentRecord)
}

export async function fetchJobberPaymentRefundsPage(
  jobberPaymentId: string,
  page: JobberPageRequest,
  options: JobberInvoiceClientOptions,
): Promise<JobberConnectionPage<JobberPaymentRefund> | null> {
  const data = await request(PAYMENT_REFUNDS_QUERY, { paymentId: jobberPaymentId, first: page.first, after: page.after }, options)
  const payment = nullableObject(data.paymentRecord, 'Invalid Jobber payment refunds response')
  if (payment === null) return null
  assertParentId(payment, jobberPaymentId, 'Jobber payment response did not match the requested ID')
  if (payment.refunds === null) return null
  return parseConnection(payment.refunds, 'Invalid Jobber payment refunds connection', parseRefund)
}

export async function fetchJobberPaymentDetail(
  jobberPaymentId: string,
  options: JobberInvoiceClientOptions,
): Promise<JobberPaymentDetail | null> {
  const data = await request(PAYMENT_DETAIL_QUERY, { paymentId: jobberPaymentId }, options)
  const payment = nullableObject(data.paymentRecord, 'Invalid Jobber payment detail response')
  if (payment === null) return null
  assertParentId(payment, jobberPaymentId, 'Jobber payment response did not match the requested ID')
  const typename = stringField(payment.__typename, 'Invalid Jobber payment detail response')
  return {
    id: stringField(payment.id, 'Invalid Jobber payment detail response'),
    typename,
    adjustmentType: stringField(payment.adjustmentType, 'Invalid Jobber payment detail response'),
    amount: decimalField(payment.amount, 'Invalid Jobber payment detail response'),
    rawAmount: decimalField(payment.rawAmount, 'Invalid Jobber payment detail response'),
    entryDate: stringField(payment.entryDate, 'Invalid Jobber payment detail response'),
    paymentType: requiredNullableString(payment, 'paymentType', 'Invalid Jobber payment detail response'),
    paymentOrigin: requiredNullableString(payment, 'paymentOrigin', 'Invalid Jobber payment detail response'),
    details: requiredNullableString(payment, 'details', 'Invalid Jobber payment detail response'),
    transactionId: TRANSACTION_ID_PAYMENT_TYPENAMES.has(typename)
      ? requiredNullableString(payment, 'transactionId', 'Invalid Jobber payment detail response')
      : null,
    checkNumber: typename === 'CheckPaymentRecord'
      ? requiredNullableString(payment, 'checkNumber', 'Invalid Jobber payment detail response')
      : null,
  }
}

export async function fetchJobberInvoiceSearchPage(
  term: string,
  page: JobberPageRequest,
  options: JobberInvoiceClientOptions,
): Promise<JobberConnectionPage<JobberInvoiceCandidate>> {
  const data = await request(INVOICE_SEARCH_QUERY, { term, first: page.first, after: page.after }, options)
  return parseConnection(data.invoices, 'Invalid Jobber invoice search connection', parseSearchCandidate)
}

async function requestInvoiceParent(
  query: string,
  invoiceId: string,
  page: JobberPageRequest,
  options: JobberInvoiceClientOptions,
): Promise<Record<string, unknown> | null> {
  const data = await request(query, { invoiceId, first: page.first, after: page.after }, options)
  const invoice = nullableObject(data.invoice, 'Invalid Jobber invoice connection response')
  if (invoice !== null) assertParentId(invoice, invoiceId, 'Jobber invoice response did not match the requested ID')
  return invoice
}

async function request(
  query: string,
  variables: Readonly<Record<string, unknown>>,
  options: JobberInvoiceClientOptions,
): Promise<Record<string, unknown>> {
  const maxRetries = options.maxThrottleRetries ?? 2
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > MAX_THROTTLE_RETRIES) {
    throw new Error(`maxThrottleRetries must be an integer between 0 and ${MAX_THROTTLE_RETRIES}`)
  }
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(JOBBER_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        'Content-Type': 'application/json',
        'X-JOBBER-GRAPHQL-VERSION': options.graphqlVersion,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    })

    if (response.status === 429) {
      if (attempt === maxRetries) throw new JobberInvoiceApiError('Jobber rate limit exceeded', 429)
      await delay(options.retryDelayMs ?? 25)
      continue
    }
    if (!response.ok) {
      throw new JobberInvoiceApiError(`Jobber invoice request failed with status ${response.status}`, response.status)
    }

    let responseBody: unknown
    try {
      responseBody = await response.json()
    } catch {
      throw new JobberInvoiceApiError('Invalid Jobber GraphQL response', 502)
    }
    const envelope = objectValue(responseBody, 'Invalid Jobber GraphQL response')
    assertResponseVersion(envelope.extensions, options.graphqlVersion)
    const errors = parseGraphqlErrors(envelope)
    if (errors.length > 0) {
      if (hasThrottledError(errors)) {
        if (attempt === maxRetries) throw new JobberInvoiceApiError('Jobber rate limit exceeded', 429)
        await delay(options.retryDelayMs ?? 25)
        continue
      }
      throw new JobberInvoiceApiError('Jobber returned a GraphQL error', 502)
    }
    return objectValue(envelope.data, 'Invalid Jobber GraphQL data')
  }
  throw new JobberInvoiceApiError('Jobber rate limit exceeded', 429)
}

function assertResponseVersion(value: unknown, expected: string): void {
  const extensions = objectValue(value, 'Jobber response version is missing')
  const versioning = objectValue(extensions.versioning, 'Jobber response version is missing')
  if (versioning.version !== expected) {
    throw new JobberInvoiceApiError('Jobber response version did not match the requested contract', 502)
  }
}

function hasThrottledError(errors: readonly unknown[]): boolean {
  return errors.some((value) => {
    if (!isObject(value) || !isObject(value.extensions)) return false
    return value.extensions.code === 'THROTTLED'
  })
}

function parseGraphqlErrors(envelope: Record<string, unknown>): readonly Record<string, unknown>[] {
  if (!Object.hasOwn(envelope, 'errors')) return []
  if (!Array.isArray(envelope.errors)) {
    throw new JobberInvoiceApiError('Invalid Jobber GraphQL errors', 502)
  }

  return envelope.errors.map((error) => {
    if (!isObject(error) || typeof error.message !== 'string') {
      throw new JobberInvoiceApiError('Invalid Jobber GraphQL errors', 502)
    }
    if (Object.hasOwn(error, 'extensions')) {
      if (!isObject(error.extensions)) {
        throw new JobberInvoiceApiError('Invalid Jobber GraphQL errors', 502)
      }
      if (Object.hasOwn(error.extensions, 'code') && typeof error.extensions.code !== 'string') {
        throw new JobberInvoiceApiError('Invalid Jobber GraphQL errors', 502)
      }
    }
    return error
  })
}

function parseInvoiceCandidate(value: unknown): JobberInvoiceCandidate {
  const node = objectValue(value, 'Invalid Jobber invoice candidate')
  return {
    id: stringField(node.id, 'Invalid Jobber invoice candidate'),
    invoiceNumber: stringField(node.invoiceNumber, 'Invalid Jobber invoice candidate'),
    invoiceStatus: stringField(node.invoiceStatus, 'Invalid Jobber invoice candidate'),
  }
}

function parseSearchCandidate(value: unknown): JobberInvoiceCandidate {
  const candidate = parseInvoiceCandidate(value)
  const node = objectValue(value, 'Invalid Jobber invoice candidate')
  return { ...candidate, jobberWebUri: stringField(node.jobberWebUri, 'Invalid Jobber invoice candidate') }
}

function parseInvoiceDetail(invoice: Record<string, unknown>): JobberInvoiceDetail {
  const amounts = requiredNullableObject(invoice, 'amounts', 'Invalid Jobber invoice amounts')
  const client = requiredNullableObject(invoice, 'client', 'Invalid Jobber invoice client')
  const billingAddress = requiredNullableObject(invoice, 'billingAddress', 'Invalid Jobber invoice billing address')
  return {
    id: stringField(invoice.id, 'Invalid Jobber invoice detail response'),
    invoiceNumber: stringField(invoice.invoiceNumber, 'Invalid Jobber invoice detail response'),
    invoiceStatus: stringField(invoice.invoiceStatus, 'Invalid Jobber invoice detail response'),
    jobberWebUri: stringField(invoice.jobberWebUri, 'Invalid Jobber invoice detail response'),
    amounts: amounts === null ? null : {
      subtotal: decimalField(amounts.subtotal, 'Invalid Jobber invoice amounts'),
      taxAmount: decimalField(amounts.taxAmount, 'Invalid Jobber invoice amounts'),
      total: decimalField(amounts.total, 'Invalid Jobber invoice amounts'),
      invoiceBalance: decimalField(amounts.invoiceBalance, 'Invalid Jobber invoice amounts'),
      paymentsTotal: decimalField(amounts.paymentsTotal, 'Invalid Jobber invoice amounts'),
    },
    issuedDate: requiredNullableString(invoice, 'issuedDate', 'Invalid Jobber invoice detail response'),
    dueDate: requiredNullableString(invoice, 'dueDate', 'Invalid Jobber invoice detail response'),
    receivedDate: requiredNullableString(invoice, 'receivedDate', 'Invalid Jobber invoice detail response'),
    createdAt: stringField(invoice.createdAt, 'Invalid Jobber invoice detail response'),
    updatedAt: stringField(invoice.updatedAt, 'Invalid Jobber invoice detail response'),
    client: client === null ? null : parseClient(client),
    billingAddress: billingAddress === null ? null : parseAddress(billingAddress),
  }
}

function parseClient(client: Record<string, unknown>): JobberInvoiceClient {
  if (!Array.isArray(client.defaultEmails) || !Array.isArray(client.phones)) {
    throw new JobberInvoiceApiError('Invalid Jobber invoice client', 502)
  }
  return {
    id: stringField(client.id, 'Invalid Jobber invoice client'),
    name: stringField(client.name, 'Invalid Jobber invoice client'),
    companyName: requiredNullableString(client, 'companyName', 'Invalid Jobber invoice client'),
    defaultEmails: Object.freeze(client.defaultEmails.map((email) => stringField(email, 'Invalid Jobber invoice client'))),
    phones: Object.freeze(client.phones.map((phone) => {
      const value = objectValue(phone, 'Invalid Jobber invoice client')
      if (typeof value.primary !== 'boolean') throw new JobberInvoiceApiError('Invalid Jobber invoice client', 502)
      return { number: stringField(value.number, 'Invalid Jobber invoice client'), primary: value.primary }
    })),
  }
}

function parseIdentity(value: unknown): JobberInvoiceJob {
  const node = objectValue(value, 'Invalid Jobber identity node')
  return { id: stringField(node.id, 'Invalid Jobber identity node') }
}

function parseProperty(value: unknown): JobberInvoiceProperty {
  const node = objectValue(value, 'Invalid Jobber invoice property')
  const address = nullableObject(node.address, 'Invalid Jobber invoice property')
  return { id: stringField(node.id, 'Invalid Jobber invoice property'), address: address === null ? null : parseAddress(address) }
}

function parsePaymentRecord(value: unknown): JobberInvoicePaymentRecord {
  const node = objectValue(value, 'Invalid Jobber invoice payment')
  return {
    id: stringField(node.id, 'Invalid Jobber invoice payment'),
    amount: decimalField(node.amount, 'Invalid Jobber invoice payment'),
    entryDate: stringField(node.entryDate, 'Invalid Jobber invoice payment'),
    adjustmentType: stringField(node.adjustmentType, 'Invalid Jobber invoice payment'),
    jobberPaymentPaymentMethod: requiredNullableString(node, 'jobberPaymentPaymentMethod', 'Invalid Jobber invoice payment'),
    jobberPaymentTransactionStatus: requiredNullableString(node, 'jobberPaymentTransactionStatus', 'Invalid Jobber invoice payment'),
  }
}

function parseRefund(value: unknown): JobberPaymentRefund {
  const node = objectValue(value, 'Invalid Jobber payment refund')
  return {
    id: stringField(node.id, 'Invalid Jobber payment refund'),
    amount: decimalField(node.amount, 'Invalid Jobber payment refund'),
    entryDate: stringField(node.entryDate, 'Invalid Jobber payment refund'),
    jobberPaymentTransactionStatus: requiredNullableString(node, 'jobberPaymentTransactionStatus', 'Invalid Jobber payment refund'),
  }
}

function parseAddress(value: Record<string, unknown>): JobberAddress {
  return {
    street1: requiredNullableString(value, 'street1', 'Invalid Jobber address'),
    street2: requiredNullableString(value, 'street2', 'Invalid Jobber address'),
    city: requiredNullableString(value, 'city', 'Invalid Jobber address'),
    province: requiredNullableString(value, 'province', 'Invalid Jobber address'),
    postalCode: requiredNullableString(value, 'postalCode', 'Invalid Jobber address'),
    country: requiredNullableString(value, 'country', 'Invalid Jobber address'),
  }
}

function parseConnection<T extends { readonly id: string }>(
  value: unknown,
  message: string,
  parseNode: (value: unknown) => T,
): JobberConnectionPage<T> {
  const connection = objectValue(value, message)
  const pageInfo = objectValue(connection.pageInfo, message)
  if (
    !Array.isArray(connection.nodes) ||
    typeof pageInfo.hasNextPage !== 'boolean' ||
    !(pageInfo.endCursor === null || typeof pageInfo.endCursor === 'string')
  ) {
    throw new JobberInvoiceApiError(message, 502)
  }
  return {
    nodes: Object.freeze(connection.nodes.map(parseNode)),
    pageInfo: { endCursor: pageInfo.endCursor, hasNextPage: pageInfo.hasNextPage },
  }
}

function assertParentId(parent: Record<string, unknown>, expected: string, message: string): void {
  if (parent.id !== expected) throw new JobberInvoiceApiError(message, 502)
}

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (!isObject(value)) throw new JobberInvoiceApiError(message, 502)
  return value
}

function nullableObject(value: unknown, message: string): Record<string, unknown> | null {
  if (value === null) return null
  return objectValue(value, message)
}

function requiredNullableObject(
  record: Record<string, unknown>,
  key: string,
  message: string,
): Record<string, unknown> | null {
  if (!Object.hasOwn(record, key)) throw new JobberInvoiceApiError(message, 502)
  return nullableObject(record[key], message)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(value: unknown, message: string): string {
  if (typeof value !== 'string') throw new JobberInvoiceApiError(message, 502)
  return value
}

function nullableString(value: unknown, message: string): string | null {
  if (value === null || value === undefined) return null
  return stringField(value, message)
}

function requiredNullableString(record: Record<string, unknown>, key: string, message: string): string | null {
  if (!Object.hasOwn(record, key)) throw new JobberInvoiceApiError(message, 502)
  return nullableString(record[key], message)
}

function decimalField(value: unknown, message: string): string {
  if (typeof value !== 'number' && typeof value !== 'string') throw new JobberInvoiceApiError(message, 502)
  try {
    if (!Number.isFinite(Number(value))) throw new Error('Non-finite money')
    const decimal = new Decimal(String(value))
    if (!decimal.isFinite()) throw new Error('Non-finite money')
    return decimal.toString()
  } catch {
    throw new JobberInvoiceApiError(message, 502)
  }
}

function delay(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))
}
