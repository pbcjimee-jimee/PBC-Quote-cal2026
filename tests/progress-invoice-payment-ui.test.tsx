import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installTestDom, type TestElement } from '@/tests/helpers/test-dom'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  replace: vi.fn(),
  voidPayment: vi.fn(),
  reconcile: vi.fn(),
  undo: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/lib/actions/progress-invoice-payments', () => ({
  createManualProgressPayment: mocks.create,
  replaceManualProgressPayment: mocks.replace,
  voidManualProgressPayment: mocks.voidPayment,
  reconcileProgressPayment: mocks.reconcile,
  undoProgressPaymentReconciliation: mocks.undo,
}))

import { PaymentLedger } from '@/components/progress-invoices/payment-ledger'
import type { ProgressInvoicePaymentListItemDto } from '@/lib/progress-invoices/workspace-service'

const payments: ProgressInvoicePaymentListItemDto[] = [
  {
    id: '11111111-1111-4111-8111-111111111111', source: 'jobber',
    matchedManualPaymentId: '22222222-2222-4222-8222-222222222222', version: 3,
    currentRevision: {
      id: '33333333-3333-4333-8333-333333333333', revisionNumber: 2,
      receivedDate: '2026-07-20', observedAmount: '500.00', effectiveReceiptAmount: '500.00',
      paymentMethod: 'Card', reference: 'J-1', externalStatus: 'PAID', externalUpdatedAt: null,
      syncState: 'observed', status: 'active', sourceObservedAt: null, reason: null,
      createdAt: '2026-07-20T00:00:00Z',
    },
  },
  {
    id: '22222222-2222-4222-8222-222222222222', source: 'manual',
    matchedManualPaymentId: null, version: 2,
    currentRevision: {
      id: '44444444-4444-4444-8444-444444444444', revisionNumber: 2,
      receivedDate: '2026-07-20', observedAmount: '500.00', effectiveReceiptAmount: '0.00',
      paymentMethod: 'EFT', reference: 'M-1', externalStatus: null, externalUpdatedAt: null,
      syncState: 'manual', status: 'superseded', sourceObservedAt: null, reason: 'Matched',
      createdAt: '2026-07-20T00:00:00Z',
    },
  },
]

const unmatchedPayments: ProgressInvoicePaymentListItemDto[] = [
  {
    ...payments[0]!, matchedManualPaymentId: null, version: 1,
    currentRevision: { ...payments[0]!.currentRevision!, revisionNumber: 1 },
  },
  {
    ...payments[1]!, version: 1,
    currentRevision: {
      ...payments[1]!.currentRevision!, revisionNumber: 1, status: 'active',
      effectiveReceiptAmount: '500.00', reason: null,
    },
  },
]

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent.includes(text))
  if (!button) throw new Error(`Missing button ${text}`)
  return button as HTMLButtonElement
}

async function changeByLabel(container: HTMLElement, label: string, value: string): Promise<void> {
  const labelledField = Array.from(container.querySelectorAll('label')).find((candidate) => candidate.textContent.includes(label))
    ?.querySelectorAll('input')[0]
  const field = Array.from(container.querySelectorAll('input')).find((candidate) => candidate.getAttribute('aria-label') === label)
    ?? labelledField
  if (!field) throw new Error(`Missing input ${label}`)
  await act(async () => {
    ;(field as HTMLInputElement).value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submitCreate(container: HTMLElement): Promise<void> {
  const form = container.querySelectorAll('form')[0]
  if (!form) throw new Error('Missing create form')
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

async function submitFormContaining(container: HTMLElement, text: string): Promise<void> {
  const form = Array.from(container.querySelectorAll('form')).find((candidate) => candidate.textContent.includes(text))
  if (!form) throw new Error(`Missing form containing ${text}`)
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

async function click(container: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    buttonByText(container, text).dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function mount(candidatePayments: ProgressInvoicePaymentListItemDto[]) {
  const dom = installTestDom()
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => root.render(createElement(PaymentLedger, {
    payments: candidatePayments,
    seriesId: '55555555-5555-4555-8555-555555555555',
    expectedSeriesVersion: 4,
    readOnly: false,
  })))
  return {
    container: container as unknown as HTMLElement,
    cleanup: async () => {
      try { await act(async () => root.unmount()) } finally { dom.cleanup() }
    },
  }
}

describe('PaymentLedger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockResolvedValue({ ok: false, error: 'PROGRESS_REQUEST_FAILED' })
    mocks.reconcile.mockResolvedValue({ ok: true, data: {} })
  })

  it('renders source/state badges and never gives Jobber mutation controls', () => {
    const markup = renderToStaticMarkup(createElement(PaymentLedger, {
      payments,
      seriesId: '55555555-5555-4555-8555-555555555555',
      expectedSeriesVersion: 4,
      readOnly: false,
    } as never))

    expect(markup).toContain('Matched')
    expect(markup).toContain('Superseded')
    const jobberRow = markup.match(/<tr[^>]*>[\s\S]*?Jobber[\s\S]*?<\/tr>/)?.[0] ?? ''
    expect(jobberRow).not.toMatch(/Replace|Void/)
    expect(markup).toContain('Undo Match')
  })

  it('renders only read-only ledger rows for a Void Series', () => {
    const markup = renderToStaticMarkup(createElement(PaymentLedger, {
      payments,
      seriesId: '55555555-5555-4555-8555-555555555555',
      expectedSeriesVersion: 4,
      readOnly: true,
    } as never))

    expect(markup).not.toMatch(/Replace|Void payment|Confirm Match|Undo Match/)
    expect(markup).not.toMatch(/Retention/i)
  })

  it('reuses a key only for the same failed payload and rotates it for changes and post-success commands', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('60000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('60000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('60000000-0000-4000-8000-000000000003')
    const view = await mount([])
    try {
      await changeByLabel(view.container, 'Received date', '2026-07-20')
      await changeByLabel(view.container, 'Actual receipt Inc GST', '100.00')
      await changeByLabel(view.container, 'Method', 'EFT')
      await submitCreate(view.container)
      await submitCreate(view.container)
      expect(mocks.create.mock.calls[0]?.[0].correlationKey).toBe(mocks.create.mock.calls[1]?.[0].correlationKey)

      await changeByLabel(view.container, 'Actual receipt Inc GST', '101.00')
      mocks.create.mockResolvedValueOnce({ ok: true, data: {} })
      await submitCreate(view.container)
      expect(mocks.create.mock.calls[2]?.[0].correlationKey).not.toBe(mocks.create.mock.calls[1]?.[0].correlationKey)

      await submitCreate(view.container)
      expect(mocks.create.mock.calls[3]?.[0].correlationKey).not.toBe(mocks.create.mock.calls[2]?.[0].correlationKey)
      expect(randomUUID).toHaveBeenCalledTimes(3)
    } finally {
      randomUUID.mockRestore()
      await view.cleanup()
    }
  })

  it('opens an accessible side-by-side comparison before explicit matching and cancel restores focus', async () => {
    const view = await mount(unmatchedPayments)
    try {
      expect(view.container.textContent).not.toContain('Confirm Match')
      const compare = buttonByText(view.container, 'Compare') as unknown as TestElement & { focus: () => void }
      compare.focus = () => {
        ;(document as unknown as { activeElement: TestElement | null }).activeElement = compare
      }
      await click(view.container, 'Compare')

      expect(view.container.textContent).toContain('Jobber receipt details')
      expect(view.container.textContent).toContain('Manual receipt details')
      expect(view.container.textContent).toContain('Observed Inc GST')
      expect(view.container.textContent).toContain('Effective receipt Inc GST')
      expect(buttonByText(view.container, 'Confirm Match').disabled).toBe(true)

      await changeByLabel(view.container, 'Match reason', 'Verified against bank receipt')
      expect(buttonByText(view.container, 'Confirm Match').disabled).toBe(false)
      await click(view.container, 'Cancel comparison')
      expect(view.container.textContent).not.toContain('Confirm Match')
      expect(document.activeElement).toBe(compare)
      expect(mocks.reconcile).not.toHaveBeenCalled()
    } finally {
      await view.cleanup()
    }
  })

  it('matches only after the comparison form is explicitly confirmed with a reason', async () => {
    const view = await mount(unmatchedPayments)
    try {
      await click(view.container, 'Compare')
      expect(mocks.reconcile).not.toHaveBeenCalled()
      await changeByLabel(view.container, 'Match reason', 'Verified against bank receipt')
      await submitFormContaining(view.container, 'Confirm Match')

      expect(mocks.reconcile).toHaveBeenCalledWith(expect.objectContaining({
        jobberPaymentId: unmatchedPayments[0]!.id,
        manualPaymentId: unmatchedPayments[1]!.id,
        reason: 'Verified against bank receipt',
        idempotencyKey: expect.any(String),
      }))
      expect(mocks.refresh).toHaveBeenCalledTimes(1)
    } finally {
      await view.cleanup()
    }
  })
})
