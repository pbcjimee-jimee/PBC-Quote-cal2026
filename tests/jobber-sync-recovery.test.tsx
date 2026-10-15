import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestDom, type TestElement } from './helpers/test-dom'
import type { SyncRecoveryPreview } from '@/lib/jobber/sync-recovery'

const mocks = vi.hoisted(() => ({ preview: vi.fn(), recover: vi.fn(), sync: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/actions/jobber-sync-recovery', () => ({
  getJobberSyncRecovery: mocks.preview,
  recoverJobberQuoteSync: mocks.recover,
}))
vi.mock('@/lib/actions/quotes', () => ({ retryJobberQuoteSync: mocks.sync }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { JobberSyncRecovery } from '@/components/quote-detail/jobber-sync-recovery'

const preview = {
  quoteId: 'quote-a', operationId: 'operation-a', expectedVersion: 6,
  remoteFingerprint: 'fingerprint-a', reason: 'quote_changed',
  deletionCandidateIds: ['remote-a', 'remote-b', 'remote-text'],
  lines: [
    { lineId: 'line-a', position: 0, kind: 'line_item', name: 'Interior', description: 'Saved edit', quantity: '1', unitPrice: '200', totalPrice: '200', taxable: true, optional: false, recommended: false, currentJobberLineItemId: null, suggestedJobberLineItemId: 'remote-a' },
    { lineId: 'line-b', position: 1, kind: 'line_item', name: 'New row', description: 'New work', quantity: '1', unitPrice: '30', totalPrice: '30', taxable: true, optional: false, recommended: false, currentJobberLineItemId: null, suggestedJobberLineItemId: null },
  ],
  remoteLines: [
    { id: 'remote-a', kind: 'line_item', name: 'Interior', description: 'Original description', quantity: 1, unitPrice: 100, totalPrice: 100, taxable: true, optional: false, recommended: false, selected: false, ownedByOperation: true },
    { id: 'remote-b', kind: 'line_item', name: 'Old row', description: 'Old work', quantity: 1, unitPrice: 50, totalPrice: 50, taxable: true, optional: false, recommended: false, selected: false, ownedByOperation: true },
    { id: 'remote-text', kind: 'text', name: 'Note', description: 'Text only', quantity: 0, unitPrice: 0, totalPrice: 0, taxable: false, optional: false, recommended: false, selected: false, ownedByOperation: true },
  ],
} satisfies SyncRecoveryPreview

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function button(container: TestElement, text: string) {
  const found = container.querySelectorAll('button').find((item) => item.textContent === text)
  if (!found) throw new Error(`Missing button: ${text}`)
  return found
}
async function click(element: TestElement) {
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}
async function acknowledge(container: TestElement) {
  const checkbox = container.querySelectorAll('input').find((item) => item.type === 'checkbox')!
  await act(async () => { checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })) })
}
async function choose(container: TestElement, index: number, value: string) {
  const select = container.querySelectorAll('select')[index]
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })
}

describe('JobberSyncRecovery', () => {
  const cleanups: Array<() => Promise<void>> = []
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.preview.mockResolvedValue({ ok: true, data: preview })
    mocks.recover.mockResolvedValue({ ok: true, data: { id: 'quote-a', version: 7 } })
    mocks.sync.mockResolvedValue({ ok: true, data: { id: 'quote-a' } })
  })
  afterEach(async () => { while (cleanups.length) await cleanups.pop()?.() })
  async function render() {
    const dom = installTestDom()
    const container = dom.document.createElement('div')
    dom.document.body.appendChild(container)
    const root = createRoot(container as unknown as Element)
    const renderQuote = async (quoteId: string, available = true) => {
      await act(async () => root.render(createElement(JobberSyncRecovery, { quoteId, available })))
    }
    await renderQuote('quote-a')
    cleanups.push(async () => { await act(async () => root.unmount()); dom.cleanup() })
    return { container, renderQuote }
  }

  it('requires review acknowledgement and offers only confirmed same-kind remote rows', async () => {
    const { container } = await render()
    await click(button(container, 'Review sync recovery'))
    expect(button(container, 'Save recovery').disabled).toBe(true)
    await click(button(container, 'Save recovery'))
    expect(mocks.recover).not.toHaveBeenCalled()
    expect(container.querySelectorAll('select')[0].textContent).not.toContain('Note')
    expect(container.textContent).toContain('Saved edit')
    expect(container.textContent).toContain('Original description')
    expect(container.textContent).toContain('Old row')
    expect(container.textContent).toContain('removed on the next sync')
    await acknowledge(container)
    expect(button(container, 'Save recovery').disabled).toBe(false)
  })

  it('resets acknowledgement on mapping changes and rejects duplicate remote selections', async () => {
    const { container } = await render()
    await click(button(container, 'Review sync recovery'))
    await acknowledge(container)
    await choose(container, 1, 'remote-a')
    expect(container.querySelectorAll('input')[0].checked).toBe(false)
    await acknowledge(container)
    expect(button(container, 'Save recovery').disabled).toBe(true)
    expect(container.textContent).toContain('only once')
    await choose(container, 1, 'remote-b')
    await acknowledge(container)
    expect(button(container, 'Save recovery').disabled).toBe(false)
  })

  it('warns about a same-name manually added Jobber row without selecting or deleting it automatically', async () => {
    mocks.preview.mockResolvedValueOnce({ ok: true, data: {
      ...preview,
      remoteLines: [...preview.remoteLines, { ...preview.remoteLines[1], id: 'manual-row', name: 'New row', ownedByOperation: false }],
    } })
    const { container } = await render()
    await click(button(container, 'Review sync recovery'))
    expect(container.textContent).toContain('Jobber already has a row with this name')
    expect(container.textContent).toContain('1 other Jobber items will be kept unless linked: New row')
    expect(container.textContent).toContain('2 unselected Jobber rows')
    await choose(container, 1, 'manual-row')
    await acknowledge(container)
    await click(button(container, 'Save recovery'))
    expect(mocks.recover.mock.calls[0][0].mappings).toEqual([
      { lineId: 'line-a', jobberLineItemId: 'remote-a' },
      { lineId: 'line-b', jobberLineItemId: 'manual-row' },
    ])
  })

  it('does not allow a confirmed local link to be omitted', async () => {
    mocks.preview.mockResolvedValueOnce({ ok: true, data: {
      ...preview,
      lines: [{ ...preview.lines[0], currentJobberLineItemId: 'remote-a', suggestedJobberLineItemId: null }],
    } })
    const { container } = await render()
    await click(button(container, 'Review sync recovery'))
    expect(container.querySelectorAll('select')[0].querySelectorAll('option')[0].disabled).toBe(true)
    await acknowledge(container)
    expect(button(container, 'Save recovery').disabled).toBe(true)
    await choose(container, 0, 'remote-a')
    await acknowledge(container)
    expect(button(container, 'Save recovery').disabled).toBe(false)
  })

  it('includes a pending deletion or hidden linked row in the removal review even when it was not owned by the old operation', async () => {
    mocks.preview.mockResolvedValueOnce({ ok: true, data: {
      ...preview,
      deletionCandidateIds: [...preview.deletionCandidateIds, 'pending-deletion'],
      remoteLines: [...preview.remoteLines, { ...preview.remoteLines[1], id: 'pending-deletion', name: 'Hidden linked row', ownedByOperation: false }],
    } })
    const { container } = await render()
    await click(button(container, 'Review sync recovery'))
    expect(container.textContent).toContain('3 unselected Jobber rows will be removed on the next sync')
    expect(container.querySelectorAll('ul')[0].textContent).toContain('Hidden linked row')
    expect(container.textContent).not.toContain('other Jobber items will be kept')
    await choose(container, 1, 'pending-deletion')
    expect(container.querySelectorAll('ul')[0].textContent).not.toContain('Hidden linked row')
    expect(container.textContent).toContain('2 unselected Jobber rows')
  })

  it('handles transport errors safely without displaying implementation errors', async () => {
    mocks.preview.mockRejectedValueOnce(new Error('private transport details'))
    const { container } = await render()
    await click(button(container, 'Review sync recovery'))
    expect(container.textContent).toContain('Recovery could not be loaded')
    expect(container.textContent).not.toContain('private transport details')
    await click(button(container, 'Reload recovery'))
    await acknowledge(container)
    mocks.recover.mockRejectedValueOnce(new Error('private save details'))
    await click(button(container, 'Save recovery'))
    expect(container.textContent).toContain('recovery result could not be confirmed')
    expect(button(container, 'Save recovery').disabled).toBe(true)
    expect(mocks.sync).not.toHaveBeenCalled()
  })

  it('disables preview controls while loading and never retries an uncertain explicit sync automatically', async () => {
    const loading = deferred<{ ok: true; data: typeof preview }>()
    mocks.preview.mockReturnValueOnce(loading.promise)
    const { container } = await render()
    await click(button(container, 'Review sync recovery'))
    expect(button(container, 'Loading recovery…').disabled).toBe(true)
    expect(button(container, 'Cancel review').disabled).toBe(true)
    loading.resolve({ ok: true, data: preview })
    await act(async () => { await loading.promise })
    await acknowledge(container)
    await click(button(container, 'Save recovery'))
    const syncing = deferred<{ ok: false; error: string }>()
    mocks.sync.mockReturnValueOnce(syncing.promise)
    await click(button(container, 'Sync saved quote'))
    expect(button(container, 'Syncing saved quote…').disabled).toBe(true)
    syncing.resolve({ ok: false, error: 'Result uncertain; check Jobber sync status.' })
    await act(async () => { await syncing.promise })
    expect(container.textContent).toContain('Result uncertain')
    expect(container.querySelectorAll('button').some((item) => item.textContent === 'Sync saved quote')).toBe(false)
    expect(mocks.sync).toHaveBeenCalledOnce()
  })

  it('fails closed on preview failure and allows a fresh read', async () => {
    mocks.preview.mockResolvedValueOnce({ ok: false, error: 'This operation belongs to another quote.' })
    const { container } = await render()
    await click(button(container, 'Review sync recovery'))
    expect(container.textContent).toContain('another quote')
    expect(container.querySelectorAll('select')).toHaveLength(0)
    expect(container.querySelectorAll('button').some((item) => item.textContent === 'Save recovery')).toBe(false)
    await click(button(container, 'Reload recovery'))
    expect(container.querySelectorAll('select')).toHaveLength(2)
    expect(button(container, 'Save recovery').disabled).toBe(true)
  })

  it('invalidates a failed save, preserves choices for inspection, and requires reload and review', async () => {
    mocks.recover.mockResolvedValueOnce({ ok: false, error: 'Quote changed. Reload recovery.' })
    const { container } = await render()
    await click(button(container, 'Review sync recovery'))
    await choose(container, 1, 'remote-b')
    await acknowledge(container)
    await click(button(container, 'Save recovery'))
    expect(container.textContent).toContain('Quote changed')
    expect(button(container, 'Save recovery').disabled).toBe(true)
    expect(container.querySelectorAll('select')[1].disabled).toBe(true)
    await click(button(container, 'Reload recovery'))
    expect(button(container, 'Save recovery').disabled).toBe(true)
    await acknowledge(container)
    await click(button(container, 'Save recovery'))
    expect(mocks.recover.mock.calls[1][0].mappings).toEqual([{ lineId: 'line-a', jobberLineItemId: 'remote-a' }])
  })

  it('disables actions while pending and never automatically syncs after recovery or refresh', async () => {
    const pending = deferred<{ ok: true; data: { id: string; version: number } }>()
    mocks.recover.mockReturnValueOnce(pending.promise)
    const { container, renderQuote } = await render()
    await click(button(container, 'Review sync recovery'))
    await acknowledge(container)
    await click(button(container, 'Save recovery'))
    expect(button(container, 'Saving recovery…').disabled).toBe(true)
    expect(container.querySelectorAll('select').every((item) => item.disabled)).toBe(true)
    pending.resolve({ ok: true, data: { id: 'quote-a', version: 7 } })
    await act(async () => { await pending.promise })
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalledOnce()
    await renderQuote('quote-a', false)
    expect(container.textContent).toContain('Your saved edits are preserved. Nothing has been sent to Jobber.')
    await click(button(container, 'Sync saved quote'))
    expect(mocks.sync).toHaveBeenCalledWith('quote-a')
  })

  it('ignores an old quote preview and a save result after changing quotes', async () => {
    const pending = deferred<{ ok: true; data: typeof preview }>()
    mocks.preview.mockReturnValueOnce(pending.promise)
    const { container, renderQuote } = await render()
    await click(button(container, 'Review sync recovery'))
    await renderQuote('quote-b')
    pending.resolve({ ok: true, data: preview })
    await act(async () => { await pending.promise })
    expect(container.querySelectorAll('select')).toHaveLength(0)
    await renderQuote('quote-a')
    await click(button(container, 'Review sync recovery'))
    await acknowledge(container)
    const saving = deferred<{ ok: true; data: { id: string; version: number } }>()
    mocks.recover.mockReturnValueOnce(saving.promise)
    await click(button(container, 'Save recovery'))
    await renderQuote('quote-b')
    saving.resolve({ ok: true, data: { id: 'quote-a', version: 7 } })
    await act(async () => { await saving.promise })
    expect(container.textContent).not.toContain('Recovery complete')
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.sync).not.toHaveBeenCalled()
  })
})
