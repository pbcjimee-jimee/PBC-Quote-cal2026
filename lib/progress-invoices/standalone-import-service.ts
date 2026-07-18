import 'server-only'

import { createHash } from 'node:crypto'

import type { ActionResult } from '@/lib/actions/types'
import {
  classifyJobberInvoiceError,
  fetchJobberInvoiceObservation,
} from '@/lib/jobber/invoice-gateway'
import type { Json } from '@/lib/supabase/types'
import {
  buildProgressJobberObservationPayload,
  type ProgressJobberObservationPayload,
} from './jobber-refresh-service'
import {
  createProgressInvoiceRepository,
  createProgressInvoiceJobberPersistenceRepository,
  type CreateStandaloneProgressInvoiceFromJobberRpcResult,
  type ProgressInvoiceRepository,
  type StandaloneProgressInvoiceSeriesPayload,
} from './repository'
import type { CreateStandaloneProgressInvoiceFromJobberInput } from './validators'

function canonicalCommand(input: CreateStandaloneProgressInvoiceFromJobberInput) {
  return {
    selectedJobberInvoiceId: input.selectedJobberInvoiceId,
    selectedJobberJobId: input.selectedJobberJobId ?? null,
    selectedJobberPropertyId: input.selectedJobberPropertyId ?? null,
    baseContractExGst: input.baseContractExGst,
    gstRate: input.gstRate,
    recipientName: input.recipientName,
    recipientCompany: input.recipientCompany ?? null,
    recipientAddress: input.recipientAddress,
    recipientEmail: input.recipientEmail ?? null,
    recipientPhone: input.recipientPhone ?? null,
    recipientAbn: input.recipientAbn ?? null,
    siteName: input.siteName,
    siteAddress: input.siteAddress,
    defaultDescription: input.defaultDescription,
    reference: input.reference ?? null,
    correlationKey: input.correlationKey,
  }
}

function fingerprintCommand(input: CreateStandaloneProgressInvoiceFromJobberInput): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalCommand(input)))
    .digest('hex')
}

function mapEditableSeries(
  input: CreateStandaloneProgressInvoiceFromJobberInput,
): StandaloneProgressInvoiceSeriesPayload {
  return {
    source_type: 'jobber_invoice',
    quote_id: null,
    base_contract_ex_gst: input.baseContractExGst,
    gst_rate: input.gstRate,
    recipient_name: input.recipientName,
    recipient_company: input.recipientCompany ?? null,
    recipient_address: input.recipientAddress,
    recipient_email: input.recipientEmail ?? null,
    recipient_phone: input.recipientPhone ?? null,
    recipient_abn: input.recipientAbn ?? null,
    site_name: input.siteName,
    site_address: input.siteAddress,
    default_description: input.defaultDescription,
    reference: input.reference ?? null,
    correlation_key: input.correlationKey,
  }
}

interface ExistingProgressInvoiceSeries {
  series_id: string
  version: number
}

type ExistingSeriesLookup =
  | { status: 'found'; series: ExistingProgressInvoiceSeries }
  | { status: 'not_found' }
  | { status: 'unavailable' }

const ACTIVE_LIFECYCLE_STATUSES = [
  'draft',
  'active',
  'completed',
  'reconciliation_required',
] as const
const LOOKUP_PAGE_SIZE = 100

async function scanExistingSeries(
  repository: ProgressInvoiceRepository,
  observation: ProgressJobberObservationPayload,
  query: string,
  checkedSeriesIds: Set<string>,
): Promise<ExistingSeriesLookup> {
  for (let page = 1; ; page += 1) {
    const listed = await repository.call('list_progress_invoice_series', {
      query,
      statuses: [...ACTIVE_LIFECYCLE_STATUSES],
      page,
      page_size: LOOKUP_PAGE_SIZE,
      quote_id: null,
    })
    if (!listed.ok) return { status: 'unavailable' }

    for (const candidate of listed.data.items) {
      if (checkedSeriesIds.has(candidate.id)) continue
      checkedSeriesIds.add(candidate.id)
      const context = await repository.call('get_progress_invoice_jobber_context', {
        series_id: candidate.id,
      })
      if (!context.ok) {
        if (context.error === 'PROGRESS_JOBBER_ERROR') continue
        return { status: 'unavailable' }
      }
      if (context.data.jobber_account_id === observation.account_id
        && context.data.jobber_invoice_id === observation.invoice_id) {
        return {
          status: 'found',
          series: {
            series_id: context.data.series_id,
            version: context.data.series_version,
          },
        }
      }
    }

    if (page * LOOKUP_PAGE_SIZE >= listed.data.total) return { status: 'not_found' }
  }
}

async function findExistingSeries(
  observation: ProgressJobberObservationPayload,
): Promise<ExistingSeriesLookup> {
  try {
    const repository = await createProgressInvoiceRepository()
    const checkedSeriesIds = new Set<string>()
    const targeted = await scanExistingSeries(
      repository,
      observation,
      observation.invoice_number,
      checkedSeriesIds,
    )
    if (targeted.status !== 'not_found') return targeted
    return await scanExistingSeries(repository, observation, '', checkedSeriesIds)
  } catch {
    return { status: 'unavailable' }
  }
}

function duplicateFailure(
  series: ExistingProgressInvoiceSeries,
): ActionResult<never, ExistingProgressInvoiceSeries> {
  return {
    ok: false,
    error: 'PROGRESS_JOBBER_ALREADY_IMPORTED',
    code: 'VALIDATION',
    current: series,
  }
}

export async function createStandaloneProgressInvoiceFromJobberService(
  input: CreateStandaloneProgressInvoiceFromJobberInput,
  actorId: string,
): Promise<ActionResult<
  CreateStandaloneProgressInvoiceFromJobberRpcResult,
  ExistingProgressInvoiceSeries
>> {
  let observation: ProgressJobberObservationPayload
  try {
    const fetched = await fetchJobberInvoiceObservation({
      jobberInvoiceId: input.selectedJobberInvoiceId,
      ...(input.selectedJobberJobId
        ? { selectedJobberJobId: input.selectedJobberJobId }
        : {}),
      ...(input.selectedJobberPropertyId
        ? { selectedJobberPropertyId: input.selectedJobberPropertyId }
        : {}),
    })
    observation = buildProgressJobberObservationPayload(fetched)
  } catch (error) {
    const safe = classifyJobberInvoiceError(error)
    return { ok: false, error: safe.code, code: 'JOBBER_ERROR' }
  }

  const existing = await findExistingSeries(observation)
  if (existing.status === 'found') return duplicateFailure(existing.series)

  try {
    const persistenceRepository = await createProgressInvoiceJobberPersistenceRepository()
    const created = await persistenceRepository.call('create_progress_invoice_series_from_jobber', {
      actor_id: actorId,
      correlation_key: input.correlationKey,
      request_fingerprint: fingerprintCommand(input),
      series: mapEditableSeries(input),
      observation: observation as unknown as Json,
    })
    if (!created.ok && created.code === 'JOBBER_ERROR') {
      const postflight = await findExistingSeries(observation)
      if (postflight.status === 'found') return duplicateFailure(postflight.series)
    }
    return created
  } catch {
    return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  }
}
