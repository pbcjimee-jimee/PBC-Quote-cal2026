import { describe, expect, it } from 'vitest'
import { createCustomMaterialItem, createProductMaterialItem, replaceMaterialProduct } from '@/components/quote-form/material-item-factory'

describe('material item factory', () => {
  it('replaces a product snapshot while preserving the entered work and memo', () => {
    const original = {
      ...createCustomMaterialItem('Old paint'),
      id: 'saved-row', productId: 'old-product', isCustom: false,
      quantity: '2.5', workingDays: '3', labourPerDay: '2',
      areaId: 'area-1', areaName: 'Ceiling', areaScope: 'interior' as const,
      memo: 'Keep two coats', manufacturer: 'Old brand', productCode: 'OLD',
    }
    const replacement = replaceMaterialProduct(original, {
      id: 'new-product', name: 'Dulux Ceiling White 1L', manufacturer: 'Dulux',
      type: 'Paint', unit: '1L', marketPrice: '40', rrpPrice: '45.90',
      actualPrice: '20', colorCode: null, active: true,
    })
    expect(replacement).toMatchObject({
      productId: 'new-product', name: 'Dulux Ceiling White 1L', marketPrice: '45.90',
      actualPrice: '45.90', manufacturer: 'Dulux', unit: '1L', isCustom: false,
      quantity: '2.5', workingDays: '3', labourPerDay: '2',
      areaId: 'area-1', areaName: 'Ceiling', areaScope: 'interior', memo: 'Keep two coats',
    })
    expect(replacement.id).not.toBe(original.id)
    expect(replacement.productCode).toBeUndefined()
    expect(original.productId).toBe('old-product')
  })
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
    expect(item.actualPrice).toBe('99.50')
  })

  it('starts new custom material labour fields at zero', () => {
    const item = createCustomMaterialItem('Brushes')

    expect(item.workingDays).toBe('0')
    expect(item.labourPerDay).toBe('0')
  })
})
