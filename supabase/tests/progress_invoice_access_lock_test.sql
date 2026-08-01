BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(14);

CREATE TEMP TABLE expected_progress_relations (relation_name TEXT PRIMARY KEY);
INSERT INTO expected_progress_relations(relation_name) VALUES
  ('business_invoice_profiles'),
  ('progress_invoice_templates'),
  ('progress_invoice_series'),
  ('progress_jobber_invoice_snapshots'),
  ('progress_adjustments'),
  ('progress_claims'),
  ('progress_claim_revisions'),
  ('progress_invoice_revision_sets'),
  ('progress_payments'),
  ('progress_payment_revisions'),
  ('progress_documents'),
  ('progress_invoice_events'),
  ('progress_invoice_numbering_base_reservations'),
  ('progress_claim_command_results');

CREATE TEMP TABLE expected_actor_rpcs (rpc_name TEXT PRIMARY KEY);
INSERT INTO expected_actor_rpcs(rpc_name) VALUES
  ('accept_progress_jobber_invoice_number'),
  ('approve_progress_adjustment'),
  ('create_manual_progress_invoice_series'),
  ('create_manual_progress_payment'),
  ('create_progress_adjustment'),
  ('create_progress_claim_draft'),
  ('get_progress_claim_defaults'),
  ('get_progress_claim_editor'),
  ('get_progress_invoice_jobber_context'),
  ('get_progress_invoice_series'),
  ('get_progress_invoice_workspace'),
  ('list_progress_invoice_history'),
  ('list_progress_invoice_series'),
  ('reconcile_progress_payment'),
  ('reject_progress_adjustment'),
  ('replace_manual_progress_payment'),
  ('save_business_invoice_profile'),
  ('save_progress_claim_draft'),
  ('supersede_progress_adjustment'),
  ('undo_progress_payment_reconciliation'),
  ('update_progress_adjustment_draft'),
  ('update_progress_invoice_series'),
  ('void_manual_progress_payment'),
  ('void_progress_claim_draft'),
  ('void_progress_invoice_series');

CREATE TEMP TABLE expected_service_rpcs (rpc_name TEXT PRIMARY KEY);
INSERT INTO expected_service_rpcs(rpc_name) VALUES
  ('apply_progress_invoice_jobber_refresh'),
  ('create_progress_invoice_series_from_jobber'),
  ('link_progress_jobber_invoice'),
  ('record_progress_jobber_refresh_failure');

SELECT is(
  (SELECT count(*)::INT FROM expected_progress_relations),
  14,
  'the access lock names exactly fourteen Progress Invoice relations'
);

SELECT is(
  (
    SELECT count(*)::INT
    FROM expected_progress_relations AS expected
    JOIN pg_catalog.pg_class AS relation ON relation.relname = expected.relation_name
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
  ),
  14,
  'all fourteen locked Progress Invoice relations exist'
);

SELECT ok(
  (
    SELECT bool_and(relation.relrowsecurity)
    FROM expected_progress_relations AS expected
    JOIN pg_catalog.pg_class AS relation ON relation.relname = expected.relation_name
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
  ),
  'RLS remains enabled on every locked Progress Invoice relation'
);

SELECT is(
  (
    SELECT count(*)::INT
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN expected_progress_relations AS expected ON expected.relation_name = relation.relname
    WHERE namespace.nspname = 'public'
      AND (policy.polroles = ARRAY[0::OID] OR 'authenticated'::regrole::OID = ANY(policy.polroles))
  ),
  0,
  'no PUBLIC or authenticated policy remains on locked relations'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM expected_progress_relations AS expected
    JOIN pg_catalog.pg_class AS relation ON relation.relname = expected.relation_name
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS privilege
    WHERE namespace.nspname = 'public' AND privilege.grantee = 0
  ),
  'PUBLIC has no direct privilege on any locked relation'
);

SELECT ok(
  (
    SELECT bool_and(NOT has_table_privilege('anon', format('public.%I', relation_name), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    FROM expected_progress_relations
  ),
  'anon has no direct privilege on any locked relation'
);

SELECT ok(
  (
    SELECT bool_and(NOT has_table_privilege('authenticated', format('public.%I', relation_name), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    FROM expected_progress_relations
  ),
  'authenticated has no direct privilege on any locked relation'
);

SELECT ok(
  (
    SELECT bool_and(
      has_table_privilege('service_role', format('public.%I', relation_name), 'SELECT')
      AND NOT has_table_privilege('service_role', format('public.%I', relation_name), 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    )
    FROM expected_progress_relations
  ),
  'service_role has SELECT-only direct access on all fourteen locked relations'
);

SELECT is((SELECT count(*)::INT FROM expected_actor_rpcs), 25, 'the actor RPC lock set contains exactly twenty-five functions');

SELECT ok(
  (
    SELECT bool_and(
      function_record.prosecdef
      AND function_record.proowner = 'postgres'::regrole
      AND function_record.proconfig @> ARRAY['search_path=""']
    )
    FROM expected_actor_rpcs AS expected
    JOIN pg_catalog.pg_proc AS function_record ON function_record.proname = expected.rpc_name
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = function_record.pronamespace
    WHERE namespace.nspname = 'public'
      AND pg_get_function_identity_arguments(function_record.oid) = 'payload jsonb'
  ),
  'all twenty-five actor RPCs preserve SECURITY DEFINER owner and search_path posture'
);

SELECT ok(
  (
    SELECT count(*) = 25
      AND bool_and(
        NOT has_function_privilege('anon', function_record.oid, 'EXECUTE')
        AND NOT has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        AND NOT has_function_privilege('service_role', function_record.oid, 'EXECUTE')
      )
    FROM expected_actor_rpcs AS expected
    JOIN pg_catalog.pg_proc AS function_record ON function_record.proname = expected.rpc_name
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = function_record.pronamespace
    WHERE namespace.nspname = 'public'
      AND pg_get_function_identity_arguments(function_record.oid) = 'payload jsonb'
  ),
  'anon authenticated and service_role cannot execute any actor RPC'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM expected_actor_rpcs AS expected
    JOIN pg_catalog.pg_proc AS function_record ON function_record.proname = expected.rpc_name
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = function_record.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(function_record.proacl, acldefault('f', function_record.proowner))) AS privilege
    WHERE namespace.nspname = 'public'
      AND pg_get_function_identity_arguments(function_record.oid) = 'payload jsonb'
      AND privilege.grantee = 0
  ),
  'PUBLIC cannot execute any actor RPC'
);

SELECT ok(
  (
    SELECT count(*) = 4
      AND bool_and(
        function_record.prosecdef
        AND function_record.proowner = 'postgres'::regrole
        AND function_record.proconfig @> ARRAY['search_path=""']
        AND NOT has_function_privilege('anon', function_record.oid, 'EXECUTE')
        AND NOT has_function_privilege('authenticated', function_record.oid, 'EXECUTE')
        AND has_function_privilege('service_role', function_record.oid, 'EXECUTE')
      )
    FROM expected_service_rpcs AS expected
    JOIN pg_catalog.pg_proc AS function_record ON function_record.proname = expected.rpc_name
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = function_record.pronamespace
    WHERE namespace.nspname = 'public'
      AND pg_get_function_identity_arguments(function_record.oid) = 'payload jsonb'
  ),
  'exactly four service RPCs retain service-only execution and hardening posture'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM expected_service_rpcs AS expected
    JOIN pg_catalog.pg_proc AS function_record ON function_record.proname = expected.rpc_name
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = function_record.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(function_record.proacl, acldefault('f', function_record.proowner))) AS privilege
    WHERE namespace.nspname = 'public'
      AND pg_get_function_identity_arguments(function_record.oid) = 'payload jsonb'
      AND privilege.grantee = 0
  ),
  'PUBLIC cannot execute any retained service RPC'
);

SELECT * FROM finish();

ROLLBACK;
