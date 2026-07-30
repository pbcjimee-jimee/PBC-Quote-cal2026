import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function readMigration(file: string): string {
  return readFileSync(join(migrationsDir, file), 'utf8')
}

describe('role RLS migrations', () => {
  it('creates active user profiles and resolves the current session role', () => {
    const sql = readMigration('20260731010000_add_user_profiles_and_roles.sql')

    expect(sql).toMatch(/CREATE TABLE public\.user_profiles/i)
    expect(sql).toMatch(/role TEXT NOT NULL CHECK \(role IN \('admin', 'supervisor'\)\)/i)
    expect(sql).toMatch(/jobber_user_id TEXT UNIQUE/i)
    expect(sql).toMatch(/CREATE FUNCTION app_auth\.current_role\(\)/i)
    expect(sql).toMatch(/SECURITY DEFINER/i)
    expect(sql).toMatch(/profile\.id = auth\.uid\(\)[\s\S]*profile\.is_active/i)
  })

  it('bootstraps existing auth users as admins before role policies are tightened', () => {
    const sql = readMigration('20260731010000_add_user_profiles_and_roles.sql')
    const seed = readFileSync(
      join(process.cwd(), 'supabase', 'bootstrap', 'seed-user-profiles-admins.sql'),
      'utf8'
    )

    for (const source of [sql, seed]) {
      expect(source).toMatch(/INSERT INTO public\.user_profiles/i)
      expect(source).toMatch(/FROM auth\.users/i)
      expect(source).toMatch(/'admin'/i)
      expect(source).toMatch(/ON CONFLICT \(id\)/i)
    }
  })

  it('limits profiles to self-or-admin reads and service-role writes', () => {
    const sql = readMigration('20260731010000_add_user_profiles_and_roles.sql')

    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.user_profiles TO authenticated/i)
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.user_profiles TO service_role/i)
    expect(sql).toMatch(/FOR SELECT TO authenticated[\s\S]*auth\.uid\(\)/i)
    expect(sql).toMatch(/FOR SELECT TO authenticated[\s\S]*app_auth\.current_role\(\) = 'admin'/i)
    expect(sql).not.toMatch(/FOR (?:INSERT|UPDATE|DELETE|ALL) TO authenticated/i)
  })

  it('restricts quote, pricing, product, and progress data to admins', () => {
    const sql = readMigration('20260731011000_tighten_role_rls.sql')
    const adminTables = [
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
      'business_invoice_profiles',
      'progress_invoice_series',
      'progress_invoice_events',
    ]

    for (const table of adminTables) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE POLICY "${table}_admin" ON public\\.${table}[\\s\\S]*?app_auth\\.current_role\\(\\) = 'admin'`,
          'i'
        )
      )
    }
  })

  it('allows supervisors to select and move inventory but rejects identity edits', () => {
    const sql = readMigration('20260731011000_tighten_role_rls.sql')

    expect(sql).toMatch(/CREATE POLICY "warehouse_inventory_app_select"[\s\S]*current_role\(\) IN \('admin', 'supervisor'\)/i)
    expect(sql).toMatch(/CREATE POLICY "warehouse_inventory_app_update"[\s\S]*current_role\(\) IN \('admin', 'supervisor'\)/i)
    expect(sql).toMatch(/CREATE POLICY "warehouse_inventory_admin_insert"[\s\S]*current_role\(\) = 'admin'/i)
    expect(sql).toMatch(/CREATE POLICY "warehouse_inventory_admin_delete"[\s\S]*current_role\(\) = 'admin'/i)
    expect(sql).toMatch(/OLD\.name IS DISTINCT FROM NEW\.name/i)
    expect(sql).toMatch(/OLD\.active IS DISTINCT FROM NEW\.active/i)
    expect(sql).toMatch(/RAISE EXCEPTION 'INVENTORY_ADMIN_FIELDS_REQUIRED'/i)
  })

  it('guards authenticated Progress Invoice RPCs against supervisor calls', () => {
    const sql = readMigration('20260731011000_tighten_role_rls.sql')
    const rpcNames = [
      'save_business_invoice_profile',
      'list_progress_invoice_series',
      'get_progress_invoice_series',
      'get_progress_invoice_quote_prefill',
      'create_progress_invoice_series',
      'update_progress_invoice_series',
      'create_progress_adjustment',
      'update_progress_adjustment_draft',
      'approve_progress_adjustment',
      'supersede_progress_adjustment',
      'get_progress_invoice_jobber_context',
      'accept_progress_jobber_invoice_number',
    ]

    for (const rpc of rpcNames) {
      expect(sql).toMatch(new RegExp(`ALTER FUNCTION public\\.${rpc}\\(JSONB\\) RENAME TO ${rpc}_admin_impl`, 'i'))
      expect(sql).toMatch(new RegExp(`CREATE FUNCTION public\\.${rpc}\\(payload JSONB\\)`, 'i'))
    }

    expect(sql).toMatch(/app_auth\.require_admin\(\)/i)
  })
})
