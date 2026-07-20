import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installTestDom } from '@/tests/helpers/test-dom'

const mocks = vi.hoisted(() => ({
  create: vi.fn(), save: vi.fn(), refresh: vi.fn(), replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }) }))
vi.mock('@/lib/actions/progress-invoice-claims', () => ({
  createProgressClaimDraft: mocks.create,
  saveProgressClaimDraft: mocks.save,
}))

import { ClaimEditor, progressClaimEditorKey } from '@/components/progress-invoices/claim-editor'
import type { ProgressClaimEditorDto } from '@/lib/progress-invoices/claim-service'

const editor = {
  seriesId: '61000000-0000-4000-8000-000000000001', seriesVersion: 7,
  seriesStatus: 'active', sourceType: 'manual', acceptedNumberingBase: '900001',
  expectedCurrentRevisionSetId: null, expectedCurrentManifestHash: null,
  claimId: null, claimVersion: null, claimStatus: null, claimKind: null,
  sequence: null, suffix: null, taxInvoiceNumber: null, revisionId: null, revisionNumber: null,
  inputMode: 'cumulative_percentage', authoritativeValue: '90.000000',
  issueDate: '2026-07-20', dueDate: '2026-08-03', description: 'Progress painting works', notes: '', reference: null,
  supplier: { profileVersion: 1, legalName: 'Paint Buddy & Co Pty Ltd', tradingName: 'Paint Buddy & Co', abn: '51824753556', contractorLicence: '', address: 'Sydney', phone: '0400000000', email: 'office@example.test', bankName: 'Bank', bsb: '000-000', bankAccountName: 'PBC', bankAccountNumber: '1234', gstRate: '0.10', timezone: 'Australia/Sydney', defaultPaymentTermDays: 14 },
  recipient: { name: 'Builder', company: null, address: '1 Builder St', email: null, phone: null, abn: null },
  site: { name: 'Site', address: '2 Site St' },
  jobberEvidence: { accountId: null, invoiceId: null, originalInvoiceNumber: null, observedInvoiceNumber: null },
  baseContractExGst: '10000.00', approvedVariationsExGst: '0.00', approvedCreditsExGst: '0.00', approvedAdjustments: [], previousClaims: [],
  calculation: { adjustedContractExGst: '10000.00', adjustedContractGst: '1000.00', adjustedContractIncGst: '11000.00', previousClaimsExGst: '0.00', previousClaimsGst: '0.00', previousClaimsIncGst: '0.00', cumulativeTargetExGst: '9000.00', cumulativeTargetGst: '900.00', cumulativeTargetIncGst: '9900.00', currentClaimExGst: '9000.00', currentClaimGst: '900.00', currentClaimIncGst: '9900.00', cumulativePercentage: '90.000000', remainingExGst: '1000.00', remainingGst: '100.00', remainingIncGst: '1100.00' },
  calculationPolicyVersion: 'progress-claim-v1', financialSnapshotHash: 'a'.repeat(64),
  capabilities: { canSave: true, canIssue: false },
} satisfies ProgressClaimEditorDto

async function mount() {
  const dom = installTestDom()
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => root.render(createElement(ClaimEditor, { editor })))
  return {
    container: container as unknown as HTMLElement,
    cleanup: async () => {
      try { await act(async () => root.unmount()) } finally { dom.cleanup() }
    },
  }
}

async function submit(container: HTMLElement): Promise<void> {
  const form = container.querySelectorAll('form')[0]
  if (!form) throw new Error('Missing Claim form')
  const propsKey = Object.keys(form).find((key) => key.startsWith('__reactProps$'))
  if (!propsKey) throw new Error('Missing React form props')
  const props = (form as unknown as Record<string, unknown>)[propsKey] as {
    onSubmit?: (event: { preventDefault: () => void }) => void
  }
  await act(async () => {
    props.onSubmit?.({ preventDefault: () => undefined })
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('Claim editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockResolvedValue({ ok: false, error: 'PROGRESS_REQUEST_FAILED' })
  })

  it('renders an accessible Draft-only editor with authoritative modes and explicit GST labels', () => {
    const markup = renderToStaticMarkup(createElement(ClaimEditor, { editor }))
    expect(markup).toContain('<fieldset')
    expect(markup).toContain('Cumulative Progress (%)')
    expect(markup).toContain('This Claim Amount (Inc GST)')
    expect(markup).toContain('Adjusted Contract Ex GST')
    expect(markup).toContain('Previous Claims Inc GST')
    expect(markup).toContain('This Claim GST')
    expect(markup).toContain('Remaining Inc GST')
    expect(markup).toContain('DRAFT')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).not.toMatch(/Issue Claim|Retention|Download|PDF|Excel/i)
  })

  it('keeps only the selected authoritative input editable and preserves literal dates', () => {
    const markup = renderToStaticMarkup(createElement(ClaimEditor, { editor }))
    expect(markup).toMatch(/name="cumulativePercentage"[^>]*value="90\.000000"/)
    expect(markup).toMatch(/<input[^>]*disabled=""[^>]*name="currentClaimAmount"/)
    expect(markup).toContain('value="2026-07-20"')
    expect(markup).toContain('value="2026-08-03"')
  })

  it('changes the page remount key when a conflict reload returns fresh CAS state', () => {
    expect(progressClaimEditorKey(editor)).not.toBe(progressClaimEditorKey({
      ...editor, seriesVersion: 8, expectedCurrentManifestHash: 'b'.repeat(64),
    }))
  })

  it('switches modes exactly, reuses only identical failed retries, and reloads conflicts', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('61000000-0000-4000-8000-000000000010')
      .mockReturnValueOnce('61000000-0000-4000-8000-000000000011')
    const view = await mount()
    try {
      const inputs = Array.from(view.container.querySelectorAll('input'))
      const named = (input: Element, name: string): boolean => {
        const key = Object.keys(input).find((candidate) => candidate.startsWith('__reactProps$'))
        return key ? (input as unknown as Record<string, { name?: string }>)[key]?.name === name : false
      }
      const amountMode = inputs.filter((input) => named(input as unknown as Element, 'authoritativeMode'))[1]
      if (!amountMode) throw new Error('Missing amount mode')
      await act(async () => amountMode.dispatchEvent(new Event('change', { bubbles: true })))
      const amount = inputs.find((input) => named(input as unknown as Element, 'currentClaimAmount'))
      expect(amount?.disabled).toBe(false)
      expect(amount?.value).toBe('9900.00')

      await submit(view.container)
      await submit(view.container)
      expect(mocks.create.mock.calls[0]?.[0].correlationKey).toBe('61000000-0000-4000-8000-000000000010')
      expect(mocks.create.mock.calls[1]?.[0].correlationKey).toBe('61000000-0000-4000-8000-000000000010')

      await act(async () => {
        if (!amount) return
        amount.value = '1000.00'
        amount.dispatchEvent(new Event('input', { bubbles: true }))
      })
      mocks.create.mockResolvedValueOnce({
        ok: false, error: 'PROGRESS_VERSION_CONFLICT', code: 'VERSION_CONFLICT', current: editor,
      })
      await submit(view.container)
      expect(mocks.create.mock.calls[2]?.[0].correlationKey).toBe('61000000-0000-4000-8000-000000000011')

      const reload = Array.from(view.container.querySelectorAll('button'))
        .find((button) => button.textContent.includes('Reload latest Draft'))
      expect(reload).toBeDefined()
      await act(async () => reload?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      expect(mocks.refresh).toHaveBeenCalledOnce()
    } finally {
      randomUUID.mockRestore()
      await view.cleanup()
    }
  })
})
