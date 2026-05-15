import { describe, expect, it } from 'vitest'
import {
  createEmptyQuoteFormDraft,
  getQuoteDraftStorageKey,
  hasMeaningfulQuoteDraft,
  parseQuoteFormDraft,
} from '@/components/quote-form/quote-draft'

describe('quote form draft persistence', () => {
  it('uses separate draft keys for new and existing quotes', () => {
    expect(getQuoteDraftStorageKey()).toBe('pbc-quote-draft:new')
    expect(getQuoteDraftStorageKey('quote-1')).toBe('pbc-quote-draft:quote-1')
  })

  it('ignores empty drafts but keeps meaningful quote input', () => {
    expect(hasMeaningfulQuoteDraft(createEmptyQuoteFormDraft())).toBe(false)
    expect(hasMeaningfulQuoteDraft({
      ...createEmptyQuoteFormDraft(),
      customerName: 'Jane Customer',
    })).toBe(true)
    expect(hasMeaningfulQuoteDraft({
      ...createEmptyQuoteFormDraft(),
      options: [
        {
          id: 'option-1',
          title: 'Option 1',
          materials: [],
          selectedMin: 4,
          selectedMax: 1,
          isExpanded: true,
        },
      ],
    })).toBe(true)
  })

  it('parses valid saved drafts and rejects invalid stored payloads', () => {
    const draft = {
      ...createEmptyQuoteFormDraft(),
      customerName: 'Jane Customer',
      workingDays: '2.5',
      materials: [
        {
          id: 'item-1',
          name: 'Primer',
          marketPrice: '55.50',
          actualPrice: '55.50',
          quantity: '2',
          workingDays: '0',
          labourPerDay: '0',
          isCustom: true,
        },
      ],
      options: [
        {
          id: 'option-1',
          title: 'Option 1',
          selectedMin: 4,
          selectedMax: 1,
          isExpanded: true,
          materials: [
            {
              id: 'option-item-1',
              name: 'Door paint',
              marketPrice: '88.00',
              actualPrice: '88.00',
              quantity: '1',
              workingDays: '0',
              labourPerDay: '0',
              isCustom: true,
            },
          ],
        },
      ],
      updatedAt: '2026-05-15T00:00:00.000Z',
    }

    expect(parseQuoteFormDraft(JSON.stringify(draft))).toEqual(draft)
    expect(parseQuoteFormDraft('not json')).toBeNull()
    expect(parseQuoteFormDraft(JSON.stringify({ ...draft, workingDays: '/' }))).toBeNull()
  })
})
