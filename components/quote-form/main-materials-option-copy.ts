import type { MaterialItem, QuoteOptionItem } from './types'

type CreateClientId = (prefix: string) => string

export interface TrustedLinkedProductPrice {
  productId: string
  trustedPrice: string
}

export function hasCopyableMainMaterials(materials: MaterialItem[]): boolean {
  return materials.length > 0
}

export function applyTrustedLinkedProductPrices(
  materials: MaterialItem[],
  prices: TrustedLinkedProductPrice[]
): MaterialItem[] | null {
  const priceByProductId = new Map(prices.map((price) => [price.productId, price.trustedPrice]))

  if (materials.some((material) => material.productId && !priceByProductId.has(material.productId))) {
    return null
  }

  return materials.map((material) => {
    if (!material.productId) return material
    const trustedPrice = priceByProductId.get(material.productId)
    if (trustedPrice === undefined) return material
    return {
      ...material,
      actualPrice: trustedPrice,
    }
  })
}

export function createMainMaterialsOption(
  materials: MaterialItem[],
  optionNumber: number,
  createId: CreateClientId
): QuoteOptionItem | null {
  if (!hasCopyableMainMaterials(materials)) return null

  return {
    id: createId('option'),
    title: `Option ${optionNumber}`,
    materials: materials.map((material) => ({
      ...material,
      id: createId('option-item'),
    })),
    selectedMin: 4,
    selectedMax: 1,
    isExpanded: true,
  }
}

export function appendMainMaterialsOption(
  options: QuoteOptionItem[],
  materials: MaterialItem[],
  createId: CreateClientId
): QuoteOptionItem[] {
  const option = createMainMaterialsOption(materials, options.length + 1, createId)
  return option ? [...options, option] : options
}
