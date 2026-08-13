import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isDevNoAuthMode: vi.fn(),
  requireAllowedUser: vi.fn(),
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

vi.mock('@/lib/security/require-app-user', () => ({
  requireRole: mocks.requireAllowedUser,
}))

import {
  createInventoryItem,
  deleteInventoryItem,
  importInventoryCSV,
  listInventory,
  listInventoryCategories,
  updateInventoryMovement,
  updateInventoryItem,
} from '@/lib/actions/inventory'

const inventoryRow = {
  id: '00000000-0000-4000-8000-000000000021',
  name: 'Weathershield',
  category: 'Paint',
  brand: 'Dulux',
  model_specification: null,
  colour: 'Monument (low)',
  size_or_serial: '15L',
  quantity: '1.00',
  purchase_date: null,
  used_date: '2026-05-07',
  used_location_text: '07/May Manly',
  status: 'out',
  notes: null,
  source_year: '2026',
  active: true,
  created_at: '2026-07-08T00:00:00.000Z',
  updated_at: '2026-07-08T00:00:00.000Z',
}

function createThenableRequest(response: unknown) {
  const request = {
    select: vi.fn(() => request),
    eq: vi.fn(() => request),
    order: vi.fn(() => request),
    limit: vi.fn(() => request),
    range: vi.fn(() => request),
    or: vi.fn(() => request),
    then: (resolve: (value: unknown) => unknown) => resolve(response),
  }
  return request
}

function createInsertBuilder(response: unknown) {
  const builder = {
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => response),
    then: (resolve: (value: unknown) => unknown) => resolve(response),
  }
  return builder
}

describe('inventory actions against Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDevNoAuthMode.mockReturnValue(false)
    mocks.requireAllowedUser.mockResolvedValue({
      ok: true,
      user: { id: 'user-1', email: 'owner@example.com' },
    })
  })

  it('creates an inventory row through Supabase', async () => {
    const builder = createInsertBuilder({ data: inventoryRow, error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => builder) })

    const result = await createInventoryItem({
      name: 'Weathershield',
      category: 'Paint',
      brand: 'Dulux',
      colour: 'Monument (low)',
      sizeOrSerial: '15L',
      quantity: 1,
      status: 'out',
      usedDate: '2026-05-07',
      usedLocationText: '07/May Manly',
      sourceYear: '2026',
    })

    expect(result.ok).toBe(true)
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Weathershield',
      quantity: '1.00',
      status: 'out',
      used_date: '2026-05-07',
      used_location_text: '07/May Manly',
    }))
  })

  it('lists active inventory with search and status filters', async () => {
    const request = createThenableRequest({ data: [inventoryRow], error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => request) })

    const result = await listInventory({ query: 'manly monument', status: 'out', limit: 25 })

    expect(result.ok).toBe(true)
    expect(request.eq).toHaveBeenCalledWith('active', true)
    expect(request.eq).toHaveBeenCalledWith('status', 'out')
    expect(request.or).toHaveBeenCalledTimes(2)
    expect(request.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: false })
    expect(request.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false })
    expect(request.range).toHaveBeenCalledWith(0, 25)
    if (result.ok) {
      expect(result.data).toEqual({
        items: [expect.objectContaining({ id: inventoryRow.id })],
        hasMore: false,
        nextOffset: null,
      })
    }
  })

  it('lists normalized active inventory categories independently of item pages', async () => {
    const request = createThenableRequest({
      data: [
        { category: ' Tools ' },
        { category: 'Paint' },
        { category: 'tools' },
        { category: null },
        { category: '' },
      ],
      error: null,
    })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => request) })

    const result = await listInventoryCategories()

    expect(result).toEqual({ ok: true, data: ['Paint', 'Tools'] })
    expect(request.select).toHaveBeenCalledWith('category')
    expect(request.eq).toHaveBeenCalledWith('active', true)
    expect(request.range).toHaveBeenCalledWith(0, 999)
  })

  it('reads every category batch beyond the Supabase row cap', async () => {
    const firstRequest = createThenableRequest({
      data: Array.from({ length: 1000 }, () => ({ category: 'Common' })),
      error: null,
    })
    const secondRequest = createThenableRequest({ data: [{ category: 'Rare' }], error: null })
    const from = vi.fn()
      .mockReturnValueOnce(firstRequest)
      .mockReturnValueOnce(secondRequest)
    mocks.createClient.mockResolvedValueOnce({ from })

    const result = await listInventoryCategories()

    expect(result).toEqual({ ok: true, data: ['Common', 'Rare'] })
    expect(firstRequest.range).toHaveBeenCalledWith(0, 999)
    expect(secondRequest.range).toHaveBeenCalledWith(1000, 1999)
  })

  it('fetches one extra row and returns a full inventory page with the next offset', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      ...inventoryRow,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }))
    const request = createThenableRequest({ data: rows, error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => request) })

    const result = await listInventory({ offset: 50, limit: 50 })

    expect(request.range).toHaveBeenCalledWith(50, 100)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.items).toHaveLength(50)
      expect(result.data.hasMore).toBe(true)
      expect(result.data.nextOffset).toBe(100)
    }
  })

  it('returns no next offset when an inventory page is shorter than the limit', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      ...inventoryRow,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    }))
    const request = createThenableRequest({ data: rows, error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => request) })

    const result = await listInventory({ offset: 50, limit: 50 })

    expect(request.range).toHaveBeenCalledWith(50, 100)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.items).toHaveLength(20)
      expect(result.data.hasMore).toBe(false)
      expect(result.data.nextOffset).toBeNull()
    }
  })

  it('updates usage fields and soft deletes rows through Supabase', async () => {
    const updateBuilder = createInsertBuilder({ data: inventoryRow, error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => updateBuilder) })

    const updated = await updateInventoryItem({
      id: inventoryRow.id,
      usedDate: '2026-05-07',
      usedLocationText: '07/May Manly',
      status: 'out',
    })

    expect(updated.ok).toBe(true)
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      used_date: '2026-05-07',
      used_location_text: '07/May Manly',
      status: 'out',
      updated_at: expect.any(String),
    }))

    const deleteBuilder = createInsertBuilder({ data: { ...inventoryRow, active: false }, error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => deleteBuilder) })

    const deleted = await deleteInventoryItem({ id: inventoryRow.id })

    expect(deleted.ok).toBe(true)
    expect(deleteBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
      updated_at: expect.any(String),
    }))
  })

  it('allows the any-role guard to update movement fields only', async () => {
    const updateBuilder = createInsertBuilder({ data: inventoryRow, error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => updateBuilder) })

    const result = await updateInventoryMovement({
      id: inventoryRow.id,
      quantity: 2,
      usedDate: '2026-07-31',
      usedLocationText: 'Job 42',
      status: 'out',
    })

    expect(result.ok).toBe(true)
    expect(mocks.requireAllowedUser).toHaveBeenCalledWith('any')
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      quantity: '2.00',
      used_date: '2026-07-31',
      used_location_text: 'Job 42',
      status: 'out',
    }))
  })

  it('imports CSV rows after authorization', async () => {
    const builder = createInsertBuilder({ data: [inventoryRow], error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => builder) })

    const result = await importInventoryCSV({
      sourceYear: '2026',
      csvText: [
        'Name,Category,Brand,Colour,Size/Serial,Quantity,Purchase Date,Used Location,Status',
        'Weathershield,Paint,Dulux,Monument (low),15L,1,out,07/May Manly,out',
      ].join('\n'),
    })

    expect(result.ok).toBe(true)
    expect(builder.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Weathershield',
        status: 'out',
        source_year: '2026',
      }),
    ])
  })

  it('rejects disallowed users before reading inventory', async () => {
    mocks.requireAllowedUser.mockResolvedValueOnce({
      ok: false,
      error: 'User is not allowed to access this app',
    })

    const result = await listInventory({ limit: 20 })

    expect(result).toEqual({ ok: false, error: 'User is not allowed to access this app' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})
