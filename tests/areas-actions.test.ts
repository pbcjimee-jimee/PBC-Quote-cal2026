import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createArea, listAreas } from '@/lib/actions/areas'
import { resetDevData } from '@/lib/dev-data'
import { revalidatePath } from 'next/cache'

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
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
})
