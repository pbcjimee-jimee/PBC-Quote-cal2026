import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestDom } from '@/tests/helpers/test-dom'
import { buildKnowledgeStats } from '@/lib/ai-quote/knowledge-stats'
import type { AiKnowledgeRecord } from '@/lib/actions/ai-quote'

const mocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), activate: vi.fn(), revise: vi.fn(), fetch: vi.fn(),
  evalList: vi.fn(), evalPropose: vi.fn(), evalUpdate: vi.fn(), evalRemove: vi.fn() }))
vi.mock('@/lib/actions/ai-quote', () => ({
  listAiQuoteKnowledge: mocks.list, updateAiQuoteKnowledgeDraft: mocks.update, activateAiQuoteKnowledge: mocks.activate,
  reviseActiveAiQuoteKnowledge: mocks.revise,
  listEvalCases: mocks.evalList, proposeEvalSet: mocks.evalPropose, updateEvalCaseMemo: mocks.evalUpdate, removeEvalCase: mocks.evalRemove,
}))

vi.mock('@/lib/actions/ai-budget', () => ({
  getAiBudgetStatus: async () => ({ ok: true, data: { budgetUsd: '30.00', spentUsd: '2.87', remainingUsd: '27.13', reached: false, monthStart: '2026-10-31T13:00:00.000Z' } }),
  updateAiMonthlyBudget: vi.fn(),
}))

import AiKnowledgeTab from '@/components/settings/tabs/ai-knowledge-tab'

vi.mock('@/components/settings/tabs/onedrive-section', () => ({ default: () => createElement('section', null, 'OneDrive photos mock') }))

const id = '00000000-0000-4000-8000-000000000001'
const stats = buildKnowledgeStats([])
stats.areas['interior:bedroom'] = {
  scope: 'interior', workingDays: { n: 2, median: '1.00', p25: '0.50', p75: '1.50', lowSample: true },
  labourPerDayMedian: '1.00', topProducts: [],
}
const draft: AiKnowledgeRecord = {
  id, version: 2, status: 'draft', styleGuide: 'Short descriptions.', pricingGuide: 'Use the median.', stats,
  sourceCounts: { quotes: 2, publicLines: 5, items: 3 }, createdAt: '2026-10-30T00:00:00Z', approvedAt: null,
}
let root: Root | null = null
let cleanup: (() => void) | undefined
let container: HTMLDivElement

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.list.mockResolvedValue({ ok: true, data: [draft] })
  mocks.update.mockResolvedValue({ ok: true, data: draft })
  mocks.activate.mockResolvedValue({ ok: true, data: { id } })
  mocks.evalList.mockResolvedValue({ ok: true, data: [] })
})
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  cleanup?.()
  cleanup = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function mount(initialKnowledge: AiKnowledgeRecord[] = [], enabled = true) {
  cleanup = installTestDom().cleanup
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => root!.render(createElement(AiKnowledgeTab, { initialKnowledge, aiAvailability: enabled ? { enabled: true } : { enabled: false, reason: 'missing_key', message: 'AI is unavailable.' } })))
}
function button(label: string) {
  const result = Array.from(container.querySelectorAll('button')).find(element => element.textContent === label)
  expect(result, label).toBeDefined()
  return result!
}
function getByLabelText(text: string): HTMLTextAreaElement {
  const label = Array.from(container.querySelectorAll('label')).find(element => element.textContent === text)
  const field = Array.from(container.querySelectorAll('textarea')).find(element => element.getAttribute('id') === label?.getAttribute('for'))
  if (!field) throw new Error(`No textarea is associated with the label ${text}`)
  return field
}
async function click(label: string) {
  await act(async () => { button(label).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}
async function confirmAnalysis() {
  await click('Analyze past quotes')
  await click('Start analysis')
}
function pending<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('AI knowledge tab', () => {
  it('places OneDrive just after the monthly budget only when AI is available', async () => {
    await mount()
    expect(container.textContent).toContain('OneDrive photos mock')
    expect(container.textContent.indexOf('OneDrive photos mock')).toBeGreaterThan(container.textContent.indexOf('Monthly limit (USD)'))
    await act(async () => root!.render(createElement(AiKnowledgeTab, { initialKnowledge: [], aiAvailability: { enabled: false, reason: 'preview', message: 'Unavailable' } })))
    expect(container.textContent).not.toContain('OneDrive photos mock')
  })
  const active: AiKnowledgeRecord = { ...draft, id: '00000000-0000-4000-8000-000000000002', version: 1, status: 'active',
    styleGuide: 'Active style.', pricingGuide: 'Active pricing.' }

  it('edits the active guide, saves a new version and announces success', async () => {
    await mount([active])
    await click('Edit guide')
    expect(getByLabelText('Style guide').defaultValue).toBe(active.styleGuide)
    expect(getByLabelText('Pricing guide').defaultValue).toBe(active.pricingGuide)
    expect(getByLabelText('Style guide').getAttribute('maxLength')).toBe('40000')
    expect(container.textContent).toContain('Saving creates a new version and uses it right away.')
    await act(async () => {
      const field = getByLabelText('Style guide')
      field.value = 'Edited active style.'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const revised = { ...active, id, version: 3, styleGuide: 'Edited active style.' }
    mocks.revise.mockResolvedValue({ ok: true, data: revised })
    mocks.list.mockResolvedValue({ ok: true, data: [revised, { ...active, status: 'archived' }] })
    await click('Save and use')
    expect(mocks.revise).toHaveBeenCalledExactlyOnceWith({ id: active.id, styleGuide: 'Edited active style.', pricingGuide: active.pricingGuide })
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('textarea')).toHaveLength(0)
    expect(Array.from(container.querySelectorAll('p')).find(element => element.getAttribute('role') === 'status')?.textContent).toContain('Guide updated and in use.')
  })

  it('cancels active edits and restores the read-only guide', async () => {
    await mount([active])
    await click('Edit guide')
    await act(async () => {
      const field = getByLabelText('Style guide')
      field.value = 'Discard these edits.'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('Cancel')
    expect(container.querySelectorAll('textarea')).toHaveLength(0)
    expect(container.textContent).toContain(active.styleGuide)
    expect(container.textContent).not.toContain('Discard these edits.')
    expect(mocks.revise).not.toHaveBeenCalled()
    await click('Edit guide')
    expect(getByLabelText('Style guide').defaultValue).toBe(active.styleGuide)
  })

  it('keeps a separate draft and its unsaved edits when the active guide changes', async () => {
    await mount([draft, active])
    await act(async () => {
      const field = getByLabelText('Style guide')
      field.value = 'Unsaved draft style.'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('Edit guide')
    const fields = Array.from(container.querySelectorAll('textarea'))
    await act(async () => {
      fields[2].value = 'Revised active style.'
      fields[2].dispatchEvent(new Event('input', { bubbles: true }))
    })
    const revised = { ...active, id: '00000000-0000-4000-8000-000000000003', version: 3, styleGuide: 'Revised active style.' }
    mocks.revise.mockResolvedValue({ ok: true, data: revised })
    mocks.list.mockResolvedValue({ ok: true, data: [revised, draft, { ...active, status: 'archived' }] })
    await click('Save and use')
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
    expect(getByLabelText('Style guide').value).toBe('Unsaved draft style.')
    expect(container.textContent).toContain('Review draft')
  })

  it('disables active editing when AI is unavailable', async () => {
    await mount([active], false)
    expect(button('Edit guide').disabled).toBe(true)
  })

  it('disables other operations and invalid or unchanged active edits', async () => {
    await mount([active])
    await click('Edit guide')
    expect(button('Save and use').disabled).toBe(true)
    await act(async () => {
      const field = getByLabelText('Style guide')
      field.value = ' '
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(button('Save and use').disabled).toBe(true)
    await act(async () => {
      const field = getByLabelText('Style guide')
      field.value = 'New active style.'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const response = pending<unknown>()
    mocks.revise.mockReturnValue(response.promise)
    await click('Save and use')
    expect(button('Analyze past quotes').disabled).toBe(true)
    expect(button('Cancel').disabled).toBe(true)
    expect(getByLabelText('Style guide').disabled).toBe(true)
    await act(async () => response.resolve({ ok: false, error: 'Please try again.' }))
    expect(getByLabelText('Style guide').value).toBe('New active style.')
    expect(Array.from(container.querySelectorAll('p')).find(element => element.getAttribute('role') === 'alert')?.textContent).toContain('Please try again.')
  })

  it('places the optional collapsed accuracy check after the guide', () => {
    const markup = renderToStaticMarkup(createElement(AiKnowledgeTab, { initialKnowledge: [{ ...draft, status: 'active' }], aiAvailability: { enabled: true } }))
    expect(markup.indexOf('Accuracy check (optional)')).toBeGreaterThan(markup.indexOf('View active guide'))
    expect(markup).toMatch(/<details class="pbc-ai-eval"><summary>Accuracy check \(optional\)/)
  })

  it('resets the optional check when a guide is first approved so saved samples load on opening', async () => {
    await mount([draft])
    const section = Array.from(container.querySelectorAll('details')).find(element => element.getAttribute('class') === 'pbc-ai-eval')!
    await act(async () => { section.open = true; section.dispatchEvent(new Event('toggle')) })
    expect(mocks.evalList).not.toHaveBeenCalled()
    mocks.list.mockResolvedValue({ ok: true, data: [{ ...draft, status: 'active' }] })
    await click('Approve and use')
    const ready = Array.from(container.querySelectorAll('details')).find(element => element.getAttribute('class') === 'pbc-ai-eval')!
    expect(ready.open).not.toBe(true)
    await act(async () => { ready.open = true; ready.dispatchEvent(new Event('toggle')) })
    expect(mocks.evalList).toHaveBeenCalledWith({ setLabel: 'Accuracy check' })
  })
  it('shows the unavailable reason and disables Analyze', () => {
    const markup = renderToStaticMarkup(createElement(AiKnowledgeTab, {
      initialKnowledge: [], aiAvailability: { enabled: false, reason: 'missing_key', message: 'AI quoting is not configured.' },
    }))
    expect(markup).toContain('AI quoting is not configured.')
    expect(markup).toContain('No guide yet')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Analyze past quotes/)
  })

  it('confirms the cost and time before POSTing to the knowledge route', async () => {
    await mount()
    await click('Analyze past quotes')
    expect(mocks.fetch).not.toHaveBeenCalled()
    expect(container.textContent).toContain('about $1')
    expect(container.textContent).toContain('up to a few minutes')
    const dialog = Array.from(container.querySelectorAll('div')).find(element => element.getAttribute('role') === 'dialog')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { knowledgeId: id, version: 2, runId: 'run-1' } }) })
    await click('Start analysis')
    expect(mocks.fetch).toHaveBeenCalledWith('/api/ai/knowledge', expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }))
    expect(container.textContent).toContain('Draft ready for review')
  })

  it('shows progress and elapsed seconds, disables duplicate analysis and supports cancel', async () => {
    vi.useFakeTimers()
    const response = pending<{ ok: boolean; json: () => Promise<unknown> }>()
    mocks.fetch.mockReturnValue(response.promise)
    await mount()
    await confirmAnalysis()
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(container.textContent).toContain('3 seconds')
    expect(button('Analyzing…').disabled).toBe(true)
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal
    await click('Cancel')
    expect(signal.aborted).toBe(true)
    expect(container.textContent).toContain('Analysis cancelled')
    await act(async () => response.resolve({ ok: true, json: async () => ({ ok: true }) }))
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('aborts a pending analysis when the tab unmounts', async () => {
    mocks.fetch.mockReturnValue(new Promise(() => {}))
    await mount()
    await confirmAnalysis()
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal
    await act(async () => root!.unmount())
    root = null
    expect(signal.aborted).toBe(true)
  })

  it('renders labelled draft textareas and saves edits', async () => {
    await mount([draft])
    expect(container.textContent).toContain('Review draft')
    expect(Array.from(container.querySelectorAll('label')).map(label => label.textContent)).toEqual(['Monthly limit (USD)', 'Style guide', 'Pricing guide', 'Model'])
    expect(getByLabelText('Style guide').getAttribute('id')).toBe('ai-style-guide')
    expect(getByLabelText('Pricing guide').getAttribute('id')).toBe('ai-pricing-guide')
    const field = getByLabelText('Style guide')
    await act(async () => {
      field.value = 'Edited style'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    mocks.update.mockResolvedValue({ ok: true, data: { ...draft, styleGuide: 'Edited style' } })
    await click('Save changes')
    expect(mocks.update).toHaveBeenCalledWith({ id, styleGuide: 'Edited style', pricingGuide: draft.pricingGuide })
    expect(container.textContent).toContain('Changes saved')
  })

  it('keeps statistics collapsed and includes n and Low sample text', async () => {
    await mount([draft])
    const details = Array.from(container.querySelectorAll('details')).find(element => element.textContent.includes('Statistics used'))
    expect(details?.hasAttribute('open')).toBe(false)
    expect(Array.from(container.querySelectorAll('th')).map(cell => cell.textContent)).toContain('n')
    expect(details?.textContent).toContain('Low sample')
  })

  it('saves unsaved edits before approval and marks the returned guide Active', async () => {
    await mount([draft])
    const field = container.querySelectorAll('textarea')[1]
    await act(async () => {
      field.value = 'Updated pricing'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    mocks.update.mockResolvedValue({ ok: true, data: { ...draft, pricingGuide: 'Updated pricing' } })
    mocks.list.mockResolvedValue({ ok: true, data: [{ ...draft, status: 'active', approvedAt: '2026-10-30T10:00:00Z' }] })
    await click('Approve and use')
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ pricingGuide: 'Updated pricing' }))
    expect(mocks.activate).toHaveBeenCalledWith({ id })
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.activate.mock.invocationCallOrder[0])
    expect(container.textContent).toContain('Active guide v2')
    expect(container.textContent).toContain('approved')
  })

  it('does not approve when saving current edits fails', async () => {
    await mount([draft])
    const field = container.querySelectorAll('textarea')[0]
    await act(async () => { field.value = 'Changed'; field.dispatchEvent(new Event('input', { bubbles: true })) })
    mocks.update.mockResolvedValue({ ok: false, error: 'database error' })
    await click('Approve and use')
    expect(mocks.activate).not.toHaveBeenCalled()
    expect(container.querySelectorAll('textarea')[0].value).toBe('Changed')
    expect(button('Try again')).toBeDefined()
  })

  it('shows a friendly error and retry after a failed analysis without revealing raw errors', async () => {
    await mount()
    mocks.fetch.mockRejectedValue(new Error('secret backend error'))
    await confirmAnalysis()
    expect(container.textContent).not.toContain('secret backend error')
    await click('Try again')
    expect(container.textContent).toContain('about $1')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('retries loading a completed analysis without paying for another build', async () => {
    await mount()
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { knowledgeId: id } }) })
    mocks.list.mockRejectedValueOnce(new Error('Connection lost'))
    await confirmAnalysis()
    await click('Try again')
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
    expect(mocks.list).toHaveBeenCalledTimes(2)
    expect(container.textContent).toContain('Draft ready for review')
  })

  it('announces status updates with a polite live region', async () => {
    await mount([draft])
    const status = Array.from(container.querySelectorAll('p')).find(element => element.getAttribute('aria-live') === 'polite')
    expect(status?.textContent).toContain('Draft ready for review')
  })
})
