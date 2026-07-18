import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

import {
  createManualProgressInvoiceSeries,
  getProgressInvoiceSeries,
  listProgressInvoiceSeries,
} from '@/lib/progress-invoices/series-service'

const SERIES_ID = '11111111-1111-4111-8111-111111111111'
const CORRELATION_KEY = '22222222-2222-4222-8222-222222222222'

const dashboardItem = {
  id: SERIES_ID,
  source_type: 'manual',
  quote_id: null,
  recipient_name: 'Safe Builder),owner_id.eq.attacker',
  recipient_company: '',
  site_name: 'Safe Site',
  status: 'active',
  current_adjusted_contract_ex_gst: '899999999999.99',
  current_claimed_inc_gst: '110.01',
  current_actual_receipts: '10.00',
  current_outstanding_receivable: '100.01',
  current_credit_balance: '25.50',
  current_unclaimed_inc_gst: '989999999889.97',
  current_cumulative_percentage: '0.000011',
  current_payment_state: 'overdue',
  current_manifest_claim_count: 1,
  invoice_number: 'INV-100-P01',
  reference: 'Stage 1',
  last_successful_jobber_sync_at: null,
  last_jobber_sync_error_code: null,
  version: 1,
}

const dashboardSummary = {
  current_adjusted_contract_ex_gst: '900000000999.99',
  current_claimed_inc_gst: '220.02',
  current_actual_receipts: '20.00',
  current_outstanding_receivable: '200.02',
  current_credit_balance: '25.50',
  current_unclaimed_inc_gst: '990000000779.97',
}

const detail = {
  id: SERIES_ID,
  quote_id: null,
  source_type: 'manual',
  version: 1,
  base_contract_ex_gst: '899999999999.99',
  gst_rate: '0.10',
  recipient_name: 'Safe Builder',
  recipient_company: '',
  recipient_address: '1 Billing Street',
  recipient_email: '',
  recipient_phone: '',
  recipient_abn: '',
  site_name: 'Safe Site',
  site_address: '2 Site Street',
  default_description: 'Painting works',
  reference: '',
  status: 'active',
  accepted_numbering_base: null,
  jobber_link_locked_at: null,
  current_adjusted_contract_ex_gst: '899999999999.99',
  current_adjusted_contract_gst: '89999999999.99',
  current_adjusted_contract_inc_gst: '989999999999.98',
  current_claimed_ex_gst: '0.01',
  current_claimed_gst: '0.00',
  current_claimed_inc_gst: '0.01',
  current_unclaimed_ex_gst: '899999999999.98',
  current_unclaimed_gst: '89999999999.99',
  current_unclaimed_inc_gst: '989999999999.97',
  current_cumulative_percentage: '0.000001',
}

function directReadClient(row: Record<string, unknown>) {
  const query = {
    order: vi.fn(),
    limit: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) => (
      resolve({ data: [row], error: null })
    ),
  }
  query.order.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) })
}

describe('progress invoice series service read boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates literal search, filters, and pagination to the authenticated list RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { items: [dashboardItem], summary: dashboardSummary, page: 2, page_size: 25, total: 126 },
      error: null,
    })
    const from = directReadClient(dashboardItem)
    mocks.createClient.mockResolvedValue({ from, rpc })
    const input = {
      query: String.raw`Builder%_),\\owner_id.eq.attacker`,
      statuses: ['active', 'overdue'] as const,
      page: 2,
      pageSize: 25,
      quoteId: null,
    }

    const result = await listProgressInvoiceSeries(input)

    expect(rpc).toHaveBeenCalledWith('list_progress_invoice_series', {
      payload: {
        query: input.query,
        statuses: ['active', 'overdue'],
        page: 2,
        page_size: 25,
        quote_id: null,
      },
    })
    expect(from).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      data: {
        items: [{
          id: SERIES_ID,
          sourceType: 'manual',
          quoteId: null,
          recipientName: 'Safe Builder),owner_id.eq.attacker',
          recipientCompany: '',
          siteName: 'Safe Site',
          status: 'active',
          adjustedContractExGst: '899999999999.99',
          claimedIncGst: '110.01',
          receivedIncGst: '10.00',
          outstandingReceivable: '100.01',
          creditBalanceIncGst: '25.50',
          unclaimedIncGst: '989999999889.97',
          cumulativePercentage: '0.000011',
          paymentState: 'overdue',
          currentManifestClaimCount: 1,
          invoiceNumber: 'INV-100-P01',
          reference: 'Stage 1',
          lastSuccessfulJobberSyncAt: null,
          lastJobberSyncErrorCode: null,
          version: 1,
        }],
        summary: {
          adjustedContractExGst: '900000000999.99',
          claimedIncGst: '220.02',
          receivedIncGst: '20.00',
          outstandingIncGst: '200.02',
          creditBalanceIncGst: '25.50',
          unclaimedIncGst: '990000000779.97',
        },
        page: 2,
        pageSize: 25,
        total: 126,
      },
    })
  })

  it('reloads the last available page when the requested page is out of range', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { items: [], summary: dashboardSummary, page: 999, page_size: 20, total: 21 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { items: [dashboardItem], summary: { ...dashboardSummary, current_claimed_inc_gst: '333.33' }, page: 2, page_size: 20, total: 21 },
        error: null,
      })
    mocks.createClient.mockResolvedValue({ from: directReadClient(dashboardItem), rpc })

    const result = await listProgressInvoiceSeries({
      query: 'Builder',
      statuses: ['active'],
      page: 999,
      pageSize: 20,
      quoteId: null,
    })

    expect(rpc).toHaveBeenNthCalledWith(1, 'list_progress_invoice_series', {
      payload: {
        query: 'Builder',
        statuses: ['active'],
        page: 999,
        page_size: 20,
        quote_id: null,
      },
    })
    expect(rpc).toHaveBeenNthCalledWith(2, 'list_progress_invoice_series', {
      payload: {
        query: 'Builder',
        statuses: ['active'],
        page: 2,
        page_size: 20,
        quote_id: null,
      },
    })
    expect(result).toMatchObject({
      ok: true,
      data: {
        items: [{ id: SERIES_ID }],
        page: 2,
        pageSize: 20,
        total: 21,
        summary: { claimedIncGst: '333.33' },
      },
    })
  })

  it('reads series detail through an RPC that preserves large decimal strings and cents', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { series: detail }, error: null })
    const from = directReadClient({
      ...detail,
      base_contract_ex_gst: 899999999999.99,
      gst_rate: 0.1,
      current_adjusted_contract_ex_gst: 899999999999.99,
    })
    mocks.createClient.mockResolvedValue({ from, rpc })

    const result = await getProgressInvoiceSeries(SERIES_ID)

    expect(rpc).toHaveBeenCalledWith('get_progress_invoice_series', {
      payload: { series_id: SERIES_ID },
    })
    expect(from).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: true,
      data: {
        sourceType: 'manual',
        baseContractExGst: '899999999999.99',
        adjustedContractExGst: '899999999999.99',
        claimedIncGst: '0.01',
        cumulativePercentage: '0.000001',
      },
    })
  })

  it('accepts historical PBC Quote and Jobber Job sources at the read boundary', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          items: [{ ...dashboardItem, source_type: 'pbc_quote' }],
          summary: dashboardSummary,
          page: 1,
          page_size: 20,
          total: 1,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { series: { ...detail, source_type: 'jobber_job' } },
        error: null,
      })
    mocks.createClient.mockResolvedValue({ from: directReadClient(detail), rpc })

    expect(await listProgressInvoiceSeries({
      query: '', statuses: [], page: 1, pageSize: 20, quoteId: null,
    })).toMatchObject({ ok: true, data: { items: [{ sourceType: 'pbc_quote' }] } })
    expect(await getProgressInvoiceSeries(SERIES_ID)).toMatchObject({
      ok: true,
      data: { sourceType: 'jobber_job' },
    })
  })

  it('sends only the strict Manual command to the repository boundary', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: SERIES_ID, version: 1 }],
      error: null,
    })
    mocks.createClient.mockResolvedValue({ rpc })

    expect(await createManualProgressInvoiceSeries({
      sourceType: 'manual',
      gstRate: '0.10',
      acceptedNumberingBase: '2906',
      baseContractExGst: '17220.50',
      recipientName: 'Manual Builder',
      recipientCompany: null,
      recipientAddress: '1 Billing Street',
      recipientEmail: null,
      recipientPhone: null,
      recipientAbn: null,
      siteName: 'Manual Site',
      siteAddress: '4 Site Street',
      defaultDescription: 'Progress painting works',
      reference: null,
      correlationKey: CORRELATION_KEY,
    })).toEqual({ ok: true, data: { id: SERIES_ID, version: 1 } })

    expect(rpc).toHaveBeenCalledWith('create_manual_progress_invoice_series', {
      payload: {
        source_type: 'manual',
        gst_rate: '0.10',
        accepted_numbering_base: '2906',
        base_contract_ex_gst: '17220.50',
        recipient_name: 'Manual Builder',
        recipient_company: null,
        recipient_address: '1 Billing Street',
        recipient_email: null,
        recipient_phone: null,
        recipient_abn: null,
        site_name: 'Manual Site',
        site_address: '4 Site Street',
        default_description: 'Progress painting works',
        reference: null,
        correlation_key: CORRELATION_KEY,
      },
    })
  })

  it('rejects numeric JSON for every decimal-text read boundary', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: { items: [{ ...dashboardItem, current_claimed_inc_gst: 110.01 }], summary: dashboardSummary, page: 1, page_size: 20, total: 1 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { series: { ...detail, base_contract_ex_gst: 899999999999.99 } },
        error: null,
      })
    mocks.createClient.mockResolvedValue({ from: directReadClient(detail), rpc })

    expect(await listProgressInvoiceSeries({
      query: '', statuses: [], page: 1, pageSize: 20, quoteId: null,
    })).toEqual({ ok: false, error: 'PROGRESS_RESPONSE_INVALID' })
    expect(await getProgressInvoiceSeries(SERIES_ID)).toEqual({
      ok: false,
      error: 'PROGRESS_RESPONSE_INVALID',
    })
  })

  it('maps zero manifest claims to no_claims without hiding independent credit', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        items: [{
          ...dashboardItem,
          current_manifest_claim_count: 0,
          current_payment_state: 'credit_balance',
        }],
        summary: dashboardSummary,
        page: 1,
        page_size: 20,
        total: 1,
      },
      error: null,
    })
    mocks.createClient.mockResolvedValue({ rpc })

    const result = await listProgressInvoiceSeries({
      query: '', statuses: [], page: 1, pageSize: 20, quoteId: null,
    })

    expect(result).toMatchObject({
      ok: true,
      data: { items: [{ paymentState: 'no_claims', creditBalanceIncGst: '25.50' }] },
    })
  })

})
