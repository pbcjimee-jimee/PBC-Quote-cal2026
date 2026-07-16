'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from './types'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import {
  approveProgressAdjustment as approveAdjustment,
  createProgressAdjustment as createAdjustment,
  supersedeProgressAdjustment as supersedeAdjustment,
  updateDraftProgressAdjustment as updateAdjustment,
  type ProgressAdjustmentDetail,
  type ProgressAdjustmentMutationResult,
} from '@/lib/progress-invoices/adjustment-service'
import {
  approveProgressAdjustmentSchema,
  createProgressAdjustmentSchema,
  supersedeProgressAdjustmentSchema,
  updateProgressAdjustmentDraftSchema,
} from '@/lib/progress-invoices/validators'

function validationFailure(): ActionResult<never> {
  return { ok: false, error: 'PROGRESS_VALIDATION_FAILED', code: 'VALIDATION' }
}

async function authorize(): Promise<ActionResult<true>> {
  const allowed = await requireAllowedUser()
  return allowed.ok ? { ok: true, data: true } : allowed
}

function revalidateSeries(seriesId: string): void {
  revalidatePath('/progress-invoices')
  revalidatePath(`/progress-invoices/${seriesId}`)
}

async function execute<TCurrent = never>(
  operation: () => Promise<ActionResult<ProgressAdjustmentMutationResult, TCurrent>>
): Promise<ActionResult<ProgressAdjustmentMutationResult, TCurrent>> {
  const authorized = await authorize()
  if (!authorized.ok) return authorized
  const result = await operation()
  if (result.ok) revalidateSeries(result.data.seriesId)
  return result
}

export async function createProgressAdjustment(
  input: unknown
): Promise<ActionResult<ProgressAdjustmentMutationResult>> {
  const parsed = createProgressAdjustmentSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  return execute(() => createAdjustment(parsed.data))
}

export async function updateDraftProgressAdjustment(
  input: unknown
): Promise<ActionResult<ProgressAdjustmentMutationResult, ProgressAdjustmentDetail>> {
  const parsed = updateProgressAdjustmentDraftSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  return execute(() => updateAdjustment(parsed.data))
}

export async function approveProgressAdjustment(
  input: unknown
): Promise<ActionResult<ProgressAdjustmentMutationResult, ProgressAdjustmentDetail>> {
  const parsed = approveProgressAdjustmentSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  return execute(() => approveAdjustment(parsed.data))
}

export async function supersedeProgressAdjustment(
  input: unknown
): Promise<ActionResult<ProgressAdjustmentMutationResult, ProgressAdjustmentDetail>> {
  const parsed = supersedeProgressAdjustmentSchema.safeParse(input)
  if (!parsed.success) return validationFailure()
  return execute(() => supersedeAdjustment(parsed.data))
}
