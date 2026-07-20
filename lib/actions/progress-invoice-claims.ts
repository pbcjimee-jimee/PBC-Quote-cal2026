'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from './types'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import {
  createProgressClaimDraft as createDraft,
  getProgressClaimDefaults as getDefaults,
  getProgressClaimEditor as getEditor,
  saveProgressClaimDraft as saveDraft,
  voidProgressClaimDraft as voidDraft,
  type ProgressClaimEditorDto,
  type VoidProgressClaimDraftResult,
} from '@/lib/progress-invoices/claim-service'
import {
  createProgressClaimDraftSchema,
  getProgressClaimDefaultsSchema,
  getProgressClaimEditorSchema,
  saveProgressClaimDraftSchema,
  voidProgressClaimDraftSchema,
} from '@/lib/progress-invoices/validators'

async function authorize(): Promise<ActionResult<true>> {
  const result = await requireAllowedUser()
  return result.ok ? { ok: true, data: true } : result
}

function invalid(): ActionResult<never> {
  return { ok: false, error: 'PROGRESS_VALIDATION_FAILED', code: 'VALIDATION' }
}

function revalidateClaim(editor: ProgressClaimEditorDto): void {
  revalidatePath('/progress-invoices')
  revalidatePath(`/progress-invoices/${editor.seriesId}`)
  if (editor.claimId) revalidatePath(`/progress-invoices/${editor.seriesId}/claims/${editor.claimId}`)
}

export async function getProgressClaimDefaults(input: unknown): Promise<ActionResult<ProgressClaimEditorDto | null>> {
  const authorized = await authorize()
  if (!authorized.ok) return authorized
  const parsed = getProgressClaimDefaultsSchema.safeParse(input)
  return parsed.success ? getDefaults(parsed.data) : invalid()
}

export async function getProgressClaimEditor(input: unknown): Promise<ActionResult<ProgressClaimEditorDto | null>> {
  const authorized = await authorize()
  if (!authorized.ok) return authorized
  const parsed = getProgressClaimEditorSchema.safeParse(input)
  return parsed.success ? getEditor(parsed.data) : invalid()
}

export async function createProgressClaimDraft(input: unknown): Promise<ActionResult<ProgressClaimEditorDto, ProgressClaimEditorDto>> {
  const authorized = await authorize()
  if (!authorized.ok) return authorized
  const parsed = createProgressClaimDraftSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const result = await createDraft(parsed.data)
  if (result.ok) revalidateClaim(result.data)
  return result
}

export async function saveProgressClaimDraft(input: unknown): Promise<ActionResult<ProgressClaimEditorDto, ProgressClaimEditorDto>> {
  const authorized = await authorize()
  if (!authorized.ok) return authorized
  const parsed = saveProgressClaimDraftSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const result = await saveDraft(parsed.data)
  if (result.ok) revalidateClaim(result.data)
  return result
}

export async function voidProgressClaimDraft(input: unknown): Promise<ActionResult<VoidProgressClaimDraftResult>> {
  const authorized = await authorize()
  if (!authorized.ok) return authorized
  const parsed = voidProgressClaimDraftSchema.safeParse(input)
  if (!parsed.success) return invalid()
  const result = await voidDraft(parsed.data)
  if (!result.ok) return result
  revalidatePath('/progress-invoices')
  revalidatePath(`/progress-invoices/${result.data.seriesId}`)
  revalidatePath(`/progress-invoices/${result.data.seriesId}/claims/${result.data.claimId}`)
  return result
}
