import 'server-only'

import { createHash } from 'node:crypto'

import type { ActionResult } from '@/lib/actions/types'
import {
  classifyJobberInvoiceError,
  fetchJobberInvoiceObservation,
} from '@/lib/jobber/invoice-gateway'
import type {
  JobberAddress,
  NormalizedJobberInvoiceObservation,
} from '@/lib/jobber/invoice-types'
import type { Json } from '@/lib/supabase/types'
import {
  createProgressInvoiceJobberPersistenceRepository,
  createProgressInvoiceRepository,
  type ProgressInvoiceSeriesRpcDetail,
  type RefreshProgressJobberInvoiceRpcResult,
  type VersionedMutationRpcResult,
} from './repository'
import { mapSeriesDetail, type ProgressInvoiceSeriesDetail } from './series-service'
import type {
  AcceptProgressJobberInvoiceNumberInput,
  LinkProgressJobberInvoiceInput,
  RefreshProgressJobberInvoiceInput,
} from './validators'

const MAX_JOBBER_ID_LENGTH = 512
const MAX_CONTACT_CANDIDATES = 20

export interface ProgressJobberPaymentPayload {
  jobber_payment_id: string
  source: 'payment_record' | 'nested_refund'
  raw_adjustment_type: string
  raw_signed_amount: string | null
  absolute_amount: string
  direction: 'receipt' | 'refund' | 'reversal' | 'ambiguous' | 'excluded'
  effective_amount: string
  entry_date: string
  method: string | null
  reference: string | null
  external_status: string | null
  external_updated_at: string | null
  treatment: 'active' | 'unconfirmed'
}

export interface ProgressJobberObservationPayload {
  account_id: string
  invoice_id: string
  invoice_number: string
  raw_status: string
  normalized_status: 'draft' | 'awaiting_payment' | 'paid' | 'past_due' | 'unknown'
  jobber_web_uri: string
  invoice_subtotal: string | null
  invoice_tax_amount: string | null
  invoice_total: string | null
  invoice_balance: string | null
  invoice_payments_total: string | null
  invoice_issued_date: string | null
  invoice_due_date: string | null
  invoice_received_date: string | null
  external_created_at: string
  external_updated_at: string
  client_id: string | null
  client_name: string | null
  client_company_name: string | null
  client_email: string | null
  client_phone: string | null
  client_email_candidates: string[]
  client_phone_candidates: Array<{ number: string; primary: boolean }>
  billing_address: string | null
  job_ids: string[]
  property_ids: string[]
  site_address_candidates: Array<{ property_id: string; address: string | null }>
  selected_job_id: string | null
  selected_property_id: string | null
  effective_graphql_version: string
  payment_eligibility_policy_version: string
  fetched_at: string
  response_fingerprint: string
  warnings: Array<{ code: string; payment_id?: string }>
  payments: ProgressJobberPaymentPayload[]
}

export interface RefreshJobberInvoiceResult {
  seriesId: string
  snapshotId: string
  seriesVersion: number
  insertedPayments: number
  revisedPayments: number
  unconfirmedPayments: number
}

export interface LinkJobberInvoiceResult {
  seriesId: string
  version: number
  quoteId: string | null
}

function progressJobberError(): Error {
  return new Error('PROGRESS_JOBBER_ERROR')
}

function assertBounded(value: string, maxLength = MAX_JOBBER_ID_LENGTH): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) throw progressJobberError()
  return trimmed
}

function requireOffsetTimestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw progressJobberError()
  }
  if (!Number.isFinite(Date.parse(value))) throw progressJobberError()
  return value
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

export function toSydneyCalendarDate(value: string): string {
  if (validDateOnly(value)) return value
  requireOffsetTimestamp(value)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  const result = `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`
  if (!validDateOnly(result)) throw progressJobberError()
  return result
}

function optionalSydneyDate(value: string | null): string | null {
  return value === null ? null : toSydneyCalendarDate(value)
}

function formatAddress(address: JobberAddress | null): string | null {
  if (address === null) return null
  const locality = [address.city, address.province, address.postalCode]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
  const formatted = [
    address.street1,
    address.street2,
    locality,
    address.country,
  ]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join(', ')
  return formatted ? assertBounded(formatted, 2048) : null
}

function contactEmails(observation: NormalizedJobberInvoiceObservation): {
  candidates: string[]
  selected: string | null
} {
  const candidates = observation.client?.emails
    .map((email) => assertBounded(email, 254))
    ?? []
  if (candidates.length > MAX_CONTACT_CANDIDATES) throw progressJobberError()
  const unique = new Map<string, string>()
  for (const candidate of candidates) {
    const key = candidate.toLocaleLowerCase('en-AU')
    if (!unique.has(key)) unique.set(key, candidate)
  }
  return {
    candidates: [...unique.values()],
    selected: unique.size === 1 ? [...unique.values()][0] ?? null : null,
  }
}

function contactPhones(observation: NormalizedJobberInvoiceObservation): {
  candidates: Array<{ number: string; primary: boolean }>
  selected: string | null
} {
  const rawCandidates = observation.client?.phones.map((phone) => ({
    number: assertBounded(phone.number, 40),
    primary: phone.primary,
  })) ?? []
  if (rawCandidates.length > MAX_CONTACT_CANDIDATES) throw progressJobberError()
  const deduplicated = new Map<string, { number: string; primary: boolean }>()
  for (const phone of rawCandidates) {
    const existing = deduplicated.get(phone.number)
    deduplicated.set(phone.number, {
      number: existing?.number ?? phone.number,
      primary: (existing?.primary ?? false) || phone.primary,
    })
  }
  const candidates = [...deduplicated.values()]
  const primary = candidates.filter((phone) => phone.primary)
  if (primary.length === 1) return { candidates, selected: primary[0]?.number ?? null }
  if (primary.length > 1) return { candidates, selected: null }
  const unique = [...new Set(candidates.map((phone) => phone.number))]
  return { candidates, selected: unique.length === 1 ? unique[0] ?? null : null }
}

export function buildProgressJobberObservationPayload(
  observation: NormalizedJobberInvoiceObservation,
): ProgressJobberObservationPayload {
  const emails = contactEmails(observation)
  const phones = contactPhones(observation)
  const jobs = observation.jobs.map(({ id }) => assertBounded(id))
  const properties = observation.properties.map((property) => ({
    property_id: assertBounded(property.id),
    address: formatAddress(property.address),
  }))
  if (jobs.length > 100 || properties.length > 100) throw progressJobberError()

  return {
    account_id: assertBounded(observation.accountId),
    invoice_id: assertBounded(observation.invoiceId),
    invoice_number: assertBounded(observation.invoiceNumber, 120),
    raw_status: assertBounded(observation.rawStatus, 120),
    normalized_status: observation.normalizedStatus,
    jobber_web_uri: assertBounded(observation.jobberWebUri, 2048),
    invoice_subtotal: observation.amounts?.subtotal ?? null,
    invoice_tax_amount: observation.amounts?.taxAmount ?? null,
    invoice_total: observation.amounts?.total ?? null,
    invoice_balance: observation.amounts?.invoiceBalance ?? null,
    invoice_payments_total: observation.amounts?.paymentsTotal ?? null,
    invoice_issued_date: optionalSydneyDate(observation.issuedDate),
    invoice_due_date: optionalSydneyDate(observation.dueDate),
    invoice_received_date: optionalSydneyDate(observation.receivedDate),
    external_created_at: requireOffsetTimestamp(observation.createdAt),
    external_updated_at: requireOffsetTimestamp(observation.updatedAt),
    client_id: observation.client === null ? null : assertBounded(observation.client.id),
    client_name: observation.client?.name
      ? assertBounded(observation.client.name, 160)
      : null,
    client_company_name: observation.client?.companyName
      ? assertBounded(observation.client.companyName, 160)
      : null,
    client_email: emails.selected,
    client_phone: phones.selected,
    client_email_candidates: emails.candidates,
    client_phone_candidates: phones.candidates,
    billing_address: formatAddress(observation.billingAddress),
    job_ids: jobs,
    property_ids: properties.map(({ property_id }) => property_id),
    site_address_candidates: properties,
    selected_job_id: observation.selectedJobberJobId === null
      ? null
      : assertBounded(observation.selectedJobberJobId),
    selected_property_id: observation.selectedJobberPropertyId === null
      ? null
      : assertBounded(observation.selectedJobberPropertyId),
    effective_graphql_version: assertBounded(observation.effectiveGraphqlVersion, 40),
    payment_eligibility_policy_version: assertBounded(
      observation.paymentEligibilityPolicyVersion,
      80,
    ),
    fetched_at: requireOffsetTimestamp(observation.fetchedAt),
    response_fingerprint: assertBounded(observation.responseFingerprint, 128),
    warnings: observation.warnings.map((warning) => ({
      code: warning.code,
      ...(warning.paymentId ? { payment_id: assertBounded(warning.paymentId) } : {}),
    })),
    payments: observation.payments.map((payment) => ({
      jobber_payment_id: assertBounded(payment.id),
      source: payment.source,
      raw_adjustment_type: assertBounded(payment.rawAdjustmentType, 120),
      raw_signed_amount: payment.rawSignedAmount,
      absolute_amount: payment.absoluteAmount,
      direction: payment.direction,
      effective_amount: payment.effectiveReceiptAmount,
      entry_date: toSydneyCalendarDate(payment.entryDate),
      method: payment.method === null ? null : assertBounded(payment.method, 120),
      reference: payment.reference === null ? null : assertBounded(payment.reference, 240),
      external_status: payment.externalStatus === null
        ? null
        : assertBounded(payment.externalStatus, 120),
      external_updated_at: payment.externalUpdatedAt,
      treatment: payment.treatment,
    })),
  }
}

function requestFingerprint(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function asJson(value: ProgressJobberObservationPayload): Json {
  return value as unknown as Json
}

export async function linkProgressJobberInvoiceObservation(
  input: LinkProgressJobberInvoiceInput,
  actorId: string,
): Promise<ActionResult<LinkJobberInvoiceResult>> {
  let normalized: ProgressJobberObservationPayload
  try {
    const observation = await fetchJobberInvoiceObservation({
      jobberInvoiceId: input.selectedJobberInvoiceId,
      ...(input.selectedJobberJobId
        ? { selectedJobberJobId: input.selectedJobberJobId }
        : {}),
      ...(input.selectedJobberPropertyId
        ? { selectedJobberPropertyId: input.selectedJobberPropertyId }
        : {}),
    })
    normalized = buildProgressJobberObservationPayload(observation)
  } catch (error) {
    const safe = classifyJobberInvoiceError(error)
    return { ok: false, error: safe.code, code: 'JOBBER_ERROR' }
  }

  try {
    const repository = await createProgressInvoiceJobberPersistenceRepository()
    const result = await repository.call('link_progress_jobber_invoice', {
      actor_id: actorId,
      series_id: input.seriesId,
      expected_version: input.expectedVersion,
      correlation_key: input.correlationKey,
      request_fingerprint: requestFingerprint({
        seriesId: input.seriesId,
        invoiceId: normalized.invoice_id,
        selectedJobId: normalized.selected_job_id,
        selectedPropertyId: normalized.selected_property_id,
        observationFingerprint: normalized.response_fingerprint,
      }),
      observation: asJson(normalized),
    })
    return result.ok
      ? {
          ok: true,
          data: {
            seriesId: result.data.series_id,
            version: result.data.version,
            quoteId: result.data.quote_id,
          },
        }
      : result
  } catch {
    return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  }
}

function mapRefreshResult(row: RefreshProgressJobberInvoiceRpcResult): RefreshJobberInvoiceResult {
  return {
    seriesId: row.series_id,
    snapshotId: row.snapshot_id,
    seriesVersion: row.series_version,
    insertedPayments: row.inserted_payments,
    revisedPayments: row.revised_payments,
    unconfirmedPayments: row.unconfirmed_payments,
  }
}

export async function refreshProgressJobberInvoiceObservation(
  input: RefreshProgressJobberInvoiceInput,
  actorId: string,
): Promise<ActionResult<RefreshJobberInvoiceResult>> {
  const context = await (async () => {
    try {
      const authenticatedRepository = await createProgressInvoiceRepository()
      return await authenticatedRepository.call(
        'get_progress_invoice_jobber_context',
        { series_id: input.seriesId },
      )
    } catch {
      return null
    }
  })()
  if (context === null) return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  if (!context.ok) return context
  if (context.data.series_version !== input.expectedVersion) {
    return {
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
    }
  }

  const persistenceRepository = await (async () => {
    try {
      return await createProgressInvoiceJobberPersistenceRepository()
    } catch {
      return null
    }
  })()
  if (persistenceRepository === null) {
    return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  }
  let normalized: ProgressJobberObservationPayload
  try {
    const observation = await fetchJobberInvoiceObservation({
      jobberInvoiceId: context.data.jobber_invoice_id,
      ...(context.data.selected_jobber_job_id
        ? { selectedJobberJobId: context.data.selected_jobber_job_id }
        : {}),
      ...(context.data.selected_jobber_property_id
        ? { selectedJobberPropertyId: context.data.selected_jobber_property_id }
        : {}),
    })
    normalized = buildProgressJobberObservationPayload(observation)
  } catch (error) {
    const safe = classifyJobberInvoiceError(error)
    try {
      await persistenceRepository.call('record_progress_jobber_refresh_failure', {
        actor_id: actorId,
        series_id: input.seriesId,
        expected_version: input.expectedVersion,
        jobber_account_id: context.data.jobber_account_id,
        jobber_invoice_id: context.data.jobber_invoice_id,
        idempotency_key: input.idempotencyKey,
        error_code: safe.code,
      })
    } catch {
      // The original safe Jobber failure remains the user-facing result.
    }
    return { ok: false, error: safe.code, code: 'JOBBER_ERROR' }
  }

  try {
    const result = await persistenceRepository.call(
      'apply_progress_invoice_jobber_refresh',
      {
        actor_id: actorId,
        series_id: input.seriesId,
        expected_version: input.expectedVersion,
        idempotency_key: input.idempotencyKey,
        request_fingerprint: requestFingerprint({
          seriesId: input.seriesId,
          accountId: context.data.jobber_account_id,
          invoiceId: context.data.jobber_invoice_id,
          selectedJobId: context.data.selected_jobber_job_id,
          selectedPropertyId: context.data.selected_jobber_property_id,
          observationFingerprint: normalized.response_fingerprint,
        }),
        observation: asJson(normalized),
      },
    )
    return result.ok ? { ok: true, data: mapRefreshResult(result.data) } : result
  } catch {
    return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  }
}

function mapConflictCurrent(
  current: ProgressInvoiceSeriesRpcDetail | undefined,
): ProgressInvoiceSeriesDetail | undefined {
  return current ? mapSeriesDetail(current) : undefined
}

export async function acceptProgressJobberInvoiceNumberObservation(
  input: AcceptProgressJobberInvoiceNumberInput,
): Promise<ActionResult<VersionedMutationRpcResult, ProgressInvoiceSeriesDetail>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('accept_progress_jobber_invoice_number', {
    series_id: input.seriesId,
    expected_version: input.expectedVersion,
    observation_id: input.observationId,
    number_source: input.numberSource,
    idempotency_key: input.idempotencyKey,
  })
  if (result.ok) return result
  return {
    ok: false,
    error: result.error,
    ...(result.code ? { code: result.code } : {}),
    ...(result.current ? { current: mapConflictCurrent(result.current) } : {}),
  }
}
