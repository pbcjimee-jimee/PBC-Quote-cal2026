'use server'

import { revalidatePath } from 'next/cache'

import type { ActionResult } from './types'
import { requireAllowedUser } from '@/lib/security/require-allowed-user'
import {
  createManualProgressPayment as createPayment,
  reconcileProgressPayment as reconcilePayment,
  replaceManualProgressPayment as replacePayment,
  undoProgressPaymentReconciliation as undoReconciliation,
  voidManualProgressPayment as voidPayment,
  type ProgressPaymentMutationResult,
  type ProgressPaymentStaleCurrent,
} from '@/lib/progress-invoices/payment-service'
import type { VersionedMutationRpcResult } from '@/lib/progress-invoices/repository'
import {
  createManualProgressPaymentSchema,
  reconcileProgressPaymentSchema,
  replaceManualProgressPaymentSchema,
  undoProgressPaymentReconciliationSchema,
  voidManualProgressPaymentSchema,
} from '@/lib/progress-invoices/validators'

function validationFailure(): ActionResult<never> {
  return { ok: false, error: 'PROGRESS_VALIDATION_FAILED', code: 'VALIDATION' }
}

async function execute(
  operation: () => Promise<ActionResult<ProgressPaymentMutationResult, ProgressPaymentStaleCurrent>>,
): Promise<ActionResult<VersionedMutationRpcResult, ProgressPaymentStaleCurrent>> {
  const allowed = await requireAllowedUser()
  if (!allowed.ok) return allowed
  const result = await operation()
  if (!result.ok) return result
  revalidatePath('/progress-invoices')
  revalidatePath(`/progress-invoices/${result.data.seriesId}`)
  return { ok: true, data: { id: result.data.id, version: result.data.version } }
}

export async function createManualProgressPayment(
  input: unknown,
): Promise<ActionResult<VersionedMutationRpcResult, ProgressPaymentStaleCurrent>> {
  const parsed = createManualProgressPaymentSchema.safeParse(input)
  return parsed.success ? execute(() => createPayment(parsed.data)) : validationFailure()
}

export async function replaceManualProgressPayment(
  input: unknown,
): Promise<ActionResult<VersionedMutationRpcResult, ProgressPaymentStaleCurrent>> {
  const parsed = replaceManualProgressPaymentSchema.safeParse(input)
  return parsed.success ? execute(() => replacePayment(parsed.data)) : validationFailure()
}

export async function voidManualProgressPayment(
  input: unknown,
): Promise<ActionResult<VersionedMutationRpcResult, ProgressPaymentStaleCurrent>> {
  const parsed = voidManualProgressPaymentSchema.safeParse(input)
  return parsed.success ? execute(() => voidPayment(parsed.data)) : validationFailure()
}

export async function reconcileProgressPayment(
  input: unknown,
): Promise<ActionResult<VersionedMutationRpcResult, ProgressPaymentStaleCurrent>> {
  const parsed = reconcileProgressPaymentSchema.safeParse(input)
  return parsed.success ? execute(() => reconcilePayment(parsed.data)) : validationFailure()
}

export async function undoProgressPaymentReconciliation(
  input: unknown,
): Promise<ActionResult<VersionedMutationRpcResult, ProgressPaymentStaleCurrent>> {
  const parsed = undoProgressPaymentReconciliationSchema.safeParse(input)
  return parsed.success ? execute(() => undoReconciliation(parsed.data)) : validationFailure()
}
