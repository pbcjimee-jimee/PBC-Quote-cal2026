import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260714231100_add_progress_invoice_series_rpcs.sql',
), 'utf8')
const manualMigrationPath = join(
  process.cwd(),
  'supabase/migrations/20260717102000_add_manual_progress_invoice_series.sql',
)
const manualMigration = existsSync(manualMigrationPath)
  ? readFileSync(manualMigrationPath, 'utf8')
  : ''

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

  it('validates list query and integer bounds before PostgreSQL integer casts', () => {
    const list = functionBody('list_progress_invoice_series')

    expect(list).toMatch(/length\s*\(requested_query\)\s*>\s*160/i)
    expect(list).toMatch(/trunc\s*\(requested_page_number\)/i)
    expect(list).toMatch(/requested_page_number\s*>\s*2147483647/i)
    expect(list.indexOf('requested_page := requested_page_number::INT')).toBeGreaterThan(
      list.indexOf('requested_page_number > 2147483647'),
    )
  })

  it('defines a minimal authenticated Quote-prefill RPC with decimal-text serialization', () => {
    const prefill = functionBody('get_progress_invoice_quote_prefill')

    expect(prefill).toMatch(/auth\.uid\(\)/i)
    expect(prefill).toMatch(/SET\s+search_path\s*=\s*''/i)
    expect(prefill).toMatch(/public\.quotes/i)
    expect(prefill).toMatch(/to_char\s*\([^)]*quote\.subtotal/i)
    expect(prefill).toMatch(/to_char\s*\([^)]*quote\.final_total/i)
    expect(prefill).not.toMatch(/pricing_settings_snapshot|jobber_quote_id|created_by|updated_by/i)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_progress_invoice_quote_prefill\(JSONB\) FROM PUBLIC, anon, authenticated, service_role/i)
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_progress_invoice_quote_prefill\(JSONB\) TO authenticated/i)
  })

  it('keeps remaining adjustment validation and mutation control flow reviewable', () => {
    const validation = functionBody('progress_validate_adjustment_payload')
    const create = functionBody('create_progress_adjustment')

    expect(validation).not.toMatch(/THEN[ \t]+RAISE EXCEPTION[^;]+;[ \t]+END IF;/i)
    expect(create).not.toMatch(/LANGUAGE[ \t]+plpgsql[ \t]+SECURITY DEFINER/i)
    expect(create).not.toMatch(/THEN[ \t]+RAISE EXCEPTION[^;]+;[ \t]+END IF;/i)
  })
})

describe('Manual Progress Invoice series forward migration', () => {
  it('adds Manual provenance and normalized active numbering uniqueness', () => {
    expect(manualMigration).toMatch(
      /ADD CONSTRAINT progress_invoice_series_source_type_check\s+CHECK \(source_type IN \('pbc_quote', 'jobber_job', 'jobber_invoice', 'manual'\)\)/i,
    )
    expect(manualMigration).toMatch(
      /CREATE UNIQUE INDEX uq_progress_invoice_series_numbering_base\s+ON public\.progress_invoice_series \(lower\(btrim\(accepted_numbering_base\)\)\)\s+WHERE accepted_numbering_base IS NOT NULL AND status <> 'void'/i,
    )
    expect(manualMigration).toMatch(/duplicate[\s\S]*accepted_numbering_base[\s\S]*RAISE EXCEPTION/i)
  })

  it('defines a hardened authenticated-only idempotent Manual command', () => {
    expect(manualMigration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_manual_progress_invoice_series\(payload JSONB\)\s+RETURNS TABLE \(id UUID, version INT\)\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/i,
    )
    expect(manualMigration).toMatch(/progress_validate_manual_series_create_payload\(payload\)/i)
    expect(manualMigration).toMatch(/pg_advisory_xact_lock[\s\S]*create_manual_progress_invoice_series/i)
    expect(manualMigration).toMatch(/progress_recalculate_series_read_model\(created_series\.id\)/i)
    expect(manualMigration).toMatch(/jsonb_build_object\('source_type', created_series\.source_type\)/i)
    expect(manualMigration).toMatch(/REVOKE ALL ON FUNCTION public\.create_manual_progress_invoice_series\(JSONB\)\s+FROM PUBLIC, anon, authenticated, service_role/i)
    expect(manualMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.create_manual_progress_invoice_series\(JSONB\)\s+TO authenticated/i)
    expect(manualMigration).not.toMatch(/GRANT EXECUTE[^;]*create_manual_progress_invoice_series[^;]*(?:PUBLIC|anon|service_role)/i)
  })

  it('revokes every application role from the legacy Quote create and prefill RPCs', () => {
    for (const name of ['create_progress_invoice_series', 'get_progress_invoice_quote_prefill']) {
      expect(manualMigration).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\(JSONB\\)\\s+FROM PUBLIC, anon, authenticated, service_role`,
        'i',
      ))
      expect(manualMigration).not.toMatch(new RegExp(
        `GRANT EXECUTE[^;]*${name}[^;]*(?:PUBLIC|anon|authenticated|service_role)`,
        'i',
      ))
    }
  })

  it('makes claim evidence source-aware without exposing the trigger helper', () => {
    for (const column of [
      'jobber_account_id',
      'jobber_invoice_id',
      'original_jobber_invoice_number',
      'observed_jobber_invoice_number',
    ]) {
      expect(manualMigration).toMatch(new RegExp(
        `ALTER COLUMN ${column} DROP NOT NULL`,
        'i',
      ))
    }
    expect(manualMigration).toMatch(/FROM public\.progress_claims[\s\S]*JOIN public\.progress_invoice_series[\s\S]*claim\.series_id/i)
    expect(manualMigration).toMatch(/SELECT series\.source_type[\s\S]*WHERE claim\.id = NEW\.claim_id/i)
    expect(manualMigration).toMatch(/REVOKE ALL ON FUNCTION public\.[a-z0-9_]*claim[a-z0-9_]*evidence[a-z0-9_]*\(\)\s+FROM PUBLIC, anon, authenticated, service_role/i)
  })
})
