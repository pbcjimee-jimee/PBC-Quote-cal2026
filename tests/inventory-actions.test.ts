import { beforeEach, describe, expect, it } from 'vitest'
import {
  createInventoryItem,
  deleteInventoryItem,
  importInventoryCSV,
  listInventory,
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
        category: 'Weathershield',
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
      expect(result.data).toHaveLength(1)
      expect(result.data[0].name).toBe('Weathershield')
    }
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
      expect(list.data).toHaveLength(0)
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
