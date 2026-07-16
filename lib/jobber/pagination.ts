import type { JobberConnectionPage, JobberNodeIdentity } from './invoice-types'

const DEFAULT_MAX_PAGES = 100

export async function fetchAllJobberPages<T extends JobberNodeIdentity>(
  fetchPage: (after: string | null) => Promise<JobberConnectionPage<T>>,
  options: { maxPages?: number } = {},
): Promise<readonly T[]> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error('Jobber pagination maxPages must be a positive integer')
  }

  const nodes: T[] = []
  const ids = new Set<string>()
  const cursors = new Set<string>()
  let after: string | null = null

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await fetchPage(after)
    assertConnectionPage(page)

    for (const node of page.nodes) {
      if (!node || typeof node.id !== 'string' || node.id.length === 0) {
        throw new Error('Invalid Jobber connection node identity')
      }
      if (ids.has(node.id)) {
        throw new Error(`Duplicate Jobber connection node ID: ${node.id}`)
      }
      ids.add(node.id)
      nodes.push(node)
    }

    if (!page.pageInfo.hasNextPage) {
      return Object.freeze([...nodes])
    }

    const cursor = page.pageInfo.endCursor
    if (!cursor) {
      throw new Error('Jobber connection hasNextPage requires a non-empty endCursor')
    }
    if (cursors.has(cursor)) {
      throw new Error('Jobber pagination cursor repeated')
    }
    cursors.add(cursor)
    after = cursor
  }

  throw new Error(`Jobber pagination exceeded ${maxPages} pages`)
}

function assertConnectionPage<T extends JobberNodeIdentity>(value: JobberConnectionPage<T>): void {
  if (
    !value ||
    !Array.isArray(value.nodes) ||
    !value.pageInfo ||
    typeof value.pageInfo.hasNextPage !== 'boolean' ||
    !(value.pageInfo.endCursor === null || typeof value.pageInfo.endCursor === 'string')
  ) {
    throw new Error('Invalid Jobber connection page')
  }
}
