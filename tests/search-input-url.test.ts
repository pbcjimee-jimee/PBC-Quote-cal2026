import { describe, expect, it } from 'vitest'
import { getNextQuotesSearchHref } from '@/components/quote-list/search-input-url'

describe('quote search URL updates', () => {
  it('does not navigate when an empty search already matches the current URL', () => {
    expect(getNextQuotesSearchHref('', '')).toBeNull()
  })

  it('does not navigate when the trimmed search value already matches the current query', () => {
    expect(getNextQuotesSearchHref('  Jane  ', 'q=Jane')).toBeNull()
  })

  it('returns the next quotes URL when the search value changes', () => {
    expect(getNextQuotesSearchHref('Jane Customer', '')).toBe('/quotes?q=Jane+Customer')
  })
})
