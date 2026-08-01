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
      AND cmd = 'ALL'
      AND qual ~ 'app_auth\."?current_role"?\(\).*admin'
  ),
  format('public.%I has an admin-only policy', table_name)
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

WITH expected(policy_name) AS (
  SELECT unnest(ARRAY[
    'warehouse_inventory_app_select',
    'warehouse_inventory_app_update',
    'warehouse_inventory_admin_insert',
    'warehouse_inventory_admin_delete'
  ])
)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'warehouse_inventory' AND policyname = expected.policy_name),
  format('%s exists', policy_name)
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
