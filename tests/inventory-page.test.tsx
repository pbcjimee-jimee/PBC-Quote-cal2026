import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listInventory: vi.fn(),
  listInventoryCategories: vi.fn(),
  requireRole: vi.fn(),
}))

vi.mock('@/lib/actions/inventory', () => ({
  listInventory: mocks.listInventory,
  listInventoryCategories: mocks.listInventoryCategories,
}))

vi.mock('@/lib/security/require-app-user', () => ({
  requireRole: mocks.requireRole,
}))

vi.mock('@/components/inventory/inventory-manager', () => ({
  InventoryManager: ({ initialPage }: { initialPage: { items: Array<{ id: string; name: string }> } }) => (
    createElement('div', null, initialPage.items.map((item) => (
      createElement('span', { key: item.id }, item.name)
    )))
  ),
}))

import InventoryPage from '@/app/(app)/inventory/page'

describe('Inventory page initial data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireRole.mockResolvedValue({
      ok: true,
      profile: { role: 'admin' },
    })
    mocks.listInventoryCategories.mockResolvedValue({ ok: true, data: ['Current', 'Older'] })
  })

  it('renders items from every inventory batch on the first page load', async () => {
    mocks.listInventory.mockImplementation(async (input: unknown) => {
      const fetchAll = typeof input === 'object'
        && input !== null
        && 'fetchAll' in input
        && input.fetchAll === true
      const excludesOut = typeof input === 'object'
        && input !== null
        && 'excludeOut' in input
        && input.excludeOut === true

      return {
        ok: true,
        data: {
          items: fetchAll && excludesOut
            ? [
                { id: 'current-item', name: 'Current category item' },
                { id: 'older-item', name: 'Older category item' },
              ]
            : [{ id: 'current-item', name: 'Current category item' }],
          hasMore: !fetchAll,
          nextOffset: fetchAll ? null : 50,
        },
      }
    })

    const markup = renderToStaticMarkup(await InventoryPage())

    expect(markup).toContain('Current category item')
    expect(markup).toContain('Older category item')
  })
})
