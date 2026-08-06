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
  })

  it('opens the mobile editor from its summary and Cancel closes it without a server mutation', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let seedRoot: Root | null = null
    let root: Root | null = null

    try {
      const element = createElement(InventoryManager, { initialItems: [item] })
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
        root!.render(createElement(InventoryManager, { initialItems: [item] }))
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
