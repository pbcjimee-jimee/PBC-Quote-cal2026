import { describe, expect, it } from 'vitest'
import { matchPhotoFolders, normalizeAddress, parseQuoteNumber } from '@/lib/ai-quote/photo-folders'

describe('photo folder matching', () => {
  it.each([
    ['quote 3000 - 15 Kingsway', '3000'], ['Quote #3000', '3000'], ['3000', '3000'],
    ['  QUOTE# 3010 - address ', '3010'], ['15 Kingsway Dee Why', null], ['', null],
  ])('reads the quote number from %s', (text, expected) => {
    expect(parseQuoteNumber(text)).toBe(expected)
  })

  it('normalizes address punctuation, state, postcode and street suffixes', () => {
    expect(normalizeAddress('15 Kingsway, (Dee Why) [New South Wales] NSW 2099')).toBe('15 kingsway dee why')
    expect(normalizeAddress('Street Road Avenue Parade Place Crescent')).toBe('st rd ave pde pl cres')
  })

  it('automatically selects only a unique matching quote number', () => {
    const folder = { id: 'right', name: 'quote 3000 - 15 Kingsway' }
    expect(matchPhotoFolders([{ id: 'other', name: 'quote 3001' }, folder], {
      quoteNumber: 'Quote #3000', address: '',
    })).toEqual({ selected: folder, candidates: [] })
  })

  it('requires a choice for duplicate numbers, even when one address matches', () => {
    const folders = [{ id: 'a', name: 'quote 3000 - 15 Kingsway' }, { id: 'b', name: 'quote 3000 - Another street' }]
    const result = matchPhotoFolders(folders, { quoteNumber: '3000', address: '15 Kingsway' })
    expect(result.selected).toBeNull()
    expect(result.candidates.map(({ id }) => id)).toEqual(['a', 'b'])
    expect(result.candidates.every(({ score }) => score > 0)).toBe(true)
  })

  it('ranks address overlap with extra weight for the house number and returns at most three', () => {
    const result = matchPhotoFolders([
      { id: 'wrong-number', name: '19 Kingsway Dee Why' },
      { id: 'right', name: '15 Kingsway  Dee Why' },
      { id: 'third', name: '15 Kingsway' },
      { id: 'fourth', name: 'Kingsway' },
      { id: 'none', name: 'Unrelated' },
    ], { quoteNumber: '3000', address: '15 Kingsway, Dee Why NSW 2099' })
    expect(result.selected).toBeNull()
    expect(result.candidates).toHaveLength(3)
    expect(result.candidates[0].id).toBe('right')
    expect(result.candidates.every(({ score }) => score > 0)).toBe(true)
    expect(result.candidates.some(({ id }) => id === 'none')).toBe(false)
  })

  it('does not match missing numbers or empty addresses', () => {
    expect(matchPhotoFolders([{ id: 'a', name: '15 Kingsway' }], { quoteNumber: '', address: '' }))
      .toEqual({ selected: null, candidates: [] })
  })
})
