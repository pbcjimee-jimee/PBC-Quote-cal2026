'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from './types'
import {
  acceptProgressJobberInvoiceNumberObservation,
  linkProgressJobberInvoiceObservation,
  refreshProgressJobberInvoiceObservation,
  type RefreshJobberInvoiceResult,
} from '@/lib/progress-invoices/jobber-refresh-service'
import type { VersionedMutationRpcResult } from '@/lib/progress-invoices/repository'
import type { ProgressInvoiceSeriesDetail } from '@/lib/progress-invoices/series-service'
import {
  acceptProgressJobberInvoiceNumberSchema,
  linkProgressJobberInvoiceSchema,
  refreshProgressJobberInvoiceSchema,
} from '@/lib/progress-invoices/validators'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'

function validationFailure(): ActionResult<never> {
  return { ok: false, error: 'PROGRESS_VALIDATION_FAILED', code: 'VALIDATION' }
}

function revalidateSeries(seriesId: string, quoteId?: string | null): void {
  revalidatePath('/progress-invoices')
  revalidatePath(`/progress-invoices/${seriesId}`)
  if (quoteId) revalidatePath(`/quotes/${quoteId}`)
}

export async function linkJobberInvoice(
  input: unknown,
): Promise<ActionResult<{ seriesId: string; version: number }>> {
  const parsed = linkProgressJobberInvoiceSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  const allowed = await requireAllowedUser()
  if (!allowed.ok) return allowed
  const result = await linkProgressJobberInvoiceObservation(parsed.data, allowed.user.id)
  if (!result.ok) return result
  revalidateSeries(result.data.seriesId, result.data.quoteId)
  return {
    ok: true,
    data: { seriesId: result.data.seriesId, version: result.data.version },
  }
}

export async function refreshJobberInvoice(
  input: unknown,
): Promise<ActionResult<RefreshJobberInvoiceResult>> {
  const parsed = refreshProgressJobberInvoiceSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  const allowed = await requireAllowedUser()
  if (!allowed.ok) return allowed
  const result = await refreshProgressJobberInvoiceObservation(parsed.data, allowed.user.id)
  if (result.ok) revalidateSeries(result.data.seriesId)
  return result
}

export async function acceptObservedJobberInvoiceNumber(
  input: unknown,
): Promise<ActionResult<VersionedMutationRpcResult, ProgressInvoiceSeriesDetail>> {
  const parsed = acceptProgressJobberInvoiceNumberSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  const allowed = await requireAllowedUser()
  if (!allowed.ok) return allowed
  const result = await acceptProgressJobberInvoiceNumberObservation(parsed.data)
  if (result.ok) revalidateSeries(result.data.id)
  return result
}
