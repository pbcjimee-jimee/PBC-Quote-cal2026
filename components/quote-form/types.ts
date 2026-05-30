export type FormulaNumber = 1 | 2 | 3 | 4 | 5
export type AreaScope = 'interior' | 'exterior'
export type JobberSaveMode = 'priced_line_items' | 'description_total'
export type JobberQuoteLineKind = 'line_item' | 'text'

export interface FormulaSelection {
  selectedMin: FormulaNumber
  selectedMax: FormulaNumber
}

export interface AreaFormulaSelections {
  interior: FormulaSelection
  exterior: FormulaSelection
}

export interface JobberQuoteLineItemDraft {
  id: string
  kind: JobberQuoteLineKind
  name: string
  description: string
  quantity: string
  unitPrice: string
  taxable: boolean
  clientVisible: boolean
  jobberLineItemId?: string
  linkedProductOrServiceId?: string
}

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
  areaScope?: AreaScope
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

export interface QuoteMemoItem {
  id: string
  body: string
}
