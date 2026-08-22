export function normalizeQuoteSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/^#\s*(?=\p{N})/u, '')
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 384)
}

type QuoteSearchPostgrestFilter = {
  operator: 'ilike' | 'imatch'
  pattern: string
}

function quotePostgrestFilterValue(value: string): string {
  const escapedValue = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')

  return `"${escapedValue}"`
}

export function buildQuoteSearchPostgrestFilter(query: string): QuoteSearchPostgrestFilter {
  if (query.includes('*')) {
    const escapedRegexQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return {
      operator: 'imatch',
      pattern: quotePostgrestFilterValue(`.*${escapedRegexQuery}.*`),
    }
  }

  const escapedLikeQuery = query.replace(/[\\%_]/g, (character) => `\\${character}`)
  return {
    operator: 'ilike',
    pattern: quotePostgrestFilterValue(`%${escapedLikeQuery}%`),
  }
}
