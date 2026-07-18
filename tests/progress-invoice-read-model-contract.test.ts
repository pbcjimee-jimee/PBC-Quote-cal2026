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
    const resolverStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.progress_resolve_current_manifest')
    const resolver = migration.slice(resolverStart, recalculateStart)
    const listStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.list_progress_invoice_series')
    const listEnd = migration.indexOf('REVOKE ALL ON FUNCTION public.progress_resolve_current_manifest', listStart)
    const list = migration.slice(listStart, listEnd)

    expect(resolver).toContain('current_revision_set_id')
    expect(resolver).toContain('revision_manifest')
    expect(resolver).toContain('PROGRESS_RESPONSE_INVALID')
    expect(recalculate).toContain('progress_resolve_current_manifest')
    expect(recalculate).not.toContain('claim.current_revision_id')
    expect(list).toContain('progress_resolve_current_manifest')
    expect(list).not.toContain('jsonb_array_elements(COALESCE(revision_set.revision_manifest')
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.progress_resolve_current_manifest(UUID)')
    expect(migration).toContain("'summary'")
    expect(migration).toContain("'current_credit_balance'")
    expect(migration).toContain("'current_manifest_claim_count'")
    expect(migration).toContain("'invoice_number'")
    expect(migration).toContain("'reference'")
    expect(migration).toContain("enriched.status <> 'void'")
  })
})
