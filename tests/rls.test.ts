import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

const migrations = [
  '0002_rls_policies.sql',
  '0005_add_quote_areas.sql',
  '0007_add_jobber_tokens.sql',
  '0009_add_quote_options.sql',
  '0010_add_jobber_quote_lines.sql',
  '0011_add_product_services.sql',
  '0012_add_quote_line_templates.sql',
  '0013_add_quote_memos.sql',
  '0015_add_roof_scope_and_pricing.sql',
  '0017_add_quote_price_revisions.sql',
  '20260708000000_add_warehouse_inventory.sql',
  '20260714225000_restore_existing_data_api_grants.sql',
].map((file) => {
  const path = join(migrationsDir, file)

  return {
    file,
    sql: existsSync(path) ? readFileSync(path, 'utf8') : '',
  }
})

const combinedSql = migrations.map(({ sql }) => sql).join('\n')

const nonSecretDataApiTables = [
  'products',
  'pricing_settings',
  'quotes',
  'quote_items',
  'quote_areas',
  'quote_options',
  'quote_option_items',
  'jobber_quote_lines',
  'quote_memos',
  'quote_price_revisions',
  'product_services',
  'quote_line_templates',
  'quote_line_template_items',
  'warehouse_inventory',
]

const dataApiGrantMigration = migrations.find(
  ({ file }) => file === '20260714225000_restore_existing_data_api_grants.sql'
)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function expectRlsEnabled(table: string): void {
  expect(combinedSql).toMatch(
    new RegExp(`ALTER\\s+TABLE\\s+${escapeRegExp(table)}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i')
  )
}

function expectAuthenticatedCrudPolicy(table: string): void {
  expect(combinedSql).toMatch(
    new RegExp(
      `CREATE\\s+POLICY\\s+"authenticated_all"\\s+ON\\s+${escapeRegExp(table)}\\s+FOR\\s+ALL\\s+TO\\s+authenticated\\s+USING\\s*\\(true\\)\\s+WITH\\s+CHECK\\s*\\(true\\)`,
      'i'
    )
  )
}

function expectExplicitDataApiGrant(table: string, roles: string): void {
  expect(dataApiGrantMigration?.sql).toMatch(
    new RegExp(
      `GRANT\\s+SELECT\\s*,\\s*INSERT\\s*,\\s*UPDATE\\s*,\\s*DELETE\\s+ON\\s+TABLE\\s+public\\.${escapeRegExp(table)}\\s+TO\\s+${roles}\\s*;`,
      'i'
    )
  )
}

function expectExplicitPrivilegeReset(table: string): void {
  expect(dataApiGrantMigration?.sql).toMatch(
    new RegExp(
      `REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${escapeRegExp(table)}\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role\\s*;`,
      'i'
    )
  )
}

describe('RLS migrations', () => {
  it('covers planned Jobber quote lines with authenticated-only RLS', () => {
    const jobberLinesMigration = migrations.find(({ file }) => file === '0010_add_jobber_quote_lines.sql')

    expect(jobberLinesMigration?.sql, 'expected supabase/migrations/0010_add_jobber_quote_lines.sql').not.toBe('')
    expectRlsEnabled('jobber_quote_lines')
    expectAuthenticatedCrudPolicy('jobber_quote_lines')
  })

  it('enables RLS on every application table', () => {
    for (const table of [...nonSecretDataApiTables, 'jobber_tokens']) {
      expectRlsEnabled(table)
    }
  })

  it('defines authenticated CRUD policies only on non-secret application tables', () => {
    for (const table of nonSecretDataApiTables) {
      expectAuthenticatedCrudPolicy(table)
    }
  })

  it('declares explicit legacy Data API DML privileges for every existing table', () => {
    expect(dataApiGrantMigration?.sql, 'expected explicit Data API grant migration').not.toBe('')

    for (const table of nonSecretDataApiTables) {
      expectExplicitPrivilegeReset(table)
      expectExplicitDataApiGrant(table, 'anon\\s*,\\s*authenticated\\s*,\\s*service_role')
    }

    expectExplicitPrivilegeReset('jobber_tokens')
    expectExplicitDataApiGrant('jobber_tokens', 'service_role')
    expect(dataApiGrantMigration?.sql).not.toMatch(
      /GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.jobber_tokens\s+TO\s+(?:anon|authenticated)\b/i
    )
  })

  it('keeps Jobber OAuth tokens service-role only', () => {
    const jobberMigration = migrations.find(({ file }) => file === '0007_add_jobber_tokens.sql')
    expect(jobberMigration?.sql).toBeDefined()
    expect(jobberMigration?.sql).not.toMatch(/CREATE\s+POLICY[\s\S]+ON\s+jobber_tokens/i)
  })

  it('does not define anonymous access policies', () => {
    expect(combinedSql).not.toMatch(/CREATE\s+POLICY[^;]*\bTO\s+anon\b/i)
    expect(combinedSql).not.toMatch(/CREATE\s+POLICY[^;]*\bTO\s+public\b/i)
  })
})
