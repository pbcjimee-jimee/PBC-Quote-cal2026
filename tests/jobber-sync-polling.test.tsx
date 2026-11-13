import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncState } from '@/lib/actions/jobber-sync'
import type { JobberSyncRecovery } from '@/components/quote-detail/jobber-sync-recovery'
import { JobberSyncStatus, type JobberSyncStatusProps } from '@/components/quote-detail/jobber-sync-status'
import { installTestDom, type TestElement } from './helpers/test-dom'

const mocks = vi.hoisted(() => ({ getState: vi.fn(), retry: vi.fn(), check: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/lib/actions/jobber-sync', () => ({ getJobberSyncState: mocks.getState, checkJobberQuoteSync: mocks.check }))
vi.mock('@/lib/actions/quotes', () => ({ retryJobberQuoteSync: mocks.retry }))
vi.mock('@/components/quote-detail/jobber-sync-recovery', () => ({
  JobberSyncRecovery: ({ onReviewChange }: ComponentProps<typeof JobberSyncRecovery>) => <>
    <button onClick={() => onReviewChange?.(true)}>Open review</button>
    <button onClick={() => onReviewChange?.(false)}>Close review</button>
  </>,
}))

const activeState: SyncState = {
  operationId: 'operation-1', status: 'queued', failureCode: null,
  isCurrentVersion: true, canRetry: true, detailMessage: null,
}
const waitingText = ' Still waiting for Jobber. Use Retry sync or Check Jobber.'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolver => { resolve = resolver })
  return { promise, resolve }
}

describe('Jobber sync polling and notices', () => {
  let dom: ReturnType<typeof installTestDom>
  let root: Root | undefined
  let container: TestElement

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    dom = installTestDom()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    container = dom.document.createElement('div')
    dom.document.body.appendChild(container)
    root = createRoot(container as unknown as Element)
    mocks.getState.mockResolvedValue({ ok: true, data: activeState })
    mocks.retry.mockResolvedValue({ ok: true })
    mocks.check.mockResolvedValue({ ok: true })
  })

  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    dom.cleanup()
    vi.useRealTimers()
  })

  async function render(props: Partial<JobberSyncStatusProps> = {}) {
    await act(async () => root!.render(createElement(JobberSyncStatus, { quoteId: 'quote-1', ...props })))
  }

  async function ticks(count = 1) {
    for (let index = 0; index < count; index += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    }
  }

  async function click(label: string) {
    const button = container.querySelectorAll('button').find(button => button.textContent === label)
    expect(button).toBeDefined()
    await act(async () => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  }

  it('shows retryable detail instead of the generic message', async () => {
    const detailMessage = 'Nothing was sent to Jobber. Jobber is limiting requests right now. Retry in a minute.'
    mocks.getState.mockResolvedValue({ ok: true, data: { ...activeState, status: 'retryable', detailMessage } })
    await render()
    expect(container.textContent).toContain(detailMessage)
    expect(container.textContent).not.toContain('saved request can be retried safely')
    await ticks(2)
    expect(mocks.getState).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['quote_changed', false, 'edited after the previous sync started'],
    [null, false, 'An earlier sync is blocking this quote'],
  ])('preserves blocking message priority: %s', async (failureCode, isCurrentVersion, message) => {
    mocks.getState.mockResolvedValue({ ok: true, data: { ...activeState, failureCode, isCurrentVersion, detailMessage: 'Lower priority detail' } })
    await render()
    expect(container.textContent).toContain(message)
    expect(container.textContent).not.toContain('Lower priority detail')
  })

  it.each(['queued', 'running'] as const)('polls %s every three seconds, then refreshes exactly once on success', async status => {
    mocks.getState.mockResolvedValueOnce({ ok: true, data: { ...activeState, status } })
      .mockResolvedValue({ ok: true, data: { ...activeState, status: 'succeeded', canRetry: false } })
    await render()
    await act(async () => { await vi.advanceTimersByTimeAsync(2999) })
    expect(mocks.getState).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(mocks.getState).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('successfully synced')
    await ticks(3)
    expect(mocks.getState).toHaveBeenCalledTimes(2)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps polling when queued changes to running', async () => {
    mocks.getState.mockResolvedValueOnce({ ok: true, data: activeState })
      .mockResolvedValueOnce({ ok: true, data: { ...activeState, status: 'running', canRetry: false } })
      .mockResolvedValue({ ok: true, data: { ...activeState, status: 'succeeded', canRetry: false } })
    await render()
    await ticks(2)
    expect(mocks.getState).toHaveBeenCalledTimes(3)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it.each(['retryable', 'reconciliation_required', 'superseded'] as const)('stops without refreshing on %s', async status => {
    mocks.getState.mockResolvedValueOnce({ ok: true, data: activeState })
      .mockResolvedValue({ ok: true, data: { ...activeState, status } })
    await render()
    await ticks(3)
    expect(mocks.getState).toHaveBeenCalledTimes(2)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('does not refresh a success loaded initially', async () => {
    mocks.getState.mockResolvedValue({ ok: true, data: { ...activeState, status: 'succeeded' } })
    await render()
    await ticks()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.getState).toHaveBeenCalledTimes(1)
  })

  it('stops after 40 polls and appends the waiting notice', async () => {
    await render()
    await ticks(39)
    expect(container.textContent).not.toContain(waitingText)
    await ticks()
    expect(container.textContent).toContain(waitingText)
    await ticks(3)
    expect(mocks.getState).toHaveBeenCalledTimes(41)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { status: 'running', label: 'Check Jobber' },
    { status: 'queued', label: 'Retry sync' },
  ] as const)('starts a fresh 40-poll budget after $label while status stays $status', async ({ status, label }) => {
    const action = deferred<{ ok: true }>()
    const actionMock = status === 'running' ? mocks.check : mocks.retry
    actionMock.mockReturnValue(action.promise)
    mocks.getState.mockResolvedValue({ ok: true, data: { ...activeState, status, canRetry: status === 'queued' } })
    await render()
    await ticks(40)
    expect(mocks.getState).toHaveBeenCalledTimes(41)
    expect(container.textContent).toContain(waitingText)
    expect(vi.getTimerCount()).toBe(0)

    await click(label)
    expect(actionMock).toHaveBeenCalledWith('quote-1')
    expect(container.textContent).not.toContain(waitingText)
    await ticks(2)
    expect(mocks.getState).toHaveBeenCalledTimes(41)
    await act(async () => action.resolve({ ok: true }))
    expect(mocks.getState).toHaveBeenCalledTimes(42)
    await ticks()
    expect(mocks.getState).toHaveBeenCalledTimes(43)
    expect(container.textContent).not.toContain(waitingText)
    await ticks(38)
    expect(container.textContent).not.toContain(waitingText)
    await ticks()
    expect(container.textContent).toContain(waitingText)
    await ticks(2)
    expect(mocks.getState).toHaveBeenCalledTimes(82)
    expect(vi.getTimerCount()).toBe(0)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('skips hidden ticks without spending the polling limit', async () => {
    await render()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    await ticks(42)
    expect(mocks.getState).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain(waitingText)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await ticks(39)
    expect(container.textContent).not.toContain(waitingText)
    await ticks()
    expect(mocks.getState).toHaveBeenCalledTimes(41)
    expect(container.textContent).toContain(waitingText)
  })

  it('pauses while a component action is pending and resumes afterwards', async () => {
    const action = deferred<{ ok: true }>()
    mocks.retry.mockReturnValue(action.promise)
    await render()
    await ticks(2)
    await click('Retry sync')
    await ticks(42)
    expect(mocks.getState).toHaveBeenCalledTimes(3)
    await act(async () => action.resolve({ ok: true }))
    expect(mocks.getState).toHaveBeenCalledTimes(4)
    await ticks(39)
    expect(container.textContent).not.toContain(waitingText)
    await ticks()
    expect(container.textContent).toContain(waitingText)
  })

  it('keeps the exhausted notice when the last poll completes during a review pause', async () => {
    const lastPoll = deferred<{ ok: true; data: SyncState }>()
    await render()
    await ticks(39)
    mocks.getState.mockReturnValueOnce(lastPoll.promise)
    await ticks()
    await click('Open review')
    await act(async () => lastPoll.resolve({ ok: true, data: activeState }))
    await click('Close review')
    await ticks()
    expect(mocks.getState).toHaveBeenCalledTimes(41)
    expect(container.textContent).toContain(waitingText)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses without spending the limit while the recovery child reports an open review', async () => {
    await render()
    await ticks(2)
    await click('Open review')
    await ticks(42)
    expect(mocks.getState).toHaveBeenCalledTimes(3)
    await click('Close review')
    await ticks(37)
    expect(container.textContent).not.toContain(waitingText)
    await ticks()
    expect(mocks.getState).toHaveBeenCalledTimes(41)
    expect(container.textContent).toContain(waitingText)
  })

  it('keeps the good state on failed and rejected polls, then recovers', async () => {
    mocks.getState.mockResolvedValueOnce({ ok: true, data: activeState })
      .mockResolvedValueOnce({ ok: false, error: 'poll failed' })
      .mockRejectedValueOnce(new Error('transport failed'))
      .mockResolvedValue({ ok: true, data: { ...activeState, status: 'succeeded' } })
    await render()
    await ticks(2)
    expect(container.textContent).toContain('Queued for Jobber')
    expect(container.textContent).not.toContain('could not be checked')
    await ticks()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not overlap slow polls or apply their response after unmount', async () => {
    const poll = deferred<{ ok: true; data: SyncState }>()
    mocks.getState.mockResolvedValueOnce({ ok: true, data: activeState }).mockReturnValue(poll.promise)
    await render()
    await ticks(3)
    expect(mocks.getState).toHaveBeenCalledTimes(2)
    await act(async () => root!.unmount())
    root = undefined
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => poll.resolve({ ok: true, data: { ...activeState, status: 'succeeded' } }))
    await ticks(2)
    expect(mocks.getState).toHaveBeenCalledTimes(2)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('resets the polling limit and ignores old responses when quoteId changes', async () => {
    const oldPoll = deferred<{ ok: true; data: SyncState }>()
    await render()
    await ticks(39)
    mocks.getState.mockReturnValueOnce(oldPoll.promise)
    await ticks()
    await render({ quoteId: 'quote-2' })
    await act(async () => oldPoll.resolve({ ok: true, data: { ...activeState, status: 'succeeded' } }))
    await ticks()
    expect(mocks.getState).toHaveBeenLastCalledWith('quote-2')
    expect(container.textContent).toContain('Queued for Jobber')
    expect(container.textContent).not.toContain(waitingText)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('invalidates an in-flight poll when a manual action begins', async () => {
    const oldPoll = deferred<{ ok: true; data: SyncState }>()
    const action = deferred<{ ok: true }>()
    mocks.getState.mockResolvedValueOnce({ ok: true, data: activeState }).mockReturnValueOnce(oldPoll.promise)
    mocks.retry.mockReturnValue(action.promise)
    await render()
    await ticks()
    await click('Retry sync')
    await act(async () => oldPoll.resolve({ ok: true, data: { ...activeState, status: 'succeeded' } }))
    expect(mocks.refresh).not.toHaveBeenCalled()
    await act(async () => action.resolve({ ok: true }))
    expect(container.textContent).toContain('Queued for Jobber')
  })

  it('shows a separate warning alert even without a sync record', async () => {
    mocks.getState.mockResolvedValue({ ok: true, data: null })
    await render({ saveNotice: 'Saved but not started' })
    const alert = container.querySelectorAll('div').find(element => element.getAttribute('role') === 'alert')
    expect(alert?.textContent).toBe('Saved but not started')
    expect(alert?.getAttribute('class')).toBe('pbc-alert pbc-alert--warning')
  })

  it('hides save notices and does not load status when Jobber is disabled', async () => {
    await render({ saveNotice: 'Saved but not started', jobberEnabled: false })
    expect(container.textContent).not.toContain('Saved but not started')
    expect(mocks.getState).not.toHaveBeenCalled()
  })
})
