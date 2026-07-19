import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  createProgressInvoiceRepository: vi.fn(),
  getBusinessInvoiceProfile: vi.fn(),
}))

vi.mock('@/lib/progress-invoices/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/progress-invoices/repository')>()
  return {
    ...actual,
    createProgressInvoiceRepository: mocks.createProgressInvoiceRepository,
  }
})

vi.mock('@/lib/progress-invoices/series-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/progress-invoices/series-service')>()
  return {
    ...actual,
    getBusinessInvoiceProfile: mocks.getBusinessInvoiceProfile,
  }
})

import {
  ProgressInvoiceRepository,
  type ProgressInvoiceRpcExecutor,
} from '@/lib/progress-invoices/repository'
import {
  getProgressInvoiceSeriesWorkspace,
  listProgressInvoiceSeriesHistory,
} from '@/lib/progress-invoices/workspace-service'

const SERIES_ID = '11111111-1111-4111-8111-111111111111'
const SET_ID = '22222222-2222-4222-8222-222222222222'
const CLAIM_ID = '33333333-3333-4333-8333-333333333333'
const REVISION_ID = '44444444-4444-4444-8444-444444444444'
const EVENT_ID = '55555555-5555-4555-8555-555555555555'

const series = {
  id: SERIES_ID,
  quote_id: null,
  source_type: 'jobber_invoice',
  version: 3,
  base_contract_ex_gst: '17220.50',
  gst_rate: '0.10',
  recipient_name: 'Alex Builder',
  recipient_company: 'Timbaworx',
  recipient_address: '1 Billing Street',
  recipient_email: 'accounts@example.test',
  recipient_phone: '0400000000',
  recipient_abn: '12345678901',
  site_name: '4 Curra Close',
  site_address: '4 Curra Close, Frenchs Forest NSW 2086',
  default_description: 'Progress painting works',
  reference: 'Stage one',
  status: 'active',
  accepted_numbering_base: '2906',
  jobber_link_locked_at: '2026-07-16T00:00:00+00:00',
  current_adjusted_contract_ex_gst: '39507.08',
  current_adjusted_contract_gst: '3950.71',
  current_adjusted_contract_inc_gst: '43457.79',
  current_claimed_ex_gst: '34337.92',
  current_claimed_gst: '3433.79',
  current_claimed_inc_gst: '37771.71',
  current_unclaimed_ex_gst: '5169.16',
  current_unclaimed_gst: '516.92',
  current_unclaimed_inc_gst: '5686.08',
  current_cumulative_percentage: '86.916836',
}

const rawWorkspace = {
  series,
  summary: {
    adjusted_ex_gst: '39507.08',
    adjusted_gst: '3950.71',
    adjusted_inc_gst: '43457.79',
    claimed_inc_gst: '37771.71',
    received_inc_gst: '1000.00',
    outstanding_inc_gst: '36771.71',
    credit_balance_inc_gst: '0.00',
    unclaimed_inc_gst: '5686.08',
    cumulative_percentage: '86.916836',
  },
  imported_jobber_observation: {
    original_invoice_number: '2875',
    observed_invoice_number: '2875',
    normalized_status: 'part_paid',
    invoice_subtotal: '39507.08',
    invoice_tax: '3950.71',
    invoice_total: '43457.79',
    invoice_balance: '42457.79',
    issued_date: '2026-07-10',
    due_date: '2026-07-24',
    received_date: null,
    external_updated_at: '2026-07-16T03:30:00+00:00',
    client_name: 'Alex Builder',
    client_company_name: 'Timbaworx',
    client_email: 'accounts@example.test',
    client_phone: '0400000000',
    billing_address: '1 Billing Street',
    property_address: '4 Curra Close',
    fetched_at: '2026-07-16T03:31:00+00:00',
  },
  current_revision_set: {
    id: SET_ID,
    revision_manifest_hash: 'a'.repeat(64),
    current_manifest_claim_count: 1,
    current_claim_revision_id: REVISION_ID,
  },
  adjustments: [{
    id: '66666666-6666-4666-8666-666666666666',
    type: 'variation',
    status: 'approved',
    effective_date: '2026-07-12',
    display_order: 1,
    description: 'Extra preparation',
    amount_ex_gst: '19714.68',
    gst_rate: '0.10',
    reason: null,
    version: 2,
  }],
  claims: [{
    id: CLAIM_ID,
    sequence: 1,
    kind: 'progress',
    suffix: 'P01',
    tax_invoice_number: '2906-P01',
    status: 'issued',
    original_issued_at: '2026-07-12T00:00:00+00:00',
    latest_revised_at: null,
    version: 1,
    current_revision: {
      id: REVISION_ID,
      revision_number: 1,
      state: 'issued',
      issue_date: '2026-07-12',
      due_date: '2026-07-26',
      description: 'Progress painting works',
      reference: 'Stage one',
      current_claim_ex_gst: '17220.50',
      current_claim_gst: '1722.05',
      current_claim_inc_gst: '18942.55',
      cumulative_percentage: '43.588541',
      remaining_ex_gst: '22286.58',
      remaining_gst: '2228.66',
      remaining_inc_gst: '24515.24',
      edit_classification: 'clerical',
      tax_review_state: 'not_required',
      created_at: '2026-07-12T00:00:00+00:00',
    },
  }],
  payments: [{
    id: '77777777-7777-4777-8777-777777777777',
    source: 'manual',
    matched_manual_payment_id: null,
    version: 1,
    current_revision: {
      id: '88888888-8888-4888-8888-888888888888',
      revision_number: 1,
      received_date: '2026-07-15',
      observed_amount: '1000.00',
      effective_receipt_amount: '1000.00',
      payment_method: 'EFT',
      reference: 'Receipt 1',
      external_status: null,
      external_updated_at: null,
      sync_state: 'manual',
      status: 'active',
      source_observed_at: null,
      reason: null,
      created_at: '2026-07-15T00:00:00+00:00',
    },
  }],
  ready_documents: [{
    id: '99999999-9999-4999-8999-999999999999',
    claim_revision_id: REVISION_ID,
    revision_set_id: null,
    scope: 'current_claim',
    format: 'pdf',
    template_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    template_version: 1,
    renderer_version: 'renderer-v1',
    sha256: 'b'.repeat(64),
    page_or_worksheet_count: 1,
    revision_manifest_hash: null,
    generated_at: '2026-07-12T01:00:00+00:00',
    created_at: '2026-07-12T00:30:00+00:00',
    is_current: true,
  }],
  recent_events: [{
    id: EVENT_ID,
    claim_id: CLAIM_ID,
    event_type: 'claim_issued',
    source: 'user',
    occurred_at: '2026-07-12T00:00:00+00:00',
    prior_revision_id: null,
    next_revision_id: REVISION_ID,
    safe_field_changes: { reference: { before: null, after: 'Stage one' } },
  }],
  history: { next_cursor: null },
  capabilities: {
    can_edit_series: true,
    can_edit_base_contract: false,
    can_void_series_directly: false,
    requires_claim_void_workflow: true,
    can_create_claim: true,
    can_download_current: true,
    can_download_historical: false,
  },
}

function executorReturning(data: unknown): ProgressInvoiceRpcExecutor {
  return { execute: async () => ({ data, error: null }) }
}

describe('Progress Invoice workspace boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createProgressInvoiceRepository.mockResolvedValue({ call: mocks.call })
    mocks.getBusinessInvoiceProfile.mockResolvedValue({
      ok: true,
      data: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        legalName: 'Harbour Example Co Pty Ltd',
        tradingName: '',
        abn: '99000000000',
        contractorLicence: '',
        address: '1 Sample Street',
        phone: '0400000000',
        email: 'accounts@example.test',
        bankName: 'Sample Bank',
        bsb: '000-000',
        bankAccountName: 'Harbour Example Co',
        accountNumber: '87654321',
        gstRate: '0.10',
        businessTimezone: 'Australia/Sydney',
        defaultPaymentTermDays: 14,
        version: 1,
      },
    })
  })

  it('strictly parses and maps the exact Current-manifest workspace without changing decimals', async () => {
    mocks.call.mockResolvedValue({ ok: true, data: rawWorkspace })

    const result = await getProgressInvoiceSeriesWorkspace(SERIES_ID)

    expect(mocks.call).toHaveBeenCalledWith('get_progress_invoice_workspace', {
      series_id: SERIES_ID,
    })
    expect(result).toMatchObject({
      ok: true,
      data: {
        series: { id: SERIES_ID, adjustedContractExGst: '39507.08' },
        summary: {
          adjustedExGst: '39507.08',
          adjustedGst: '3950.71',
          adjustedIncGst: '43457.79',
          claimedIncGst: '37771.71',
          receivedIncGst: '1000.00',
          outstandingIncGst: '36771.71',
          creditBalanceIncGst: '0.00',
          unclaimedIncGst: '5686.08',
          cumulativePercentage: '86.916836',
        },
        currentRevisionSet: {
          id: SET_ID,
          revisionManifestHash: 'a'.repeat(64),
          currentManifestClaimCount: 1,
          currentClaimRevisionId: REVISION_ID,
        },
        claims: [{ id: CLAIM_ID, currentRevision: { id: REVISION_ID } }],
        payments: [{ source: 'manual', currentRevision: { status: 'active' } }],
      },
    })
  })

  it('rejects malformed nested data and cap+1 arrays instead of truncating them', async () => {
    const invalidNested = structuredClone(rawWorkspace)
    invalidNested.claims[0]!.current_revision!.current_claim_inc_gst = '18942.5'
    expect(await new ProgressInvoiceRepository(executorReturning(invalidNested)).call(
      'get_progress_invoice_workspace',
      { series_id: SERIES_ID },
    )).toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })

  })

  it.each([
    ['adjustments', 251],
    ['claims', 101],
    ['payments', 501],
    ['ready_documents', 101],
    ['recent_events', 21],
  ] as const)('rejects cap+1 %s instead of silently truncating', async (section, count) => {
    const overflow = structuredClone(rawWorkspace) as unknown as Record<string, unknown>
    const source = (overflow[section] as unknown[])[0]
    overflow[section] = Array.from({ length: count }, () => source)
    expect(await new ProgressInvoiceRepository(executorReturning(overflow)).call(
      'get_progress_invoice_workspace', { series_id: SERIES_ID },
    )).toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })
  })

  it.each([
    ['Series UUID', (value: typeof rawWorkspace) => { value.series.id = 'not-a-uuid' }],
    ['observation enum', (value: typeof rawWorkspace) => { value.imported_jobber_observation!.normalized_status = 'invalid' as 'paid' }],
    ['observation date', (value: typeof rawWorkspace) => { value.imported_jobber_observation!.issued_date = '2026-02-30' }],
    ['observation decimal', (value: typeof rawWorkspace) => { value.imported_jobber_observation!.invoice_total = '1.0' }],
    ['revision-set UUID', (value: typeof rawWorkspace) => { value.current_revision_set!.id = 'not-a-uuid' }],
    ['adjustment UUID', (value: typeof rawWorkspace) => { value.adjustments[0]!.id = 'not-a-uuid' }],
    ['adjustment date', (value: typeof rawWorkspace) => { value.adjustments[0]!.effective_date = '2026-02-30' }],
    ['adjustment enum', (value: typeof rawWorkspace) => { value.adjustments[0]!.type = 'other' as 'variation' }],
    ['Claim UUID', (value: typeof rawWorkspace) => { value.claims[0]!.id = 'not-a-uuid' }],
    ['Claim revision decimal', (value: typeof rawWorkspace) => { value.claims[0]!.current_revision!.remaining_inc_gst = '1.0' }],
    ['Payment revision UUID', (value: typeof rawWorkspace) => { value.payments[0]!.current_revision!.id = 'not-a-uuid' }],
    ['Payment received date', (value: typeof rawWorkspace) => { value.payments[0]!.current_revision!.received_date = '2026-02-30' }],
    ['Payment status enum', (value: typeof rawWorkspace) => { value.payments[0]!.current_revision!.status = 'paid' as 'active' }],
    ['Document UUID', (value: typeof rawWorkspace) => { value.ready_documents[0]!.template_id = 'not-a-uuid' }],
    ['Document enum', (value: typeof rawWorkspace) => { value.ready_documents[0]!.format = 'docx' as 'pdf' }],
    ['Event UUID', (value: typeof rawWorkspace) => { value.recent_events[0]!.id = 'not-a-uuid' }],
    ['Event timestamp', (value: typeof rawWorkspace) => { value.recent_events[0]!.occurred_at = 'yesterday' }],
    ['Event enum', (value: typeof rawWorkspace) => { value.recent_events[0]!.source = 'external' as 'user' }],
  ])('rejects malformed nested %s boundary data', async (_label, mutate) => {
    const invalid = structuredClone(rawWorkspace)
    mutate(invalid)
    expect(await new ProgressInvoiceRepository(executorReturning(invalid)).call(
      'get_progress_invoice_workspace', { series_id: SERIES_ID },
    )).toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })
  })

  it.each([
    ['2024-02-30T00:00:00Z', false],
    ['2026-02-30T00:00:00Z', false],
    ['2025-02-29T12:30:00+11:00', false],
    ['2024-02-29T23:59:59.123456+11:00', true],
    ['2026-07-12T00:00:00-05:30', true],
  ] as const)('strictly validates event timestamp %s', async (timestamp, accepted) => {
    const candidate = structuredClone(rawWorkspace)
    candidate.recent_events[0]!.occurred_at = timestamp

    const result = await new ProgressInvoiceRepository(executorReturning(candidate)).call(
      'get_progress_invoice_workspace', { series_id: SERIES_ID },
    )

    expect(result.ok).toBe(accepted)
    if (!accepted) expect(result).toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })
  })

  it.each([
    ['quote_id', 'not-a-uuid', false],
    ['quote_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true],
    ['type', 'invoice', false],
    ['type', 'credit', true],
  ] as const)('validates semantic event field %s=%s', async (key, eventValue, accepted) => {
    const candidate = structuredClone(rawWorkspace)
    ;(candidate.recent_events[0] as unknown as Record<string, unknown>).safe_field_changes = {
      [key]: eventValue,
    }

    const result = await new ProgressInvoiceRepository(executorReturning(candidate)).call(
      'get_progress_invoice_workspace', { series_id: SERIES_ID },
    )

    expect(result.ok).toBe(accepted)
    if (!accepted) expect(result).toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })
  })

  it.each([
    ['effective_date', { before: '2026-02-30', after: '2026-03-01' }, false],
    ['effective_date', { before: '2026-02-28', after: '2026-03-01' }, true],
    ['amount_ex_gst', { before: '100.0', after: '125.00' }, false],
    ['amount_ex_gst', { before: '100.00', after: '125.00' }, true],
    ['gst_rate', { before: 0.1, after: '0.10' }, false],
    ['gst_rate', { before: '0.10', after: '0.15' }, true],
  ] as const)('validates semantic event change %s', async (key, change, accepted) => {
    const candidate = structuredClone(rawWorkspace)
    ;(candidate.recent_events[0] as unknown as Record<string, unknown>).safe_field_changes = {
      [key]: change,
    }

    const result = await new ProgressInvoiceRepository(executorReturning(candidate)).call(
      'get_progress_invoice_workspace', { series_id: SERIES_ID },
    )

    expect(result.ok).toBe(accepted)
    if (!accepted) expect(result).toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })
  })

  it('preserves the Base Contract lock capability when a Draft Claim exists outside Current', async () => {
    const draftClaimWorkspace = structuredClone(rawWorkspace) as unknown as Record<string, unknown>
    const claims = draftClaimWorkspace.claims as Array<Record<string, unknown>>
    draftClaimWorkspace.current_revision_set = null
    draftClaimWorkspace.claims = [{ ...claims[0], status: 'draft', original_issued_at: null, current_revision: null }]
    ;(draftClaimWorkspace.capabilities as Record<string, unknown>).can_edit_base_contract = false
    mocks.call.mockResolvedValue({ ok: true, data: draftClaimWorkspace })

    const result = await getProgressInvoiceSeriesWorkspace(SERIES_ID)

    expect(result).toMatchObject({
      ok: true,
      data: {
        currentRevisionSet: null,
        claims: [{ status: 'draft', currentRevision: null }],
        capabilities: { canEditBaseContract: false },
        invoiceProfileReady: true,
      },
    })
  })

  it.each([
    ['missing', null],
    ['invalid', {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      legalName: 'Harbour Example Co Pty Ltd', tradingName: '', abn: '99000000001',
      contractorLicence: '', address: '1 Sample Street', phone: '0400000000',
      email: 'accounts@example.test', bankName: 'Sample Bank', bsb: '000-000',
      bankAccountName: 'Harbour Example Co', accountNumber: '87654321', gstRate: '0.10',
      businessTimezone: 'Australia/Sydney', defaultPaymentTermDays: 14, version: 1,
    }],
  ] as const)('keeps workspace reads available but gates Claim creation for a %s profile', async (_case, profile) => {
    mocks.call.mockResolvedValue({ ok: true, data: rawWorkspace })
    mocks.getBusinessInvoiceProfile.mockResolvedValue({ ok: true, data: profile })

    const result = await getProgressInvoiceSeriesWorkspace(SERIES_ID)

    expect(result).toMatchObject({
      ok: true,
      data: {
        series: { id: SERIES_ID },
        invoiceProfileReady: false,
        capabilities: { canCreateClaim: false },
      },
    })
  })

  it('never attaches supplier or bank profile fields to workspace output', async () => {
    mocks.call.mockResolvedValue({ ok: true, data: rawWorkspace })

    const result = await getProgressInvoiceSeriesWorkspace(SERIES_ID)
    const serialized = JSON.stringify(result)

    expect(serialized).not.toContain('Sample Bank')
    expect(serialized).not.toContain('000-000')
    expect(serialized).not.toContain('87654321')
    expect(serialized).not.toContain('accountNumber')
    expect(serialized).not.toContain('bankAccount')
  })

  it('rejects sensitive or arbitrary observation, document, and event fields', async () => {
    for (const mutate of [
      (value: Record<string, unknown>) => {
        ;(value.imported_jobber_observation as Record<string, unknown>).raw_response = { token: 'secret' }
      },
      (value: Record<string, unknown>) => {
        ;((value.ready_documents as Record<string, unknown>[])[0]!).storage_path = 'private/secret.pdf'
      },
      (value: Record<string, unknown>) => {
        ;(((value.recent_events as Record<string, unknown>[])[0]!).safe_field_changes as Record<string, unknown>).bank_account_number = '1234'
      },
      (value: Record<string, unknown>) => {
        ;(((value.recent_events as Record<string, unknown>[])[0]!).safe_field_changes as Record<string, unknown>).reference = {
          before: null,
          after: 'https://unsafe.example/private/file',
        }
      },
    ]) {
      const invalid = structuredClone(rawWorkspace) as Record<string, unknown>
      mutate(invalid)
      expect(await new ProgressInvoiceRepository(executorReturning(invalid)).call(
        'get_progress_invoice_workspace',
        { series_id: SERIES_ID },
      )).toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })
    }
  })

  it('preserves a safe missing-series result', async () => {
    mocks.call.mockResolvedValue({ ok: true, data: { series: null } })
    expect(await getProgressInvoiceSeriesWorkspace(SERIES_ID)).toEqual({ ok: true, data: null })
  })

  it('maps cursor history independently from workspace data', async () => {
    mocks.call.mockResolvedValue({
      ok: true,
      data: { events: rawWorkspace.recent_events, next_cursor: EVENT_ID },
    })

    expect(await listProgressInvoiceSeriesHistory({
      seriesId: SERIES_ID,
      cursor: null,
      limit: 20,
    })).toEqual({
      ok: true,
      data: {
        events: [{
          id: EVENT_ID,
          claimId: CLAIM_ID,
          eventType: 'claim_issued',
          source: 'user',
          occurredAt: '2026-07-12T00:00:00+00:00',
          priorRevisionId: null,
          nextRevisionId: REVISION_ID,
          safeFieldChanges: { reference: { before: null, after: 'Stage one' } },
        }],
        nextCursor: EVENT_ID,
      },
    })
    expect(mocks.call).toHaveBeenCalledWith('list_progress_invoice_history', {
      series_id: SERIES_ID,
      cursor: null,
      limit: 20,
    })
  })
})
