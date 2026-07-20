import { beforeEach, describe, expect, it, vi } from 'vitest'

const SERIES_ID = '61000000-0000-4000-8000-000000000001'
const CLAIM_ID = '61000000-0000-4000-8000-000000000002'
const SET_ID = '61000000-0000-4000-8000-000000000003'
const KEY = '61000000-0000-4000-8000-000000000004'
const HASH = 'a'.repeat(64)

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('@/lib/progress-invoices/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/progress-invoices/repository')>()
  return {
    ...actual,
    createProgressInvoiceRepository: async () => ({ call: mocks.call }),
  }
})

import {
  createProgressClaimDraft,
  getProgressClaimDefaults,
  getProgressClaimEditor,
  saveProgressClaimDraft,
} from '@/lib/progress-invoices/claim-service'
import { ProgressInvoiceRepository } from '@/lib/progress-invoices/repository'

const rpcEditor = {
  series_id: SERIES_ID,
  series_version: 7,
  series_status: 'active',
  source_type: 'manual',
  accepted_numbering_base: '900001',
  expected_current_revision_set_id: SET_ID,
  expected_current_manifest_hash: HASH,
  claim_id: CLAIM_ID,
  claim_version: 1,
  claim_status: 'draft',
  claim_kind: 'progress',
  sequence: 1,
  suffix: 'P01',
  tax_invoice_number: '900001-P01',
  revision_id: '61000000-0000-4000-8000-000000000005',
  revision_number: 1,
  input_mode: 'cumulative_percentage',
  authoritative_value: '37.125000',
  issue_date: '2026-07-20',
  due_date: '2026-08-03',
  description: 'Progress painting works',
  notes: '',
  reference: 'Site A',
  supplier_profile_version: 2,
  supplier_legal_name: 'Paint Buddy & Co Pty Ltd',
  supplier_trading_name: 'Paint Buddy & Co',
  supplier_abn: '51824753556',
  supplier_contractor_licence: 'LIC-1',
  supplier_address: 'Sydney NSW',
  supplier_phone: '0400000000',
  supplier_email: 'office@example.test',
  supplier_bank_name: 'Bank',
  supplier_bsb: '000-000',
  supplier_bank_account_name: 'PBC',
  supplier_bank_account_number: '1234',
  supplier_gst_rate: '0.10',
  supplier_timezone: 'Australia/Sydney',
  supplier_default_payment_term_days: 14,
  recipient_name: 'Builder',
  recipient_company: 'Builder Pty Ltd',
  recipient_address: '1 Builder St',
  recipient_email: 'builder@example.test',
  recipient_phone: '0400111222',
  recipient_abn: null,
  site_name: 'Site A',
  site_address: '2 Site St',
  jobber_account_id: null,
  jobber_invoice_id: null,
  original_jobber_invoice_number: null,
  observed_jobber_invoice_number: null,
  base_contract_ex_gst: '10000.00',
  approved_variations_ex_gst: '500.00',
  approved_credits_ex_gst: '100.00',
  approved_adjustments: [],
  previous_claims: [],
  adjusted_contract_ex_gst: '10400.00',
  adjusted_contract_gst: '1040.00',
  adjusted_contract_inc_gst: '11440.00',
  previous_claims_ex_gst: '0.00',
  previous_claims_gst: '0.00',
  previous_claims_inc_gst: '0.00',
  cumulative_target_ex_gst: '3861.00',
  cumulative_target_gst: '386.10',
  cumulative_target_inc_gst: '4247.10',
  current_claim_ex_gst: '3861.00',
  current_claim_gst: '386.10',
  current_claim_inc_gst: '4247.10',
  cumulative_percentage: '37.125000',
  remaining_ex_gst: '6539.00',
  remaining_gst: '653.90',
  remaining_inc_gst: '7192.90',
  calculation_policy_version: 'progress-claim-v1',
  financial_snapshot_hash: 'b'.repeat(64),
  can_save: true,
  can_issue: false,
}

describe('progress Claim service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes create concurrency guards and maps exact decimal/date/null evidence DTOs', async () => {
    mocks.call.mockResolvedValue({ ok: true, data: rpcEditor })
    const result = await createProgressClaimDraft({
      seriesId: SERIES_ID,
      kind: 'progress',
      inputMode: 'cumulative_percentage',
      authoritativeValue: '37.125000',
      issueDate: '2026-07-20',
      dueDate: '2026-08-03',
      description: 'Progress painting works',
      notes: null,
      expectedSeriesVersion: 7,
      expectedCurrentRevisionSetId: SET_ID,
      expectedCurrentManifestHash: HASH,
      correlationKey: KEY,
    })

    expect(mocks.call).toHaveBeenCalledWith('create_progress_claim_draft', {
      series_id: SERIES_ID,
      kind: 'progress',
      input_mode: 'cumulative_percentage',
      authoritative_value: '37.125000',
      issue_date: '2026-07-20',
      due_date: '2026-08-03',
      description: 'Progress painting works',
      notes: null,
      expected_series_version: 7,
      expected_current_revision_set_id: SET_ID,
      expected_current_manifest_hash: HASH,
      correlation_key: KEY,
    })
    expect(result).toMatchObject({
      ok: true,
      data: {
        taxInvoiceNumber: '900001-P01',
        authoritativeValue: '37.125000',
        issueDate: '2026-07-20',
        dueDate: '2026-08-03',
        jobberEvidence: {
          accountId: null,
          invoiceId: null,
          originalInvoiceNumber: null,
          observedInvoiceNumber: null,
        },
        calculation: { currentClaimIncGst: '4247.10' },
        capabilities: { canSave: true, canIssue: false },
      },
    })
  })

  it('uses claim and Series CAS guards when saving Draft Revision 1', async () => {
    mocks.call.mockResolvedValue({ ok: true, data: rpcEditor })
    await saveProgressClaimDraft({
      claimId: CLAIM_ID,
      expectedClaimVersion: 1,
      expectedSeriesVersion: 7,
      expectedCurrentRevisionSetId: SET_ID,
      expectedCurrentManifestHash: HASH,
      inputMode: 'current_claim_amount',
      authoritativeValue: '1100.00',
      issueDate: '2026-07-21',
      dueDate: '2026-08-04',
      description: 'Updated',
      notes: '',
      correlationKey: KEY,
    })
    expect(mocks.call).toHaveBeenCalledWith('save_progress_claim_draft', expect.objectContaining({
      claim_id: CLAIM_ID,
      expected_claim_version: 1,
      expected_series_version: 7,
      expected_current_revision_set_id: SET_ID,
      expected_current_manifest_hash: HASH,
    }))
  })

  it('reads defaults without reserving and reads an existing editor by Claim identity', async () => {
    mocks.call
      .mockResolvedValueOnce({ ok: true, data: { ...rpcEditor, claim_id: null, claim_version: null, claim_status: null, claim_kind: null, sequence: null, suffix: null, tax_invoice_number: null, revision_id: null, revision_number: null } })
      .mockResolvedValueOnce({ ok: true, data: rpcEditor })
    await getProgressClaimDefaults({ seriesId: SERIES_ID })
    await getProgressClaimEditor({ claimId: CLAIM_ID })
    expect(mocks.call.mock.calls).toEqual([
      ['get_progress_claim_defaults', { series_id: SERIES_ID }],
      ['get_progress_claim_editor', { claim_id: CLAIM_ID }],
    ])
  })

  it('returns the DB persistence rejection for a zero-value Draft without breaking zero preview', async () => {
    mocks.call.mockResolvedValue({ ok: false, error: 'PROGRESS_CLAIM_AMOUNT_NOT_POSITIVE', code: 'VALIDATION' })
    const result = await createProgressClaimDraft({
      seriesId: SERIES_ID, kind: 'progress', inputMode: 'current_claim_amount', authoritativeValue: '0.00',
      issueDate: '2026-07-20', dueDate: '2026-08-03', description: 'Progress painting works', notes: null,
      expectedSeriesVersion: 7, expectedCurrentRevisionSetId: SET_ID,
      expectedCurrentManifestHash: HASH, correlationKey: KEY,
    })
    expect(result).toEqual({ ok: false, error: 'PROGRESS_CLAIM_AMOUNT_NOT_POSITIVE', code: 'VALIDATION' })
  })

  it('rejects malformed or over-posted editor DTOs at the repository boundary', async () => {
    const repository = new ProgressInvoiceRepository({
      execute: vi.fn().mockResolvedValue({ data: { ...rpcEditor, unexpected_field: 'unsafe' }, error: null }),
    })

    await expect(repository.call('get_progress_claim_editor', { claim_id: CLAIM_ID }))
      .resolves.toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })
  })
})
