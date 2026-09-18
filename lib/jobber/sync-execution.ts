import { JobberLineKindMismatchError } from './client'
import type {
  DurableJobberTransport,
  JobberSyncStore,
  SyncOperation,
  SyncRunResult,
} from './sync-types'

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
  } catch {
    return { status: 'failed', reason: 'claim_failed' }
  }
  if (!claim.claimed) {
    return { status: 'not_claimed', reason: 'claim_not_acquired', operation: claim.operation }
  }

  const claimToken = claim.operation.claim_token
  if (!claimToken || claim.operation.id !== operationId) {
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
    const mismatch = error instanceof JobberLineKindMismatchError
    const outcome = mutationBegun ? 'reconciliation_required' : 'retryable'
    const failureCode = !mutationBegun && mismatch ? 'line_kind_mismatch' : undefined
    try {
      await store.finish(operationId, claimToken, outcome, failureCode)
    } catch {
      return readFinalState(store, operationId, 'finalization_failed')
    }
    return readFinalState(
      store,
      operationId,
      mutationBegun ? 'operation_uncertain' : failureCode ?? 'preflight_failed',
    )
  }

  try {
    await store.finish(operationId, claimToken, 'succeeded')
  } catch {
    return readFinalState(store, operationId, 'finalization_failed')
  }
  return readFinalState(store, operationId, 'finalization_not_confirmed')
}
