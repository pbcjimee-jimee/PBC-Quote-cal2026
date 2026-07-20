import type { ActionResult } from '@/lib/actions/types'
import { createProgressInvoiceRepository, type ProgressClaimEditorRpcDto } from './repository'
import type { ProgressClaimCalculation, ProgressClaimInputMode } from './types'
import type { CreateProgressClaimDraftInput, SaveProgressClaimDraftInput } from './validators'

export interface ProgressClaimEditorDto {
  seriesId: string
  seriesVersion: number
  seriesStatus: ProgressClaimEditorRpcDto['series_status']
  sourceType: ProgressClaimEditorRpcDto['source_type']
  acceptedNumberingBase: string
  expectedCurrentRevisionSetId: string | null
  expectedCurrentManifestHash: string | null
  claimId: string | null
  claimVersion: number | null
  claimStatus: 'draft' | null
  claimKind: 'progress' | 'final' | null
  sequence: number | null
  suffix: string | null
  taxInvoiceNumber: string | null
  revisionId: string | null
  revisionNumber: 1 | null
  inputMode: ProgressClaimInputMode
  authoritativeValue: string
  issueDate: string
  dueDate: string
  description: string
  notes: string
  reference: string | null
  supplier: {
    profileVersion: number; legalName: string; tradingName: string; abn: string; contractorLicence: string
    address: string; phone: string; email: string; bankName: string; bsb: string; bankAccountName: string
    bankAccountNumber: string; gstRate: '0.10'; timezone: 'Australia/Sydney'; defaultPaymentTermDays: number
  }
  recipient: { name: string; company: string | null; address: string; email: string | null; phone: string | null; abn: string | null }
  site: { name: string; address: string }
  jobberEvidence: { accountId: string | null; invoiceId: string | null; originalInvoiceNumber: string | null; observedInvoiceNumber: string | null }
  baseContractExGst: string
  approvedVariationsExGst: string
  approvedCreditsExGst: string
  approvedAdjustments: readonly { id: string; type: 'variation' | 'credit'; effectiveDate: string; description: string; amountExGst: string; gstRate: '0.10'; version: number }[]
  previousClaims: readonly { claimId: string; revisionId: string; sequence: number; taxInvoiceNumber: string; exGst: string; gst: string; incGst: string }[]
  calculation: ProgressClaimCalculation
  calculationPolicyVersion: 'progress-claim-v1'
  financialSnapshotHash: string
  capabilities: { canSave: boolean; canIssue: false }
}

function mapEditor(row: ProgressClaimEditorRpcDto): ProgressClaimEditorDto {
  return {
    seriesId: row.series_id, seriesVersion: row.series_version, seriesStatus: row.series_status,
    sourceType: row.source_type, acceptedNumberingBase: row.accepted_numbering_base,
    expectedCurrentRevisionSetId: row.expected_current_revision_set_id,
    expectedCurrentManifestHash: row.expected_current_manifest_hash,
    claimId: row.claim_id, claimVersion: row.claim_version, claimStatus: row.claim_status,
    claimKind: row.claim_kind, sequence: row.sequence, suffix: row.suffix,
    taxInvoiceNumber: row.tax_invoice_number, revisionId: row.revision_id, revisionNumber: row.revision_number,
    inputMode: row.input_mode, authoritativeValue: row.authoritative_value,
    issueDate: row.issue_date, dueDate: row.due_date, description: row.description, notes: row.notes, reference: row.reference,
    supplier: {
      profileVersion: row.supplier_profile_version, legalName: row.supplier_legal_name,
      tradingName: row.supplier_trading_name, abn: row.supplier_abn,
      contractorLicence: row.supplier_contractor_licence, address: row.supplier_address,
      phone: row.supplier_phone, email: row.supplier_email, bankName: row.supplier_bank_name,
      bsb: row.supplier_bsb, bankAccountName: row.supplier_bank_account_name,
      bankAccountNumber: row.supplier_bank_account_number, gstRate: row.supplier_gst_rate,
      timezone: row.supplier_timezone, defaultPaymentTermDays: row.supplier_default_payment_term_days,
    },
    recipient: { name: row.recipient_name, company: row.recipient_company, address: row.recipient_address, email: row.recipient_email, phone: row.recipient_phone, abn: row.recipient_abn },
    site: { name: row.site_name, address: row.site_address },
    jobberEvidence: { accountId: row.jobber_account_id, invoiceId: row.jobber_invoice_id, originalInvoiceNumber: row.original_jobber_invoice_number, observedInvoiceNumber: row.observed_jobber_invoice_number },
    baseContractExGst: row.base_contract_ex_gst,
    approvedVariationsExGst: row.approved_variations_ex_gst,
    approvedCreditsExGst: row.approved_credits_ex_gst,
    approvedAdjustments: row.approved_adjustments.map((item) => ({ id: item.id, type: item.type, effectiveDate: item.effective_date, description: item.description, amountExGst: item.amount_ex_gst, gstRate: item.gst_rate, version: item.version })),
    previousClaims: row.previous_claims.map((item) => ({ claimId: item.claim_id, revisionId: item.revision_id, sequence: item.sequence, taxInvoiceNumber: item.tax_invoice_number, exGst: item.ex_gst, gst: item.gst, incGst: item.inc_gst })),
    calculation: {
      adjustedContractExGst: row.adjusted_contract_ex_gst, adjustedContractGst: row.adjusted_contract_gst,
      adjustedContractIncGst: row.adjusted_contract_inc_gst, previousClaimsExGst: row.previous_claims_ex_gst,
      previousClaimsGst: row.previous_claims_gst, previousClaimsIncGst: row.previous_claims_inc_gst,
      cumulativeTargetExGst: row.cumulative_target_ex_gst, cumulativeTargetGst: row.cumulative_target_gst,
      cumulativeTargetIncGst: row.cumulative_target_inc_gst, currentClaimExGst: row.current_claim_ex_gst,
      currentClaimGst: row.current_claim_gst, currentClaimIncGst: row.current_claim_inc_gst,
      cumulativePercentage: row.cumulative_percentage, remainingExGst: row.remaining_ex_gst,
      remainingGst: row.remaining_gst, remainingIncGst: row.remaining_inc_gst,
    },
    calculationPolicyVersion: row.calculation_policy_version, financialSnapshotHash: row.financial_snapshot_hash,
    capabilities: { canSave: row.can_save, canIssue: row.can_issue },
  }
}

function mapResult(result: ActionResult<ProgressClaimEditorRpcDto, ProgressClaimEditorRpcDto>): ActionResult<ProgressClaimEditorDto, ProgressClaimEditorDto> {
  if (result.ok) return { ok: true, data: mapEditor(result.data) }
  return {
    ok: false,
    error: result.error,
    ...(result.code ? { code: result.code } : {}),
    ...(result.current ? { current: mapEditor(result.current) } : {}),
  }
}

export async function getProgressClaimDefaults(input: { seriesId: string }): Promise<ActionResult<ProgressClaimEditorDto | null>> {
  const result = await (await createProgressInvoiceRepository()).call('get_progress_claim_defaults', { series_id: input.seriesId })
  return result.ok ? { ok: true, data: result.data ? mapEditor(result.data) : null } : result
}

export async function getProgressClaimEditor(input: { claimId: string }): Promise<ActionResult<ProgressClaimEditorDto | null>> {
  const result = await (await createProgressInvoiceRepository()).call('get_progress_claim_editor', { claim_id: input.claimId })
  return result.ok ? { ok: true, data: result.data ? mapEditor(result.data) : null } : result
}

export async function createProgressClaimDraft(input: CreateProgressClaimDraftInput): Promise<ActionResult<ProgressClaimEditorDto, ProgressClaimEditorDto>> {
  return mapResult(await (await createProgressInvoiceRepository()).call('create_progress_claim_draft', {
    series_id: input.seriesId, kind: input.kind, input_mode: input.inputMode,
    authoritative_value: input.authoritativeValue, issue_date: input.issueDate, due_date: input.dueDate,
    description: input.description, notes: input.notes ?? null, expected_series_version: input.expectedSeriesVersion,
    expected_current_revision_set_id: input.expectedCurrentRevisionSetId,
    expected_current_manifest_hash: input.expectedCurrentManifestHash, correlation_key: input.correlationKey,
  }))
}

export async function saveProgressClaimDraft(input: SaveProgressClaimDraftInput): Promise<ActionResult<ProgressClaimEditorDto, ProgressClaimEditorDto>> {
  return mapResult(await (await createProgressInvoiceRepository()).call('save_progress_claim_draft', {
    claim_id: input.claimId, expected_claim_version: input.expectedClaimVersion,
    expected_series_version: input.expectedSeriesVersion,
    expected_current_revision_set_id: input.expectedCurrentRevisionSetId,
    expected_current_manifest_hash: input.expectedCurrentManifestHash, input_mode: input.inputMode,
    authoritative_value: input.authoritativeValue, issue_date: input.issueDate, due_date: input.dueDate,
    description: input.description, notes: input.notes ?? null, correlation_key: input.correlationKey,
  }))
}
