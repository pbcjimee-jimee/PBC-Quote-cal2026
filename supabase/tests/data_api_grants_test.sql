BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(64);

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

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.create_manual_progress_invoice_series(jsonb)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'anon',
      'public.create_manual_progress_invoice_series(jsonb)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'service_role',
      'public.create_manual_progress_invoice_series(jsonb)',
      'EXECUTE'
    ),
  true,
  'Manual creation is exposed only to authenticated'
);

SELECT is(
  (
    SELECT NOT EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(routine.proacl, acldefault('f', routine.proowner))) AS privilege
      WHERE privilege.grantee = 0
        AND privilege.privilege_type = 'EXECUTE'
    )
    FROM pg_proc AS routine
    WHERE routine.oid = 'public.create_manual_progress_invoice_series(jsonb)'::regprocedure
  ),
  true,
  'Manual creation revokes default PUBLIC execution'
);

SELECT is(
  (
    SELECT bool_and(
      NOT has_function_privilege('anon', function_oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', function_oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', function_oid, 'EXECUTE')
    )
    FROM (
      SELECT to_regprocedure(signature)::OID AS function_oid
      FROM unnest(ARRAY[
        'public.create_progress_invoice_series(jsonb)',
        'public.get_progress_invoice_quote_prefill(jsonb)'
      ]) AS legacy(signature)
    ) AS legacy_functions
  ),
  true,
  'legacy Quote create and prefill execution is revoked from application roles'
);

SELECT is(
  NOT has_function_privilege(
    'authenticated',
    'public.progress_validate_manual_series_create_payload(jsonb)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'anon',
      'public.progress_validate_manual_series_create_payload(jsonb)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'service_role',
      'public.progress_validate_manual_series_create_payload(jsonb)',
      'EXECUTE'
    ),
  true,
  'Manual payload validation helper is not an application API'
);

SELECT * FROM finish();

ROLLBACK;
