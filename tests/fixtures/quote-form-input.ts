import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import type { QuoteFormSavePayloadInput } from '@/components/quote-form/quote-save-payload'
import type { MaterialItem } from '@/components/quote-form/types'

export function createMaterialInput(overrides: Partial<MaterialItem> = {}): MaterialItem {
  return { id: 'material-1', name: 'Sample paint', marketPrice: '20', actualPrice: '10', quantity: '1', workingDays: '1', labourPerDay: '1', areaScope: 'interior', isCustom: true, ...overrides }
}

export function createQuoteFormInput(overrides: Partial<QuoteFormSavePayloadInput> = {}): QuoteFormSavePayloadInput {
  return { settings: DEFAULT_PRICING_SETTINGS, customerName: '', customerAddress: '', jobberQuoteId: '', jobberQuoteLookup: '', jobberQuoteDraft: null, deletedJobberLineItemIds: [], jobberQuoteLines: [], workType: '', selectedMin: 4, selectedMax: 1, materials: [], options: [], memos: [], ...overrides }
}
