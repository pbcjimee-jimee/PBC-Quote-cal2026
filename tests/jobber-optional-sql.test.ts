import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const runtimePath = process.env.PBC_PGLITE_MODULE_PATH ?? 'C:/Users/kjm12/AppData/Roaming/npm/node_modules/firebase-tools/node_modules/@electric-sql/pglite/dist/index.js'
interface SqlDb {
  exec(sql: string): Promise<unknown>
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  close(): Promise<void>
}
function functionSql(sql: string, name: string): string {
  const match = sql.match(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION app_auth\\.${name}\\([\\s\\S]*?\\r?\\n\\$\\$;`))
  if (!match) throw new Error(`Missing SQL function ${name}`)
  return match[0]
}
describe.skipIf(!existsSync(runtimePath))('Jobber Optional SQL completion semantics', () => {
  let db: SqlDb
  beforeAll(async () => {
    const runtime = await import(/* @vite-ignore */ pathToFileURL(runtimePath).href) as { PGlite: new () => SqlDb }
    db = new runtime.PGlite()
    await db.exec('CREATE SCHEMA app_auth;')
    const original = readFileSync('supabase/migrations/20260917025111_add_jobber_durable_sync.sql', 'utf8')
    const migration = readFileSync('supabase/migrations/20261014000001_extend_jobber_optional_sync_contract.sql', 'utf8')
    for (const name of ['jsonb_has_only_keys', 'trim_jobber_text']) await db.exec(functionSql(original, name))
    for (const name of ['normalized_jobber_item_is_valid', 'expected_jobber_completion_items']) await db.exec(functionSql(migration, name))
  }, 30000)
  afterAll(async () => { if (db) await db.close() })

  async function expected(line: Record<string, unknown>, saveMode = 'priced_line_items') {
    const result = await db.query<{ value: Array<Record<string, unknown>> }>('SELECT app_auth.expected_jobber_completion_items($1::jsonb) AS value',
      [JSON.stringify({ saveMode, lines: [{ kind: 'line_item', name: 'Aqua', quantity: 1, unitPrice: -150, position: 0, ...line }], finalTotal: '110', finalTotalIncludesGst: true })])
    return result.rows[0].value
  }
  it('normalizes signed new Optional creates with explicit false recommendation', async () => {
    const items = await expected({ optionalWritePolicy: 'set_true', recommendedWritePolicy: 'set_false' })
    expect(items[0]).toMatchObject({ optional: true, recommended: false, unitPrice: -150, totalPrice: -150 })
  })
  it('preserves omitted legacy flags and observations while explicitly defaulting new policy-aware creates', async () => {
    expect((await expected({ optional: true, recommended: true, selected: true }))[0]).not.toHaveProperty('optional')
    expect((await expected({ optionalWritePolicy: 'preserve', recommendedWritePolicy: 'preserve' }))[0])
      .toMatchObject({ optional: false, recommended: false })
  })
  it('keeps existing preserve fields absent and compares only the enforced Optional flag', async () => {
    const item = (await expected({ jobberLineItemId: 'known', optionalWritePolicy: 'set_true', recommendedWritePolicy: 'preserve', selected: true }))[0]
    expect(item).toHaveProperty('optional', true)
    expect(item).not.toHaveProperty('recommended')
    expect(item).not.toHaveProperty('selected')
  })
  it('keeps legacy description-total items and the synthetic Total free of flag expectations', async () => {
    const items = await expected({ optionalWritePolicy: 'set_true', recommendedWritePolicy: 'set_false' }, 'description_total')
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ kind: 'text', name: 'Aqua' })
    expect(items[1]).toMatchObject({ kind: 'line_item', name: 'Total', unitPrice: 100 })
    for (const item of items) { expect(item).not.toHaveProperty('optional'); expect(item).not.toHaveProperty('recommended') }
  })
  it.each([
    [{ optional: true, recommended: false }, true],
    [{ optional: null }, false],
    [{ recommended: 'false' }, false],
    [{ selected: true }, false],
    [{ paintComparisonKey: 'private' }, false],
  ])('validates normalized public flags without allowing selected or private metadata', async (fields, valid) => {
    const result = await db.query<{ valid: boolean }>('SELECT app_auth.normalized_jobber_item_is_valid($1::jsonb) AS valid',
      [JSON.stringify({ kind: 'line_item', name: 'Aqua', description: '', ...fields })])
    expect(result.rows[0].valid).toBe(valid)
  })
})
