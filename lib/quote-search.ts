export function normalizeQuoteSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/^#\s*(?=\p{N})/u, '')
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 384)
}

export function buildQuoteSearchIlikePattern(query: string): string {
  const escapedLikeQuery = query.replace(/[\\%_]/g, (character) => `\\${character}`)
  const escapedQuery = escapedLikeQuery
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')

  return `"%${escapedQuery}%"`
}
