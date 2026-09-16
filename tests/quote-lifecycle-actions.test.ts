import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQuote, getQuote, searchQuotes, updateQuote } from '@/lib/actions/quotes'
import { moveQuoteToTrash, restoreQuote, searchDeletedQuotes } from '@/lib/actions/quote-lifecycle'
import { resetDevData } from '@/lib/dev-data'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const input = {
  customerName: 'Recovery fixture', workingDays: 1, labourPerDay: 1,
  materialMarket: 10, materialActual: 10, selectedMin: 1, selectedMax: 2,
  items: [{ productNameSnapshot: 'Paint', marketPriceSnapshot: 10, actualPriceSnapshot: 8, quantity: 1, isCustom: true, memo: 'Keep' }],
  options: [{ title: 'Option', selectedMin: 1, selectedMax: 2, items: [{ productNameSnapshot: 'Option paint', marketPriceSnapshot: 5, actualPriceSnapshot: 4, quantity: 1, isCustom: true }] }],
  memos: [{ body: 'Internal memo' }],
  jobberQuoteLines: [{ kind: 'text', name: 'Service title', taxable: false, clientVisible: true }],
}

async function fixture() {
  const created = await createQuote(input)
  if (!created.ok) throw new Error(created.error)
  const result = await getQuote(created.data.id)
  if (!result.ok || !result.data) throw new Error('Fixture missing')
  return result.data
}

describe('quote trash and restore', () => {
  beforeEach(() => { resetDevData(); vi.stubEnv('NEXT_PUBLIC_DEV_NO_AUTH', 'true') })

  it('hides a quote then restores the same ID and all saved contents', async () => {
    const before = await fixture()
    expect(await moveQuoteToTrash({ id: before.id, expectedVersion: before.version })).toEqual({ ok: true, data: { id: before.id } })
    expect(await getQuote(before.id)).toEqual({ ok: true, data: null })
    expect(await searchQuotes('Recovery')).toEqual({ ok: true, data: [] })
    const trash = await searchDeletedQuotes({ query: 'Recovery' })
    if (!trash.ok) throw new Error(trash.error)
    expect(trash.data.items).toHaveLength(1)
    expect(trash.data.items[0]).toMatchObject({ id: before.id, version: 2, deletedByName: 'Dev User' })
    expect(await restoreQuote({ id: before.id, expectedVersion: 2 })).toEqual({ ok: true, data: { id: before.id } })
    const after = await getQuote(before.id)
    if (!after.ok || !after.data) throw new Error('Restore failed')
    expect(after.data).toEqual({ ...before, version: 3 })
    expect(await searchDeletedQuotes({})).toEqual({ ok: true, data: { items: [], page: 1, hasNextPage: false } })
  })

  it('rejects stale edits and lifecycle requests while preserving repeated request idempotency', async () => {
    const quote = await fixture()
    const request = { id: quote.id, expectedVersion: 1 }
    expect((await moveQuoteToTrash(request)).ok).toBe(true)
    expect((await moveQuoteToTrash(request)).ok).toBe(true)
    expect((await updateQuote({ ...input, id: quote.id, expectedVersion: 1 })).ok).toBe(false)
    expect((await restoreQuote(request)).ok).toBe(false)
    expect((await restoreQuote({ ...request, expectedVersion: 2 })).ok).toBe(true)
    expect((await restoreQuote({ ...request, expectedVersion: 2 })).ok).toBe(true)
    expect((await moveQuoteToTrash(request)).ok).toBe(false)
  })

  it('rejects invalid inputs and missing records', async () => {
    expect((await moveQuoteToTrash({ id: '', expectedVersion: 1 })).ok).toBe(false)
    expect((await restoreQuote({ id: 'unknown', expectedVersion: 0 })).ok).toBe(false)
    expect((await restoreQuote({ id: 'unknown', expectedVersion: 1 })).ok).toBe(false)
    expect((await searchDeletedQuotes({ page: -1 })).ok).toBe(false)
    expect((await searchDeletedQuotes({ query: 'a'.repeat(201) })).ok).toBe(false)
  })

  it('prevents numeric and encoded Jobber re-imports from overwriting trash', async () => {
    const created = await createQuote({ ...input, jobberQuoteId: btoa('gid://Jobber/Quote/52237381') })
    if (!created.ok) throw new Error(created.error)
    await moveQuoteToTrash({ id: created.data.id, expectedVersion: 1 })
    expect(await createQuote({ ...input, jobberQuoteId: '52237381', customerName: 'Overwrite attempt' }))
      .toMatchObject({ ok: false, error: expect.stringContaining('Trash') })
    await restoreQuote({ id: created.data.id, expectedVersion: 2 })
    const restored = await getQuote(created.data.id)
    expect(restored).toMatchObject({ ok: true, data: { customerName: 'Recovery fixture', version: 3 } })
  })

  it('keeps more than fifty deleted quotes accessible through pagination and search', async () => {
    for (let i = 0; i < 51; i++) {
      const created = await createQuote({ ...input, customerName: `Recovery ${i}` })
      if (!created.ok) throw new Error(created.error)
      await moveQuoteToTrash({ id: created.data.id, expectedVersion: 1 })
    }
    const first = await searchDeletedQuotes({})
    const second = await searchDeletedQuotes({ page: 2 })
    const found = await searchDeletedQuotes({ query: 'Recovery 50' })
    if (!first.ok || !second.ok || !found.ok) throw new Error('Search failed')
    expect(first.data.items).toHaveLength(50)
    expect(first.data.hasNextPage).toBe(true)
    expect(second.data.items).toHaveLength(1)
    expect(second.data.hasNextPage).toBe(false)
    expect(new Set([...first.data.items, ...second.data.items].map((q) => q.id)).size).toBe(51)
    expect(found.data.items).toHaveLength(1)
  })
})
