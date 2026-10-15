'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireRole } from '@/lib/security/require-app-user'
import { createClient } from '@/lib/supabase/server'
import { isJobberDisabledInPreview, JOBBER_DISABLED_MESSAGE } from '@/lib/jobber/environment'
import { createDurableJobberTransport, getJobberSyncOperationForQuote } from '@/lib/jobber/sync-runner'
import { buildSyncRecoveryPreview, recoveryKnownIds, SyncRecoveryError, type SyncRecoveryPreview } from '@/lib/jobber/sync-recovery'
import { isDevNoAuthMode, type ActionResult } from './types'

export type { SyncRecoveryPreview } from '@/lib/jobber/sync-recovery'

const uuidSchema = z.string().uuid()
const recoveryInputSchema = z.object({
  quoteId: uuidSchema,
  operationId: uuidSchema,
  expectedVersion: z.number().int().positive(),
  remoteFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  mappings: z.array(z.object({ lineId: uuidSchema, jobberLineItemId: z.string().trim().min(1).max(1000) }).strict()).max(1000),
}).strict()

type RecoveryInput = z.infer<typeof recoveryInputSchema>

async function authorizeRecovery(): Promise<ActionResult<null>> {
  if (isJobberDisabledInPreview()) return { ok: false, error: JOBBER_DISABLED_MESSAGE }
  if (isDevNoAuthMode()) return { ok: false, error: 'Jobber sync recovery is unavailable in preview mode.' }
  const allowed = await requireRole('admin')
  return allowed.ok ? { ok: true, data: null } : allowed
}

async function loadRecovery(supabase: Awaited<ReturnType<typeof createClient>>, quoteId: string) {
  const { data: quote, error: quoteError } = await supabase.from('quotes')
    .select('id, version, jobber_quote_id, jobber_save_mode, jobber_pending_deleted_line_item_ids').eq('id', quoteId).is('deleted_at', null).single()
  if (quoteError || !quote) throw new Error('Quote unavailable')
  const operation = await getJobberSyncOperationForQuote(supabase, quoteId)
  if (!operation) throw new SyncRecoveryError('No blocked Jobber sync record is available for recovery.')
  recoveryKnownIds(operation, quote)
  const { data: lines, error: linesError } = await supabase.from('jobber_quote_lines')
    .select('id, position, kind, name, description, quantity, unit_price, total_price, taxable, optional, recommended, client_visible, jobber_line_item_id')
    .eq('quote_id', quoteId).order('position', { ascending: true })
  if (linesError || !lines) throw new Error('Quote lines unavailable')
  const remote = await createDurableJobberTransport().read(operation.jobber_quote_id)
  return { preview: buildSyncRecoveryPreview(operation, quote, lines, remote), observedIds: remote.map((line) => line.id) }
}

export async function getJobberSyncRecovery(quoteId: string): Promise<ActionResult<SyncRecoveryPreview>> {
  const parsed = uuidSchema.safeParse(quoteId)
  if (!parsed.success) return { ok: false, error: 'Invalid quote id.' }
  try {
    const allowed = await authorizeRecovery()
    if (!allowed.ok) return allowed
    const { preview } = await loadRecovery(await createClient(), parsed.data)
    return { ok: true, data: preview }
  } catch (error) {
    return { ok: false, error: error instanceof SyncRecoveryError ? error.message : 'Unable to review Jobber recovery. No changes were sent. Please try again.' }
  }
}

export async function recoverJobberQuoteSync(input: RecoveryInput): Promise<ActionResult<{ id: string; version: number }>> {
  const parsed = recoveryInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid recovery details. Review the quote again.' }
  try {
    const allowed = await authorizeRecovery()
    if (!allowed.ok) return allowed
    const supabase = await createClient()
    const { preview, observedIds } = await loadRecovery(supabase, parsed.data.quoteId)
    if (preview.operationId !== parsed.data.operationId || preview.expectedVersion !== parsed.data.expectedVersion ||
      preview.remoteFingerprint !== parsed.data.remoteFingerprint) {
      return { ok: false, error: 'The saved quote or Jobber changed since this review. Load a fresh review before recovering.' }
    }
    const mappings = parsed.data.mappings
    const localIds = new Set(mappings.map((line) => line.lineId))
    const remoteIds = new Set(mappings.map((line) => line.jobberLineItemId))
    if (localIds.size !== mappings.length || remoteIds.size !== mappings.length || mappings.some((mapping) => {
      const local = preview.lines.find((line) => line.lineId === mapping.lineId)
      const remote = preview.remoteLines.find((line) => line.id === mapping.jobberLineItemId)
      return !local || !remote || local.kind !== remote.kind
    }) || preview.lines.some((line) => line.currentJobberLineItemId && !localIds.has(line.lineId))) {
      return { ok: false, error: 'Each mapping must use a different current quote row and a known matching Jobber row. Existing links must remain explicitly mapped.' }
    }
    const { data, error } = await supabase.rpc('recover_jobber_sync_operation', {
      operation_id: parsed.data.operationId, target_quote_id: parsed.data.quoteId,
      expected_version: parsed.data.expectedVersion, line_mappings: mappings, observed_remote_ids: observedIds,
    })
    const recovered = z.object({ id: uuidSchema, version: z.number().int().positive() }).safeParse(data)
    if (error || !recovered.success || recovered.data.id !== parsed.data.quoteId || recovered.data.version !== parsed.data.expectedVersion + 1) {
      return { ok: false, error: 'Recovery could not be confirmed. Refresh the quote and review its current status before trying again.' }
    }
    revalidatePath('/quotes')
    revalidatePath(`/quotes/${parsed.data.quoteId}`)
    revalidatePath(`/quotes/${parsed.data.quoteId}/edit`)
    return { ok: true, data: recovered.data }
  } catch (error) {
    return { ok: false, error: error instanceof SyncRecoveryError ? error.message : 'Unable to recover the sync safely. Refresh and review the quote again.' }
  }
}
