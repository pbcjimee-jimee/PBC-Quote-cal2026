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
].map((file) => {
  const path = join(migrationsDir, file)

  return {
    file,
    sql: existsSync(path) ? readFileSync(path, 'utf8') : '',
  }
})

const combinedSql = migrations.map(({ sql }) => sql).join('\n')

const authenticatedCrudTables = [
  'products',
  'pricing_settings',
  'quotes',
  'quote_items',
  'quote_areas',
  'quote_options',
  'quote_option_items',
  'jobber_quote_lines',
  'quote_memos',
  'product_services',
  'quote_line_templates',
  'quote_line_template_items',
]

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

describe('RLS migrations', () => {
  it('covers planned Jobber quote lines with authenticated-only RLS', () => {
    const jobberLinesMigration = migrations.find(({ file }) => file === '0010_add_jobber_quote_lines.sql')

    expect(jobberLinesMigration?.sql, 'expected supabase/migrations/0010_add_jobber_quote_lines.sql').not.toBe('')
    expectRlsEnabled('jobber_quote_lines')
    expectAuthenticatedCrudPolicy('jobber_quote_lines')
  })

  it('enables RLS on every application table', () => {
    for (const table of [...authenticatedCrudTables, 'jobber_tokens']) {
      expectRlsEnabled(table)
    }
  })

  it('grants authenticated CRUD only on non-secret application tables', () => {
    for (const table of authenticatedCrudTables) {
      expectAuthenticatedCrudPolicy(table)
    }
  })

  it('keeps Jobber OAuth tokens service-role only', () => {
    const jobberMigration = migrations.find(({ file }) => file === '0007_add_jobber_tokens.sql')
    expect(jobberMigration?.sql).toBeDefined()
    expect(jobberMigration?.sql).not.toMatch(/CREATE\s+POLICY[\s\S]+ON\s+jobber_tokens/i)
  })

  it('does not define anonymous access policies', () => {
    expect(combinedSql).not.toMatch(/\bTO\s+anon\b/i)
    expect(combinedSql).not.toMatch(/\bTO\s+public\b/i)
  })
})
