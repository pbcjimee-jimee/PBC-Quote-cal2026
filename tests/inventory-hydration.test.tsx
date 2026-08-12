import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InventoryManager } from '@/components/inventory/inventory-manager'
import type { InventoryItemRecord } from '@/lib/inventory/types'
import { cloneTestElement, installTestDom, type TestElement } from '@/tests/helpers/test-dom'

const inventoryActions = vi.hoisted(() => ({
  createInventoryItem: vi.fn(),
  deleteInventoryItem: vi.fn(),
  importInventoryCSV: vi.fn(),
  listInventory: vi.fn(),
  updateInventoryMovement: vi.fn(),
  updateInventoryItem: vi.fn(),
}))

vi.mock('@/lib/actions/inventory', () => inventoryActions)

const item: InventoryItemRecord = {
  id: '00000000-0000-4000-8000-000000000071',
  name: 'Mobile interaction item',
  category: 'Tools',
  brand: 'Dewalt',
  modelSpecification: null,
  colour: null,
  sizeOrSerial: 'SN-071',
  quantity: '1.00',
  purchaseDate: null,
  usedDate: null,
  usedLocationText: null,
  status: 'in_stock',
  notes: null,
  active: true,
  sourceYear: '2026',
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
}

const searchItem: InventoryItemRecord = {
  ...item,
  id: '00000000-0000-4000-8000-000000000072',
  name: 'Server search result',
}

const moreItem: InventoryItemRecord = {
  ...item,
  id: '00000000-0000-4000-8000-000000000073',
  name: 'Loaded later',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function findMobileSummary(container: TestElement): TestElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => (
    button.getAttribute('aria-controls') === `inventory-mobile-editor-${item.id}`
  ))
}

function findMobileEditor(container: TestElement): TestElement | undefined {
  return Array.from(container.querySelectorAll('div')).find((element) => (
    element.getAttribute('id') === `inventory-mobile-editor-${item.id}`
  ))
}

describe('InventoryManager client interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inventoryActions.listInventory.mockReset()
  })

  it('debounces server search, replaces results, resets filters, and merges load-more rows by ID', async () => {
    vi.useFakeTimers()
    inventoryActions.listInventory
      .mockResolvedValueOnce({
        ok: true,
        data: { items: [searchItem], hasMore: true, nextOffset: 50 },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { items: [searchItem, searchItem, moreItem], hasMore: false, nextOffset: null },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { items: [moreItem], hasMore: false, nextOffset: null },
      })
    const { cleanup, document: testDocument } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = testDocument.createElement('div')
      root = createRoot(container as unknown as Element)

      await act(async () => {
        root!.render(createElement(InventoryManager, {
          initialPage: { items: [item], hasMore: false, nextOffset: null },
        }))
      })

      const search = Array.from(container.querySelectorAll('input')).find((input) => (
        input.getAttribute('placeholder') === 'Search inventory...'
      ))
      expect(search).toBeDefined()

      await act(async () => {
        search!.value = 'server result'
        search!.dispatchEvent(new Event('input', { bubbles: true }))
        search!.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await act(async () => {
        vi.advanceTimersByTime(299)
      })
      expect(inventoryActions.listInventory).not.toHaveBeenCalled()

      await act(async () => {
        vi.advanceTimersByTime(1)
        await Promise.resolve()
      })
      expect(inventoryActions.listInventory).toHaveBeenNthCalledWith(1, {
        query: 'server result',
        status: undefined,
        category: undefined,
        offset: 0,
        limit: 50,
      })
      expect(container.textContent).toContain(searchItem.name)
      expect(container.textContent).not.toContain(item.name)

      const loadMore = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Load more')
      expect(loadMore).toBeDefined()
      await act(async () => {
        loadMore!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })
      expect(inventoryActions.listInventory).toHaveBeenNthCalledWith(2, {
        query: 'server result',
        status: undefined,
        category: undefined,
        offset: 50,
        limit: 50,
      })
      expect(Array.from(container.querySelectorAll('button')).filter((button) => (
        button.getAttribute('aria-controls') === `inventory-mobile-editor-${searchItem.id}`
      ))).toHaveLength(1)
      expect(container.textContent).toContain(moreItem.name)

      const status = container.querySelectorAll('select')[0]
      await act(async () => {
        status.value = 'out'
        status.dispatchEvent(new Event('change', { bubbles: true }))
        vi.advanceTimersByTime(300)
        await Promise.resolve()
      })
      expect(inventoryActions.listInventory).toHaveBeenNthCalledWith(3, {
        query: 'server result',
        status: 'out',
        category: undefined,
        offset: 0,
        limit: 50,
      })
      expect(container.textContent).not.toContain(searchItem.name)
      expect(container.textContent).toContain(moreItem.name)
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        vi.useRealTimers()
        cleanup()
      }
    }
  })

  it('does not load the previous page while a new filter is waiting for debounce', async () => {
    vi.useFakeTimers()
    inventoryActions.listInventory.mockResolvedValueOnce({
      ok: true,
      data: { items: [searchItem], hasMore: false, nextOffset: null },
    })
    const { cleanup, document: testDocument } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = testDocument.createElement('div')
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(InventoryManager, {
          initialPage: { items: [item], hasMore: true, nextOffset: 50 },
        }))
      })
      const search = Array.from(container.querySelectorAll('input')).find((input) => (
        input.getAttribute('placeholder') === 'Search inventory...'
      ))!
      const loadMore = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Load more')!

      await act(async () => {
        search.value = 'server result'
        search.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(loadMore.disabled).toBe(true)
      await act(async () => {
        loadMore.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        vi.advanceTimersByTime(300)
        await Promise.resolve()
      })

      expect(inventoryActions.listInventory).toHaveBeenCalledTimes(1)
      expect(inventoryActions.listInventory).toHaveBeenCalledWith(expect.objectContaining({
        query: 'server result',
        offset: 0,
      }))
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        vi.useRealTimers()
        cleanup()
      }
    }
  })

  it('ignores a stale inventory search response that resolves after the latest request', async () => {
    vi.useFakeTimers()
    const stale = deferred<{ ok: true; data: { items: InventoryItemRecord[]; hasMore: false; nextOffset: null } }>()
    const latest = deferred<{ ok: true; data: { items: InventoryItemRecord[]; hasMore: false; nextOffset: null } }>()
    inventoryActions.listInventory
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise)
    const { cleanup, document: testDocument } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = testDocument.createElement('div')
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(InventoryManager, {
          initialPage: { items: [item], hasMore: false, nextOffset: null },
        }))
      })
      const search = Array.from(container.querySelectorAll('input')).find((input) => (
        input.getAttribute('placeholder') === 'Search inventory...'
      ))!

      await act(async () => {
        search.value = 'stale'
        search.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => {
        vi.advanceTimersByTime(300)
      })
      await act(async () => {
        search.value = 'latest'
        search.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => {
        vi.advanceTimersByTime(300)
      })
      latest.resolve({ ok: true, data: { items: [moreItem], hasMore: false, nextOffset: null } })
      await act(async () => latest.promise)
      stale.resolve({ ok: true, data: { items: [searchItem], hasMore: false, nextOffset: null } })
      await act(async () => stale.promise)

      expect(container.textContent).toContain(moreItem.name)
      expect(container.textContent).not.toContain(searchItem.name)
    } finally {
      try {
        stale.resolve({ ok: true, data: { items: [], hasMore: false, nextOffset: null } })
        latest.resolve({ ok: true, data: { items: [], hasMore: false, nextOffset: null } })
        if (root) await act(async () => root?.unmount())
      } finally {
        vi.useRealTimers()
        cleanup()
      }
    }
  })

  it('opens the mobile editor from its summary and Cancel closes it without a server mutation', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let seedRoot: Root | null = null
    let root: Root | null = null

    try {
      const element = createElement(InventoryManager, {
        initialPage: { items: [item], hasMore: false, nextOffset: null },
      })
      const serverMarkup = renderToStaticMarkup(element)
      const { createRoot, hydrateRoot } = await import('react-dom/client')
      const seedContainer = testDocument.createElement('div')
      seedRoot = createRoot(seedContainer as unknown as Element)

      await act(async () => {
        seedRoot!.render(element)
      })

      const container = cloneTestElement(seedContainer)

      const summary = findMobileSummary(container)
      const editor = findMobileEditor(container)
      expect(serverMarkup).toContain('aria-expanded="false"')
      expect(serverMarkup).toContain(`id="inventory-mobile-editor-${item.id}"`)
      expect(summary?.getAttribute('aria-expanded')).toBe('false')
      expect(editor).toBeDefined()
      expect(editor?.hasAttribute('hidden')).toBe(true)
      expect(editor?.textContent).toBe('')
      expect(container.textContent).toBe(seedContainer.textContent)

      await act(async () => seedRoot?.unmount())
      seedRoot = null

      const recoverableErrors: unknown[] = []
      await act(async () => {
        root = hydrateRoot(container as unknown as Element, element, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        })
      })

      await act(async () => {
        summary!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(summary?.getAttribute('aria-expanded')).toBe('true')
      expect(findMobileEditor(container)).toBe(editor)
      expect(editor?.hasAttribute('hidden')).toBe(false)
      expect(editor?.textContent).toContain('Save')

      const cancel = Array.from(container.querySelectorAll('button')).find((button) => (
        button.getAttribute('aria-label') === `Cancel row edit ${item.name}`
      ))
      await act(async () => {
        cancel!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(summary?.getAttribute('aria-expanded')).toBe('false')
      expect(findMobileEditor(container)).toBe(editor)
      expect(editor?.hasAttribute('hidden')).toBe(true)
      expect(editor?.textContent).toBe('')
      expect(inventoryActions.createInventoryItem).not.toHaveBeenCalled()
      expect(inventoryActions.deleteInventoryItem).not.toHaveBeenCalled()
      expect(inventoryActions.importInventoryCSV).not.toHaveBeenCalled()
      expect(inventoryActions.updateInventoryMovement).not.toHaveBeenCalled()
      expect(inventoryActions.updateInventoryItem).not.toHaveBeenCalled()
      expect(recoverableErrors).toEqual([])
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      try {
        if (seedRoot) await act(async () => seedRoot?.unmount())
        if (root) await act(async () => root?.unmount())
      } finally {
        consoleError.mockRestore()
        cleanup()
      }
    }
  })

  it('keeps the mobile editor open and preserves values when a pending save fails', async () => {
    const pendingUpdate = deferred<{
      ok: false
      error: string
    }>()
    inventoryActions.updateInventoryItem.mockReturnValueOnce(pendingUpdate.promise)
    const { cleanup, document: testDocument } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = testDocument.createElement('div')
      root = createRoot(container as unknown as Element)

      await act(async () => {
        root!.render(createElement(InventoryManager, {
          initialPage: { items: [item], hasMore: false, nextOffset: null },
        }))
      })

      const summary = findMobileSummary(container)
      await act(async () => {
        summary!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      const nameInput = Array.from(container.querySelectorAll('input')).find((input) => (
        input.getAttribute('aria-label') === `Name for ${item.name}`
      ))
      expect(nameInput).toBeDefined()

      await act(async () => {
        nameInput!.value = 'Preserved mobile value'
        nameInput!.dispatchEvent(new Event('input', { bubbles: true }))
        nameInput!.dispatchEvent(new Event('change', { bubbles: true }))
      })

      const save = Array.from(container.querySelectorAll('button')).find((button) => (
        button.getAttribute('aria-label') === `Save row ${item.name}`
      ))
      expect(save).toBeDefined()

      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await act(async () => {
        await Promise.resolve()
      })

      expect(inventoryActions.updateInventoryItem).toHaveBeenCalledTimes(1)
      expect(summary?.disabled).toBe(true)
      expect(summary?.getAttribute('aria-expanded')).toBe('true')
      expect(nameInput?.value).toBe('Preserved mobile value')

      pendingUpdate.resolve({ ok: false, error: 'Update failed.' })
      await act(async () => {
        await pendingUpdate.promise
      })

      expect(summary?.disabled).toBe(false)
      expect(summary?.getAttribute('aria-expanded')).toBe('true')
      expect(findMobileEditor(container)?.hasAttribute('hidden')).toBe(false)
      expect(nameInput?.value).toBe('Preserved mobile value')
      expect(container.textContent).toContain('Update failed.')
    } finally {
      try {
        pendingUpdate.resolve({ ok: false, error: 'Test cleanup.' })
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })
})
