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
  source_type: 'pbc_quote' | 'jobber_job' | 'jobber_invoice'
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

export interface CreateProgressInvoiceSeriesPayload {
  source_type: 'pbc_quote' | 'jobber_job' | 'jobber_invoice'
  quote_id?: string | null
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
  source_type: 'pbc_quote' | 'jobber_job' | 'jobber_invoice'
  quote_id: string | null
  recipient_name: string
  recipient_company: string
  site_name: string
  status: ProgressInvoiceSeriesStatus
  current_adjusted_contract_ex_gst: string
  current_claimed_inc_gst: string
  current_actual_receipts: string
  current_outstanding_receivable: string
  current_unclaimed_inc_gst: string
  current_cumulative_percentage: string
  current_payment_state: ProgressInvoicePaymentState
  last_successful_jobber_sync_at: string | null
  last_jobber_sync_error_code: string | null
  version: number
}

export interface ProgressInvoiceDashboardRpcResult {
  items: ProgressInvoiceDashboardRpcItem[]
  page: number
  page_size: number
  total: number
}

export interface ProgressInvoiceSeriesReadRpcResult {
  series: ProgressInvoiceSeriesRpcDetail | null
}

export interface ProgressInvoiceQuotePrefillRpcDetail {
  id: string
  customer_name: string
  customer_address: string
  work_type: string
  subtotal: string
  final_total: string
}

export interface ProgressInvoiceQuotePrefillRpcResult {
  quote: ProgressInvoiceQuotePrefillRpcDetail | null
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

export interface ProgressInvoiceCommandMap {
  save_business_invoice_profile: {
    payload: SaveBusinessInvoiceProfilePayload
    result: BusinessInvoiceProfileRpcResult
    current: never
  }
  create_progress_invoice_series: {
    payload: CreateProgressInvoiceSeriesPayload
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
  get_progress_invoice_quote_prefill: {
    payload: { quote_id: string }
    result: ProgressInvoiceQuotePrefillRpcResult
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
  PROGRESS_DOCUMENT_ERROR: { code: 'DOCUMENT_ERROR', error: 'PROGRESS_DOCUMENT_ERROR' },
  PROGRESS_STORAGE_ERROR: { code: 'STORAGE_ERROR', error: 'PROGRESS_STORAGE_ERROR' },
  IDEMPOTENCY_KEY_REUSED: { code: 'VALIDATION', error: 'IDEMPOTENCY_KEY_REUSED' },
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
  const id = stringField(value, 'id')
  const quoteId = nullableStringField(value, 'quote_id')
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
  const validSource = sourceType === 'pbc_quote' || sourceType === 'jobber_job' || sourceType === 'jobber_invoice'
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
  const adjusted = moneyField(value, 'current_adjusted_contract_ex_gst')
  const claimed = moneyField(value, 'current_claimed_inc_gst')
  const received = moneyField(value, 'current_actual_receipts')
  const outstanding = moneyField(value, 'current_outstanding_receivable')
  const unclaimed = moneyField(value, 'current_unclaimed_inc_gst')
  const cumulative = percentageField(value, 'current_cumulative_percentage')
  const validSource = sourceType === 'pbc_quote' || sourceType === 'jobber_job' || sourceType === 'jobber_invoice'
  const validStatus = status === 'draft' || status === 'active' || status === 'completed'
    || status === 'reconciliation_required' || status === 'void'
  const validPayment = paymentState === 'unpaid' || paymentState === 'part_paid'
    || paymentState === 'paid' || paymentState === 'overdue' || paymentState === 'credit_balance'
  if (!id || !validSource || quoteId === undefined || !recipientName || recipientCompany === null
    || !siteName || !validStatus || !validPayment || lastSync === undefined || syncError === undefined
    || !version || !adjusted || !claimed || !received || !outstanding || !unclaimed || !cumulative) return null
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
    current_unclaimed_inc_gst: unclaimed,
    current_cumulative_percentage: cumulative,
    current_payment_state: paymentState,
    last_successful_jobber_sync_at: lastSync,
    last_jobber_sync_error_code: syncError,
    version,
  }
}

function parseDashboard(value: unknown): ProgressInvoiceDashboardRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate) || !Array.isArray(candidate.items)) return null
  const page = positiveIntegerField(candidate, 'page')
  const pageSize = positiveIntegerField(candidate, 'page_size')
  const total = nonNegativeIntegerField(candidate, 'total')
  const items = candidate.items.map(parseDashboardItem)
  if (!page || !pageSize || total === null || items.some((item) => item === null)) return null
  return { items: items as ProgressInvoiceDashboardRpcItem[], page, page_size: pageSize, total }
}

function parseSeriesRead(value: unknown): ProgressInvoiceSeriesReadRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate) || !('series' in candidate)) return null
  if (candidate.series === null) return { series: null }
  const series = parseSeriesDetail(candidate.series)
  return series ? { series } : null
}

function parseQuotePrefill(value: unknown): ProgressInvoiceQuotePrefillRpcResult | null {
  const candidate = singleton(value)
  if (!isRecord(candidate) || !('quote' in candidate)) return null
  if (candidate.quote === null) return { quote: null }
  if (!isRecord(candidate.quote)) return null
  const id = stringField(candidate.quote, 'id')
  const customerName = stringField(candidate.quote, 'customer_name')
  const customerAddress = stringField(candidate.quote, 'customer_address')
  const workType = stringField(candidate.quote, 'work_type')
  const subtotal = moneyField(candidate.quote, 'subtotal')
  const finalTotal = moneyField(candidate.quote, 'final_total')
  if (!id || customerName === null || customerAddress === null || workType === null
    || !subtotal || !finalTotal) return null
  return {
    quote: {
      id,
      customer_name: customerName,
      customer_address: customerAddress,
      work_type: workType,
      subtotal,
      final_total: finalTotal,
    },
  }
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
  if (command === 'create_progress_invoice_series') {
    return parseVersioned(value) as CommandResult<TCommand> | null
  }
  if (command === 'update_progress_invoice_series') return parseSeriesMutation(value) as CommandResult<TCommand> | null
  if (command === 'list_progress_invoice_series') return parseDashboard(value) as CommandResult<TCommand> | null
  if (command === 'get_progress_invoice_series') return parseSeriesRead(value) as CommandResult<TCommand> | null
  if (command === 'get_progress_invoice_quote_prefill') return parseQuotePrefill(value) as CommandResult<TCommand> | null
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
      && command !== 'create_progress_invoice_series'
      && command !== 'list_progress_invoice_series'
      && command !== 'get_progress_invoice_series'
      && command !== 'get_progress_invoice_quote_prefill'
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
  const rpc = client.rpc as unknown as Rpc
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

    const result = command === 'apply_progress_invoice_jobber_refresh'
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
  const rpc = client.rpc as unknown as Rpc
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
