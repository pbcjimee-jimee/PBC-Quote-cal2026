import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationName = readdirSync('supabase/migrations')
  .find((name) => name.endsWith('_add_jobber_durable_sync.sql'))

function migrationSql(): string {
  expect(migrationName, 'the durable sync migration must be created by the Supabase CLI').toBeDefined()
  return readFileSync(`supabase/migrations/${migrationName}`, 'utf8')
}

describe('Jobber durable sync migration contract', () => {
  it('stores immutable operation snapshots, step journals, and pending tombstones', () => {
    const sql = migrationSql()

    expect(sql).toMatch(/ADD COLUMN jobber_pending_deleted_line_item_ids JSONB NOT NULL DEFAULT '\[\]'::JSONB/i)
    expect(sql).toMatch(/CREATE TABLE public\.jobber_sync_operations/i)
    expect(sql).toMatch(/UNIQUE \(quote_id, quote_version\)/i)
    expect(sql).toMatch(/CREATE TABLE public\.jobber_sync_steps/i)
    expect(sql).toMatch(/UNIQUE \(operation_id, step_key\)/i)
  })

  it('exposes the exact active-admin RPC boundary', () => {
    const sql = migrationSql()
    const rpcNames = [
      'create_quote_with_jobber_sync',
      'update_quote_with_jobber_sync',
      'request_jobber_sync',
      'get_jobber_sync_operation',
      'claim_jobber_sync_operation',
      'begin_jobber_sync_step',
      'complete_jobber_sync_step',
      'record_jobber_sync_completion',
      'finish_jobber_sync_operation',
      'resolve_jobber_sync_operation',
    ]

    for (const rpcName of rpcNames) {
      expect(sql, `missing ${rpcName}`).toMatch(new RegExp(`FUNCTION public\\.${rpcName}\\(`, 'i'))
    }
    expect(sql.match(/SECURITY INVOKER SET search_path = ''/gi)?.length).toBeGreaterThanOrEqual(rpcNames.length)
  })

  it('keeps journal DML behind fixed-search-path helpers and explicit grants', () => {
    const sql = migrationSql()

    expect(sql).toMatch(/ALTER TABLE public\.jobber_sync_operations ENABLE ROW LEVEL SECURITY/i)
    expect(sql).toMatch(/ALTER TABLE public\.jobber_sync_steps ENABLE ROW LEVEL SECURITY/i)
    expect(sql).toMatch(/REVOKE ALL ON (TABLE )?public\.jobber_sync_operations FROM PUBLIC, anon, authenticated, service_role/i)
    expect(sql).toMatch(/REVOKE ALL ON (TABLE )?public\.jobber_sync_steps FROM PUBLIC, anon, authenticated, service_role/i)
    expect(sql).not.toMatch(/GRANT SELECT ON (TABLE )?public\.jobber_sync_operations TO authenticated/i)
    expect(sql).toMatch(/GRANT SELECT \([^)]*status[^)]*\) ON public\.jobber_sync_operations TO authenticated/i)
    expect(sql).not.toMatch(/GRANT SELECT \([^)]*claim_token[^)]*\) ON public\.jobber_sync_operations TO authenticated/i)
    expect(sql).toMatch(/SECURITY DEFINER SET search_path = ''/i)
    expect(sql).toMatch(/make_interval\(mins => 5\)/i)
  })

  it('fails closed on expired leases, unbound completion, hidden rows, and remote relinks', () => {
    const sql = migrationSql()

    expect(sql).toMatch(/FUNCTION app_auth\.mark_expired_jobber_sync_claim\(/i)
    expect(sql.match(/mark_expired_jobber_sync_claim\(/gi)?.length).toBeGreaterThanOrEqual(4)
    expect(sql).toMatch(/FUNCTION app_auth\.jobber_completion_matches_operation\(/i)
    expect(sql).toMatch(/jobber_completion_matches_operation\(target_operation_id,target_result_payload\) IS NOT TRUE/i)
    expect(sql.match(/IS NOT TRUE/gi)?.length).toBeGreaterThanOrEqual(4)
    expect(sql).toMatch(/EXISTS \(SELECT 1 FROM public\.jobber_quote_lines WHERE quote_id=saved\.id AND client_visible\)/i)
    expect(sql).toMatch(/line\.quote_id=operation_row\.quote_id AND line\.client_visible/i)
    expect(sql).toMatch(/same_remote_identity := app_auth\.jobber_remote_ids_match/i)
    expect(sql).toMatch(/provided_failure_code TEXT DEFAULT NULL/i)
    expect(sql).toMatch(/provided_failure_code <> 'line_kind_mismatch'/i)
  })

  it('ships database and two-session regression tests with the contract', () => {
    expect(existsSync('supabase/tests/jobber_sync_test.sql')).toBe(true)
    expect(existsSync('tests/jobber-sync-concurrency.test.ts')).toBe(true)
  })
})
