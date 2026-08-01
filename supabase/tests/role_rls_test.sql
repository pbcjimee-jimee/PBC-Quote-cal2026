BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(22);

WITH admin_tables AS (
  SELECT unnest(ARRAY[
    'products', 'pricing_settings', 'quotes', 'quote_items', 'quote_areas',
    'quote_options', 'quote_option_items', 'jobber_quote_lines',
    'product_services', 'quote_line_templates', 'quote_line_template_items',
    'quote_memos', 'quote_price_revisions'
  ]) AS table_name
)
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = admin_tables.table_name
      AND policyname = admin_tables.table_name || '_admin'
      AND roles = ARRAY['authenticated'::name]
      AND cmd = 'ALL'
      AND replace(qual, '"current_role"', 'current_role') =
        '(app_auth.current_role() = ''admin''::text)'
      AND replace(with_check, '"current_role"', 'current_role') =
        '(app_auth.current_role() = ''admin''::text)'
  ),
  format('public.%I has the exact authenticated admin-only ALL policy', table_name)
)
FROM admin_tables;

SELECT ok(prosecdef, 'app_auth.current_role is SECURITY DEFINER')
FROM pg_proc
WHERE oid = 'app_auth.current_role()'::regprocedure;

SELECT is(
  (SELECT count(*)::INT FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'user_profiles'),
  2,
  'user_profiles has self and admin select policies'
);

WITH expected(policy_name, cmd, qual, with_check) AS (
  VALUES
    (
      'warehouse_inventory_app_select',
      'SELECT',
      '(app_auth.current_role() = ANY (ARRAY[''admin''::text, ''supervisor''::text]))',
      NULL
    ),
    (
      'warehouse_inventory_app_update',
      'UPDATE',
      '(app_auth.current_role() = ANY (ARRAY[''admin''::text, ''supervisor''::text]))',
      '(app_auth.current_role() = ANY (ARRAY[''admin''::text, ''supervisor''::text]))'
    ),
    (
      'warehouse_inventory_admin_insert',
      'INSERT',
      NULL,
      '(app_auth.current_role() = ''admin''::text)'
    ),
    (
      'warehouse_inventory_admin_delete',
      'DELETE',
      '(app_auth.current_role() = ''admin''::text)',
      NULL
    )
)
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouse_inventory'
      AND policyname = expected.policy_name
      AND roles = ARRAY['authenticated'::name]
      AND pg_policies.cmd = expected.cmd
      AND replace(pg_policies.qual, '"current_role"', 'current_role')
        IS NOT DISTINCT FROM expected.qual
      AND replace(pg_policies.with_check, '"current_role"', 'current_role')
        IS NOT DISTINCT FROM expected.with_check
  ),
  format('%s has exact roles, command, USING, and WITH CHECK', policy_name)
)
FROM expected;

SELECT is((SELECT count(*)::INT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobber_tokens'), 0, 'jobber_tokens has no client policy');
SELECT is((SELECT count(*)::INT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobber_job_snapshots'), 0, 'jobber_job_snapshots has no client policy');
SELECT is(
  (SELECT count(*)::INT
   FROM pg_class
   WHERE relnamespace = 'public'::regnamespace
     AND (relname LIKE 'progress_invoice%' OR relname = 'business_invoice_profiles')),
  0,
  'role schema has no Progress Invoice tables'
);

SELECT * FROM finish();
ROLLBACK;
