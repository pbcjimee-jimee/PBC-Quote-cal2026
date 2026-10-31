import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { AiDraftPanel } from '@/components/quote-form/ai-draft-panel'
import type { AiQuoteDraft } from '@/lib/ai-quote/types'
import { installTestDom, TestElement } from '@/tests/helpers/test-dom'

const draft: AiQuoteDraft = {
  summary: 'Repaint bedroom walls.', photoFindings: [],
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
  availability: { enabled: true }, hasActiveKnowledge: true, jobberContext: null, photoLookup: null,
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
  it('warns against entering client addresses in draft notes', () => {
    expect(renderToStaticMarkup(createElement(AiDraftPanel, props))).toContain('Do not include client names, addresses or phone numbers.')
  })

  const photoLookup = { quoteNumber: '3000', address: '15 Kingsway' }
  const folder = { id: 'folder-1', name: 'quote 3000 - Kingsway' }
  const photoDraft: AiQuoteDraft = { ...draft,
    photoFindings: [{ area: 'Bedroom', kind: 'access', issue: 'High ceiling', suggestedTreatment: 'Use a platform', photoRefs: [7, 8], confidence: 'high' }],
    workItems: [{ id: 'work-1', product: { id: 'paint-1', name: 'Wall paint', manufacturer: null, type: null, unit: '4L', marketPrice: '80', actualPrice: '50', active: true, colorCode: null }, areaScope: 'interior', areaName: 'Bedroom', quantity: '1', workingDays: '2', labourPerDay: '1', rationale: 'Requested repaint.', photoAdjustment: { workingDays: '3', labourPerDay: '3', reason: 'High ceiling', photoRefs: [7] } }],
  }
  function response(data: unknown, status = 200) {
    return { ok: status === 200, status, json: async () => ({ ok: status === 200, data }) }
  }
  function photoResponses(overrides = {}) {
    fetchMock.mockResolvedValueOnce(response({ connected: true, selected: folder, candidates: [], photoCount: 35, ...overrides }))
      .mockResolvedValueOnce(response({ runId: 'photo-run', photoCount: 8, skippedCount: 1, findings: photoDraft.photoFindings, photoLabels: [{ ref: 7, name: 'ceiling.jpg' }, { ref: 8, name: 'platform.jpg' }] }))
      .mockResolvedValueOnce(response({ runId: 'run-1', draft: photoDraft }))
  }
  async function changeInput(label: string, checked: boolean) {
    const element = Array.from(container.querySelectorAll('label')).find(element => element.textContent.includes(label))!.querySelectorAll('input')[0]
    await act(async () => { element.checked = checked; element.dispatchEvent(new Event('change', { bubbles: true })) })
  }
  it('looks up the folder and analyzes photos before writing, then reviews and applies adjustments', async () => {
    photoResponses()
    await mount({ photoLookup })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(photoLookup)
    expect(container.textContent).toContain('Include site photos')
    expect(container.textContent).toContain('First 30 of 35 photos')
    await generate()
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/ai/photos/folders', '/api/ai/photos/analyze', '/api/ai/quote-draft'])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).folderId).toBe(folder.id)
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).photoAnalysisRunId).toBe('photo-run')
    expect(container.textContent).toContain('Found in photos')
    expect(container.textContent).toContain('Bedroom — High ceiling')
    expect(container.textContent).toContain('photo 07, 08')
    expect(Array.from(container.querySelectorAll('span')).some(element => element.getAttribute('title') === 'ceiling.jpg')).toBe(true)
    expect(container.textContent).toContain('2 → 3 days · 1 → 3 people')
    expect(container.textContent).toContain('1 photo skipped')
    await changeInput('Include photo adjustment', false)
    await click('Apply to quote')
    expect(onApply.mock.calls[0][0].selection.photoAdjustments).toEqual(new Set())
  })
  it('defaults photo adjustments on when applying', async () => {
    photoResponses(); await mount({ photoLookup }); await generate(); await click('Apply to quote')
    expect(onApply.mock.calls[0][0].selection.photoAdjustments).toEqual(new Set(['work-1']))
  })
  it.each([0, 8])('writes without analyzing when photos are empty or unchecked (%s)', async photoCount => {
    fetchMock.mockResolvedValueOnce(response({ connected: true, selected: folder, candidates: [], photoCount }))
    await mount({ photoLookup })
    if (photoCount === 0) expect(container.textContent).toContain('No photos in this folder')
    else await changeInput('Include site photos', false)
    await generate()
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/ai/photos/folders', '/api/ai/quote-draft'])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).photoAnalysisRunId).toBeUndefined()
  })
  it.each([409, 422, 429, 502])('offers a memo-only continuation after analysis failure %s', async status => {
    photoResponses()
    fetchMock.mockReset().mockResolvedValueOnce(response({ connected: true, selected: folder, candidates: [], photoCount: 8 }))
      .mockResolvedValueOnce(response(null, status)).mockResolvedValueOnce(response({ runId: 'run-1', draft }))
    await mount({ photoLookup }); await generate()
    expect(container.textContent).toContain(status === 409 ? 'Reconnect OneDrive in Settings > AI.' : "Photos couldn't be analysed.")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await click('Continue without photos')
    expect(fetchMock.mock.calls[2][0]).toBe('/api/ai/quote-draft')
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).photoAnalysisRunId).toBeUndefined()
  })
  it('selects an address candidate and can change or skip the folder', async () => {
    photoResponses({ selected: null, candidates: [{ ...folder, score: 1 }], photoCount: null })
    await mount({ photoLookup })
    expect(container.textContent).toContain('No folder found for quote 3000')
    await changeInput(folder.name, true)
    await click('Change folder')
    expect(button("Don't use photos")).toBeDefined()
    await changeInput(folder.name, true)
    await generate()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).folderId).toBe(folder.id)
  })
  it('keeps the candidate available after choosing not to use photos', async () => {
    photoResponses({ selected: null, candidates: [{ ...folder, score: 1 }], photoCount: null })
    await mount({ photoLookup }); await click("Don't use photos")
    expect(container.textContent).not.toContain('Photo folder')
    await click('Change folder')
    await changeInput(folder.name, true)
    await generate()
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).folderId).toBe(folder.id)
  })
  it.each([409, 502])('offers a photo-free continuation when folder lookup fails (%s)', async status => {
    fetchMock.mockResolvedValueOnce(response(null, status))
    await mount({ photoLookup }); await notes(); await click('Continue without photos')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/ai/quote-draft')
  })
  it('clears a pending lookup when the Jobber quote is removed', async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}))
    await mount({ photoLookup })
    await act(async () => root!.render(createElement(AiDraftPanel, props)))
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    await notes()
    expect(button('Create draft').disabled).toBe(false)
  })
  it('times out photo analysis and still offers continuation', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValueOnce(response({ connected: true, selected: folder, candidates: [], photoCount: 8 }))
      .mockReturnValueOnce(new Promise(() => {}))
    await mount({ photoLookup }); await generate()
    await act(async () => { vi.advanceTimersByTime(300000) })
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true)
    expect(button('Continue without photos').disabled).toBe(false)
  })
  it('can continue without photos if writing fails after a successful analysis', async () => {
    fetchMock.mockResolvedValueOnce(response({ connected: true, selected: folder, candidates: [], photoCount: 8 }))
      .mockResolvedValueOnce(response({ runId: 'photo-run', photoLabels: [], skippedCount: 0 }))
      .mockResolvedValueOnce(response(null, 502))
    await mount({ photoLookup }); await generate(); await click('Continue without photos')
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).photoAnalysisRunId).toBeUndefined()
    expect(fetchMock.mock.calls[3][0]).toBe('/api/ai/quote-draft')
  })
  it('shows a Settings link when OneDrive is disconnected', async () => {
    fetchMock.mockResolvedValueOnce(response({ connected: false, selected: null, candidates: [], photoCount: null }))
    await mount({ photoLookup })
    expect(container.textContent).toContain('Connect OneDrive in Settings > AI to include site photos.')
    await generate()
    expect(fetchMock.mock.calls[1][0]).toBe('/api/ai/quote-draft')
  })
  it('changes progress between stages, restarts the timer and cancels a late analysis', async () => {
    vi.useFakeTimers()
    let resolve!: (value: unknown) => void
    fetchMock.mockResolvedValueOnce(response({ connected: true, selected: folder, candidates: [], photoCount: 8 }))
      .mockReturnValueOnce(new Promise(done => { resolve = done })).mockReturnValueOnce(new Promise(() => {}))
    await mount({ photoLookup }); await generate()
    await act(async () => { vi.advanceTimersByTime(4000) })
    expect(button('Analysing photos… 4s').disabled).toBe(true)
    await act(async () => resolve(response({ runId: 'photo-run', photoLabels: [], skippedCount: 0 })))
    expect(button('Writing the quote… 0s').disabled).toBe(true)
    await click('Cancel')
    expect(fetchMock.mock.calls[2][1].signal.aborted).toBe(true)
  })
  it('cancels analysis without starting the draft on a late response', async () => {
    let resolve!: (value: unknown) => void
    fetchMock.mockResolvedValueOnce(response({ connected: true, selected: folder, candidates: [], photoCount: 8 }))
      .mockReturnValueOnce(new Promise(done => { resolve = done }))
    await mount({ photoLookup }); await generate(); await click('Cancel')
    await act(async () => resolve(response({ runId: 'photo-run' })))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
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
    const withWork: AiQuoteDraft = { ...draft, workItems: [{ id: 'work-1', product: { id: 'paint-1', name: 'Wall paint', manufacturer: null, type: null, unit: '4L', marketPrice: '80', actualPrice: '50', active: true, colorCode: null }, areaScope: 'interior', areaName: 'Bedroom', quantity: '1', workingDays: '2', labourPerDay: '1', rationale: 'Requested repaint.', photoAdjustment: null }] }
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
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ selection: { areas: new Set(['interior:Bedroom']), publicLines: new Set(['line-1']), workItems: new Set(), formulaScopes: new Set(), photoAdjustments: new Set() } }))
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
    expect(button('Writing the quote… 25s').disabled).toBe(true)
    await click('Writing the quote… 25s')
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
    const withWork: AiQuoteDraft = { ...draft, workItems: [{ id: 'work-1', product: { id: 'paint-1', name: 'Wall paint', manufacturer: null, type: null, unit: '4L', marketPrice: '80', actualPrice: '50', active: true, colorCode: null }, areaScope: 'interior', areaName: 'Bedroom', quantity: '1', workingDays, labourPerDay, rationale: 'Requested repaint.', photoAdjustment: null }] }
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
    expect(onApply).toHaveBeenCalledWith({ runId: 'run-1', draft, selection: { areas: new Set(['interior:Bedroom']), publicLines: new Set(['line-1']), workItems: new Set(), formulaScopes: new Set(['interior']), photoAdjustments: new Set() }, mode: 'append' })
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
