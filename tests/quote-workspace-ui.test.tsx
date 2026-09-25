import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { QuoteForm } from '@/components/quote-form/quote-form'
import { getQuoteDraftStorageKey } from '@/components/quote-form/quote-draft'
import { createQuote, updateQuote } from '@/lib/actions/quotes'
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
  initialQuote?: QuoteRecord
  areas?: { id: string; scope: 'interior' | 'exterior' | 'roof'; name: string; active: boolean; position: number }[]
  viewportWidth?: number
} = {}) {
  const installed = installTestDom()
  const restoreElementRuntime = installElementRuntime()
  const storage = new MemoryStorage()
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
      matches: query === '(max-width: 720px)' ? (options.viewportWidth ?? 1280) <= 720 : false,
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
      settings: DEFAULT_PRICING_SETTINGS,
      areas: options.areas ?? [], productServices: [], quoteLineTemplates: [],
      initialQuote: options.initialQuote,
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

      const draftKey = getQuoteDraftStorageKey()
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
      expect(mounted.storage.getItem(getQuoteDraftStorageKey(quote.id))).toBeNull()

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
