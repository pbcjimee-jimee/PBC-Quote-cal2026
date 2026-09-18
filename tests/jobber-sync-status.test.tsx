import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestDom, type TestElement } from './helpers/test-dom'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  checkSync: vi.fn(),
  retrySync: vi.fn(),
}))

vi.mock('@/lib/actions/jobber-sync', () => ({
  getJobberSyncState: mocks.getState,
  checkJobberQuoteSync: mocks.checkSync,
}))

vi.mock('@/lib/actions/quotes', () => ({
  retryJobberQuoteSync: mocks.retrySync,
}))

import { JobberSyncStatus } from '@/components/quote-detail/jobber-sync-status'

const quoteId = '00000000-0000-4000-8000-000000000101'
const operationId = '00000000-0000-4000-8000-000000000701'
const uncertainState = {
  operationId,
  status: 'reconciliation_required' as const,
  failureCode: 'mutation_begun',
  isCurrentVersion: true,
  canRetry: false,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => { resolve = resolver })
  return { promise, resolve }
}

async function renderStatus(legacyFailed = false, initialQuoteId = quoteId) {
  const dom = installTestDom()
  const container = dom.document.createElement('div')
  dom.document.body.appendChild(container)
  const root = createRoot(container as unknown as Element)
  await act(async () => {
    root.render(createElement(JobberSyncStatus, { quoteId: initialQuoteId, legacyFailed }))
  })
  return {
    container,
    rerender: async (nextQuoteId: string) => {
      await act(async () => {
        root.render(createElement(JobberSyncStatus, { quoteId: nextQuoteId, legacyFailed }))
      })
    },
    cleanup: async () => {
      await act(async () => root.unmount())
      dom.cleanup()
    },
  }
}

function buttonByText(container: TestElement, text: string): TestElement | undefined {
  return container.querySelectorAll('button').find((button) => button.textContent.includes(text))
}

describe('JobberSyncStatus', () => {
  const cleanups: Array<() => Promise<void>> = []

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkSync.mockResolvedValue({ ok: true, data: { id: quoteId } })
    mocks.retrySync.mockResolvedValue({ ok: true, data: { id: quoteId } })
  })

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it('shows Retry sync for a queued current-version operation', async () => {
    mocks.getState.mockResolvedValue({
      ok: true,
      data: { operationId, status: 'queued', failureCode: null, isCurrentVersion: true, canRetry: true },
    })
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    expect(rendered.container.textContent).toContain('Queued for Jobber')
    expect(buttonByText(rendered.container, 'Retry sync')).toBeDefined()
  })

  it('shows an in-progress message and Check Jobber for a running operation', async () => {
    mocks.getState.mockResolvedValue({
      ok: true,
      data: { operationId, status: 'running', failureCode: null, isCurrentVersion: true, canRetry: false },
    })
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    expect(rendered.container.textContent).toContain('in progress')
    expect(buttonByText(rendered.container, 'Check Jobber')).toBeDefined()
    expect(rendered.container.textContent).not.toContain('Retry sync')
  })

  it('blocks resend for an uncertain operation and disables Check Jobber while pending', async () => {
    mocks.getState.mockResolvedValue({
      ok: true,
      data: uncertainState,
    })
    const pendingCheck = deferred<{ ok: true; data: { id: string } }>()
    mocks.checkSync.mockReturnValueOnce(pendingCheck.promise)
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    expect(rendered.container.textContent).toContain('resending is blocked')
    expect(rendered.container.textContent).not.toContain('Retry sync')
    const button = buttonByText(rendered.container, 'Check Jobber')
    expect(button).toBeDefined()
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(button?.disabled).toBe(true)
    pendingCheck.resolve({ ok: true, data: { id: quoteId } })
    await act(async () => { await pendingCheck.promise })
  })

  it.each([
    'Jobber could not be checked. No changes were sent. This sync remains blocked; try again or inspect it manually.',
    'Jobber does not match the recorded sync result. Nothing was resent. This sync remains blocked for manual inspection.',
    'Jobber was verified, but the local sync result could not be saved. Nothing was resent. This sync remains blocked; try again or inspect it manually.',
    'The local sync result could not be confirmed after checking Jobber. Nothing was resent. Refresh and inspect the current status before taking further action.',
    'This sync could not be confirmed safely. Nothing was resent. It remains blocked for manual inspection.',
  ])('shows the fixed reconciliation failure while keeping resend blocked: %s', async (message) => {
    mocks.getState.mockResolvedValue({ ok: true, data: uncertainState })
    mocks.checkSync.mockResolvedValueOnce({ ok: false, error: message })
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    await act(async () => {
      buttonByText(rendered.container, 'Check Jobber')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(rendered.container.textContent).toContain(message)
    expect(rendered.container.textContent).not.toContain('Retry sync')
    expect(buttonByText(rendered.container, 'Check Jobber')).toBeDefined()
  })

  it('does not carry or revive a failed-action warning across A to B to A quote scopes', async () => {
    const nextQuoteId = '00000000-0000-4000-8000-000000000112'
    const mismatch = 'Jobber does not match the recorded sync result. Nothing was resent. This sync remains blocked for manual inspection.'
    mocks.getState.mockResolvedValue({ ok: true, data: uncertainState })
    mocks.checkSync.mockResolvedValueOnce({ ok: false, error: mismatch })
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    await act(async () => {
      buttonByText(rendered.container, 'Check Jobber')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(rendered.container.textContent).toContain(mismatch)

    mocks.getState.mockResolvedValueOnce({
      ok: true,
      data: { operationId, status: 'succeeded', failureCode: null, isCurrentVersion: true, canRetry: false },
    })
    await rendered.rerender(nextQuoteId)

    expect(rendered.container.textContent).toContain('successfully synced')
    expect(rendered.container.textContent).not.toContain(mismatch)
    expect(rendered.container.textContent).not.toContain('requested action could not be completed')

    mocks.getState.mockResolvedValueOnce({
      ok: true,
      data: { operationId, status: 'succeeded', failureCode: null, isCurrentVersion: true, canRetry: false },
    })
    await rendered.rerender(quoteId)

    expect(rendered.container.textContent).toContain('successfully synced')
    expect(rendered.container.textContent).not.toContain(mismatch)
    expect(rendered.container.textContent).not.toContain('requested action could not be completed')
  })

  it('fails closed when status lookup fails', async () => {
    mocks.getState.mockResolvedValue({ ok: false, error: 'Safe generic failure' })
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    expect(rendered.container.textContent).toContain('could not be checked')
    expect(rendered.container.textContent).not.toContain('Retry sync')
    expect(rendered.container.textContent).not.toContain('Check Jobber')
  })

  it('fails closed when the status action transport rejects', async () => {
    mocks.getState.mockRejectedValue(new Error('network unavailable'))
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    expect(rendered.container.textContent).toContain('could not be checked')
    expect(rendered.container.textContent).not.toContain('Retry sync')
    expect(rendered.container.textContent).not.toContain('network unavailable')
  })

  it('removes stale retry authority when an action transport rejects', async () => {
    mocks.getState.mockResolvedValueOnce({
      ok: true,
      data: { operationId, status: 'retryable', failureCode: null, isCurrentVersion: true, canRetry: true },
    })
    mocks.retrySync.mockRejectedValueOnce(new Error('transport failed'))
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    const retry = buttonByText(rendered.container, 'Retry sync')
    expect(retry).toBeDefined()
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(rendered.container.textContent).toContain('could not be checked')
    expect(rendered.container.textContent).not.toContain('Retry sync')
    expect(rendered.container.textContent).not.toContain('transport failed')
  })

  it('removes stale retry authority when the post-action reload rejects', async () => {
    mocks.getState
      .mockResolvedValueOnce({
        ok: true,
        data: { operationId, status: 'retryable', failureCode: null, isCurrentVersion: true, canRetry: true },
      })
      .mockRejectedValueOnce(new Error('reload failed'))
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    const retry = buttonByText(rendered.container, 'Retry sync')
    expect(retry).toBeDefined()
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(rendered.container.textContent).toContain('could not be checked')
    expect(rendered.container.textContent).not.toContain('Retry sync')
    expect(rendered.container.textContent).not.toContain('reload failed')
  })

  it('ignores a pending lookup response after quoteId changes', async () => {
    const firstQuoteId = '00000000-0000-4000-8000-000000000111'
    const secondQuoteId = '00000000-0000-4000-8000-000000000112'
    const firstLookup = deferred<{
      ok: true
      data: { operationId: string; status: 'queued'; failureCode: null; isCurrentVersion: true; canRetry: true }
    }>()
    mocks.getState
      .mockReturnValueOnce(firstLookup.promise)
      .mockResolvedValueOnce({ ok: true, data: null })
    const rendered = await renderStatus(false, firstQuoteId)
    cleanups.push(rendered.cleanup)

    await rendered.rerender(secondQuoteId)
    firstLookup.resolve({
      ok: true,
      data: { operationId, status: 'queued', failureCode: null, isCurrentVersion: true, canRetry: true },
    })
    await act(async () => { await firstLookup.promise })

    expect(mocks.getState).toHaveBeenNthCalledWith(1, firstQuoteId)
    expect(mocks.getState).toHaveBeenNthCalledWith(2, secondQuoteId)
    expect(rendered.container.textContent).not.toContain('Queued for Jobber')
    expect(rendered.container.textContent).not.toContain('Retry sync')
  })

  it('keeps a legacy failed quote without a journal blocked and never fabricates an operation', async () => {
    mocks.getState.mockResolvedValue({ ok: true, data: null })
    const rendered = await renderStatus(true)
    cleanups.push(rendered.cleanup)

    expect(rendered.container.textContent).toContain('no durable sync record')
    expect(rendered.container.textContent).not.toContain('Retry sync')
    expect(mocks.checkSync).not.toHaveBeenCalled()
  })

  it('identifies another quote operation as a blocking predecessor', async () => {
    mocks.getState.mockResolvedValue({
      ok: true,
      data: { operationId, status: 'reconciliation_required', failureCode: 'lease_expired', isCurrentVersion: false, canRetry: false },
    })
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    expect(rendered.container.textContent).toContain('earlier sync is blocking this quote')
    expect(rendered.container.textContent).not.toContain('successfully synced')
    expect(rendered.container.textContent).not.toContain('Retry sync')
  })

  it('explains a priced/text kind mismatch without exposing API details', async () => {
    mocks.getState.mockResolvedValue({
      ok: true,
      data: { operationId, status: 'retryable', failureCode: 'line_kind_mismatch', isCurrentVersion: true, canRetry: true },
    })
    const rendered = await renderStatus()
    cleanups.push(rendered.cleanup)

    expect(rendered.container.textContent).toContain('Nothing was sent to Jobber')
    expect(rendered.container.textContent).toContain('align the priced/text types')
    expect(buttonByText(rendered.container, 'Retry sync')).toBeDefined()
  })
})
