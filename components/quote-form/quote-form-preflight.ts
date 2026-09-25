import { quoteSchema } from '@/lib/validators'
import { buildQuoteSavePayload, type QuoteFormSavePayloadInput } from './quote-save-payload'
import type { QuoteFormIssue, QuoteUiTarget } from './quote-mobile-state'

const MATERIAL_FIELDS: Record<string, string> = {
  productNameSnapshot: 'name', marketPriceSnapshot: 'marketPrice', actualPriceSnapshot: 'marketPrice',
  quantity: 'quantity', workingDays: 'workingDays', labourPerDay: 'labourPerDay', memo: 'memo',
  areaId: 'area', areaNameSnapshot: 'area', areaScopeSnapshot: 'area',
}

export function getQuoteFormIssues(input: QuoteFormSavePayloadInput): QuoteFormIssue[] {
  try {
    const payload = buildQuoteSavePayload(input)
    const result = quoteSchema.safeParse(payload)
    if (result.success) return []
    return result.error.issues.map((issue) => {
      const [root, index, field, itemIndex, itemField] = issue.path
      let target: QuoteUiTarget = { section: 'review', field: 'summary' }
      if (root === 'items' && typeof index === 'number') {
        const item = input.materials[index]
        const inputField = MATERIAL_FIELDS[String(field)]
        if (item && inputField) target = { section: 'work', entityId: item.id, scope: item.areaScope ?? 'unassigned', field: inputField }
      } else if (root === 'options' && typeof index === 'number') {
        const option = input.options[index]
        if (option && field === 'items' && typeof itemIndex === 'number') {
          const item = option.materials[itemIndex]
          const inputField = MATERIAL_FIELDS[String(itemField)]
          if (item && inputField) target = { section: 'work', optionId: option.id, entityId: item.id, scope: item.areaScope ?? 'unassigned', field: inputField }
        } else if (option && ['title', 'selectedMin', 'selectedMax'].includes(String(field))) {
          target = { section: 'work', optionId: option.id, field: String(field) }
        }
      } else if (root === 'jobberQuoteLines' && typeof index === 'number') {
        const line = input.jobberQuoteLines[index]
        if (line) target = { section: 'public', entityId: line.id, field: String(field) }
      } else if (root === 'memos' && typeof index === 'number') {
        const memo = input.memos[payload.memos[index]?.position]
        if (memo) target = { section: 'review', entityId: memo.id, field: 'body' }
      } else if (['customerName', 'customerAddress', 'jobberQuoteId', 'workType'].includes(String(root))) {
        target = { section: 'details', field: String(root) }
      }
      return { ...target, message: issue.message }
    })
  } catch {
    return [{ section: 'review', field: 'summary', message: 'Check the quote values before saving.' }]
  }
}
