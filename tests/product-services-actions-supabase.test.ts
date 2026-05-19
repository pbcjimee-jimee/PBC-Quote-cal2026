import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isDevNoAuthMode: vi.fn(),
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

import {
  createProductService,
  deleteProductService,
  importProductServicesCSV,
  listProductServices,
  searchProductServices,
  updateProductService,
} from '@/lib/actions/product-services'

const productServiceRow = {
  id: '00000000-0000-4000-8000-000000000011',
  name: 'Ceiling',
  description: 'All interior ceilings',
  category: 'Service',
  unit_price: '14.50',
  unit_cost: '0.00',
  bookable: false,
  duration_minutes: null,
  quantity_enabled: true,
  minimum_quantity: '1.00',
  maximum_quantity: null,
  taxable: true,
  active: true,
  created_at: '2026-05-19T00:00:00.000Z',
  updated_at: '2026-05-19T00:00:00.000Z',
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
    upsert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(async () => response),
    then: (resolve: (value: unknown) => unknown) => resolve(response),
  }
  return builder
}

describe('product service actions against Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isDevNoAuthMode.mockReturnValue(false)
  })

  it('creates a product service row through Supabase', async () => {
    const builder = createInsertBuilder({ data: productServiceRow, error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => builder) })

    const result = await createProductService({
      name: 'Ceiling',
      description: 'All interior ceilings',
      category: 'Service',
      unitPrice: 14.5,
      taxable: true,
    })

    expect(result.ok).toBe(true)
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Ceiling',
      unit_price: '14.50',
      taxable: true,
    }))
  })

  it('imports Jobber CSV rows with upsert on name and category', async () => {
    const builder = createInsertBuilder({ data: [productServiceRow], error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => builder) })

    const result = await importProductServicesCSV({
      csvText: [
        'Name,Description,Category,Unit Price,Unit Cost,Bookable,Duration Minutes,Quantity Enabled,Minimum Quantity,Maximum Quantity,Taxable,Active',
        '"Ceiling","All interior ceilings",Service,14.5,0,false,,true,1,,true,true',
      ].join('\n'),
    })

    expect(result.ok).toBe(true)
    expect(builder.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'Ceiling',
        unit_price: '14.50',
        quantity_enabled: true,
        minimum_quantity: '1.00',
      }),
    ], { onConflict: 'name,category' })
  })

  it('searches product services by normalized tokens', async () => {
    const request = createThenableRequest({ data: [productServiceRow], error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => request) })

    const result = await searchProductServices({ query: 'ceiling paint', limit: 8 })

    expect(result.ok).toBe(true)
    expect(request.or).toHaveBeenCalledTimes(2)
    expect(request.limit).toHaveBeenCalledWith(8)
  })

  it('lists product services without unit cost leakage controls beyond the catalog page', async () => {
    const request = createThenableRequest({ data: [productServiceRow], error: null })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => request) })

    const result = await listProductServices({ limit: 20 })

    expect(result.ok).toBe(true)
    expect(request.eq).toHaveBeenCalledWith('active', true)
  })

  it('updates product service fields through Supabase', async () => {
    const builder = createInsertBuilder({
      data: { ...productServiceRow, name: 'Ceiling Updated', unit_price: '18.25', active: true },
      error: null,
    })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => builder) })

    const result = await updateProductService({
      id: productServiceRow.id,
      name: 'Ceiling Updated',
      unitPrice: 18.25,
      unitCost: null,
      active: true,
    })

    expect(result.ok).toBe(true)
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Ceiling Updated',
      unit_price: '18.25',
      unit_cost: null,
      active: true,
      updated_at: expect.any(String),
    }))
    expect(builder.eq).toHaveBeenCalledWith('id', productServiceRow.id)
  })

  it('soft deletes product services through Supabase', async () => {
    const builder = createInsertBuilder({
      data: { ...productServiceRow, active: false },
      error: null,
    })
    mocks.createClient.mockResolvedValueOnce({ from: vi.fn(() => builder) })

    const result = await deleteProductService({ id: productServiceRow.id })

    expect(result.ok).toBe(true)
    expect(builder.update).toHaveBeenCalledWith(expect.objectContaining({
      active: false,
      updated_at: expect.any(String),
    }))
    expect(builder.eq).toHaveBeenCalledWith('id', productServiceRow.id)
  })

  it('returns validation and CSV errors before Supabase writes', async () => {
    const emptyUpdate = await updateProductService({ id: productServiceRow.id })
    expect(emptyUpdate.ok).toBe(false)
    if (!emptyUpdate.ok) expect(emptyUpdate.error).toBe('No fields to update')

    const malformedImport = await importProductServicesCSV({
      csvText: 'Name,Unit Price\nCeiling,not-a-number',
    })

    expect(malformedImport.ok).toBe(false)
    if (!malformedImport.ok) expect(malformedImport.error).toContain('invalid amount')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})
