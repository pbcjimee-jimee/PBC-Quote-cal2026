import { describe, expect, it } from 'vitest'
import { addInventoryCategoryOption } from '@/components/inventory/inventory-manager'

describe('inventory category options', () => {
  it('adds a trimmed custom category to dropdown options in category sort order', () => {
    expect(addInventoryCategoryOption(['Tools', 'Weathershield'], '  Consumables  ')).toEqual([
      'Tools',
      'Weathershield',
      'Consumables',
    ])
  })

  it('does not add empty or duplicate categories', () => {
    expect(addInventoryCategoryOption(['Tools'], '  ')).toEqual(['Tools'])
    expect(addInventoryCategoryOption(['Tools'], 'Tools')).toEqual(['Tools'])
  })
})
