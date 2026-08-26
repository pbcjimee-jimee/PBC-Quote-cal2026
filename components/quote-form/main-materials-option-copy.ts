import type { MaterialItem, QuoteOptionItem } from './types'

type CreateClientId = (prefix: string) => string

export function hasCopyableMainMaterials(materials: MaterialItem[]): boolean {
  return materials.length > 0
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
