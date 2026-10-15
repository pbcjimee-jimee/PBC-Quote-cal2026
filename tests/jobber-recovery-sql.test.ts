import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { actorId, bootstrap, pgliteAvailable, savePayload } from './helpers/paint-comparison-postgres.mjs'

interface SqlDb {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec(sql: string): Promise<unknown>
  close(): Promise<void>
}
type Mapping = { lineId: string; jobberLineItemId: string }

describe.skipIf(!pgliteAvailable)('reviewed Jobber recovery on ephemeral PostgreSQL', () => {
  let db: SqlDb
  let quoteId: string
  let operationId: string
  let token: string
  let lineId: string
  let insertedId: string
  let mappings: Mapping[]
  const observation = ['remote-created', 'remote-orphan', 'unmanaged-remote']

  beforeAll(async () => { db = await bootstrap({ through: '20261016092708' }) }, 30000)
  afterAll(async () => { await db?.close() })
  beforeEach(async () => {
    await db.exec('RESET ROLE')
    const payload = savePayload({ key: randomUUID(), logicalKey: randomUUID() })
    const saved = await db.query<{ id: string }>('SELECT public.create_quote_with_jobber_sync($1::jsonb) AS id', [JSON.stringify({
      ...payload, quote: { ...payload.quote, jobber_quote_id: `remote-${randomUUID()}` },
      jobber_lines: [0, 1].map(position => ({ kind: 'text', name: 'Original', description: 'old text', position, client_visible: true })),
    })])
    quoteId = saved.rows[0].id
    lineId = (await db.query<{ id: string }>('SELECT id FROM public.jobber_quote_lines WHERE quote_id=$1 ORDER BY position', [quoteId])).rows[0].id
    token = randomUUID()
    operationId = randomUUID()
    await db.query(`INSERT INTO public.jobber_sync_operations(id,quote_id,quote_version,jobber_quote_id,
      desired_payload,status,claim_token,lease_expires_at,attempt_count,created_by)
      SELECT $1,id,1,jobber_quote_id,app_auth.build_jobber_desired_payload(id),'running',$2,
        clock_timestamp()-interval '1 minute',1,$3 FROM public.quotes WHERE id=$4`, [operationId, token, actorId, quoteId])
    for (const [sequence, remoteId] of ['remote-created', 'remote-orphan'].entries()) {
      await db.query(`INSERT INTO public.jobber_sync_steps(operation_id,step_key,sequence,kind,request_payload,status,result_payload)
        VALUES($1,$2,$3,'create',$4,'applied',$5)`, [operationId, `create:${sequence}`, sequence,
      JSON.stringify({ lineItems: [{ sourcePosition: sequence, kind: 'text', name: 'Original', description: 'old text' }] }),
      JSON.stringify({ createdLineItemIds: [remoteId], syncedLineItems: [{ sourcePosition: sequence, jobberLineItemId: remoteId }] })])
    }
    await db.query('DELETE FROM public.jobber_quote_lines WHERE quote_id=$1 AND id<>$2', [quoteId, lineId])
    await db.query(`UPDATE public.jobber_quote_lines SET name='Edited name',description='Edited description',position=1 WHERE id=$1`, [lineId])
    insertedId = (await db.query<{ id: string }>(`INSERT INTO public.jobber_quote_lines(quote_id,kind,name,description,position)
      VALUES($1,'text','New first row','Keep this inserted row',0) RETURNING id`, [quoteId])).rows[0].id
    await db.query(`UPDATE public.quotes SET version=6,jobber_sync_status='failed',
      jobber_last_synced_at='2026-01-01',jobber_pending_deleted_line_item_ids='["remote-created","previously-deleted"]' WHERE id=$1`, [quoteId])
    mappings = [{ lineId, jobberLineItemId: 'remote-created' }]
  })

  async function recover(options: { version?: number; quote?: string; mapping?: unknown; observed?: unknown } = {}) {
    await db.exec('SET ROLE authenticated')
    try {
      return (await db.query<{ value: { id: string; version: number } }>(`SELECT public.recover_jobber_sync_operation(
        $1::uuid,$2::uuid,$3::integer,$4::jsonb,$5::jsonb) AS value`,
      [operationId, options.quote ?? quoteId, options.version ?? 6, JSON.stringify(options.mapping ?? mappings),
        JSON.stringify(options.observed ?? observation)])).rows[0].value
    } finally { await db.exec('RESET ROLE') }
  }

  async function snapshot() {
    return (await db.query(`SELECT to_jsonb(q) AS quote,
      (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.position) FROM public.jobber_quote_lines l WHERE l.quote_id=q.id) AS lines,
      (SELECT jsonb_agg(to_jsonb(i)) FROM public.quote_items i WHERE i.quote_id=q.id) AS materials,
      (SELECT to_jsonb(o) FROM public.jobber_sync_operations o WHERE o.id=$2) AS operation,
      (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sequence) FROM public.jobber_sync_steps s WHERE s.operation_id=$2) AS steps
      FROM public.quotes q WHERE q.id=$1`, [quoteId, operationId])).rows[0]
  }

  it('preserves current edits, inserted rows, materials, history and last success while recording reviewed recovery', async () => {
    await db.query(`INSERT INTO public.jobber_sync_steps(operation_id,step_key,sequence,kind,request_payload,status,result_payload)
      VALUES($1,'delete:0',2,'delete',$2,'applied',$3),($1,'reorder:0',3,'reorder',$4,'applied',$5)`, [operationId,
    JSON.stringify({ lineItems: [], lineItemIds: ['already-deleted'] }), JSON.stringify({ deletedLineItemIds: ['already-deleted'] }),
    JSON.stringify({ lineItems: ['remote-created', 'remote-orphan'].map((id, position) => ({ sourcePosition: position, kind: 'text', name: 'Original', description: 'old text', jobberLineItemId: id, sortOrder: position })) }),
    JSON.stringify({ editedLineItemIds: ['remote-orphan', 'remote-created'] })])
    const before = await snapshot()
    expect(await recover()).toEqual({ id: quoteId, version: 7 })
    const after = await snapshot()
    expect(after.materials).toEqual(before.materials)
    expect(after.steps).toEqual(before.steps)
    const oldQuote = before.quote as Record<string, unknown>
    expect(after.quote).toMatchObject({ version: 7, jobber_sync_status: 'not_synced', jobber_last_synced_at: oldQuote.jobber_last_synced_at,
      jobber_pending_deleted_line_item_ids: ['previously-deleted', 'remote-orphan'] })
    expect(after.lines).toEqual([
      expect.objectContaining({ id: insertedId, position: 0, name: 'New first row', jobber_line_item_id: null }),
      expect.objectContaining({ id: lineId, position: 1, name: 'Edited name', description: 'Edited description', jobber_line_item_id: 'remote-created' }),
    ])
    expect(after.operation).toMatchObject({ status: 'superseded', failure_code: 'recovery_reviewed', result: null, claim_token: null, lease_expires_at: null,
      desired_payload: (before.operation as Record<string, unknown>).desired_payload, quote_version: 1 })
    await db.exec('SET ROLE authenticated')
    const audit = await db.query('SELECT * FROM public.jobber_sync_recoveries WHERE operation_id=$1', [operationId])
    await db.exec('RESET ROLE')
    expect(audit.rows[0]).toMatchObject({ actor_id: actorId, old_quote_version: 6, new_quote_version: 7, line_mappings: mappings, observed_remote_ids: observation })
    const queued = await db.query<{ value: Record<string, unknown> }>('SELECT public.request_jobber_sync($1,7) AS value', [quoteId])
    expect(queued.rows[0].value).toMatchObject({ status: 'queued', quote_version: 7 })
  })

  it('blocks stale worker completion and repeat recovery after retiring the claim', async () => {
    await recover()
    await expect(db.query('SELECT public.complete_jobber_sync_step($1,$2,$3,$4)', [operationId, token, 'create:0',
      JSON.stringify({ createdLineItemIds: ['remote-created'], syncedLineItems: [{ sourcePosition: 0, jobberLineItemId: 'remote-created' }] })])).rejects.toThrow('SYNC_CLAIM_INVALID')
    await expect(recover({ version: 7 })).rejects.toThrow('SYNC_RECOVERY_NOT_ELIGIBLE')
    expect((await db.query<{ value: { claimed: boolean } }>('SELECT public.claim_jobber_sync_operation($1) AS value', [operationId])).rows[0].value.claimed).toBe(false)
    await expect(db.query("UPDATE public.jobber_sync_operations SET desired_payload='{}' WHERE id=$1", [operationId])).rejects.toThrow('IMMUTABLE_SYNC_OPERATION')
    await expect(db.query("UPDATE public.jobber_sync_steps SET request_payload='{}' WHERE operation_id=$1", [operationId])).rejects.toThrow('IMMUTABLE_SYNC_STEP')
  })

  it('rejects stale versions without partial changes', async () => {
    const before = await snapshot()
    await expect(recover({ version: 5 })).rejects.toThrow('QUOTE_VERSION_CONFLICT')
    expect(await snapshot()).toEqual(before)
  })

  it.each(['current', 'operation'])('rejects %s description-total mode without partial changes', async target => {
    if (target === 'current') {
      await db.query("UPDATE public.quotes SET jobber_save_mode='description_total' WHERE id=$1", [quoteId])
    } else {
      const previousOperationId = operationId
      operationId = randomUUID()
      await db.query("UPDATE public.jobber_sync_operations SET status='superseded' WHERE id=$1", [previousOperationId])
      await db.query(`INSERT INTO public.jobber_sync_operations(id,quote_id,quote_version,jobber_quote_id,desired_payload,status,attempt_count,created_by)
        SELECT $1,quote_id,2,jobber_quote_id,jsonb_set(desired_payload,'{saveMode}','"description_total"'),
          'reconciliation_required',1,created_by FROM public.jobber_sync_operations WHERE id=$2`, [operationId, previousOperationId])
      await db.query(`INSERT INTO public.jobber_sync_steps(operation_id,step_key,sequence,kind,request_payload,status,result_payload)
        SELECT $1,step_key,sequence,kind,request_payload,status,result_payload FROM public.jobber_sync_steps WHERE operation_id=$2`, [operationId, previousOperationId])
    }
    const before = await snapshot()
    await expect(recover()).rejects.toThrow('SYNC_RECOVERY_UNSUPPORTED_MODE')
    expect(await snapshot()).toEqual(before)
  })

  it.each([
    ['sending', "UPDATE public.jobber_sync_steps SET status='sending',result_payload=NULL WHERE operation_id=$1", 'SYNC_STEPS_INCOMPLETE'],
    ['no journal', 'DELETE FROM public.jobber_sync_steps WHERE operation_id=$1', 'SYNC_STEPS_INCOMPLETE'],
    ['future lease', "UPDATE public.jobber_sync_operations SET lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE id=$1", 'SYNC_RECOVERY_LEASE_ACTIVE'],
    ['legacy', "UPDATE public.jobber_sync_operations SET failure_code='legacy_unjournaled' WHERE id=$1", 'SYNC_RECOVERY_NOT_ELIGIBLE'],
    ['missing create result', "UPDATE public.jobber_sync_steps SET result_payload='{}' WHERE operation_id=$1", 'SYNC_RECOVERY_INVALID_JOURNAL'],
    ['mismatched result', `UPDATE public.jobber_sync_steps SET result_payload='{"createdLineItemIds":["different"],"syncedLineItems":[]}' WHERE operation_id=$1`, 'SYNC_RECOVERY_INVALID_JOURNAL'],
  ])('refuses %s', async (_label, sql, error) => {
    await db.query(sql, [operationId])
    const before = await snapshot()
    await expect(recover()).rejects.toThrow(error)
    expect(await snapshot()).toEqual(before)
  })

  it.each([
    ['duplicate line', 'duplicateLine', 'SYNC_RECOVERY_DUPLICATE_MAPPING'],
    ['duplicate remote', 'duplicateRemote', 'SYNC_RECOVERY_DUPLICATE_MAPPING'],
    ['unknown remote', 'unknown', 'SYNC_RECOVERY_UNKNOWN_REMOTE_ID'],
    ['missing observed mapped ID', 'missing', 'SYNC_RECOVERY_UNKNOWN_REMOTE_ID'],
    ['duplicate observation', 'duplicateObservation', 'INVALID_SYNC_RECOVERY_OBSERVATION'],
    ['empty observation', 'emptyObservation', 'INVALID_SYNC_RECOVERY_OBSERVATION'],
    ['foreign line', 'foreign', 'SYNC_RECOVERY_LINE_MISMATCH'],
    ['hidden line', 'hidden', 'SYNC_RECOVERY_LINE_MISMATCH'],
  ])('rejects %s', async (_label, variant, error) => {
    const mapping = [...mappings]
    let observed = observation
    if (variant === 'duplicateLine') mapping.push({ lineId, jobberLineItemId: 'remote-orphan' })
    if (variant === 'duplicateRemote') mapping.push({ lineId: insertedId, jobberLineItemId: 'remote-created' })
    if (variant === 'unknown') mapping[0] = { lineId, jobberLineItemId: 'not-observed' }
    if (variant === 'missing') observed = ['remote-orphan']
    if (variant === 'duplicateObservation') observed = [...observation, 'remote-created']
    if (variant === 'emptyObservation') observed = []
    if (variant === 'foreign') mapping[0] = { lineId: randomUUID(), jobberLineItemId: 'remote-created' }
    if (variant === 'hidden') await db.query('UPDATE public.jobber_quote_lines SET client_visible=false WHERE id=$1', [lineId])
    const before = await snapshot()
    await expect(recover({ mapping, observed })).rejects.toThrow(error)
    expect(await snapshot()).toEqual(before)
  })

  it('requires explicit reviewed remapping of existing IDs and preserves eligible absent IDs as tombstones', async () => {
    await db.query("UPDATE public.jobber_quote_lines SET jobber_line_item_id='remote-orphan' WHERE id=$1", [lineId])
    await expect(recover({ mapping: [] })).rejects.toThrow('SYNC_RECOVERY_EXISTING_MAPPING_REQUIRED')
    await recover({ observed: ['remote-created'] })
    expect((await db.query('SELECT jobber_pending_deleted_line_item_ids FROM public.quotes WHERE id=$1', [quoteId])).rows[0])
      .toEqual({ jobber_pending_deleted_line_item_ids: ['previously-deleted', 'remote-orphan'] })
  })

  it('adopts a manually selected live-only ID without deleting other unowned live IDs', async () => {
    await recover({ mapping: [...mappings, { lineId: insertedId, jobberLineItemId: 'unmanaged-remote' }] })
    expect((await db.query('SELECT jobber_line_item_id FROM public.jobber_quote_lines WHERE id=$1', [insertedId])).rows[0].jobber_line_item_id).toBe('unmanaged-remote')
    expect((await db.query('SELECT jobber_pending_deleted_line_item_ids FROM public.quotes WHERE id=$1', [quoteId])).rows[0].jobber_pending_deleted_line_item_ids)
      .toEqual(['previously-deleted', 'remote-orphan'])
  })

  it('retains hidden linked rows and queues their IDs for deletion without requiring a mapping', async () => {
    await db.query(`INSERT INTO public.jobber_quote_lines(quote_id,kind,name,position,client_visible,jobber_line_item_id)
      VALUES($1,'text','Hidden local row',2,false,'hidden-owned-id')`, [quoteId])
    await recover()
    expect((await db.query('SELECT jobber_pending_deleted_line_item_ids FROM public.quotes WHERE id=$1', [quoteId])).rows[0].jobber_pending_deleted_line_item_ids)
      .toEqual(['previously-deleted', 'remote-orphan', 'hidden-owned-id'])
    expect((await db.query('SELECT client_visible,jobber_line_item_id FROM public.jobber_quote_lines WHERE quote_id=$1 AND position=2', [quoteId])).rows[0])
      .toEqual({ client_visible: false, jobber_line_item_id: 'hidden-owned-id' })
  })

  it('uses immutable desired IDs and synthetic total IDs as owned recovery evidence', async () => {
    const previousOperationId = operationId
    operationId = randomUUID()
    await db.query("UPDATE public.jobber_sync_operations SET status='superseded' WHERE id=$1", [previousOperationId])
    await db.query(`INSERT INTO public.jobber_sync_operations(id,quote_id,quote_version,jobber_quote_id,desired_payload,status,attempt_count,created_by)
      SELECT $1,quote_id,2,jobber_quote_id,jsonb_set(desired_payload,'{lines,0,jobberLineItemId}','"remote-known"')
        || '{"totalLineItemId":"known-total"}'::jsonb,'reconciliation_required',1,created_by
      FROM public.jobber_sync_operations WHERE id=$2`, [operationId, previousOperationId])
    await db.query(`INSERT INTO public.jobber_sync_steps(operation_id,step_key,sequence,kind,request_payload,status,result_payload)
      VALUES($1,'edit:0',0,'edit',$2,'applied',$3)`, [operationId,
    JSON.stringify({ lineItems: [{ sourcePosition: 0, kind: 'text', name: 'Original', description: 'old text', jobberLineItemId: 'remote-known' }] }),
    JSON.stringify({ editedLineItemIds: ['remote-known'], syncedLineItems: [{ sourcePosition: 0, jobberLineItemId: 'remote-known' }] })])
    await recover({ mapping: [{ lineId, jobberLineItemId: 'remote-known' }], observed: ['remote-known'] })
    expect((await db.query('SELECT jobber_pending_deleted_line_item_ids FROM public.quotes WHERE id=$1', [quoteId])).rows[0].jobber_pending_deleted_line_item_ids)
      .toEqual(['remote-created', 'previously-deleted', 'known-total'])
  })

  it('rolls back mappings, operation and quote if audit recording fails', async () => {
    const before = await snapshot()
    await db.exec(`CREATE FUNCTION public.test_recovery_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'TEST_AUDIT_FAILURE'; END $$;
      CREATE TRIGGER test_recovery_audit_failure BEFORE INSERT ON public.jobber_sync_recoveries
        FOR EACH ROW EXECUTE FUNCTION public.test_recovery_audit_failure();`)
    try {
      await expect(recover()).rejects.toThrow('TEST_AUDIT_FAILURE')
      expect(await snapshot()).toEqual(before)
    } finally {
      await db.exec('DROP TRIGGER test_recovery_audit_failure ON public.jobber_sync_recoveries; DROP FUNCTION public.test_recovery_audit_failure();')
    }
  })

  it('keeps other unresolved operations as barriers', async () => {
    await db.query(`INSERT INTO public.jobber_sync_operations(quote_id,quote_version,jobber_quote_id,desired_payload,status,created_by)
      SELECT id,6,jobber_quote_id,'{}','queued',$2 FROM public.quotes WHERE id=$1`, [quoteId, actorId])
    await expect(recover()).rejects.toThrow('SYNC_RECOVERY_OTHER_OPERATION')
    expect((await db.query('SELECT status FROM public.jobber_sync_operations WHERE quote_id=$1 AND quote_version=6', [quoteId])).rows[0].status).toBe('queued')
  })

  it('refuses a different target quote and trashed quotes', async () => {
    const other = await db.query<{ id: string }>('SELECT public.create_quote_with_jobber_sync($1::jsonb) AS id', [JSON.stringify(savePayload({ key: randomUUID(), logicalKey: randomUUID() }))])
    await expect(recover({ quote: other.rows[0].id })).rejects.toThrow('SYNC_RECOVERY_QUOTE_MISMATCH')
    await db.query('SELECT public.soft_delete_quote($1,6)', [quoteId])
    await expect(recover({ version: 7 })).rejects.toThrow('QUOTE_DELETED')
  })

  it('enforces active admin and denies direct audit writes', async () => {
    await recover()
    await db.exec('SET ROLE authenticated')
    await expect(db.query('DELETE FROM public.jobber_sync_recoveries WHERE operation_id=$1', [operationId])).rejects.toThrow('permission denied')
    await expect(db.query('UPDATE public.jobber_sync_recoveries SET old_quote_version=1 WHERE operation_id=$1', [operationId])).rejects.toThrow('permission denied')
    await db.exec('RESET ROLE')
    const supervisor = randomUUID()
    await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [supervisor, 'supervisor@example.test'])
    await db.query("INSERT INTO public.user_profiles(id,email,role,is_active) VALUES($1,'supervisor@example.test','supervisor',true)", [supervisor])
    await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT '${supervisor}'::UUID $$`)
    try {
      await db.exec('SET ROLE authenticated')
      expect((await db.query('SELECT * FROM public.jobber_sync_recoveries')).rows).toHaveLength(0)
      await expect(db.query('SELECT public.recover_jobber_sync_operation($1,$2,7,$3,$4)', [operationId, quoteId, JSON.stringify(mappings), JSON.stringify(observation)])).rejects.toThrow('ADMIN_REQUIRED')
      await db.exec('RESET ROLE')
      await db.query("UPDATE public.user_profiles SET role='admin',is_active=false WHERE id=$1", [supervisor])
      await db.exec('SET ROLE authenticated')
      await expect(db.query('SELECT public.recover_jobber_sync_operation($1,$2,7,$3,$4)', [operationId, quoteId, JSON.stringify(mappings), JSON.stringify(observation)])).rejects.toThrow('ADMIN_REQUIRED')
    } finally {
      await db.exec('RESET ROLE')
      await db.exec(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT '${actorId}'::UUID $$`)
    }
    await db.exec('SET ROLE anon')
    try { await expect(db.query('SELECT public.recover_jobber_sync_operation($1,$2,7,$3,$4)', [operationId, quoteId, '[]', '[]'])).rejects.toThrow('permission denied') }
    finally { await db.exec('RESET ROLE') }
  })
})
