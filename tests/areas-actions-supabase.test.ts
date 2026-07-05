import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isDevNoAuthMode: vi.fn(),
  requireAllowedUser: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/actions/types', async () => {
  const actual = await vi.importActual<typeof import('@/lib/actions/types')>('@/lib/actions/types')
  return {
    ...actual,
    isDevNoAuthMode: mocks.isDevNoAuthMode,
  }
})

vi.mock('@/lib/security/require-allowed-user', () => ({
  requireAllowedUser: mocks.requireAllowedUser,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

import { createArea, deleteArea, listAreas, updateArea } from '@/lib/actions/areas'

const areaRow = {
  id: 'area-1',
  scope: 'exterior',
  name: 'Fascia',
  active: true,
  position: 0,
  created_at: '2026-05-15T00:00:00.000Z',
  updated_at: '2026-05-15T00:00:00.000Z',
}

function createAreasListBuilder(response: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => resolve(response),
  }
  return builder
}

function createAreasInsertBuilder(response: unknown) {
  const builder = {
    insert: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => response),
  }
  return builder
}

function createAreasUpdateBuilder(response: unknown) {
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => response),
  }
  return builder
}

describe('area actions against Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDevNoAuthMode.mockReturnValue(false)
    mocks.requireAllowedUser.mockResolvedValue({
      ok: true,
      user: { id: 'user-1', email: 'owner@example.com' },
    })
  })

  it('lists active areas from Supabase in dropdown order', async () => {
    const builder = createAreasListBuilder({ data: [areaRow], error: null })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => builder),
    })

    const result = await listAreas()

    expect(result).toEqual({
      ok: true,
      data: [expect.objectContaining({ id: 'area-1', scope: 'exterior', name: 'Fascia' })],
    })
    expect(builder.eq).toHaveBeenCalledWith('active', true)
    expect(builder.order).toHaveBeenCalledTimes(3)
  })

  it('returns Supabase errors when area listing fails', async () => {
    const builder = createAreasListBuilder({ data: null, error: new Error('area read failed') })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => builder),
    })

    const result = await listAreas()

    expect(result).toEqual({ ok: false, error: 'area read failed' })
  })

  it('rejects disallowed users before listing areas', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: false,
      error: 'User is not allowed to access this app',
    })

    const result = await listAreas()

    expect(result).toEqual({ ok: false, error: 'User is not allowed to access this app' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('creates an area through Supabase and revalidates consumers', async () => {
    const builder = createAreasInsertBuilder({ data: areaRow, error: null })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => builder),
    })

    const result = await createArea({ scope: 'exterior', name: 'Fascia' })

    expect(result.ok).toBe(true)
    expect(builder.insert).toHaveBeenCalledWith({
      scope: 'exterior',
      name: 'Fascia',
      active: true,
      position: 0,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/quotes/new')
  })

  it('updates an area through Supabase and revalidates consumers', async () => {
    const updatedRow = { ...areaRow, scope: 'interior', name: 'Feature Wall' }
    const builder = createAreasUpdateBuilder({ data: updatedRow, error: null })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => builder),
    })

    const result = await updateArea({ id: 'area-1', scope: 'interior', name: ' Feature Wall ' })

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ id: 'area-1', scope: 'interior', name: 'Feature Wall' }),
    })
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'interior',
      name: 'Feature Wall',
    }))
    expect(builder.eq).toHaveBeenCalledWith('id', 'area-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/quotes/new')
  })

  it('returns fetch failures when area update throws before Supabase returns a result', async () => {
    const builder = createAreasUpdateBuilder({ data: null, error: null })
    builder.single.mockRejectedValueOnce(new TypeError('fetch failed'))
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => builder),
    })

    const result = await updateArea({ id: 'area-1', scope: 'interior', name: 'Feature Wall' })

    expect(result).toEqual({ ok: false, error: 'fetch failed' })
  })

  it('soft deletes an area through Supabase and revalidates consumers', async () => {
    const deletedRow = { ...areaRow, active: false }
    const builder = createAreasUpdateBuilder({ data: deletedRow, error: null })
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => builder),
    })

    const result = await deleteArea({ id: 'area-1' })

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({ id: 'area-1', active: false }),
    })
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
    }))
    expect(builder.eq).toHaveBeenCalledWith('id', 'area-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/settings')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/quotes/new')
  })

  it('returns fetch failures when area delete throws before Supabase returns a result', async () => {
    const builder = createAreasUpdateBuilder({ data: null, error: null })
    builder.single.mockRejectedValueOnce(new TypeError('fetch failed'))
    mocks.createClient.mockResolvedValueOnce({
      from: vi.fn(() => builder),
    })

    const result = await deleteArea({ id: 'area-1' })

    expect(result).toEqual({ ok: false, error: 'fetch failed' })
  })
})
