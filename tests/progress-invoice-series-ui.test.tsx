import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  listHistory: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next/navigation', () => ({ notFound: routeMocks.notFound }))
vi.mock('@/lib/actions/progress-invoice-series', () => ({
  getProgressInvoiceSeriesWorkspace: routeMocks.getWorkspace,
  listProgressInvoiceSeriesHistory: routeMocks.listHistory,
}))

import { ProgressInvoiceSeriesDetailView } from '@/components/progress-invoices/series-detail'
import type { ProgressInvoiceSeriesWorkspaceDto } from '@/lib/progress-invoices/workspace-service'
import ProgressInvoiceSeriesLoading from '@/app/(app)/progress-invoices/[seriesId]/loading'
import ProgressInvoiceSeriesPage from '@/app/(app)/progress-invoices/[seriesId]/page'

const workspace: ProgressInvoiceSeriesWorkspaceDto = {
  series: {
    id: '11111111-1111-4111-8111-111111111111', quoteId: null,
    sourceType: 'jobber_invoice', version: 3, baseContractExGst: '17220.50', gstRate: '0.10',
    recipientName: 'Alex Builder', recipientCompany: 'Timbaworx', recipientAddress: '1 Billing Street',
    recipientEmail: 'accounts@example.test', recipientPhone: '0400000000', recipientAbn: '12345678901',
    siteName: '4 Curra Close', siteAddress: '4 Curra Close, Frenchs Forest NSW 2086',
    defaultDescription: 'Progress painting works', reference: 'Stage one', status: 'active',
    acceptedNumberingBase: '2906', jobberLinkLockedAt: '2026-07-16T00:00:00+00:00',
    adjustedContractExGst: '39507.08', adjustedContractGst: '3950.71', adjustedContractIncGst: '43457.79',
    claimedExGst: '34337.92', claimedGst: '3433.79', claimedIncGst: '37771.71',
    unclaimedExGst: '5169.16', unclaimedGst: '516.92', unclaimedIncGst: '5686.08',
    cumulativePercentage: '86.916836',
  },
  summary: {
    adjustedExGst: '39507.08', adjustedGst: '3950.71', adjustedIncGst: '43457.79',
    claimedIncGst: '37771.71', receivedIncGst: '1000.00', outstandingIncGst: '36771.71',
    creditBalanceIncGst: '0.00', unclaimedIncGst: '5686.08', cumulativePercentage: '86.916836',
  },
  importedJobberObservation: {
    originalInvoiceNumber: '2875', observedInvoiceNumber: '2875', normalizedStatus: 'part_paid',
    invoiceSubtotal: '39507.08', invoiceTax: '3950.71', invoiceTotal: '43457.79', invoiceBalance: '42457.79',
    issuedDate: '2026-07-10', dueDate: '2026-07-24', receivedDate: null,
    externalUpdatedAt: '2026-07-16T03:30:00+00:00', clientName: 'Alex Builder',
    clientCompanyName: 'Timbaworx', clientEmail: 'accounts@example.test', clientPhone: '0400000000',
    billingAddress: '1 Billing Street', propertyAddress: '4 Curra Close', fetchedAt: '2026-07-16T03:31:00+00:00',
  },
  currentRevisionSet: {
    id: '22222222-2222-4222-8222-222222222222', revisionManifestHash: 'a'.repeat(64),
    currentManifestClaimCount: 1, currentClaimRevisionId: '44444444-4444-4444-8444-444444444444',
  },
  adjustments: [{
    id: '66666666-6666-4666-8666-666666666666', type: 'variation', status: 'approved',
    effectiveDate: '2026-07-12', displayOrder: 1, description: 'Extra preparation', amountExGst: '19714.68',
    gstRate: '0.10', reason: null, version: 2,
  }],
  claims: [{
    id: '33333333-3333-4333-8333-333333333333', sequence: 1, kind: 'progress', suffix: 'P01',
    taxInvoiceNumber: '2906-P01', status: 'issued', originalIssuedAt: '2026-07-12T00:00:00+00:00',
    latestRevisedAt: null, version: 1,
    currentRevision: {
      id: '44444444-4444-4444-8444-444444444444', revisionNumber: 1, state: 'issued',
      issueDate: '2026-07-12', dueDate: '2026-07-26', description: 'Progress painting works', reference: 'Stage one',
      currentClaimExGst: '17220.50', currentClaimGst: '1722.05', currentClaimIncGst: '18942.55',
      cumulativePercentage: '43.588541', remainingExGst: '22286.58', remainingGst: '2228.66',
      remainingIncGst: '24515.24', editClassification: 'clerical', taxReviewState: 'not_required',
      createdAt: '2026-07-12T00:00:00+00:00',
    },
  }],
  payments: [{
    id: '77777777-7777-4777-8777-777777777777', source: 'manual', matchedManualPaymentId: null, version: 1,
    currentRevision: {
      id: '88888888-8888-4888-8888-888888888888', revisionNumber: 1, receivedDate: '2026-07-15',
      observedAmount: '1000.00', effectiveReceiptAmount: '1000.00', paymentMethod: 'EFT', reference: 'Receipt 1',
      externalStatus: null, externalUpdatedAt: null, syncState: 'manual', status: 'active', sourceObservedAt: null,
      reason: null, createdAt: '2026-07-15T00:00:00+00:00',
    },
  }],
  readyDocuments: [{
    id: '99999999-9999-4999-8999-999999999999', claimRevisionId: '44444444-4444-4444-8444-444444444444',
    revisionSetId: null, scope: 'current_claim', format: 'pdf', templateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    templateVersion: 1, rendererVersion: 'renderer-v1', sha256: 'b'.repeat(64), pageOrWorksheetCount: 1,
    revisionManifestHash: null, generatedAt: '2026-07-12T01:00:00+00:00', createdAt: '2026-07-12T00:30:00+00:00',
    isCurrent: true,
  }],
  recentEvents: [{
    id: '55555555-5555-4555-8555-555555555555', claimId: '33333333-3333-4333-8333-333333333333',
    eventType: 'claim_issued', source: 'user', occurredAt: '2026-07-12T00:00:00+00:00',
    priorRevisionId: null, nextRevisionId: '44444444-4444-4444-8444-444444444444',
    safeFieldChanges: { reference: { before: null, after: 'Stage one' } },
  }],
  history: { nextCursor: null },
  capabilities: {
    canEditSeries: true, canEditBaseContract: false, canVoidSeriesDirectly: false,
    requiresClaimVoidWorkflow: true, canCreateClaim: true, canDownloadCurrent: true,
    canDownloadHistorical: false,
  },
}

describe('Progress Invoice series detail workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all eight accessible read-only sections with explicit GST labels', () => {
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace,
      historyResult: { ok: true, data: { events: workspace.recentEvents, nextCursor: null } },
    }))

    for (const heading of ['Summary', 'Jobber invoice observation', 'Recipient and site', 'Adjustments', 'Claims', 'Payments', 'Documents', 'History']) {
      expect(markup).toContain(`>${heading}<`)
    }
    for (const label of ['Adjusted contract Ex GST', 'Adjusted GST', 'Adjusted contract Inc GST', 'Claimed Inc GST', 'Received Inc GST', 'Outstanding Inc GST', 'Credit balance Inc GST', 'Unclaimed Inc GST']) {
      expect(markup).toContain(label)
    }
    expect(markup).toContain('Imported on 16 July 2026')
    expect(markup).not.toMatch(/>Refresh<|>Sync</)
    expect(markup).toContain('<caption>Claim timeline</caption>')
    expect(markup).toContain('<caption>Payment ledger</caption>')
    expect(markup).toContain('<caption>Ready document metadata</caption>')
    expect(markup).not.toContain('storage_path')
    expect(markup).not.toContain('bank_account')
  })

  it('renders explicit empty states and keeps a History error isolated', () => {
    const empty = {
      ...workspace,
      importedJobberObservation: null,
      currentRevisionSet: null,
      adjustments: [], claims: [], payments: [], readyDocuments: [], recentEvents: [],
      history: { nextCursor: null },
    }
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace: empty,
      historyResult: { ok: false, error: 'PROGRESS_REQUEST_FAILED' },
    }))

    for (const copy of ['No Jobber invoice was imported', 'No adjustments', 'No claims issued', 'No payments recorded', 'No ready documents', 'History could not be loaded']) {
      expect(markup).toContain(copy)
    }
    expect(markup).toContain('Adjusted contract Ex GST')
    expect(markup).toContain('Recipient and site')
  })

  it('exposes only an older-history cursor control when another page exists', () => {
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace,
      historyResult: { ok: true, data: { events: workspace.recentEvents, nextCursor: workspace.recentEvents[0]!.id } },
    }))
    expect(markup).toContain('Older history')
    expect(markup).toContain(`cursor=${workspace.recentEvents[0]!.id}`)
  })

  it('uses notFound for invalid or missing Series and keeps other failures safe', async () => {
    routeMocks.getWorkspace.mockResolvedValueOnce({ ok: false, error: 'bad', code: 'VALIDATION' })
    await expect(ProgressInvoiceSeriesPage({
      params: Promise.resolve({ seriesId: 'not-a-uuid' }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow('NEXT_NOT_FOUND')

    routeMocks.getWorkspace.mockResolvedValueOnce({ ok: true, data: null })
    await expect(ProgressInvoiceSeriesPage({
      params: Promise.resolve({ seriesId: workspace.series.id }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow('NEXT_NOT_FOUND')

    routeMocks.getWorkspace.mockResolvedValueOnce({
      ok: false,
      error: 'raw database detail must not render',
    })
    const safeMarkup = renderToStaticMarkup(await ProgressInvoiceSeriesPage({
      params: Promise.resolve({ seriesId: workspace.series.id }),
      searchParams: Promise.resolve({}),
    }))
    expect(safeMarkup).toContain('could not be loaded')
    expect(safeMarkup).not.toContain('raw database detail')
    expect(routeMocks.listHistory).not.toHaveBeenCalled()
  })

  it('renders an accessible loading state without financial placeholders', () => {
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesLoading))
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('Loading Progress Invoice series')
    expect(markup).not.toContain('$')
  })
})
