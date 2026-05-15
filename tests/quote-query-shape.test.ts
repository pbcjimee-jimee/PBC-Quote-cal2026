import { describe, expect, it } from 'vitest'
import { QUOTE_DETAIL_SELECT, QUOTES_LIST_SELECT } from '@/lib/quote-query-shape'

describe('quote query shape', () => {
  it('keeps the quotes list query lightweight', () => {
    expect(QUOTES_LIST_SELECT).toBe('*, quote_items(*)')
    expect(QUOTES_LIST_SELECT).not.toContain('quote_options')
  })

  it('loads quote options only for quote detail reads', () => {
    expect(QUOTE_DETAIL_SELECT).toContain('quote_options')
    expect(QUOTE_DETAIL_SELECT).toContain('quote_option_items')
  })
})
