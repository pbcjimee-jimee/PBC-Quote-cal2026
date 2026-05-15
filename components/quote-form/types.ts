export type FormulaNumber = 1 | 2 | 3 | 4 | 5

export interface MaterialItem {
  id: string
  productId?: string
  name: string
  manufacturer?: string | null
  type?: string | null
  unit?: string
  category?: string | null
  productLine?: string | null
  base?: string | null
  sheen?: string | null
  volumeLitres?: string | null
  productCode?: string | null
  marketPrice: string
  actualPrice: string
  quantity: string
  workingDays: string
  labourPerDay: string
  areaId?: string
  areaName?: string
  areaScope?: 'interior' | 'exterior'
  isCustom: boolean
}

export interface QuoteOptionItem {
  id: string
  title: string
  materials: MaterialItem[]
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
  isExpanded: boolean
}
