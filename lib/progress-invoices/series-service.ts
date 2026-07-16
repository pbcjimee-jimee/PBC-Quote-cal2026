import type { ActionResult } from '@/lib/actions/types'
import { createClient } from '@/lib/supabase/server'
import {
  createProgressInvoiceRepository,
  type BusinessInvoiceProfileRpcResult,
  type ProgressInvoicePaymentState,
  type ProgressInvoiceSeriesRpcDetail,
  type ProgressInvoiceSeriesStatus,
  type VersionedMutationRpcResult,
} from './repository'
import type {
  CreateProgressInvoiceSeriesInput,
  SaveBusinessInvoiceProfileInput,
  UpdateProgressInvoiceSeriesInput,
} from './validators'

export interface BusinessInvoiceProfileDto {
  id: string
  legalName: string
  tradingName: string
  abn: string
  contractorLicence: string
  address: string
  phone: string
  email: string
  bankName: string
  bsb: string
  bankAccountName: string
  accountNumber: string
  gstRate: '0.10'
  businessTimezone: 'Australia/Sydney'
  defaultPaymentTermDays: number
  version: number
}

export interface ProgressInvoiceListInput {
  query: string
  statuses: readonly string[]
  page: number
  pageSize: number
  quoteId: string | null
}

export interface ProgressInvoiceDashboardItem {
  id: string
  sourceType: 'pbc_quote' | 'jobber_job' | 'jobber_invoice'
  quoteId: string | null
  recipientName: string
  recipientCompany: string
  siteName: string
  status: ProgressInvoiceSeriesStatus
  adjustedContractExGst: string
  claimedIncGst: string
  receivedIncGst: string
  outstandingReceivable: string
  unclaimedIncGst: string
  cumulativePercentage: string
  paymentState: ProgressInvoicePaymentState
  lastSuccessfulJobberSyncAt: string | null
  lastJobberSyncErrorCode: string | null
  version: number
}

export interface ProgressInvoiceDashboardDto {
  items: ProgressInvoiceDashboardItem[]
  page: number
  pageSize: number
  total: number
}

export interface ProgressInvoiceSeriesDetail {
  id: string
  quoteId: string | null
  sourceType: 'pbc_quote' | 'jobber_job' | 'jobber_invoice'
  version: number
  baseContractExGst: string
  gstRate: '0.10'
  recipientName: string
  recipientCompany: string
  recipientAddress: string
  recipientEmail: string
  recipientPhone: string
  recipientAbn: string
  siteName: string
  siteAddress: string
  defaultDescription: string
  reference: string
  status: ProgressInvoiceSeriesStatus
  acceptedNumberingBase: string | null
  jobberLinkLockedAt: string | null
  adjustedContractExGst: string
  adjustedContractGst: string
  adjustedContractIncGst: string
  claimedExGst: string
  claimedGst: string
  claimedIncGst: string
  unclaimedExGst: string
  unclaimedGst: string
  unclaimedIncGst: string
  cumulativePercentage: string
}

export interface ProgressInvoiceSeriesMutationResult extends VersionedMutationRpcResult {
  quoteId: string | null
}

export interface ProgressInvoiceCreatePrefill {
  sourceType: 'pbc_quote' | 'standalone'
  quote: null | {
    id: string
    customerName: string
    customerAddress: string
    baseContractExGst: string
    comparisonIncGst: string
    defaultDescription: string
  }
}

function mapProfile(row: BusinessInvoiceProfileRpcResult): BusinessInvoiceProfileDto {
  return {
    id: row.id,
    legalName: row.legal_name,
    tradingName: row.trading_name,
    abn: row.abn,
    contractorLicence: row.contractor_licence,
    address: row.business_address,
    phone: row.phone,
    email: row.email,
    bankName: row.bank_name,
    bsb: row.bsb,
    bankAccountName: row.bank_account_name,
    accountNumber: row.bank_account_number,
    gstRate: row.gst_rate,
    businessTimezone: row.business_timezone,
    defaultPaymentTermDays: row.default_payment_term_days,
    version: row.version,
  }
}

export function mapSeriesDetail(row: ProgressInvoiceSeriesRpcDetail): ProgressInvoiceSeriesDetail {
  return {
    id: row.id,
    quoteId: row.quote_id,
    sourceType: row.source_type,
    version: row.version,
    baseContractExGst: row.base_contract_ex_gst,
    gstRate: row.gst_rate,
    recipientName: row.recipient_name,
    recipientCompany: row.recipient_company,
    recipientAddress: row.recipient_address,
    recipientEmail: row.recipient_email,
    recipientPhone: row.recipient_phone,
    recipientAbn: row.recipient_abn,
    siteName: row.site_name,
    siteAddress: row.site_address,
    defaultDescription: row.default_description,
    reference: row.reference,
    status: row.status,
    acceptedNumberingBase: row.accepted_numbering_base,
    jobberLinkLockedAt: row.jobber_link_locked_at,
    adjustedContractExGst: row.current_adjusted_contract_ex_gst,
    adjustedContractGst: row.current_adjusted_contract_gst,
    adjustedContractIncGst: row.current_adjusted_contract_inc_gst,
    claimedExGst: row.current_claimed_ex_gst,
    claimedGst: row.current_claimed_gst,
    claimedIncGst: row.current_claimed_inc_gst,
    unclaimedExGst: row.current_unclaimed_ex_gst,
    unclaimedGst: row.current_unclaimed_gst,
    unclaimedIncGst: row.current_unclaimed_inc_gst,
    cumulativePercentage: row.current_cumulative_percentage,
  }
}

export async function getBusinessInvoiceProfile(): Promise<ActionResult<BusinessInvoiceProfileDto | null>> {
  const client = await createClient()
  const { data, error } = await client.from('business_invoice_profiles').select('*').maybeSingle()
  if (error) return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  if (!data) return { ok: true, data: null }
  return { ok: true, data: mapProfile({
    ...data,
    gst_rate: '0.10',
    business_timezone: 'Australia/Sydney',
  }) }
}

export async function saveBusinessInvoiceProfile(
  input: SaveBusinessInvoiceProfileInput
): Promise<ActionResult<BusinessInvoiceProfileDto>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('save_business_invoice_profile', {
    legal_name: input.legalName,
    trading_name: input.tradingName,
    abn: input.abn.replace(/\s/g, ''),
    contractor_licence: input.contractorLicence,
    business_address: input.address,
    phone: input.phone,
    email: input.email,
    bank_name: input.bankName,
    bsb: input.bsb,
    bank_account_name: input.bankAccountName,
    bank_account_number: input.accountNumber,
    gst_rate: input.gstRate,
    business_timezone: input.businessTimezone,
    default_payment_term_days: input.defaultPaymentTermDays,
    expected_version: input.expectedVersion,
  })
  return result.ok ? { ok: true, data: mapProfile(result.data) } : result
}

export async function createProgressInvoiceSeries(
  input: CreateProgressInvoiceSeriesInput
): Promise<ActionResult<VersionedMutationRpcResult>> {
  const repository = await createProgressInvoiceRepository()
  return repository.call('create_progress_invoice_series', {
    source_type: input.sourceType,
    quote_id: input.pbcQuoteId,
    base_contract_ex_gst: input.baseContractExGst,
    gst_rate: input.gstRate,
    recipient_name: input.recipientName,
    recipient_company: input.recipientCompany,
    recipient_address: input.recipientAddress,
    recipient_email: input.recipientEmail,
    recipient_phone: input.recipientPhone,
    recipient_abn: input.recipientAbn?.replace(/\s/g, ''),
    site_name: input.siteName,
    site_address: input.siteAddress,
    default_description: input.defaultDescription,
    reference: input.reference,
    correlation_key: input.correlationKey,
  })
}

export async function updateProgressInvoiceSeries(
  input: UpdateProgressInvoiceSeriesInput
): Promise<ActionResult<ProgressInvoiceSeriesMutationResult, ProgressInvoiceSeriesDetail>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('update_progress_invoice_series', {
    series_id: input.seriesId,
    expected_version: input.expectedVersion,
    base_contract_ex_gst: input.baseContractExGst,
    gst_rate: input.gstRate,
    recipient_name: input.recipientName,
    recipient_company: input.recipientCompany,
    recipient_address: input.recipientAddress,
    recipient_email: input.recipientEmail,
    recipient_phone: input.recipientPhone,
    recipient_abn: input.recipientAbn?.replace(/\s/g, ''),
    site_name: input.siteName,
    site_address: input.siteAddress,
    default_description: input.defaultDescription,
    reference: input.reference,
    correlation_key: input.correlationKey,
  })
  if (!result.ok) {
    return result.current
      ? { ...result, current: mapSeriesDetail(result.current) }
      : { ok: false, error: result.error, ...(result.code ? { code: result.code } : {}) }
  }
  return {
    ok: true,
    data: {
      id: result.data.id,
      version: result.data.version,
      quoteId: result.data.quote_id,
    },
  }
}

export async function getProgressInvoiceSeries(
  seriesId: string
): Promise<ActionResult<ProgressInvoiceSeriesDetail | null>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('get_progress_invoice_series', { series_id: seriesId })
  return result.ok
    ? { ok: true, data: result.data.series ? mapSeriesDetail(result.data.series) : null }
    : result
}

export async function listProgressInvoiceSeries(
  input: ProgressInvoiceListInput
): Promise<ActionResult<ProgressInvoiceDashboardDto>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('list_progress_invoice_series', {
    query: input.query,
    statuses: [...input.statuses],
    page: input.page,
    page_size: input.pageSize,
    quote_id: input.quoteId,
  })
  if (!result.ok) return result
  return {
    ok: true,
    data: {
      items: result.data.items.map((row) => ({
        id: row.id,
        sourceType: row.source_type,
        quoteId: row.quote_id,
        recipientName: row.recipient_name,
        recipientCompany: row.recipient_company,
        siteName: row.site_name,
        status: row.status,
        adjustedContractExGst: row.current_adjusted_contract_ex_gst,
        claimedIncGst: row.current_claimed_inc_gst,
        receivedIncGst: row.current_actual_receipts,
        outstandingReceivable: row.current_outstanding_receivable,
        unclaimedIncGst: row.current_unclaimed_inc_gst,
        cumulativePercentage: row.current_cumulative_percentage,
        paymentState: row.current_payment_state,
        lastSuccessfulJobberSyncAt: row.last_successful_jobber_sync_at,
        lastJobberSyncErrorCode: row.last_jobber_sync_error_code,
        version: row.version,
      })),
      page: result.data.page,
      pageSize: result.data.page_size,
      total: result.data.total,
    },
  }
}

export async function getProgressInvoiceCreatePrefill(
  input: { quoteId: string } | { standalone: true }
): Promise<ActionResult<ProgressInvoiceCreatePrefill>> {
  if ('standalone' in input) return { ok: true, data: { sourceType: 'standalone', quote: null } }
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('get_progress_invoice_quote_prefill', { quote_id: input.quoteId })
  if (!result.ok) return result
  if (!result.data.quote) return { ok: false, error: 'PROGRESS_NOT_FOUND', code: 'NOT_FOUND' }
  const quote = result.data.quote
  return {
    ok: true,
    data: {
      sourceType: 'pbc_quote',
      quote: {
        id: quote.id,
        customerName: quote.customer_name,
        customerAddress: quote.customer_address,
        baseContractExGst: quote.subtotal,
        comparisonIncGst: quote.final_total,
        defaultDescription: quote.work_type,
      },
    },
  }
}
