import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), createClient: vi.fn(), devNoAuth: vi.fn() }))
vi.mock('@/lib/security/require-app-user', () => ({ requireRole: mocks.requireRole }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/actions/types', () => ({ isDevNoAuthMode: mocks.devNoAuth }))

import { getAiMonthlyBudgetStatus } from '@/lib/ai-quote/budget'
import { getAiBudgetStatus, updateAiMonthlyBudget } from '@/lib/actions/ai-budget'

function database(budget: string | null = '30.00', costs = ['0.1234', '1.2345']) {
  const query = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), order: vi.fn(), range: vi.fn(),
    maybeSingle: vi.fn(), update: vi.fn() }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.gte.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.range.mockImplementation((start: number, end: number) => Promise.resolve({
    data: costs.slice(start, end + 1).map(cost_usd => ({ cost_usd })), error: null,
  }))
  query.maybeSingle.mockImplementation(async () => ({ data: budget === null ? null : { id: true, monthly_budget_usd: budget }, error: null }))
  query.update.mockImplementation((value: { monthly_budget_usd: string }) => { budget = value.monthly_budget_usd; return query })
  const from = vi.fn(() => query)
  return { query, from, client: { from } as unknown as SupabaseClient<Database> }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'))
  mocks.devNoAuth.mockReturnValue(false)
  mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'admin', email: 'jimee@paintbuddyco.com.au' }, profile: { role: 'admin', email: 'jimee@paintbuddyco.com.au' } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('monthly AI budget', () => {
  it.each([
    ['2026-10-31T12:00:00Z', '2026-09-30T14:00:00.000Z'],
    ['2026-10-31T13:00:00Z', '2026-10-31T13:00:00.000Z'],
    ['2026-04-30T12:00:00Z', '2026-03-31T13:00:00.000Z'],
    ['2026-05-01T00:00:00Z', '2026-04-30T14:00:00.000Z'],
    ['2026-01-01T00:00:00Z', '2025-12-31T13:00:00.000Z'],
  ])('uses Sydney month midnight including DST for %s', async (now, monthStart) => {
    vi.setSystemTime(new Date(now))
    const db = database()
    expect((await getAiMonthlyBudgetStatus(db.client)).monthStart).toBe(monthStart)
    expect(db.query.gte).toHaveBeenCalledWith('created_at', monthStart)
  })

  it('sums exact costs across all users and kinds, rounding only the final display', async () => {
    const db = database()
    expect(await getAiMonthlyBudgetStatus(db.client)).toMatchObject({ budgetUsd: '30.00', spentUsd: '1.36', remainingUsd: '28.64', reached: false })
    expect(db.from).toHaveBeenCalledWith('ai_quote_runs')
    expect(db.query.select).toHaveBeenCalledWith('cost_usd')
    expect(db.query.eq.mock.calls).toEqual([['id', true]])
  })

  it('includes runs beyond the PostgREST page size', async () => {
    const db = database('30.00', Array.from({ length: 1001 }, () => '0.01'))
    expect((await getAiMonthlyBudgetStatus(db.client)).spentUsd).toBe('10.01')
  })

  it('falls back to the configured budget if the settings row is absent', async () => {
    expect((await getAiMonthlyBudgetStatus(database(null, []).client)).budgetUsd).toBe('30.00')
  })

  it.each(['30.0000', '31.0000'])('reaches the budget at or above equality (%s)', async cost => {
    expect(await getAiMonthlyBudgetStatus(database('30.00', [cost]).client)).toMatchObject({ reached: true, remainingUsd: '0.00' })
  })

  it('does not round usage up when deciding whether the budget is reached', async () => {
    expect((await getAiMonthlyBudgetStatus(database('30.00', ['29.9999']).client)).reached).toBe(false)
  })

  it('fails closed when usage or settings cannot be read', async () => {
    const db = database()
    db.query.range.mockResolvedValue({ data: null, error: { code: 'oops' } })
    await expect(getAiMonthlyBudgetStatus(db.client)).rejects.toEqual({ code: 'oops' })
    db.query.maybeSingle.mockResolvedValue({ data: null, error: { code: 'settings' } })
    await expect(getAiMonthlyBudgetStatus(db.client)).rejects.toEqual({ code: 'settings' })
  })
})

describe('budget actions', () => {
  it.each(['get', 'update'])('rejects another admin account for %s', async action => {
    mocks.requireRole.mockResolvedValue({ ok: true, user: { id: 'other-admin', email: 'other@paintbuddyco.com.au' },
      profile: { role: 'admin', email: 'jimee@paintbuddyco.com.au' } })
    const result = action === 'get' ? await getAiBudgetStatus() : await updateAiMonthlyBudget({ monthlyBudgetUsd: 40 })
    expect(result).toEqual({ ok: false, error: 'AI quoting is not enabled for your account.' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each(['get', 'update'])('rejects non-admin %s', async action => {
    mocks.requireRole.mockResolvedValue({ ok: false, code: 'FORBIDDEN', error: 'Admin access required.' })
    const result = action === 'get' ? await getAiBudgetStatus() : await updateAiMonthlyBudget({ monthlyBudgetUsd: 40 })
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(mocks.requireRole).toHaveBeenCalledWith('admin')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each([0, -1, 1001, 1.001, NaN, Infinity, '30', null])('rejects invalid limit %s', async monthlyBudgetUsd => {
    expect(await updateAiMonthlyBudget({ monthlyBudgetUsd })).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it.each([0.01, 1, 30.25, 1000])('saves valid limit %s and returns fresh usage', async monthlyBudgetUsd => {
    const db = database()
    mocks.createClient.mockResolvedValue(db.client)
    const result = await updateAiMonthlyBudget({ monthlyBudgetUsd })
    expect(result).toMatchObject({ ok: true, data: { budgetUsd: monthlyBudgetUsd.toFixed(2), spentUsd: '1.36' } })
    expect(db.query.update).toHaveBeenCalledWith({ monthly_budget_usd: monthlyBudgetUsd.toFixed(2) })
  })

  it('loads current status for admins', async () => {
    mocks.createClient.mockResolvedValue(database().client)
    expect(await getAiBudgetStatus()).toMatchObject({ ok: true, data: { budgetUsd: '30.00', spentUsd: '1.36' } })
  })

  it('rejects development without authentication', async () => {
    mocks.devNoAuth.mockReturnValue(true)
    expect(await getAiBudgetStatus()).toMatchObject({ ok: false, code: 'AUTH_REQUIRED' })
    expect(await updateAiMonthlyBudget({ monthlyBudgetUsd: 30 })).toMatchObject({ ok: false, code: 'AUTH_REQUIRED' })
  })

  it('returns a safe friendly error on database failures', async () => {
    mocks.createClient.mockRejectedValue(new Error('private@example.com secret'))
    for (const result of [await getAiBudgetStatus(), await updateAiMonthlyBudget({ monthlyBudgetUsd: 30 })]) {
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Please try again.') })
      expect(JSON.stringify(result)).not.toContain('private@example.com')
    }
  })

  it('rejects an update when the singleton is missing', async () => {
    const db = database()
    db.query.maybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.createClient.mockResolvedValue(db.client)
    expect(await updateAiMonthlyBudget({ monthlyBudgetUsd: 40 })).toMatchObject({ ok: false })
  })
})
