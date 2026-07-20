import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { installTestDom } from '@/tests/helpers/test-dom'

const mocks = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), approve: vi.fn(), reject: vi.fn(), supersede: vi.fn(), refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/lib/actions/progress-invoice-adjustments', () => ({
  createProgressAdjustment: mocks.create,
  updateDraftProgressAdjustment: mocks.update,
  approveProgressAdjustment: mocks.approve,
  rejectProgressAdjustment: mocks.reject,
  supersedeProgressAdjustment: mocks.supersede,
}))

import { AdjustmentRegister } from '@/components/progress-invoices/adjustment-register'
import { ProgressInvoiceSeriesDetailView } from '@/components/progress-invoices/series-detail'
import type { ProgressInvoiceSeriesWorkspaceDto } from '@/lib/progress-invoices/workspace-service'

import { workspaceFixture } from './support/progress-invoice-workspace-fixture'

async function mount() {
  const dom = installTestDom()
  const { createRoot } = await import('react-dom/client')
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => root.render(createElement(AdjustmentRegister, {
    seriesId: '55555555-5555-4555-8555-555555555555', adjustments: [], readOnly: false,
  })))
  return {
    container: container as unknown as HTMLElement,
    cleanup: async () => {
      try { await act(async () => root.unmount()) } finally { dom.cleanup() }
    },
  }
}

async function changeByLabel(container: HTMLElement, label: string, value: string): Promise<void> {
  const field = Array.from(container.querySelectorAll('label')).find((candidate) => candidate.textContent.includes(label))
    ?.querySelectorAll('input')[0]
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

describe('Adjustment register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.create.mockResolvedValue({ ok: false, error: 'PROGRESS_REQUEST_FAILED' })
  })

  it('offers Draft lifecycle and Approved correction without Retention', () => {
    const workspace: ProgressInvoiceSeriesWorkspaceDto = {
      ...workspaceFixture,
      adjustments: [
        { id: '11111111-1111-4111-8111-111111111111', type: 'credit', status: 'draft', effectiveDate: '2026-07-20', displayOrder: 1, description: 'Allowance', amountExGst: '10.10', gstRate: '0.10', reason: null, version: 1 },
        { id: '22222222-2222-4222-8222-222222222222', type: 'variation', status: 'approved', effectiveDate: '2026-07-20', displayOrder: 2, description: 'Extra work', amountExGst: '20.20', gstRate: '0.10', reason: null, version: 2 },
      ],
    }
    const markup = renderToStaticMarkup(createElement(ProgressInvoiceSeriesDetailView, {
      workspace,
      historyResult: { ok: true, data: { events: [], nextCursor: null } },
    }))

    for (const control of ['Add adjustment', 'Edit', 'Reject', 'Approve', 'Correct']) {
      expect(markup).toContain(control)
    }
    expect(markup).toContain('Fixed GST 10%')
    expect(markup).not.toMatch(/Retention/i)
  })

  it('keeps a correlation key only for the same failed payload and rotates on change and success', async () => {
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('61000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('61000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('61000000-0000-4000-8000-000000000003')
    const view = await mount()
    try {
      await changeByLabel(view.container, 'Effective date', '2026-07-20')
      await changeByLabel(view.container, 'Amount Ex GST', '10.00')
      await changeByLabel(view.container, 'Description', 'Extra preparation')
      await submitCreate(view.container)
      await submitCreate(view.container)
      expect(mocks.create.mock.calls[0]?.[0].correlationKey).toBe(mocks.create.mock.calls[1]?.[0].correlationKey)

      await changeByLabel(view.container, 'Amount Ex GST', '11.00')
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
})
