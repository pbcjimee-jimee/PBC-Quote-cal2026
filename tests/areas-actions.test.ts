import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createArea, deleteArea, listAreas, updateArea } from '@/lib/actions/areas'
import { resetDevData } from '@/lib/dev-data'
import { revalidatePath } from 'next/cache'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

describe('area actions', () => {
  beforeEach(() => {
    resetDevData()
    vi.mocked(revalidatePath).mockClear()
  })

  it('creates a settings area and makes it available to quote area dropdowns', async () => {
    const result = await createArea({ scope: 'exterior', name: ' Fascia ' })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)

    expect(result.data).toMatchObject({
      scope: 'exterior',
      name: 'Fascia',
      active: true,
    })

    const listResult = await listAreas()
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.some((area) => area.id === result.data.id && area.name === 'Fascia')).toBe(true)
    }

    expect(revalidatePath).toHaveBeenCalledWith('/settings')
    expect(revalidatePath).toHaveBeenCalledWith('/quotes/new')
  })

  it('updates and deletes settings areas used by the quote area dropdowns', async () => {
    const created = await createArea({ scope: 'exterior', name: ' Fascia ' })
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error(created.error)

    const updated = await updateArea({ id: created.data.id, scope: 'interior', name: 'Feature Wall' })
    expect(updated.ok).toBe(true)
    if (!updated.ok) throw new Error(updated.error)

    expect(updated.data).toMatchObject({
      id: created.data.id,
      scope: 'interior',
      name: 'Feature Wall',
      active: true,
    })

    const deleted = await deleteArea({ id: created.data.id })
    expect(deleted.ok).toBe(true)
    if (!deleted.ok) throw new Error(deleted.error)

    expect(deleted.data).toMatchObject({
      id: created.data.id,
      active: false,
    })

    const listResult = await listAreas()
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.some((area) => area.id === created.data.id)).toBe(false)
    }

    expect(revalidatePath).toHaveBeenCalledWith('/settings')
    expect(revalidatePath).toHaveBeenCalledWith('/quotes/new')
  })
})
