import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const installedPath = process.env.PBC_PGLITE_PATH ?? 'C:/Users/kjm12/AppData/Roaming/npm/node_modules/firebase-tools/node_modules/@electric-sql/pglite/dist/index.cjs'
export const pgliteAvailable = existsSync(installedPath)
export const actorId = '00000000-0000-4000-8000-000000000001'

export async function bootstrap({ through = '20260918020411', beforeMigration } = {}) {
  const { PGlite } = createRequire(import.meta.url)(installedPath)
  const db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT '${actorId}'::UUID $$;
    INSERT INTO auth.users(id,email) VALUES ('${actorId}', 'local@example.test');
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated,service_role;`)
  for (const filename of readdirSync('supabase/migrations').sort()) {
    if (!filename.endsWith('.sql') || filename.startsWith('0004_') || filename.slice(0,14) > through) continue
    if (beforeMigration) await beforeMigration(db, filename)
    try { await db.exec(readFileSync(join('supabase/migrations', filename), 'utf8')) }
    catch (error) { await db.close(); throw new Error(`Migration ${filename}: ${error.message}`) }
  }
  return db
}

export function savePayload({ key = '00000000-0000-4000-8000-000000000401', logicalKey = '00000000-0000-4000-8000-000000000201', amount = '-150.00' } = {}) {
  return {
    quote: { working_days: '0', labour_per_day: '0', formula1_total: '10', formula2_total: '10', formula3_total: '10', formula4_total: '10', formula5_total: '10',
      selected_min: 1, selected_max: 1, interior_selected_min: 1, interior_selected_max: 1, exterior_selected_min: 1, exterior_selected_max: 1, roof_selected_min: 1, roof_selected_max: 1,
      subtotal: '10', final_total: '11', pricing_settings_snapshot: {}, created_by: actorId, updated_by: actorId,
      paint_comparisons: [{ version: 1, key, alternatives: [] }], jobber_save_mode: 'priced_line_items' },
    items: [{ logical_key: logicalKey, timber_role: 'none', product_name_snapshot: 'Brush', market_price_snapshot: '10', actual_price_snapshot: '10', quantity: '1', is_custom: true, position: 0 }],
    options: [], memos: [], jobber_lines: [{ kind: 'line_item', name: 'Aqua discount', quantity: '1', unit_price: amount, total_price: amount,
      taxable: true, client_visible: true, optional: true, recommended: false, selected: false,
      optional_write_policy: 'set_true', recommended_write_policy: 'set_false', paint_comparison_key: key, position: 0 }], sync_requested: false,
  }
}
