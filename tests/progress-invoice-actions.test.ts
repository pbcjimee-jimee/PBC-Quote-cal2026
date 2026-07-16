import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAllowedUser: vi.fn(),
  revalidatePath: vi.fn(),
  getBusinessInvoiceProfile: vi.fn(),
  saveBusinessInvoiceProfile: vi.fn(),
  listProgressInvoiceSeries: vi.fn(),
  getProgressInvoiceSeries: vi.fn(),
  getProgressInvoiceCreatePrefill: vi.fn(),
  createProgressInvoiceSeries: vi.fn(),
  updateProgressInvoiceSeries: vi.fn(),
  createProgressAdjustment: vi.fn(),
  updateDraftProgressAdjustment: vi.fn(),
  approveProgressAdjustment: vi.fn(),
  supersedeProgressAdjustment: vi.fn(),
}))

vi.mock('@/lib/security/require-allowed-user', () => ({
  requireAllowedUser: mocks.requireAllowedUser,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/progress-invoices/series-service', () => ({
  getBusinessInvoiceProfile: mocks.getBusinessInvoiceProfile,
  saveBusinessInvoiceProfile: mocks.saveBusinessInvoiceProfile,
  listProgressInvoiceSeries: mocks.listProgressInvoiceSeries,
  getProgressInvoiceSeries: mocks.getProgressInvoiceSeries,
  getProgressInvoiceCreatePrefill: mocks.getProgressInvoiceCreatePrefill,
  createProgressInvoiceSeries: mocks.createProgressInvoiceSeries,
  updateProgressInvoiceSeries: mocks.updateProgressInvoiceSeries,
}))

vi.mock('@/lib/progress-invoices/adjustment-service', () => ({
  createProgressAdjustment: mocks.createProgressAdjustment,
  updateDraftProgressAdjustment: mocks.updateDraftProgressAdjustment,
  approveProgressAdjustment: mocks.approveProgressAdjustment,
  supersedeProgressAdjustment: mocks.supersedeProgressAdjustment,
}))

import {
  createProgressInvoiceSeries,
  getBusinessInvoiceProfile,
  getProgressInvoiceCreatePrefill,
  getProgressInvoiceSeries,
  listProgressInvoiceSeries,
  saveBusinessInvoiceProfile,
  updateProgressInvoiceSeries,
} from '@/lib/actions/progress-invoice-series'
import {
  approveProgressAdjustment,
  createProgressAdjustment,
  supersedeProgressAdjustment,
  updateDraftProgressAdjustment,
} from '@/lib/actions/progress-invoice-adjustments'

const SERIES_ID = '11111111-1111-4111-8111-111111111111'
const QUOTE_ID = '22222222-2222-4222-8222-222222222222'
const ADJUSTMENT_ID = '33333333-3333-4333-8333-333333333333'
const CORRELATION_KEY = '44444444-4444-4444-8444-444444444444'

const standaloneSeriesInput = {
  sourceType: 'jobber_job' as const,
  baseContractExGst: '1000.00',
  gstRate: '0.10' as const,
  recipientName: 'Example Builder',
  recipientCompany: 'Example Builder Pty Ltd',
  recipientAddress: '1 Billing Street, Sydney NSW 2000',
  recipientEmail: 'accounts@example.test',
  recipientPhone: '0400000000',
  recipientAbn: '12345678901',
  siteName: 'Example Site',
  siteAddress: '2 Site Street, Sydney NSW 2000',
  defaultDescription: 'Painting works',
  reference: 'JOB-1',
  correlationKey: CORRELATION_KEY,
}

const profileInput = {
  legalName: 'Paint Buddy & Co Pty Ltd',
  tradingName: 'Paint Buddy & Co',
  abn: '12345678901',
  contractorLicence: 'LIC-1',
  address: '1 Supplier Street, Sydney NSW 2000',
  phone: '0400000000',
  email: 'accounts@example.test',
  bankName: 'Example Bank',
  bsb: '000-000',
  bankAccountName: 'Paint Buddy & Co',
  accountNumber: '00000000',
  gstRate: '0.10' as const,
  businessTimezone: 'Australia/Sydney' as const,
  defaultPaymentTermDays: 14,
}

const createAdjustmentInput = {
  seriesId: SERIES_ID,
  type: 'variation' as const,
  effectiveDate: '2026-07-16',
  description: 'Extra preparation',
  amountExGst: '100.00',
  gstRate: '0.10' as const,
  correlationKey: CORRELATION_KEY,
}

describe('Progress Invoice Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAllowedUser.mockResolvedValue({
      ok: true,
      user: { id: 'actor-1', email: 'owner@example.test' },
    })
  })

  it('validates create-series input before authentication', async () => {
    const result = await createProgressInvoiceSeries({
      ...standaloneSeriesInput,
      baseContractExGst: 1000,
    })

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.createProgressInvoiceSeries).not.toHaveBeenCalled()
  })

  it('requires an allowed user before profile, series, and adjustment work', async () => {
    mocks.requireAllowedUser.mockResolvedValue({
      ok: false,
      error: 'Authentication required',
    })

    expect(await getBusinessInvoiceProfile()).toEqual({
      ok: false,
      error: 'Authentication required',
    })
    expect(await createProgressInvoiceSeries(standaloneSeriesInput)).toEqual({
      ok: false,
      error: 'Authentication required',
    })
    expect(await createProgressAdjustment(createAdjustmentInput)).toEqual({
      ok: false,
      error: 'Authentication required',
    })
    expect(mocks.getBusinessInvoiceProfile).not.toHaveBeenCalled()
    expect(mocks.createProgressInvoiceSeries).not.toHaveBeenCalled()
    expect(mocks.createProgressAdjustment).not.toHaveBeenCalled()
  })

  it('delegates purpose-specific reads without exposing raw rows', async () => {
    const listInput = {
      query: 'Builder',
      statuses: ['active', 'overdue'],
      page: 2,
      pageSize: 25,
      quoteId: null,
    }
    const dashboard = { items: [], page: 2, pageSize: 25, total: 0 }
    const detail = { id: SERIES_ID, version: 1 }
    const prefill = { sourceType: 'standalone', quote: null }
    mocks.listProgressInvoiceSeries.mockResolvedValue({ ok: true, data: dashboard })
    mocks.getProgressInvoiceSeries.mockResolvedValue({ ok: true, data: detail })
    mocks.getProgressInvoiceCreatePrefill.mockResolvedValue({ ok: true, data: prefill })

    expect(await listProgressInvoiceSeries(listInput)).toEqual({ ok: true, data: dashboard })
    expect(await getProgressInvoiceSeries(SERIES_ID)).toEqual({ ok: true, data: detail })
    expect(await getProgressInvoiceCreatePrefill({ standalone: true })).toEqual({ ok: true, data: prefill })
    expect(mocks.listProgressInvoiceSeries).toHaveBeenCalledWith(listInput)
    expect(mocks.getProgressInvoiceSeries).toHaveBeenCalledWith(SERIES_ID)
    expect(mocks.getProgressInvoiceCreatePrefill).toHaveBeenCalledWith({ standalone: true })
  })

  it('creates standalone and PBC-quote series and revalidates linked consumers', async () => {
    mocks.createProgressInvoiceSeries
      .mockResolvedValueOnce({ ok: true, data: { id: SERIES_ID, version: 1 } })
      .mockResolvedValueOnce({ ok: true, data: { id: SERIES_ID, version: 1 } })

    expect(await createProgressInvoiceSeries(standaloneSeriesInput)).toEqual({
      ok: true,
      data: { id: SERIES_ID, version: 1 },
    })
    expect(await createProgressInvoiceSeries({
      ...standaloneSeriesInput,
      sourceType: 'pbc_quote',
      pbcQuoteId: QUOTE_ID,
    })).toEqual({ ok: true, data: { id: SERIES_ID, version: 1 } })

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/progress-invoices')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/progress-invoices/${SERIES_ID}`)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/quotes/${QUOTE_ID}`)
  })

  it('saves the supplier profile and only revalidates invoice settings on success', async () => {
    mocks.saveBusinessInvoiceProfile.mockResolvedValue({
      ok: true,
      data: { id: SERIES_ID, version: 1 },
    })

    expect(await saveBusinessInvoiceProfile(profileInput)).toMatchObject({ ok: true })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings/invoice')
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith('/quotes/new')
  })

  it('updates editable snapshots while rejecting immutable provenance as unknown input', async () => {
    const valid = {
      seriesId: SERIES_ID,
      expectedVersion: 1,
      recipientName: 'Edited Recipient',
      correlationKey: CORRELATION_KEY,
    }
    mocks.updateProgressInvoiceSeries.mockResolvedValue({
      ok: true,
      data: { id: SERIES_ID, version: 2, quoteId: QUOTE_ID },
    })

    expect(await updateProgressInvoiceSeries(valid)).toEqual({
      ok: true,
      data: { id: SERIES_ID, version: 2 },
    })
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/progress-invoices'],
      [`/progress-invoices/${SERIES_ID}`],
      [`/quotes/${QUOTE_ID}`],
    ])
    expect(await updateProgressInvoiceSeries({ ...valid, sourceType: 'jobber_invoice' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(await updateProgressInvoiceSeries({ ...valid, pbcQuoteId: null })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
  })

  it('does not revalidate a Quote path when a standalone series update has no linked Quote', async () => {
    mocks.updateProgressInvoiceSeries.mockResolvedValue({
      ok: true,
      data: { id: SERIES_ID, version: 2, quoteId: null },
    })

    expect(await updateProgressInvoiceSeries({
      seriesId: SERIES_ID,
      expectedVersion: 1,
      recipientName: 'Standalone Recipient',
      correlationKey: CORRELATION_KEY,
    })).toEqual({ ok: true, data: { id: SERIES_ID, version: 2 } })
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/progress-invoices'],
      [`/progress-invoices/${SERIES_ID}`],
    ])
  })

  it('preserves safe service errors and stale current DTOs', async () => {
    const current = { id: SERIES_ID, version: 3, recipientName: 'Current Recipient' }
    mocks.updateProgressInvoiceSeries.mockResolvedValue({
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
      current,
    })

    expect(await updateProgressInvoiceSeries({
      seriesId: SERIES_ID,
      expectedVersion: 2,
      recipientName: 'Stale Recipient',
      correlationKey: CORRELATION_KEY,
    })).toEqual({
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
      current,
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('runs the adjustment lifecycle through focused services and revalidates the series', async () => {
    mocks.createProgressAdjustment.mockResolvedValue({
      ok: true,
      data: { id: ADJUSTMENT_ID, seriesId: SERIES_ID, version: 1, quoteId: QUOTE_ID },
    })
    mocks.updateDraftProgressAdjustment.mockResolvedValue({
      ok: true,
      data: { id: ADJUSTMENT_ID, seriesId: SERIES_ID, version: 2, quoteId: QUOTE_ID },
    })
    mocks.approveProgressAdjustment.mockResolvedValue({
      ok: true,
      data: { id: ADJUSTMENT_ID, seriesId: SERIES_ID, version: 3, quoteId: QUOTE_ID },
    })
    mocks.supersedeProgressAdjustment.mockResolvedValue({
      ok: true,
      data: {
        id: ADJUSTMENT_ID,
        replacementId: '55555555-5555-4555-8555-555555555555',
        seriesId: SERIES_ID,
        version: 4,
        quoteId: QUOTE_ID,
      },
    })

    expect(await createProgressAdjustment(createAdjustmentInput)).toEqual({
      ok: true,
      data: { id: ADJUSTMENT_ID, seriesId: SERIES_ID, version: 1 },
    })
    expect(await updateDraftProgressAdjustment({
      adjustmentId: ADJUSTMENT_ID,
      expectedVersion: 1,
      amountExGst: '125.00',
      correlationKey: CORRELATION_KEY,
    })).toEqual({ ok: true, data: { id: ADJUSTMENT_ID, seriesId: SERIES_ID, version: 2 } })
    expect(await approveProgressAdjustment({
      adjustmentId: ADJUSTMENT_ID,
      expectedVersion: 2,
      correlationKey: CORRELATION_KEY,
    })).toEqual({ ok: true, data: { id: ADJUSTMENT_ID, seriesId: SERIES_ID, version: 3 } })
    expect(await supersedeProgressAdjustment({
      adjustmentId: ADJUSTMENT_ID,
      expectedVersion: 3,
      reason: 'Correct the approved amount',
      replacement: {
        type: 'variation',
        effectiveDate: '2026-07-16',
        description: 'Corrected extra preparation',
        amountExGst: '120.00',
        gstRate: '0.10',
      },
      correlationKey: CORRELATION_KEY,
    })).toEqual({
      ok: true,
      data: {
        id: ADJUSTMENT_ID,
        replacementId: '55555555-5555-4555-8555-555555555555',
        seriesId: SERIES_ID,
        version: 4,
      },
    })

    expect(mocks.createProgressAdjustment).toHaveBeenCalledWith(createAdjustmentInput)
    expect(mocks.updateDraftProgressAdjustment).toHaveBeenCalledOnce()
    expect(mocks.approveProgressAdjustment).toHaveBeenCalledOnce()
    expect(mocks.supersedeProgressAdjustment).toHaveBeenCalledOnce()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/progress-invoices')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/progress-invoices/${SERIES_ID}`)
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(12)
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/quotes/${QUOTE_ID}`)
  })

  it('keeps adjustment revalidation scoped to Progress Invoice paths for a null Quote link', async () => {
    mocks.createProgressAdjustment.mockResolvedValue({
      ok: true,
      data: { id: ADJUSTMENT_ID, seriesId: SERIES_ID, version: 1, quoteId: null },
    })

    expect(await createProgressAdjustment(createAdjustmentInput)).toEqual({
      ok: true,
      data: { id: ADJUSTMENT_ID, seriesId: SERIES_ID, version: 1 },
    })
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/progress-invoices'],
      [`/progress-invoices/${SERIES_ID}`],
    ])
  })

  it('does not revalidate when a Credit approval requires reconciliation', async () => {
    mocks.approveProgressAdjustment.mockResolvedValue({
      ok: false,
      error: 'PROGRESS_RECONCILIATION_REQUIRED',
      code: 'RECONCILIATION_REQUIRED',
    })

    expect(await approveProgressAdjustment({
      adjustmentId: ADJUSTMENT_ID,
      expectedVersion: 1,
      correlationKey: CORRELATION_KEY,
    })).toEqual({
      ok: false,
      error: 'PROGRESS_RECONCILIATION_REQUIRED',
      code: 'RECONCILIATION_REQUIRED',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
