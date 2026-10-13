export type TimberRole = 'none' | 'shared' | 'finish'
export type PaintComparisonWritePolicy = 'preserve' | 'set_true' | 'set_false'

export interface PaintComparisonField {
  mode: 'inherit' | 'override'
  value: string
}

export interface PaintComparisonProduct {
  productId: string
  name: string
  marketPrice: string
  actualPrice: string
}

export interface PaintComparisonAlternative {
  targetLogicalKey: string
  previousRole: Exclude<TimberRole, 'none'>
  acknowledgedSourceProductId: string | null
  product?: PaintComparisonProduct
  quantity: PaintComparisonField
  workingDays: PaintComparisonField
  labourPerDay: PaintComparisonField
}

export interface PaintComparison {
  version: 1
  key: string
  alternatives: PaintComparisonAlternative[]
  result?: {
    superSubtotal: string
    aquaSubtotal: string | null
    differenceSubtotal: string | null
  }
}
