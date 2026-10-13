import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
// Existing workstation runtime only; no project dependency is installed.
import { bootstrap, pgliteAvailable, savePayload } from './helpers/paint-comparison-postgres.mjs'

const suite = pgliteAvailable ? describe : describe.skip
suite('paint comparison migration on ephemeral PostgreSQL', () => {
  let db: { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>; exec(sql: string): Promise<unknown>; close(): Promise<void> }
  beforeAll(async () => { db = await bootstrap({ through: '20261014000000' }) }, 30000)
  afterAll(async () => { await db?.close() })
  it('migrates existing trashed quotes and preserves unknown linked Optional observations', async () => {
    const legacy = await bootstrap()
    try {
      const payload = savePayload({ amount: '150' })
      const legacyPayload = { ...payload, jobber_lines: [{ ...payload.jobber_lines[0], jobber_line_item_id: 'remote-existing', optional: undefined,
        recommended: undefined, selected: undefined, paint_comparison_key: undefined }] }
      const result = await legacy.query('SELECT public.create_quote_with_jobber_sync($1::jsonb) AS id', [JSON.stringify(legacyPayload)])
      const id = result.rows[0].id
      await legacy.query('SELECT * FROM public.soft_delete_quote($1::uuid,1)', [id])
      await legacy.exec(readFileSync('supabase/migrations/20261014000000_add_paint_comparison_optional_lines.sql', 'utf8'))
      expect((await legacy.query('SELECT optional, recommended, optional_write_policy FROM public.jobber_quote_lines WHERE quote_id=$1', [id])).rows[0])
        .toEqual({ optional: null, recommended: null, optional_write_policy: 'preserve' })
      expect((await legacy.query('SELECT i.logical_key=i.id AS stable FROM public.quote_items i WHERE quote_id=$1', [id])).rows[0].stable).toBe(true)
    } finally { await legacy.close() }
  }, 30000)
  it('atomically creates and updates signed Optional comparison data', async () => {
    const payload = savePayload()
    const created = await db.query('SELECT public.create_quote_with_jobber_sync($1::jsonb) AS id', [JSON.stringify(payload)])
    const id = created.rows[0].id
    const first = await db.query('SELECT q.paint_comparisons, i.logical_key, l.unit_price, l.optional, l.optional_write_policy FROM public.quotes q JOIN public.quote_items i ON i.quote_id=q.id JOIN public.jobber_quote_lines l ON l.quote_id=q.id WHERE q.id=$1', [id])
    expect(first.rows[0]).toMatchObject({ paint_comparisons: payload.quote.paint_comparisons, logical_key: payload.items[0].logical_key, unit_price: '-150.00', optional: true, optional_write_policy: 'set_true' })
    const update = { ...payload, id, expected_version: 1, jobber_lines: [{ ...payload.jobber_lines[0], unit_price: '-200', total_price: '-200' }] }
    await db.query('SELECT * FROM public.update_quote_with_jobber_sync($1::jsonb)', [JSON.stringify(update)])
    expect((await db.query('SELECT version FROM public.quotes WHERE id=$1', [id])).rows[0].version).toBe(2)
    await expect(db.query('SELECT * FROM public.update_quote_with_jobber_sync($1::jsonb)', [JSON.stringify(update)])).rejects.toThrow('QUOTE_VERSION_CONFLICT')
  })
  it('rejects cross-quote keys, non-Interior timber, duplicate public comparison rows, and rolls back all children', async () => {
    const payload = savePayload({ key: '00000000-0000-4000-8000-000000000402', logicalKey: '00000000-0000-4000-8000-000000000202' })
    const count = (await db.query('SELECT count(*)::integer AS count FROM public.quotes')).rows[0].count
    await expect(db.query('SELECT public.create_quote_with_jobber_sync($1::jsonb)', [JSON.stringify({ ...payload, jobber_lines: [{ ...payload.jobber_lines[0], paint_comparison_key: '00000000-0000-4000-8000-000000000403' }] })])).rejects.toThrow('PAINT_COMPARISON_QUOTE_MISMATCH')
    await expect(db.query('SELECT public.create_quote_with_jobber_sync($1::jsonb)', [JSON.stringify({ ...payload, items: [{ ...payload.items[0], timber_role: 'finish', area_scope_snapshot: 'roof' }] })])).rejects.toThrow('quote_items_timber_interior_check')
    await expect(db.query('SELECT public.create_quote_with_jobber_sync($1::jsonb)', [JSON.stringify({ ...payload, jobber_lines: [payload.jobber_lines[0], { ...payload.jobber_lines[0], position: 1 }] })])).rejects.toThrow('jobber_quote_lines_comparison_unique')
    expect((await db.query('SELECT count(*)::integer AS count FROM public.quotes')).rows[0].count).toBe(count)
  })
})
