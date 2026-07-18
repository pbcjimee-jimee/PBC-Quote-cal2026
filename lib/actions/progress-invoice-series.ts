'use server'

import { revalidatePath } from 'next/cache'
import { z, type ZodError } from 'zod'

import type { ActionResult } from './types'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import {
  createManualProgressInvoiceSeries as createManualSeries,
  getBusinessInvoiceProfile as getProfile,
  getProgressInvoiceSeries as getSeries,
  listProgressInvoiceSeries as listSeries,
  saveBusinessInvoiceProfile as saveProfile,
  updateProgressInvoiceSeries as updateSeries,
  type BusinessInvoiceProfileDto,
  type ProgressInvoiceDashboardDto,
  type ProgressInvoiceListInput,
  type ProgressInvoiceSeriesDetail,
} from '@/lib/progress-invoices/series-service'
import type { VersionedMutationRpcResult } from '@/lib/progress-invoices/repository'
import {
  createManualProgressInvoiceSeriesSchema,
  progressInvoiceListSchema,
  progressInvoiceSeriesIdSchema,
  saveBusinessInvoiceProfileSchema,
  updateProgressInvoiceSeriesSchema,
} from '@/lib/progress-invoices/validators'
import {
  getProgressInvoiceSeriesWorkspace as getSeriesWorkspace,
  listProgressInvoiceSeriesHistory as listSeriesHistory,
  type ProgressInvoiceHistoryPageDto,
  type ProgressInvoiceSeriesWorkspaceDto,
} from '@/lib/progress-invoices/workspace-service'

const progressInvoiceHistoryInputSchema = z.object({
  seriesId: z.string().uuid(),
  cursor: z.string().uuid().nullable(),
  limit: z.number().int().min(1).max(50),
}).strict()

function validationFailure(): ActionResult<never> {
  return { ok: false, error: 'PROGRESS_VALIDATION_FAILED', code: 'VALIDATION' }
}

function manualValidationFailure(error: ZodError): ActionResult<never> {
  const invalidFields = new Set(error.issues.map((issue) => issue.path[0]))
  if (invalidFields.has('recipientEmail')) {
    return { ok: false, error: 'PROGRESS_EMAIL_INVALID', code: 'VALIDATION' }
  }
  if (invalidFields.has('recipientAbn')) {
    return { ok: false, error: 'PROGRESS_ABN_INVALID', code: 'VALIDATION' }
  }
  return validationFailure()
}

async function authorize(): Promise<ActionResult<true>> {
  const allowed = await requireAllowedUser()
  return allowed.ok ? { ok: true, data: true } : allowed
}

function revalidateSeries(id: string, quoteId?: string | null): void {
  revalidatePath('/progress-invoices')
  revalidatePath(`/progress-invoices/${id}`)
  if (quoteId) revalidatePath(`/quotes/${quoteId}`)
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

export async function getProgressInvoiceSeriesWorkspace(
  seriesId: unknown,
): Promise<ActionResult<ProgressInvoiceSeriesWorkspaceDto | null>> {
  const parsed = progressInvoiceSeriesIdSchema.safeParse(seriesId)
  if (!parsed.success) return validationFailure()
  const authorized = await authorize()
  return authorized.ok ? getSeriesWorkspace(parsed.data) : authorized
}

export async function listProgressInvoiceSeriesHistory(
  input: unknown,
): Promise<ActionResult<ProgressInvoiceHistoryPageDto>> {
  const parsed = progressInvoiceHistoryInputSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  const authorized = await authorize()
  return authorized.ok ? listSeriesHistory(parsed.data) : authorized
}

export async function createManualProgressInvoiceSeries(
  input: unknown
): Promise<ActionResult<VersionedMutationRpcResult>> {
  const parsed = createManualProgressInvoiceSeriesSchema.safeParse(input)
  if (!parsed.success) return manualValidationFailure(parsed.error)
  const authorized = await authorize()
  if (!authorized.ok) return authorized
  const result = await createManualSeries({
    ...parsed.data,
    sourceType: 'manual',
    gstRate: '0.10',
  })
  if (result.ok) {
    revalidateSeries(result.data.id)
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
  if (!result.ok) return result
  revalidateSeries(result.data.id, result.data.quoteId)
  return { ok: true, data: { id: result.data.id, version: result.data.version } }
}
