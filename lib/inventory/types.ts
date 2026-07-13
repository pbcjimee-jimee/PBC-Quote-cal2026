import { resolveWorkbookInventoryCategory } from './workbook-categories'

export type InventoryStatus = 'in_stock' | 'out' | 'unknown'

export interface InventoryItemRecord {
  id: string
  name: string
  category: string | null
  brand: string | null
  modelSpecification: string | null
  colour: string | null
  sizeOrSerial: string | null
  quantity: string
  purchaseDate: string | null
  usedDate: string | null
  usedLocationText: string | null
  status: InventoryStatus
  notes: string | null
  active: boolean
  sourceYear: string | null
  createdAt: string
  updatedAt: string
}

export function normalizeInventoryItem(item: InventoryItemRecord): InventoryItemRecord {
  return {
    ...item,
    category: resolveWorkbookInventoryCategory(item),
    brand: item.brand?.trim() || null,
    modelSpecification: item.modelSpecification?.trim() || null,
    colour: item.colour?.trim() || null,
    sizeOrSerial: item.sizeOrSerial?.trim() || null,
    usedLocationText: item.usedLocationText?.trim() || null,
    notes: item.notes?.trim() || null,
    sourceYear: item.sourceYear?.trim() || null,
  }
}
