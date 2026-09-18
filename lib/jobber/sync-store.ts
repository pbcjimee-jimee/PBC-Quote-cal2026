import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database, Json } from '@/lib/supabase/types'
import type {
  JobberSyncStore,
  SyncCompletion,
  SyncOperation,
  SyncStep,
  SyncStepRequest,
  SyncStepResult,
} from './sync-types'

type AppSupabaseClient = SupabaseClient<Database>

const uuidSchema = z.string().uuid()
const finiteNumberSchema = z.number().finite()
const decimalInputSchema = z.union([finiteNumberSchema, z.string().min(1)])
const syncStatusSchema = z.enum([
  'queued',
  'running',
  'retryable',
  'reconciliation_required',
  'succeeded',
  'superseded',
])
const stepKindSchema = z.enum(['edit', 'create', 'delete', 'reorder'])

const desiredLineSchema = z.object({
  kind: z.enum(['line_item', 'text']),
  name: z.string(),
  description: z.string().nullish(),
  quantity: decimalInputSchema.nullish(),
  unitPrice: decimalInputSchema.nullish(),
  totalPrice: decimalInputSchema.nullish(),
  taxable: z.boolean().nullish(),
  clientVisible: z.boolean().nullish(),
  jobberLineItemId: z.string().nullish(),
  linkedProductOrServiceId: z.string().nullish(),
  position: z.number().int().nullish(),
}).strict()

const desiredPayloadSchema = z.object({
  saveMode: z.enum(['priced_line_items', 'description_total']),
  lines: z.array(desiredLineSchema),
  finalTotal: decimalInputSchema,
  finalTotalIncludesGst: z.boolean(),
  deletedJobberLineItemIds: z.array(z.string()).optional(),
  totalLineItemId: z.string().nullish(),
}).strict()

const mutationItemSchema = z.object({
  sourcePosition: z.number().int().optional(),
  kind: z.enum(['line_item', 'text']),
  name: z.string(),
  description: z.string(),
  quantity: finiteNumberSchema.optional(),
  unitPrice: finiteNumberSchema.optional(),
  totalPrice: finiteNumberSchema.optional(),
  taxable: z.boolean().optional(),
  productOrServiceId: z.string().optional(),
  jobberLineItemId: z.string().optional(),
  sortOrder: z.number().int().optional(),
}).strict()

const syncedLineSchema = z.object({
  sourcePosition: z.number().int(),
  jobberLineItemId: z.string().min(1),
}).strict()

const stepRequestSchema = z.object({
  lineItems: z.array(mutationItemSchema),
  lineItemIds: z.array(z.string()).optional(),
}).strict()

const stepResultSchema = z.object({
  createdLineItemIds: z.array(z.string()).optional(),
  editedLineItemIds: z.array(z.string()).optional(),
  deletedLineItemIds: z.array(z.string()).optional(),
  syncedLineItems: z.array(syncedLineSchema).optional(),
}).strict()

const completionSchema = z.object({
  syncedLineItems: z.array(syncedLineSchema),
  expectedLineItems: z.array(mutationItemSchema),
  deletedLineItemIds: z.array(z.string()),
}).strict()

const stepSchema = z.object({
  id: uuidSchema,
  operation_id: uuidSchema,
  step_key: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  kind: stepKindSchema,
  request_payload: stepRequestSchema,
  status: z.enum(['sending', 'applied']),
  result_payload: stepResultSchema.nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
}).strict()

const operationSchema = z.object({
  id: uuidSchema,
  quote_id: uuidSchema,
  quote_version: z.number().int().positive(),
  jobber_quote_id: z.string().min(1),
  desired_payload: desiredPayloadSchema,
  status: syncStatusSchema,
  lease_expires_at: z.string().nullable(),
  attempt_count: z.number().int().nonnegative(),
  failure_code: z.string().nullable(),
  result: completionSchema.nullable(),
  steps: z.array(stepSchema),
  claim_token: uuidSchema.optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
}).strict()

const claimSchema = z.object({
  claimed: z.boolean(),
  operation: operationSchema,
}).strict()

const OPERATION_COLUMNS = [
  'id',
  'quote_id',
  'quote_version',
  'jobber_quote_id',
  'desired_payload',
  'status',
  'lease_expires_at',
  'attempt_count',
  'failure_code',
  'result',
  'created_at',
  'updated_at',
].join(', ')

const STEP_COLUMNS = [
  'id',
  'operation_id',
  'step_key',
  'sequence',
  'kind',
  'request_payload',
  'status',
  'result_payload',
  'created_at',
  'updated_at',
].join(', ')

function invalidOperationData(): Error {
  return new Error('Invalid Jobber sync operation data')
}

export function parseJobberSyncOperation(value: unknown): SyncOperation {
  const parsed = operationSchema.safeParse(value)
  if (!parsed.success) throw invalidOperationData()
  return parsed.data as SyncOperation
}

export function parseNullableJobberSyncOperation(value: unknown): SyncOperation | null {
  if (value === null) return null
  return parseJobberSyncOperation(value)
}

function parseClaim(value: unknown): { claimed: boolean; operation: SyncOperation } {
  const parsed = claimSchema.safeParse(value)
  if (!parsed.success) throw invalidOperationData()
  if (parsed.data.claimed && !parsed.data.operation.claim_token) throw invalidOperationData()
  if (!parsed.data.claimed && parsed.data.operation.claim_token) throw invalidOperationData()
  return parsed.data as { claimed: boolean; operation: SyncOperation }
}

function asJson(value: SyncStepRequest | SyncStepResult | SyncCompletion): Json {
  return value as unknown as Json
}

async function requireRpcSuccess(result: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await result
  if (error) throw new Error('Jobber sync persistence failed')
}

export function createJobberSyncStore(supabase: AppSupabaseClient): JobberSyncStore {
  return {
    async claim(operationId) {
      const { data, error } = await supabase.rpc('claim_jobber_sync_operation', { operation_id: operationId })
      if (error) throw new Error('Unable to claim Jobber sync operation')
      return parseClaim(data)
    },

    async begin(operationId, claimToken, step) {
      await requireRpcSuccess(supabase.rpc('begin_jobber_sync_step', {
        operation_id: operationId,
        claim_token: claimToken,
        step_key: step.key,
        step_kind: step.kind,
        request_payload: asJson(step.request),
      }))
    },

    async complete(operationId, claimToken, stepKey, result) {
      await requireRpcSuccess(supabase.rpc('complete_jobber_sync_step', {
        operation_id: operationId,
        claim_token: claimToken,
        step_key: stepKey,
        result_payload: asJson(result),
      }))
    },

    async record(operationId, claimToken, result) {
      await requireRpcSuccess(supabase.rpc('record_jobber_sync_completion', {
        operation_id: operationId,
        claim_token: claimToken,
        result_payload: asJson(result),
      }))
    },

    async finish(operationId, claimToken, outcome, failureCode) {
      await requireRpcSuccess(supabase.rpc('finish_jobber_sync_operation', {
        operation_id: operationId,
        claim_token: claimToken,
        outcome,
        failure_code: failureCode ?? null,
      }))
    },

    async resolve(operationId) {
      await requireRpcSuccess(supabase.rpc('resolve_jobber_sync_operation', { operation_id: operationId }))
    },

    async read(operationId) {
      const { data: operation, error: operationError } = await supabase
        .from('jobber_sync_operations')
        .select(OPERATION_COLUMNS)
        .eq('id', operationId)
        .single()
      if (operationError || !operation) throw new Error('Unable to read Jobber sync operation')

      const { data: steps, error: stepsError } = await supabase
        .from('jobber_sync_steps')
        .select(STEP_COLUMNS)
        .eq('operation_id', operationId)
        .order('sequence', { ascending: true })
      if (stepsError) throw new Error('Unable to read Jobber sync journal')

      return parseJobberSyncOperation({
        ...(operation as unknown as Record<string, unknown>),
        steps: (steps ?? []) as unknown as SyncStep[],
      })
    },
  }
}
