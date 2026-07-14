BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(60);

WITH expected(table_name, grantee, privileges) AS (
  SELECT
    table_name,
    grantee,
    CASE
      WHEN table_name = 'jobber_tokens' AND grantee <> 'service_role' THEN NULL
      WHEN grantee = 'PUBLIC' THEN NULL
      ELSE 'DELETE,INSERT,SELECT,UPDATE'
    END
  FROM unnest(ARRAY[
    'products',
    'pricing_settings',
    'quotes',
    'quote_items',
    'quote_areas',
    'jobber_tokens',
    'quote_options',
    'quote_option_items',
    'jobber_quote_lines',
    'product_services',
    'quote_line_templates',
    'quote_line_template_items',
    'quote_memos',
    'quote_price_revisions',
    'warehouse_inventory'
  ]) AS table_names(table_name)
  CROSS JOIN unnest(ARRAY['PUBLIC', 'anon', 'authenticated', 'service_role']) AS grantees(grantee)
)
SELECT is(
  (
    SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = expected.table_name
      AND grantee = expected.grantee
  ),
  expected.privileges,
  format('%I has the intended privileges on public.%I', expected.grantee, expected.table_name)
)
FROM expected;

SELECT * FROM finish();

ROLLBACK;
