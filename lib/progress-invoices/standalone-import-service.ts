import 'server-only'

import { createHash } from 'node:crypto'

import type { ActionResult } from '@/lib/actions/types'
import {
  classifyJobberInvoiceError,
  fetchJobberInvoiceObservation,
} from '@/lib/jobber/invoice-gateway'
import type { Json } from '@/lib/supabase/types'
import { buildProgressJobberObservationPayload } from './jobber-refresh-service'
import {
  createProgressInvoiceJobberPersistenceRepository,
  type CreateStandaloneProgressInvoiceFromJobberRpcResult,
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

export async function createStandaloneProgressInvoiceFromJobberService(
  input: CreateStandaloneProgressInvoiceFromJobberInput,
  actorId: string,
): Promise<ActionResult<CreateStandaloneProgressInvoiceFromJobberRpcResult>> {
  let observation: Json
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
    observation = buildProgressJobberObservationPayload(fetched) as unknown as Json
  } catch (error) {
    const safe = classifyJobberInvoiceError(error)
    return { ok: false, error: safe.code, code: 'JOBBER_ERROR' }
  }

  try {
    const repository = await createProgressInvoiceJobberPersistenceRepository()
    return await repository.call('create_progress_invoice_series_from_jobber', {
      actor_id: actorId,
      correlation_key: input.correlationKey,
      request_fingerprint: fingerprintCommand(input),
      series: mapEditableSeries(input),
      observation,
    })
  } catch {
    return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  }
}
