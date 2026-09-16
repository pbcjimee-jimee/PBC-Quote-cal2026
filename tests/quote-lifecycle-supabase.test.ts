import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ client: vi.fn(), role: vi.fn(), profiles: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/actions/types', () => ({ isDevNoAuthMode: () => false }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.role }))
vi.mock('@/lib/user-profiles', () => ({ getUserProfilesById: mocks.profiles }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { moveQuoteToTrash, restoreQuote, searchDeletedQuotes } from '@/lib/actions/quote-lifecycle'

const id = '00000000-0000-4000-8000-000000000101'
const request = { id, expectedVersion: 4 }

describe('quote lifecycle server boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.role.mockResolvedValue({ ok: true, data: { id: 'admin' } })
    mocks.profiles.mockResolvedValue(new Map())
  })

  it('uses only the versioned RPC and invalidates quote routes on success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id, version: 5 }], error: null })
    mocks.client.mockResolvedValue({ rpc })
    expect((await moveQuoteToTrash(request)).ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('soft_delete_quote', { target_quote_id: id, expected_version: 4 })
    expect((await restoreQuote(request)).ok).toBe(true)
    expect(rpc).toHaveBeenCalledWith('restore_quote', { target_quote_id: id, expected_version: 4 })
    expect(mocks.role).toHaveBeenCalledWith('admin')
    expect(mocks.revalidate.mock.calls.map(([path]) => path)).toContain('/quotes/trash')
  })

  it('blocks unauthorized callers and malformed requests before the database', async () => {
    mocks.role.mockResolvedValue({ ok: false, error: 'Admin access required' })
    expect((await moveQuoteToTrash(request)).ok).toBe(false)
    expect((await restoreQuote(request)).ok).toBe(false)
    expect((await searchDeletedQuotes({})).ok).toBe(false)
    expect((await moveQuoteToTrash({ ...request, id: 'bad' })).ok).toBe(false)
    expect((await restoreQuote({ ...request, expectedVersion: 0 })).ok).toBe(false)
    expect((await searchDeletedQuotes({ page: 0 })).ok).toBe(false)
    expect(mocks.client).not.toHaveBeenCalled()
  })

  it.each([
    ['QUOTE_VERSION_CONFLICT', 'Refresh'], ['QUOTE_RESTORE_CONFLICT', 'duplicate'],
    ['QUOTE_IN_TRASH', 'Trash'], ['QUOTE_NOT_FOUND', 'not found'],
    ['ADMIN_REQUIRED', 'Admin'], ['private database details', 'Unable'],
  ])('maps %s without exposing database details', async (message, expected) => {
    mocks.client.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message } }) })
    const result = await restoreQuote(request)
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining(expected) })
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })

  it('handles missing records and connection failures', async () => {
    mocks.client.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) })
    expect(await restoreQuote(request)).toEqual({ ok: false, error: 'Quote not found.' })
    mocks.client.mockRejectedValue(new Error('private connection details'))
    expect(await moveQuoteToTrash(request)).toMatchObject({ ok: false, error: expect.stringContaining('Unable') })
    expect(await searchDeletedQuotes({})).toMatchObject({ ok: false, error: expect.stringContaining('Unable') })
  })

  it('queries only deleted summaries with a stable paginated order and batched profiles', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      id: String(i), version: 2, customer_name: 'Client', customer_address: null,
      quote_number: '3345', subtotal: '10.00', deleted_at: '2026-09-16T00:00:00Z', deleted_by: i ? null : 'admin',
    }))
    const builder = {
      select: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    }
    mocks.client.mockResolvedValue({ from: vi.fn().mockReturnValue(builder) })
    mocks.profiles.mockResolvedValue(new Map([['admin', { displayName: 'Admin' }]]))
    const result = await searchDeletedQuotes({ page: 2, query: '3345' })
    if (!result.ok) throw new Error(result.error)
    expect(result.data.items).toHaveLength(50)
    expect(result.data.hasNextPage).toBe(true)
    expect(result.data.items[0].deletedByName).toBe('Admin')
    expect(result.data.items[1].deletedByName).toBeNull()
    expect(builder.not).toHaveBeenCalledWith('deleted_at', 'is', null)
    expect(builder.order.mock.calls).toEqual([['deleted_at', { ascending: false }], ['id', { ascending: false }]])
    expect(builder.range).toHaveBeenCalledWith(50, 100)
    expect(builder.select.mock.calls[0][0]).not.toContain('actual')
    expect(mocks.profiles).toHaveBeenCalledWith(['admin'])
  })
})
