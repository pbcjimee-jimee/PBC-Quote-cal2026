import type { ActionResult } from '@/lib/actions/types'
import {
  createProgressInvoiceRepository,
  type ProgressInvoiceAdjustmentRpcDto,
  type ProgressInvoiceClaimRpcDto,
  type ProgressInvoiceDocumentRpcDto,
  type ProgressInvoiceHistoryRpcResult,
  type ProgressInvoiceImportedObservationRpcDto,
  type ProgressInvoicePaymentRpcDto,
  type ProgressInvoiceSafeEventRpcDto,
  type ProgressInvoiceWorkspaceRpcResult,
} from './repository'
import {
  getBusinessInvoiceProfile,
  mapSeriesDetail,
  type ProgressInvoiceSeriesDetail,
} from './series-service'
import { businessInvoiceProfileSchema } from './validators'

export interface ProgressInvoiceImportedObservationDto {
  originalInvoiceNumber: string
  observedInvoiceNumber: string
  normalizedStatus: ProgressInvoiceImportedObservationRpcDto['normalized_status']
  invoiceSubtotal: string | null
  invoiceTax: string | null
  invoiceTotal: string | null
  invoiceBalance: string | null
  issuedDate: string | null
  dueDate: string | null
  receivedDate: string | null
  externalUpdatedAt: string | null
  clientName: string
  clientCompanyName: string | null
  clientEmail: string | null
  clientPhone: string | null
  billingAddress: string | null
  propertyAddress: string | null
  fetchedAt: string
}

export interface ProgressInvoiceAdjustmentDto {
  id: string
  type: ProgressInvoiceAdjustmentRpcDto['type']
  status: ProgressInvoiceAdjustmentRpcDto['status']
  effectiveDate: string
  displayOrder: number
  description: string
  amountExGst: string
  gstRate: '0.10'
  reason: string | null
  version: number
}

export interface ProgressInvoiceClaimListItemDto {
  id: string
  sequence: number
  kind: ProgressInvoiceClaimRpcDto['kind']
  suffix: string
  taxInvoiceNumber: string
  status: ProgressInvoiceClaimRpcDto['status']
  originalIssuedAt: string | null
  latestRevisedAt: string | null
  version: number
  currentRevision: null | {
    id: string
    revisionNumber: number
    state: 'draft' | 'issued' | 'superseded'
    issueDate: string
    dueDate: string
    description: string
    reference: string | null
    currentClaimExGst: string
    currentClaimGst: string
    currentClaimIncGst: string
    cumulativePercentage: string
    remainingExGst: string
    remainingGst: string
    remainingIncGst: string
    editClassification: 'clerical' | 'financial_tax_affecting'
    taxReviewState: 'not_required' | 'pending' | 'approved'
      | 'external_reference_required' | 'external_reference_recorded'
    createdAt: string
  }
}

export interface ProgressInvoicePaymentListItemDto {
  id: string
  source: ProgressInvoicePaymentRpcDto['source']
  matchedManualPaymentId: string | null
  version: number
  currentRevision: null | {
    id: string
    revisionNumber: number
    receivedDate: string
    observedAmount: string
    effectiveReceiptAmount: string
    paymentMethod: string | null
    reference: string | null
    externalStatus: string | null
    externalUpdatedAt: string | null
    syncState: NonNullable<ProgressInvoicePaymentRpcDto['current_revision']>['sync_state']
    status: NonNullable<ProgressInvoicePaymentRpcDto['current_revision']>['status']
    sourceObservedAt: string | null
    reason: string | null
    createdAt: string
  }
}

export interface ProgressInvoiceDocumentListItemDto {
  id: string
  claimRevisionId: string | null
  revisionSetId: string | null
  scope: ProgressInvoiceDocumentRpcDto['scope']
  format: ProgressInvoiceDocumentRpcDto['format']
  templateId: string
  templateVersion: number
  rendererVersion: string
  sha256: string
  pageOrWorksheetCount: number
  revisionManifestHash: string | null
  generatedAt: string
  createdAt: string
  isCurrent: boolean
}

export interface ProgressInvoiceSafeEventDto {
  id: string
  claimId: string | null
  eventType: string
  source: ProgressInvoiceSafeEventRpcDto['source']
  occurredAt: string
  priorRevisionId: string | null
  nextRevisionId: string | null
  safeFieldChanges: ProgressInvoiceSafeEventRpcDto['safe_field_changes']
}

export interface ProgressInvoiceHistoryPageDto {
  events: readonly ProgressInvoiceSafeEventDto[]
  nextCursor: string | null
}

export interface ProgressInvoiceSeriesWorkspaceDto {
  series: ProgressInvoiceSeriesDetail
  invoiceProfileReady: boolean
  summary: {
    adjustedExGst: string
    adjustedGst: string
    adjustedIncGst: string
    claimedIncGst: string
    receivedIncGst: string
    outstandingIncGst: string
    creditBalanceIncGst: string
    unclaimedIncGst: string
    cumulativePercentage: string
  }
  importedJobberObservation: ProgressInvoiceImportedObservationDto | null
  currentRevisionSet: {
    id: string
    revisionManifestHash: string
    currentManifestClaimCount: number
    currentClaimRevisionId: string | null
  } | null
  adjustments: readonly ProgressInvoiceAdjustmentDto[]
  claims: readonly ProgressInvoiceClaimListItemDto[]
  payments: readonly ProgressInvoicePaymentListItemDto[]
  readyDocuments: readonly ProgressInvoiceDocumentListItemDto[]
  recentEvents: readonly ProgressInvoiceSafeEventDto[]
  history: { nextCursor: string | null }
  capabilities: {
    canEditSeries: boolean
    canEditBaseContract: boolean
    canVoidSeriesDirectly: boolean
    requiresClaimVoidWorkflow: boolean
    canCreateClaim: boolean
    canDownloadCurrent: boolean
    canDownloadHistorical: boolean
  }
}

export interface ProgressInvoiceHistoryInput {
  seriesId: string
  cursor: string | null
  limit: number
}

function mapObservation(row: ProgressInvoiceImportedObservationRpcDto): ProgressInvoiceImportedObservationDto {
  return {
    originalInvoiceNumber: row.original_invoice_number,
    observedInvoiceNumber: row.observed_invoice_number,
    normalizedStatus: row.normalized_status,
    invoiceSubtotal: row.invoice_subtotal,
    invoiceTax: row.invoice_tax,
    invoiceTotal: row.invoice_total,
    invoiceBalance: row.invoice_balance,
    issuedDate: row.issued_date,
    dueDate: row.due_date,
    receivedDate: row.received_date,
    externalUpdatedAt: row.external_updated_at,
    clientName: row.client_name,
    clientCompanyName: row.client_company_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    billingAddress: row.billing_address,
    propertyAddress: row.property_address,
    fetchedAt: row.fetched_at,
  }
}

function mapAdjustment(row: ProgressInvoiceAdjustmentRpcDto): ProgressInvoiceAdjustmentDto {
  return {
    id: row.id, type: row.type, status: row.status, effectiveDate: row.effective_date,
    displayOrder: row.display_order, description: row.description, amountExGst: row.amount_ex_gst,
    gstRate: row.gst_rate, reason: row.reason, version: row.version,
  }
}

function mapClaim(row: ProgressInvoiceClaimRpcDto): ProgressInvoiceClaimListItemDto {
  const revision = row.current_revision
  return {
    id: row.id, sequence: row.sequence, kind: row.kind, suffix: row.suffix,
    taxInvoiceNumber: row.tax_invoice_number, status: row.status,
    originalIssuedAt: row.original_issued_at, latestRevisedAt: row.latest_revised_at, version: row.version,
    currentRevision: revision ? {
      id: revision.id, revisionNumber: revision.revision_number, state: revision.state,
      issueDate: revision.issue_date, dueDate: revision.due_date, description: revision.description,
      reference: revision.reference, currentClaimExGst: revision.current_claim_ex_gst,
      currentClaimGst: revision.current_claim_gst, currentClaimIncGst: revision.current_claim_inc_gst,
      cumulativePercentage: revision.cumulative_percentage, remainingExGst: revision.remaining_ex_gst,
      remainingGst: revision.remaining_gst, remainingIncGst: revision.remaining_inc_gst,
      editClassification: revision.edit_classification, taxReviewState: revision.tax_review_state,
      createdAt: revision.created_at,
    } : null,
  }
}

function mapPayment(row: ProgressInvoicePaymentRpcDto): ProgressInvoicePaymentListItemDto {
  const revision = row.current_revision
  return {
    id: row.id, source: row.source, matchedManualPaymentId: row.matched_manual_payment_id, version: row.version,
    currentRevision: revision ? {
      id: revision.id, revisionNumber: revision.revision_number, receivedDate: revision.received_date,
      observedAmount: revision.observed_amount, effectiveReceiptAmount: revision.effective_receipt_amount,
      paymentMethod: revision.payment_method, reference: revision.reference,
      externalStatus: revision.external_status, externalUpdatedAt: revision.external_updated_at,
      syncState: revision.sync_state, status: revision.status, sourceObservedAt: revision.source_observed_at,
      reason: revision.reason, createdAt: revision.created_at,
    } : null,
  }
}

function mapDocument(row: ProgressInvoiceDocumentRpcDto): ProgressInvoiceDocumentListItemDto {
  return {
    id: row.id, claimRevisionId: row.claim_revision_id, revisionSetId: row.revision_set_id,
    scope: row.scope, format: row.format, templateId: row.template_id, templateVersion: row.template_version,
    rendererVersion: row.renderer_version, sha256: row.sha256,
    pageOrWorksheetCount: row.page_or_worksheet_count, revisionManifestHash: row.revision_manifest_hash,
    generatedAt: row.generated_at, createdAt: row.created_at, isCurrent: row.is_current,
  }
}

function mapEvent(row: ProgressInvoiceSafeEventRpcDto): ProgressInvoiceSafeEventDto {
  return {
    id: row.id, claimId: row.claim_id, eventType: row.event_type, source: row.source,
    occurredAt: row.occurred_at, priorRevisionId: row.prior_revision_id,
    nextRevisionId: row.next_revision_id, safeFieldChanges: row.safe_field_changes,
  }
}

function mapWorkspace(
  row: ProgressInvoiceWorkspaceRpcResult,
  invoiceProfileReady: boolean,
): ProgressInvoiceSeriesWorkspaceDto | null {
  if (!row.series) return null
  const summary = row.summary
  const capabilities = row.capabilities
  if (!summary || row.imported_jobber_observation === undefined
    || row.current_revision_set === undefined || !row.adjustments || !row.claims
    || !row.payments || !row.ready_documents || !row.recent_events || !row.history || !capabilities) {
    return null
  }
  return {
    series: mapSeriesDetail(row.series),
    invoiceProfileReady,
    summary: {
      adjustedExGst: summary.adjusted_ex_gst, adjustedGst: summary.adjusted_gst,
      adjustedIncGst: summary.adjusted_inc_gst, claimedIncGst: summary.claimed_inc_gst,
      receivedIncGst: summary.received_inc_gst, outstandingIncGst: summary.outstanding_inc_gst,
      creditBalanceIncGst: summary.credit_balance_inc_gst, unclaimedIncGst: summary.unclaimed_inc_gst,
      cumulativePercentage: summary.cumulative_percentage,
    },
    importedJobberObservation: row.imported_jobber_observation
      ? mapObservation(row.imported_jobber_observation) : null,
    currentRevisionSet: row.current_revision_set ? {
      id: row.current_revision_set.id,
      revisionManifestHash: row.current_revision_set.revision_manifest_hash,
      currentManifestClaimCount: row.current_revision_set.current_manifest_claim_count,
      currentClaimRevisionId: row.current_revision_set.current_claim_revision_id,
    } : null,
    adjustments: row.adjustments.map(mapAdjustment),
    claims: row.claims.map(mapClaim),
    payments: row.payments.map(mapPayment),
    readyDocuments: row.ready_documents.map(mapDocument),
    recentEvents: row.recent_events.map(mapEvent),
    history: { nextCursor: row.history.next_cursor },
    capabilities: {
      canEditSeries: capabilities.can_edit_series,
      canEditBaseContract: capabilities.can_edit_base_contract,
      canVoidSeriesDirectly: capabilities.can_void_series_directly,
      requiresClaimVoidWorkflow: capabilities.requires_claim_void_workflow,
      canCreateClaim: capabilities.can_create_claim && invoiceProfileReady,
      canDownloadCurrent: capabilities.can_download_current,
      canDownloadHistorical: capabilities.can_download_historical,
    },
  }
}

function mapHistory(row: ProgressInvoiceHistoryRpcResult): ProgressInvoiceHistoryPageDto {
  return { events: row.events.map(mapEvent), nextCursor: row.next_cursor }
}

export async function getProgressInvoiceSeriesWorkspace(
  seriesId: string,
): Promise<ActionResult<ProgressInvoiceSeriesWorkspaceDto | null>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('get_progress_invoice_workspace', { series_id: seriesId })
  if (!result.ok) return result
  if (result.data.series === null) return { ok: true, data: null }

  const profileResult = await getBusinessInvoiceProfile()
  const profile = profileResult.ok ? profileResult.data : null
  const invoiceProfileReady = profile !== null && businessInvoiceProfileSchema.safeParse({
    legalName: profile.legalName,
    tradingName: profile.tradingName,
    abn: profile.abn,
    contractorLicence: profile.contractorLicence,
    address: profile.address,
    phone: profile.phone,
    email: profile.email,
    bankName: profile.bankName,
    bsb: profile.bsb,
    bankAccountName: profile.bankAccountName,
    accountNumber: profile.accountNumber,
    gstRate: profile.gstRate,
    businessTimezone: profile.businessTimezone,
    defaultPaymentTermDays: profile.defaultPaymentTermDays,
  }).success
  const mapped = mapWorkspace(result.data, invoiceProfileReady)
  return mapped
    ? { ok: true, data: mapped }
    : { ok: false, error: 'PROGRESS_RESPONSE_INVALID' }
}

export async function listProgressInvoiceSeriesHistory(
  input: ProgressInvoiceHistoryInput,
): Promise<ActionResult<ProgressInvoiceHistoryPageDto>> {
  const repository = await createProgressInvoiceRepository()
  const result = await repository.call('list_progress_invoice_history', {
    series_id: input.seriesId,
    cursor: input.cursor,
    limit: input.limit,
  })
  return result.ok ? { ok: true, data: mapHistory(result.data) } : result
}
