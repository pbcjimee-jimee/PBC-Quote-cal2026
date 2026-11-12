import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { QuoteForm } from '@/components/quote-form/quote-form'
import { createEmptyQuoteFormDraft, getQuoteDraftStorageKey } from '@/components/quote-form/quote-draft'
import { createQuote, updateQuote } from '@/lib/actions/quotes'
import { searchProducts } from '@/lib/actions/products'
import { createArea } from '@/lib/actions/areas'
import type { AiQuoteAvailability } from '@/lib/ai-quote/config'
import type { AiQuoteDraft } from '@/lib/ai-quote/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'
import Decimal from 'decimal.js'
import { calculateMainQuoteTotals } from '@/components/quote-form/quote-calculation-totals'
import { calculateQuoteOptionTotals } from '@/components/quote-form/quote-option-totals'
import { buildQuoteSavePayload } from '@/components/quote-form/quote-save-payload'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import type { QuoteRecord } from '@/lib/dev-data'
import { installTestDom, TestElement } from '@/tests/helpers/test-dom'

const routerPushMock = vi.hoisted(() => vi.fn())
const routerPrefetchMock = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, prefetch: routerPrefetchMock }),
}))
vi.mock('@/lib/actions/quotes', () => ({
  createQuote: vi.fn(),
  refreshJobberQuoteSnapshot: vi.fn(),
  updateQuote: vi.fn(),
}))
vi.mock('@/lib/actions/products', () => ({ searchProducts: vi.fn() }))
vi.mock('@/lib/actions/areas', () => ({ createArea: vi.fn() }))

class MemoryStorage {
  private readonly values = new Map<string, string>()

  get length() { return this.values.size }
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
  clear() { this.values.clear() }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
}

type TestElementRuntime = TestElement & {
  focus(options?: FocusOptions): void
  scrollIntoView(options?: ScrollIntoViewOptions): void
  querySelector(selector: string): TestElement | null
  querySelectorAll(selector: string): TestElement[]
  getAttributeNames(): string[]
}

function getDescendants(element: TestElement): TestElement[] {
  return element.childNodes.flatMap((node) => (
    node instanceof TestElement ? [node, ...getDescendants(node)] : []
  ))
}

function installElementRuntime() {
  const prototype = TestElement.prototype as unknown as TestElementRuntime
  const originals = {
    focus: prototype.focus,
    scrollIntoView: prototype.scrollIntoView,
    querySelector: prototype.querySelector,
    querySelectorAll: prototype.querySelectorAll,
    getAttributeNames: prototype.getAttributeNames,
  }

  prototype.focus = function focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this
  }
  prototype.scrollIntoView = () => undefined
  prototype.getAttributeNames = function getAttributeNames() {
    return Array.from(this.attributes.keys())
  }
  prototype.querySelector = function querySelector(selector: string) {
    const descendants = getDescendants(this)
    const attributeMatch = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)
    if (attributeMatch) {
      const [, name, value] = attributeMatch
      return descendants.find((element) => (
        value === undefined ? element.hasAttribute(name) : element.getAttribute(name) === value
      )) ?? null
    }
    return descendants.find((element) => element.tagName === selector.toUpperCase()) ?? null
  }
  prototype.querySelectorAll = function querySelectorAll(selector: string) {
    const attributeMatch = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)
    if (attributeMatch) {
      const [, name, value] = attributeMatch
      return getDescendants(this).filter((element) => (
        value === undefined ? element.hasAttribute(name) : element.getAttribute(name) === value
      ))
    }
    return originals.querySelectorAll.call(this, selector)
  }

  return () => {
    for (const [name, value] of Object.entries(originals)) {
      if (value) Reflect.set(prototype, name, value)
      else Reflect.deleteProperty(prototype, name)
    }
  }
}

function createQuoteRecord(overrides: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'quote-workspace-1', version: 1,
    customerName: 'Existing customer', customerAddress: '10 Main St',
    jobberQuoteId: null, jobberSaveMode: 'priced_line_items', jobberSyncStatus: 'not_synced',
    jobberLastSyncedAt: null, jobberSyncError: null, jobberSnapshotRefreshedAt: null,
    jobberSnapshotChangeStatus: 'unknown', jobberSnapshotChangeSummary: [], jobberSnapshotRefreshError: null,
    areaSqft: null, workType: 'Interior', workingDays: '0', labourPerDay: '0',
    formula1Total: '0', formula2Total: '0', formula3Total: '0', formula4Total: '0', formula5Total: '0',
    selectedMin: 4, selectedMax: 1, subtotal: '0', finalTotal: '0',
    pricingSettingsSnapshot: DEFAULT_PRICING_SETTINGS,
    createdAt: '2026-09-24T00:00:00.000Z', createdBy: 'user-1',
    createdByName: 'Test User', createdByEmail: 'test@example.com',
    items: [], jobberQuoteLines: [], options: [], memos: [], priceRevisions: [], jobberSnapshot: null,
    ...overrides,
  }
}

function createOptionRecord(id: string, title: string, position: number): QuoteRecord['options'][number] {
  return {
    id, quoteId: 'quote-workspace-1', title,
    workingDays: '0', labourPerDay: '0', materialMarket: '0', materialActual: '0',
    formula1Total: '0', formula2Total: '0', formula3Total: '0', formula4Total: '0', formula5Total: '0',
    selectedMin: 4, selectedMax: 1, subtotal: '0', finalTotal: '0', position, items: [],
  }
}

function findElement(container: TestElement, tagName: string, predicate: (element: TestElement) => boolean) {
  return container.querySelectorAll(tagName).find(predicate)
}

function findWorkspace(container: TestElement, section: string) {
  return [...container.querySelectorAll('section'), ...container.querySelectorAll('aside')].find((element) => (
    element.getAttribute('data-workspace-section') === section
  ))
}

function findButton(container: TestElement, label: string) {
  return findElement(container, 'button', (button) => button.textContent.trim() === label)
}

function findAncestorWithAttribute(element: TestElement | undefined, name: string): TestElement | undefined {
  let current = element?.parentElement ?? null
  while (current) {
    if (current.hasAttribute(name)) return current
    current = current.parentElement
  }
  return undefined
}

function findOptionCard(container: TestElement, title: string) {
  const titleInput = findElement(container, 'input', (input) => input.value === title)
  return findAncestorWithAttribute(titleInput, 'data-expanded')
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mountQuoteForm(options: {
  userId?: string
  storage?: MemoryStorage
  initialQuote?: QuoteRecord
  areas?: { id: string; scope: 'interior' | 'exterior' | 'roof'; name: string; active: boolean; position: number }[]
  viewportWidth?: number
  jobberEnabled?: boolean
  jobberNotice?: string
  aiAvailability?: AiQuoteAvailability
  aiReviewPending?: boolean
  quoteLineTemplates?: QuoteLineTemplateRecord[]
} = {}) {
  const installed = installTestDom()
  const restoreElementRuntime = installElementRuntime()
  const storage = options.storage ?? new MemoryStorage()
  Object.assign(window, {
    cancelAnimationFrame: vi.fn(),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    history: { pushState: vi.fn() },
    location: {
      protocol: 'http:',
      href: options.initialQuote ? `http://localhost/quotes/${options.initialQuote.id}/edit` : 'http://localhost/quotes/new',
    },
    requestAnimationFrame: vi.fn(() => 1),
    scrollBy: vi.fn(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    matchMedia: vi.fn((query: string) => ({
      matches: query === '(max-width: 720px)' ? (options.viewportWidth ?? 1280) <= 720 : query === '(max-width: 1023.98px)' ? (options.viewportWidth ?? 1280) < 1024 : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  })
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })

  const container = installed.document.createElement('div')
  installed.document.body.appendChild(container)
  const root = createRoot(container as unknown as Element)
  await act(async () => {
    root.render(createElement(QuoteForm, {
      userId: options.userId ?? 'user-a',
      settings: DEFAULT_PRICING_SETTINGS,
      areas: options.areas ?? [], productServices: [], quoteLineTemplates: options.quoteLineTemplates ?? [],
      initialQuote: options.initialQuote,
      jobberEnabled: options.jobberEnabled,
      jobberNotice: options.jobberNotice,
      aiAvailability: options.aiAvailability ?? { enabled: true },
      hasActiveAiKnowledge: true,
      aiReviewPending: options.aiReviewPending,
    }))
  })
  await settle()

  return {
    container, document: installed.document, root, storage,
    async cleanup() {
      await act(async () => root.unmount())
      restoreElementRuntime()
      installed.cleanup()
    },
  }
}

describe('quote workspace structure', () => {
  it.each([375, 1280])('locks sync for a non-owner pending review and keeps local Save available at %spx', async viewportWidth => {
    const mounted = await mountQuoteForm({
      aiAvailability: { enabled: false, reason: 'not_allowed', message: 'AI quoting is not enabled for your account.' },
      viewportWidth, aiReviewPending: true, initialQuote: createQuoteRecord({ jobberQuoteId: 'jobber-1' }),
    })
    try {
      expect(mounted.container.textContent).not.toContain('Draft with AI')
      expect(mounted.container.textContent).not.toContain('AI quoting is not enabled for your account.')
      expect(mounted.container.textContent).not.toContain('I reviewed the AI draft lines and prices')
      expect(mounted.container.querySelectorAll('input').filter(input => input.getAttribute('aria-label') === 'I reviewed the AI draft lines and prices')).toHaveLength(0)
      expect(mounted.container.textContent).toContain('AI draft waiting for owner review. Save is available; Jobber sync is locked.')
      expect(mounted.container.querySelectorAll('p').filter(element => element.getAttribute('role') === 'status' && element.textContent.includes('AI draft waiting for owner review.')).length).toBe(1)
      expect(findButton(mounted.container, 'Save')?.disabled).toBe(false)
      expect(findButton(mounted.container, 'Save & Sync to Jobber')?.disabled).toBe(true)
      expect(findButton(mounted.container, 'Save & Sync')?.disabled).toBe(true)
    } finally { await mounted.cleanup() }
  })

  it.each([375, 1280])('requires one review checkbox before either Sync button but keeps Save available at %spx', async viewportWidth => {
    vi.mocked(updateQuote).mockReset().mockResolvedValueOnce({ ok: false, error: 'Hold for inspection' }).mockResolvedValueOnce({ ok: true, data: { id: 'quote-workspace-1' } })
    const mounted = await mountQuoteForm({ viewportWidth, aiReviewPending: true, initialQuote: createQuoteRecord({ jobberQuoteId: 'jobber-1' }) })
    try {
      const controls = mounted.container.querySelectorAll('input').filter(input => input.getAttribute('aria-label') === 'I reviewed the AI draft lines and prices')
      expect(controls).toHaveLength(1)
      const checkbox = controls[0]
      expect(checkbox.parentElement?.parentElement?.getAttribute('class')).toContain(viewportWidth === 375 ? 'pbc-mobile-totalbar' : 'pbc-topbar__right')
      expect(checkbox.checked).toBe(false)
      expect(findButton(mounted.container, 'Save')?.disabled).toBe(false)
      expect(findButton(mounted.container, 'Save & Sync')?.disabled).toBe(true)
      expect(findButton(mounted.container, 'Save & Sync to Jobber')?.disabled).toBe(true)
      await act(async () => findButton(mounted.container, 'Save')!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(updateQuote).toHaveBeenCalledWith(expect.objectContaining({ syncJobber: false, aiReviewConfirmed: false }))
      await act(async () => { checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })) })
      expect(findButton(mounted.container, 'Save & Sync')?.disabled).toBe(false)
      await act(async () => findButton(mounted.container, 'Save & Sync')!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(updateQuote).toHaveBeenLastCalledWith(expect.objectContaining({ syncJobber: true, aiReviewConfirmed: true }))
      expect(mounted.container.querySelectorAll('input').find(input => input.getAttribute('aria-label') === 'I reviewed the AI draft lines and prices')?.checked).toBe(false)
    } finally { await mounted.cleanup() }
  })

  it('does not show AI review controls for a manual quote', async () => {
    const mounted = await mountQuoteForm({ initialQuote: createQuoteRecord({ jobberQuoteId: 'jobber-1' }) })
    try {
      expect(mounted.container.textContent).not.toContain('I reviewed the AI draft lines and prices')
      expect(findButton(mounted.container, 'Save & Sync')?.disabled).toBe(false)
    } finally { await mounted.cleanup() }
  })

  it('restores AI run provenance, requires review and forwards it when saving locally', async () => {
    vi.mocked(createQuote).mockReset().mockResolvedValueOnce({ ok: false, error: 'Hold for inspection' })
    const storage = new MemoryStorage()
    const aiDraftRunId = '00000000-0000-4000-8000-000000000001'
    storage.setItem(getQuoteDraftStorageKey('user-a'), JSON.stringify({ ...createEmptyQuoteFormDraft(), ownerId: 'user-a', aiDraftRunId, updatedAt: new Date().toISOString() }))
    const mounted = await mountQuoteForm({ storage })
    try {
      await act(async () => findButton(mounted.container, 'Restore Draft')!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(mounted.container.textContent).toContain('I reviewed the AI draft lines and prices')
      await act(async () => findButton(mounted.container, 'Save')!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(createQuote).toHaveBeenCalledWith(expect.objectContaining({ aiDraftRunId, aiReviewConfirmed: false, syncJobber: false }))
    } finally { await mounted.cleanup() }
  })

  const aiDraft: AiQuoteDraft = {
    summary: 'Bedroom repaint', findings: [], photoFindings: [], questions: [], warnings: [], optionalItems: [],
    areas: [{ scope: 'interior', name: 'Bedroom' }, { scope: 'interior', name: 'Hallway' }],
    publicLines: [{ id: 'ai-line', kind: 'text', name: 'AI wall painting', description: '', quantity: '1', productServiceId: null, priceSource: 'none', priceWeight: 0, catalogUnitPrice: null, taxable: false, areaName: 'Bedroom', rationale: 'Requested.' }],
    workItems: [{ id: 'ai-work', optionalItemId: null, product: { id: 'paint-1', name: 'AI wall paint', manufacturer: 'Dulux', type: 'Paint', unit: '4L', marketPrice: '80', rrpPrice: '90', actualPrice: '50', colorCode: null, active: true, productCode: 'WALL' }, areaScope: 'interior', areaName: 'Bedroom', quantity: '2', workingDays: '3', labourPerDay: '2', rationale: 'Two coats.', photoAdjustment: null }],
    formulaSelections: [{ scope: 'interior', selectedMin: 4, selectedMax: 1, rationale: 'Standard.' }],
  }

  it.each(['interior', 'roof'] as const)('allocates AI Total using displayed per-area %s picks on apply and recalculate', async scope => {
    const originalFetch = globalThis.fetch
    const selectedMin = scope === 'roof' ? 1 : 3
    const selectedMax = scope === 'roof' ? 2 : 5
    const area = { id: 'ai-area', name: 'Bedroom', scope, active: true, position: 0 }
    const draft = { ...aiDraft, areas: [{ scope, name: 'Bedroom' }],
      workItems: [{ ...aiDraft.workItems[0], product: { ...aiDraft.workItems[0].product, id: '00000000-0000-4000-8000-000000000002' }, areaScope: scope }],
      formulaSelections: [{ scope, selectedMin, selectedMax, rationale: 'Area specific.' }] }
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: { runId: '00000000-0000-4000-8000-000000000001', draft } }) })
    vi.mocked(createQuote).mockReset().mockResolvedValue({ ok: false, error: 'Hold for inspection' })
    const mounted = await mountQuoteForm({ areas: [area] })
    try {
      const notes = mounted.container.querySelectorAll('textarea')[0]
      await act(async () => { notes.value = 'Repaint bedroom'; notes.dispatchEvent(new Event('input', { bubbles: true })) })
      await act(async () => findButton(mounted.container, 'Create draft')!.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => findButton(mounted.container, 'Apply to quote')!.dispatchEvent(new Event('click', { bubbles: true })))
      for (const recalculate of [false, true]) {
        if (recalculate) await act(async () => findButton(mounted.container, 'Recalculate AI prices')!.dispatchEvent(new Event('click', { bubbles: true })))
        await act(async () => window.dispatchEvent(new Event('pagehide')))
        const stored = JSON.parse(mounted.storage.getItem(getQuoteDraftStorageKey('user-a'))!)
        const totals = calculateMainQuoteTotals({ materials: stored.materials, selectedMin: stored.selectedMin, selectedMax: stored.selectedMax, areaFormulaSelections: stored.areaFormulaSelections, settings: DEFAULT_PRICING_SETTINGS })
        expect(totals.finalTotal.eq(totals.areaBreakdown.finalTotal)).toBe(false)
        expect(mounted.container.textContent).toContain(`$${totals.areaBreakdown.finalSubtotal.toFixed(2)}`)
        expect(new Decimal(stored.jobberQuoteLines.at(-1).unitPrice).toFixed(2)).toBe(totals.areaBreakdown.finalSubtotal.toFixed(2))
      }
      await act(async () => findButton(mounted.container, 'Save quote')!.dispatchEvent(new Event('click', { bubbles: true })))
      const saved = vi.mocked(createQuote).mock.calls[0][0] as ReturnType<typeof buildQuoteSavePayload>
      expect(saved.jobberQuoteLines.at(-1)?.unitPrice).toBeGreaterThan(0)
    } finally { await mounted.cleanup(); globalThis.fetch = originalFetch }
  })

  it('applies AI optional calculations separately, recalculates their lines and preserves prices after card deletion', async () => {
    const originalFetch = globalThis.fetch
    const optional = { id: 'optional-1', name: 'Optional ceiling', description: 'Paint the ceiling', areaName: 'Bedroom', rationale: 'Optional request.' }
    const empty = { ...optional, id: 'optional-2', name: 'Optional trim' }
    const optionWork = { ...aiDraft.workItems[0], id: 'optional-work', optionalItemId: optional.id, workingDays: '1.75', labourPerDay: '1' }
    const draft = { ...aiDraft, areas: [aiDraft.areas[0]], optionalItems: [optional, empty], workItems: [...aiDraft.workItems, optionWork] }
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: { runId: '00000000-0000-4000-8000-000000000001', draft } }) })
    const mounted = await mountQuoteForm({ areas: [{ id: 'ai-area', name: 'Bedroom', scope: 'interior', active: true, position: 0 }] })
    try {
      const notes = mounted.container.querySelectorAll('textarea')[0]
      await act(async () => { notes.value = 'Repaint bedroom and optional ceiling'; notes.dispatchEvent(new Event('input', { bubbles: true })) })
      await act(async () => findButton(mounted.container, 'Create draft')!.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => findButton(mounted.container, 'Apply to quote')!.dispatchEvent(new Event('click', { bubbles: true })))
      await settle()
      await act(async () => window.dispatchEvent(new Event('pagehide')))
      const readDraft = () => JSON.parse(mounted.storage.getItem(getQuoteDraftStorageKey('user-a'))!) as ReturnType<typeof createEmptyQuoteFormDraft>
      const stored = readDraft()
      const main = calculateMainQuoteTotals({ materials: stored.materials, selectedMin: stored.selectedMin, selectedMax: stored.selectedMax, areaFormulaSelections: stored.areaFormulaSelections, settings: DEFAULT_PRICING_SETTINGS })
      const option = stored.options[0]
      const subtotal = calculateQuoteOptionTotals(stored.options, DEFAULT_PRICING_SETTINGS)[option.id].subtotal.toFixed(2)
      expect(stored.materials).toHaveLength(1)
      expect(stored.materials[0].memo).toBe('')
      expect(option.materials).toHaveLength(1)
      expect(option.materials[0].memo).toBe('')
      expect(stored.jobberQuoteLines.map(line => line.name)).toEqual(['AI wall painting', optional.name, empty.name, 'Total'])
      expect(stored.jobberQuoteLines[1]).toMatchObject({ unitPrice: subtotal, optional: false, optionalWritePolicy: 'set_false', recommended: false, recommendedWritePolicy: 'set_false', selected: false })
      expect(stored.aiLineMeta?.[stored.jobberQuoteLines[1].id]).toEqual({ priceSource: 'none', priceWeight: 0, catalogUnitPrice: null, optionId: option.id })
      expect(stored.jobberQuoteLines.at(-1)?.unitPrice).toBe(main.areaBreakdown.finalSubtotal.toFixed(2))
      expect(mounted.container.textContent).toContain('2 optional items priced separately in Options.')
      expect(mounted.container.textContent).toContain('Enter a price for optional items without a calculation.')
      const manualPrice = findElement(mounted.container, 'input', input => input.getAttribute('data-error-key') === `public:${stored.jobberQuoteLines[2].id}:unitPrice`)!
      expect(manualPrice).toBeDefined()
      await act(async () => { manualPrice.value = '175.50'; manualPrice.dispatchEvent(new Event('input', { bubbles: true })) })
      const title = findElement(mounted.container, 'input', input => input.getAttribute('id') === `${option.id}-title`)
      const card = findAncestorWithAttribute(title, 'data-expanded')!
      const days = findElement(card, 'input', input => input.value === '1.75')!
      expect(days).toBeDefined()
      await act(async () => { days.value = '3.5'; days.dispatchEvent(new Event('input', { bubbles: true })) })
      await act(async () => findButton(mounted.container, 'Recalculate AI prices')!.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => window.dispatchEvent(new Event('pagehide')))
      const recalculated = readDraft()
      const newSubtotal = calculateQuoteOptionTotals(recalculated.options, DEFAULT_PRICING_SETTINGS)[option.id].subtotal.toFixed(2)
      expect(new Decimal(newSubtotal).gt(subtotal)).toBe(true)
      expect(recalculated.jobberQuoteLines[1].unitPrice).toBe(newSubtotal)
      expect(recalculated.jobberQuoteLines[2].unitPrice).toBe('175.50')
      expect(recalculated.jobberQuoteLines.at(-1)?.unitPrice).toBe(stored.jobberQuoteLines.at(-1)?.unitPrice)
      const remove = findElement(card, 'button', button => button.getAttribute('aria-label') === `Delete ${optional.name}`)!
      await act(async () => remove.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => findButton(mounted.container, 'Recalculate AI prices')!.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => window.dispatchEvent(new Event('pagehide')))
      const deleted = readDraft()
      expect(deleted.options).toHaveLength(1)
      expect(deleted.jobberQuoteLines[1].unitPrice).toBe(newSubtotal)
      expect(deleted.jobberQuoteLines[2].unitPrice).toBe('175.50')
      expect(deleted.jobberQuoteLines.at(-1)?.unitPrice).toBe(stored.jobberQuoteLines.at(-1)?.unitPrice)
    } finally { await mounted.cleanup(); globalThis.fetch = originalFetch }
  })

  it.each([false, true])('restores saved optional line links on AI apply while preserving empty-option prices and manual reservations (manual: %s)', async includeManual => {
    const originalFetch = globalThis.fetch
    const savedLine = (id: string, name: string, unitPrice: string): QuoteRecord['jobberQuoteLines'][number] => ({
      id, quoteId: 'quote-workspace-1', kind: 'line_item', name, description: '', quantity: '1', unitPrice, totalPrice: unitPrice,
      taxable: true, clientVisible: true, jobberLineItemId: `jobber-${id}`, linkedProductOrServiceId: null,
      position: 0, createdAt: '', updatedAt: '', optional: false,
    })
    const options = [createOptionRecord('old-empty', 'Optional trim', 0), createOptionRecord('old-calculated', 'Optional ceiling', 1)]
    options[1].items = [{ id: 'old-paint', optionId: options[1].id, productId: null, productNameSnapshot: 'Ceiling paint',
      marketPriceSnapshot: '80', actualPriceSnapshot: '50', quantity: '2', workingDays: '1', labourPerDay: '1',
      areaId: null, areaNameSnapshot: null, areaScopeSnapshot: null, isCustom: true, position: 0 }]
    const initialQuote = createQuoteRecord({ options, jobberQuoteLines: [
      savedLine('empty-line', ' OPTIONAL   TRIM ', '175.50'), savedLine('calculated-line', 'Optional ceiling', '300.00'),
      savedLine('old-total', 'Total', '1000.00'), ...(includeManual ? [savedLine('manual-line', 'Unrelated service', '100.00')] : []),
    ] })
    const draft = { ...aiDraft, areas: [aiDraft.areas[0]] }
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: { runId: '00000000-0000-4000-8000-000000000001', draft } }) })
    const mounted = await mountQuoteForm({ initialQuote, areas: [{ id: 'ai-area', name: 'Bedroom', scope: 'interior', active: true, position: 0 }] })
    try {
      const notes = mounted.container.querySelectorAll('textarea')[0]
      await act(async () => { notes.value = 'Repaint bedroom'; notes.dispatchEvent(new Event('input', { bubbles: true })) })
      await act(async () => findButton(mounted.container, 'Create draft')!.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => findButton(mounted.container, 'Apply to quote')!.dispatchEvent(new Event('click', { bubbles: true })))
      for (const recalculate of [false, true]) {
        if (recalculate) await act(async () => findButton(mounted.container, 'Recalculate AI prices')!.dispatchEvent(new Event('click', { bubbles: true })))
        await act(async () => window.dispatchEvent(new Event('pagehide')))
        const stored = JSON.parse(mounted.storage.getItem(getQuoteDraftStorageKey('user-a', initialQuote.id))!) as ReturnType<typeof createEmptyQuoteFormDraft>
        const main = calculateMainQuoteTotals({ materials: stored.materials, selectedMin: stored.selectedMin, selectedMax: stored.selectedMax, areaFormulaSelections: stored.areaFormulaSelections, settings: DEFAULT_PRICING_SETTINGS })
        expect(stored.aiLineMeta?.['empty-line']).toEqual({ priceSource: 'none', priceWeight: 0, catalogUnitPrice: null, optionId: 'old-empty' })
        expect(stored.aiLineMeta?.['calculated-line']?.optionId).toBe('old-calculated')
        expect(stored.aiLineMeta?.['old-total']?.optionId).toBeUndefined()
        expect(stored.aiLineMeta?.['manual-line']).toBeUndefined()
        expect(stored.jobberQuoteLines.find(line => line.id === 'empty-line')?.unitPrice).toBe('175.50')
        expect(stored.jobberQuoteLines.find(line => line.id === 'calculated-line')?.unitPrice).toBe(calculateQuoteOptionTotals(stored.options, DEFAULT_PRICING_SETTINGS)['old-calculated'].subtotal.toFixed(2))
        expect(stored.jobberQuoteLines.at(-1)?.unitPrice).toBe(main.areaBreakdown.finalSubtotal.sub(includeManual ? '100' : '0').toFixed(2))
      }
    } finally { await mounted.cleanup(); globalThis.fetch = originalFetch }
  })

  it.each(['create', 'update'] as const)('keeps AI provenance after %s warnings and retries the saved quote with its current version', async mode => {
    routerPushMock.mockClear()
    const aiDraftRunId = '00000000-0000-4000-8000-000000000001'
    const id = mode === 'create' ? 'new-ai-quote' : 'quote-workspace-1'
    const initialQuote = mode === 'update' ? createQuoteRecord({ version: 3 }) : undefined
    const version = mode === 'create' ? 1 : 4
    const warning = 'Quote saved, but the AI review record could not be updated.'
    vi.mocked(createQuote).mockReset().mockResolvedValueOnce({ ok: true, data: { id, warning, savedVersion: version } })
    vi.mocked(updateQuote).mockReset()
    if (mode === 'update') vi.mocked(updateQuote).mockResolvedValueOnce({ ok: true, data: { id, warning, savedVersion: version } })
    vi.mocked(updateQuote).mockResolvedValueOnce({ ok: true, data: { id, warning, savedVersion: version + 1 } })
      .mockResolvedValueOnce({ ok: true, data: { id } })
    const storage = new MemoryStorage()
    storage.setItem(getQuoteDraftStorageKey('user-a', initialQuote?.id), JSON.stringify({ ...createEmptyQuoteFormDraft(), ownerId: 'user-a', aiDraftRunId, updatedAt: new Date().toISOString() }))
    const mounted = await mountQuoteForm({ storage, initialQuote })
    try {
      await act(async () => findButton(mounted.container, 'Restore Draft')!.dispatchEvent(new Event('click', { bubbles: true })))
      const save = () => findButton(mounted.container, initialQuote ? 'Save changes' : 'Save quote')!
      await act(async () => save().dispatchEvent(new Event('click', { bubbles: true })))
      expect(routerPushMock).not.toHaveBeenCalled()
      expect(findElement(mounted.container, 'div', element => element.getAttribute('role') === 'alert' && element.textContent === warning)).toBeDefined()
      await act(async () => window.dispatchEvent(new Event('pagehide')))
      expect(JSON.parse(storage.getItem(getQuoteDraftStorageKey('user-a', initialQuote?.id))!).aiDraftRunId).toBe(aiDraftRunId)
      await act(async () => save().dispatchEvent(new Event('click', { bubbles: true })))
      expect(updateQuote).toHaveBeenLastCalledWith(expect.objectContaining({ id, expectedVersion: version, aiDraftRunId }))
      expect(routerPushMock).not.toHaveBeenCalled()
      await act(async () => save().dispatchEvent(new Event('click', { bubbles: true })))
      expect(updateQuote).toHaveBeenLastCalledWith(expect.objectContaining({ id, expectedVersion: version + 1, aiDraftRunId }))
      expect(routerPushMock).toHaveBeenCalledWith(`/quotes/${id}`)
      expect(createQuote).toHaveBeenCalledTimes(mode === 'create' ? 1 : 0)
    } finally { await mounted.cleanup() }
  })

  it('continues normal navigation for a non-AI save warning', async () => {
    routerPushMock.mockClear()
    vi.mocked(createQuote).mockReset().mockResolvedValueOnce({ ok: true, data: { id: 'manual-quote', warning: 'Saved with notice' } })
    const mounted = await mountQuoteForm()
    try {
      await act(async () => findButton(mounted.container, 'Save quote')!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(routerPushMock).toHaveBeenCalledWith('/quotes/manual-quote')
    } finally { await mounted.cleanup() }
  })

  it.each([true, false])('passes the Jobber photo lookup and recalculates Total with the selected labour (photo adjustment: %s)', async include => {
    const originalFetch = globalThis.fetch
    const photoDraft: AiQuoteDraft = { ...aiDraft, areas: [aiDraft.areas[0]], workItems: [{ ...aiDraft.workItems[0], product: { ...aiDraft.workItems[0].product, id: '00000000-0000-4000-8000-000000000002' }, workingDays: '2', labourPerDay: '1', photoAdjustment: { workingDays: '3', labourPerDay: '3', reason: 'High ceiling', photoRefs: [7] } }] }
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, data: { connected: true, selected: { id: 'folder-1', name: 'quote 3000 - Main St' }, candidates: [], photoCount: 8 } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, data: { runId: 'photo-run', photoLabels: [], skippedCount: 0 } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, data: { runId: '00000000-0000-4000-8000-000000000001', draft: photoDraft } }) })
    globalThis.fetch = fetchMock
    vi.mocked(updateQuote).mockReset().mockResolvedValue({ ok: false, error: 'Held for inspection' })
    const initialQuote = createQuoteRecord({ jobberQuoteId: 'jobber-1', jobberSnapshot: {
      jobberQuoteId: 'jobber-1', sourceType: 'quote', quoteNumber: '3000', createdAt: '2026-10-31', customerName: 'Client', customerAddress: 'Old address', workType: 'Interior', areaSqft: null, customerType: 'Residential', sourceUrl: '', productsAndServices: [], jobExpenses: [], jobExpensesError: null,
      financialSummary: { quoteTotal: 0, expensesTotal: 0, profit: 0, profitMarginPercent: null },
    } })
    const mounted = await mountQuoteForm({ initialQuote, areas: [{ id: '00000000-0000-4000-8000-000000000003', name: 'Bedroom', scope: 'interior', active: true, position: 0 }] })
    try {
      expect(fetchMock.mock.calls[0][0]).toBe('/api/ai/photos/folders')
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ quoteNumber: '3000', address: '10 Main St' })
      const notes = mounted.container.querySelectorAll('textarea').find(element => element.getAttribute('placeholder')?.startsWith('e.g. Interior repaint:'))!
      await act(async () => { notes.value = 'Repaint bedroom'; notes.dispatchEvent(new Event('input', { bubbles: true })) })
      await act(async () => findButton(mounted.container, 'Create draft')!.dispatchEvent(new Event('click', { bubbles: true })))
      if (!include) {
        const checkbox = findElement(mounted.container, 'input', input => input.getAttribute('aria-label')?.startsWith('Include photo adjustment for') === true)!
        await act(async () => { checkbox.checked = false; checkbox.dispatchEvent(new Event('change', { bubbles: true })) })
      }
      await act(async () => findButton(mounted.container, 'Apply to quote')!.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => findButton(mounted.container, 'Save changes')!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(updateQuote).toHaveBeenCalledOnce()
      const saved = vi.mocked(updateQuote).mock.calls[0][0] as ReturnType<typeof buildQuoteSavePayload>
      expect(saved.items[0]).toMatchObject({ workingDays: include ? 3 : 2, labourPerDay: include ? 3 : 1 })
      const material = { id: 'material-1', name: 'AI wall paint', marketPrice: '90', actualPrice: '90', isCustom: false, quantity: '2', workingDays: include ? '3' : '2', labourPerDay: include ? '3' : '1', areaScope: 'interior' as const, areaName: 'Bedroom' }
      const totals = calculateMainQuoteTotals({ materials: [material], selectedMin: 4, selectedMax: 1, areaFormulaSelections: { interior: { selectedMin: 4, selectedMax: 1 }, exterior: { selectedMin: 4, selectedMax: 1 }, roof: { selectedMin: 4, selectedMax: 1 } }, settings: DEFAULT_PRICING_SETTINGS })
      expect(new Decimal(saved.jobberQuoteLines.at(-1)!.unitPrice).toFixed(2)).toBe(totals.finalTotal.div('1.10').toFixed(2))
    } finally { await mounted.cleanup(); globalThis.fetch = originalFetch }
  })

  it.each([false, true])('applies AI areas, materials and allocated prices atomically (area failure: %s)', async (failArea) => {
    const originalFetch = globalThis.fetch
    vi.mocked(createArea).mockReset()
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: { runId: '00000000-0000-4000-8000-000000000001', draft: aiDraft } }) })
    vi.mocked(createArea).mockResolvedValueOnce({ ok: true, data: { id: 'ai-area-1', name: 'Bedroom', scope: 'interior', active: true, position: 0 } })
      .mockResolvedValueOnce(failArea ? { ok: false, error: 'Area unavailable' } : { ok: true, data: { id: 'ai-area-2', name: 'Hallway', scope: 'interior', active: true, position: 1 } })
    const mounted = await mountQuoteForm()
    try {
      const notes = mounted.container.querySelectorAll('textarea').find(element => element.getAttribute('placeholder')?.startsWith('e.g. Interior repaint:'))!
      expect(notes).toBeDefined()
      await act(async () => { notes.value = 'Repaint bedroom'; notes.dispatchEvent(new Event('input', { bubbles: true })) })
      await act(async () => findButton(mounted.container, 'Create draft')!.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => findButton(mounted.container, 'Apply to quote')!.dispatchEvent(new Event('click', { bubbles: true })))
      await settle()
      await act(async () => window.dispatchEvent(new Event('pagehide')))
      if (failArea) {
        expect(mounted.container.textContent).toContain('Unable to apply')
        expect(mounted.container.textContent).not.toContain('AI draft applied -')
        expect(mounted.storage.getItem(getQuoteDraftStorageKey('user-a'))).toBeNull()
        vi.mocked(createArea).mockResolvedValueOnce({ ok: true, data: { id: 'ai-area-2', name: 'Hallway', scope: 'interior', active: true, position: 1 } })
        await act(async () => findButton(mounted.container, 'Try again')!.dispatchEvent(new Event('click', { bubbles: true })))
        expect(createArea).toHaveBeenCalledTimes(3)
        expect(mounted.container.textContent).toContain('AI draft applied -')
      } else {
        const stored = JSON.parse(mounted.storage.getItem(getQuoteDraftStorageKey('user-a'))!)
        expect(stored.aiDraftRunId).toBe('00000000-0000-4000-8000-000000000001')
        expect(stored.materials[0]).toMatchObject({ name: 'AI wall paint', areaId: 'ai-area-1', quantity: '2' })
        const totals = calculateMainQuoteTotals({ materials: stored.materials, selectedMin: stored.selectedMin, selectedMax: stored.selectedMax, areaFormulaSelections: stored.areaFormulaSelections, settings: DEFAULT_PRICING_SETTINGS })
        expect(stored.jobberQuoteLines[0]).toMatchObject({ kind: 'text', unitPrice: '0.00' })
        expect(stored.jobberQuoteLines.at(-1)).toMatchObject({ name: 'Total', quantity: '1', kind: 'line_item' })
        expect(stored.aiLineMeta[stored.jobberQuoteLines.at(-1).id]).toEqual({ priceSource: 'allocated', priceWeight: 100, catalogUnitPrice: null })
        expect(new Decimal(stored.jobberQuoteLines.at(-1).unitPrice).toFixed(2)).toBe(totals.finalTotal.div('1.10').toFixed(2))
        expect(mounted.container.textContent).toContain('AI draft applied -')
        const itemDays = findElement(mounted.container, 'input', input => input.value === '3')
        expect(findElement(mounted.container, 'p', element => element.textContent === 'AI prices recalculated. Basic template not found.')?.getAttribute('class')).toContain('pbc-alert--success')
        expect(itemDays).toBeDefined()
        await act(async () => { itemDays!.value = '6'; itemDays!.dispatchEvent(new Event('input', { bubbles: true })) })
        await act(async () => findButton(mounted.container, 'Recalculate AI prices')!.dispatchEvent(new Event('click', { bubbles: true })))
        await act(async () => window.dispatchEvent(new Event('pagehide')))
        const recalculated = JSON.parse(mounted.storage.getItem(getQuoteDraftStorageKey('user-a'))!)
        expect(recalculated.jobberQuoteLines[0].unitPrice).toBe('0.00')
        expect(new Decimal(recalculated.jobberQuoteLines.at(-1).unitPrice).gt(stored.jobberQuoteLines.at(-1).unitPrice)).toBe(true)
      }
    } finally { await mounted.cleanup(); globalThis.fetch = originalFetch }
  })

  it('passes Basic templates to AI application, reports duplicates and tracks only applied lines', async () => {
    const originalFetch = globalThis.fetch
    const publicLines = [{ ...aiDraft.publicLines[0], id: 'duplicate', name: ' vivid  WHITE ' }, ...aiDraft.publicLines]
    const quoteLineTemplates: QuoteLineTemplateRecord[] = [{
      id: 'basic', name: 'Basic tam', active: true, createdAt: '', updatedAt: '', items: [{
        id: 'basic-item', templateId: 'basic', kind: 'text', name: 'Vivid white', description: 'Saved wording',
        quantity: null, unitPrice: null, taxable: false, clientVisible: true, linkedProductOrServiceId: null,
        position: 0, createdAt: '', updatedAt: '',
      }],
    }]
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: {
      runId: '00000000-0000-4000-8000-000000000001', draft: { ...aiDraft, publicLines, areas: [], workItems: [] },
    } }) })
    const mounted = await mountQuoteForm({ quoteLineTemplates })
    try {
      const notes = mounted.container.querySelectorAll('textarea').find(element => element.getAttribute('placeholder')?.startsWith('e.g. Interior repaint:'))!
      await act(async () => { notes.value = 'Repaint bedroom'; notes.dispatchEvent(new Event('input', { bubbles: true })) })
      await act(async () => findButton(mounted.container, 'Create draft')!.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => findButton(mounted.container, 'Apply to quote')!.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => window.dispatchEvent(new Event('pagehide')))
      const stored = JSON.parse(mounted.storage.getItem(getQuoteDraftStorageKey('user-a'))!)
      expect(stored.jobberQuoteLines.map((line: { name: string }) => line.name)).toEqual(['AI wall painting', 'Vivid white', 'Total'])
      expect(stored.jobberQuoteLines[1].description).toBe('Saved wording')
      expect(Object.keys(stored.aiLineMeta).sort()).toEqual([stored.jobberQuoteLines[0].id, stored.jobberQuoteLines[2].id].sort())
      expect(stored.aiLineMeta[stored.jobberQuoteLines[0].id]).toEqual({ priceSource: 'none', priceWeight: 0, catalogUnitPrice: null })
      expect(mounted.container.textContent).toContain('Removed 1 duplicate line.')
      expect(mounted.container.textContent).not.toContain('Basic template not found.')
    } finally { await mounted.cleanup(); globalThis.fetch = originalFetch }
  })

  it('keeps allocation problems styled as warnings', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, data: { runId: '00000000-0000-4000-8000-000000000001', draft: { ...aiDraft, areas: [], workItems: [] } } }) })
    const mounted = await mountQuoteForm()
    try {
      const notes = mounted.container.querySelectorAll('textarea').find(element => element.getAttribute('placeholder')?.startsWith('e.g. Interior repaint:'))!
      await act(async () => { notes.value = 'Repaint bedroom'; notes.dispatchEvent(new Event('input', { bubbles: true })) })
      await act(async () => findButton(mounted.container, 'Create draft')!.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => findButton(mounted.container, 'Apply to quote')!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(findElement(mounted.container, 'p', element => element.textContent === 'Add materials and labour before recalculating AI prices. Basic template not found.')?.getAttribute('class')).toContain('pbc-alert--warning')
    } finally { await mounted.cleanup(); globalThis.fetch = originalFetch }
  })

  it('does not offer another user’s draft or an unowned legacy draft', async () => {
    const storage = new MemoryStorage()
    const draft = { ...createEmptyQuoteFormDraft(), customerName: 'Private A', updatedAt: new Date().toISOString() }
    storage.setItem(getQuoteDraftStorageKey('user-a'), JSON.stringify({ ...draft, ownerId: 'user-a' }))
    storage.setItem('pbc-quote-draft:new', JSON.stringify(draft))
    const mounted = await mountQuoteForm({ userId: 'user-b', storage })
    try {
      expect(findButton(mounted.container, 'Restore Draft')).toBeUndefined()
      expect(mounted.container.textContent).not.toContain('Private A')
      expect(storage.getItem('pbc-quote-draft:new')).toBeNull()
    } finally {
      await mounted.cleanup()
    }
  })

  it.each(['Restore Draft', 'Discard'])('keeps the same owner’s %s action working', async (action) => {
    const storage = new MemoryStorage()
    const key = getQuoteDraftStorageKey('user-a')
    storage.setItem(key, JSON.stringify({
      ...createEmptyQuoteFormDraft(), ownerId: 'user-a', customerName: 'Restored A', updatedAt: new Date().toISOString(),
    }))
    const mounted = await mountQuoteForm({ storage })
    try {
      const button = findButton(mounted.container, action)
      expect(button).toBeDefined()
      await act(async () => button!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(findButton(mounted.container, 'Restore Draft')).toBeUndefined()
      const customerInput = findWorkspace(mounted.container, 'details')?.querySelectorAll('input')[0]
      expect(customerInput?.value).toBe(action === 'Restore Draft' ? 'Restored A' : '')
      if (action === 'Discard') {
        window.dispatchEvent(new Event('pagehide'))
        expect(storage.getItem(key)).toBeNull()
      }
    } finally {
      await mounted.cleanup()
    }
  })

  const timberSourceKey = '00000000-0000-4000-8000-000000000401'
  const timberComparisonKey = '00000000-0000-4000-8000-000000000402'
  const timberAreaId = '00000000-0000-4000-8000-000000000403'
  const timberProductId = '00000000-0000-4000-8000-000000000404'
  function createTimberQuote(hasProduct = true): QuoteRecord {
    return createQuoteRecord({ selectedMin: 1, selectedMax: 1, items: [{ id: timberSourceKey, logicalKey: timberSourceKey, timberRole: 'finish', quoteId: 'quote-workspace-1', productId: null, productNameSnapshot: 'Super source', marketPriceSnapshot: '20', actualPriceSnapshot: '20', quantity: '1', workingDays: '0', labourPerDay: '0', areaId: timberAreaId, areaNameSnapshot: 'Doors', areaScopeSnapshot: 'interior', isCustom: true, position: 0 }], paintComparisons: [{ version: 1, key: timberComparisonKey, alternatives: [{ targetLogicalKey: timberSourceKey, previousRole: 'finish', acknowledgedSourceProductId: null, product: hasProduct ? { productId: timberProductId, name: 'Aqua product', marketPrice: '10', actualPrice: '10' } : undefined, quantity: { mode: 'inherit', value: '1' }, workingDays: { mode: 'inherit', value: '0' }, labourPerDay: { mode: 'inherit', value: '0' } }] }], jobberQuoteLines: hasProduct ? [{ id: 'generated', quoteId: 'quote-workspace-1', kind: 'line_item', name: 'Aqua adjustment', description: 'Customer copy', quantity: '1', unitPrice: '-10', totalPrice: '-10', taxable: true, clientVisible: true, position: 0, jobberLineItemId: 'remote-adjustment', linkedProductOrServiceId: null, paintComparisonKey: timberComparisonKey, optional: true, selected: false, createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z' }] : [] })
  }
  it('removes comparison markers and preserves remote deletion intent when removing the comparison', async () => {
    vi.mocked(updateQuote).mockReset().mockResolvedValue({ ok: false, error: 'Held for inspection' })
    const mounted = await mountQuoteForm({ initialQuote: createTimberQuote(), areas: [{ id: timberAreaId, scope: 'interior', name: 'Doors', active: true, position: 0 }] })
    try {
      await act(async () => findButton(mounted.container, 'Remove comparison and its Optional')!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(mounted.container.textContent).not.toContain('Timber paint comparison')
      await act(async () => findButton(mounted.container, 'Save changes')!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(updateQuote).toHaveBeenCalledWith(expect.objectContaining({ paintComparisons: [], jobberQuoteLines: [], deletedJobberLineItemIds: ['remote-adjustment'], items: [expect.objectContaining({ timberRole: 'none', logicalKey: timberSourceKey })] }))
    } finally { await mounted.cleanup() }
  })
  it('does not recreate a manually deleted generated Optional when Main changes', async () => {
    vi.mocked(updateQuote).mockReset().mockResolvedValue({ ok: false, error: 'Held for inspection' })
    const mounted = await mountQuoteForm({ initialQuote: createTimberQuote(), areas: [{ id: timberAreaId, scope: 'interior', name: 'Doors', active: true, position: 0 }] })
    try {
      await act(async () => findElement(mounted.container, 'button', button => button.getAttribute('aria-label') === 'Delete Aqua adjustment')!.dispatchEvent(new Event('click', { bubbles: true })))
      const quantity = findElement(mounted.container, 'input', input => input.getAttribute('data-error-key') === `work:main:${timberSourceKey}:quantity`)!
      quantity.value = '2'
      await act(async () => quantity.dispatchEvent(new Event('input', { bubbles: true })))
      expect(mounted.container.textContent).not.toContain('Calculated Optional')
      await act(async () => findButton(mounted.container, 'Save changes')!.dispatchEvent(new Event('click', { bubbles: true })))
      expect(updateQuote).toHaveBeenCalledWith(expect.objectContaining({ jobberQuoteLines: [], deletedJobberLineItemIds: ['remote-adjustment'] }))
    } finally { await mounted.cleanup() }
  })
  it('keeps Timber details open when selecting the last required Aqua product completes the calculation', async () => {
    vi.mocked(searchProducts).mockReset().mockResolvedValue({ ok: true, data: [{ id: timberProductId, name: 'Aqua product', manufacturer: null, type: null, marketPrice: '10', actualPrice: '10', unit: 'each', active: true, colorCode: null }] })
    const mounted = await mountQuoteForm({ initialQuote: createTimberQuote(false), areas: [{ id: timberAreaId, scope: 'interior', name: 'Doors', active: true, position: 0 }] })
    try {
      const details = findElement(mounted.container, 'details', element => element.getAttribute('class') === 'pbc-paint-details')!
      expect(details.hasAttribute('open')).toBe(true)
      const search = findElement(mounted.container, 'input', input => input.getAttribute('data-error-key') === `work:main:${timberSourceKey}:comparison`)!
      search.value = 'Aqua'
      await act(async () => search.dispatchEvent(new Event('input', { bubbles: true })))
      await act(async () => new Promise(resolve => setTimeout(resolve, 230)))
      const result = findElement(mounted.container, 'button', button => button.getAttribute('role') === 'option' && button.textContent.includes('Aqua product'))!
      await act(async () => result.dispatchEvent(new Event('click', { bubbles: true })))
      expect(mounted.container.textContent).not.toContain('Aqua product required')
      expect(details.hasAttribute('open')).toBe(true)
    } finally { await mounted.cleanup() }
  })
  it.each(['main', 'option'] as const)('replaces a saved %s material in place and saves the new product price', async (scope) => {
    const item = {
      id: 'saved-material', quoteId: 'quote-workspace-1', productId: 'old-product',
      productNameSnapshot: 'Dulux Ceiling White 15L', marketPriceSnapshot: '180', actualPriceSnapshot: '180',
      quantity: '2', workingDays: '1', labourPerDay: '2', areaId: '00000000-0000-4000-8000-000000000301',
      areaNameSnapshot: 'Ceiling', areaScopeSnapshot: 'interior' as const,
      memo: 'Keep two coats', isCustom: false, position: 0,
    }
    const option = { ...createOptionRecord('option-1', 'Optional ceiling', 0), items: [{ ...item, optionId: 'option-1' }] }
    vi.mocked(searchProducts).mockReset().mockResolvedValue({ ok: true, data: [{
      id: '00000000-0000-4000-8000-000000000302', name: 'Dulux Ceiling White 1L', manufacturer: 'Dulux', type: 'Paint',
      unit: '1L', marketPrice: '45.90', actualPrice: '20', colorCode: null, active: true,
    }] })
    vi.mocked(updateQuote).mockReset().mockResolvedValue({ ok: false, error: 'Save held for inspection.' })
    const mounted = await mountQuoteForm({
      viewportWidth: 360,
      initialQuote: createQuoteRecord(scope === 'main' ? { items: [item] } : { options: [option] }),
      areas: [{ id: '00000000-0000-4000-8000-000000000301', scope: 'interior', name: 'Ceiling', active: true, position: 0 }],
    })
    try {
      if (scope === 'option') {
        const expand = findButton(findOptionCard(mounted.container, 'Optional ceiling')!, 'Expand')!
        await act(async () => expand.dispatchEvent(new Event('click', { bubbles: true })))
      }
      const edit = findElement(mounted.container, 'button', (button) => button.getAttribute('aria-label') === 'Edit Dulux Ceiling White 15L')!
      await act(async () => edit.dispatchEvent(new Event('click', { bubbles: true })))
      const name = findElement(mounted.container, 'input', (input) => input.getAttribute('aria-label') === 'Material name')!
      name.value = 'Dulux Ceiling White 1'
      await act(async () => name.dispatchEvent(new Event('input', { bubbles: true })))
      await act(async () => new Promise((resolve) => setTimeout(resolve, 230)))
      expect(searchProducts).toHaveBeenLastCalledWith({ query: 'Dulux Ceiling White 1', limit: 8 })
      const match = findElement(mounted.container, 'button', (button) => button.getAttribute('role') === 'option')!
      expect(match.textContent).toContain('Dulux Ceiling White 1L')
      await act(async () => match.dispatchEvent(new Event('click', { bubbles: true })))
      const replacementName = findElement(mounted.container, 'input', (input) => input.getAttribute('aria-label') === 'Material name')!
      expect(replacementName.value).toBe('Dulux Ceiling White 1L')
      expect(findAncestorWithAttribute(replacementName, 'data-editing')?.getAttribute('data-editing')).toBe('true')
      const save = findButton(mounted.container, 'Save changes')!
      await act(async () => save.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))
      expect(updateQuote).toHaveBeenCalledTimes(1)
      const payload = vi.mocked(updateQuote).mock.calls[0]?.[0] as {
        items: Record<string, unknown>[]; options: { items: Record<string, unknown>[] }[]
      }
      const savedItems = scope === 'main' ? payload.items : payload.options[0].items
      expect(savedItems).toHaveLength(1)
      expect(savedItems[0]).toMatchObject({
        productId: '00000000-0000-4000-8000-000000000302', productNameSnapshot: 'Dulux Ceiling White 1L',
        marketPriceSnapshot: 45.9, actualPriceSnapshot: 45.9,
        quantity: 2, workingDays: 1, labourPerDay: 2,
        areaId: '00000000-0000-4000-8000-000000000301', memo: 'Keep two coats',
      })
      expect(savedItems[0].sourceItemId).not.toBe('saved-material')
    } finally {
      await mounted.cleanup()
    }
  })
  it('offers three category buttons, permanent Review and direct footer save actions', () => {
    const html = renderToStaticMarkup(createElement(QuoteForm, { settings: DEFAULT_PRICING_SETTINGS, areas: [], productServices: [] }))
    for (const section of ['details', 'work', 'public', 'review']) {
      expect(html.match(new RegExp(`data-workspace-section="${section}"`, 'g'))).toHaveLength(1)
    }
    expect(html).toContain('Work &amp; materials')
    expect(html).toContain('data-workspace-section="details" data-active="true"')
    expect(html).toContain('Review totals')
    const navigation = html.match(/<nav[^>]*aria-label="Quote workspace"[\s\S]*?<\/nav>/)?.[0] ?? ''
    expect(navigation.match(/<button/g)).toHaveLength(3)
    expect(navigation).not.toContain('<select')
    expect(navigation).not.toContain('>Review<')
    expect(navigation).toContain('aria-controls="quote-workspace-work"')
    expect(html).toContain('data-workspace-section="review" data-active="true"')
    expect(html).not.toContain('pbc-totalbar-more')
    expect(html).toContain('>Save &amp; Sync</button>')
  })

  it('keeps entered values and the persisted domain draft unchanged across workspace navigation', async () => {
    const mounted = await mountQuoteForm()
    try {
      const customerInput = findWorkspace(mounted.container, 'details')?.querySelectorAll('input')[0]
      expect(customerInput).toBeDefined()
      if (!customerInput) return
      customerInput.value = 'Draft customer'
      await act(async () => customerInput.dispatchEvent(new Event('input', { bubbles: true })))
      await act(async () => new Promise((resolve) => setTimeout(resolve, 340)))

      const draftKey = getQuoteDraftStorageKey('user-a')
      const draftBeforeNavigation = mounted.storage.getItem(draftKey)
      expect(draftBeforeNavigation).not.toBeNull()
      const pricingShortcut = findButton(mounted.container, 'Products & pricing')
      expect(pricingShortcut).toBeDefined()
      if (!pricingShortcut) return
      await act(async () => pricingShortcut.dispatchEvent(new Event('click', { bubbles: true })))
      await settle()
      expect(findWorkspace(mounted.container, 'public')?.getAttribute('data-active')).toBe('true')
      expect(mounted.document.activeElement).toBe(findWorkspace(mounted.container, 'public'))
      expect(customerInput.value).toBe('Draft customer')
      expect(mounted.storage.getItem(draftKey)).toBe(draftBeforeNavigation)
      for (const [section, label] of [['work', 'Work & materials'], ['details', 'Details'], ['public', 'Public quote']]) {
        const category = findButton(mounted.container, label)
        expect(category).toBeDefined()
        if (!category) return
        await act(async () => category.dispatchEvent(new Event('click', { bubbles: true })))
        await settle()
        expect(findWorkspace(mounted.container, section)?.getAttribute('data-active')).toBe('true')
        expect(category.getAttribute('aria-pressed')).toBe('true')
        expect(findWorkspace(mounted.container, 'review')?.getAttribute('data-active')).toBe('true')
        expect(customerInput.value).toBe('Draft customer')
        expect(mounted.storage.getItem(draftKey)).toBe(draftBeforeNavigation)
      }
      const review = findElement(mounted.container, 'button', (button) => button.getAttribute('aria-label') === 'Review totals')
      expect(review).toBeDefined()
      if (!review) return
      await act(async () => review.dispatchEvent(new Event('click', { bubbles: true })))
      await settle()
      expect(findWorkspace(mounted.container, 'public')?.getAttribute('data-active')).toBe('true')
      expect(mounted.document.activeElement).toBe(findWorkspace(mounted.container, 'review'))
      expect(mounted.storage.getItem(draftKey)).toBe(draftBeforeNavigation)
    } finally {
      await mounted.cleanup()
    }
  })

  it('reveals and focuses an invalid hidden Roof material before save', async () => {
    vi.mocked(updateQuote).mockReset()
    const quote = createQuoteRecord({ items: [{
      id: 'roof-material', quoteId: 'quote-workspace-1', productId: null,
      productNameSnapshot: 'Roof coating', marketPriceSnapshot: '100', actualPriceSnapshot: '80',
      quantity: '0', workingDays: '1', labourPerDay: '1', areaId: 'roof-area',
      areaNameSnapshot: 'Roof', areaScopeSnapshot: 'roof', isCustom: true, position: 0,
    }] })
    const mounted = await mountQuoteForm({ initialQuote: quote, areas: [{ id: 'roof-area', scope: 'roof', name: 'Roof', active: true, position: 0 }] })
    try {
      const save = findButton(mounted.container, 'Save changes')
      expect(save).toBeDefined()
      if (!save) return
      await act(async () => save.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))
      await settle()

      expect(vi.mocked(updateQuote)).not.toHaveBeenCalled()
      expect(findWorkspace(mounted.container, 'work')?.getAttribute('data-active')).toBe('true')
      const quantity = findElement(mounted.container, 'input', (input) => input.getAttribute('data-error-key') === 'work:main:roof-material:quantity')
      expect(quantity).toBeDefined()
      expect(mounted.document.activeElement).toBe(quantity)
      expect(findAncestorWithAttribute(quantity, 'data-editing')?.getAttribute('data-editing')).toBe('true')
      expect(findElement(mounted.container, 'button', (button) => button.textContent === 'Roof' && button.getAttribute('aria-pressed') === 'true')).toBeDefined()
    } finally {
      await mounted.cleanup()
    }
  })

  it('expands the hidden option scope and editor for an invalid option material', async () => {
    vi.mocked(updateQuote).mockReset()
    const quote = createQuoteRecord({ options: [{
      id: 'option-roof', quoteId: 'quote-workspace-1', title: 'Roof option',
      workingDays: '1', labourPerDay: '1', materialMarket: '100', materialActual: '80',
      formula1Total: '0', formula2Total: '0', formula3Total: '0', formula4Total: '0', formula5Total: '0',
      selectedMin: 4, selectedMax: 1, subtotal: '0', finalTotal: '0', position: 0,
      items: [{
        id: 'option-roof-material', optionId: 'option-roof', productId: null,
        productNameSnapshot: 'Option coating', marketPriceSnapshot: '100', actualPriceSnapshot: '80',
        quantity: '0', workingDays: '1', labourPerDay: '1', areaId: 'roof-area',
        areaNameSnapshot: 'Roof', areaScopeSnapshot: 'roof', isCustom: true, position: 0,
      }],
    }] })
    const mounted = await mountQuoteForm({ initialQuote: quote, areas: [{ id: 'roof-area', scope: 'roof', name: 'Roof', active: true, position: 0 }] })
    try {
      const save = findButton(mounted.container, 'Save changes')
      expect(save).toBeDefined()
      if (!save) return
      await act(async () => save.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))
      await settle()

      expect(vi.mocked(updateQuote)).not.toHaveBeenCalled()
      expect(findWorkspace(mounted.container, 'work')?.getAttribute('data-active')).toBe('true')
      expect(findButton(mounted.container, 'Collapse')).toBeDefined()
      const quantity = findElement(mounted.container, 'input', (input) => input.getAttribute('data-error-key') === 'work:option-roof:option-roof-material:quantity')
      expect(quantity).toBeDefined()
      expect(mounted.document.activeElement).toBe(quantity)
      expect(findAncestorWithAttribute(quantity, 'data-editing')?.getAttribute('data-editing')).toBe('true')
    } finally {
      await mounted.cleanup()
    }
  })

  it('allows local save but guards sync when no saved Jobber id exists', async () => {
    const createQuoteMock = vi.mocked(createQuote)
    createQuoteMock.mockReset()
    let resolveSave: ((value: { ok: false; error: string }) => void) | undefined
    createQuoteMock.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve }))
    const mounted = await mountQuoteForm()
    try {
      const localSave = findButton(mounted.container, 'Save')
      const syncSave = findButton(mounted.container, 'Save & Sync')
      expect(localSave?.disabled).toBe(false)
      expect(syncSave?.disabled).toBe(true)
      if (!localSave) return
      await act(async () => {
        localSave.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
        await Promise.resolve()
      })
      expect(createQuoteMock).toHaveBeenCalledTimes(1)
      expect(createQuoteMock).toHaveBeenCalledWith(expect.objectContaining({ syncJobber: false }))
      expect(localSave.disabled).toBe(true)
      expect(syncSave?.disabled).toBe(true)
      await act(async () => {
        resolveSave?.({ ok: false, error: 'Save held for retry.' })
        await Promise.resolve()
      })
      await settle()
    } finally {
      await mounted.cleanup()
    }
  })

  it('keeps local quote editing and Save available while preview blocks Jobber actions', async () => {
    const updateQuoteMock = vi.mocked(updateQuote)
    updateQuoteMock.mockReset()
    updateQuoteMock.mockResolvedValueOnce({ ok: false, error: 'Save held for inspection.' })
    const notice = 'Jobber is disabled in this preview environment.'
    const mounted = await mountQuoteForm({
      initialQuote: createQuoteRecord({ jobberQuoteId: 'jobber-quote-1' }),
      jobberEnabled: false,
      jobberNotice: notice,
    })

    try {
      const localSave = findButton(mounted.container, 'Save')
      const syncSave = findButton(mounted.container, 'Save & Sync')
      const refresh = findButton(mounted.container, 'Refresh from Jobber')
      const addOption = findButton(mounted.container, 'Add Option')
      const addLineItem = findButton(mounted.container, 'Add Line Item')

      expect(mounted.container.textContent).toContain(notice)
      expect(localSave?.disabled).toBe(false)
      expect(syncSave?.disabled).toBe(true)
      expect(refresh?.disabled).toBe(true)
      expect(addOption?.disabled).toBe(false)
      expect(addLineItem?.disabled).toBe(false)

      await act(async () => {
        syncSave?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      expect(updateQuoteMock).not.toHaveBeenCalled()

      await act(async () => {
        localSave?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      })
      expect(updateQuoteMock).toHaveBeenCalledWith(expect.objectContaining({ syncJobber: false }))
    } finally {
      await mounted.cleanup()
    }
  })

  it('guards both save actions while an explicit Jobber sync is pending', async () => {
    const updateQuoteMock = vi.mocked(updateQuote)
    updateQuoteMock.mockReset()
    let resolveSave: ((value: { ok: false; error: string }) => void) | undefined
    updateQuoteMock.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve }))
    const mounted = await mountQuoteForm({ initialQuote: createQuoteRecord({ jobberQuoteId: 'jobber-quote-1' }) })
    try {
      const localSave = findButton(mounted.container, 'Save')
      const syncSave = findButton(mounted.container, 'Save & Sync')
      expect(localSave?.disabled).toBe(false)
      expect(syncSave?.disabled).toBe(false)
      if (!syncSave) return
      await act(async () => {
        syncSave.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
        await Promise.resolve()
      })
      expect(updateQuoteMock).toHaveBeenCalledTimes(1)
      expect(updateQuoteMock).toHaveBeenCalledWith(expect.objectContaining({ syncJobber: true }))
      expect(localSave?.disabled).toBe(true)
      expect(syncSave.disabled).toBe(true)
      await act(async () => {
        resolveSave?.({ ok: false, error: 'Sync held for retry.' })
        await Promise.resolve()
      })
      await settle()
    } finally {
      await mounted.cleanup()
    }
  })

  it('preserves entered values and moves to Review when save fails', async () => {
    routerPushMock.mockReset()
    vi.mocked(createQuote).mockReset()
    vi.mocked(createQuote).mockResolvedValueOnce({ ok: false, error: 'Version conflict. Reload and try again.' })
    const mounted = await mountQuoteForm()
    try {
      const customerInput = findWorkspace(mounted.container, 'details')?.querySelectorAll('input')[0]
      expect(customerInput).toBeDefined()
      if (!customerInput) return
      customerInput.value = 'Keep this customer'
      await act(async () => customerInput.dispatchEvent(new Event('input', { bubbles: true })))
      const save = findButton(mounted.container, 'Save quote')
      expect(save).toBeDefined()
      if (!save) return
      await act(async () => {
        save.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
        await Promise.resolve()
      })
      await settle()

      expect(customerInput.value).toBe('Keep this customer')
      expect(findWorkspace(mounted.container, 'review')?.getAttribute('data-active')).toBe('true')
      expect(findWorkspace(mounted.container, 'details')?.getAttribute('data-active')).toBe('true')
      expect(mounted.document.activeElement?.getAttribute('data-error-key')).toBe('review:form:summary')
      expect(mounted.container.textContent).toContain('Version conflict. Reload and try again.')
      expect(routerPushMock).not.toHaveBeenCalled()
    } finally {
      await mounted.cleanup()
    }
  })

  it('does not mark the quote dirty when only option expansion changes', async () => {
    routerPushMock.mockReset()
    const quote = createQuoteRecord({ options: [{
      id: 'option-1', quoteId: 'quote-workspace-1', title: 'Optional fence',
      workingDays: '0', labourPerDay: '0', materialMarket: '0', materialActual: '0',
      formula1Total: '0', formula2Total: '0', formula3Total: '0', formula4Total: '0', formula5Total: '0',
      selectedMin: 4, selectedMax: 1, subtotal: '0', finalTotal: '0', position: 0, items: [],
    }] })
    const mounted = await mountQuoteForm({ initialQuote: quote })
    try {
      const expand = findButton(mounted.container, 'Expand')
      expect(expand).toBeDefined()
      if (!expand) return
      await act(async () => expand.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))
      expect(findButton(mounted.container, 'Collapse')).toBeDefined()

      const beforeUnload = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(beforeUnload)
      expect(beforeUnload.defaultPrevented).toBe(false)
      expect(mounted.storage.getItem(getQuoteDraftStorageKey('user-a', quote.id))).toBeNull()

      const cancel = findButton(mounted.container, 'Cancel')
      expect(cancel).toBeDefined()
      if (!cancel) return
      await act(async () => cancel.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))
      expect(routerPushMock).toHaveBeenCalledWith(`/quotes/${quote.id}`)
      expect(findElement(mounted.container, 'div', (element) => element.getAttribute('role') === 'dialog')).toBeUndefined()
    } finally {
      await mounted.cleanup()
    }
  })

  it('keeps multiple option editors open independently on desktop', async () => {
    const quote = createQuoteRecord({ options: [
      createOptionRecord('option-1', 'Optional fence', 0),
      createOptionRecord('option-2', 'Optional gate', 1),
    ] })
    const mounted = await mountQuoteForm({ initialQuote: quote, viewportWidth: 1280 })
    try {
      const firstCard = findOptionCard(mounted.container, 'Optional fence')
      const secondCard = findOptionCard(mounted.container, 'Optional gate')
      const firstExpand = firstCard ? findButton(firstCard, 'Expand') : undefined
      const secondExpand = secondCard ? findButton(secondCard, 'Expand') : undefined
      expect(firstExpand).toBeDefined()
      expect(secondExpand).toBeDefined()
      if (!firstExpand || !secondExpand) return

      await act(async () => firstExpand.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))
      await act(async () => secondExpand.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))

      expect(findOptionCard(mounted.container, 'Optional fence')?.getAttribute('data-expanded')).toBe('true')
      expect(findOptionCard(mounted.container, 'Optional gate')?.getAttribute('data-expanded')).toBe('true')
    } finally {
      await mounted.cleanup()
    }
  })

  it('keeps only the most recently opened option editor open on mobile', async () => {
    const quote = createQuoteRecord({ options: [
      createOptionRecord('option-1', 'Optional fence', 0),
      createOptionRecord('option-2', 'Optional gate', 1),
    ] })
    const mounted = await mountQuoteForm({ initialQuote: quote, viewportWidth: 390 })
    try {
      const firstCard = findOptionCard(mounted.container, 'Optional fence')
      const secondCard = findOptionCard(mounted.container, 'Optional gate')
      const firstExpand = firstCard ? findButton(firstCard, 'Expand') : undefined
      const secondExpand = secondCard ? findButton(secondCard, 'Expand') : undefined
      expect(firstExpand).toBeDefined()
      expect(secondExpand).toBeDefined()
      if (!firstExpand || !secondExpand) return

      await act(async () => firstExpand.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))
      await act(async () => secondExpand.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))

      expect(findOptionCard(mounted.container, 'Optional fence')?.getAttribute('data-expanded')).toBe('false')
      expect(findOptionCard(mounted.container, 'Optional gate')?.getAttribute('data-expanded')).toBe('true')
    } finally {
      await mounted.cleanup()
    }
  })

  it('opens each newly added option while keeping only the newest one open on mobile', async () => {
    const mounted = await mountQuoteForm({ viewportWidth: 390 })
    try {
      const addOption = findButton(mounted.container, 'Add Option')
      expect(addOption).toBeDefined()
      if (!addOption) return

      await act(async () => addOption.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))
      await settle()
      expect(findOptionCard(mounted.container, 'Option 1')?.getAttribute('data-expanded')).toBe('true')

      await act(async () => addOption.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })))
      await settle()
      expect(findOptionCard(mounted.container, 'Option 1')?.getAttribute('data-expanded')).toBe('false')
      expect(findOptionCard(mounted.container, 'Option 2')?.getAttribute('data-expanded')).toBe('true')
    } finally {
      await mounted.cleanup()
    }
  })
})
