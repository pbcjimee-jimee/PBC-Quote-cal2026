import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestDom } from '@/tests/helpers/test-dom'
import type { AiEvalCaseRecord } from '@/lib/actions/ai-quote'

const mocks = vi.hoisted(() => ({ list: vi.fn(), propose: vi.fn(), update: vi.fn(), remove: vi.fn(), fetch: vi.fn() }))
vi.mock('@/lib/actions/ai-quote', () => ({ listEvalCases: mocks.list, proposeEvalSet: mocks.propose,
  updateEvalCaseMemo: mocks.update, removeEvalCase: mocks.remove }))
import AiEvalSection from '@/components/settings/tabs/ai-eval-section'

const metrics = { finalTotalDiffPct: '8.20', workingDaysDiffPct: '10.00', productMatchRate: '0.80', areaRecall: '1.00',
  areaPrecision: '1.00', publicLineCountDiff: 0 }
const record: AiEvalCaseRecord = { id: 'case-1', quoteId: 'quote-1', quoteLabel: '#3000 · Interior',
  memo: 'Paint walls and repair cracks.', leaks: [], lastMetrics: null }
let root: Root | null = null
let cleanup: (() => void) | undefined
let container: HTMLDivElement

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.list.mockResolvedValue({ ok: true, data: [] })
  mocks.propose.mockResolvedValue({ ok: true, data: { setLabel: 'Accuracy check', quoteIds: ['quote-1', 'quote-2'],
    quotes: [{ quoteId: 'quote-1', quoteLabel: '#3000 · Interior' }, { quoteId: 'quote-2', quoteLabel: '#3001 · Exterior' }] } })
  mocks.remove.mockResolvedValue({ ok: true, data: { id: 'case-1' } })
  mocks.update.mockResolvedValue({ ok: true, data: { id: 'case-1', memo: 'Edited notes', leaks: [] } })
})
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  cleanup?.()
  cleanup = undefined
  vi.unstubAllGlobals()
})

async function mount(hasActiveGuide = true) {
  cleanup = installTestDom().cleanup
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => root!.render(createElement(AiEvalSection, { hasActiveGuide, aiAvailability: { enabled: true } })))
}
async function open() {
  const details = container.querySelectorAll('details')[0]
  await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')) })
}
function button(label: string) {
  const element = Array.from(container.querySelectorAll('button')).find(button => button.textContent === label)
  expect(element, label).toBeDefined()
  return element!
}
async function click(label: string) {
  await act(async () => { button(label).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function response(data: unknown) { return { ok: true, json: async () => ({ ok: true, data }) } }

describe('Accuracy check section', () => {
  it('starts collapsed with three plain steps and loads only when opened', async () => {
    await mount()
    expect(container.querySelectorAll('details')[0]?.hasAttribute('open')).toBe(false)
    expect(container.querySelectorAll('summary')[0]?.textContent).toBe('Accuracy check (optional)')
    expect(mocks.list).not.toHaveBeenCalled()
    await open()
    expect(mocks.list).toHaveBeenCalledWith({ setLabel: 'Accuracy check' })
    for (const text of ['Pick sample quotes', 'Write sample notes', 'Compare']) expect(container.textContent).toContain(text)
  })

  it('explains that an active guide is needed and disables all paid controls', async () => {
    await mount(false)
    await open()
    expect(container.textContent).toContain('Approve an AI guide above')
    expect(button('Suggest 10 quotes').disabled).toBe(true)
    expect(button('Write notes with AI').disabled).toBe(true)
    expect(button('Run comparison').disabled).toBe(true)
    expect(mocks.list).not.toHaveBeenCalled()
    const markup = renderToStaticMarkup(createElement(AiEvalSection, { hasActiveGuide: true,
      aiAvailability: { enabled: false, reason: 'missing_key', message: 'AI quoting is not configured.' } }))
    expect(markup).toContain('AI quoting is not configured.')
  })

  it('suggests quotes for review before any paid call and removes an unsaved suggestion locally', async () => {
    await mount()
    await open()
    await click('Suggest 10 quotes')
    expect(container.textContent).toContain('#3000 · Interior')
    expect(container.textContent).toContain('#3001 · Exterior')
    expect(mocks.fetch).not.toHaveBeenCalled()
    await click('Remove')
    expect(container.textContent).not.toContain('#3000 · Interior')
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('confirms note cost then writes sequentially with live progress and readable leak flags', async () => {
    await mount()
    await open()
    await click('Suggest 10 quotes')
    const first = deferred<ReturnType<typeof response>>()
    const second = deferred<ReturnType<typeof response>>()
    mocks.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await click('Write notes with AI')
    expect(container.textContent).toContain('about $0.5')
    expect(mocks.fetch).not.toHaveBeenCalled()
    await click('Write notes')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Writing notes 1 of 2')
    expect(Array.from(container.querySelectorAll('p')).find(element => element.hasAttribute('aria-live'))).toBeDefined()
    await act(async () => first.resolve(response({ caseId: 'case-1', memo: 'Paint for 3 days', leaks: ['price', 'days_or_litres', 'product'] })))
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Writing notes 2 of 2')
    expect(container.textContent).toContain('Check: mentions price')
    expect(container.textContent).toContain('days or litres')
    await act(async () => second.resolve(response({ caseId: 'case-2', memo: 'Paint exterior', leaks: [] })))
    expect(container.textContent).toContain('Sample notes are ready')
    expect(mocks.fetch.mock.calls.map(call => JSON.parse(call[1].body))).toEqual([
      { setLabel: 'Accuracy check', quoteId: 'quote-1' }, { setLabel: 'Accuracy check', quoteId: 'quote-2' },
    ])
  })

  it('shows notes in a disclosure and edits them through a labelled textarea', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: [{ ...record, leaks: ['price'], lastMetrics: metrics }] })
    await mount()
    await open()
    const notes = Array.from(container.querySelectorAll('details')).find(element => element.querySelectorAll('summary')[0]?.textContent === 'Sample notes')
    expect(notes?.hasAttribute('open')).toBe(false)
    await click('Edit')
    const field = container.querySelectorAll('textarea')[0]
    expect(container.querySelectorAll('label')[0]?.getAttribute('for')).toBe(field.getAttribute('id'))
    await act(async () => { field.value = 'Edited notes'; field.dispatchEvent(new Event('input', { bubbles: true })) })
    await click('Save')
    expect(mocks.update).toHaveBeenCalledWith({ id: 'case-1', memo: 'Edited notes' })
    expect(container.textContent).toContain('Edited notes')
    expect(container.textContent).not.toContain('Check: mentions price')
    expect(container.textContent).not.toContain('Median total difference')
  })

  it('removes a persisted case without touching the quote', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: [record] })
    await mount()
    await open()
    await click('Remove')
    expect(mocks.remove).toHaveBeenCalledWith({ id: 'case-1' })
    expect(container.textContent).not.toContain('#3000')
  })

  it('confirms comparison cost, runs cases sequentially and shows percentage results and target text', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: [record, { ...record, id: 'case-2', quoteId: 'quote-2', quoteLabel: '#3001 · Exterior' }] })
    const first = deferred<ReturnType<typeof response>>()
    const second = deferred<ReturnType<typeof response>>()
    mocks.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    await mount()
    await open()
    await click('Run comparison')
    expect(container.textContent).toContain('about $2–5')
    expect(mocks.fetch).not.toHaveBeenCalled()
    await click('Start comparison')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Comparing 1 of 2')
    await act(async () => first.resolve(response({ runId: 'run-1', metrics })))
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    await act(async () => second.resolve(response({ runId: 'run-2', metrics })))
    expect(container.textContent).toContain('Median total difference 8.2%')
    expect(container.textContent).toContain('Meets target')
    expect(container.textContent).toContain('80.0%')
    const headers = Array.from(container.querySelectorAll('th'))
    expect(headers.filter(header => header.getAttribute('scope') === 'col').map(header => header.textContent))
      .toEqual(['Quote', 'Total difference %', 'Days difference %', 'Products matched %'])
    expect(headers.some(header => header.getAttribute('scope') === 'row')).toBe(true)
    expect(Array.from(container.querySelectorAll('div')).find(element => element.getAttribute('class') === 'pbc-tablewrap')).toBeDefined()
    expect(container.textContent).toContain('Sample quotes were part of the AI guide statistics, so results may look slightly better than real use.')
  })

  it('shows Below target using text rather than colour alone', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: [{ ...record, lastMetrics: { ...metrics, finalTotalDiffPct: '30.00' } }] })
    await mount()
    await open()
    expect(container.textContent).toContain('Below target')
  })

  it('cancels the current request and ignores a late response without starting another case', async () => {
    const pending = deferred<ReturnType<typeof response>>()
    mocks.fetch.mockReturnValue(pending.promise)
    await mount()
    await open()
    await click('Suggest 10 quotes')
    await click('Write notes with AI')
    await click('Write notes')
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal
    await click('Cancel')
    expect(signal.aborted).toBe(true)
    await act(async () => pending.resolve(response({ caseId: 'case-1', memo: 'LATE NOTES', leaks: [] })))
    expect(container.textContent).not.toContain('LATE NOTES')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Cancelled')
  })

  it('aborts pending comparison on unmount', async () => {
    mocks.list.mockResolvedValue({ ok: true, data: [record] })
    mocks.fetch.mockReturnValue(new Promise(() => {}))
    await mount()
    await open()
    await click('Run comparison')
    await click('Start comparison')
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal
    await act(async () => root!.unmount())
    root = null
    expect(signal.aborted).toBe(true)
  })

  it('offers friendly retry after load failure without showing server details', async () => {
    mocks.list.mockResolvedValueOnce({ ok: false, error: 'secret private@example.com' })
    await mount()
    await open()
    expect(container.textContent).not.toContain('private@example.com')
    expect(Array.from(container.querySelectorAll('p')).find(element => element.getAttribute('role') === 'alert')).toBeDefined()
    await click('Try again')
    expect(mocks.list).toHaveBeenCalledTimes(2)
  })

  it('keeps successful notes on failure and reconfirms before retrying only unfinished cases', async () => {
    mocks.fetch.mockResolvedValueOnce(response({ caseId: 'case-1', memo: 'Saved first notes', leaks: [] }))
      .mockRejectedValueOnce(new Error('private@example.com'))
    await mount()
    await open()
    await click('Suggest 10 quotes')
    await click('Write notes with AI')
    await click('Write notes')
    expect(container.textContent).toContain('Saved first notes')
    expect(container.textContent).not.toContain('private@example.com')
    mocks.fetch.mockResolvedValueOnce(response({ caseId: 'case-2', memo: 'Second notes', leaks: [] }))
    await click('Try again')
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    await click('Write notes')
    expect(mocks.fetch).toHaveBeenCalledTimes(3)
    expect(JSON.parse(mocks.fetch.mock.calls[2][1].body).quoteId).toBe('quote-2')
  })
})
