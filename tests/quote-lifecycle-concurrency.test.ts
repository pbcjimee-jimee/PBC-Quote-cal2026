import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const container = process.env.QUOTE_LIFECYCLE_TEST_CONTAINER
const localTests = container ? describe : describe.skip
const adminId = randomUUID()
const supervisorId = randomUUID()
const quoteId = randomUUID()
const optionId = randomUUID()
const login = `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${adminId}',false);`

function sql(command: string, onLocked?: () => void): Promise<{ code: number | null; output: string }> {
  if (!container || !/^supabase_db_pbc-quote-trash-[a-z0-9-]+$/.test(container)) throw new Error('A dedicated local quote-trash container is required')
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'])
    let output = ''
    let notified = false
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString()
      if (!notified && output.includes('LIFECYCLE_LOCK_HELD')) { notified = true; onLocked?.() }
    })
    child.stderr.on('data', (data: Buffer) => { output += data.toString() })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, output }))
    child.stdin.end(command)
  })
}
async function success(command: string) {
  const result = await sql(command)
  if (result.code !== 0) throw new Error(result.output)
  return result.output.trim()
}
async function race(first: string, second: string) {
  let locked!: () => void
  const lockReady = new Promise<void>((resolve) => { locked = resolve })
  const firstResult = sql(`BEGIN; ${login} ${first}; SELECT 'LIFECYCLE_LOCK_HELD'; SELECT pg_sleep(1); COMMIT;`, locked)
  await Promise.race([lockReady, firstResult.then((result) => { if (result.code !== 0) throw new Error(result.output) })])
  const secondResult = sql(`${login} ${second};`)
  const [left, right] = await Promise.all([firstResult, secondResult])
  expect(left.code).toBe(0)
  return right
}

localTests.sequential('quote lifecycle concurrent database transactions', () => {
  beforeAll(async () => {
    const source = readFileSync('supabase/tests/quote_lifecycle_test.sql', 'utf8')
    let fixture = source.slice(source.indexOf('INSERT INTO auth.users'), source.indexOf('CREATE TEMP TABLE'))
    for (const [original, value] of [
      ['90000000-0000-4000-8000-000000000001', adminId], ['90000000-0000-4000-8000-000000000002', supervisorId],
      ['90000000-0000-4000-8000-000000000101', quoteId], ['90000000-0000-4000-8000-000000000201', optionId],
      ['lifecycle-admin@example.test', `${adminId}@example.test`], ['lifecycle-supervisor@example.test', `${supervisorId}@example.test`],
      ['jobber-lifecycle-test', `concurrency-${quoteId}`], ['"lifecycle-test"', `"${quoteId}"`],
    ]) fixture = fixture.replaceAll(original, value)
    await success(fixture)
  })
  afterAll(async () => {
    // Only generated test IDs in this dedicated local container are removed.
    await success(`DELETE FROM public.quote_lifecycle_events WHERE quote_id='${quoteId}'; DELETE FROM public.quotes WHERE id='${quoteId}'; DELETE FROM auth.users WHERE id IN ('${adminId}','${supervisorId}');`)
  })

  it('serializes deletion before a waiting save and preserves the saved children', async () => {
    const result = await race(`SELECT * FROM soft_delete_quote('${quoteId}',1)`, `SELECT * FROM update_quote_with_children('{
      "id":"${quoteId}","expected_version":1,"quote":{},"items":[],"options":[],"memos":[],"jobber_lines":[]
    }')`)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('QUOTE_DELETED')
    expect(await success(`SELECT deleted_at IS NOT NULL AND version=2 FROM quotes WHERE id='${quoteId}'; SELECT count(*) FROM quote_items WHERE quote_id='${quoteId}';`)).toBe('t\n1')
  })

  it('makes two overlapping restores idempotent with one restore event', async () => {
    const result = await race(`SELECT * FROM restore_quote('${quoteId}',2)`, `SELECT * FROM restore_quote('${quoteId}',2)`)
    expect(result.code).toBe(0)
    expect(await success(`SELECT version FROM quotes WHERE id='${quoteId}'; SELECT count(*) FROM quote_lifecycle_events WHERE quote_id='${quoteId}' AND event_type='restored';`)).toBe('3\n1')
  })

  it('blocks a direct child write that was waiting while the quote entered trash', async () => {
    const result = await race(`SELECT * FROM soft_delete_quote('${quoteId}',3)`, `UPDATE quote_items SET quantity=99 WHERE quote_id='${quoteId}'`)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('QUOTE_DELETED')
    expect(await success(`SELECT quantity=1 FROM quote_items WHERE quote_id='${quoteId}';`)).toBe('t')
  })

  it('blocks an old sync result waiting for a restore to finish', async () => {
    const result = await race(`SELECT * FROM restore_quote('${quoteId}',4)`, `SELECT apply_quote_jobber_result('${quoteId}',3,'{"jobber_sync_status":"synced"}')`)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('QUOTE_VERSION_CONFLICT')
    expect(await success(`SELECT version=5 AND jobber_sync_status='not_synced' FROM quotes WHERE id='${quoteId}';`)).toBe('t')
  })

  it('protects option materials from a write waiting for deletion', async () => {
    const result = await race(`SELECT * FROM soft_delete_quote('${quoteId}',5)`, `UPDATE quote_option_items SET quantity=99 WHERE option_id='${optionId}'`)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('QUOTE_DELETED')
    expect(await success(`SELECT quantity=1 FROM quote_option_items WHERE option_id='${optionId}';`)).toBe('t')
  })

  it('prevents a duplicate Jobber import waiting for a restore', async () => {
    const result = await race(`SELECT * FROM restore_quote('${quoteId}',6)`, `SELECT create_quote_with_children(jsonb_build_object('quote', to_jsonb(q))) FROM quotes q WHERE id='${quoteId}'`)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('QUOTE_JOBBER_CONFLICT')
    expect(await success(`SELECT count(*) FROM quotes WHERE jobber_quote_id='concurrency-${quoteId}';`)).toBe('1')
  })

  it('rejects a stale restore waiting for deletion without losing the archived data', async () => {
    const result = await race(`SELECT * FROM soft_delete_quote('${quoteId}',7)`, `SELECT * FROM restore_quote('${quoteId}',7)`)
    expect(result.code).not.toBe(0)
    expect(result.output).toContain('QUOTE_VERSION_CONFLICT')
    expect(await success(`SELECT deleted_at IS NOT NULL AND version=8 FROM quotes WHERE id='${quoteId}'; SELECT count(*) FROM quote_items WHERE quote_id='${quoteId}';`)).toBe('t\n1')
  })
})
