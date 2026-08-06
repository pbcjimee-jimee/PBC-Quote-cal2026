import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InventoryManager } from '@/components/inventory/inventory-manager'
import type { InventoryItemRecord } from '@/lib/inventory/types'
import { cloneTestElement, installTestDom } from '@/tests/helpers/test-dom'

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

      const summary = Array.from(container.querySelectorAll('button')).find((button) => (
        button.getAttribute('aria-controls') === `inventory-mobile-editor-${item.id}`
      ))
      expect(serverMarkup).toContain('aria-expanded="false"')
      expect(serverMarkup).not.toContain(`id="inventory-mobile-editor-${item.id}"`)
      expect(summary?.getAttribute('aria-expanded')).toBe('false')
      expect(Array.from(container.querySelectorAll('div')).some((element) => (
        element.getAttribute('id') === `inventory-mobile-editor-${item.id}`
      ))).toBe(false)
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
      expect(Array.from(container.querySelectorAll('div')).some((element) => (
        element.getAttribute('id') === `inventory-mobile-editor-${item.id}`
      ))).toBe(true)

      const cancel = Array.from(container.querySelectorAll('button')).find((button) => (
        button.getAttribute('aria-label') === `Cancel row edit ${item.name}`
      ))
      await act(async () => {
        cancel!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(summary?.getAttribute('aria-expanded')).toBe('false')
      expect(Array.from(container.querySelectorAll('div')).some((element) => (
        element.getAttribute('id') === `inventory-mobile-editor-${item.id}`
      ))).toBe(false)
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
})
