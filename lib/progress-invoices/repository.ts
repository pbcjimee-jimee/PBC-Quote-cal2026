import type { ActionErrorCode, ActionResult } from '@/lib/actions/types'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/types'

export interface SaveBusinessInvoiceProfilePayload {
  legal_name: string
  trading_name?: string | null
  abn: string
  contractor_licence?: string | null
  business_address: string
  phone: string
  email: string
  bank_name: string
  bsb: string
  bank_account_name: string
  bank_account_number: string
  gst_rate: '0.10'
  business_timezone: 'Australia/Sydney'
  default_payment_term_days: number
  expected_version?: number
}

export interface BusinessInvoiceProfileRpcResult {
  id: string
  legal_name: string
  trading_name: string
  abn: string
  contractor_licence: string
  business_address: string
  phone: string
  email: string
  bank_name: string
  bsb: string
  bank_account_name: string
  bank_account_number: string
  gst_rate: '0.10'
  business_timezone: 'Australia/Sydney'
  default_payment_term_days: number
  version: number
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export type ProgressInvoiceSeriesStatus =
  | 'draft'
  | 'active'
  | 'completed'
  | 'reconciliation_required'
  | 'void'

export type ProgressInvoicePaymentState =
  | 'unpaid'
  | 'part_paid'
  | 'paid'
  | 'overdue'
  | 'credit_balance'

export interface ProgressInvoiceSeriesRpcDetail {
  id: string
  quote_id: string | null
  source_type: 'pbc_quote' | 'jobber_job' | 'jobber_invoice' | 'manual'
  version: number
  base_contract_ex_gst: string
  gst_rate: '0.10'
  recipient_name: string
  recipient_company: string
  recipient_address: string
  recipient_email: string
  recipient_phone: string
  recipient_abn: string
  site_name: string
  site_address: string
  default_description: string
  reference: string
  status: ProgressInvoiceSeriesStatus
  accepted_numbering_base: string | null
  jobber_link_locked_at: string | null
  current_adjusted_contract_ex_gst: string
  current_adjusted_contract_gst: string
  current_adjusted_contract_inc_gst: string
  current_claimed_ex_gst: string
  current_claimed_gst: string
  current_claimed_inc_gst: string
  current_unclaimed_ex_gst: string
  current_unclaimed_gst: string
  current_unclaimed_inc_gst: string
  current_cumulative_percentage: string
}

export interface CreateManualProgressInvoiceSeriesPayload {
  source_type: 'manual'
  accepted_numbering_base: string
  base_contract_ex_gst: string
  gst_rate: '0.10'
  recipient_name: string
  recipient_company?: string | null
  recipient_address: string
  recipient_email?: string | null
  recipient_phone?: string | null
  recipient_abn?: string | null
  site_name: string
  site_address: string
  default_description: string
  reference?: string | null
  correlation_key: string
}

export interface UpdateProgressInvoiceSeriesPayload {
  series_id: string
  expected_version: number
  base_contract_ex_gst?: string
  gst_rate?: '0.10'
  recipient_name?: string
  recipient_company?: string | null
  recipient_address?: string
  recipient_email?: string | null
  recipient_phone?: string | null
  recipient_abn?: string | null
  site_name?: string
  site_address?: string
  default_description?: string
  reference?: string | null
  correlation_key: string
}

export interface ProgressInvoiceListPayload {
  query: string
  statuses: string[]
  page: number
  page_size: number
  quote_id: string | null
}

export interface ProgressInvoiceDashboardRpcItem {
  id: string
  source_type: 'pbc_quote' | 'jobber_job' | 'jobber_invoice' | 'manual'
  quote_id: string | null
  recipient_name: string
  recipient_company: string
  site_name: string
  status: ProgressInvoiceSeriesStatus
  current_adjusted_contract_ex_gst: string
  current_claimed_inc_gst: string
  current_actual_receipts: string
  current_outstanding_receivable: string
  current_credit_balance: string
  current_unclaimed_inc_gst: string
  current_cumulative_percentage: string
  current_payment_state: ProgressInvoicePaymentState
  current_manifest_claim_count: number
  invoice_number: string
  reference: string
  last_successful_jobber_sync_at: string | null
  last_jobber_sync_error_code: string | null
  version: number
}

export interface ProgressInvoiceDashboardRpcSummary {
  current_adjusted_contract_ex_gst: string
  current_claimed_inc_gst: string
  current_actual_receipts: string
  current_outstanding_receivable: string
  current_credit_balance: string
  current_unclaimed_inc_gst: string
}

export interface ProgressInvoiceDashboardRpcResult {
  items: ProgressInvoiceDashboardRpcItem[]
  summary: ProgressInvoiceDashboardRpcSummary
  page: number
  page_size: number
  total: number
}

export interface ProgressInvoiceSeriesReadRpcResult {
  series: ProgressInvoiceSeriesRpcDetail | null
}

export interface ProgressInvoiceImportedObservationRpcDto {
  original_invoice_number: string
  observed_invoice_number: string
  normalized_status: 'draft' | 'awaiting_payment' | 'part_paid' | 'paid' | 'past_due' | 'unknown'
  invoice_subtotal: string | null
  invoice_tax: string | null
  invoice_total: string | null
  invoice_balance: string | null
  issued_date: string | null
  due_date: string | null
  received_date: string | null
  external_updated_at: string | null
  client_name: string
  client_company_name: string | null
  client_email: string | null
  client_phone: string | null
  billing_address: string | null
  property_address: string | null
  fetched_at: string
}

export interface ProgressInvoiceCurrentRevisionSetRpcDto {
  id: string
  revision_manifest_hash: string
  current_manifest_claim_count: number
  current_claim_revision_id: string | null
}

export interface ProgressInvoiceAdjustmentRpcDto {
  id: string
  type: 'variation' | 'credit'
  status: 'draft' | 'approved' | 'rejected' | 'superseded' | 'void'
  effective_date: string
  display_order: number
  description: string
  amount_ex_gst: string
  gst_rate: '0.10'
  reason: string | null
  version: number
}

export interface ProgressInvoiceClaimRevisionRpcDto {
  id: string
  revision_number: number
  state: 'draft' | 'issued' | 'superseded'
  issue_date: string
  due_date: string
  description: string
  reference: string | null
  current_claim_ex_gst: string
  current_claim_gst: string
  current_claim_inc_gst: string
  cumulative_percentage: string
  remaining_ex_gst: string
  remaining_gst: string
  remaining_inc_gst: string
  edit_classification: 'clerical' | 'financial_tax_affecting'
  tax_review_state: 'not_required' | 'pending' | 'approved' | 'external_reference_required' | 'external_reference_recorded'
  created_at: string
}

export interface ProgressInvoiceClaimRpcDto {
  id: string
  sequence: number
  kind: 'progress' | 'final'
  suffix: string
  tax_invoice_number: string
  status: 'draft' | 'issued' | 'void'
  original_issued_at: string | null
  latest_revised_at: string | null
  version: number
  current_revision: ProgressInvoiceClaimRevisionRpcDto | null
}

export interface ProgressInvoicePaymentRevisionRpcDto {
  id: string
  revision_number: number
  received_date: string
  observed_amount: string
  effective_receipt_amount: string
  payment_method: string | null
  reference: string | null
  external_status: string | null
  external_updated_at: string | null
  sync_state: 'manual' | 'observed' | 'changed' | 'disappeared' | 'refunded' | 'reversed' | 'ambiguous' | null
  status: 'active' | 'superseded' | 'unconfirmed' | 'void'
  source_observed_at: string | null
  reason: string | null
  created_at: string
}

export interface ProgressInvoicePaymentRpcDto {
  id: string
  source: 'jobber' | 'manual'
  matched_manual_payment_id: string | null
  version: number
  current_revision: ProgressInvoicePaymentRevisionRpcDto | null
}

export interface ProgressInvoiceDocumentRpcDto {
  id: string
  claim_revision_id: string | null
  revision_set_id: string | null
  scope: 'current_claim' | 'series_bundle'
  format: 'xlsx' | 'pdf'
  template_id: string
  template_version: number
  renderer_version: string
  sha256: string
  page_or_worksheet_count: number
  revision_manifest_hash: string | null
  generated_at: string
  created_at: string
  is_current: boolean
}

export type ProgressInvoiceSafeFieldChangesRpcDto = Readonly<Record<
  string,
  string | number | null | { before: string | number | null; after: string | number | null }
>>

export interface ProgressInvoiceSafeEventRpcDto {
  id: string
  claim_id: string | null
  event_type: string
  source: 'user' | 'jobber_sync' | 'system'
  occurred_at: string
  prior_revision_id: string | null
  next_revision_id: string | null
  safe_field_changes: ProgressInvoiceSafeFieldChangesRpcDto
}

export interface ProgressInvoiceWorkspaceRpcResult {
  series: ProgressInvoiceSeriesRpcDetail | null
  summary?: {
    adjusted_ex_gst: string
    adjusted_gst: string
    adjusted_inc_gst: string
    claimed_inc_gst: string
    received_inc_gst: string
    outstanding_inc_gst: string
    credit_balance_inc_gst: string
    unclaimed_inc_gst: string
    cumulative_percentage: string
  }
  imported_jobber_observation?: ProgressInvoiceImportedObservationRpcDto | null
  current_revision_set?: ProgressInvoiceCurrentRevisionSetRpcDto | null
  adjustments?: ProgressInvoiceAdjustmentRpcDto[]
  claims?: ProgressInvoiceClaimRpcDto[]
  payments?: ProgressInvoicePaymentRpcDto[]
  ready_documents?: ProgressInvoiceDocumentRpcDto[]
  recent_events?: ProgressInvoiceSafeEventRpcDto[]
  history?: { next_cursor: string | null }
  capabilities?: {
    can_edit_series: boolean
    can_edit_base_contract: boolean
    can_void_series_directly: boolean
    requires_claim_void_workflow: boolean
    can_create_claim: boolean
    can_download_current: boolean
    can_download_historical: boolean
  }
}

export interface ProgressInvoiceHistoryRpcResult {
  events: ProgressInvoiceSafeEventRpcDto[]
  next_cursor: string | null
}

interface AdjustmentPayload {
  type: 'variation' | 'credit'
  effective_date: string
  description: string
  amount_ex_gst: string
  gst_rate: '0.10'
  quote_item_id?: string | null
}

export interface CreateProgressAdjustmentPayload extends AdjustmentPayload {
  series_id: string
  correlation_key: string
}

export interface UpdateProgressAdjustmentPayload {
  adjustment_id: string
  expected_version: number
  type?: 'variation' | 'credit'
  effective_date?: string
  description?: string
  amount_ex_gst?: string
  gst_rate?: '0.10'
  quote_item_id?: string | null
  correlation_key: string
}

export interface ApproveProgressAdjustmentPayload {
  adjustment_id: string
  expected_version: number
  correlation_key: string
}

export interface SupersedeProgressAdjustmentPayload {
  adjustment_id: string
  expected_version: number
  reason: string
  replacement: AdjustmentPayload
  correlation_key: string
}

export interface VersionedMutationRpcResult {
  id: string
  version: number
}

export interface ProgressInvoiceSeriesMutationRpcResult extends VersionedMutationRpcResult {
  quote_id: string | null
}

export interface AdjustmentMutationRpcResult extends VersionedMutationRpcResult {
  series_id: string
  replacement_id?: string
  quote_id: string | null
}

export interface ProgressAdjustmentRpcDetail {
  id: string
  series_id: string
  type: 'variation' | 'credit'
  status: 'draft' | 'approved' | 'rejected' | 'superseded' | 'void'
  effective_date: string
  display_order: number
  description: string
  amount_ex_gst: string
  gst_rate: '0.10'
  superseded_adjustment_id: string | null
  reason: string | null
  quote_item_id: string | null
  version: number
}

export interface ProgressInvoiceJobberContextRpcResult {
  series_id: string
  series_version: number
  jobber_account_id: string
  jobber_invoice_id: string
  selected_jobber_job_id: string | null
  selected_jobber_property_id: string | null
  current_snapshot_id: string | null
}

export interface LinkProgressJobberInvoiceRpcResult {
  series_id: string
  version: number
  quote_id: string | null
}

export interface RecordProgressJobberRefreshFailureRpcResult {
  series_id: string
  version: number
}

export interface RefreshProgressJobberInvoiceRpcResult {
  series_id: string
  snapshot_id: string
  series_version: number
  inserted_payments: number
  revised_payments: number
  unconfirmed_payments: number
}

export interface GetProgressInvoiceJobberContextPayload {
  series_id: string
}

export interface AcceptProgressJobberInvoiceNumberPayload {
  series_id: string
  expected_version: number
  observation_id: string
  number_source: 'original' | 'latest'
  idempotency_key: string
}

export interface LinkProgressJobberInvoicePayload {
  actor_id: string
  series_id: string
  expected_version: number
  correlation_key: string
  request_fingerprint: string
  observation: Json
}

export interface RefreshProgressJobberInvoicePayload {
  actor_id: string
  series_id: string
  expected_version: number
  idempotency_key: string
  request_fingerprint: string
  observation: Json
}

export interface RecordProgressJobberRefreshFailurePayload {
  actor_id: string
  series_id: string
  expected_version: number
  jobber_account_id: string
  jobber_invoice_id: string
  idempotency_key: string
  error_code: string
}

export interface StandaloneProgressInvoiceSeriesPayload {
  source_type: 'jobber_invoice'
  quote_id: null
  base_contract_ex_gst: string
  gst_rate: '0.10'
  recipient_name: string
  recipient_company: string | null
  recipient_address: string
  recipient_email: string | null
  recipient_phone: string | null
  recipient_abn: string | null
  site_name: string
  site_address: string
  default_description: string
  reference: string | null
  correlation_key: string
}

export interface CreateStandaloneProgressInvoiceFromJobberPayload {
  actor_id: string
  correlation_key: string
  request_fingerprint: string
  series: StandaloneProgressInvoiceSeriesPayload
  observation: Json
}

export interface CreateStandaloneProgressInvoiceFromJobberRpcResult {
  series_id: string
  version: number
  snapshot_id: string
  imported_payments: number
}

export interface ProgressInvoiceCommandMap {
  save_business_invoice_profile: {
    payload: SaveBusinessInvoiceProfilePayload
    result: BusinessInvoiceProfileRpcResult
    current: never
  }
  create_manual_progress_invoice_series: {
    payload: CreateManualProgressInvoiceSeriesPayload
    result: VersionedMutationRpcResult
    current: never
  }
  update_progress_invoice_series: {
    payload: UpdateProgressInvoiceSeriesPayload
    result: ProgressInvoiceSeriesMutationRpcResult
    current: ProgressInvoiceSeriesRpcDetail
  }
  list_progress_invoice_series: {
    payload: ProgressInvoiceListPayload
    result: ProgressInvoiceDashboardRpcResult
    current: never
  }
  get_progress_invoice_series: {
    payload: { series_id: string }
    result: ProgressInvoiceSeriesReadRpcResult
    current: never
  }
  get_progress_invoice_workspace: {
    payload: { series_id: string }
    result: ProgressInvoiceWorkspaceRpcResult
    current: never
  }
  list_progress_invoice_history: {
    payload: { series_id: string; cursor: string | null; limit: number }
    result: ProgressInvoiceHistoryRpcResult
    current: never
  }
  get_progress_invoice_jobber_context: {
    payload: GetProgressInvoiceJobberContextPayload
    result: ProgressInvoiceJobberContextRpcResult
    current: never
  }
  accept_progress_jobber_invoice_number: {
    payload: AcceptProgressJobberInvoiceNumberPayload
    result: VersionedMutationRpcResult
    current: ProgressInvoiceSeriesRpcDetail
  }
  create_progress_adjustment: {
    payload: CreateProgressAdjustmentPayload
    result: AdjustmentMutationRpcResult
    current: never
  }
  update_progress_adjustment_draft: {
    payload: UpdateProgressAdjustmentPayload
    result: AdjustmentMutationRpcResult
    current: ProgressAdjustmentRpcDetail
  }
  approve_progress_adjustment: {
    payload: ApproveProgressAdjustmentPayload
    result: AdjustmentMutationRpcResult
    current: ProgressAdjustmentRpcDetail
  }
  supersede_progress_adjustment: {
    payload: SupersedeProgressAdjustmentPayload
    result: AdjustmentMutationRpcResult
    current: ProgressAdjustmentRpcDetail
  }
}

export interface ProgressInvoiceJobberPersistenceCommandMap {
  create_progress_invoice_series_from_jobber: {
    payload: CreateStandaloneProgressInvoiceFromJobberPayload
    result: CreateStandaloneProgressInvoiceFromJobberRpcResult
  }
  link_progress_jobber_invoice: {
    payload: LinkProgressJobberInvoicePayload
    result: LinkProgressJobberInvoiceRpcResult
  }
  apply_progress_invoice_jobber_refresh: {
    payload: RefreshProgressJobberInvoicePayload
    result: RefreshProgressJobberInvoiceRpcResult
  }
  record_progress_jobber_refresh_failure: {
    payload: RecordProgressJobberRefreshFailurePayload
    result: RecordProgressJobberRefreshFailureRpcResult
  }
}

export interface ProgressInvoiceRpcError {
  message?: unknown
  code?: unknown
  details?: unknown
  hint?: unknown
}

export interface ProgressInvoiceRpcExecutor {
  execute(
    command: keyof ProgressInvoiceCommandMap,
    payload: Json
  ): Promise<{ data: unknown; error: ProgressInvoiceRpcError | null }>
}

export interface ProgressInvoiceServiceRpcExecutor {
  execute(
    command: keyof ProgressInvoiceJobberPersistenceCommandMap,
    payload: Json
  ): Promise<{ data: unknown; error: ProgressInvoiceRpcError | null }>
}

type AuthenticatedSupabaseClient = Awaited<ReturnType<typeof createClient>>
type ProgressInvoiceAuthenticatedClient = Pick<AuthenticatedSupabaseClient, 'rpc'>
type ServiceSupabaseClient = Awaited<ReturnType<typeof createServiceClient>>
type ProgressInvoiceServiceClient = Pick<ServiceSupabaseClient, 'rpc'>
type ProgressInvoiceCommand = keyof ProgressInvoiceCommandMap
type CommandPayload<TCommand extends ProgressInvoiceCommand> =
  ProgressInvoiceCommandMap[TCommand]['payload']
type CommandResult<TCommand extends ProgressInvoiceCommand> =
  ProgressInvoiceCommandMap[TCommand]['result']
type CommandCurrent<TCommand extends ProgressInvoiceCommand> =
  ProgressInvoiceCommandMap[TCommand]['current']
type ProgressInvoiceServiceCommand = keyof ProgressInvoiceJobberPersistenceCommandMap
type ServiceCommandPayload<TCommand extends ProgressInvoiceServiceCommand> =
  ProgressInvoiceJobberPersistenceCommandMap[TCommand]['payload']
type ServiceCommandResult<TCommand extends ProgressInvoiceServiceCommand> =
  ProgressInvoiceJobberPersistenceCommandMap[TCommand]['result']

const DOMAIN_ERROR_CODES: Readonly<Record<string, { code: ActionErrorCode; error: string }>> = {
  PROGRESS_AUTH_REQUIRED: { code: 'AUTH_REQUIRED', error: 'PROGRESS_AUTH_REQUIRED' },
  PROGRESS_FORBIDDEN: { code: 'FORBIDDEN', error: 'PROGRESS_FORBIDDEN' },
  PROGRESS_VERSION_CONFLICT: { code: 'VERSION_CONFLICT', error: 'PROGRESS_VERSION_CONFLICT' },
  PROGRESS_NOT_FOUND: { code: 'NOT_FOUND', error: 'PROGRESS_NOT_FOUND' },
  PROGRESS_RECONCILIATION_REQUIRED: {
    code: 'RECONCILIATION_REQUIRED',
    error: 'PROGRESS_RECONCILIATION_REQUIRED',
  },
  PROGRESS_JOBBER_ERROR: { code: 'JOBBER_ERROR', error: 'PROGRESS_JOBBER_ERROR' },
  PROGRESS_JOBBER_LINK_LOCKED: { code: 'VALIDATION', error: 'PROGRESS_JOBBER_LINK_LOCKED' },
  PROGRESS_DOCUMENT_ERROR: { code: 'DOCUMENT_ERROR', error: 'PROGRESS_DOCUMENT_ERROR' },
  PROGRESS_STORAGE_ERROR: { code: 'STORAGE_ERROR', error: 'PROGRESS_STORAGE_ERROR' },
  IDEMPOTENCY_KEY_REUSED: { code: 'VALIDATION', error: 'IDEMPOTENCY_KEY_REUSED' },
  PROGRESS_UNIQUE_CONFLICT: { code: 'VALIDATION', error: 'PROGRESS_UNIQUE_CONFLICT' },
  PROGRESS_EMAIL_INVALID: { code: 'VALIDATION', error: 'PROGRESS_EMAIL_INVALID' },
  PROGRESS_ABN_INVALID: { code: 'VALIDATION', error: 'PROGRESS_ABN_INVALID' },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function singleton(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  return typeof record[key] === 'string' ? record[key] : null
}

function nullableStringField(record: Record<string, unknown>, key: string): string | null | undefined {
  const value = record[key]
  return value === null ? null : typeof value === 'string' ? value : undefined
}

function positiveIntegerField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function nonNegativeIntegerField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function moneyField(record: Record<string, unknown>, key: string): string | null {
  const value = stringField(record, key)
  return value && /^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value) ? value : null
}

function nonNegativeMoneyField(record: Record<string, unknown>, key: string): string | null {
  const value = moneyField(record, key)
  return value && !value.startsWith('-') ? value : null
}

function percentageField(record: Record<string, unknown>, key: string): string | null {
  const value = stringField(record, key)
  return value && /^(?:0|[1-9]\d*)\.\d{6}$/.test(value) ? value : null
}

function parseVersioned(value: unknown): VersionedMutationRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate)) return null
  const id = stringField(candidate, 'id')
  const version = positiveIntegerField(candidate, 'version')
  return id && version ? { id, version } : null
}

function parseJobberContext(value: unknown): ProgressInvoiceJobberContextRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate)) return null
  const seriesId = stringField(candidate, 'series_id')
  const seriesVersion = positiveIntegerField(candidate, 'series_version')
  const accountId = stringField(candidate, 'jobber_account_id')
  const invoiceId = stringField(candidate, 'jobber_invoice_id')
  const jobId = nullableStringField(candidate, 'selected_jobber_job_id')
  const propertyId = nullableStringField(candidate, 'selected_jobber_property_id')
  const snapshotId = nullableStringField(candidate, 'current_snapshot_id')
  if (!seriesId || !seriesVersion || !accountId || !invoiceId || jobId === undefined
    || propertyId === undefined || snapshotId === undefined) return null
  return {
    series_id: seriesId,
    series_version: seriesVersion,
    jobber_account_id: accountId,
    jobber_invoice_id: invoiceId,
    selected_jobber_job_id: jobId,
    selected_jobber_property_id: propertyId,
    current_snapshot_id: snapshotId,
  }
}

function parseLinkJobberResult(value: unknown): LinkProgressJobberInvoiceRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate)) return null
  const seriesId = stringField(candidate, 'series_id')
  const version = positiveIntegerField(candidate, 'version')
  const quoteId = nullableStringField(candidate, 'quote_id')
  return seriesId && version && quoteId !== undefined
    ? { series_id: seriesId, version, quote_id: quoteId }
    : null
}

function parseJobberFailureResult(
  value: unknown
): RecordProgressJobberRefreshFailureRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate)) return null
  const seriesId = stringField(candidate, 'series_id')
  const version = positiveIntegerField(candidate, 'version')
  return seriesId && version ? { series_id: seriesId, version } : null
}

function parseRefreshJobberResult(value: unknown): RefreshProgressJobberInvoiceRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate)) return null
  const seriesId = stringField(candidate, 'series_id')
  const snapshotId = stringField(candidate, 'snapshot_id')
  const seriesVersion = positiveIntegerField(candidate, 'series_version')
  const inserted = nonNegativeIntegerField(candidate, 'inserted_payments')
  const revised = nonNegativeIntegerField(candidate, 'revised_payments')
  const unconfirmed = nonNegativeIntegerField(candidate, 'unconfirmed_payments')
  if (!seriesId || !snapshotId || !seriesVersion || inserted === null || revised === null
    || unconfirmed === null) return null
  return {
    series_id: seriesId,
    snapshot_id: snapshotId,
    series_version: seriesVersion,
    inserted_payments: inserted,
    revised_payments: revised,
    unconfirmed_payments: unconfirmed,
  }
}

function parseStandaloneJobberImportResult(
  value: unknown,
): CreateStandaloneProgressInvoiceFromJobberRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate)) return null
  const seriesId = stringField(candidate, 'series_id')
  const version = positiveIntegerField(candidate, 'version')
  const snapshotId = stringField(candidate, 'snapshot_id')
  const importedPayments = nonNegativeIntegerField(candidate, 'imported_payments')
  if (!seriesId || !version || !snapshotId || importedPayments === null) return null
  return {
    series_id: seriesId,
    version,
    snapshot_id: snapshotId,
    imported_payments: importedPayments,
  }
}

function parseAdjustment(value: unknown): AdjustmentMutationRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate)) return null
  const base = parseVersioned(candidate)
  const seriesId = stringField(candidate, 'series_id')
  const replacementId = nullableStringField(candidate, 'replacement_id')
  const quoteId = nullableStringField(candidate, 'quote_id')
  if (!base || !seriesId || replacementId === undefined || quoteId === undefined) return null
  return {
    ...base,
    series_id: seriesId,
    ...(replacementId === null ? {} : { replacement_id: replacementId }),
    quote_id: quoteId,
  }
}

function parseSeriesMutation(value: unknown): ProgressInvoiceSeriesMutationRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate)) return null
  const base = parseVersioned(candidate)
  const quoteId = nullableStringField(candidate, 'quote_id')
  return base && quoteId !== undefined ? { ...base, quote_id: quoteId } : null
}

function parseAdjustmentDetail(value: unknown): ProgressAdjustmentRpcDetail | null {
  if (!isRecord(value)) return null
  const id = stringField(value, 'id')
  const seriesId = stringField(value, 'series_id')
  const type = stringField(value, 'type')
  const status = stringField(value, 'status')
  const effectiveDate = stringField(value, 'effective_date')
  const description = stringField(value, 'description')
  const amount = stringField(value, 'amount_ex_gst')
  const supersededId = nullableStringField(value, 'superseded_adjustment_id')
  const reason = nullableStringField(value, 'reason')
  const quoteItemId = nullableStringField(value, 'quote_item_id')
  const version = positiveIntegerField(value, 'version')
  const displayOrder = value.display_order
  const validType = type === 'variation' || type === 'credit'
  const validStatus = status === 'draft' || status === 'approved' || status === 'rejected'
    || status === 'superseded' || status === 'void'
  if (!id || !seriesId || !validType || !validStatus || !effectiveDate || !description || !amount
    || supersededId === undefined || reason === undefined || quoteItemId === undefined
    || !version || typeof displayOrder !== 'number' || !Number.isSafeInteger(displayOrder)
    || displayOrder < 0 || value.gst_rate !== '0.10') return null
  return {
    id,
    series_id: seriesId,
    type,
    status,
    effective_date: effectiveDate,
    display_order: displayOrder,
    description,
    amount_ex_gst: amount,
    gst_rate: '0.10',
    superseded_adjustment_id: supersededId,
    reason,
    quote_item_id: quoteItemId,
    version,
  }
}

function parseBusinessInvoiceProfile(value: unknown): BusinessInvoiceProfileRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate)) return null
  const requiredStrings = [
    'id', 'legal_name', 'trading_name', 'abn', 'contractor_licence',
    'business_address', 'phone', 'email', 'bank_name', 'bsb',
    'bank_account_name', 'bank_account_number', 'created_by', 'updated_by',
    'created_at', 'updated_at',
  ] as const
  const values = Object.fromEntries(requiredStrings.map((key) => [key, stringField(candidate, key)]))
  if (Object.values(values).some((value) => value === null)) return null
  if (candidate.gst_rate !== '0.10' || candidate.business_timezone !== 'Australia/Sydney') return null
  const version = positiveIntegerField(candidate, 'version')
  const days = candidate.default_payment_term_days
  if (!version || typeof days !== 'number' || !Number.isSafeInteger(days) || days < 0 || days > 365) return null
  return {
    id: values.id as string,
    legal_name: values.legal_name as string,
    trading_name: values.trading_name as string,
    abn: values.abn as string,
    contractor_licence: values.contractor_licence as string,
    business_address: values.business_address as string,
    phone: values.phone as string,
    email: values.email as string,
    bank_name: values.bank_name as string,
    bsb: values.bsb as string,
    bank_account_name: values.bank_account_name as string,
    bank_account_number: values.bank_account_number as string,
    gst_rate: '0.10',
    business_timezone: 'Australia/Sydney',
    default_payment_term_days: days,
    version,
    created_by: values.created_by as string,
    updated_by: values.updated_by as string,
    created_at: values.created_at as string,
    updated_at: values.updated_at as string,
  }
}

function parseSeriesDetail(value: unknown): ProgressInvoiceSeriesRpcDetail | null {
  if (!isRecord(value)) return null
  const id = uuidField(value, 'id')
  const quoteId = nullableUuidField(value, 'quote_id')
  const sourceType = stringField(value, 'source_type')
  const version = positiveIntegerField(value, 'version')
  const status = stringField(value, 'status')
  const acceptedBase = nullableStringField(value, 'accepted_numbering_base')
  const linkLockedAt = nullableStringField(value, 'jobber_link_locked_at')
  const textKeys = [
    'recipient_name', 'recipient_company', 'recipient_address',
    'recipient_email', 'recipient_phone', 'recipient_abn', 'site_name', 'site_address',
    'default_description', 'reference',
  ] as const
  const moneyKeys = [
    'base_contract_ex_gst', 'current_adjusted_contract_ex_gst',
    'current_adjusted_contract_gst', 'current_adjusted_contract_inc_gst',
    'current_claimed_ex_gst', 'current_claimed_gst', 'current_claimed_inc_gst',
    'current_unclaimed_ex_gst', 'current_unclaimed_gst', 'current_unclaimed_inc_gst',
  ] as const
  const textFields = Object.fromEntries(textKeys.map((key) => [key, stringField(value, key)]))
  const moneyFields = Object.fromEntries(moneyKeys.map((key) => [key, moneyField(value, key)]))
  const cumulativePercentage = percentageField(value, 'current_cumulative_percentage')
  const validSource = sourceType === 'pbc_quote' || sourceType === 'jobber_job'
    || sourceType === 'jobber_invoice' || sourceType === 'manual'
  const validStatus = status === 'draft' || status === 'active' || status === 'completed'
    || status === 'reconciliation_required' || status === 'void'
  if (!id || quoteId === undefined || !validSource || !version || !validStatus
    || acceptedBase === undefined || linkLockedAt === undefined
    || value.gst_rate !== '0.10' || !cumulativePercentage
    || Object.values(textFields).some((field) => field === null)
    || Object.values(moneyFields).some((field) => field === null)) return null
  return {
    id,
    quote_id: quoteId,
    source_type: sourceType,
    version,
    base_contract_ex_gst: moneyFields.base_contract_ex_gst as string,
    gst_rate: '0.10',
    recipient_name: textFields.recipient_name as string,
    recipient_company: textFields.recipient_company as string,
    recipient_address: textFields.recipient_address as string,
    recipient_email: textFields.recipient_email as string,
    recipient_phone: textFields.recipient_phone as string,
    recipient_abn: textFields.recipient_abn as string,
    site_name: textFields.site_name as string,
    site_address: textFields.site_address as string,
    default_description: textFields.default_description as string,
    reference: textFields.reference as string,
    status,
    accepted_numbering_base: acceptedBase,
    jobber_link_locked_at: linkLockedAt,
    current_adjusted_contract_ex_gst: moneyFields.current_adjusted_contract_ex_gst as string,
    current_adjusted_contract_gst: moneyFields.current_adjusted_contract_gst as string,
    current_adjusted_contract_inc_gst: moneyFields.current_adjusted_contract_inc_gst as string,
    current_claimed_ex_gst: moneyFields.current_claimed_ex_gst as string,
    current_claimed_gst: moneyFields.current_claimed_gst as string,
    current_claimed_inc_gst: moneyFields.current_claimed_inc_gst as string,
    current_unclaimed_ex_gst: moneyFields.current_unclaimed_ex_gst as string,
    current_unclaimed_gst: moneyFields.current_unclaimed_gst as string,
    current_unclaimed_inc_gst: moneyFields.current_unclaimed_inc_gst as string,
    current_cumulative_percentage: cumulativePercentage,
  }
}

function parseDashboardItem(value: unknown): ProgressInvoiceDashboardRpcItem | null {
  if (!isRecord(value)) return null
  const id = stringField(value, 'id')
  const sourceType = stringField(value, 'source_type')
  const quoteId = nullableStringField(value, 'quote_id')
  const recipientName = stringField(value, 'recipient_name')
  const recipientCompany = stringField(value, 'recipient_company')
  const siteName = stringField(value, 'site_name')
  const status = stringField(value, 'status')
  const paymentState = stringField(value, 'current_payment_state')
  const lastSync = nullableStringField(value, 'last_successful_jobber_sync_at')
  const syncError = nullableStringField(value, 'last_jobber_sync_error_code')
  const version = positiveIntegerField(value, 'version')
  const adjusted = nonNegativeMoneyField(value, 'current_adjusted_contract_ex_gst')
  const claimed = nonNegativeMoneyField(value, 'current_claimed_inc_gst')
  const received = moneyField(value, 'current_actual_receipts')
  const outstanding = nonNegativeMoneyField(value, 'current_outstanding_receivable')
  const credit = nonNegativeMoneyField(value, 'current_credit_balance')
  const unclaimed = nonNegativeMoneyField(value, 'current_unclaimed_inc_gst')
  const cumulative = percentageField(value, 'current_cumulative_percentage')
  const manifestClaimCount = nonNegativeIntegerField(value, 'current_manifest_claim_count')
  const invoiceNumber = stringField(value, 'invoice_number')
  const reference = stringField(value, 'reference')
  const validSource = sourceType === 'pbc_quote' || sourceType === 'jobber_job'
    || sourceType === 'jobber_invoice' || sourceType === 'manual'
  const validStatus = status === 'draft' || status === 'active' || status === 'completed'
    || status === 'reconciliation_required' || status === 'void'
  const validPayment = paymentState === 'unpaid' || paymentState === 'part_paid'
    || paymentState === 'paid' || paymentState === 'overdue' || paymentState === 'credit_balance'
  if (!id || !validSource || quoteId === undefined || !recipientName || recipientCompany === null
    || !siteName || !validStatus || !validPayment || lastSync === undefined || syncError === undefined
    || !version || !adjusted || !claimed || !received || !outstanding || !credit || !unclaimed
    || !cumulative || manifestClaimCount === null || invoiceNumber === null || reference === null) return null
  return {
    id,
    source_type: sourceType,
    quote_id: quoteId,
    recipient_name: recipientName,
    recipient_company: recipientCompany,
    site_name: siteName,
    status,
    current_adjusted_contract_ex_gst: adjusted,
    current_claimed_inc_gst: claimed,
    current_actual_receipts: received,
    current_outstanding_receivable: outstanding,
    current_credit_balance: credit,
    current_unclaimed_inc_gst: unclaimed,
    current_cumulative_percentage: cumulative,
    current_payment_state: paymentState,
    current_manifest_claim_count: manifestClaimCount,
    invoice_number: invoiceNumber,
    reference,
    last_successful_jobber_sync_at: lastSync,
    last_jobber_sync_error_code: syncError,
    version,
  }
}

function parseDashboardSummary(value: unknown): ProgressInvoiceDashboardRpcSummary | null {
  if (!isRecord(value)) return null
  const adjusted = nonNegativeMoneyField(value, 'current_adjusted_contract_ex_gst')
  const claimed = nonNegativeMoneyField(value, 'current_claimed_inc_gst')
  const received = moneyField(value, 'current_actual_receipts')
  const outstanding = nonNegativeMoneyField(value, 'current_outstanding_receivable')
  const credit = nonNegativeMoneyField(value, 'current_credit_balance')
  const unclaimed = nonNegativeMoneyField(value, 'current_unclaimed_inc_gst')
  if (!adjusted || !claimed || !received || !outstanding || !credit || !unclaimed) return null
  return {
    current_adjusted_contract_ex_gst: adjusted,
    current_claimed_inc_gst: claimed,
    current_actual_receipts: received,
    current_outstanding_receivable: outstanding,
    current_credit_balance: credit,
    current_unclaimed_inc_gst: unclaimed,
  }
}

function parseDashboard(value: unknown): ProgressInvoiceDashboardRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate) || !Array.isArray(candidate.items)) return null
  const page = positiveIntegerField(candidate, 'page')
  const pageSize = positiveIntegerField(candidate, 'page_size')
  const total = nonNegativeIntegerField(candidate, 'total')
  const summary = parseDashboardSummary(candidate.summary)
  const items = candidate.items.map(parseDashboardItem)
  if (!page || !pageSize || total === null || !summary || items.some((item) => item === null)) return null
  return { items: items as ProgressInvoiceDashboardRpcItem[], summary, page, page_size: pageSize, total }
}

function parseSeriesRead(value: unknown): ProgressInvoiceSeriesReadRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate) || !('series' in candidate)) return null
  if (candidate.series === null) return { series: null }
  const series = parseSeriesDetail(candidate.series)
  return series ? { series } : null
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH_PATTERN = /^[0-9a-f]{64}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const SERIES_DETAIL_KEYS = [
  'id', 'quote_id', 'source_type', 'version', 'base_contract_ex_gst', 'gst_rate',
  'recipient_name', 'recipient_company', 'recipient_address', 'recipient_email',
  'recipient_phone', 'recipient_abn', 'site_name', 'site_address', 'default_description',
  'reference', 'status', 'accepted_numbering_base', 'jobber_link_locked_at',
  'current_adjusted_contract_ex_gst', 'current_adjusted_contract_gst',
  'current_adjusted_contract_inc_gst', 'current_claimed_ex_gst', 'current_claimed_gst',
  'current_claimed_inc_gst', 'current_unclaimed_ex_gst', 'current_unclaimed_gst',
  'current_unclaimed_inc_gst', 'current_cumulative_percentage',
] as const

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function uuidField(record: Record<string, unknown>, key: string): string | null {
  const value = stringField(record, key)
  return value && UUID_PATTERN.test(value) ? value : null
}

function nullableUuidField(record: Record<string, unknown>, key: string): string | null | undefined {
  const value = nullableStringField(record, key)
  return value === null || (value && UUID_PATTERN.test(value)) ? value : undefined
}

function dateField(record: Record<string, unknown>, key: string): string | null {
  const value = stringField(record, key)
  if (!value || !DATE_PATTERN.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : null
}

function nullableDateField(record: Record<string, unknown>, key: string): string | null | undefined {
  return record[key] === null ? null : dateField(record, key) ?? undefined
}

function timestampField(record: Record<string, unknown>, key: string): string | null {
  const value = stringField(record, key)
  return value && TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value)) ? value : null
}

function nullableTimestampField(record: Record<string, unknown>, key: string): string | null | undefined {
  return record[key] === null ? null : timestampField(record, key) ?? undefined
}

function nullableMoneyField(record: Record<string, unknown>, key: string): string | null | undefined {
  return record[key] === null ? null : moneyField(record, key) ?? undefined
}

function nullableTextField(record: Record<string, unknown>, key: string): string | null | undefined {
  const value = nullableStringField(record, key)
  return value !== undefined && (value === null || value.length <= 2048) ? value : undefined
}

function parseImportedObservation(value: unknown): ProgressInvoiceImportedObservationRpcDto | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'original_invoice_number', 'observed_invoice_number', 'normalized_status',
    'invoice_subtotal', 'invoice_tax', 'invoice_total', 'invoice_balance',
    'issued_date', 'due_date', 'received_date', 'external_updated_at', 'client_name',
    'client_company_name', 'client_email', 'client_phone', 'billing_address',
    'property_address', 'fetched_at',
  ])) return null
  const status = stringField(value, 'normalized_status')
  const validStatus = status === 'draft' || status === 'awaiting_payment' || status === 'part_paid'
    || status === 'paid' || status === 'past_due' || status === 'unknown'
  const original = stringField(value, 'original_invoice_number')
  const observed = stringField(value, 'observed_invoice_number')
  const clientName = stringField(value, 'client_name')
  const fetchedAt = timestampField(value, 'fetched_at')
  const subtotal = nullableMoneyField(value, 'invoice_subtotal')
  const tax = nullableMoneyField(value, 'invoice_tax')
  const total = nullableMoneyField(value, 'invoice_total')
  const balance = nullableMoneyField(value, 'invoice_balance')
  const issuedDate = nullableDateField(value, 'issued_date')
  const dueDate = nullableDateField(value, 'due_date')
  const receivedDate = nullableDateField(value, 'received_date')
  const externalUpdatedAt = nullableTimestampField(value, 'external_updated_at')
  const optionalText = ['client_company_name', 'client_email', 'client_phone', 'billing_address', 'property_address'] as const
  const texts = Object.fromEntries(optionalText.map((key) => [key, nullableTextField(value, key)]))
  if (!validStatus || !original || !observed || !clientName || !fetchedAt
    || subtotal === undefined || tax === undefined || total === undefined || balance === undefined
    || issuedDate === undefined || dueDate === undefined || receivedDate === undefined
    || externalUpdatedAt === undefined || Object.values(texts).some((entry) => entry === undefined)) return null
  return {
    original_invoice_number: original,
    observed_invoice_number: observed,
    normalized_status: status,
    invoice_subtotal: subtotal,
    invoice_tax: tax,
    invoice_total: total,
    invoice_balance: balance,
    issued_date: issuedDate,
    due_date: dueDate,
    received_date: receivedDate,
    external_updated_at: externalUpdatedAt,
    client_name: clientName,
    client_company_name: texts.client_company_name as string | null,
    client_email: texts.client_email as string | null,
    client_phone: texts.client_phone as string | null,
    billing_address: texts.billing_address as string | null,
    property_address: texts.property_address as string | null,
    fetched_at: fetchedAt,
  }
}

function parseCurrentRevisionSet(value: unknown): ProgressInvoiceCurrentRevisionSetRpcDto | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'revision_manifest_hash', 'current_manifest_claim_count', 'current_claim_revision_id',
  ])) return null
  const id = uuidField(value, 'id')
  const hash = stringField(value, 'revision_manifest_hash')
  const count = nonNegativeIntegerField(value, 'current_manifest_claim_count')
  const revisionId = nullableUuidField(value, 'current_claim_revision_id')
  if (!id || !hash || !HASH_PATTERN.test(hash) || count === null || revisionId === undefined
    || (count === 0) !== (revisionId === null)) return null
  return {
    id,
    revision_manifest_hash: hash,
    current_manifest_claim_count: count,
    current_claim_revision_id: revisionId,
  }
}

function parseWorkspaceAdjustment(value: unknown): ProgressInvoiceAdjustmentRpcDto | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'type', 'status', 'effective_date', 'display_order', 'description',
    'amount_ex_gst', 'gst_rate', 'reason', 'version',
  ])) return null
  const id = uuidField(value, 'id')
  const type = stringField(value, 'type')
  const status = stringField(value, 'status')
  const date = dateField(value, 'effective_date')
  const displayOrder = nonNegativeIntegerField(value, 'display_order')
  const description = stringField(value, 'description')
  const amount = nonNegativeMoneyField(value, 'amount_ex_gst')
  const reason = nullableTextField(value, 'reason')
  const version = positiveIntegerField(value, 'version')
  if (!id || (type !== 'variation' && type !== 'credit')
    || !['draft', 'approved', 'rejected', 'superseded', 'void'].includes(status ?? '')
    || !date || displayOrder === null || !description || !amount || value.gst_rate !== '0.10'
    || reason === undefined || !version) return null
  return { id, type, status: status as ProgressInvoiceAdjustmentRpcDto['status'], effective_date: date,
    display_order: displayOrder, description, amount_ex_gst: amount, gst_rate: '0.10', reason, version }
}

function parseClaimRevision(value: unknown): ProgressInvoiceClaimRevisionRpcDto | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'revision_number', 'state', 'issue_date', 'due_date', 'description', 'reference',
    'current_claim_ex_gst', 'current_claim_gst', 'current_claim_inc_gst',
    'cumulative_percentage', 'remaining_ex_gst', 'remaining_gst', 'remaining_inc_gst',
    'edit_classification', 'tax_review_state', 'created_at',
  ])) return null
  const id = uuidField(value, 'id')
  const revisionNumber = positiveIntegerField(value, 'revision_number')
  const state = stringField(value, 'state')
  const issueDate = dateField(value, 'issue_date')
  const dueDate = dateField(value, 'due_date')
  const description = stringField(value, 'description')
  const reference = nullableTextField(value, 'reference')
  const moneyKeys = ['current_claim_ex_gst', 'current_claim_gst', 'current_claim_inc_gst', 'remaining_ex_gst', 'remaining_gst', 'remaining_inc_gst'] as const
  const money = Object.fromEntries(moneyKeys.map((key) => [key, nonNegativeMoneyField(value, key)]))
  const cumulative = percentageField(value, 'cumulative_percentage')
  const classification = stringField(value, 'edit_classification')
  const taxReview = stringField(value, 'tax_review_state')
  const createdAt = timestampField(value, 'created_at')
  if (!id || !revisionNumber || !['draft', 'issued', 'superseded'].includes(state ?? '')
    || !issueDate || !dueDate || !description || reference === undefined
    || Object.values(money).some((entry) => !entry) || !cumulative
    || !['clerical', 'financial_tax_affecting'].includes(classification ?? '')
    || !['not_required', 'pending', 'approved', 'external_reference_required', 'external_reference_recorded'].includes(taxReview ?? '')
    || !createdAt) return null
  return {
    id, revision_number: revisionNumber, state: state as ProgressInvoiceClaimRevisionRpcDto['state'],
    issue_date: issueDate, due_date: dueDate, description, reference,
    current_claim_ex_gst: money.current_claim_ex_gst as string,
    current_claim_gst: money.current_claim_gst as string,
    current_claim_inc_gst: money.current_claim_inc_gst as string,
    cumulative_percentage: cumulative,
    remaining_ex_gst: money.remaining_ex_gst as string,
    remaining_gst: money.remaining_gst as string,
    remaining_inc_gst: money.remaining_inc_gst as string,
    edit_classification: classification as ProgressInvoiceClaimRevisionRpcDto['edit_classification'],
    tax_review_state: taxReview as ProgressInvoiceClaimRevisionRpcDto['tax_review_state'],
    created_at: createdAt,
  }
}

function parseWorkspaceClaim(value: unknown): ProgressInvoiceClaimRpcDto | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'sequence', 'kind', 'suffix', 'tax_invoice_number', 'status',
    'original_issued_at', 'latest_revised_at', 'version', 'current_revision',
  ])) return null
  const id = uuidField(value, 'id')
  const sequence = positiveIntegerField(value, 'sequence')
  const kind = stringField(value, 'kind')
  const suffix = stringField(value, 'suffix')
  const invoiceNumber = stringField(value, 'tax_invoice_number')
  const status = stringField(value, 'status')
  const originalIssuedAt = nullableTimestampField(value, 'original_issued_at')
  const latestRevisedAt = nullableTimestampField(value, 'latest_revised_at')
  const version = positiveIntegerField(value, 'version')
  const revision = value.current_revision === null ? null : parseClaimRevision(value.current_revision)
  if (!id || !sequence || (kind !== 'progress' && kind !== 'final') || !suffix || !invoiceNumber
    || !['draft', 'issued', 'void'].includes(status ?? '') || originalIssuedAt === undefined
    || latestRevisedAt === undefined || !version || (value.current_revision !== null && !revision)) return null
  return { id, sequence, kind, suffix, tax_invoice_number: invoiceNumber,
    status: status as ProgressInvoiceClaimRpcDto['status'], original_issued_at: originalIssuedAt,
    latest_revised_at: latestRevisedAt, version, current_revision: revision }
}

function parsePaymentRevision(value: unknown): ProgressInvoicePaymentRevisionRpcDto | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'revision_number', 'received_date', 'observed_amount', 'effective_receipt_amount',
    'payment_method', 'reference', 'external_status', 'external_updated_at', 'sync_state',
    'status', 'source_observed_at', 'reason', 'created_at',
  ])) return null
  const id = uuidField(value, 'id')
  const revisionNumber = positiveIntegerField(value, 'revision_number')
  const receivedDate = dateField(value, 'received_date')
  const observed = nonNegativeMoneyField(value, 'observed_amount')
  const effective = moneyField(value, 'effective_receipt_amount')
  const nullableTextKeys = ['payment_method', 'reference', 'external_status', 'reason'] as const
  const text = Object.fromEntries(nullableTextKeys.map((key) => [key, nullableTextField(value, key)]))
  const externalUpdatedAt = nullableTimestampField(value, 'external_updated_at')
  const sourceObservedAt = nullableTimestampField(value, 'source_observed_at')
  const syncState = nullableStringField(value, 'sync_state')
  const status = stringField(value, 'status')
  const createdAt = timestampField(value, 'created_at')
  if (!id || !revisionNumber || !receivedDate || !observed || !effective
    || Object.values(text).some((entry) => entry === undefined)
    || externalUpdatedAt === undefined || sourceObservedAt === undefined
    || (syncState !== null && !['manual', 'observed', 'changed', 'disappeared', 'refunded', 'reversed', 'ambiguous'].includes(syncState ?? ''))
    || !['active', 'superseded', 'unconfirmed', 'void'].includes(status ?? '') || !createdAt) return null
  return {
    id, revision_number: revisionNumber, received_date: receivedDate, observed_amount: observed,
    effective_receipt_amount: effective, payment_method: text.payment_method as string | null,
    reference: text.reference as string | null, external_status: text.external_status as string | null,
    external_updated_at: externalUpdatedAt,
    sync_state: syncState as ProgressInvoicePaymentRevisionRpcDto['sync_state'],
    status: status as ProgressInvoicePaymentRevisionRpcDto['status'], source_observed_at: sourceObservedAt,
    reason: text.reason as string | null, created_at: createdAt,
  }
}

function parseWorkspacePayment(value: unknown): ProgressInvoicePaymentRpcDto | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'source', 'matched_manual_payment_id', 'version', 'current_revision',
  ])) return null
  const id = uuidField(value, 'id')
  const source = stringField(value, 'source')
  const matchedId = nullableUuidField(value, 'matched_manual_payment_id')
  const version = positiveIntegerField(value, 'version')
  const revision = value.current_revision === null ? null : parsePaymentRevision(value.current_revision)
  if (!id || (source !== 'jobber' && source !== 'manual') || matchedId === undefined || !version
    || (value.current_revision !== null && !revision)) return null
  return { id, source, matched_manual_payment_id: matchedId, version, current_revision: revision }
}

function parseWorkspaceDocument(value: unknown): ProgressInvoiceDocumentRpcDto | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'claim_revision_id', 'revision_set_id', 'scope', 'format', 'template_id',
    'template_version', 'renderer_version', 'sha256', 'page_or_worksheet_count',
    'revision_manifest_hash', 'generated_at', 'created_at', 'is_current',
  ])) return null
  const id = uuidField(value, 'id')
  const claimRevisionId = nullableUuidField(value, 'claim_revision_id')
  const revisionSetId = nullableUuidField(value, 'revision_set_id')
  const scope = stringField(value, 'scope')
  const format = stringField(value, 'format')
  const templateId = uuidField(value, 'template_id')
  const templateVersion = positiveIntegerField(value, 'template_version')
  const rendererVersion = stringField(value, 'renderer_version')
  const sha = stringField(value, 'sha256')
  const count = positiveIntegerField(value, 'page_or_worksheet_count')
  const manifestHash = nullableStringField(value, 'revision_manifest_hash')
  const generatedAt = timestampField(value, 'generated_at')
  const createdAt = timestampField(value, 'created_at')
  const current = typeof value.is_current === 'boolean' ? value.is_current : null
  const validParent = scope === 'current_claim'
    ? claimRevisionId !== null && revisionSetId === null
    : scope === 'series_bundle' && claimRevisionId === null && revisionSetId !== null
  if (!id || claimRevisionId === undefined || revisionSetId === undefined || !validParent
    || (format !== 'xlsx' && format !== 'pdf') || !templateId || !templateVersion || !rendererVersion
    || !sha || !HASH_PATTERN.test(sha) || !count
    || manifestHash === undefined || (manifestHash !== null && !HASH_PATTERN.test(manifestHash))
    || !generatedAt || !createdAt || current === null) return null
  return { id, claim_revision_id: claimRevisionId, revision_set_id: revisionSetId,
    scope: scope as ProgressInvoiceDocumentRpcDto['scope'],
    format, template_id: templateId, template_version: templateVersion, renderer_version: rendererVersion,
    sha256: sha, page_or_worksheet_count: count, revision_manifest_hash: manifestHash,
    generated_at: generatedAt, created_at: createdAt, is_current: current }
}

const SAFE_SIMPLE_EVENT_KEYS = new Set(['source_type', 'type', 'number_source', 'quote_id', 'adjustment_id', 'replacement_id'])
const SAFE_CHANGE_EVENT_KEYS = new Set([
  'base_contract_ex_gst', 'gst_rate', 'recipient_name', 'recipient_company',
  'recipient_address', 'recipient_email', 'recipient_phone', 'recipient_abn',
  'site_name', 'site_address', 'default_description', 'reference', 'effective_date',
  'description', 'amount_ex_gst', 'quote_item_id',
])
const UNSAFE_EVENT_VALUE_PATTERN = /(?:https?:\/\/|s3:\/\/|storage[_ -]?path|bank[_ -]|account[_ -]|\bbsb\b|response[_ -]?fingerprint|raw[_ -])/i

function isSafeEventScalar(value: unknown): value is string | number | null {
  return value === null
    || (typeof value === 'string' && value.length <= 2000 && !UNSAFE_EVENT_VALUE_PATTERN.test(value))
    || (typeof value === 'number' && Number.isFinite(value))
}

function parseSafeFieldChanges(value: unknown): ProgressInvoiceSafeFieldChangesRpcDto | null {
  if (!isRecord(value)) return null
  const result: Record<string, string | number | null | { before: string | number | null; after: string | number | null }> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (SAFE_SIMPLE_EVENT_KEYS.has(key) && isSafeEventScalar(entry)) {
      result[key] = entry
      continue
    }
    if (SAFE_CHANGE_EVENT_KEYS.has(key) && isRecord(entry) && hasExactKeys(entry, ['before', 'after'])
      && isSafeEventScalar(entry.before) && isSafeEventScalar(entry.after)) {
      result[key] = { before: entry.before, after: entry.after }
      continue
    }
    return null
  }
  return result
}

function parseSafeEvent(value: unknown): ProgressInvoiceSafeEventRpcDto | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'claim_id', 'event_type', 'source', 'occurred_at', 'prior_revision_id',
    'next_revision_id', 'safe_field_changes',
  ])) return null
  const id = uuidField(value, 'id')
  const claimId = nullableUuidField(value, 'claim_id')
  const eventType = stringField(value, 'event_type')
  const source = stringField(value, 'source')
  const occurredAt = timestampField(value, 'occurred_at')
  const priorRevisionId = nullableUuidField(value, 'prior_revision_id')
  const nextRevisionId = nullableUuidField(value, 'next_revision_id')
  const changes = parseSafeFieldChanges(value.safe_field_changes)
  if (!id || claimId === undefined || !eventType || eventType.length > 120
    || !['user', 'jobber_sync', 'system'].includes(source ?? '') || !occurredAt
    || priorRevisionId === undefined || nextRevisionId === undefined || !changes) return null
  return { id, claim_id: claimId, event_type: eventType,
    source: source as ProgressInvoiceSafeEventRpcDto['source'], occurred_at: occurredAt,
    prior_revision_id: priorRevisionId, next_revision_id: nextRevisionId, safe_field_changes: changes }
}

function parseWorkspace(value: unknown): ProgressInvoiceWorkspaceRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate) || !('series' in candidate)) return null
  if (candidate.series === null) {
    return hasExactKeys(candidate, ['series']) ? { series: null } : null
  }
  if (!hasExactKeys(candidate, [
    'series', 'summary', 'imported_jobber_observation', 'current_revision_set', 'adjustments',
    'claims', 'payments', 'ready_documents', 'recent_events', 'history', 'capabilities',
  ])) return null
  const series = isRecord(candidate.series) && hasExactKeys(candidate.series, SERIES_DETAIL_KEYS)
    ? parseSeriesDetail(candidate.series)
    : null
  if (!series || !isRecord(candidate.summary) || !hasExactKeys(candidate.summary, [
    'adjusted_ex_gst', 'adjusted_gst', 'adjusted_inc_gst', 'claimed_inc_gst', 'received_inc_gst',
    'outstanding_inc_gst', 'credit_balance_inc_gst', 'unclaimed_inc_gst', 'cumulative_percentage',
  ])) return null
  const summaryMoneyKeys = ['adjusted_ex_gst', 'adjusted_gst', 'adjusted_inc_gst', 'claimed_inc_gst',
    'outstanding_inc_gst', 'credit_balance_inc_gst', 'unclaimed_inc_gst'] as const
  const summaryMoney = Object.fromEntries(summaryMoneyKeys.map((key) => [key, nonNegativeMoneyField(candidate.summary as Record<string, unknown>, key)]))
  const received = moneyField(candidate.summary as Record<string, unknown>, 'received_inc_gst')
  const cumulative = percentageField(candidate.summary as Record<string, unknown>, 'cumulative_percentage')
  if (Object.values(summaryMoney).some((entry) => !entry) || !received || !cumulative) return null
  const observation = candidate.imported_jobber_observation === null
    ? null : parseImportedObservation(candidate.imported_jobber_observation)
  const revisionSet = candidate.current_revision_set === null
    ? null : parseCurrentRevisionSet(candidate.current_revision_set)
  if ((candidate.imported_jobber_observation !== null && !observation)
    || (candidate.current_revision_set !== null && !revisionSet)) return null
  if (!Array.isArray(candidate.adjustments) || candidate.adjustments.length > 250
    || !Array.isArray(candidate.claims) || candidate.claims.length > 100
    || !Array.isArray(candidate.payments) || candidate.payments.length > 500
    || !Array.isArray(candidate.ready_documents) || candidate.ready_documents.length > 100
    || !Array.isArray(candidate.recent_events) || candidate.recent_events.length > 20) return null
  const adjustments = candidate.adjustments.map(parseWorkspaceAdjustment)
  const claims = candidate.claims.map(parseWorkspaceClaim)
  const payments = candidate.payments.map(parseWorkspacePayment)
  const documents = candidate.ready_documents.map(parseWorkspaceDocument)
  const events = candidate.recent_events.map(parseSafeEvent)
  if ([...adjustments, ...claims, ...payments, ...documents, ...events].some((entry) => entry === null)) return null
  if (!isRecord(candidate.history) || !hasExactKeys(candidate.history, ['next_cursor'])) return null
  const nextCursor = nullableUuidField(candidate.history, 'next_cursor')
  if (nextCursor === undefined || !isRecord(candidate.capabilities) || !hasExactKeys(candidate.capabilities, [
    'can_edit_series', 'can_edit_base_contract', 'can_void_series_directly',
    'requires_claim_void_workflow', 'can_create_claim', 'can_download_current', 'can_download_historical',
  ])) return null
  const capabilityKeys = Object.keys(candidate.capabilities)
  if (capabilityKeys.some((key) => typeof (candidate.capabilities as Record<string, unknown>)[key] !== 'boolean')) return null
  return {
    series,
    summary: {
      adjusted_ex_gst: summaryMoney.adjusted_ex_gst as string,
      adjusted_gst: summaryMoney.adjusted_gst as string,
      adjusted_inc_gst: summaryMoney.adjusted_inc_gst as string,
      claimed_inc_gst: summaryMoney.claimed_inc_gst as string,
      received_inc_gst: received,
      outstanding_inc_gst: summaryMoney.outstanding_inc_gst as string,
      credit_balance_inc_gst: summaryMoney.credit_balance_inc_gst as string,
      unclaimed_inc_gst: summaryMoney.unclaimed_inc_gst as string,
      cumulative_percentage: cumulative,
    },
    imported_jobber_observation: observation,
    current_revision_set: revisionSet,
    adjustments: adjustments as ProgressInvoiceAdjustmentRpcDto[],
    claims: claims as ProgressInvoiceClaimRpcDto[],
    payments: payments as ProgressInvoicePaymentRpcDto[],
    ready_documents: documents as ProgressInvoiceDocumentRpcDto[],
    recent_events: events as ProgressInvoiceSafeEventRpcDto[],
    history: { next_cursor: nextCursor },
    capabilities: candidate.capabilities as ProgressInvoiceWorkspaceRpcResult['capabilities'],
  }
}

function parseHistory(value: unknown): ProgressInvoiceHistoryRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate) || !hasExactKeys(candidate, ['events', 'next_cursor'])
    || !Array.isArray(candidate.events) || candidate.events.length > 50) return null
  const events = candidate.events.map(parseSafeEvent)
  const nextCursor = nullableUuidField(candidate, 'next_cursor')
  if (events.some((event) => event === null) || nextCursor === undefined) return null
  return { events: events as ProgressInvoiceSafeEventRpcDto[], next_cursor: nextCursor }
}

function parseRpcError(error: ProgressInvoiceRpcError): { message: string; code: string } {
  return {
    message: typeof error.message === 'string' ? error.message : '',
    code: typeof error.code === 'string' ? error.code : '',
  }
}

function mapRpcError(error: ProgressInvoiceRpcError): ActionResult<never> {
  const parsed = parseRpcError(error)
  const domain = DOMAIN_ERROR_CODES[parsed.message]
  if (domain) return { ok: false, ...domain }
  if (['28000', '28P01', 'PGRST301', 'PGRST302'].includes(parsed.code)) {
    return { ok: false, error: 'PROGRESS_AUTH_REQUIRED', code: 'AUTH_REQUIRED' }
  }
  if (parsed.code === '42501') return { ok: false, error: 'PROGRESS_FORBIDDEN', code: 'FORBIDDEN' }
  if (parsed.code === 'PGRST116') return { ok: false, error: 'PROGRESS_NOT_FOUND', code: 'NOT_FOUND' }
  if (parsed.code.startsWith('22') || parsed.code.startsWith('23')) {
    return {
      ok: false,
      error: parsed.code === '23505' ? 'PROGRESS_UNIQUE_CONFLICT' : 'PROGRESS_VALIDATION_FAILED',
      code: 'VALIDATION',
    }
  }
  return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
}

function toJson(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) return value.map(toJson)
  if (!isRecord(value)) throw new Error('Progress Invoice payload is not JSON serializable')
  const result: Record<string, Json | undefined> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = toJson(entry)
  }
  return result
}

function parseSuccess<TCommand extends ProgressInvoiceCommand>(
  command: TCommand,
  value: unknown
): CommandResult<TCommand> | null {
  if (command === 'save_business_invoice_profile') return parseBusinessInvoiceProfile(value) as CommandResult<TCommand> | null
  if (command === 'create_manual_progress_invoice_series') {
    return parseVersioned(value) as CommandResult<TCommand> | null
  }
  if (command === 'update_progress_invoice_series') return parseSeriesMutation(value) as CommandResult<TCommand> | null
  if (command === 'list_progress_invoice_series') return parseDashboard(value) as CommandResult<TCommand> | null
  if (command === 'get_progress_invoice_series') return parseSeriesRead(value) as CommandResult<TCommand> | null
  if (command === 'get_progress_invoice_workspace') return parseWorkspace(value) as CommandResult<TCommand> | null
  if (command === 'list_progress_invoice_history') return parseHistory(value) as CommandResult<TCommand> | null
  if (command === 'get_progress_invoice_jobber_context') return parseJobberContext(value) as CommandResult<TCommand> | null
  if (command === 'accept_progress_jobber_invoice_number') return parseVersioned(value) as CommandResult<TCommand> | null
  return parseAdjustment(value) as CommandResult<TCommand> | null
}

export class ProgressInvoiceRepository {
  constructor(private readonly executor: ProgressInvoiceRpcExecutor) {}

  async call<TCommand extends ProgressInvoiceCommand>(
    command: TCommand,
    payload: CommandPayload<TCommand>
  ): Promise<ActionResult<CommandResult<TCommand>, CommandCurrent<TCommand>>> {
    const { data, error } = await this.executor.execute(command, toJson(payload))
    if (error) return mapRpcError(error)

    if (command !== 'save_business_invoice_profile'
      && command !== 'create_manual_progress_invoice_series'
      && command !== 'list_progress_invoice_series'
      && command !== 'get_progress_invoice_series'
      && command !== 'get_progress_invoice_workspace'
      && command !== 'list_progress_invoice_history'
      && command !== 'get_progress_invoice_jobber_context') {
      const candidate = singleton(data)
      if (isRecord(candidate) && candidate.conflict === true) {
        const current = command === 'update_progress_invoice_series'
          || command === 'accept_progress_jobber_invoice_number'
          ? parseSeriesDetail(candidate.current)
          : parseAdjustmentDetail(candidate.current)
        if (!current) return { ok: false, error: 'PROGRESS_RESPONSE_INVALID' }
        return {
          ok: false,
          error: 'PROGRESS_VERSION_CONFLICT',
          code: 'VERSION_CONFLICT',
          current,
        } as ActionResult<CommandResult<TCommand>, CommandCurrent<TCommand>>
      }
    }

    const result = parseSuccess(command, data)
    return result ? { ok: true, data: result } : { ok: false, error: 'PROGRESS_RESPONSE_INVALID' }
  }
}

export function createProgressInvoiceRpcExecutor(
  client: ProgressInvoiceAuthenticatedClient
): ProgressInvoiceRpcExecutor {
  type Rpc = (
    command: string,
    args: { payload: Json }
  ) => PromiseLike<{ data: unknown; error: ProgressInvoiceRpcError | null }>
  const rpc = client.rpc.bind(client) as unknown as Rpc
  return {
    async execute(command, payload) {
      const { data, error } = await rpc(command, { payload })
      return { data, error }
    },
  }
}

export class ProgressInvoiceJobberPersistenceRepository {
  constructor(private readonly executor: ProgressInvoiceServiceRpcExecutor) {}

  async call<TCommand extends ProgressInvoiceServiceCommand>(
    command: TCommand,
    payload: ServiceCommandPayload<TCommand>
  ): Promise<ActionResult<ServiceCommandResult<TCommand>>> {
    const { data, error } = await this.executor.execute(command, toJson(payload))
    if (error) return mapRpcError(error)

    const result = command === 'create_progress_invoice_series_from_jobber'
      ? parseStandaloneJobberImportResult(data)
      : command === 'apply_progress_invoice_jobber_refresh'
      ? parseRefreshJobberResult(data)
      : command === 'link_progress_jobber_invoice'
        ? parseLinkJobberResult(data)
        : parseJobberFailureResult(data)
    return result
      ? { ok: true, data: result as ServiceCommandResult<TCommand> }
      : { ok: false, error: 'PROGRESS_RESPONSE_INVALID' }
  }
}

export function createProgressInvoiceServiceRpcExecutor(
  client: ProgressInvoiceServiceClient
): ProgressInvoiceServiceRpcExecutor {
  type Rpc = (
    command: string,
    args: { payload: Json }
  ) => PromiseLike<{ data: unknown; error: ProgressInvoiceRpcError | null }>
  const rpc = client.rpc.bind(client) as unknown as Rpc
  return {
    async execute(command, payload) {
      const { data, error } = await rpc(command, { payload })
      return { data, error }
    },
  }
}

export async function createProgressInvoiceRepository(): Promise<ProgressInvoiceRepository> {
  const client = await createClient()
  return new ProgressInvoiceRepository(createProgressInvoiceRpcExecutor(client))
}

export async function createProgressInvoiceJobberPersistenceRepository(): Promise<
  ProgressInvoiceJobberPersistenceRepository
> {
  const client = await createServiceClient()
  return new ProgressInvoiceJobberPersistenceRepository(
    createProgressInvoiceServiceRpcExecutor(client)
  )
}
