import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  listHistory: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: routeMocks.notFound,
  useRouter: () => ({ refresh: vi.fn(), push: routeMocks.push }),
}))
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement('a', props, children),
}))
vi.mock('@/lib/actions/progress-invoice-series', () => ({
  getProgressInvoiceSeriesWorkspace: routeMocks.getWorkspace,
  listProgressInvoiceSeriesHistory: routeMocks.listHistory,
}))

import { ProgressInvoiceSeriesDetailView } from '@/components/progress-invoices/series-detail'
import { ClaimTimeline } from '@/components/progress-invoices/claim-timeline'
import type { ProgressInvoiceSeriesWorkspaceDto } from '@/lib/progress-invoices/workspace-service'
import ProgressInvoiceSeriesLoading from '@/app/(app)/progress-invoices/[seriesId]/loading'
import ProgressInvoiceSeriesPage from '@/app/(app)/progress-invoices/[seriesId]/page'
import { installTestDom } from '@/tests/helpers/test-dom'

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
  invoiceProfileReady: true,
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
    createdAt: '2026-07-11T22:30:00+00:00', collectedIncGst: '1000.00',
    collectedDate: null, outstandingIncGst: '17942.55',
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

  it('contains wide tables inside the Series detail grid instead of widening the page', () => {
    const css = readFileSync('app/styles/components.css', 'utf8')
    const detailRule = css.match(/\.pbc-progress-series-detail\s*\{([^}]*)\}/)?.[1]

    expect(detailRule).toBeDefined()
    expect(detailRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  })

  it('renders the lifecycle edit and Void controls with explicit GST labels', () => {
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace,
      historyResult: { ok: true, data: { events: workspace.recentEvents, nextCursor: null } },
    }))

    for (const heading of ['Summary', 'Progress Invoices', 'Jobber invoice observation', 'Recipient and site', 'Adjustments', 'Payments', 'Documents', 'History']) {
      expect(markup).toContain(`>${heading}<`)
    }
    for (const label of ['Adjusted contract Ex GST', 'Adjusted GST', 'Adjusted contract Inc GST', 'Claimed Inc GST', 'Received Inc GST', 'Outstanding Inc GST', 'Credit balance Inc GST', 'Unclaimed Inc GST']) {
      expect(markup).toContain(label)
    }
    expect(markup).toContain('Imported on 16 July 2026')
    expect(markup).not.toMatch(/>Refresh<|>Sync</)
    expect(markup).toContain('<caption>Progress Invoices</caption>')
    expect(markup).toContain('<caption>Payment ledger</caption>')
    expect(markup).toContain('<caption>Ready document metadata</caption>')
    expect(markup).not.toContain('storage_path')
    expect(markup).not.toContain('bank_account')
    expect(markup).toContain('>Availability<')
    for (const label of [
      'Series editing', 'Base contract editing', 'Direct Series Void',
      'Claim Void workflow', 'Claim creation', 'Current document metadata',
      'Historical document metadata',
    ]) expect(markup).toContain(label)
    expect(markup).toContain('Locked after a Claim exists')
    expect(markup).toContain('Ready metadata available')
    expect(markup).toContain('No historical metadata available')
    const capabilitySection = markup.match(/<section[^>]*aria-labelledby="progress-availability-heading"[\s\S]*?<\/section>/)?.[0]
    expect(capabilitySection).toBeDefined()
    expect(markup).toContain('Edit Series defaults')
    expect(markup).toContain('Base Contract Ex GST')
    expect(markup).toContain('Existing Claim and document snapshots never change')
    expect(markup).toContain('Variation or Credit')
    expect(markup).toContain('Void Series')
    expect(markup).toContain('official Claim Void workflow')
    expect(markup).not.toContain('name="acceptedNumberingBase"')
    expect(markup).not.toContain('name="sourceType"')
    expect(markup).not.toContain('name="jobberInvoiceId"')
  })

  it('renders all seven server-derived capability states without live mutation or download controls', () => {
    const unlocked = {
      ...workspace,
      capabilities: {
        canEditSeries: false,
        canEditBaseContract: true,
        canVoidSeriesDirectly: true,
        requiresClaimVoidWorkflow: false,
        canCreateClaim: false,
        canDownloadCurrent: false,
        canDownloadHistorical: true,
      },
    }
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace: unlocked,
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))
    expect(markup).toContain('Read-only for this Series')
    expect(markup).toContain('Available before the first Claim')
    expect(markup).toContain('Direct path available')
    expect(markup).toContain('Not required')
    expect(markup).toContain('Claim creation unavailable')
    expect(markup).toContain('No current metadata available')
    expect(markup).toContain('Historical metadata available')
    expect(markup).not.toContain('Download now')
  })

  it('keeps an active Claim-free Series base editable and explains reusable numbering after Void', () => {
    const claimFree = {
      ...workspace,
      currentRevisionSet: null,
      claims: [],
      capabilities: {
        ...workspace.capabilities,
        canEditSeries: true,
        canEditBaseContract: true,
        canVoidSeriesDirectly: true,
        requiresClaimVoidWorkflow: false,
      },
    }
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace: claimFree,
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))

    expect(markup).toMatch(/name="baseContractExGst"[^>]*value="17220.50"/)
    expect(markup).not.toMatch(/name="baseContractExGst"[^>]*disabled/)
    expect(markup).toContain('Claim-free numbering base becomes reusable')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('I understand this Series will be Void')
  })

  it('locks the base after a Draft Claim and warns that reservations stay permanent', () => {
    const draftOnly = {
      ...workspace,
      currentRevisionSet: null,
      claims: workspace.claims.map((claim) => ({
        ...claim,
        status: 'draft' as const,
        originalIssuedAt: null,
        currentRevision: claim.currentRevision ? { ...claim.currentRevision, state: 'draft' as const } : null,
      })),
      capabilities: {
        ...workspace.capabilities,
        canEditBaseContract: false,
        canVoidSeriesDirectly: true,
        requiresClaimVoidWorkflow: false,
      },
    }
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace: draftOnly,
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))

    expect(markup).toMatch(/<input(?=[^>]*name="baseContractExGst")(?=[^>]*disabled)[^>]*>/)
    expect(markup).toContain('Draft Claims become Void')
    expect(markup).toContain('number and numbering base remain permanently reserved')
  })

  it('places the Progress Invoices table after Summary and makes every Claim state a labelled row link', () => {
    const issuedMarkup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace,
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))
    const draftMarkup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace: {
        ...workspace,
        claims: workspace.claims.map((claim) => ({
          ...claim, status: 'draft' as const, originalIssuedAt: null,
          currentRevision: claim.currentRevision ? { ...claim.currentRevision, state: 'draft' as const } : null,
        })),
      },
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))
    expect(issuedMarkup.indexOf('>Summary<')).toBeLessThan(issuedMarkup.indexOf('>Progress Invoices<'))
    expect(issuedMarkup.indexOf('>Progress Invoices<')).toBeLessThan(issuedMarkup.indexOf('>Availability<'))
    expect(issuedMarkup).toContain('role="link"')
    expect(issuedMarkup).toContain('aria-label="Open Tax Invoice 2906-P01"')
    expect(draftMarkup).toContain('role="link"')
    for (const label of [
      'Tax Invoice number', 'Status', 'Created date', 'Issue date', 'Due date',
      'Claim price Inc GST', 'Collected Inc GST', 'Collected date',
      'Outstanding Inc GST', 'Cumulative progress',
    ]) expect(issuedMarkup).toContain(label)
    expect(issuedMarkup).toContain('$18,942.55')
    expect(issuedMarkup).toContain('$1,000.00')
    expect(issuedMarkup).toContain('$17,942.55')
  })

  it('opens a Claim detail from the whole row by mouse, Enter, or Space', async () => {
    const dom = installTestDom()
    const { createRoot } = await import('react-dom/client')
    const container = document.createElement('div')
    const root = createRoot(container)
    const href = `/progress-invoices/${workspace.series.id}/claims/${workspace.claims[0]!.id}`
    try {
      await act(async () => root.render(createElement(ClaimTimeline, {
        seriesId: workspace.series.id,
        claims: workspace.claims,
      })))
      const row = container.querySelectorAll('tr')[1]
      expect(row?.getAttribute('role')).toBe('link')
      expect(row?.getAttribute('tabindex')).toBe('0')
      expect(row?.querySelectorAll('a').length).toBe(0)

      await act(async () => row?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      const enter = new Event('keydown', { bubbles: true, cancelable: true })
      Object.defineProperty(enter, 'key', { value: 'Enter' })
      await act(async () => row?.dispatchEvent(enter))
      const space = new Event('keydown', { bubbles: true, cancelable: true })
      Object.defineProperty(space, 'key', { value: ' ' })
      await act(async () => row?.dispatchEvent(space))

      expect(routeMocks.push).toHaveBeenNthCalledWith(1, href)
      expect(routeMocks.push).toHaveBeenNthCalledWith(2, href)
      expect(routeMocks.push).toHaveBeenNthCalledWith(3, href)
      expect(enter.defaultPrevented).toBe(true)
      expect(space.defaultPrevented).toBe(true)
    } finally {
      await act(async () => root.unmount())
      dom.cleanup()
    }
  })

  it.each(['draft', 'void'] as const)('hides New Claim when a %s FINAL Claim exists', (status) => {
    const finalWorkspace = {
      ...workspace,
      capabilities: { ...workspace.capabilities, canCreateClaim: true },
      claims: workspace.claims.map((claim) => ({
        ...claim,
        kind: 'final' as const,
        suffix: 'FINAL',
        taxInvoiceNumber: '2906-FINAL',
        status,
        originalIssuedAt: status === 'draft' ? null : claim.originalIssuedAt,
        currentRevision: claim.currentRevision
          ? { ...claim.currentRevision, state: status === 'draft' ? 'draft' as const : claim.currentRevision.state }
          : null,
      })),
    }
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace: finalWorkspace,
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))

    expect(markup).not.toContain(`href="/progress-invoices/${workspace.series.id}/claims/new"`)
  })

  it('makes a Void Series entirely read-only and blocks Issued direct Void', () => {
    const voidMarkup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace: {
        ...workspace,
        series: { ...workspace.series, status: 'void' },
        capabilities: {
          ...workspace.capabilities,
          canEditSeries: false,
          canEditBaseContract: false,
          canVoidSeriesDirectly: false,
        },
      },
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))
    expect(voidMarkup).toContain('This Void Series is read-only')
    expect(voidMarkup).not.toContain('<form')
    expect(voidMarkup).not.toContain('>Void Series</button>')

    const issuedMarkup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace,
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))
    expect(issuedMarkup).toContain('Issued Claim blocks direct Series Void')
    expect(issuedMarkup).toContain('official Claim Void workflow')
    expect(issuedMarkup).not.toContain('I understand this Series will be Void')
  })

  it('keeps every read section available while linking an invalid Invoice Profile setup gate', () => {
    const profileBlocked = {
      ...workspace,
      invoiceProfileReady: false,
      capabilities: { ...workspace.capabilities, canCreateClaim: false },
    }
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace: profileBlocked,
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))

    expect(markup).toContain('Invoice Profile is missing or invalid')
    expect(markup).toContain('href="/settings/invoice"')
    for (const heading of ['Summary', 'Recipient and site', 'Progress Invoices', 'Payments', 'Documents', 'History']) {
      expect(markup).toContain(`>${heading}<`)
    }
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

    for (const copy of ['No Jobber invoice was imported', 'No adjustments', 'No Progress Invoices created', 'No payments recorded', 'No ready documents', 'History could not be loaded']) {
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
