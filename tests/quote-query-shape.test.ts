import { describe, expect, it } from 'vitest'
import { QUOTE_DETAIL_SELECT, QUOTE_DETAIL_WITHOUT_MEMOS_SELECT, QUOTES_LIST_SELECT } from '@/lib/quote-query-shape'

describe('quote query shape', () => {
  it('keeps the quotes list query lightweight', () => {
    expect(QUOTES_LIST_SELECT).toBe('*, quote_items(*)')
    expect(QUOTES_LIST_SELECT).not.toContain('quote_options')
    expect(QUOTES_LIST_SELECT).not.toContain('jobber_quote_lines')
    expect(QUOTES_LIST_SELECT).not.toContain('quote_memos')
  })

  it('loads quote options only for quote detail reads', () => {
    expect(QUOTE_DETAIL_SELECT).toContain('quote_options')
    expect(QUOTE_DETAIL_SELECT).toContain('quote_option_items')
  })

  it('loads public Jobber quote lines only for quote detail reads', () => {
    expect(QUOTE_DETAIL_SELECT).toContain('jobber_quote_lines')
  })

  it('loads app-only quote memos only for quote detail reads', () => {
    expect(QUOTE_DETAIL_SELECT).toContain('quote_memos')
  })

  it('keeps a detail fallback that only omits app-only memos', () => {
    expect(QUOTE_DETAIL_WITHOUT_MEMOS_SELECT).toContain('quote_options')
    expect(QUOTE_DETAIL_WITHOUT_MEMOS_SELECT).toContain('quote_option_items')
    expect(QUOTE_DETAIL_WITHOUT_MEMOS_SELECT).toContain('jobber_quote_lines')
    expect(QUOTE_DETAIL_WITHOUT_MEMOS_SELECT).not.toContain('quote_memos')
  })
})
