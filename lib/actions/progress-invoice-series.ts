'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from './types'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import {
  createProgressInvoiceSeries as createSeries,
  getBusinessInvoiceProfile as getProfile,
  getProgressInvoiceCreatePrefill as getCreatePrefill,
  getProgressInvoiceSeries as getSeries,
  listProgressInvoiceSeries as listSeries,
  saveBusinessInvoiceProfile as saveProfile,
  updateProgressInvoiceSeries as updateSeries,
  type BusinessInvoiceProfileDto,
  type ProgressInvoiceCreatePrefill,
  type ProgressInvoiceDashboardDto,
  type ProgressInvoiceListInput,
  type ProgressInvoiceSeriesDetail,
} from '@/lib/progress-invoices/series-service'
import type { VersionedMutationRpcResult } from '@/lib/progress-invoices/repository'
import {
  createProgressInvoiceSeriesSchema,
  progressInvoiceCreatePrefillSchema,
  progressInvoiceListSchema,
  progressInvoiceSeriesIdSchema,
  saveBusinessInvoiceProfileSchema,
  updateProgressInvoiceSeriesSchema,
} from '@/lib/progress-invoices/validators'

function validationFailure(): ActionResult<never> {
  return { ok: false, error: 'PROGRESS_VALIDATION_FAILED', code: 'VALIDATION' }
}

async function authorize(): Promise<ActionResult<true>> {
  const allowed = await requireAllowedUser()
  return allowed.ok ? { ok: true, data: true } : allowed
}

function revalidateSeries(id: string): void {
  revalidatePath('/progress-invoices')
  revalidatePath(`/progress-invoices/${id}`)
}

export async function getBusinessInvoiceProfile(): Promise<ActionResult<BusinessInvoiceProfileDto | null>> {
  const authorized = await authorize()
  return authorized.ok ? getProfile() : authorized
}

export async function saveBusinessInvoiceProfile(input: unknown): Promise<ActionResult<BusinessInvoiceProfileDto>> {
  const parsed = saveBusinessInvoiceProfileSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  const authorized = await authorize()
  if (!authorized.ok) return authorized
  const result = await saveProfile(parsed.data)
  if (result.ok) revalidatePath('/settings/invoice')
  return result
}

export async function listProgressInvoiceSeries(
  input: ProgressInvoiceListInput
): Promise<ActionResult<ProgressInvoiceDashboardDto>> {
  const parsed = progressInvoiceListSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  const authorized = await authorize()
  return authorized.ok ? listSeries(parsed.data) : authorized
}

export async function getProgressInvoiceSeries(
  seriesId: string
): Promise<ActionResult<ProgressInvoiceSeriesDetail | null>> {
  const parsed = progressInvoiceSeriesIdSchema.safeParse(seriesId)
  if (!parsed.success) return validationFailure()
  const authorized = await authorize()
  return authorized.ok ? getSeries(parsed.data) : authorized
}

export async function getProgressInvoiceCreatePrefill(
  input: { quoteId: string } | { standalone: true }
): Promise<ActionResult<ProgressInvoiceCreatePrefill>> {
  const parsed = progressInvoiceCreatePrefillSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  const authorized = await authorize()
  return authorized.ok ? getCreatePrefill(parsed.data) : authorized
}

export async function createProgressInvoiceSeries(
  input: unknown
): Promise<ActionResult<VersionedMutationRpcResult>> {
  const parsed = createProgressInvoiceSeriesSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  const authorized = await authorize()
  if (!authorized.ok) return authorized
  const result = await createSeries(parsed.data)
  if (result.ok) {
    revalidateSeries(result.data.id)
    if (parsed.data.sourceType === 'pbc_quote' && parsed.data.pbcQuoteId) {
      revalidatePath(`/quotes/${parsed.data.pbcQuoteId}`)
    }
  }
  return result
}

export async function updateProgressInvoiceSeries(
  input: unknown
): Promise<ActionResult<VersionedMutationRpcResult, ProgressInvoiceSeriesDetail>> {
  const parsed = updateProgressInvoiceSeriesSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  const authorized = await authorize()
  if (!authorized.ok) return authorized
  const result = await updateSeries(parsed.data)
  if (result.ok) revalidateSeries(result.data.id)
  return result
}
