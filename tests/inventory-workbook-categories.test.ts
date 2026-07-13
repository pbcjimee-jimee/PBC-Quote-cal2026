import { describe, expect, it } from 'vitest'
import { resolveWorkbookInventoryCategory } from '@/lib/inventory/workbook-categories'

describe('inventory workbook categories', () => {
  it('keeps uncategorized manual rows uncategorized instead of guessing a workbook section', () => {
    expect(resolveWorkbookInventoryCategory({
      name: 'Unknown shelf item',
      category: null,
    })).toBeNull()
  })

  it('maps legacy paint rows to workbook section categories', () => {
    expect(resolveWorkbookInventoryCategory({
      name: 'Professional inerior',
      category: 'Paint',
      brand: 'Dulux',
      colour: 'Lexicon quarter (lowsheen)',
      sizeOrSerial: '15l',
    })).toBe('Interior walls')
  })
})
