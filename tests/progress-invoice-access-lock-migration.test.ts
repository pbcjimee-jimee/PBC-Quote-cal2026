import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDirectory = join(process.cwd(), 'supabase', 'migrations')
const migrationFile = readdirSync(migrationsDirectory).find((file) =>
  file.endsWith('_progress_invoice_service_role_access_lock.sql'),
)
const sql = migrationFile
  ? readFileSync(join(migrationsDirectory, migrationFile), 'utf8')
  : ''

const relations = [
  'business_invoice_profiles',
  'progress_invoice_templates',
  'progress_invoice_series',
  'progress_jobber_invoice_snapshots',
  'progress_adjustments',
  'progress_claims',
  'progress_claim_revisions',
  'progress_invoice_revision_sets',
  'progress_payments',
  'progress_payment_revisions',
  'progress_documents',
  'progress_invoice_events',
  'progress_invoice_numbering_base_reservations',
  'progress_claim_command_results',
] as const

const authenticatedPolicies = [
  'business_invoice_profiles_authenticated_select',
  'progress_invoice_templates_authenticated_select',
  'progress_invoice_series_authenticated_select',
  'progress_jobber_invoice_snapshots_authenticated_select',
  'progress_adjustments_authenticated_select',
  'progress_claims_authenticated_select',
  'progress_claim_revisions_authenticated_select',
  'progress_invoice_revision_sets_authenticated_select',
  'progress_payments_authenticated_select',
  'progress_payment_revisions_authenticated_select',
  'progress_documents_authenticated_select',
  'progress_invoice_events_authenticated_select',
  'progress_numbering_base_reservations_authenticated_select',
] as const

const actorRpcs = [
  'accept_progress_jobber_invoice_number',
  'approve_progress_adjustment',
  'create_manual_progress_invoice_series',
  'create_manual_progress_payment',
  'create_progress_adjustment',
  'create_progress_claim_draft',
  'get_progress_claim_defaults',
  'get_progress_claim_editor',
  'get_progress_invoice_jobber_context',
  'get_progress_invoice_series',
  'get_progress_invoice_workspace',
  'list_progress_invoice_history',
  'list_progress_invoice_series',
  'reconcile_progress_payment',
  'reject_progress_adjustment',
  'replace_manual_progress_payment',
  'save_business_invoice_profile',
  'save_progress_claim_draft',
  'supersede_progress_adjustment',
  'undo_progress_payment_reconciliation',
  'update_progress_adjustment_draft',
  'update_progress_invoice_series',
  'void_manual_progress_payment',
  'void_progress_claim_draft',
  'void_progress_invoice_series',
] as const

const serviceRpcs = [
  'apply_progress_invoice_jobber_refresh',
  'create_progress_invoice_series_from_jobber',
  'link_progress_jobber_invoice',
  'record_progress_jobber_refresh_failure',
] as const

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('Progress Invoice service-role access-lock migration', () => {
  it('is generated under the approved migration name', () => {
    expect(migrationFile).toMatch(
      /^\d{14}_progress_invoice_service_role_access_lock\.sql$/,
    )
    expect(existsSync(join(migrationsDirectory, migrationFile ?? ''))).toBe(true)
  })

  it.each(relations)(
    'revokes browser roles and grants SELECT-only service access on %s',
    (relation) => {
      const qualified = `public\\.${escapeRegExp(relation)}`
      expect(sql).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+PRIVILEGES\\s+ON\\s+TABLE\\s+${qualified}\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated\\s*;`,
          'i',
        ),
      )
      expect(sql).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+PRIVILEGES\\s+ON\\s+TABLE\\s+${qualified}\\s+FROM\\s+service_role\\s*;`,
          'i',
        ),
      )
      expect(sql).toMatch(
        new RegExp(
          `GRANT\\s+SELECT\\s+ON\\s+TABLE\\s+${qualified}\\s+TO\\s+service_role\\s*;`,
          'i',
        ),
      )
    },
  )

  it.each(authenticatedPolicies)('drops policy %s idempotently', (policy) => {
    expect(sql).toMatch(
      new RegExp(
        `DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+"${escapeRegExp(policy)}"\\s+ON\\s+public\\.[a-z0-9_]+\\s*;`,
        'i',
      ),
    )
  })

  it.each(actorRpcs)('locks actor RPC %s(jsonb) from every API role', (rpc) => {
    expect(sql).toMatch(
      new RegExp(
        `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${escapeRegExp(rpc)}\\s*\\(\\s*jsonb\\s*\\)\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated\\s*;`,
        'i',
      ),
    )
    expect(sql).not.toMatch(
      new RegExp(
        `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${escapeRegExp(rpc)}\\s*\\(\\s*jsonb\\s*\\)\\s+TO\\s+service_role`,
        'i',
      ),
    )
  })

  it.each(serviceRpcs)('preserves only service execution for %s(jsonb)', (rpc) => {
    expect(sql).toMatch(
      new RegExp(
        `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${escapeRegExp(rpc)}\\s*\\(\\s*jsonb\\s*\\)\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated\\s*;`,
        'i',
      ),
    )
    expect(sql).toMatch(
      new RegExp(
        `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${escapeRegExp(rpc)}\\s*\\(\\s*jsonb\\s*\\)\\s+TO\\s+service_role\\s*;`,
        'i',
      ),
    )
  })

  it('does not depend on future role infrastructure or broad dynamic matching', () => {
    expect(sql).not.toMatch(/\bapp_auth\b|\bcurrent_role\s*\(|\buser_profiles\b/i)
    expect(sql).not.toMatch(/\bDO\s+\$\$|pg_proc[^;]*(LIKE|~)|information_schema[^;]*(LIKE|~)/i)
    expect(sql).not.toMatch(/purge_progress|progress_invoice_canonical/i)
  })
})
