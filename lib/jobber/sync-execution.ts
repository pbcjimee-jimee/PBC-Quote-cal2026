import { JobberKnownLineMissingError, JobberLineKindMismatchError } from './client'
import { classifySyncFailure, syncFailureMessage, type SyncFailureDetail } from './sync-failure'
import type {
  DurableJobberTransport,
  JobberSyncStore,
  SyncOperation,
  SyncRunResult,
} from './sync-types'

function logSyncFailure(operationId: string, phase: 'preflight' | 'writing', detail: SyncFailureDetail, error: unknown) {
  const metadata = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const name = typeof metadata.name === 'string' ? metadata.name : ''
  const status = [metadata.status, metadata.statusCode].find((value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599)
  console.error('[jobber-sync]', {
    operationId, phase, detail,
    ...(/^[A-Za-z]{1,40}$/.test(name) ? { name } : {}),
    ...(status !== undefined ? { status } : {}),
  })
}

function resultFromOperation(operation: SyncOperation, fallbackReason: string): SyncRunResult {
  if (operation.status === 'succeeded') return { status: 'succeeded', operation }
  if (operation.status === 'retryable') {
    return { status: 'retryable', reason: operation.failure_code ?? fallbackReason, operation }
  }
  return { status: 'blocked', reason: operation.failure_code ?? fallbackReason, operation }
}

async function readFinalState(
  store: JobberSyncStore,
  operationId: string,
  fallbackReason: string,
): Promise<SyncRunResult> {
  try {
    const operation = await store.read(operationId)
    if (operation.id !== operationId) {
      return { status: 'failed', reason: 'invalid_operation_readback' }
    }
    return resultFromOperation(operation, fallbackReason)
  } catch {
    return { status: 'failed', reason: 'readback_failed' }
  }
}

export async function runDurableJobberSync(
  store: JobberSyncStore,
  operationId: string,
  transport: DurableJobberTransport,
): Promise<SyncRunResult> {
  let claim: Awaited<ReturnType<JobberSyncStore['claim']>>
  try {
    claim = await store.claim(operationId)
  } catch (error) {
    logSyncFailure(operationId, 'preflight', classifySyncFailure(error), error)
    return { status: 'failed', reason: 'claim_failed' }
  }
  if (!claim.claimed) {
    return { status: 'not_claimed', reason: 'claim_not_acquired', operation: claim.operation }
  }

  const claimToken = claim.operation.claim_token
  if (!claimToken || claim.operation.id !== operationId) {
    logSyncFailure(operationId, 'preflight', 'unknown', null)
    return { status: 'failed', reason: 'invalid_operation_readback', operation: claim.operation }
  }

  let mutationBegun = false
  let result: Awaited<ReturnType<DurableJobberTransport['sync']>>
  try {
    result = await transport.sync(
      claim.operation.jobber_quote_id,
      claim.operation.desired_payload,
      {
        beforeMutation: async (step) => {
          await store.begin(operationId, claimToken, step)
          mutationBegun = true
        },
        afterMutation: async (stepKey, stepResult) => {
          await store.complete(operationId, claimToken, stepKey, stepResult)
        },
      },
    )

    await store.record(operationId, claimToken, {
      syncedLineItems: result.syncedLineItems,
      expectedLineItems: result.expectedLineItems,
      deletedLineItemIds: claim.operation.desired_payload.deletedJobberLineItemIds ?? [],
    })
  } catch (error) {
    const phase = mutationBegun ? 'writing' : 'preflight'
    const detail = classifySyncFailure(error)
    const lineName = error instanceof JobberKnownLineMissingError
      ? claim.operation.desired_payload.lines.find((line) => line.jobberLineItemId === error.lineItemId)?.name
      : undefined
    logSyncFailure(operationId, phase, detail, error)
    const mismatch = error instanceof JobberLineKindMismatchError
    const outcome = mutationBegun ? 'reconciliation_required' : 'retryable'
    const failureCode = !mutationBegun && mismatch ? 'line_kind_mismatch' : undefined
    let fallbackReason = mutationBegun ? 'operation_uncertain' : failureCode ?? 'preflight_failed'
    try {
      await store.finish(operationId, claimToken, outcome, failureCode)
    } catch {
      fallbackReason = 'finalization_failed'
    }
    const finalState = await readFinalState(store, operationId, fallbackReason)
    if (finalState.status !== 'retryable' && finalState.status !== 'blocked') return finalState
    return {
      ...finalState, detail,
      message: syncFailureMessage({ phase: finalState.status === 'blocked' ? 'writing' : phase, detail, lineName }),
    }
  }

  let finalizationError: unknown
  let fallbackReason = 'finalization_not_confirmed'
  try {
    await store.finish(operationId, claimToken, 'succeeded')
  } catch (error) {
    finalizationError = error
    fallbackReason = 'finalization_failed'
  }
  const finalState = await readFinalState(store, operationId, fallbackReason)
  if (finalState.status !== 'succeeded') {
    logSyncFailure(operationId, mutationBegun ? 'writing' : 'preflight', classifySyncFailure(finalizationError), finalizationError)
  }
  return finalState
}
