import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('progress invoice dashboard read-model migration contract', () => {
  it('uses only the current revision-set manifest and returns complete dashboard summaries', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260718025534_extend_progress_invoice_dashboard_summary.sql'),
      'utf8',
    )
    const recalculateStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.progress_recalculate_series_read_model_as')
    const recalculateEnd = migration.indexOf('CREATE OR REPLACE FUNCTION public.progress_recalculate_series_read_model(', recalculateStart)
    const recalculate = migration.slice(recalculateStart, recalculateEnd)

    expect(recalculate).toContain('current_revision_set_id')
    expect(recalculate).toContain('revision_manifest')
    expect(recalculate).not.toContain('claim.current_revision_id')
    expect(migration).toContain("'summary'")
    expect(migration).toContain("'current_credit_balance'")
    expect(migration).toContain("'current_manifest_claim_count'")
    expect(migration).toContain("'invoice_number'")
    expect(migration).toContain("'reference'")
    expect(migration).toContain("enriched.status <> 'void'")
  })
})
