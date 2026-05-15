export function getNextQuotesSearchHref(value: string, currentSearch: string): string | null {
  const params = new URLSearchParams(currentSearch)
  const nextValue = value.trim()

  if (nextValue) {
    params.set('q', nextValue)
  } else {
    params.delete('q')
  }

  const nextSearch = params.toString()
  if (nextSearch === currentSearch) return null

  return `/quotes${nextSearch ? `?${nextSearch}` : ''}`
}
