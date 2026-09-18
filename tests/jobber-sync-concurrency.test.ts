import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const container = process.env.JOBBER_SYNC_TEST_CONTAINER
const localTests = container ? describe : describe.skip
const adminId = randomUUID()
const quoteId = randomUUID()
const expiredQuoteId = randomUUID()
const lateResultQuoteId = randomUUID()
const login = `SET ROLE authenticated; DO $auth$ BEGIN PERFORM set_config('request.jwt.claim.sub','${adminId}',false); END $auth$;`

type Claim = {
  claimed: boolean
  operation: { id: string; status: string; claim_token?: string; failure_code?: string }
}

function sql(command: string): Promise<{ code: number | null; output: string }> {
  if (!container || !/^supabase_db_pbc-jobber-sync-[a-z0-9-]+$/.test(container)) {
    throw new Error('A dedicated local Jobber sync container is required')
  }

  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'])
    let output = ''
    child.stdout.on('data', (data: Buffer) => { output += data.toString() })
    child.stderr.on('data', (data: Buffer) => { output += data.toString() })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, output }))
    child.stdin.end(command)
  })
}

async function success(command: string): Promise<string> {
  const result = await sql(command)
  if (result.code !== 0) throw new Error(result.output)
  return result.output.trim()
}

function quoteInsert(id: string, remoteId: string): string {
  return `INSERT INTO public.quotes (id,customer_name,jobber_quote_id,jobber_save_mode,working_days,
    labour_per_day,formula1_total,formula2_total,formula3_total,formula4_total,formula5_total,
    selected_min,selected_max,subtotal,final_total,pricing_settings_snapshot,created_by,
    interior_selected_min,interior_selected_max,exterior_selected_min,exterior_selected_max,
    roof_selected_min,roof_selected_max)
  VALUES ('${id}','Concurrency fixture','${remoteId}','priced_line_items',1,1,10,11,12,13,14,
    1,2,10.50,11.55,'{}','${adminId}',1,2,1,2,1,2);
  INSERT INTO public.jobber_quote_lines (quote_id,kind,name,description,quantity,unit_price,total_price,
    taxable,client_visible,jobber_line_item_id,position)
  VALUES ('${id}','line_item','Walls','',1,10,10,true,true,'line-${id}',0);`
}

localTests.sequential('Jobber sync two-session claims', () => {
  beforeAll(async () => {
    await success(`INSERT INTO auth.users (id,email) VALUES ('${adminId}','${adminId}@example.test');
      INSERT INTO public.user_profiles (id,email,role,is_active) VALUES ('${adminId}','${adminId}@example.test','admin',true);
      ${quoteInsert(quoteId, `remote-${quoteId}`)}
      ${quoteInsert(expiredQuoteId, `remote-${expiredQuoteId}`)}
      ${quoteInsert(lateResultQuoteId, `remote-${lateResultQuoteId}`)}
      UPDATE public.jobber_quote_lines SET jobber_line_item_id=NULL WHERE quote_id='${lateResultQuoteId}';`)
  })

  afterAll(async () => {
    await success(`DELETE FROM public.jobber_sync_steps WHERE operation_id IN
        (SELECT id FROM public.jobber_sync_operations WHERE quote_id IN ('${quoteId}','${expiredQuoteId}','${lateResultQuoteId}'));
      DELETE FROM public.jobber_sync_operations WHERE quote_id IN ('${quoteId}','${expiredQuoteId}','${lateResultQuoteId}');
      DELETE FROM public.quotes WHERE id IN ('${quoteId}','${expiredQuoteId}','${lateResultQuoteId}');
      ALTER TABLE public.user_profiles DISABLE TRIGGER trg_user_profiles_protect_last_active_admin;
      DELETE FROM auth.users WHERE id='${adminId}';
      ALTER TABLE public.user_profiles ENABLE TRIGGER trg_user_profiles_protect_last_active_admin;`)
  })

  it('allows exactly one claimant for the same immutable operation', async () => {
    const operation = JSON.parse(await success(`${login}
      SELECT public.request_jobber_sync('${quoteId}',1)::text;`)) as { id: string }

    const command = `${login} SELECT public.claim_jobber_sync_operation('${operation.id}')::text;`
    const [leftResult, rightResult] = await Promise.all([sql(command), sql(command)])
    expect(leftResult.code).toBe(0)
    expect(rightResult.code).toBe(0)
    const left = JSON.parse(leftResult.output.trim()) as Claim
    const right = JSON.parse(rightResult.output.trim()) as Claim

    expect([left.claimed, right.claimed].filter(Boolean)).toHaveLength(1)
    expect([left, right].find((claim) => claim.claimed)?.operation.claim_token).toMatch(/^[0-9a-f-]{36}$/)
    expect([left, right].find((claim) => !claim.claimed)?.operation).not.toHaveProperty('claim_token')
  })

  it('turns an expired lease into reconciliation-only instead of reclaiming it', async () => {
    const operation = JSON.parse(await success(`${login}
      SELECT public.request_jobber_sync('${expiredQuoteId}',1)::text;`)) as { id: string }
    const first = JSON.parse(await success(`${login}
      SELECT public.claim_jobber_sync_operation('${operation.id}')::text;`)) as Claim
    expect(first.claimed).toBe(true)

    await success(`UPDATE public.jobber_sync_operations SET lease_expires_at=clock_timestamp()-interval '1 second'
      WHERE id='${operation.id}';`)
    await success(`${login} SELECT public.finish_jobber_sync_operation(
      '${operation.id}','${first.operation.claim_token}','retryable','line_kind_mismatch');`)
    const retryAfterExpiredLease = JSON.parse(await success(`${login}
      SELECT public.claim_jobber_sync_operation('${operation.id}')::text;`)) as Claim

    expect(retryAfterExpiredLease.claimed).toBe(false)
    expect(retryAfterExpiredLease.operation.status).toBe('reconciliation_required')
    expect(retryAfterExpiredLease.operation).not.toHaveProperty('claim_token')

    const afterUnsafeRetry = JSON.parse(await success(`${login}
      SELECT public.get_jobber_sync_operation('${expiredQuoteId}')::text;`)) as Claim['operation']
    expect(afterUnsafeRetry.status).toBe('reconciliation_required')
    expect(afterUnsafeRetry.failure_code).toBe('lease_expired')
  })

  it('records a returned result after expiry but never applies it as success', async () => {
    const operation = JSON.parse(await success(`${login}
      SELECT public.request_jobber_sync('${lateResultQuoteId}',1)::text;`)) as { id: string }
    const first = JSON.parse(await success(`${login}
      SELECT public.claim_jobber_sync_operation('${operation.id}')::text;`)) as Claim
    const token = first.operation.claim_token
    expect(token).toMatch(/^[0-9a-f-]{36}$/)

    await success(`${login} SELECT public.begin_jobber_sync_step(
      '${operation.id}','${token}','create:0','create',
      '{"lineItems":[{"sourcePosition":0,"kind":"line_item","name":"Walls","description":"","quantity":1,"unitPrice":10,"totalPrice":10,"taxable":true,"sortOrder":0}]}'::jsonb);`)
    await success(`UPDATE public.jobber_sync_operations SET lease_expires_at=clock_timestamp()-interval '1 second'
      WHERE id='${operation.id}';`)
    await success(`${login} SELECT public.complete_jobber_sync_step(
      '${operation.id}','${token}','create:0',
      '{"createdLineItemIds":["late-known-id"],"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"late-known-id"}]}'::jsonb);`)

    const afterComplete = JSON.parse(await success(`${login}
      SELECT public.get_jobber_sync_operation('${lateResultQuoteId}')::text;`)) as Claim['operation']
    expect(afterComplete.status).toBe('reconciliation_required')

    await success(`${login} SELECT public.record_jobber_sync_completion(
      '${operation.id}','${token}',
      '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"late-known-id"}],"expectedLineItems":[{"sourcePosition":0,"kind":"line_item","name":"Walls","description":"","quantity":1,"unitPrice":10,"totalPrice":10,"taxable":true,"jobberLineItemId":"late-known-id","sortOrder":0}],"deletedLineItemIds":[]}'::jsonb);
      SELECT public.finish_jobber_sync_operation('${operation.id}','${token}','succeeded');`)

    const persisted = JSON.parse(await success(`${login}
      SELECT public.get_jobber_sync_operation('${lateResultQuoteId}')::text;`)) as Claim['operation'] & { result?: unknown }
    expect(persisted.status).toBe('reconciliation_required')
    expect(persisted.result).toBeTruthy()
    expect(await success(`SELECT COALESCE(jobber_line_item_id,'NULL') FROM public.jobber_quote_lines
      WHERE quote_id='${lateResultQuoteId}' AND client_visible;`)).toBe('NULL')
  })
})
