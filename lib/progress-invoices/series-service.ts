import Decimal from 'decimal.js'

import type { ActionResult } from '@/lib/actions/types'
import { createClient } from '@/lib/supabase/server'
import {
  createProgressInvoiceRepository,
  type BusinessInvoiceProfileRpcResult,
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
  search?: string
  status?: ProgressInvoiceSeriesStatus
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
  paymentState: 'unpaid' | 'part_paid' | 'paid' | 'overdue' | 'credit_balance'
  lastSuccessfulJobberSyncAt: string | null
  lastJobberSyncErrorCode: string | null
  version: number
}

export interface ProgressInvoiceDashboardDto {
  series: ProgressInvoiceDashboardItem[]
  summary: { count: number }
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

const SERIES_SELECT = 'id,quote_id,source_type,version,base_contract_ex_gst,gst_rate,recipient_name,recipient_company,recipient_address,recipient_email,recipient_phone,recipient_abn,site_name,site_address,default_description,reference,status,accepted_numbering_base,jobber_link_locked_at,current_adjusted_contract_ex_gst,current_adjusted_contract_gst,current_adjusted_contract_inc_gst,current_claimed_ex_gst,current_claimed_gst,current_claimed_inc_gst,current_unclaimed_ex_gst,current_unclaimed_gst,current_unclaimed_inc_gst,current_cumulative_percentage'

function money(value: string | number): string {
  return new Decimal(value).toFixed(2)
}

function percentage(value: string | number): string {
  return new Decimal(value).toFixed(6)
}

function text(value: string | null): string {
  return value ?? ''
}

function isSourceType(value: string): value is ProgressInvoiceSeriesDetail['sourceType'] {
  return value === 'pbc_quote' || value === 'jobber_job' || value === 'jobber_invoice'
}

function isSeriesStatus(value: string): value is ProgressInvoiceSeriesStatus {
  return value === 'draft' || value === 'active' || value === 'completed'
    || value === 'reconciliation_required' || value === 'void'
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

function mapDatabaseSeries(row: {
  id: string
  quote_id: string | null
  source_type: string
  version: number
  base_contract_ex_gst: number
  gst_rate: number
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
  status: string
  accepted_numbering_base: string | null
  jobber_link_locked_at: string | null
  current_adjusted_contract_ex_gst: number
  current_adjusted_contract_gst: number
  current_adjusted_contract_inc_gst: number
  current_claimed_ex_gst: number
  current_claimed_gst: number
  current_claimed_inc_gst: number
  current_unclaimed_ex_gst: number
  current_unclaimed_gst: number
  current_unclaimed_inc_gst: number
  current_cumulative_percentage: number
}): ProgressInvoiceSeriesDetail | null {
  if (!isSourceType(row.source_type) || !isSeriesStatus(row.status) || !new Decimal(row.gst_rate).eq('0.1')) return null
  return mapSeriesDetail({
    id: row.id,
    quote_id: row.quote_id,
    source_type: row.source_type,
    version: row.version,
    base_contract_ex_gst: money(row.base_contract_ex_gst),
    gst_rate: '0.10',
    recipient_name: row.recipient_name,
    recipient_company: text(row.recipient_company),
    recipient_address: row.recipient_address,
    recipient_email: text(row.recipient_email),
    recipient_phone: text(row.recipient_phone),
    recipient_abn: text(row.recipient_abn),
    site_name: row.site_name,
    site_address: row.site_address,
    default_description: row.default_description,
    reference: text(row.reference),
    status: row.status,
    accepted_numbering_base: row.accepted_numbering_base,
    jobber_link_locked_at: row.jobber_link_locked_at,
    current_adjusted_contract_ex_gst: money(row.current_adjusted_contract_ex_gst),
    current_adjusted_contract_gst: money(row.current_adjusted_contract_gst),
    current_adjusted_contract_inc_gst: money(row.current_adjusted_contract_inc_gst),
    current_claimed_ex_gst: money(row.current_claimed_ex_gst),
    current_claimed_gst: money(row.current_claimed_gst),
    current_claimed_inc_gst: money(row.current_claimed_inc_gst),
    current_unclaimed_ex_gst: money(row.current_unclaimed_ex_gst),
    current_unclaimed_gst: money(row.current_unclaimed_gst),
    current_unclaimed_inc_gst: money(row.current_unclaimed_inc_gst),
    current_cumulative_percentage: percentage(row.current_cumulative_percentage),
  })
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
): Promise<ActionResult<VersionedMutationRpcResult, ProgressInvoiceSeriesDetail>> {
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
  return result
}

export async function getProgressInvoiceSeries(
  seriesId: string
): Promise<ActionResult<ProgressInvoiceSeriesDetail | null>> {
  const client = await createClient()
  const { data, error } = await client.from('progress_invoice_series').select(SERIES_SELECT).eq('id', seriesId).maybeSingle()
  if (error) return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  if (!data) return { ok: true, data: null }
  const detail = mapDatabaseSeries(data)
  return detail ? { ok: true, data: detail } : { ok: false, error: 'PROGRESS_RESPONSE_INVALID' }
}

export async function listProgressInvoiceSeries(
  input: ProgressInvoiceListInput
): Promise<ActionResult<ProgressInvoiceDashboardDto>> {
  const client = await createClient()
  let query = client.from('progress_invoice_series').select('*').order('updated_at', { ascending: false }).limit(100)
  if (input.status) query = query.eq('status', input.status)
  const { data, error } = await query
  if (error) return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  const items: ProgressInvoiceDashboardItem[] = []
  const search = input.search?.trim().toLocaleLowerCase('en-AU')
  for (const row of data) {
    if (search && ![
      row.recipient_name,
      row.recipient_company,
      row.site_name,
      row.default_description,
      row.reference,
      row.original_jobber_invoice_number,
    ].some((value) => value?.toLocaleLowerCase('en-AU').includes(search))) continue
    if (!isSourceType(row.source_type) || !isSeriesStatus(row.status)) return { ok: false, error: 'PROGRESS_RESPONSE_INVALID' }
    if (!['unpaid', 'part_paid', 'paid', 'overdue', 'credit_balance'].includes(row.current_payment_state)) {
      return { ok: false, error: 'PROGRESS_RESPONSE_INVALID' }
    }
    items.push({
      id: row.id,
      sourceType: row.source_type,
      quoteId: row.quote_id,
      recipientName: row.recipient_name,
      recipientCompany: text(row.recipient_company),
      siteName: row.site_name,
      status: row.status,
      adjustedContractExGst: money(row.current_adjusted_contract_ex_gst),
      claimedIncGst: money(row.current_claimed_inc_gst),
      receivedIncGst: money(row.current_actual_receipts),
      outstandingReceivable: money(row.current_outstanding_receivable),
      unclaimedIncGst: money(row.current_unclaimed_inc_gst),
      cumulativePercentage: percentage(row.current_cumulative_percentage),
      paymentState: row.current_payment_state as ProgressInvoiceDashboardItem['paymentState'],
      lastSuccessfulJobberSyncAt: row.last_successful_jobber_sync_at,
      lastJobberSyncErrorCode: row.last_jobber_sync_error_code,
      version: row.version,
    })
  }
  return { ok: true, data: { series: items, summary: { count: items.length } } }
}

export async function getProgressInvoiceCreatePrefill(
  input: { quoteId: string } | { standalone: true }
): Promise<ActionResult<ProgressInvoiceCreatePrefill>> {
  if ('standalone' in input) return { ok: true, data: { sourceType: 'standalone', quote: null } }
  const client = await createClient()
  const { data, error } = await client.from('quotes')
    .select('id,customer_name,customer_address,work_type,subtotal,final_total')
    .eq('id', input.quoteId)
    .maybeSingle()
  if (error) return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
  if (!data) return { ok: false, error: 'PROGRESS_NOT_FOUND', code: 'NOT_FOUND' }
  return {
    ok: true,
    data: {
      sourceType: 'pbc_quote',
      quote: {
        id: data.id,
        customerName: text(data.customer_name),
        customerAddress: text(data.customer_address),
        baseContractExGst: money(data.subtotal),
        comparisonIncGst: money(data.final_total),
        defaultDescription: text(data.work_type),
      },
    },
  }
}
