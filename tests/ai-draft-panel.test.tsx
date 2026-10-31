import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { AiDraftPanel } from '@/components/quote-form/ai-draft-panel'
import type { AiQuoteDraft } from '@/lib/ai-quote/types'
import { installTestDom, TestElement } from '@/tests/helpers/test-dom'

const draft: AiQuoteDraft = {
  summary: 'Repaint bedroom walls.',
  findings: [{ area: 'Bedroom', issue: 'Cracks', evidence: 'Job notes', confidence: 'medium' }],
  questions: ['Confirm the colour.'], warnings: ['Check preparation time.'],
  areas: [{ scope: 'interior', name: 'Bedroom' }],
  publicLines: [{ id: 'line-1', kind: 'line_item', name: 'Walls', description: 'Repaint', quantity: '1', productServiceId: null, priceSource: 'allocated', priceWeight: 100, catalogUnitPrice: null, taxable: true, areaName: 'Bedroom', rationale: 'Walls were requested.' }],
  workItems: [], formulaSelections: [{ scope: 'interior', selectedMin: 4, selectedMax: 1, rationale: 'Standard repaint.' }],
}
const fetchMock = vi.fn()
const onApply = vi.fn()
const onReallocate = vi.fn()
let root: Root | null = null
let cleanup: (() => void) | undefined
let container: HTMLDivElement
const props: ComponentProps<typeof AiDraftPanel> = {
  availability: { enabled: true }, hasActiveKnowledge: true, jobberContext: null,
  hasExistingPublicLines: false, appliedRunId: null, onApply, onReallocate,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: { runId: 'run-1', draft } }) })
  onApply.mockResolvedValue(undefined)
})
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  cleanup?.()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
async function mount(overrides: Partial<typeof props> = {}) {
  cleanup = installTestDom().cleanup
  container = document.createElement('div')
  root = createRoot(container)
  await act(async () => root!.render(createElement(AiDraftPanel, { ...props, ...overrides })))
}
function button(label: string) {
  const result = Array.from(container.querySelectorAll('button')).find(element => element.textContent === label)
  expect(result, label).toBeDefined()
  return result!
}
async function click(label: string) {
  await act(async () => { button(label).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}
async function notes(value = 'Repaint bedroom walls') {
  const input = container.querySelectorAll('textarea')[0]
  await act(async () => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function generate() { await notes(); await click('Create draft') }

describe('AI draft panel', () => {
  it('starts directly with the client directive without a UTF-8 BOM', () => {
    expect(readFileSync('components/quote-form/ai-draft-panel.tsx', 'utf8').startsWith("'use client'")).toBe(true)
  })
  it('keeps areas implicit and describes low/high formula picks in plain words', async () => {
    await mount(); await generate()
    expect(Array.from(container.querySelectorAll('legend')).map(legend => legend.textContent)).not.toContain('Areas')
    expect(container.textContent).toContain('Interior: low Formula 4, high Formula 1')
  })
  it('explains automatic Basic template and Total lines below the quote checklist', async () => {
    await mount(); await generate()
    const note = Array.from(container.querySelectorAll('p')).find(element => element.textContent === 'The Basic template and a Total line are added automatically.')
    expect(note?.getAttribute('class')).toContain('pbc-bodytext')
    expect(container.textContent.indexOf('Quote lines')).toBeLessThan(container.textContent.indexOf(note!.textContent))
    expect(container.textContent.indexOf(note!.textContent)).toBeLessThan(container.textContent.indexOf('Materials and labour'))
  })
  it('keeps selections independent and prevents applying an empty selection', async () => {
    const withWork: AiQuoteDraft = { ...draft, workItems: [{ id: 'work-1', product: { id: 'paint-1', name: 'Wall paint', manufacturer: null, type: null, unit: '4L', marketPrice: '80', actualPrice: '50', active: true, colorCode: null }, areaScope: 'interior', areaName: 'Bedroom', quantity: '1', workingDays: '2', labourPerDay: '1', rationale: 'Requested repaint.' }] }
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: { runId: 'run-1', draft: withWork } }) })
    await mount(); await generate()
    const checks = Array.from(container.querySelectorAll('input')).filter(input => input.getAttribute('type') === 'checkbox')
    await act(async () => { checks[1].checked = false; checks[1].dispatchEvent(new Event('change', { bubbles: true })) })
    expect(checks.map(input => input.checked)).toEqual([true, false, true])
    await act(async () => { checks[2].checked = false; checks[2].dispatchEvent(new Event('change', { bubbles: true })) })
    expect(checks.map(input => input.checked)).toEqual([true, false, false])
    await act(async () => { checks[0].checked = false; checks[0].dispatchEvent(new Event('change', { bubbles: true })) })
    expect(button('Apply to quote').disabled).toBe(true)
    expect(container.textContent).toContain('Select at least one item to apply.')
    await click('Apply to quote')
    expect(onApply).not.toHaveBeenCalled()
    await act(async () => { checks[0].checked = true; checks[0].dispatchEvent(new Event('change', { bubbles: true })) })
    expect(button('Apply to quote').disabled).toBe(false)
    expect(container.textContent).not.toContain('Select at least one item to apply.')
    await click('Apply to quote')
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ selection: { areas: new Set(['interior:Bedroom']), publicLines: new Set(['line-1']), workItems: new Set(), formulaScopes: new Set() } }))
  })
  it('explains preview and missing approved guide states', () => {
    expect(renderToStaticMarkup(createElement(AiDraftPanel, { ...props, availability: { enabled: false, reason: 'preview', message: 'AI quoting is unavailable in Preview.' } }))).toContain('AI quoting is unavailable in Preview.')
    const html = renderToStaticMarkup(createElement(AiDraftPanel, { ...props, hasActiveKnowledge: false }))
    expect(html).toContain('Approve an AI guide in Settings &gt; AI')
    expect(html).toContain('disabled=""')
  })
  it('limits notes to 8000 characters and displays the count', async () => {
    await mount(); await notes('a'.repeat(8100))
    expect(container.querySelectorAll('textarea')[0].getAttribute('placeholder')).toMatch(/^e\.g\. /)
    expect(container.querySelectorAll('textarea')[0].value.length).toBe(8000)
    expect(container.textContent).toContain('8000 / 8000')
  })
  it('posts only memo and allowed context fields', async () => {
    const jobberContext = { jobberQuoteId: '123', workType: 'Interior', customerType: 'Residential', areaSqft: 100, existingLines: [{ name: 'Walls', description: 'Paint', quantity: 1, unitPrice: 10 }], customerName: 'Private name', customerAddress: 'Private address' }
    await mount({ jobberContext }); await generate()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.memo).toBe('Repaint bedroom walls')
    expect(body.jobberContext.existingLines).toEqual(jobberContext.existingLines)
    expect(JSON.stringify(body)).not.toContain('Private')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ai/quote-draft')
  })
  it('prevents duplicate requests, shows elapsed seconds and cancels without applying late results', async () => {
    vi.useFakeTimers()
    let resolve!: (value: unknown) => void
    fetchMock.mockReturnValue(new Promise(done => { resolve = done }))
    await mount(); await generate()
    await act(async () => { vi.advanceTimersByTime(25000) })
    expect(button('Creating draft... 25s').disabled).toBe(true)
    await click('Creating draft... 25s')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await click('Cancel')
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    await act(async () => resolve({ ok: true, json: async () => ({ ok: true, data: { runId: 'late', draft } }) }))
    expect(container.textContent).not.toContain('Repaint bedroom walls.')
    expect(onApply).not.toHaveBeenCalled()
    expect(button('Create draft').disabled).toBe(false)
  })
  it('shows summary, findings, questions, warnings and selected groups with hidden rationale', async () => {
    await mount(); await generate()
    for (const text of ['Repaint bedroom walls.', 'medium confidence', 'Confirm the colour.', 'Check preparation time.', 'Quote lines', 'Materials and labour', 'Formula picks']) expect(container.textContent).toContain(text)
    const checks = Array.from(container.querySelectorAll('input')).filter(input => input.getAttribute('type') === 'checkbox')
    expect(checks.length).toBe(2)
    expect(checks.every(input => input.checked)).toBe(true)
    const toggles = Array.from(container.querySelectorAll('button')).filter(element => element.textContent === 'Why?')
    expect(toggles).toHaveLength(2)
    expect(toggles.every(toggle => toggle.getAttribute('aria-expanded') === 'false')).toBe(true)
    expect(container.textContent).not.toContain('Walls were requested.')
  })
  it('expands rationale below the item without changing its selection', async () => {
    await mount(); await generate()
    const toggle = button('Why?')
    const row = toggle.parentElement!
    expect(row.querySelectorAll('label')).toHaveLength(1)
    await act(async () => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const rationale = Array.from(container.querySelectorAll('p')).find(element => element.textContent === 'Walls were requested.')!
    expect(rationale.getAttribute('id')).toBe(toggle.getAttribute('aria-controls'))
    expect(rationale.parentElement).toBe(row.parentElement)
    expect(row.querySelectorAll('input')[0].checked).toBe(true)
    await act(async () => toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).not.toContain('Walls were requested.')
  })
  it.each([['1', '1', '1 day · 1 person'], ['1.5', '2', '1.5 days · 2 people'], ['2', '1.00', '2 days · 1.00 person']])('uses singular and plural units for %s days and %s people', async (workingDays, labourPerDay, expected) => {
    const withWork: AiQuoteDraft = { ...draft, workItems: [{ id: 'work-1', product: { id: 'paint-1', name: 'Wall paint', manufacturer: null, type: null, unit: '4L', marketPrice: '80', actualPrice: '50', active: true, colorCode: null }, areaScope: 'interior', areaName: 'Bedroom', quantity: '1', workingDays, labourPerDay, rationale: 'Requested repaint.' }] }
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: { runId: 'run-1', draft: withWork } }) })
    await mount(); await generate()
    expect(container.textContent).toContain(`Wall paint · Bedroom · Qty 1 · ${expected}`)
  })
  it('keeps the applied announcement available to screen readers without repeating visible banner text', async () => {
    await mount(); await generate(); await click('Apply to quote')
    await act(async () => root!.render(createElement(AiDraftPanel, { ...props, appliedRunId: 'run-1' })))
    const messages = Array.from(container.querySelectorAll('p')).filter(element => element.textContent === 'AI draft applied - review the lines and prices before Save & Sync.')
    expect(messages).toHaveLength(2)
    expect(messages.filter(element => element.getAttribute('class') === 'sr-only')).toHaveLength(1)
    const announcement = messages.find(element => element.getAttribute('role') === 'status')!
    expect(announcement.getAttribute('class')).toBe('sr-only')
    expect(announcement.parentElement?.getAttribute('aria-live')).toBe('polite')
  })
  it('only offers append and replace when quote lines exist and applies selected items', async () => {
    await mount({ hasExistingPublicLines: true }); await generate()
    expect(container.textContent).toContain('Add to existing lines')
    expect(container.textContent).toContain('Replace AI-editable lines')
    await click('Apply to quote')
    expect(onApply).toHaveBeenCalledWith({ runId: 'run-1', draft, selection: { areas: new Set(['interior:Bedroom']), publicLines: new Set(['line-1']), workItems: new Set(), formulaScopes: new Set(['interior']) }, mode: 'append' })
    expect(container.textContent).not.toContain('Apply to quote')
    expect(button('Create new draft')).toBeDefined()
  })
  it('shows applied banner and recalculates prices', async () => {
    await mount({ appliedRunId: 'run-1' })
    expect(container.textContent).toContain('AI draft applied - review the lines and prices before Save & Sync.')
    await click('Recalculate AI prices')
    expect(onReallocate).toHaveBeenCalledOnce()
  })
  it('focuses the results heading and announces status politely', async () => {
    const focus = vi.fn()
    const oldFocus = Reflect.get(TestElement.prototype, 'focus')
    Reflect.set(TestElement.prototype, 'focus', focus)
    try {
      await mount(); await generate()
      expect(focus).toHaveBeenCalled()
      expect(Array.from(container.querySelectorAll('div')).some(element => element.getAttribute('aria-live') === 'polite')).toBe(true)
    } finally {
      if (oldFocus) Reflect.set(TestElement.prototype, 'focus', oldFocus)
      else Reflect.deleteProperty(TestElement.prototype, 'focus')
    }
  })
  it('keeps the form unchanged on request or apply failure and offers retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('private backend error'))
    await mount(); await generate()
    expect(onApply).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('private backend error')
    await click('Try again')
    onApply.mockRejectedValueOnce(new Error('Area creation failed'))
    await click('Apply to quote')
    expect(container.textContent).toContain('Unable to apply')
    expect(button('Try again')).toBeDefined()
    expect(container.textContent).not.toContain('AI draft applied -')
  })
  it('explains the daily limit and keeps generation disabled', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ ok: false }) })
    await mount(); await generate()
    expect(container.textContent).toContain('daily limit')
    expect(button('Create draft').disabled).toBe(true)
  })
  it('shows the server limit message such as the monthly budget', async () => {
    const message = 'Monthly AI budget reached ($30.00 of $30.00). Change it in Settings > AI.'
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({ ok: false, error: message }) })
    await mount(); await generate()
    expect(container.textContent).toContain(message)
    expect(button('Create draft').disabled).toBe(true)
  })
  it('times out after five minutes and ignores a late response', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise(() => {}))
    await mount(); await generate()
    await act(async () => { vi.advanceTimersByTime(300000) })
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    expect(button('Create draft').disabled).toBe(false)
    expect(container.textContent).toContain('took too long')
  })
  it('aborts and clears timers when the panel unmounts', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise(() => {}))
    await mount(); await generate()
    await act(async () => root!.unmount())
    root = null
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
