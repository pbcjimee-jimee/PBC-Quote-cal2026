import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getEditor: vi.fn(),
  getWorkspace: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/lib/progress-invoices/claim-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/progress-invoices/claim-service')>()),
  getProgressClaimEditor: mocks.getEditor,
}))
vi.mock('@/lib/progress-invoices/workspace-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/progress-invoices/workspace-service')>()),
  getProgressInvoiceSeriesWorkspace: mocks.getWorkspace,
}))
vi.mock('@/components/progress-invoices/claim-editor', () => ({
  ClaimEditor: ({ editor }: { editor: { taxInvoiceNumber: string } }) => <div>Draft editor for {editor.taxInvoiceNumber}</div>,
}))

import ProgressClaimPage from '@/app/(app)/progress-invoices/[seriesId]/claims/[claimId]/page'
import { workspaceFixture } from '@/tests/support/progress-invoice-workspace-fixture'

const claim = {
  id: '61000000-0000-4000-8000-000000000002', sequence: 1, kind: 'progress' as const,
  suffix: 'P01', taxInvoiceNumber: '900001-P01', status: 'issued' as const,
  originalIssuedAt: '2026-07-20T00:00:00+00:00', latestRevisedAt: null, version: 2,
  createdAt: '2026-07-19T23:30:00+00:00', collectedIncGst: '50.00',
  collectedDate: null, outstandingIncGst: '60.00',
  currentRevision: {
    id: '61000000-0000-4000-8000-000000000003', revisionNumber: 1, state: 'issued' as const,
    issueDate: '2026-07-20', dueDate: '2026-08-03', description: 'Stage one', reference: null,
    currentClaimExGst: '100.00', currentClaimGst: '10.00', currentClaimIncGst: '110.00',
    cumulativePercentage: '100.000000', remainingExGst: '0.00', remainingGst: '0.00',
    remainingIncGst: '0.00', editClassification: 'financial_tax_affecting' as const,
    taxReviewState: 'not_required' as const, createdAt: '2026-07-20T00:00:00+00:00',
  },
}

describe('Progress Claim all-state detail route', () => {
  it('keeps a Draft on the editable Claim route', async () => {
    const draft = {
      ...claim,
      status: 'draft' as const,
      originalIssuedAt: null,
      collectedIncGst: null,
      collectedDate: null,
      outstandingIncGst: null,
      currentRevision: { ...claim.currentRevision, state: 'draft' as const },
    }
    mocks.getWorkspace.mockResolvedValue({
      ok: true,
      data: { ...workspaceFixture, claims: [draft] },
    })
    mocks.getEditor.mockResolvedValue({
      ok: true,
      data: { seriesId: workspaceFixture.series.id, taxInvoiceNumber: claim.taxInvoiceNumber },
    })

    const markup = renderToStaticMarkup(await ProgressClaimPage({
      params: Promise.resolve({ seriesId: workspaceFixture.series.id, claimId: claim.id }),
    }))

    expect(markup).toContain(`Draft editor for ${claim.taxInvoiceNumber}`)
    expect(markup).toContain(`href="/progress-invoices/${workspaceFixture.series.id}"`)
    expect(mocks.getEditor).toHaveBeenCalledWith({ claimId: claim.id })
  })

  it.each(['issued', 'void'] as const)('renders %s as readable detail without an unsafe mutation control', async (status) => {
    mocks.getWorkspace.mockResolvedValue({
      ok: true,
      data: { ...workspaceFixture, claims: [{ ...claim, status, collectedIncGst: status === 'void' ? null : '50.00', outstandingIncGst: status === 'void' ? null : '60.00' }] },
    })
    mocks.getEditor.mockResolvedValue({ ok: true, data: null })

    const markup = renderToStaticMarkup(await ProgressClaimPage({
      params: Promise.resolve({ seriesId: workspaceFixture.series.id, claimId: claim.id }),
    }))

    expect(markup).toContain('900001-P01')
    expect(markup).toContain(status === 'issued' ? 'Issued' : 'Void')
    expect(markup).toContain('Claim price Inc GST')
    expect(markup).toContain('Created date')
    expect(markup).toContain('coherent Revision workflow')
    expect(markup).toContain(`href="/progress-invoices/${workspaceFixture.series.id}"`)
    expect(markup).not.toMatch(/Save Draft|Delete draft|Revise now|Void now/)
  })
})
