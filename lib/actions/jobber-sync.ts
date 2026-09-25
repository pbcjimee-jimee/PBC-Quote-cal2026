'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireRole } from '@/lib/security/require-app-user'
import { createClient } from '@/lib/supabase/server'
import { isJobberDisabledInPreview, JOBBER_DISABLED_MESSAGE } from '@/lib/jobber/environment'
import type { SyncOperation, SyncOperationStatus, SyncRunResult } from '@/lib/jobber/sync-types'
import {
  checkJobberSyncOperation,
  getJobberSyncOperationForQuote,
} from '@/lib/jobber/sync-runner'
import { isDevNoAuthMode, type ActionResult } from './types'

const quoteIdSchema = z.string().uuid()
const SAFE_FAILURE_CODES = new Set([
  'legacy_unjournaled',
  'legacy_total_unjournaled',
  'lease_expired',
  'line_kind_mismatch',
  'mutation_begun',
  'operation_uncertain',
  'preflight_failed',
  'quote_changed',
])

const RECONCILIATION_FAILURE_MESSAGES = {
  remoteRead: 'Jobber could not be checked. No changes were sent. This sync remains blocked; try again or inspect it manually.',
  mismatch: 'Jobber does not match the recorded sync result. Nothing was resent. This sync remains blocked for manual inspection.',
  resolve: 'Jobber was verified, but the local sync result could not be saved. Nothing was resent. This sync remains blocked; try again or inspect it manually.',
  readback: 'The local sync result could not be confirmed after checking Jobber. Nothing was resent. Refresh and inspect the current status before taking further action.',
  blocked: 'This sync could not be confirmed safely. Nothing was resent. It remains blocked for manual inspection.',
} as const

export type SyncState = {
  operationId: string
  status: SyncOperationStatus
  failureCode: string | null
  isCurrentVersion: boolean
  canRetry: boolean
}

function safeFailureCode(code: string | null): string | null {
  if (code === null) return null
  return SAFE_FAILURE_CODES.has(code) ? code : 'sync_failed'
}

async function readQuoteVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  quoteId: string,
): Promise<{ id: string; version: number }> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, version')
    .eq('id', quoteId)
    .is('deleted_at', null)
    .single()
  if (error || !data) throw new Error('Quote unavailable')
  return data
}

function toSyncState(
  operation: SyncOperation,
  quote: { id: string; version: number },
): SyncState {
  const isCurrentVersion = operation.quote_id === quote.id && operation.quote_version === quote.version
  return {
    operationId: operation.id,
    status: operation.status,
    failureCode: safeFailureCode(operation.failure_code),
    isCurrentVersion,
    canRetry: isCurrentVersion && (operation.status === 'queued' || operation.status === 'retryable'),
  }
}

function validateQuoteId(quoteId: string): ActionResult<string> {
  const parsed = quoteIdSchema.safeParse(quoteId)
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: 'Invalid quote id' }
}

function reconciliationFailureMessage(
  result: Exclude<SyncRunResult, { status: 'succeeded' }>,
): string {
  if (result.reason === 'remote_read_failed') return RECONCILIATION_FAILURE_MESSAGES.remoteRead
  if (result.reason === 'remote_state_mismatch') return RECONCILIATION_FAILURE_MESSAGES.mismatch
  if (result.reason === 'resolve_failed') return RECONCILIATION_FAILURE_MESSAGES.resolve
  if (
    result.reason === 'readback_failed' ||
    result.reason === 'invalid_operation_readback' ||
    result.reason === 'resolve_not_confirmed'
  ) {
    return RECONCILIATION_FAILURE_MESSAGES.readback
  }
  return RECONCILIATION_FAILURE_MESSAGES.blocked
}

export async function getJobberSyncState(
  quoteId: string,
): Promise<ActionResult<SyncState | null>> {
  const validated = validateQuoteId(quoteId)
  if (!validated.ok) return validated
  if (isJobberDisabledInPreview()) {
    return { ok: false, error: JOBBER_DISABLED_MESSAGE }
  }
  if (isDevNoAuthMode()) {
    return { ok: false, error: 'Jobber sync status is unavailable in preview mode' }
  }

  const allowedUser = await requireRole('admin')
  if (!allowedUser.ok) return allowedUser

  try {
    const supabase = await createClient()
    const quote = await readQuoteVersion(supabase, validated.data)
    const operation = await getJobberSyncOperationForQuote(supabase, validated.data)
    return { ok: true, data: operation ? toSyncState(operation, quote) : null }
  } catch {
    return { ok: false, error: 'Unable to check Jobber sync status. Please try again.' }
  }
}

export async function checkJobberQuoteSync(
  quoteId: string,
): Promise<ActionResult<{ id: string }>> {
  const validated = validateQuoteId(quoteId)
  if (!validated.ok) return validated
  if (isJobberDisabledInPreview()) {
    return { ok: false, error: JOBBER_DISABLED_MESSAGE }
  }
  if (isDevNoAuthMode()) {
    return { ok: false, error: 'Jobber sync checking is unavailable in preview mode' }
  }

  const allowedUser = await requireRole('admin')
  if (!allowedUser.ok) return allowedUser

  try {
    const supabase = await createClient()
    await readQuoteVersion(supabase, validated.data)
    const operation = await getJobberSyncOperationForQuote(supabase, validated.data)
    if (!operation) {
      return { ok: false, error: 'No durable Jobber sync record is available.' }
    }
    if (operation.status === 'reconciliation_required') {
      const result = await checkJobberSyncOperation(operation, supabase)
      revalidatePath('/quotes')
      revalidatePath(`/quotes/${validated.data}`)
      if (result.status !== 'succeeded') {
        return { ok: false, error: reconciliationFailureMessage(result) }
      }
      return { ok: true, data: { id: validated.data } }
    }
    revalidatePath('/quotes')
    revalidatePath(`/quotes/${validated.data}`)
    return { ok: true, data: { id: validated.data } }
  } catch {
    return { ok: false, error: 'Unable to check Jobber safely. Please try again.' }
  }
}
