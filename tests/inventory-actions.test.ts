import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInventoryItem,
  deleteInventoryItem,
  importInventoryCSV,
  listInventory,
  listInventoryCategories,
  updateInventoryItem,
} from '@/lib/actions/inventory'
import { resetDevData } from '@/lib/dev-data'

describe('inventory actions', () => {
  beforeEach(() => {
    resetDevData()
  })

  it('imports 2026 equipment rows and preserves out status with site text', async () => {
    const csvText = [
      'Equipment ID,Name,Category,Model/Specification,Colour,Serial Num,Quantity,Purchase Date,Price,Notes',
      ',Obital Sander,Tools,Dewalt,, ,1,2025-07-23 00:00:00,,',
      ',Weathershield,Paint,Dulux,Monument (low),15L,1,out,07/May Manly,',
    ].join('\n')

    const result = await importInventoryCSV({ csvText, sourceYear: '2026' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.imported).toBe(2)
      expect(result.data.items[0]).toMatchObject({
        name: 'Obital Sander',
        category: 'Tools',
        brand: 'Dewalt',
        quantity: '1.00',
        purchaseDate: '2025-07-23',
        status: 'in_stock',
        sourceYear: '2026',
      })
      expect(result.data.items[1]).toMatchObject({
        name: 'Weathershield',
        category: 'Paint',
        colour: 'Monument (low)',
        sizeOrSerial: '15L',
        status: 'out',
        usedDate: '2026-05-07',
        usedLocationText: '07/May Manly',
      })
    }
  })

  it('uses workbook section rows as inventory categories when importing file-shaped CSV', async () => {
    const csvText = [
      'Equipment ID,Name,Category,Model/Specification,Colour,Serial Num,Quantity,Purchase Date,Price,Notes',
      ',Sample,,,,,,,,',
      ',Sample,Paint,Dulux,Natural White,100ml (sample),1,,,,',
      ',Weathershield,,,,,,,,',
      ',Weathershield,Paint,Dulux,Monument (low),15L,1,out,07/May Manly,',
    ].join('\n')

    const result = await importInventoryCSV({ csvText, sourceYear: '2026' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.items).toHaveLength(2)
      expect(result.data.items[0]).toMatchObject({
        name: 'Sample',
        category: 'Sample',
        status: 'in_stock',
      })
      expect(result.data.items[1]).toMatchObject({
        name: 'Weathershield',
        category: 'Weathershield',
        status: 'out',
        usedLocationText: '07/May Manly',
      })
    }
  })

  it('searches inventory by name, colour, brand, size, and used location text', async () => {
    await importInventoryCSV({
      sourceYear: '2026',
      csvText: [
        'Name,Category,Brand,Colour,Size/Serial,Quantity,Status,Used Location',
        'Weathershield,Paint,Dulux,Monument (low),15L,1,out,07/May Manly',
      ].join('\n'),
    })

    const result = await listInventory({ query: 'manly monument 15l', limit: 10 })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.items).toHaveLength(1)
      expect(result.data.items[0].name).toBe('Weathershield')
      expect(result.data).toMatchObject({ hasMore: false, nextOffset: null })
    }
  })

  it('paginates tied creation timestamps by descending ID without duplicates or omissions', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-13T00:00:00.000Z'))
    const generatedIds = [
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      '00000000-0000-4000-8000-000000000103',
      '00000000-0000-4000-8000-000000000104',
      '00000000-0000-4000-8000-000000000105',
    ] as `${string}-${string}-${string}-${string}-${string}`[]
    const randomUuid = vi.spyOn(crypto, 'randomUUID')
    for (const id of generatedIds) randomUuid.mockReturnValueOnce(id)

    try {
      const imported = await importInventoryCSV({
        sourceYear: '2026',
        csvText: [
          'Name,Category,Quantity,Status',
          'TiedPage 1,Pagination,1,in_stock',
          'TiedPage 2,Pagination,1,in_stock',
          'TiedPage 3,Pagination,1,in_stock',
          'TiedPage 4,Pagination,1,in_stock',
          'TiedPage 5,Pagination,1,in_stock',
        ].join('\n'),
      })
      if (!imported.ok) throw new Error(imported.error)

      const first = await listInventory({ query: 'TiedPage', offset: 0, limit: 2 })
      const second = await listInventory({ query: 'TiedPage', offset: 2, limit: 2 })
      const third = await listInventory({ query: 'TiedPage', offset: 4, limit: 2 })
      if (!first.ok || !second.ok || !third.ok) throw new Error('Expected all tied pages to load')

      const pagedIds = [...first.data.items, ...second.data.items, ...third.data.items].map((item) => item.id)
      expect(pagedIds).toEqual([...generatedIds].sort((a, b) => b.localeCompare(a)))
      expect(new Set(pagedIds).size).toBe(5)
      expect(pagedIds).toEqual(expect.arrayContaining(imported.data.items.map((item) => item.id)))
    } finally {
      randomUuid.mockRestore()
      vi.useRealTimers()
    }
  })

  it('keeps exact case variants available and queryable in dev inventory categories', async () => {
    await createInventoryItem({
      name: 'Category source 1',
      category: 'Paint',
      quantity: 1,
      status: 'in_stock',
    })
    await createInventoryItem({
      name: 'Category source 2',
      category: 'paint',
      quantity: 1,
      status: 'in_stock',
    })

    const result = await listInventoryCategories()
    const upper = await listInventory({ category: 'Paint', limit: 10 })
    const lower = await listInventory({ category: 'paint', limit: 10 })

    expect(result).toEqual(expect.objectContaining({ ok: true }))
    if (result.ok) {
      expect(result.data).toEqual(expect.arrayContaining(['Paint', 'paint']))
    }
    if (!upper.ok || !lower.ok) throw new Error('Expected exact dev category queries to succeed')
    expect(upper.data.items.map((item) => item.name)).toContain('Category source 1')
    expect(upper.data.items.map((item) => item.name)).not.toContain('Category source 2')
    expect(lower.data.items.map((item) => item.name)).toContain('Category source 2')
    expect(lower.data.items.map((item) => item.name)).not.toContain('Category source 1')
  })

  it('creates, updates, and soft deletes manual inventory records', async () => {
    const created = await createInventoryItem({
      name: 'Aquanamel',
      category: 'Paint',
      brand: 'Dulux',
      colour: 'Lexicon quarter',
      sizeOrSerial: '4L',
      quantity: 1,
      purchaseDate: '2026-03-20',
      status: 'in_stock',
      notes: 'Warehouse shelf',
    })

    if (!created.ok) throw new Error(created.error)

    const updated = await updateInventoryItem({
      id: created.data.id,
      usedDate: '2026-03-25',
      usedLocationText: 'Bjorn site',
      status: 'out',
    })

    expect(updated.ok).toBe(true)
    if (updated.ok) {
      expect(updated.data.status).toBe('out')
      expect(updated.data.usedDate).toBe('2026-03-25')
      expect(updated.data.usedLocationText).toBe('Bjorn site')
    }

    const deleted = await deleteInventoryItem({ id: created.data.id })
    expect(deleted.ok).toBe(true)

    const list = await listInventory({ query: 'Aquanamel', limit: 10 })
    expect(list.ok).toBe(true)
    if (list.ok) {
      expect(list.data.items).toHaveLength(0)
      expect(list.data).toMatchObject({ hasMore: false, nextOffset: null })
    }
  })

  it('clears optional usage fields during update', async () => {
    const created = await createInventoryItem({
      name: 'Ultra Deck',
      category: 'Paint',
      quantity: 1,
      usedDate: '2026-05-07',
      usedLocationText: 'Manly site',
      notes: 'Leave note',
      status: 'out',
    })

    if (!created.ok) throw new Error(created.error)

    const updated = await updateInventoryItem({
      id: created.data.id,
      usedDate: null,
      usedLocationText: null,
      notes: null,
      status: 'in_stock',
    })

    expect(updated.ok).toBe(true)
    if (updated.ok) {
      expect(updated.data.usedDate).toBeNull()
      expect(updated.data.usedLocationText).toBeNull()
      expect(updated.data.notes).toBeNull()
      expect(updated.data.status).toBe('in_stock')
    }
  })
})
