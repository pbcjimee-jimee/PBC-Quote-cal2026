import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAllowedUser: vi.fn(),
  searchJobberInvoiceCandidates: vi.fn(),
}))

vi.mock('@/lib/security/require-allowed-user', () => ({ requireAllowedUser: mocks.requireAllowedUser }))
vi.mock('@/lib/jobber/invoice-gateway', () => ({ searchJobberInvoiceCandidates: mocks.searchJobberInvoiceCandidates }))

import { GET } from '@/app/api/jobber/progress-invoices/invoices/search/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAllowedUser.mockResolvedValue({ ok: true, user: { id: 'user-1', email: 'owner@example.invalid' } })
  mocks.searchJobberInvoiceCandidates.mockResolvedValue({ accountId: 'account-1', invoices: [] })
})

describe('Progress Invoice Jobber invoice search route', () => {
  it.each(['', '   ', 'x'.repeat(101)])('rejects invalid term %j before auth or gateway work', async (term) => {
    const response = await GET(new NextRequest(`http://localhost/api/jobber/progress-invoices/invoices/search?term=${encodeURIComponent(term)}`))
    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.searchJobberInvoiceCandidates).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', 'http://localhost/api/jobber/progress-invoices/invoices/search'],
    ['duplicate', 'http://localhost/api/jobber/progress-invoices/invoices/search?term=INV&term=OTHER'],
    ['extra', 'http://localhost/api/jobber/progress-invoices/invoices/search?term=INV&page=2'],
    ['malformed percent', 'http://localhost/api/jobber/progress-invoices/invoices/search?term=%E0%A4%A'],
    ['invalid UTF-8', 'http://localhost/api/jobber/progress-invoices/invoices/search?term=%FF'],
  ])('rejects %s query input before auth or gateway work', async (_name, url) => {
    const response = await GET(new NextRequest(url))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.requireAllowedUser).not.toHaveBeenCalled()
    expect(mocks.searchJobberInvoiceCandidates).not.toHaveBeenCalled()
  })

  it('requires an allowed user before gateway/token/network work', async () => {
    mocks.requireAllowedUser.mockResolvedValue({ ok: false, error: 'Authentication required' })
    const response = await GET(new NextRequest('http://localhost/api/jobber/progress-invoices/invoices/search?term=INV'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, error: 'Authentication required' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.searchJobberInvoiceCandidates).not.toHaveBeenCalled()
  })

  it('returns safe no-store JSON for successful search', async () => {
    mocks.searchJobberInvoiceCandidates.mockResolvedValue({ accountId: 'account-1', invoices: [{ id: 'invoice-1', invoiceNumber: 'INV-1' }] })
    const response = await GET(new NextRequest('http://localhost/api/jobber/progress-invoices/invoices/search?term=%20INV-1%20'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: true, data: { accountId: 'account-1', invoices: [{ id: 'invoice-1', invoiceNumber: 'INV-1' }] } })
    expect(mocks.searchJobberInvoiceCandidates).toHaveBeenCalledWith({ term: 'INV-1' })
  })

  it('maps gateway failures to safe no-store JSON without raw response data', async () => {
    mocks.searchJobberInvoiceCandidates.mockRejectedValue(new Error('secret upstream fragment'))
    const response = await GET(new NextRequest('http://localhost/api/jobber/progress-invoices/invoices/search?term=INV'))
    expect(response.status).toBe(502)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ ok: false, error: 'Unable to search Jobber invoices' })
  })
})
