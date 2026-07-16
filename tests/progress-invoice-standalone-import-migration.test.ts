import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260717082000_add_progress_invoice_standalone_jobber_import.sql',
), 'utf8')

function functionBody(name: string): string {
  return migration.match(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    'i',
  ))?.[0] ?? ''
}

describe('standalone Jobber import migration', () => {
  it('defines one atomic service command using the existing validated helpers', () => {
    const body = functionBody('create_progress_invoice_series_from_jobber')
    expect(migration).toMatch(/CREATE UNIQUE INDEX uq_progress_events_standalone_jobber_correlation/i)
    expect(migration).toMatch(/CREATE FUNCTION public\.create_progress_invoice_series_from_jobber\(payload JSONB\)/i)
    expect(body).toMatch(/progress_require_service_actor/i)
    expect(body).toMatch(/PERFORM public\.progress_validate_series_create_payload\(series_payload\)/i)
    expect(body).toMatch(/PERFORM public\.progress_validate_jobber_observation\(observation\)/i)
    expect(body).toMatch(/public\.progress_insert_jobber_snapshot/i)
    expect(body).toMatch(/public\.progress_apply_jobber_payments/i)
    expect(body).toMatch(/public\.progress_recalculate_series_read_model_as/i)
    expect(body).toMatch(/public\.progress_append_service_event/i)
  })

  it('is service-role only and does not persist raw Jobber JSON', () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.create_progress_invoice_series_from_jobber\(JSONB\) FROM PUBLIC, anon, authenticated, service_role/i)
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_progress_invoice_series_from_jobber\(JSONB\) TO service_role/i)
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.create_progress_invoice_series_from_jobber\(JSONB\) TO authenticated/i)
    expect(migration).not.toMatch(/raw_jobber|raw_observation|raw_json/i)
  })

  it('rejects duplicate live identity without mutating or deleting existing series', () => {
    const body = functionBody('create_progress_invoice_series_from_jobber')
    expect(body).toMatch(/PROGRESS_JOBBER_ERROR/i)
    expect(body).toMatch(/status\s*<>\s*'void'/i)
    expect(body).not.toMatch(/UPDATE\s+public\.progress_invoice_series[\s\S]*existing/i)
    expect(body).not.toMatch(/DELETE\s+FROM\s+public\.progress_invoice_series/i)
  })
})
