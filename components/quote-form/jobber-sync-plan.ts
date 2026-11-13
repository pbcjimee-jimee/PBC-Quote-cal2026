import type { JobberQuoteLineItemDraft } from './types'

export interface JobberSyncPlan {
  updateCount: number
  createCount: number
  deleteItems: Array<{ id: string; name: string | null }>
}

export function buildJobberSyncPlan(input: {
  lines: JobberQuoteLineItemDraft[]
  deletedJobberLineItemIds: string[]
  knownLineNames: ReadonlyMap<string, string>
}): JobberSyncPlan {
  const deletedIds = new Set(input.deletedJobberLineItemIds)
  const visibleIds = new Set<string>()
  let updateCount = 0
  let createCount = 0

  for (const line of input.lines) {
    const id = line.jobberLineItemId
    if (line.clientVisible === false) {
      if (id) deletedIds.add(id)
    } else if (id) {
      updateCount++
      visibleIds.add(id)
    } else {
      createCount++
    }
  }
  for (const id of visibleIds) deletedIds.delete(id)

  return {
    updateCount,
    createCount,
    deleteItems: Array.from(deletedIds, id => ({ id, name: input.knownLineNames.get(id) || null })),
  }
}
