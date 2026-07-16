import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260714231100_add_progress_invoice_series_rpcs.sql',
), 'utf8')

function functionBody(name: string): string {
  const match = migration.match(new RegExp(
    `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    'i',
  ))
  return match?.[0] ?? ''
}

describe('Task 5 series lifecycle migration hardening', () => {
  it('defines authenticated purpose-specific series read RPCs with decimal-text serialization', () => {
    const list = functionBody('list_progress_invoice_series')
    const detail = functionBody('get_progress_invoice_series')

    expect(list).toMatch(/auth\.uid\(\)/i)
    expect(list).toMatch(/SET\s+search_path\s*=\s*''/i)
    expect(list).toMatch(/position\s*\(/i)
    expect(list).toMatch(/ORDER\s+BY[\s\S]*updated_at\s+DESC[\s\S]*id\s+DESC/i)
    expect(list).toMatch(/OFFSET[\s\S]*LIMIT/i)
    expect(list).toMatch(/to_char\s*\([\s\S]*current_adjusted_contract_ex_gst/i)
    expect(detail).toMatch(/progress_series_safe_dto/i)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.list_progress_invoice_series\(JSONB\) FROM PUBLIC, anon, authenticated, service_role/i)
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_progress_invoice_series\(JSONB\) TO authenticated/i)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_progress_invoice_series\(JSONB\) FROM PUBLIC, anon, authenticated, service_role/i)
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_progress_invoice_series\(JSONB\) TO authenticated/i)
  })

  it('records allowlisted before/after audit changes for series and draft adjustments', () => {
    const seriesUpdate = functionBody('update_progress_invoice_series')
    const adjustmentUpdate = functionBody('update_progress_adjustment_draft')

    expect(seriesUpdate).toMatch(/progress_series_safe_changes\s*\(/i)
    expect(seriesUpdate).not.toMatch(/'series_updated'[\s\S]*'\{\}'::JSONB/i)
    expect(adjustmentUpdate).toMatch(/progress_adjustment_safe_changes\s*\(/i)
    expect(adjustmentUpdate).not.toMatch(/'adjustment_draft_updated'[\s\S]*jsonb_build_object\('adjustment_id'[^)]*\)\s*,/i)
  })

  it('enforces direct optional lengths and canonical ISO adjustment dates', () => {
    const seriesUpdate = functionBody('update_progress_invoice_series')
    const adjustmentValidation = functionBody('progress_validate_adjustment_payload')

    expect(seriesUpdate).toMatch(/recipient_company[\s\S]*>\s*160/i)
    expect(seriesUpdate).toMatch(/recipient_email[\s\S]*>\s*254/i)
    expect(seriesUpdate).toMatch(/recipient_phone[\s\S]*>\s*40/i)
    expect(seriesUpdate).toMatch(/reference[\s\S]*>\s*120/i)
    expect(adjustmentValidation).toMatch(/progress_require_iso_date\s*\(/i)
  })
})
