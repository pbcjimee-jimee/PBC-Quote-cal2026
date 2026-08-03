import { describe, expect, it, vi } from 'vitest'
import { fetchAllJobberPages } from '@/lib/jobber/pagination'

function page(ids: string[], endCursor: string | null, hasNextPage: boolean) {
  return {
    nodes: ids.map((id) => ({ id })),
    pageInfo: { endCursor, hasNextPage },
  }
}

describe('fetchAllJobberPages', () => {
  it('collects two and three complete pages and freezes the result', async () => {
    const twoPages = vi.fn()
      .mockResolvedValueOnce(page(['1'], 'c1', true))
      .mockResolvedValueOnce(page(['2'], null, false))
    const threePages = vi.fn()
      .mockResolvedValueOnce(page(['1'], 'c1', true))
      .mockResolvedValueOnce(page(['2'], 'c2', true))
      .mockResolvedValueOnce(page(['3'], null, false))

    const two = await fetchAllJobberPages(twoPages)
    const three = await fetchAllJobberPages(threePages)

    expect(two.map(({ id }) => id)).toEqual(['1', '2'])
    expect(three.map(({ id }) => id)).toEqual(['1', '2', '3'])
    expect(twoPages.mock.calls).toEqual([[null], ['c1']])
    expect(threePages.mock.calls).toEqual([[null], ['c1'], ['c2']])
    expect(Object.isFrozen(two)).toBe(true)
  })

  it('returns a frozen empty array for an empty terminal connection', async () => {
    const result = await fetchAllJobberPages(async () => page([], null, false))
    expect(result).toEqual([])
    expect(Object.isFrozen(result)).toBe(true)
  })

  it.each([
    ['repeated cursor', [page(['1'], 'same', true), page(['2'], 'same', true)]],
    ['null continuation cursor', [page(['1'], null, true)]],
    ['empty continuation cursor', [page(['1'], '', true)]],
    ['duplicate ID on one page', [page(['1', '1'], null, false)]],
    ['duplicate ID across pages', [page(['1'], 'c1', true), page(['1'], null, false)]],
  ])('rejects %s without returning partial nodes', async (_name, pages) => {
    let index = 0
    await expect(fetchAllJobberPages(async () => pages[index++]!)).rejects.toThrow()
  })

  it('rejects malformed pageInfo', async () => {
    await expect(fetchAllJobberPages(async () => ({
      nodes: [{ id: '1' }],
      pageInfo: { endCursor: 1, hasNextPage: false },
    // Deliberately malformed runtime input.
    } as never))).rejects.toThrow('Invalid Jobber connection page')
  })

  it('accepts the maxPages boundary and rejects overflow at both explicit and default bounds', async () => {
    let boundaryPage = 0
    await expect(fetchAllJobberPages(async () => {
      boundaryPage += 1
      return page([String(boundaryPage)], boundaryPage === 2 ? null : `c${boundaryPage}`, boundaryPage < 2)
    }, { maxPages: 2 })).resolves.toHaveLength(2)

    let overflowPage = 0
    await expect(fetchAllJobberPages(async () => {
      overflowPage += 1
      return page([String(overflowPage)], `c${overflowPage}`, true)
    }, { maxPages: 2 })).rejects.toThrow('Jobber pagination exceeded 2 pages')

    let defaultPage = 0
    await expect(fetchAllJobberPages(async () => {
      defaultPage += 1
      return page([String(defaultPage)], `c${defaultPage}`, true)
    })).rejects.toThrow('Jobber pagination exceeded 100 pages')
    expect(defaultPage).toBe(100)
  })
})
