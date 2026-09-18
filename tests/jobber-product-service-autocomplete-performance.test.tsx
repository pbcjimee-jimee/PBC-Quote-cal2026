import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestDom, type TestDocument, type TestElement } from '@/tests/helpers/test-dom'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'
import type { ProductServiceRecord } from '@/lib/product-services/types'

const productServiceActions = vi.hoisted(() => ({
  listProductServices: vi.fn(),
  searchProductServices: vi.fn(),
}))

vi.mock('@/lib/actions/product-services', () => productServiceActions)

import { JobberProductServiceEditor } from '@/components/quote-form/jobber-product-service-editor'

const catalog: ProductServiceRecord[] = [
  {
    id: 'service-ceiling',
    name: 'Ceiling preparation',
    description: 'Prepare and paint ceilings',
    category: 'Interior',
    unitPrice: '450.00',
    unitCost: '200.00',
    bookable: false,
    durationMinutes: null,
    quantityEnabled: true,
    minimumQuantity: '1.00',
    maximumQuantity: null,
    taxable: true,
    active: true,
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
  },
  {
    id: 'service-walls',
    name: 'Wall preparation',
    description: 'Prepare and paint walls',
    category: 'Interior',
    unitPrice: '650.00',
    unitCost: '300.00',
    bookable: false,
    durationMinutes: null,
    quantityEnabled: true,
    minimumQuantity: '1.00',
    maximumQuantity: null,
    taxable: true,
    active: true,
    createdAt: '2026-08-29T00:00:00.000Z',
    updatedAt: '2026-08-29T00:00:00.000Z',
  },
]

const emptyLine: JobberQuoteLineItemDraft = {
  id: 'line-1',
  kind: 'line_item',
  name: '',
  description: '',
  quantity: '1',
  unitPrice: '0.00',
  taxable: true,
  clientVisible: true,
}

const COLD_SEARCH_DEBOUNCE_MS = 75

function ControlledEditor({ productServices }: { productServices?: ProductServiceRecord[] }) {
  const [lines, setLines] = useState([emptyLine])
  return createElement(JobberProductServiceEditor, { value: lines, productServices, onChange: setLines })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function renderEditor(testDocument: TestDocument, productServices?: ProductServiceRecord[]) {
  const container = testDocument.createElement('div')
  testDocument.body.appendChild(container)
  const root = createRoot(container as unknown as Element)

  await act(async () => {
    root.render(createElement(ControlledEditor, { productServices }))
    await Promise.resolve()
  })

  const input = container.querySelectorAll('input').find((element) => (
    element.getAttribute('aria-label') === 'Line item name'
  ))
  expect(input).toBeDefined()

  return { container, input, root }
}

async function typeLookup(input: TestElement, query: string) {
  await act(async () => {
    input.dispatchEvent(new Event('focusin', { bubbles: true }))
    input.value = query
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function getDropdown(container: TestElement) {
  return container.querySelectorAll('div').find((element) => (
    element.getAttribute('aria-label') === 'Product / Service dropdown'
  ))
}

describe('Jobber Product / Service autocomplete performance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productServiceActions.listProductServices.mockResolvedValue({ ok: true, data: catalog })
    productServiceActions.searchProductServices.mockResolvedValue({ ok: true, data: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows locally filtered matches immediately after the background catalog is ready', async () => {
    vi.useFakeTimers()
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    let root: Root | null = null

    try {
      const rendered = await renderEditor(testDocument)
      root = rendered.root
      const { container, input } = rendered
      if (!input) return

      await typeLookup(input, 'ceil')

      const dropdown = getDropdown(container)
      expect(dropdown?.textContent).toContain('Ceiling preparation')
      expect(dropdown?.textContent).not.toContain('Wall preparation')
      expect(productServiceActions.listProductServices).toHaveBeenCalledTimes(1)
      expect(productServiceActions.searchProductServices).not.toHaveBeenCalled()
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })

  it('merges older catalog matches from a background search without delaying local matches', async () => {
    vi.useFakeTimers()
    const olderService: ProductServiceRecord = {
      ...catalog[0],
      id: 'service-legacy-ceiling',
      name: 'Legacy ceiling restoration',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }
    productServiceActions.searchProductServices.mockResolvedValue({ ok: true, data: [olderService] })
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    let root: Root | null = null

    try {
      const rendered = await renderEditor(testDocument)
      root = rendered.root
      const { container, input } = rendered
      if (!input) return

      await typeLookup(input, 'ceil')
      expect(getDropdown(container)?.textContent).toContain('Ceiling preparation')
      expect(getDropdown(container)?.textContent).not.toContain('Legacy ceiling restoration')
      expect(productServiceActions.searchProductServices).not.toHaveBeenCalled()

      await act(async () => {
        vi.advanceTimersByTime(180)
        await Promise.resolve()
      })

      expect(productServiceActions.searchProductServices).toHaveBeenCalledWith({
        query: 'ceil',
        limit: 300,
        match: 'name',
      })
      expect(getDropdown(container)?.textContent).toContain('Legacy ceiling restoration')
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })

  it('uses a short fallback debounce when the background catalog preload rejects', async () => {
    vi.useFakeTimers()
    productServiceActions.listProductServices.mockRejectedValueOnce(new Error('temporary preload failure'))
    productServiceActions.searchProductServices.mockResolvedValue({ ok: true, data: [catalog[0]] })
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    let root: Root | null = null

    try {
      const rendered = await renderEditor(testDocument)
      root = rendered.root
      const { container, input } = rendered
      if (!input) return

      await typeLookup(input, 'ceiling')
      await act(async () => {
        vi.advanceTimersByTime(COLD_SEARCH_DEBOUNCE_MS - 1)
        await Promise.resolve()
      })
      expect(productServiceActions.searchProductServices).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(1)
        await Promise.resolve()
      })

      expect(productServiceActions.searchProductServices).toHaveBeenCalledTimes(1)
      expect(getDropdown(container)?.textContent).toContain('Ceiling preparation')
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })

  it('starts a cold query after the short fallback debounce and updates when preload arrives', async () => {
    vi.useFakeTimers()
    const pendingCatalog = deferred<{ ok: true; data: ProductServiceRecord[] }>()
    productServiceActions.listProductServices.mockReturnValueOnce(pendingCatalog.promise)
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    let root: Root | null = null

    try {
      const rendered = await renderEditor(testDocument)
      root = rendered.root
      const { container, input } = rendered
      if (!input) return

      await typeLookup(input, 'ceil')
      expect(productServiceActions.searchProductServices).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(COLD_SEARCH_DEBOUNCE_MS)
        await Promise.resolve()
      })
      expect(getDropdown(container)).toBeUndefined()
      expect(productServiceActions.searchProductServices).toHaveBeenCalledWith({
        query: 'ceil',
        limit: 300,
        match: 'name',
      })

      await act(async () => {
        pendingCatalog.resolve({ ok: true, data: catalog })
        await pendingCatalog.promise
        await Promise.resolve()
      })

      expect(getDropdown(container)?.textContent).toContain('Ceiling preparation')
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })

  it('coalesces fast cold typing into one search for the latest query', async () => {
    vi.useFakeTimers()
    const pendingCatalog = deferred<{ ok: true; data: ProductServiceRecord[] }>()
    productServiceActions.listProductServices.mockReturnValueOnce(pendingCatalog.promise)
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    let root: Root | null = null

    try {
      const rendered = await renderEditor(testDocument)
      root = rendered.root
      const { input } = rendered
      if (!input) return

      await typeLookup(input, 'c')
      await typeLookup(input, 'ce')
      await typeLookup(input, 'ceil')
      await act(async () => {
        vi.advanceTimersByTime(COLD_SEARCH_DEBOUNCE_MS - 1)
      })
      expect(productServiceActions.searchProductServices).not.toHaveBeenCalled()

      await act(async () => {
        vi.advanceTimersByTime(1)
        await Promise.resolve()
      })
      expect(productServiceActions.searchProductServices).toHaveBeenCalledTimes(1)
      expect(productServiceActions.searchProductServices).toHaveBeenCalledWith({
        query: 'ceil',
        limit: 300,
        match: 'name',
      })
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })

  it('reuses a pending search when preload changes the same query to a local hit', async () => {
    vi.useFakeTimers()
    const pendingCatalog = deferred<{ ok: true; data: ProductServiceRecord[] }>()
    const pendingSearch = deferred<{ ok: true; data: ProductServiceRecord[] }>()
    productServiceActions.listProductServices.mockReturnValueOnce(pendingCatalog.promise)
    productServiceActions.searchProductServices.mockReturnValueOnce(pendingSearch.promise)
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    let root: Root | null = null

    try {
      const rendered = await renderEditor(testDocument)
      root = rendered.root
      const { input } = rendered
      if (!input) return

      await typeLookup(input, 'ceil')
      await act(async () => {
        vi.advanceTimersByTime(COLD_SEARCH_DEBOUNCE_MS)
      })
      expect(productServiceActions.searchProductServices).toHaveBeenCalledTimes(1)

      await act(async () => {
        pendingCatalog.resolve({ ok: true, data: catalog })
        await pendingCatalog.promise
        await Promise.resolve()
      })
      await act(async () => {
        vi.advanceTimersByTime(180)
      })
      expect(productServiceActions.searchProductServices).toHaveBeenCalledTimes(1)

      await act(async () => {
        pendingSearch.resolve({ ok: true, data: [catalog[0]] })
        await pendingSearch.promise
        await Promise.resolve()
      })
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })

  it('caps merged autocomplete results at 300 rendered options', async () => {
    vi.useFakeTimers()
    const localCatalog = Array.from({ length: 300 }, (_, index): ProductServiceRecord => ({
      ...catalog[0],
      id: `local-${index}`,
      name: `Shared local service ${index}`,
    }))
    const remoteCatalog = Array.from({ length: 300 }, (_, index): ProductServiceRecord => ({
      ...catalog[0],
      id: `remote-${index}`,
      name: `Shared remote service ${index}`,
    }))
    productServiceActions.listProductServices.mockResolvedValue({ ok: true, data: localCatalog })
    productServiceActions.searchProductServices.mockResolvedValue({ ok: true, data: remoteCatalog })
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    let root: Root | null = null

    try {
      const rendered = await renderEditor(testDocument)
      root = rendered.root
      const { container, input } = rendered
      if (!input) return

      await typeLookup(input, 'shared')
      expect(getDropdown(container)?.querySelectorAll('button')).toHaveLength(300)

      await act(async () => {
        vi.advanceTimersByTime(180)
        await Promise.resolve()
      })

      expect(getDropdown(container)?.querySelectorAll('button')).toHaveLength(300)
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })

  it('ignores a stale search response after the lookup query changes', async () => {
    vi.useFakeTimers()
    productServiceActions.listProductServices.mockResolvedValue({ ok: true, data: [] })
    const alphaSearch = deferred<{ ok: true; data: ProductServiceRecord[] }>()
    const betaSearch = deferred<{ ok: true; data: ProductServiceRecord[] }>()
    productServiceActions.searchProductServices
      .mockReturnValueOnce(alphaSearch.promise)
      .mockReturnValueOnce(betaSearch.promise)
    const alphaService: ProductServiceRecord = { ...catalog[0], id: 'alpha', name: 'Alpha service' }
    const betaService: ProductServiceRecord = { ...catalog[0], id: 'beta', name: 'Beta service' }
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    let root: Root | null = null

    try {
      const rendered = await renderEditor(testDocument)
      root = rendered.root
      const { container, input } = rendered
      if (!input) return

      await typeLookup(input, 'alpha')
      await act(async () => {
        vi.advanceTimersByTime(COLD_SEARCH_DEBOUNCE_MS)
      })
      await typeLookup(input, 'beta')
      await act(async () => {
        vi.advanceTimersByTime(COLD_SEARCH_DEBOUNCE_MS)
      })
      expect(productServiceActions.searchProductServices).toHaveBeenCalledTimes(2)

      await act(async () => {
        betaSearch.resolve({ ok: true, data: [betaService] })
        await betaSearch.promise
        await Promise.resolve()
      })
      expect(getDropdown(container)?.textContent).toContain('Beta service')

      await act(async () => {
        alphaSearch.resolve({ ok: true, data: [alphaService] })
        await alphaSearch.promise
        await Promise.resolve()
      })
      expect(getDropdown(container)?.textContent).toContain('Beta service')
      expect(getDropdown(container)?.textContent).not.toContain('Alpha service')
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })

  it('handles a rejected query fallback without an unhandled error', async () => {
    vi.useFakeTimers()
    productServiceActions.listProductServices.mockResolvedValue({ ok: true, data: [] })
    productServiceActions.searchProductServices.mockRejectedValueOnce(new Error('temporary search failure'))
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    let root: Root | null = null

    try {
      const rendered = await renderEditor(testDocument)
      root = rendered.root
      const { container, input } = rendered
      if (!input) return

      await typeLookup(input, 'missing')
      await act(async () => {
        vi.advanceTimersByTime(COLD_SEARCH_DEBOUNCE_MS)
        await Promise.resolve()
      })

      expect(productServiceActions.searchProductServices).toHaveBeenCalledTimes(1)
      expect(getDropdown(container)).toBeUndefined()
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })

  it('treats a supplied empty catalog as authoritative and skips background requests', async () => {
    vi.useFakeTimers()
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    let root: Root | null = null

    try {
      const rendered = await renderEditor(testDocument, [])
      root = rendered.root
      const { input } = rendered
      if (!input) return

      await typeLookup(input, 'ceil')
      await act(async () => {
        vi.advanceTimersByTime(180)
        await Promise.resolve()
      })

      expect(productServiceActions.listProductServices).not.toHaveBeenCalled()
      expect(productServiceActions.searchProductServices).not.toHaveBeenCalled()
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })
})
