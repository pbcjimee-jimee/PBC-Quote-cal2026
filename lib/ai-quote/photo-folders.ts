interface PhotoFolder {
  id: string
  name: string
}

export function parseQuoteNumber(text: string): string | null {
  return text.match(/quote\s*#?\s*(\d+)/i)?.[1] ?? (/^\d+$/.test(text.trim()) ? text.trim() : null)
}

export function normalizeAddress(text: string): string {
  const suffixes: Record<string, string> = { street: 'st', road: 'rd', avenue: 'ave', parade: 'pde', place: 'pl', crescent: 'cres' }
  return text.toLowerCase().replace(/[,()[\]]/g, ' ')
    .replace(/\b(?:new\s+south\s+wales|nsw|\d{4})\b/g, ' ')
    .replace(/\b(?:street|road|avenue|parade|place|crescent)\b/g, suffix => suffixes[suffix])
    .replace(/\s+/g, ' ').trim()
}

export function matchPhotoFolders(folders: PhotoFolder[], input: { quoteNumber: string; address: string }): {
  selected: PhotoFolder | null
  candidates: Array<PhotoFolder & { score: number }>
} {
  const number = parseQuoteNumber(input.quoteNumber)
  const matches = number === null ? [] : folders.filter(folder => parseQuoteNumber(folder.name) === number)
  if (matches.length === 1) return { selected: matches[0], candidates: [] }
  if (matches.length > 1) return { selected: null, candidates: matches.map(folder => ({ ...folder, score: 1 })) }

  const tokens = [...new Set(normalizeAddress(input.address).split(' ').filter(Boolean))]
  const candidates = folders.map(folder => {
    const address = folder.name.replace(/quote\s*#?\s*\d+/i, '')
    const folderTokens = new Set(normalizeAddress(address).split(' '))
    const score = tokens.reduce((sum, token) => sum + (folderTokens.has(token) ? (/^\d+[a-z]?$/.test(token) ? 3 : 1) : 0), 0)
    return { ...folder, score }
  }).filter(folder => folder.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 3)
  return { selected: null, candidates }
}
