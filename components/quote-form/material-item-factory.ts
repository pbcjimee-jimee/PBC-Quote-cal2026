import type { ProductRecord } from '@/lib/products/types'
import type { MaterialItem } from './types'

export function createProductMaterialItem(product: ProductRecord): MaterialItem {
  const trustedPrice = product.rrpPrice ?? product.marketPrice ?? product.price ?? product.actualPrice
  const id = crypto.randomUUID()

  return {
    id,
    logicalKey: id,
    timberRole: 'none',
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
  const id = crypto.randomUUID()
  return {
    id,
    logicalKey: id,
    timberRole: 'none',
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

export function replaceMaterialProduct(item: MaterialItem, product: ProductRecord): MaterialItem {
  // A fresh identity lets saved quotes obtain the replacement's trusted price snapshot.
  return {
    ...createProductMaterialItem(product),
    logicalKey: item.logicalKey ?? (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id) ? item.id : crypto.randomUUID()),
    timberRole: item.timberRole,
    quantity: item.quantity,
    workingDays: item.workingDays,
    labourPerDay: item.labourPerDay,
    areaId: item.areaId,
    areaName: item.areaName,
    areaScope: item.areaScope,
    memo: item.memo,
  }
}
