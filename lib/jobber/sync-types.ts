import type { JobberQuoteLineItem, JobberQuoteLineSyncResult } from './client'
import type {
  BuildJobberQuoteLinePayloadInput,
  JobberQuoteLineMutationItem,
} from './quote-line-payload'

export type SyncOperationStatus =
  | 'queued'
  | 'running'
  | 'retryable'
  | 'reconciliation_required'
  | 'succeeded'
  | 'superseded'

export type SyncStepKind = 'edit' | 'create' | 'delete' | 'reorder'

export interface SyncStepRequest {
  lineItems: JobberQuoteLineMutationItem[]
  lineItemIds?: string[]
}

export interface SyncStepResult {
  createdLineItemIds?: string[]
  editedLineItemIds?: string[]
  deletedLineItemIds?: string[]
  syncedLineItems?: Array<{ sourcePosition: number; jobberLineItemId: string }>
}

export interface JobberSyncMutationStep {
  key: string
  kind: SyncStepKind
  request: SyncStepRequest
}

export interface JobberSyncJournal {
  beforeMutation(step: JobberSyncMutationStep): Promise<void>
  afterMutation(stepKey: string, result: SyncStepResult): Promise<void>
}

export interface SyncCompletion {
  syncedLineItems: Array<{ sourcePosition: number; jobberLineItemId: string }>
  expectedLineItems: JobberQuoteLineMutationItem[]
  deletedLineItemIds: string[]
}

export interface SyncStep {
  id: string
  operation_id: string
  step_key: string
  sequence: number
  kind: SyncStepKind
  request_payload: SyncStepRequest
  status: 'sending' | 'applied'
  result_payload: SyncStepResult | null
}

export interface SyncOperation {
  id: string
  quote_id: string
  quote_version: number
  jobber_quote_id: string
  desired_payload: BuildJobberQuoteLinePayloadInput
  status: SyncOperationStatus
  lease_expires_at: string | null
  attempt_count: number
  failure_code: string | null
  result: SyncCompletion | null
  steps: SyncStep[]
  claim_token?: string
  created_at?: string
  updated_at?: string
}

export interface JobberSyncStore {
  claim(operationId: string): Promise<{ claimed: boolean; operation: SyncOperation }>
  begin(operationId: string, claimToken: string, step: JobberSyncMutationStep): Promise<void>
  complete(operationId: string, claimToken: string, stepKey: string, result: SyncStepResult): Promise<void>
  record(operationId: string, claimToken: string, result: SyncCompletion): Promise<void>
  finish(
    operationId: string,
    claimToken: string,
    outcome: 'succeeded' | 'retryable' | 'reconciliation_required',
    failureCode?: 'line_kind_mismatch',
  ): Promise<void>
  resolve(operationId: string): Promise<void>
  read(operationId: string): Promise<SyncOperation>
}

export interface DurableJobberTransport {
  sync(
    quoteId: string,
    input: BuildJobberQuoteLinePayloadInput,
    journal: JobberSyncJournal,
  ): Promise<JobberQuoteLineSyncResult>
  read(quoteId: string): Promise<JobberQuoteLineItem[]>
}

export type SyncRunResult =
  | { status: 'succeeded'; operation: SyncOperation }
  | { status: 'retryable'; reason: string; operation?: SyncOperation }
  | { status: 'blocked'; reason: string; operation?: SyncOperation }
  | { status: 'not_claimed'; reason: 'claim_not_acquired'; operation: SyncOperation }
  | {
    status: 'failed'
    reason: 'claim_failed' | 'readback_failed' | 'invalid_operation_readback'
    operation?: SyncOperation
  }
