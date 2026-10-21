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

describe.skipIf(!pgliteAvailable)('audit actor integrity on ephemeral PostgreSQL', () => {
  let db: SqlDb

  beforeAll(async () => {
    db = await bootstrap({ through: '20261021235959' })
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

  function payload() {
    const value = savePayload({ key: randomUUID(), logicalKey: randomUUID() })
    return { ...value, quote: { ...value.quote, created_by: otherId, updated_by: otherId },
      memos: [{ body: 'Keep this note', position: 0, created_by: otherId }],
      price_revision: { revision_number: 1, event_type: 'created', new_subtotal: '10', new_final_total: '11', changed_by: otherId } }
  }

  async function create(fn = 'create_quote_with_jobber_sync', value: unknown = payload()) {
    return (await db.query<{ id: string }>(`SELECT public.${fn}($1::jsonb) AS id`, [JSON.stringify(value)])).rows[0].id
  }

  async function actors(id: string) {
    return (await db.query(`SELECT q.created_by,q.updated_by,
      (SELECT created_by FROM public.quote_memos WHERE quote_id=q.id LIMIT 1) AS memo_actor,
      (SELECT changed_by FROM public.quote_price_revisions WHERE quote_id=q.id ORDER BY revision_number DESC LIMIT 1) AS revision_actor
      FROM public.quotes q WHERE q.id=$1`, [id])).rows[0]
  }

  it.each(['create_quote_with_children', 'create_quote_with_jobber_sync'])('binds spoofed actors in %s to the caller', async fn => {
    const id = await create(fn)
    expect(await actors(id)).toEqual({ created_by: actorId, updated_by: actorId, memo_actor: actorId, revision_actor: actorId })
  })

  it.each(['update_quote_with_children', 'update_quote_with_jobber_sync'])('preserves the creator and binds update actors in %s', async fn => {
    const value = payload()
    const id = await create('create_quote_with_jobber_sync', value)
    await login(otherId)
    const update = { ...value, id, expected_version: 1, quote: { ...value.quote, created_by: otherId, updated_by: actorId },
      memos: [{ ...value.memos[0], created_by: actorId }],
      price_revision: { ...value.price_revision, revision_number: 2, event_type: 'updated', changed_by: actorId } }
    await db.query(`SELECT * FROM public.${fn}($1::jsonb)`, [JSON.stringify(update)])
    expect(await actors(id)).toEqual({ created_by: actorId, updated_by: otherId, memo_actor: otherId, revision_actor: otherId })
    await expect(db.query(`SELECT * FROM public.${fn}($1::jsonb)`, [JSON.stringify(update)])).rejects.toThrow('QUOTE_VERSION_CONFLICT')
    expect((await db.query('SELECT count(*)::int AS count FROM public.quote_price_revisions WHERE quote_id=$1', [id])).rows[0].count).toBe(2)
  })

  it('fills omitted and null actors at INSERT and preserves creators on direct UPDATE', async () => {
    const value = payload()
    const id = await create('create_quote_with_children', { ...value, quote: { ...value.quote, created_by: null, updated_by: null } })
    await login(otherId)
    await db.query('UPDATE public.quotes SET created_by=$2,updated_by=$2 WHERE id=$1', [id, otherId])
    await db.query('UPDATE public.quote_memos SET created_by=$2,body=$3 WHERE quote_id=$1', [id, otherId, 'Edited note'])
    expect(await actors(id)).toMatchObject({ created_by: actorId, updated_by: otherId, memo_actor: actorId })
    const note = await db.query('INSERT INTO public.quote_memos(quote_id,body) VALUES($1,$2) RETURNING created_by', [id, 'Omitted actor'])
    expect(note.rows[0].created_by).toBe(otherId)
  })

  it('forces direct quote INSERT actors even when copying another admin quote', async () => {
    const value = payload()
    const id = await create('create_quote_with_children', { ...value, quote: { ...value.quote, created_by: actorId, updated_by: actorId } })
    await login(otherId)
    const copy = await db.query<{ id: string }>(`INSERT INTO public.quotes SELECT
      (jsonb_populate_record(NULL::public.quotes,to_jsonb(q)||jsonb_build_object('id',gen_random_uuid()))).*
      FROM public.quotes q WHERE id=$1 RETURNING id`, [id])
    expect(await actors(copy.rows[0].id)).toMatchObject({ created_by: otherId, updated_by: otherId })
    expect((await db.query('SELECT version FROM public.quotes WHERE id=$1', [copy.rows[0].id])).rows[0].version).toBe(1)
  })

  it('forces Settings updated_by for both UPDATE and INSERT', async () => {
    const updated = await db.query('UPDATE public.pricing_settings SET updated_by=$1 RETURNING updated_by', [otherId])
    expect(updated.rows[0].updated_by).toBe(actorId)
    await db.exec('BEGIN; DELETE FROM public.pricing_settings;')
    try {
      const inserted = await db.query('INSERT INTO public.pricing_settings(id,updated_by) VALUES(1,$1) RETURNING updated_by', [otherId])
      expect(inserted.rows[0].updated_by).toBe(actorId)
    } finally { await db.exec('ROLLBACK') }
  })

  it('overrides spoofed changed_by on direct price revision INSERT', async () => {
    const id = await create()
    const inserted = await db.query(`INSERT INTO public.quote_price_revisions
      (quote_id,revision_number,event_type,new_subtotal,new_final_total,changed_by)
      VALUES($1,2,'updated',10,11,$2) RETURNING changed_by`, [id, otherId])
    expect(inserted.rows[0].changed_by).toBe(actorId)
  })

  it.each(['UPDATE public.quote_price_revisions SET new_subtotal=20 WHERE quote_id=$1',
    'DELETE FROM public.quote_price_revisions WHERE quote_id=$1'])('denies authenticated admin mutation: %s', async sql => {
    const id = await create()
    await expect(db.query(sql, [id])).rejects.toMatchObject({ code: '42501' })
    expect((await db.query('SELECT new_subtotal FROM public.quote_price_revisions WHERE quote_id=$1', [id])).rows)
      .toEqual([{ new_subtotal: '10.00' }])
  })

  it('keeps price history immutable through RLS if UPDATE and DELETE grants are accidentally restored', async () => {
    const id = await create()
    await db.exec('RESET ROLE; BEGIN; GRANT UPDATE,DELETE ON public.quote_price_revisions TO authenticated; SET ROLE authenticated;')
    try {
      expect((await db.query('UPDATE public.quote_price_revisions SET new_subtotal=20 WHERE quote_id=$1 RETURNING id', [id])).rows).toEqual([])
      expect((await db.query('DELETE FROM public.quote_price_revisions WHERE quote_id=$1 RETURNING id', [id])).rows).toEqual([])
    } finally { await db.exec('ROLLBACK') }
  })

  it('preserves price history and server actors across trash, stale restore and restore', async () => {
    const id = await create()
    const before = (await db.query('SELECT * FROM public.quote_price_revisions WHERE quote_id=$1', [id])).rows
    await login(otherId)
    await db.query('SELECT * FROM public.soft_delete_quote($1,1)', [id])
    expect((await db.query('SELECT created_by,updated_by,deleted_by,version FROM public.quotes WHERE id=$1', [id])).rows[0])
      .toEqual({ created_by: actorId, updated_by: otherId, deleted_by: otherId, version: 2 })
    await expect(db.query('SELECT * FROM public.restore_quote($1,1)', [id])).rejects.toThrow('QUOTE_VERSION_CONFLICT')
    await db.query('SELECT * FROM public.restore_quote($1,2)', [id])
    expect((await db.query('SELECT * FROM public.quote_price_revisions WHERE quote_id=$1', [id])).rows).toEqual(before)
    expect((await db.query('SELECT actor_id,event_type FROM public.quote_lifecycle_events WHERE quote_id=$1 ORDER BY quote_version', [id])).rows)
      .toEqual([{ actor_id: otherId, event_type: 'deleted' }, { actor_id: otherId, event_type: 'restored' }])
    expect(await actors(id)).toMatchObject({ created_by: actorId, updated_by: otherId })
  })

  it('records the caller on queued Jobber sync operations without rewriting quote creators', async () => {
    const value = payload()
    const id = await create('create_quote_with_jobber_sync', { ...value, sync_requested: true,
      quote: { ...value.quote, jobber_quote_id: `remote-${randomUUID()}` } })
    await db.exec('RESET ROLE')
    expect((await db.query('SELECT created_by,status FROM public.jobber_sync_operations WHERE quote_id=$1', [id])).rows)
      .toEqual([{ created_by: actorId, status: 'queued' }])
    expect(await actors(id)).toMatchObject({ created_by: actorId, updated_by: actorId })
  })

  it.each(['supervisor', 'inactive admin', 'anon'])('keeps %s unable to read or append price history', async role => {
    const id = await create()
    if (role === 'supervisor') await login(supervisorId)
    if (role === 'inactive admin') {
      await db.exec('RESET ROLE')
      await db.query('UPDATE public.user_profiles SET is_active=false WHERE id=$1', [otherId])
      await login(otherId)
    }
    if (role === 'anon') await db.exec('RESET ROLE; SET ROLE anon')
    try {
      if (role === 'anon') await expect(db.query('SELECT * FROM public.quote_price_revisions')).rejects.toMatchObject({ code: '42501' })
      else expect((await db.query('SELECT * FROM public.quote_price_revisions')).rows).toEqual([])
      await expect(db.query(`INSERT INTO public.quote_price_revisions(quote_id,revision_number,event_type,new_subtotal,new_final_total)
        VALUES($1,2,'updated',10,11)`, [id])).rejects.toMatchObject({ code: '42501' })
    } finally {
      await db.exec('RESET ROLE')
      await db.query('UPDATE public.user_profiles SET is_active=true WHERE id=$1', [otherId])
    }
  })

  it('preserves supplied actor values without a JWT, including service-role writes', async () => {
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub','',false)")
    const value = payload()
    const id = await create('create_quote_with_children', value)
    expect(await actors(id)).toEqual({ created_by: otherId, updated_by: otherId, memo_actor: otherId, revision_actor: otherId })
    await db.query('UPDATE public.quotes SET created_by=$2,updated_by=$2 WHERE id=$1', [id, actorId])
    await db.exec('SET ROLE service_role')
    await db.query('UPDATE public.quote_memos SET created_by=$2 WHERE quote_id=$1', [id, actorId])
    await db.query('UPDATE public.quote_price_revisions SET changed_by=$2 WHERE quote_id=$1', [id, actorId])
    await db.query('UPDATE public.pricing_settings SET updated_by=$1', [otherId])
    expect(await actors(id)).toEqual({ created_by: actorId, updated_by: actorId, memo_actor: actorId, revision_actor: actorId })
    expect((await db.query('SELECT updated_by FROM public.pricing_settings')).rows[0].updated_by).toBe(otherId)
  })

  it('uses invoker trigger functions with empty search paths on every untrusted actor table', async () => {
    const triggers = await db.query(`SELECT c.relname,p.prosecdef,p.proconfig FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_proc p ON p.oid=t.tgfoid
      JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app_auth' AND p.proname='enforce_audit_actor_integrity'
      ORDER BY c.relname`)
    expect(triggers.rows).toEqual(['pricing_settings', 'quote_memos', 'quote_price_revisions', 'quotes']
      .map(relname => ({ relname, prosecdef: false, proconfig: ['search_path=""'] })))
  })
})
