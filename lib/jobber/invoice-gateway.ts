import 'server-only'

import { createHash } from 'node:crypto'
import Decimal from 'decimal.js'
import { getJobberConfig } from './config'
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
} from './invoice-client'
import { getJobberInvoiceReadContract, type JobberInvoiceReadContract } from './invoice-contract'
import { fetchAllJobberPages } from './pagination'
import {
  getUsableSharedJobberConnectionToken,
  refreshSharedJobberConnectionToken,
  requireSharedJobberConnectionOwnerId,
  type StoredJobberToken,
} from './tokens'
import type {
  JobberInvoiceCandidate,
  JobberInvoiceCandidateList,
  JobberInvoiceClientOptions,
  JobberInvoicePaymentRecord,
  JobberNormalizationWarning,
  JobberPaymentDetail,
  JobberPaymentDirection,
  JobberPaymentRefund,
  NormalizedJobberInvoiceCandidate,
  NormalizedJobberInvoiceObservation,
  NormalizedJobberInvoiceStatus,
  NormalizedJobberPayment,
} from './invoice-types'

const PAGE_SIZE = 50
const PAYMENT_FETCH_CONCURRENCY = 6
const MAX_SEARCH_TERM_LENGTH = 100
const KNOWN_PAYMENT_STATUSES = new Set([
  'IN_DISPUTE', 'PENDING', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED', 'DISPUTED', 'SUCCEEDED',
])
const INELIGIBLE_PAYMENT_STATUSES = new Set(['IN_DISPUTE', 'PENDING', 'FAILED', 'DISPUTED'])

export type JobberInvoiceSafeErrorCode =
  | 'JOBBER_NOT_CONNECTED'
  | 'JOBBER_AUTH_FAILED'
  | 'JOBBER_SCOPE_MISSING'
  | 'JOBBER_NOT_FOUND'
  | 'JOBBER_RATE_LIMITED'
  | 'JOBBER_SCHEMA_MISMATCH'
  | 'JOBBER_RESPONSE_INVALID'
  | 'JOBBER_TEMPORARY_FAILURE'

export interface ClassifiedJobberInvoiceError {
  readonly code: JobberInvoiceSafeErrorCode
  readonly status: 400 | 401 | 403 | 404 | 429 | 502 | 503
  readonly message: string
}

export function classifyJobberInvoiceError(error: unknown): ClassifiedJobberInvoiceError {
  if (error instanceof JobberInvoiceApiError) {
    if (error.status === 401) {
      return { code: 'JOBBER_AUTH_FAILED', status: 401, message: 'Jobber authorization failed' }
    }
    if (error.status === 403) {
      return { code: 'JOBBER_SCOPE_MISSING', status: 403, message: 'Jobber invoice read access is unavailable' }
    }
    if (error.status === 404) {
      return { code: 'JOBBER_NOT_FOUND', status: 404, message: 'Jobber record was not found' }
    }
    if (error.status === 429) {
      return { code: 'JOBBER_RATE_LIMITED', status: 429, message: 'Jobber rate limit reached' }
    }
    if (/version|contract|schema|invalid|response/i.test(error.message)) {
      return { code: 'JOBBER_SCHEMA_MISMATCH', status: 502, message: 'Jobber response contract changed' }
    }
    return { code: 'JOBBER_TEMPORARY_FAILURE', status: 503, message: 'Jobber is temporarily unavailable' }
  }

  const message = error instanceof Error ? error.message : ''
  if (/not connected|token is unavailable/i.test(message)) {
    return { code: 'JOBBER_NOT_CONNECTED', status: 503, message: 'Jobber is not connected' }
  }
  if (/scope|access is unavailable/i.test(message)) {
    return { code: 'JOBBER_SCOPE_MISSING', status: 403, message: 'Jobber invoice read access is unavailable' }
  }
  if (/not found|identity is unavailable/i.test(message)) {
    return { code: 'JOBBER_NOT_FOUND', status: 404, message: 'Jobber record was not found' }
  }
  if (/select a Jobber|selected Jobber/i.test(message)) {
    return { code: 'JOBBER_RESPONSE_INVALID', status: 400, message: 'A valid Jobber selection is required' }
  }
  if (/pinned contract|schema|version/i.test(message)) {
    return { code: 'JOBBER_SCHEMA_MISMATCH', status: 502, message: 'Jobber response contract changed' }
  }
  return { code: 'JOBBER_TEMPORARY_FAILURE', status: 503, message: 'Jobber is temporarily unavailable' }
}

export async function listJobberInvoicesForJob(input: {
  readonly jobberJobId: string
}): Promise<JobberInvoiceCandidateList> {
  const jobberJobId = requireExternalId(input.jobberJobId, 'Jobber job ID is required')
  return withRestartableToken(async (options) => {
    const accountId = await requireAccountId(options)
    const invoices = await fetchAllJobberPages(async (after) => {
      const page = await fetchJobberJobInvoicesPage(jobberJobId, { first: PAGE_SIZE, after }, options)
      if (page === null) throw new Error('Jobber job was not found')
      return page
    })
    return freezeCandidateList(accountId, invoices)
  })
}

export async function searchJobberInvoiceCandidates(input: {
  readonly term: string
}): Promise<JobberInvoiceCandidateList> {
  const term = input.term.trim()
  if (!term || term.length > MAX_SEARCH_TERM_LENGTH) throw new Error('Jobber invoice search term is invalid')
  return withRestartableToken(async (options, contract) => {
    if (!contract.supportsDirectInvoiceSearch) {
      throw new Error('Direct Jobber invoice search is not supported by the pinned contract')
    }
    const accountId = await requireAccountId(options)
    const invoices = await fetchAllJobberPages((after) => (
      fetchJobberInvoiceSearchPage(term, { first: PAGE_SIZE, after }, options)
    ))
    return freezeCandidateList(accountId, invoices)
  }, { requireDirectSearch: true })
}

export async function fetchJobberInvoiceObservation(input: {
  readonly jobberInvoiceId: string
  readonly selectedJobberJobId?: string
  readonly selectedJobberPropertyId?: string
}): Promise<NormalizedJobberInvoiceObservation> {
  const invoiceId = requireExternalId(input.jobberInvoiceId, 'Jobber invoice ID is required')
  return withRestartableToken(async (options, contract) => {
    const accountId = await requireAccountId(options)
    const invoice = await fetchJobberInvoiceDetail(invoiceId, options)
    if (invoice === null) throw new Error('Jobber invoice was not found')

    const [jobs, properties, paymentRows] = await Promise.all([
      fetchAllJobberPages(async (after) => {
        const page = await fetchJobberInvoiceJobsPage(invoiceId, { first: PAGE_SIZE, after }, options)
        if (page === null) throw new Error('Jobber invoice jobs could not be read completely')
        return page
      }),
      fetchAllJobberPages(async (after) => {
        const page = await fetchJobberInvoicePropertiesPage(invoiceId, { first: PAGE_SIZE, after }, options)
        if (page === null) throw new Error('Jobber invoice properties could not be read completely')
        return page
      }),
      fetchAllJobberPages(async (after) => {
        const page = await fetchJobberInvoicePaymentsPage(invoiceId, { first: PAGE_SIZE, after }, options)
        if (page === null) throw new Error('Jobber invoice payments could not be read completely')
        return page
      }),
    ])

    const warnings: JobberNormalizationWarning[] = []
    const selectedJobberJobId = selectCandidate(
      jobs.map(({ id }) => id), input.selectedJobberJobId, 'job', warnings,
    )
    const selectedJobberPropertyId = selectCandidate(
      properties.map(({ id }) => id), input.selectedJobberPropertyId, 'property', warnings,
    )
    const status = normalizeInvoiceStatus(invoice.invoiceStatus)
    warnings.push(...status.warnings)
    const payments = await normalizePayments(paymentRows, options, warnings)
    const fetchedAt = new Date().toISOString()
    const observationWithoutFingerprint = {
      accountId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      rawStatus: invoice.invoiceStatus,
      normalizedStatus: status.normalizedStatus,
      jobberWebUri: invoice.jobberWebUri,
      amounts: invoice.amounts,
      issuedDate: invoice.issuedDate,
      dueDate: invoice.dueDate,
      receivedDate: invoice.receivedDate,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      client: invoice.client === null ? null : {
        id: invoice.client.id,
        name: invoice.client.name,
        companyName: invoice.client.companyName,
        emails: Object.freeze([...invoice.client.defaultEmails]),
        phones: Object.freeze(invoice.client.phones.map((phone) => ({ ...phone }))),
      },
      billingAddress: invoice.billingAddress,
      jobs: Object.freeze([...jobs].sort(compareIds)),
      properties: Object.freeze([...properties].sort(compareIds)),
      selectedJobberJobId,
      selectedJobberPropertyId,
      payments: Object.freeze([...payments].sort(compareIds)),
      effectiveGraphqlVersion: contract.effectiveGraphqlVersion,
      paymentEligibilityPolicyVersion: contract.paymentEligibilityPolicyVersion,
      warnings: Object.freeze(sortWarnings(warnings)),
      fetchedAt,
    }
    const responseFingerprint = computeFingerprint(observationWithoutFingerprint)
    return Object.freeze({ ...observationWithoutFingerprint, responseFingerprint })
  })
}

interface RestartOptions {
  readonly requireDirectSearch?: boolean
}

async function withRestartableToken<T>(
  operation: (options: JobberInvoiceClientOptions, contract: JobberInvoiceReadContract) => Promise<T>,
  restartOptions: RestartOptions = {},
): Promise<T> {
  const config = getJobberConfig()
  const contract = getJobberInvoiceReadContract(config.graphqlVersion)
  if (restartOptions.requireDirectSearch && !contract.supportsDirectInvoiceSearch) {
    throw new Error('Direct Jobber invoice search is not supported by the pinned contract')
  }
  let token = await getUsableSharedJobberConnectionToken(config, { requiredScopes: contract.requiredReadScopes })
  if (!token) throw new Error('Jobber is not connected. Connect Jobber first.')

  try {
    return await operation(clientOptions(token, contract), contract)
  } catch (error) {
    if (!(error instanceof JobberInvoiceApiError) || error.status !== 401) throw error
  }

  token = await refreshSharedJobberConnectionToken(
    token.refreshToken,
    config,
    requireSharedJobberConnectionOwnerId(token),
    { storedScope: token.scope ?? null, requiredScopes: contract.requiredReadScopes },
  )
  return operation(clientOptions(token, contract), contract)
}

function clientOptions(token: StoredJobberToken, contract: JobberInvoiceReadContract): JobberInvoiceClientOptions {
  return { accessToken: token.accessToken, graphqlVersion: contract.effectiveGraphqlVersion }
}

async function requireAccountId(options: JobberInvoiceClientOptions): Promise<string> {
  const account = await fetchJobberAccountIdentity(options)
  if (account === null) throw new Error('Jobber account identity is unavailable')
  return account.id
}

function freezeCandidateList(accountId: string, invoices: readonly JobberInvoiceCandidate[]): JobberInvoiceCandidateList {
  return Object.freeze({
    accountId,
    invoices: Object.freeze(invoices.map(normalizeInvoiceCandidate)),
  })
}

function normalizeInvoiceCandidate(candidate: JobberInvoiceCandidate): NormalizedJobberInvoiceCandidate {
  const status = normalizeInvoiceStatus(candidate.invoiceStatus)
  return Object.freeze({
    id: candidate.id,
    invoiceNumber: candidate.invoiceNumber,
    rawStatus: candidate.invoiceStatus,
    normalizedStatus: status.normalizedStatus,
    jobberWebUri: candidate.jobberWebUri ?? null,
    warnings: Object.freeze(status.warnings),
  })
}

function normalizeInvoiceStatus(rawStatus: string): {
  readonly normalizedStatus: NormalizedJobberInvoiceStatus
  readonly warnings: JobberNormalizationWarning[]
} {
  if (rawStatus === 'draft' || rawStatus === 'awaiting_payment' || rawStatus === 'paid' || rawStatus === 'past_due') {
    return { normalizedStatus: rawStatus, warnings: [] }
  }
  if (rawStatus === 'sent_not_due') return { normalizedStatus: 'awaiting_payment', warnings: [] }
  return { normalizedStatus: 'unknown', warnings: [{ code: 'unknown_invoice_status' }] }
}

function selectCandidate(
  ids: readonly string[],
  suppliedId: string | undefined,
  kind: 'job' | 'property',
  warnings: JobberNormalizationWarning[],
): string | null {
  const selectedId = suppliedId?.trim()
  if (selectedId && !ids.includes(selectedId)) {
    throw new Error(`Selected Jobber ${kind} was not found on the invoice`)
  }
  if (ids.length === 0) {
    warnings.push({ code: kind === 'job' ? 'no_invoice_jobs' : 'no_invoice_properties' })
    return null
  }
  if (ids.length === 1) return selectedId ?? ids[0]!
  if (!selectedId) throw new Error(`Select a Jobber ${kind} explicitly`)
  return selectedId
}

interface PaymentEvidence {
  legacy?: JobberInvoicePaymentRecord
  refund?: JobberPaymentRefund
  concrete?: JobberPaymentDetail
  conflict: boolean
}

async function normalizePayments(
  rows: readonly JobberInvoicePaymentRecord[],
  options: JobberInvoiceClientOptions,
  warnings: JobberNormalizationWarning[],
): Promise<readonly NormalizedJobberPayment[]> {
  // Phase 1: fetch each payment's refunds in parallel across payments. Refund pages for a
  // single payment stay sequential (cursor-dependent), but no payment depends on another.
  const refundsByRow = await mapWithConcurrency(rows, PAYMENT_FETCH_CONCURRENCY, (row) => (
    fetchAllJobberPages(async (after) => {
      const page = await fetchJobberPaymentRefundsPage(row.id, { first: PAGE_SIZE, after }, options)
      if (page === null) {
        if (after !== null) throw new Error('Jobber payment refunds could not be read completely')
        return { nodes: [], pageInfo: { endCursor: null, hasNextPage: false } }
      }
      return page
    })
  ))

  // Phase 2: merge evidence in original payment order (conflict detection is order-sensitive).
  const evidence = new Map<string, PaymentEvidence>()
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!
    const existingLegacy = evidence.get(row.id)
    evidence.set(row.id, {
      ...existingLegacy,
      legacy: row,
      conflict: (existingLegacy?.conflict ?? false)
        || (existingLegacy?.refund !== undefined && !sameLegacyRefund(row, existingLegacy.refund)),
    })
    for (const refund of refundsByRow[index]!) {
      const existing = evidence.get(refund.id)
      const conflictsWithExisting = existing?.refund
        ? !sameRefund(existing.refund, refund)
        : existing?.legacy
          ? !sameLegacyRefund(existing.legacy, refund)
          : false
      evidence.set(refund.id, {
        ...existing,
        refund,
        conflict: (existing?.conflict ?? false) || conflictsWithExisting,
      })
    }
  }

  // Fetch every payment detail in parallel; each detail only affects its own evidence entry.
  const evidenceEntries = [...evidence.entries()]
  const concretes = await mapWithConcurrency(
    evidenceEntries,
    PAYMENT_FETCH_CONCURRENCY,
    ([id]) => fetchJobberPaymentDetail(id, options),
  )
  for (let index = 0; index < evidenceEntries.length; index += 1) {
    const item = evidenceEntries[index]![1]
    const concrete = concretes[index]!
    if (concrete === null) throw new Error('Jobber payment detail was not found')
    item.concrete = concrete
    item.conflict = item.conflict || conflictsWithConcrete(item, concrete)
  }

  return Object.freeze(evidenceEntries.map(([id, item]) => normalizePayment(id, item, warnings)))
}

// Runs mapper over items with at most `limit` in flight. Results preserve input order.
// Fail-fast: the first rejection propagates (matching serial Promise.all semantics).
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index]!, index)
    }
  }
  const workerCount = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workerCount }, worker))
  return results
}

function normalizePayment(
  id: string,
  evidence: PaymentEvidence,
  warnings: JobberNormalizationWarning[],
): NormalizedJobberPayment {
  const isNestedRefund = evidence.refund !== undefined && evidence.legacy === undefined
  const adjustmentType = isNestedRefund ? 'REFUND' : evidence.concrete?.adjustmentType ?? evidence.legacy?.adjustmentType ?? 'REFUND'
  const amount = new Decimal(evidence.concrete?.amount ?? evidence.legacy?.amount ?? evidence.refund?.amount ?? '0').abs()
  const externalStatus = evidence.legacy?.jobberPaymentTransactionStatus
    ?? evidence.refund?.jobberPaymentTransactionStatus
    ?? null
  let direction = directionForAdjustment(adjustmentType)
  let treatment: 'active' | 'unconfirmed' = 'active'
  let effective = effectiveAmount(direction, amount)

  if (evidence.conflict) {
    direction = 'ambiguous'
    treatment = 'unconfirmed'
    effective = new Decimal(0)
    warnings.push({ code: 'ambiguous_payment_evidence', paymentId: id })
  } else if (direction === 'ambiguous') {
    treatment = 'unconfirmed'
    effective = new Decimal(0)
    warnings.push({
      code: adjustmentType === 'CORRECTION'
        ? 'ambiguous_payment_adjustment'
        : 'unknown_payment_adjustment_type',
      paymentId: id,
    })
  } else if (direction === 'excluded') {
    treatment = 'unconfirmed'
    effective = new Decimal(0)
  }

  if (externalStatus === null && evidence.concrete?.paymentType === 'JOBBER_PAYMENTS') {
    treatment = 'unconfirmed'
    effective = new Decimal(0)
    warnings.push({ code: 'missing_jobber_payment_status', paymentId: id })
  } else if (externalStatus !== null && !KNOWN_PAYMENT_STATUSES.has(externalStatus)) {
    treatment = 'unconfirmed'
    effective = new Decimal(0)
    warnings.push({ code: 'unknown_payment_status', paymentId: id })
  } else if (externalStatus !== null && INELIGIBLE_PAYMENT_STATUSES.has(externalStatus)) {
    treatment = 'unconfirmed'
    effective = new Decimal(0)
  }

  const concrete = evidence.concrete
  return Object.freeze({
    id,
    source: isNestedRefund ? 'nested_refund' : 'payment_record',
    rawAdjustmentType: adjustmentType,
    rawSignedAmount: concrete?.rawAmount ?? null,
    absoluteAmount: amount.toString(),
    direction,
    effectiveReceiptAmount: effective.toString(),
    entryDate: concrete?.entryDate ?? evidence.legacy?.entryDate ?? evidence.refund?.entryDate ?? '',
    method: concrete?.paymentType ?? evidence.legacy?.jobberPaymentPaymentMethod ?? null,
    reference: paymentReference(concrete),
    externalStatus,
    externalUpdatedAt: null,
    treatment,
  })
}

function paymentReference(payment: JobberPaymentDetail | undefined): string | null {
  if (payment === undefined) return null
  if (payment.typename === 'CheckPaymentRecord') return payment.checkNumber ?? payment.details
  if (
    payment.typename === 'JobberPaymentsACHPaymentRecord'
    || payment.typename === 'JobberPaymentsCreditCardPaymentRecord'
    || payment.typename === 'JobberPaymentsRefundPaymentRecord'
  ) {
    return payment.transactionId ?? payment.details
  }
  return payment.details
}

function directionForAdjustment(adjustmentType: string): JobberPaymentDirection {
  if (adjustmentType === 'PAYMENT' || adjustmentType === 'DEPOSIT') return 'receipt'
  if (adjustmentType === 'REFUND') return 'refund'
  if (adjustmentType === 'FAILED_ACH_PAYMENT') return 'reversal'
  if (adjustmentType === 'INVOICE' || adjustmentType === 'INITIAL_BALANCE' || adjustmentType === 'BAD_DEBT' || adjustmentType === 'VOIDED') return 'excluded'
  return 'ambiguous'
}

function effectiveAmount(direction: JobberPaymentDirection, amount: Decimal): Decimal {
  if (direction === 'receipt') return amount
  if (direction === 'refund' || direction === 'reversal') return amount.negated()
  return new Decimal(0)
}

function conflictsWithConcrete(evidence: PaymentEvidence, concrete: JobberPaymentDetail): boolean {
  if (evidence.legacy) {
    return !new Decimal(evidence.legacy.amount).eq(concrete.amount)
      || evidence.legacy.entryDate !== concrete.entryDate
      || evidence.legacy.adjustmentType !== concrete.adjustmentType
  }
  if (evidence.refund) {
    return !new Decimal(evidence.refund.amount).eq(concrete.amount)
      || evidence.refund.entryDate !== concrete.entryDate
      || concrete.adjustmentType !== 'REFUND'
  }
  return true
}

function sameRefund(left: JobberPaymentRefund, right: JobberPaymentRefund): boolean {
  return new Decimal(left.amount).eq(right.amount)
    && left.entryDate === right.entryDate
    && left.jobberPaymentTransactionStatus === right.jobberPaymentTransactionStatus
}

function sameLegacyRefund(left: JobberInvoicePaymentRecord, right: JobberPaymentRefund): boolean {
  return left.adjustmentType === 'REFUND'
    && new Decimal(left.amount).eq(right.amount)
    && left.entryDate === right.entryDate
    && left.jobberPaymentTransactionStatus === right.jobberPaymentTransactionStatus
}

function computeFingerprint(value: object): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).filter((key) => key !== 'fetchedAt' && key !== 'responseFingerprint').sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

function sortWarnings(warnings: readonly JobberNormalizationWarning[]): JobberNormalizationWarning[] {
  return [...warnings].sort((left, right) => (
    left.code.localeCompare(right.code) || (left.paymentId ?? '').localeCompare(right.paymentId ?? '')
  ))
}

function compareIds<T extends { readonly id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id)
}

function requireExternalId(value: string, message: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(message)
  return trimmed
}
