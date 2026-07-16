import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

import { listProgressInvoiceSeries } from '@/lib/progress-invoices/series-service'

const SERIES_ID = '11111111-1111-4111-8111-111111111111'

describe('progress invoice series service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not interpolate search input into a raw PostgREST or filter', async () => {
    const row = {
      id: SERIES_ID,
      source_type: 'pbc_quote',
      quote_id: null,
      recipient_name: 'Safe Builder),owner_id.eq.attacker',
      recipient_company: null,
      site_name: 'Safe Site',
      default_description: null,
      reference: null,
      original_jobber_invoice_number: null,
      status: 'active',
      current_adjusted_contract_ex_gst: '1000.00',
      current_claimed_inc_gst: '110.00',
      current_actual_receipts: '10.00',
      current_outstanding_receivable: '100.00',
      current_unclaimed_inc_gst: '990.00',
      current_cumulative_percentage: '10.000000',
      current_payment_state: 'part_paid',
      last_successful_jobber_sync_at: null,
      last_jobber_sync_error_code: null,
      version: 1,
    }
    const or = vi.fn()
    const query = {
      order: vi.fn(),
      limit: vi.fn(),
      eq: vi.fn(),
      or,
      then: (resolve: (value: { data: typeof row[]; error: null }) => unknown) => resolve({ data: [row], error: null }),
    }
    query.order.mockReturnValue(query)
    query.limit.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.or.mockReturnValue(query)
    mocks.createClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }),
    })

    const result = await listProgressInvoiceSeries({ search: 'Builder),owner_id.eq.attacker' })

    expect(or).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: true, data: { summary: { count: 1 } } })
  })
})
