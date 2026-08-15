import type { ProductRecord } from '@/lib/products/types'
import type { MaterialItem } from './types'

export function createProductMaterialItem(product: ProductRecord): MaterialItem {
  const trustedPrice = product.rrpPrice ?? product.marketPrice ?? product.price ?? product.actualPrice

  return {
    id: crypto.randomUUID(),
    productId: product.id,
    name: product.name,
    manufacturer: product.manufacturer,
    type: product.type,
    unit: product.unit,
    category: product.category,
    productLine: product.productLine,
    base: product.base,
    sheen: product.sheen,
    volumeLitres: product.volumeLitres,
    productCode: product.productCode,
    memo: '',
    marketPrice: trustedPrice,
    actualPrice: trustedPrice,
    quantity: '1',
    workingDays: '0',
    labourPerDay: '0',
    isCustom: false,
  }
}

export function createCustomMaterialItem(name: string): MaterialItem {
  return {
    id: crypto.randomUUID(),
    name,
    memo: '',
    marketPrice: '0',
    actualPrice: '0',
    quantity: '1',
    workingDays: '0',
    labourPerDay: '0',
    isCustom: true,
  }
}
