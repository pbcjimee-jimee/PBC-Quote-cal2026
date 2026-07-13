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

vi.mock('@/lib/security/require-allowed-user', () => ({
  requireAllowedUser: mocks.requireAllowedUser,
}))

import {
  createInventoryItem,
  deleteInventoryItem,
  importInventoryCSV,
  listInventory,
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
    expect(request.limit).toHaveBeenCalledWith(25)
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
