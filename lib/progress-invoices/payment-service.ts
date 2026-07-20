import type { ActionResult } from '@/lib/actions/types'
import {
  createProgressInvoiceRepository,
  type PaymentMutationRpcResult,
  type ProgressPaymentStaleCurrentRpcDto,
} from './repository'
import type {
  CreateManualProgressPaymentInput,
  ReconcileProgressPaymentInput,
  ReplaceManualProgressPaymentInput,
  UndoProgressPaymentReconciliationInput,
  VoidManualProgressPaymentInput,
} from './validators'

export interface ProgressPaymentMutationResult {
  id: string
  seriesId: string
  seriesVersion: number
  version: number
  revisionId: string
}

export type ProgressPaymentStaleCurrent = ProgressPaymentStaleCurrentRpcDto

function mapResult(result: PaymentMutationRpcResult): ProgressPaymentMutationResult {
  return {
    id: result.id,
    seriesId: result.series_id,
    seriesVersion: result.series_version,
    version: result.version,
    revisionId: result.revision_id,
  }
}

function mapMutation(
  result: ActionResult<PaymentMutationRpcResult, ProgressPaymentStaleCurrentRpcDto>,
): ActionResult<ProgressPaymentMutationResult, ProgressPaymentStaleCurrent> {
  return result.ok ? { ok: true, data: mapResult(result.data) } : result
}

export async function createManualProgressPayment(
  input: CreateManualProgressPaymentInput,
): Promise<ActionResult<ProgressPaymentMutationResult, ProgressPaymentStaleCurrent>> {
  const repository = await createProgressInvoiceRepository()
  return mapMutation(await repository.call('create_manual_progress_payment', {
    series_id: input.seriesId,
    expected_series_version: input.expectedSeriesVersion,
    received_date: input.receivedDate,
    amount: input.amount,
    method: input.method,
    reference: input.reference,
    correlation_key: input.correlationKey,
  }))
}

export async function replaceManualProgressPayment(
  input: ReplaceManualProgressPaymentInput,
): Promise<ActionResult<ProgressPaymentMutationResult, ProgressPaymentStaleCurrent>> {
  const repository = await createProgressInvoiceRepository()
  return mapMutation(await repository.call('replace_manual_progress_payment', {
    payment_id: input.paymentId,
    expected_version: input.expectedVersion,
    received_date: input.receivedDate,
    amount: input.amount,
    method: input.method,
    reference: input.reference,
    reason: input.reason,
    correlation_key: input.correlationKey,
  }))
}

export async function voidManualProgressPayment(
  input: VoidManualProgressPaymentInput,
): Promise<ActionResult<ProgressPaymentMutationResult, ProgressPaymentStaleCurrent>> {
  const repository = await createProgressInvoiceRepository()
  return mapMutation(await repository.call('void_manual_progress_payment', {
    payment_id: input.paymentId,
    expected_version: input.expectedVersion,
    reason: input.reason,
    correlation_key: input.correlationKey,
  }))
}

function reconciliationPayload(
  input: ReconcileProgressPaymentInput | UndoProgressPaymentReconciliationInput,
) {
  return {
    jobber_payment_id: input.jobberPaymentId,
    manual_payment_id: input.manualPaymentId,
    jobber_expected_version: input.jobberExpectedVersion,
    manual_expected_version: input.manualExpectedVersion,
    reason: input.reason,
    correlation_key: input.idempotencyKey,
  }
}

export async function reconcileProgressPayment(
  input: ReconcileProgressPaymentInput,
): Promise<ActionResult<ProgressPaymentMutationResult, ProgressPaymentStaleCurrent>> {
  const repository = await createProgressInvoiceRepository()
  return mapMutation(await repository.call('reconcile_progress_payment', reconciliationPayload(input)))
}

export async function undoProgressPaymentReconciliation(
  input: UndoProgressPaymentReconciliationInput,
): Promise<ActionResult<ProgressPaymentMutationResult, ProgressPaymentStaleCurrent>> {
  const repository = await createProgressInvoiceRepository()
  return mapMutation(await repository.call(
    'undo_progress_payment_reconciliation',
    reconciliationPayload(input),
  ))
}
