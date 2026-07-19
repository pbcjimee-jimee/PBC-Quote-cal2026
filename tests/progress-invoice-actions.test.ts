import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  requireAllowedUser: vi.fn(),
  revalidatePath: vi.fn(),
  getBusinessInvoiceProfile: vi.fn(),
  saveBusinessInvoiceProfile: vi.fn(),
  listProgressInvoiceSeries: vi.fn(),
  getProgressInvoiceSeries: vi.fn(),
  createManualProgressInvoiceSeries: vi.fn(),
  updateProgressInvoiceSeries: vi.fn(),
  getProgressInvoiceSeriesWorkspace: vi.fn(),
  listProgressInvoiceSeriesHistory: vi.fn(),
  createProgressAdjustment: vi.fn(),
  updateDraftProgressAdjustment: vi.fn(),
  approveProgressAdjustment: vi.fn(),
  supersedeProgressAdjustment: vi.fn(),
  createStandaloneProgressInvoiceFromJobberService: vi.fn(),
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
  createManualProgressInvoiceSeries: mocks.createManualProgressInvoiceSeries,
  updateProgressInvoiceSeries: mocks.updateProgressInvoiceSeries,
}))

vi.mock('@/lib/progress-invoices/adjustment-service', () => ({
  createProgressAdjustment: mocks.createProgressAdjustment,
  updateDraftProgressAdjustment: mocks.updateDraftProgressAdjustment,
  approveProgressAdjustment: mocks.approveProgressAdjustment,
  supersedeProgressAdjustment: mocks.supersedeProgressAdjustment,
}))

vi.mock('@/lib/progress-invoices/workspace-service', () => ({
  getProgressInvoiceSeriesWorkspace: mocks.getProgressInvoiceSeriesWorkspace,
  listProgressInvoiceSeriesHistory: mocks.listProgressInvoiceSeriesHistory,
}))

vi.mock('@/lib/progress-invoices/standalone-import-service', () => ({
  createStandaloneProgressInvoiceFromJobberService:
    mocks.createStandaloneProgressInvoiceFromJobberService,
}))

import {
  createManualProgressInvoiceSeries,
  getBusinessInvoiceProfile,
  getProgressInvoiceSeries,
  getProgressInvoiceSeriesWorkspace,
  listProgressInvoiceSeries,
  listProgressInvoiceSeriesHistory,
  saveBusinessInvoiceProfile,
  updateProgressInvoiceSeries,
} from '@/lib/actions/progress-invoice-series'
import {
  approveProgressAdjustment,
  createProgressAdjustment,
  supersedeProgressAdjustment,
  updateDraftProgressAdjustment,
} from '@/lib/actions/progress-invoice-adjustments'
import { createStandaloneProgressInvoiceFromJobber } from '@/lib/actions/progress-invoice-jobber'

const SERIES_ID = '11111111-1111-4111-8111-111111111111'
const QUOTE_ID = '22222222-2222-4222-8222-222222222222'
const ADJUSTMENT_ID = '33333333-3333-4333-8333-333333333333'
const CORRELATION_KEY = '44444444-4444-4444-8444-444444444444'

const manualSeriesInput = {
  acceptedNumberingBase: ' 2906 ',
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
}

const profileInput = {
  legalName: 'Paint Buddy & Co Pty Ltd',
  tradingName: 'Paint Buddy & Co',
  abn: '99 000 000 000',
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

const standaloneJobberInput = {
  selectedJobberInvoiceId: 'invoice-1',
  selectedJobberJobId: 'job-1',
  selectedJobberPropertyId: 'property-1',
  baseContractExGst: '17220.50',
  gstRate: '0.10' as const,
  recipientName: 'Edited Builder',
  recipientCompany: null,
  recipientAddress: 'Edited billing address',
  recipientEmail: null,
  recipientPhone: null,
  recipientAbn: null,
  siteName: 'Edited site',
  siteAddress: 'Edited site address',
  defaultDescription: 'Progress painting works',
  reference: 'Jobber 2906',
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

  it('validates workspace and history input before authorization, then delegates only when allowed', async () => {
    expect(await getProgressInvoiceSeriesWorkspace('not-a-uuid')).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(await listProgressInvoiceSeriesHistory({
      seriesId: SERIES_ID,
      cursor: null,
      limit: 51,
    })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.getProgressInvoiceSeriesWorkspace).not.toHaveBeenCalled()
    expect(mocks.listProgressInvoiceSeriesHistory).not.toHaveBeenCalled()

    mocks.getProgressInvoiceSeriesWorkspace.mockResolvedValue({ ok: true, data: null })
    mocks.listProgressInvoiceSeriesHistory.mockResolvedValue({
      ok: true,
      data: { events: [], nextCursor: null },
    })
    expect(await getProgressInvoiceSeriesWorkspace(SERIES_ID)).toEqual({ ok: true, data: null })
    expect(await listProgressInvoiceSeriesHistory({
      seriesId: SERIES_ID,
      cursor: null,
      limit: 20,
    })).toEqual({ ok: true, data: { events: [], nextCursor: null } })
    expect(mocks.getProgressInvoiceSeriesWorkspace).toHaveBeenCalledWith(SERIES_ID)
    expect(mocks.listProgressInvoiceSeriesHistory).toHaveBeenCalledWith({
      seriesId: SERIES_ID,
      cursor: null,
      limit: 20,
    })
  })

  it.each([
    ['workspace', () => getProgressInvoiceSeriesWorkspace(SERIES_ID), 'getProgressInvoiceSeriesWorkspace'],
    ['history', () => listProgressInvoiceSeriesHistory({
      seriesId: SERIES_ID,
      cursor: null,
      limit: 20,
    }), 'listProgressInvoiceSeriesHistory'],
  ] as const)('authorizes valid %s input before its service and stops on denial', async (
    _label,
    invoke,
    serviceName,
  ) => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: false, error: 'User is not allowed' })

    expect(await invoke()).toEqual({ ok: false, error: 'User is not allowed' })
    expect(mocks.requireAllowedUser).toHaveBeenCalledOnce()
    expect(mocks[serviceName]).not.toHaveBeenCalled()
    expect(mocks.getProgressInvoiceSeriesWorkspace).not.toHaveBeenCalled()
    expect(mocks.listProgressInvoiceSeriesHistory).not.toHaveBeenCalled()
  })

  it('authorizes before standalone Jobber gateway work and maps the exact success result', async () => {
    mocks.createStandaloneProgressInvoiceFromJobberService.mockResolvedValue({
      ok: true,
      data: {
        series_id: SERIES_ID,
        version: 1,
        snapshot_id: '55555555-5555-4555-8555-555555555555',
        imported_payments: 3,
      },
    })

    expect(await createStandaloneProgressInvoiceFromJobber(standaloneJobberInput)).toEqual({
      ok: true,
      data: { seriesId: SERIES_ID, version: 1, importedPayments: 3 },
    })
    expect(mocks.createStandaloneProgressInvoiceFromJobberService).toHaveBeenCalledWith(
      standaloneJobberInput,
      'actor-1',
    )
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/progress-invoices'],
      [`/progress-invoices/${SERIES_ID}`],
    ])
  })

  it('maps a duplicate standalone Jobber import current DTO without revalidation', async () => {
    mocks.createStandaloneProgressInvoiceFromJobberService.mockResolvedValue({
      ok: false,
      error: 'PROGRESS_JOBBER_ALREADY_IMPORTED',
      code: 'VALIDATION',
      current: { series_id: SERIES_ID, version: 4 },
    })

    expect(await createStandaloneProgressInvoiceFromJobber(standaloneJobberInput)).toEqual({
      ok: false,
      error: 'PROGRESS_JOBBER_ALREADY_IMPORTED',
      code: 'VALIDATION',
      current: { seriesId: SERIES_ID, version: 4 },
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects standalone Jobber input and authorization failures before delegation', async () => {
    expect(await createStandaloneProgressInvoiceFromJobber({
      ...standaloneJobberInput,
      observation: {},
    })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()

    mocks.requireAllowedUser.mockResolvedValue({ ok: false, error: 'User is not allowed' })
    expect(await createStandaloneProgressInvoiceFromJobber(standaloneJobberInput)).toEqual({
      ok: false,
      error: 'User is not allowed',
    })
    expect(mocks.createStandaloneProgressInvoiceFromJobberService).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('preserves safe standalone service failures without revalidation', async () => {
    mocks.createStandaloneProgressInvoiceFromJobberService.mockResolvedValue({
      ok: false,
      error: 'JOBBER_TEMPORARY_FAILURE',
      code: 'JOBBER_ERROR',
    })

    expect(await createStandaloneProgressInvoiceFromJobber(standaloneJobberInput)).toEqual({
      ok: false,
      error: 'JOBBER_TEMPORARY_FAILURE',
      code: 'JOBBER_ERROR',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('validates Manual create-series input before authentication', async () => {
    const result = await createManualProgressInvoiceSeries({
      ...manualSeriesInput,
      baseContractExGst: 1000,
    })

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.createManualProgressInvoiceSeries).not.toHaveBeenCalled()
  })

  it.each([
    ['recipientEmail', 'not-an-email', 'PROGRESS_EMAIL_INVALID'],
    ['recipientAbn', '1234567890', 'PROGRESS_ABN_INVALID'],
  ] as const)(
    'returns the stable Manual %s parse error before authentication',
    async (field, value, error) => {
      expect(await createManualProgressInvoiceSeries({
        ...manualSeriesInput,
        [field]: value,
      })).toEqual({ ok: false, error, code: 'VALIDATION' })
      expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
      expect(mocks.createManualProgressInvoiceSeries).not.toHaveBeenCalled()
    },
  )

  it('gives invalid Manual email precedence when email and ABN both fail parsing', async () => {
    expect(await createManualProgressInvoiceSeries({
      ...manualSeriesInput,
      recipientEmail: 'not-an-email',
      recipientAbn: '1234567890',
    })).toEqual({
      ok: false,
      error: 'PROGRESS_EMAIL_INVALID',
      code: 'VALIDATION',
    })
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.createManualProgressInvoiceSeries).not.toHaveBeenCalled()
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
    expect(await createManualProgressInvoiceSeries(manualSeriesInput)).toEqual({
      ok: false,
      error: 'Authentication required',
    })
    expect(await createProgressAdjustment(createAdjustmentInput)).toEqual({
      ok: false,
      error: 'Authentication required',
    })
    expect(mocks.getBusinessInvoiceProfile).not.toHaveBeenCalled()
    expect(mocks.createManualProgressInvoiceSeries).not.toHaveBeenCalled()
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
    mocks.listProgressInvoiceSeries.mockResolvedValue({ ok: true, data: dashboard })
    mocks.getProgressInvoiceSeries.mockResolvedValue({ ok: true, data: detail })

    expect(await listProgressInvoiceSeries(listInput)).toEqual({ ok: true, data: dashboard })
    expect(await getProgressInvoiceSeries(SERIES_ID)).toEqual({ ok: true, data: detail })
    expect(mocks.listProgressInvoiceSeries).toHaveBeenCalledWith(listInput)
    expect(mocks.getProgressInvoiceSeries).toHaveBeenCalledWith(SERIES_ID)
  })

  it('authorizes, injects server-owned Manual literals, and revalidates the dashboard', async () => {
    mocks.createManualProgressInvoiceSeries
      .mockResolvedValue({ ok: true, data: { id: SERIES_ID, version: 1 } })

    expect(await createManualProgressInvoiceSeries(manualSeriesInput)).toEqual({
      ok: true,
      data: { id: SERIES_ID, version: 1 },
    })

    expect(mocks.requireAllowedUser).toHaveBeenCalledBefore(
      mocks.createManualProgressInvoiceSeries,
    )
    expect(mocks.createManualProgressInvoiceSeries).toHaveBeenCalledWith({
      ...manualSeriesInput,
      acceptedNumberingBase: '2906',
      sourceType: 'manual',
      gstRate: '0.10',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/progress-invoices')
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/progress-invoices/${SERIES_ID}`)
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2)
  })

  it('preserves Manual RPC errors and does not revalidate failed creates', async () => {
    mocks.createManualProgressInvoiceSeries.mockResolvedValue({
      ok: false,
      error: 'PROGRESS_UNIQUE_CONFLICT',
      code: 'VALIDATION',
    })

    expect(await createManualProgressInvoiceSeries(manualSeriesInput)).toEqual({
      ok: false,
      error: 'PROGRESS_UNIQUE_CONFLICT',
      code: 'VALIDATION',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('removes the legacy Quote create and prefill Action exports', () => {
    const source = readFileSync(join(
      process.cwd(),
      'lib/actions/progress-invoice-series.ts',
    ), 'utf8')

    expect(source).not.toMatch(/export async function createProgressInvoiceSeries\b/)
    expect(source).not.toMatch(/export async function getProgressInvoiceCreatePrefill\b/)
  })

  it('saves the supplier profile and only revalidates invoice settings on success', async () => {
    mocks.saveBusinessInvoiceProfile.mockResolvedValue({
      ok: true,
      data: { id: SERIES_ID, version: 1 },
    })

    expect(await saveBusinessInvoiceProfile(profileInput)).toMatchObject({ ok: true })
    expect(mocks.saveBusinessInvoiceProfile).toHaveBeenCalledWith({
      ...profileInput,
      abn: '99000000000',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings/invoice')
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith('/quotes/new')
  })

  it('rejects an invalid supplier ABN before authorization or persistence', async () => {
    expect(await saveBusinessInvoiceProfile({
      ...profileInput,
      abn: '99000000001',
    })).toEqual({
      ok: false,
      error: 'PROGRESS_VALIDATION_FAILED',
      code: 'VALIDATION',
    })
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.saveBusinessInvoiceProfile).not.toHaveBeenCalled()
  })

  it('preserves optimistic profile conflicts without revalidation', async () => {
    mocks.saveBusinessInvoiceProfile.mockResolvedValue({
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
    })

    expect(await saveBusinessInvoiceProfile({
      ...profileInput,
      expectedVersion: 2,
    })).toEqual({
      ok: false,
      error: 'PROGRESS_VERSION_CONFLICT',
      code: 'VERSION_CONFLICT',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
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
