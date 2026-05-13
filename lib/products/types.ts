export interface ProductRecord {
  id: string
  name: string
  manufacturer: string | null
  type: string | null
  unit: string
  marketPrice: string
  actualPrice: string
  colorCode: string | null
  active: boolean
  category?: string | null
  productLine?: string | null
  base?: string | null
  sheen?: string | null
  volumeLitres?: string | null
  price?: string | null
  rrpPrice?: string | null
  productCode?: string | null
  sourceUrl?: string | null
}

export function normalizeRrpProduct(product: ProductRecord): ProductRecord {
  const rrpPrice = product.rrpPrice ?? product.marketPrice ?? product.price ?? '0'

  return {
    ...product,
    marketPrice: rrpPrice,
    actualPrice: rrpPrice,
    rrpPrice,
  }
}
