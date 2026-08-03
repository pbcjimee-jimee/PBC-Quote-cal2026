import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const forbiddenApplicationPaths = [
  'app/(app)/progress-invoices',
  'app/api/jobber/progress-invoices',
  'components/progress-invoices',
]

const forbiddenRuntimePaths = [
  'lib/actions/progress-invoice-adjustments.ts',
  'lib/actions/progress-invoice-jobber.ts',
  'lib/actions/progress-invoice-series.ts',
  'lib/progress-invoices',
  'lib/jobber/invoice-client.ts',
  'lib/jobber/invoice-contract.ts',
  'lib/jobber/invoice-gateway.ts',
  'lib/jobber/invoice-types.ts',
]

const forbiddenMigrations = [
  'supabase/migrations/20260714225000_restore_existing_data_api_grants.sql',
  'supabase/migrations/20260714230000_add_progress_invoice_core.sql',
  'supabase/migrations/20260714231000_add_progress_invoice_rpc_foundations.sql',
  'supabase/migrations/20260714231100_add_progress_invoice_series_rpcs.sql',
  'supabase/migrations/20260714231200_add_progress_invoice_jobber_rpcs.sql',
]

describe('role branch Progress Invoice separation', () => {
  it.each(forbiddenApplicationPaths)('does not ship %s', (path) => {
    expect(existsSync(path)).toBe(false)
  })

  it.each(forbiddenRuntimePaths)('does not ship %s', (path) => {
    expect(existsSync(path)).toBe(false)
  })

  it.each(forbiddenMigrations)('does not ship %s', (path) => {
    expect(existsSync(path)).toBe(false)
  })

  it('uses a role-owned local Supabase project id', () => {
    const config = readFileSync('supabase/config.toml', 'utf8')
    expect(config).toContain('project_id = "pbc-quote-cal-role"')
    expect(config).not.toMatch(/progress[-_ ]invoice/i)
  })
})
