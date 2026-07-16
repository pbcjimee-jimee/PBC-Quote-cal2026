import type { ActionResult } from '@/lib/actions/types'
import {
  createProgressInvoiceRepository,
  type AdjustmentMutationRpcResult,
  type ProgressAdjustmentRpcDetail,
} from './repository'
import type {
  ApproveProgressAdjustmentInput,
  CreateProgressAdjustmentInput,
  SupersedeProgressAdjustmentInput,
  UpdateProgressAdjustmentDraftInput,
} from './validators'

export interface ProgressAdjustmentMutationResult {
  id: string
  seriesId: string
  version: number
  replacementId?: string
}

export interface ProgressAdjustmentDetail {
  id: string
  seriesId: string
  type: 'variation' | 'credit'
  status: 'draft' | 'approved' | 'rejected' | 'superseded' | 'void'
  effectiveDate: string
  displayOrder: number
  description: string
  amountExGst: string
  gstRate: '0.10'
  supersededAdjustmentId: string | null
  reason: string | null
  quoteItemId: string | null
  version: number
}

function mapResult(result: AdjustmentMutationRpcResult): ProgressAdjustmentMutationResult {
  return {
    id: result.id,
    seriesId: result.series_id,
    version: result.version,
    ...(result.replacement_id ? { replacementId: result.replacement_id } : {}),
  }
}

function mapDetail(detail: ProgressAdjustmentRpcDetail): ProgressAdjustmentDetail {
  return {
    id: detail.id,
    seriesId: detail.series_id,
    type: detail.type,
    status: detail.status,
    effectiveDate: detail.effective_date,
    displayOrder: detail.display_order,
    description: detail.description,
    amountExGst: detail.amount_ex_gst,
    gstRate: detail.gst_rate,
    supersededAdjustmentId: detail.superseded_adjustment_id,
    reason: detail.reason,
    quoteItemId: detail.quote_item_id,
    version: detail.version,
  }
}

function mapMutation(
  result: ActionResult<AdjustmentMutationRpcResult, ProgressAdjustmentRpcDetail>
): ActionResult<ProgressAdjustmentMutationResult, ProgressAdjustmentDetail> {
  if (result.ok) return { ok: true, data: mapResult(result.data) }
  return result.current
    ? { ...result, current: mapDetail(result.current) }
    : { ok: false, error: result.error, ...(result.code ? { code: result.code } : {}) }
}

export async function createProgressAdjustment(
  input: CreateProgressAdjustmentInput
): Promise<ActionResult<ProgressAdjustmentMutationResult>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('create_progress_adjustment', {
    series_id: input.seriesId,
    type: input.type,
    effective_date: input.effectiveDate,
    description: input.description,
    amount_ex_gst: input.amountExGst,
    gst_rate: input.gstRate,
    quote_item_id: input.pbcQuoteItemId,
    correlation_key: input.correlationKey,
  })
  return result.ok ? { ok: true, data: mapResult(result.data) } : result
}

export async function updateDraftProgressAdjustment(
  input: UpdateProgressAdjustmentDraftInput
): Promise<ActionResult<ProgressAdjustmentMutationResult, ProgressAdjustmentDetail>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('update_progress_adjustment_draft', {
    adjustment_id: input.adjustmentId,
    expected_version: input.expectedVersion,
    type: input.type,
    effective_date: input.effectiveDate,
    description: input.description,
    amount_ex_gst: input.amountExGst,
    gst_rate: input.gstRate,
    quote_item_id: input.pbcQuoteItemId,
    correlation_key: input.correlationKey,
  })
  return mapMutation(result)
}

export async function approveProgressAdjustment(
  input: ApproveProgressAdjustmentInput
): Promise<ActionResult<ProgressAdjustmentMutationResult, ProgressAdjustmentDetail>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('approve_progress_adjustment', {
    adjustment_id: input.adjustmentId,
    expected_version: input.expectedVersion,
    correlation_key: input.correlationKey,
  })
  return mapMutation(result)
}

export async function supersedeProgressAdjustment(
  input: SupersedeProgressAdjustmentInput
): Promise<ActionResult<ProgressAdjustmentMutationResult, ProgressAdjustmentDetail>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('supersede_progress_adjustment', {
    adjustment_id: input.adjustmentId,
    expected_version: input.expectedVersion,
    reason: input.reason,
    replacement: {
      type: input.replacement.type,
      effective_date: input.replacement.effectiveDate,
      description: input.replacement.description,
      amount_ex_gst: input.replacement.amountExGst,
      gst_rate: input.replacement.gstRate,
      quote_item_id: input.replacement.pbcQuoteItemId,
    },
    correlation_key: input.correlationKey,
  })
  return mapMutation(result)
}
