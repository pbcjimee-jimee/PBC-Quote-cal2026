import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { actorId, bootstrap, pgliteAvailable, savePayload } from './helpers/paint-comparison-postgres.mjs'

interface SqlDb {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec(sql: string): Promise<unknown>
  close(): Promise<void>
}

const otherId = '00000000-0000-4000-8000-000000000002'
const supervisorId = '00000000-0000-4000-8000-000000000003'
const tables = ['ai_quote_runs', 'ai_quote_knowledge', 'ai_quote_eval_cases'] as const

describe.skipIf(!pgliteAvailable)('AI quote migration on ephemeral PostgreSQL', () => {
  let db: SqlDb
  let version = 0

  beforeAll(async () => {
    db = await bootstrap({ through: '20261030235959' })
    await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::UUID $$;
      INSERT INTO auth.users(id,email) VALUES ('${otherId}','other@example.test'),('${supervisorId}','supervisor@example.test');
      INSERT INTO public.user_profiles(id,email,role,is_active) VALUES
        ('${otherId}','other@example.test','admin',true),('${supervisorId}','supervisor@example.test','supervisor',true);`)
  }, 30000)
  afterAll(async () => { await db?.close() })
  beforeEach(async () => { await login(actorId) })

  async function login(id: string) {
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id])
    await db.exec('SET ROLE authenticated')
  }

  async function insert(table: typeof tables[number], overrides: Record<string, unknown> = {}) {
    let values: Record<string, unknown>
    if (table === 'ai_quote_runs') {
      values = { kind: 'quote_draft', status: 'running', model: 'claude-opus-5-5', prompt_version: 'quote-draft-v1' }
    } else if (table === 'ai_quote_knowledge') {
      values = { version: ++version, status: 'draft', style_guide: 'Style', pricing_guide: 'Pricing', stats: {}, source_counts: {},
        run_id: (await insert('ai_quote_runs', { kind: 'knowledge_build' })).id }
    } else {
      const payload = savePayload({ key: randomUUID(), logicalKey: randomUUID() })
      const quote = await db.query<{ id: string }>('SELECT public.create_quote_with_children($1::jsonb) AS id', [JSON.stringify(payload)])
      values = { set_label: 'baseline', quote_id: quote.rows[0].id, memo: 'Paint walls',
        memo_run_id: (await insert('ai_quote_runs', { kind: 'eval_memo' })).id }
    }
    const entries = Object.entries({ ...values, ...overrides })
    return (await db.query<{ id: string; created_by: string }>(`INSERT INTO public.${table}
      (${entries.map(([key]) => key).join(',')}) VALUES (${entries.map((_, index) => `$${index + 1}`).join(',')}) RETURNING id,created_by`,
    entries.map(([, value]) => typeof value === 'object' && value !== null ? JSON.stringify(value) : value))).rows[0]
  }

  it('lets an admin insert a run attributed to themselves', async () => {
    expect((await insert('ai_quote_runs')).created_by).toBe(actorId)
  })

  it.each(tables)('rejects a spoofed creator on %s', async table => {
    await expect(insert(table, { created_by: otherId })).rejects.toMatchObject({ code: '42501' })
  })

  it.each(tables)('preserves the creator when another admin updates %s', async table => {
    const row = await insert(table)
    await login(otherId)
    expect((await db.query(`UPDATE public.${table} SET created_by=$2 WHERE id=$1 RETURNING created_by`, [row.id, otherId])).rows)
      .toEqual([{ created_by: actorId }])
  })

  it.each(tables)('hides %s from supervisors and rejects inserts', async table => {
    const row = await insert(table)
    const original = (await db.query<{ value: unknown }>(`SELECT to_jsonb(t) AS value FROM public.${table} t WHERE id=$1`, [row.id])).rows[0].value
    await login(supervisorId)
    expect((await db.query(`SELECT * FROM public.${table}`)).rows).toEqual([])
    expect((await db.query(`UPDATE public.${table} SET created_by=$2 WHERE id=$1 RETURNING id`, [row.id, supervisorId])).rows).toEqual([])
    await expect(db.query(`INSERT INTO public.${table} SELECT
      (jsonb_populate_record(NULL::public.${table},$1::jsonb||jsonb_build_object('id',$2::text,'created_by',$3::text))).*`,
    [JSON.stringify(original), randomUUID(), supervisorId]))
      .rejects.toMatchObject({ code: '42501' })
  })

  it.each(['ai_quote_runs', 'ai_quote_knowledge'] as const)('does not allow deleting %s', async table => {
    const row = await insert(table)
    await expect(db.query(`DELETE FROM public.${table} WHERE id=$1`, [row.id])).rejects.toMatchObject({ code: '42501' })
  })

  it.each(tables)('denies anonymous table access to %s', async table => {
    await db.exec('RESET ROLE; SET ROLE anon')
    await expect(db.query(`SELECT * FROM public.${table}`)).rejects.toMatchObject({ code: '42501' })
  })

  it('hides AI data and refuses activation for an inactive admin', async () => {
    const row = await insert('ai_quote_knowledge')
    await db.exec('RESET ROLE')
    await db.query('UPDATE public.user_profiles SET is_active=false WHERE id=$1', [otherId])
    await login(otherId)
    try {
      for (const table of tables) expect((await db.query(`SELECT * FROM public.${table}`)).rows).toEqual([])
      await expect(db.query('SELECT public.activate_ai_quote_knowledge($1)', [row.id])).rejects.toMatchObject({ code: '42501' })
    } finally {
      await db.exec('RESET ROLE')
      await db.query('UPDATE public.user_profiles SET is_active=true WHERE id=$1', [otherId])
    }
  })

  it('allows only one active knowledge version', async () => {
    await db.exec("UPDATE public.ai_quote_knowledge SET status='archived' WHERE status='active'")
    await insert('ai_quote_knowledge', { status: 'active' })
    await expect(insert('ai_quote_knowledge', { status: 'active' })).rejects.toMatchObject({ code: '23505' })
  })

  it('activates a draft and archives the previous active version', async () => {
    await db.exec("UPDATE public.ai_quote_knowledge SET status='archived' WHERE status='active'")
    const previous = await insert('ai_quote_knowledge', { status: 'active' })
    const draft = await insert('ai_quote_knowledge')
    await login(otherId)
    expect((await db.query('SELECT public.activate_ai_quote_knowledge($1) AS id', [draft.id])).rows).toEqual([{ id: draft.id }])
    expect((await db.query('SELECT status FROM public.ai_quote_knowledge WHERE id=$1', [previous.id])).rows).toEqual([{ status: 'archived' }])
    expect((await db.query('SELECT status,approved_by,approved_at,updated_at FROM public.ai_quote_knowledge WHERE id=$1', [draft.id])).rows[0])
      .toMatchObject({ status: 'active', approved_by: otherId, approved_at: expect.any(Date), updated_at: expect.any(Date) })
  })

  it('keeps the active version if the requested version does not exist', async () => {
    const before = (await db.query("SELECT id FROM public.ai_quote_knowledge WHERE status='active'")).rows
    await expect(db.query('SELECT public.activate_ai_quote_knowledge($1)', [randomUUID()])).rejects.toMatchObject({ code: 'P0002' })
    expect((await db.query("SELECT id FROM public.ai_quote_knowledge WHERE status='active'")).rows).toEqual(before)
  })

  it('refuses activation for a supervisor or anonymous caller', async () => {
    const draft = await insert('ai_quote_knowledge')
    await login(supervisorId)
    await expect(db.query('SELECT public.activate_ai_quote_knowledge($1)', [draft.id])).rejects.toMatchObject({ code: '42501' })
    await db.exec('RESET ROLE; SET ROLE anon')
    await expect(db.query('SELECT public.activate_ai_quote_knowledge($1)', [draft.id])).rejects.toMatchObject({ code: '42501' })
  })

  it.each([
    ['ai_quote_runs', { kind: 'invalid' }],
    ['ai_quote_runs', { status: 'invalid' }],
    ['ai_quote_knowledge', { status: 'invalid' }],
    ['ai_quote_runs', { memo: 'a'.repeat(8001) }],
    ['ai_quote_eval_cases', { memo: 'a'.repeat(8001) }],
    ['ai_quote_knowledge', { style_guide: 'a'.repeat(40001) }],
    ['ai_quote_knowledge', { pricing_guide: 'a'.repeat(40001) }],
  ] as const)('rejects invalid values in %s (case %#)', async (table, values) => {
    await expect(insert(table, values)).rejects.toMatchObject({ code: '23514' })
  })

  it.each(['eval_memo', 'eval_draft'])('accepts the %s run kind', async kind => {
    expect((await insert('ai_quote_runs', { kind })).id).toEqual(expect.any(String))
  })

  it('keeps one eval case per set and quote', async () => {
    const row = await insert('ai_quote_eval_cases')
    const original = (await db.query<{ quote_id: string }>('SELECT quote_id FROM public.ai_quote_eval_cases WHERE id=$1', [row.id])).rows[0]
    await expect(insert('ai_quote_eval_cases', { quote_id: original.quote_id })).rejects.toMatchObject({ code: '23505' })
    expect((await insert('ai_quote_eval_cases', { quote_id: original.quote_id, set_label: 'second baseline' })).id).toEqual(expect.any(String))
  })

  it('lets admins remove eval cases but not supervisors', async () => {
    const row = await insert('ai_quote_eval_cases')
    await login(supervisorId)
    expect((await db.query('DELETE FROM public.ai_quote_eval_cases WHERE id=$1 RETURNING id', [row.id])).rows).toEqual([])
    await login(actorId)
    expect((await db.query('DELETE FROM public.ai_quote_eval_cases WHERE id=$1 RETURNING id', [row.id])).rows).toEqual([{ id: row.id }])
  })

  it('deletes eval cases with their quote while retaining runs with a null quote link', async () => {
    const row = await insert('ai_quote_eval_cases')
    const { quote_id: quoteId } = (await db.query<{ quote_id: string }>('SELECT quote_id FROM public.ai_quote_eval_cases WHERE id=$1', [row.id])).rows[0]
    const run = await insert('ai_quote_runs', { quote_id: quoteId })
    await db.exec('RESET ROLE')
    await db.query('DELETE FROM public.quotes WHERE id=$1', [quoteId])
    await login(actorId)
    expect((await db.query('SELECT id FROM public.ai_quote_eval_cases WHERE id=$1', [row.id])).rows).toEqual([])
    expect((await db.query('SELECT quote_id FROM public.ai_quote_runs WHERE id=$1', [run.id])).rows).toEqual([{ quote_id: null }])
  })

  it('uses an invoker RPC with an empty search path', async () => {
    expect((await db.query(`SELECT prosecdef,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='activate_ai_quote_knowledge'`)).rows)
      .toEqual([{ prosecdef: false, proconfig: ['search_path=""'] }])
  })
})
