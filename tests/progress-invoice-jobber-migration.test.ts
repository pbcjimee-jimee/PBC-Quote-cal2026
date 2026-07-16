import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260714231200_add_progress_invoice_jobber_rpcs.sql',
), 'utf8')

function functionBody(name: string): string {
  const match = migration.match(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    'i',
  ))
  return match?.[0] ?? ''
}

describe('Task 7 Jobber persistence migration hardening', () => {
  it('adds complete bounded observation evidence without mutating prior migrations', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS invoice_payments_total\s+NUMERIC\s*\(14\s*,\s*2\)/i)
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS client_email_candidates\s+JSONB/i)
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS client_phone_candidates\s+JSONB/i)
    expect(migration).toMatch(/jsonb_array_length\s*\(client_email_candidates\)\s*<=\s*20/i)
    expect(migration).toMatch(/jsonb_array_length\s*\(client_phone_candidates\)\s*<=\s*20/i)
    expect(migration).toMatch(/last_jobber_sync_error_code[\s\S]*JOBBER_RATE_LIMITED/i)
  })

  it('keeps authoritative persistence RPCs service-role only', () => {
    for (const name of [
      'link_progress_jobber_invoice',
      'apply_progress_invoice_jobber_refresh',
      'record_progress_jobber_refresh_failure',
    ]) {
      expect(functionBody(name)).toMatch(/SECURITY DEFINER/i)
      expect(functionBody(name)).toMatch(/SET\s+search_path\s*=\s*''/i)
      expect(migration).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\(JSONB\\) FROM PUBLIC, anon, authenticated, service_role`,
        'i',
      ))
      expect(migration).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\(JSONB\\) TO service_role`,
        'i',
      ))
      expect(migration).not.toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\(JSONB\\) TO authenticated`,
        'i',
      ))
    }
  })

  it('exposes only context and number acceptance to authenticated callers', () => {
    for (const name of [
      'get_progress_invoice_jobber_context',
      'accept_progress_jobber_invoice_number',
    ]) {
      expect(functionBody(name)).toMatch(/auth\.uid\(\)/i)
      expect(migration).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\(JSONB\\) TO authenticated`,
        'i',
      ))
    }
    const accept = functionBody('accept_progress_jobber_invoice_number')
    expect(accept).toMatch(/observation_id/i)
    expect(accept).toMatch(/number_source/i)
    expect(accept).not.toMatch(/accepted_invoice_number\s*:=\s*payload/i)
  })

  it('uses strict payload keys, replay-first locking, and series-before-payment locks', () => {
    const link = functionBody('link_progress_jobber_invoice')
    const refresh = functionBody('apply_progress_invoice_jobber_refresh')

    expect(link).toMatch(/progress_assert_jsonb_keys/i)
    expect(refresh).toMatch(/progress_assert_jsonb_keys/i)
    expect(link.indexOf('progress_lock_idempotency')).toBeGreaterThan(-1)
    expect(link.indexOf('progress_lock_idempotency')).toBeLessThan(link.indexOf('FOR UPDATE'))
    expect(refresh.indexOf('progress_lock_idempotency')).toBeGreaterThan(-1)
    expect(refresh.indexOf('progress_lock_idempotency')).toBeLessThan(refresh.indexOf('FOR UPDATE'))
    expect(refresh).toMatch(/FROM\s+public\.progress_invoice_series[\s\S]*FOR UPDATE[\s\S]*FROM\s+public\.progress_payments[\s\S]*FOR UPDATE/i)
  })

  it('converts offset timestamps through Sydney and rejects timezone-less date-times', () => {
    const helper = functionBody('progress_jobber_sydney_date')
    expect(helper).toMatch(/Australia\/Sydney/i)
    expect(helper).toMatch(/timestamptz/i)
    expect(helper).toMatch(/PROGRESS_JOBBER_ERROR/i)
    expect(helper).toMatch(/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/i)
    expect(helper).toMatch(/[zZ]|[+-]/i)
  })

  it('computes receipts and FIFO read state in unrestricted numeric before bounded updates', () => {
    const recalculate = functionBody('progress_recalculate_series_read_model_as')
    expect(recalculate).toMatch(/SUM\s*\([\s\S]*effective_receipt_amount/i)
    expect(recalculate).toMatch(/GREATEST\s*\([\s\S]*receipts[\s\S]*0/i)
    expect(recalculate).toMatch(/ORDER BY[\s\S]*issue_date[\s\S]*sequence_number/i)
    expect(recalculate).toMatch(/999999999999\.99/i)
    expect(recalculate).toMatch(/credit_balance[\s\S]*paid[\s\S]*overdue[\s\S]*part_paid[\s\S]*unpaid/i)
  })

  it('records failure with safe metadata only and contains no production failure backdoor', () => {
    const failure = functionBody('record_progress_jobber_refresh_failure')
    expect(failure).toMatch(/last_jobber_sync_attempt_at/i)
    expect(failure).toMatch(/last_jobber_sync_error_code/i)
    expect(failure).not.toMatch(/snapshot|payment|amount|recipient|raw|message/i)
    expect(migration).not.toMatch(/failAfter|fail_after|test_backdoor/i)
  })
})
