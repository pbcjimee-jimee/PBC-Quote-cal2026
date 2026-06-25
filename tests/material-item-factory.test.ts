import { describe, expect, it } from 'vitest'
import { createCustomMaterialItem, createProductMaterialItem } from '@/components/quote-form/material-item-factory'

describe('material item factory', () => {
  it('starts new product material labour fields at zero', () => {
    const item = createProductMaterialItem({
      id: 'product-1',
      name: 'Dulux Paint',
      manufacturer: 'Dulux',
      type: 'Paint',
      unit: '4L',
      category: 'Interior',
      productLine: 'Wash&Wear',
      base: 'Vivid White',
      sheen: 'Low Sheen',
      volumeLitres: '4',
      productCode: '12345',
      marketPrice: '99.50',
      actualPrice: '80.00',
      colorCode: null,
      active: true,
    })

    expect(item.workingDays).toBe('0')
    expect(item.labourPerDay).toBe('0')
    expect(item.marketPrice).toBe('99.50')
    expect(item.actualPrice).toBe('80.00')
  })

  it('starts new custom material labour fields at zero', () => {
    const item = createCustomMaterialItem('Brushes')

    expect(item.workingDays).toBe('0')
    expect(item.labourPerDay).toBe('0')
  })
})
