CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(33);

CREATE FUNCTION pg_temp.capture_sqlstate(command TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE command;
    RAISE EXCEPTION '__PGTAP_ROLLBACK_SUCCESS__' USING ERRCODE = 'P0001';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = '__PGTAP_ROLLBACK_SUCCESS__' THEN
        RETURN 'NO_ERROR';
      END IF;
      RETURN SQLSTATE;
    WHEN OTHERS THEN
      RETURN SQLSTATE;
  END;
END;
$$;

CREATE FUNCTION pg_temp.series_payload(requested_correlation_key UUID)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'source_type', 'jobber_job',
    'base_contract_ex_gst', '1000.00',
    'gst_rate', '0.10',
    'recipient_name', 'Actor-isolated Builder',
    'recipient_address', '1 Actor Street',
    'site_name', 'Actor Site',
    'site_address', '2 Actor Street',
    'default_description', 'Actor-isolated works',
    'correlation_key', requested_correlation_key
  );
$$;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000009101', 'series-fix-a@example.test', now(), now()),
  ('00000000-0000-0000-0000-000000009102', 'series-fix-b@example.test', now(), now());

INSERT INTO public.progress_invoice_series (
  id,
  source_type,
  base_contract_ex_gst,
  recipient_name,
  recipient_address,
  site_name,
  site_address,
  default_description,
  status,
  current_adjusted_contract_ex_gst,
  current_adjusted_contract_gst,
  current_adjusted_contract_inc_gst,
  current_claimed_inc_gst,
  current_actual_receipts,
  current_outstanding_receivable,
  current_unclaimed_inc_gst,
  current_cumulative_percentage,
  current_payment_state,
  created_by,
  updated_by,
  created_at,
  updated_at
)
SELECT
  format('90000000-0000-4000-8000-%s', lpad(value::TEXT, 12, '0'))::UUID,
  'jobber_job',
  CASE WHEN value = 126 THEN 899999999999.99 ELSE 1000 END,
  CASE
    WHEN value = 126 THEN E'Literal %_,()\\ token'
    WHEN value <= 15 THEN format('Paged literal %s', lpad(value::TEXT, 3, '0'))
    ELSE format('Recent nonmatch %s', value)
  END,
  '1 Read Boundary Street',
  format('Series site %s', value),
  '2 Read Boundary Street',
  'Read boundary fixture',
  CASE WHEN value % 10 = 0 THEN 'completed' ELSE 'active' END,
  CASE WHEN value = 126 THEN 899999999999.99 ELSE 1000 END,
  CASE WHEN value = 126 THEN 89999999999.99 ELSE 100 END,
  CASE WHEN value = 126 THEN 989999999999.98 ELSE 1100 END,
  CASE WHEN value = 126 THEN 110.01 ELSE 0 END,
  CASE WHEN value = 126 THEN 10.00 ELSE 0 END,
  CASE WHEN value = 126 THEN 100.01 ELSE 0 END,
  CASE WHEN value = 126 THEN 989999999889.97 ELSE 1100 END,
  CASE WHEN value = 126 THEN 0.000011 ELSE 0 END,
  CASE WHEN value % 7 = 0 THEN 'overdue' ELSE 'unpaid' END,
  '00000000-0000-0000-0000-000000009101',
  '00000000-0000-0000-0000-000000009101',
  '2026-07-01 00:00:00+00'::TIMESTAMPTZ + value * interval '1 second',
  '2026-07-01 00:00:00+00'::TIMESTAMPTZ + value * interval '1 second'
FROM generate_series(1, 126) AS fixture(value);

SELECT is(
  (
    SELECT bool_and(
      has_function_privilege('authenticated', function_oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', function_oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', function_oid, 'EXECUTE')
    )
    FROM (
      SELECT to_regprocedure(signature)::OID AS function_oid
      FROM unnest(ARRAY[
        'public.list_progress_invoice_series(jsonb)',
        'public.get_progress_invoice_series(jsonb)'
      ]) AS rpc(signature)
    ) AS read_rpcs
  ),
  true,
  'purpose-specific read RPCs are authenticated-only'
);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000009101';

CREATE TEMP TABLE fix_list_page AS
SELECT public.list_progress_invoice_series(jsonb_build_object(
  'query', 'Paged literal',
  'statuses', '[]'::JSONB,
  'page', 2,
  'page_size', 10,
  'quote_id', NULL
)) AS result;

SELECT is(
  (
    SELECT (result ->> 'total')::INT = 15
      AND jsonb_array_length(result -> 'items') = 5
    FROM fix_list_page
  ),
  true,
  'search is applied before pagination and returns the total matching count beyond the newest 100'
);

SELECT is(
  (
    SELECT result #>> '{items,0,id}' = '90000000-0000-4000-8000-000000000005'
      AND result #>> '{items,4,id}' = '90000000-0000-4000-8000-000000000001'
    FROM fix_list_page
  ),
  true,
  'page ordering is deterministic by updated time and stable ID tie-breaker'
);

SELECT is(
  (
    SELECT (public.list_progress_invoice_series(jsonb_build_object(
      'query', '', 'statuses', jsonb_build_array('completed'),
      'page', 1, 'page_size', 100, 'quote_id', NULL
    )) ->> 'total')::INT
  ),
  12,
  'lifecycle status filters run in PostgreSQL before pagination'
);

SELECT is(
  (
    SELECT (public.list_progress_invoice_series(jsonb_build_object(
      'query', '', 'statuses', jsonb_build_array('overdue'),
      'page', 1, 'page_size', 100, 'quote_id', NULL
    )) ->> 'total')::INT
  ),
  18,
  'payment-state filters run in PostgreSQL before pagination'
);

SELECT is(
  (
    SELECT (public.list_progress_invoice_series(jsonb_build_object(
      'query', '', 'statuses', jsonb_build_array('active', 'overdue'),
      'page', 1, 'page_size', 100, 'quote_id', NULL
    )) ->> 'total')::INT
  ),
  17,
  'lifecycle and payment filters compose as separate filter groups'
);

CREATE TEMP TABLE fix_literal_search AS
SELECT public.list_progress_invoice_series(jsonb_build_object(
  'query', E'Literal %_,()\\ token',
  'statuses', '[]'::JSONB,
  'page', 1,
  'page_size', 20,
  'quote_id', NULL
)) AS result;

SELECT is(
  (SELECT (result ->> 'total')::INT FROM fix_literal_search),
  1,
  'percent, underscore, comma, parentheses, and backslash are literal search text'
);

SELECT is(
  (
    SELECT jsonb_typeof(result #> '{items,0,current_adjusted_contract_ex_gst}') = 'string'
      AND result #>> '{items,0,current_adjusted_contract_ex_gst}' = '899999999999.99'
      AND result #>> '{items,0,current_claimed_inc_gst}' = '110.01'
      AND result #>> '{items,0,current_cumulative_percentage}' = '0.000011'
    FROM fix_literal_search
  ),
  true,
  'dashboard money and percentage values cross PostgREST as exact decimal text'
);

CREATE TEMP TABLE fix_detail AS
SELECT public.get_progress_invoice_series(jsonb_build_object(
  'series_id', '90000000-0000-4000-8000-000000000126'
)) AS result;

SELECT is(
  (
    SELECT jsonb_typeof(result #> '{series,base_contract_ex_gst}') = 'string'
      AND result #>> '{series,base_contract_ex_gst}' = '899999999999.99'
      AND result #>> '{series,current_adjusted_contract_inc_gst}' = '989999999999.98'
      AND result #>> '{series,current_cumulative_percentage}' = '0.000011'
    FROM fix_detail
  ),
  true,
  'series detail preserves large NUMERIC values, cents, and percentage precision as text'
);

SELECT is(
  (
    SELECT NOT (result -> 'series' ?| ARRAY[
      'bank_name', 'bsb', 'bank_account_number', 'raw_jobber_payload', 'access_token'
    ])
    FROM fix_detail
  ),
  true,
  'purpose-specific detail does not expose bank, raw Jobber, or token data'
);

RESET request.jwt.claim.sub;
SELECT is(
  pg_temp.capture_sqlstate($sql$
    SELECT public.list_progress_invoice_series(
      '{"query":"","statuses":[],"page":1,"page_size":20,"quote_id":null}'::JSONB
    )
  $sql$),
  '28000',
  'read RPCs require a non-null auth.uid'
);
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000009101';

CREATE TEMP TABLE fix_series_update AS
SELECT * FROM public.update_progress_invoice_series(jsonb_build_object(
  'series_id', '90000000-0000-4000-8000-000000000001',
  'expected_version', 1,
  'base_contract_ex_gst', '1200.01',
  'recipient_name', 'Audit Builder',
  'recipient_company', 'Audit Pty',
  'reference', 'AUDIT',
  'correlation_key', '91000000-0000-4000-8000-000000000001'
));

SELECT is(
  (
    SELECT event.safe_field_changes -> 'recipient_name'
        = '{"before":"Paged literal 001","after":"Audit Builder"}'::JSONB
      AND event.safe_field_changes -> 'recipient_company'
        = '{"before":null,"after":"Audit Pty"}'::JSONB
      AND event.safe_field_changes -> 'base_contract_ex_gst'
        = '{"before":"1000.00","after":"1200.01"}'::JSONB
      AND event.safe_field_changes -> 'reference'
        = '{"before":null,"after":"AUDIT"}'::JSONB
    FROM public.progress_invoice_events AS event
    WHERE event.command_name = 'update_progress_invoice_series'
      AND event.correlation_key = '91000000-0000-4000-8000-000000000001'
  ),
  true,
  'series update audit contains exact allowlisted before and after values'
);

SELECT is(
  (
    SELECT event.safe_field_changes::TEXT !~* '(bank|token|raw_jobber|request_payload)'
      AND pg_column_size(event.safe_field_changes) <= 16384
    FROM public.progress_invoice_events AS event
    WHERE event.command_name = 'update_progress_invoice_series'
      AND event.correlation_key = '91000000-0000-4000-8000-000000000001'
  ),
  true,
  'series audit excludes forbidden data and stays within the bounded event payload'
);

SELECT is(
  (
    SELECT update_result.version = 2
      AND update_result.quote_id IS NULL
      AND series.recipient_name = 'Audit Builder'
    FROM fix_series_update AS update_result
    JOIN public.progress_invoice_series AS series ON series.id = update_result.id
  ),
  true,
  'series update returns its server-resolved Quote link without changing the outward mutation identity'
);

CREATE TEMP TABLE fix_adjustment AS
SELECT * FROM public.create_progress_adjustment(jsonb_build_object(
  'series_id', '90000000-0000-4000-8000-000000000001',
  'type', 'variation',
  'effective_date', '2026-07-16',
  'description', 'Audit adjustment before',
  'amount_ex_gst', '10.01',
  'gst_rate', '0.10',
  'correlation_key', '91000000-0000-4000-8000-000000000002'
));

CREATE TEMP TABLE fix_adjustment_update AS
SELECT * FROM public.update_progress_adjustment_draft(jsonb_build_object(
  'adjustment_id', (SELECT id FROM fix_adjustment),
  'expected_version', 1,
  'type', 'credit',
  'effective_date', '2026-07-17',
  'description', 'Audit adjustment after',
  'amount_ex_gst', '9.99',
  'correlation_key', '91000000-0000-4000-8000-000000000003'
));

SELECT is(
  (
    SELECT event.safe_field_changes ->> 'adjustment_id' = (SELECT id::TEXT FROM fix_adjustment)
      AND event.safe_field_changes -> 'type'
        = '{"before":"variation","after":"credit"}'::JSONB
      AND event.safe_field_changes -> 'effective_date'
        = '{"before":"2026-07-16","after":"2026-07-17"}'::JSONB
      AND event.safe_field_changes -> 'amount_ex_gst'
        = '{"before":"10.01","after":"9.99"}'::JSONB
    FROM public.progress_invoice_events AS event
    WHERE event.command_name = 'update_progress_adjustment_draft'
      AND event.correlation_key = '91000000-0000-4000-8000-000000000003'
  ),
  true,
  'draft adjustment audit identifies the adjustment and records exact before and after values'
);

SELECT is(
  (
    SELECT event.safe_field_changes::TEXT !~* '(bank|token|raw_jobber|request_payload)'
      AND update_result.quote_id IS NULL
    FROM public.progress_invoice_events AS event
    CROSS JOIN fix_adjustment_update AS update_result
    WHERE event.command_name = 'update_progress_adjustment_draft'
      AND event.correlation_key = '91000000-0000-4000-8000-000000000003'
  ),
  true,
  'adjustment audit excludes forbidden data and mutation metadata resolves Quote ID server-side'
);

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.update_progress_invoice_series(%L::JSONB)',
    jsonb_build_object(
      'series_id', '90000000-0000-4000-8000-000000000002',
      'expected_version', 1,
      'recipient_company', repeat('c', 161),
      'correlation_key', '91000000-0000-4000-8000-000000000010'
    )::TEXT
  )),
  '23514',
  'direct RPC rejects recipient_company above 160 characters'
);

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.update_progress_invoice_series(%L::JSONB)',
    jsonb_build_object(
      'series_id', '90000000-0000-4000-8000-000000000002',
      'expected_version', 1,
      'recipient_email', repeat('e', 255),
      'correlation_key', '91000000-0000-4000-8000-000000000011'
    )::TEXT
  )),
  '23514',
  'direct RPC rejects recipient_email above 254 characters'
);

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.update_progress_invoice_series(%L::JSONB)',
    jsonb_build_object(
      'series_id', '90000000-0000-4000-8000-000000000002',
      'expected_version', 1,
      'recipient_phone', repeat('p', 41),
      'correlation_key', '91000000-0000-4000-8000-000000000012'
    )::TEXT
  )),
  '23514',
  'direct RPC rejects recipient_phone above 40 characters'
);

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.update_progress_invoice_series(%L::JSONB)',
    jsonb_build_object(
      'series_id', '90000000-0000-4000-8000-000000000002',
      'expected_version', 1,
      'reference', repeat('r', 121),
      'correlation_key', '91000000-0000-4000-8000-000000000013'
    )::TEXT
  )),
  '23514',
  'direct RPC rejects reference above 120 characters'
);

SELECT is(
  (
    SELECT series.version = 1
      AND series.recipient_company IS NULL
      AND series.recipient_email IS NULL
      AND series.recipient_phone IS NULL
      AND series.reference IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.progress_invoice_events AS event
        WHERE event.series_id = series.id
          AND event.command_name = 'update_progress_invoice_series'
      )
    FROM public.progress_invoice_series AS series
    WHERE series.id = '90000000-0000-4000-8000-000000000002'
  ),
  true,
  'all rejected optional-field updates leave row, version, and event state unchanged'
);

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.create_progress_adjustment(%L::JSONB)',
    jsonb_build_object(
      'series_id', '90000000-0000-4000-8000-000000000003',
      'type', 'variation', 'effective_date', 'tomorrow',
      'description', 'Invalid tomorrow', 'amount_ex_gst', '1.00', 'gst_rate', '0.10',
      'correlation_key', '91000000-0000-4000-8000-000000000020'
    )::TEXT
  )),
  '22023',
  'create adjustment rejects relative PostgreSQL date text'
);

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.create_progress_adjustment(%L::JSONB)',
    jsonb_build_object(
      'series_id', '90000000-0000-4000-8000-000000000003',
      'type', 'variation', 'effective_date', '07/16/2026',
      'description', 'Invalid slash date', 'amount_ex_gst', '1.00', 'gst_rate', '0.10',
      'correlation_key', '91000000-0000-4000-8000-000000000021'
    )::TEXT
  )),
  '22023',
  'create adjustment rejects locale-formatted date text'
);

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.create_progress_adjustment(%L::JSONB)',
    jsonb_build_object(
      'series_id', '90000000-0000-4000-8000-000000000003',
      'type', 'variation', 'effective_date', '2026-02-30',
      'description', 'Impossible date', 'amount_ex_gst', '1.00', 'gst_rate', '0.10',
      'correlation_key', '91000000-0000-4000-8000-000000000022'
    )::TEXT
  )),
  '22023',
  'create adjustment rejects impossible canonical-looking dates'
);

CREATE TEMP TABLE fix_date_adjustment AS
SELECT * FROM public.create_progress_adjustment(jsonb_build_object(
  'series_id', '90000000-0000-4000-8000-000000000003',
  'type', 'variation', 'effective_date', '2026-07-16',
  'description', 'Canonical date target', 'amount_ex_gst', '1.00', 'gst_rate', '0.10',
  'correlation_key', '91000000-0000-4000-8000-000000000023'
));

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.update_progress_adjustment_draft(%L::JSONB)',
    jsonb_build_object(
      'adjustment_id', (SELECT id FROM fix_date_adjustment), 'expected_version', 1,
      'effective_date', '2026-07-16T00:00:00',
      'correlation_key', '91000000-0000-4000-8000-000000000024'
    )::TEXT
  )),
  '22023',
  'draft update rejects timestamp text'
);

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.update_progress_adjustment_draft(%L::JSONB)',
    jsonb_build_object(
      'adjustment_id', (SELECT id FROM fix_date_adjustment), 'expected_version', 1,
      'effective_date', ' 2026-07-16 ',
      'correlation_key', '91000000-0000-4000-8000-000000000025'
    )::TEXT
  )),
  '22023',
  'draft update rejects whitespace date variants'
);

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.update_progress_adjustment_draft(%L::JSONB)',
    jsonb_build_object(
      'adjustment_id', (SELECT id FROM fix_date_adjustment), 'expected_version', 1,
      'effective_date', 20260716,
      'correlation_key', '91000000-0000-4000-8000-000000000026'
    )::TEXT
  )),
  '22023',
  'draft update rejects non-string date JSON'
);

SELECT * INTO TEMP TABLE fix_date_approval
FROM public.approve_progress_adjustment(jsonb_build_object(
  'adjustment_id', (SELECT id FROM fix_date_adjustment),
  'expected_version', 1,
  'correlation_key', '91000000-0000-4000-8000-000000000027'
));

SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.supersede_progress_adjustment(%L::JSONB)',
    jsonb_build_object(
      'adjustment_id', (SELECT id FROM fix_date_adjustment), 'expected_version', 2,
      'reason', 'Invalid replacement date',
      'replacement', jsonb_build_object(
        'type', 'variation', 'effective_date', 'tomorrow',
        'description', 'Invalid replacement', 'amount_ex_gst', '1.00', 'gst_rate', '0.10'
      ),
      'correlation_key', '91000000-0000-4000-8000-000000000028'
    )::TEXT
  )),
  '22023',
  'supersession rejects a non-canonical replacement date'
);

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.progress_adjustments AS adjustment
    WHERE adjustment.series_id = '90000000-0000-4000-8000-000000000003'
  ),
  1,
  'invalid create dates leave no adjustment rows'
);

SELECT is(
  (
    SELECT adjustment.effective_date = '2026-07-16'::DATE
      AND adjustment.version = 2
    FROM public.progress_adjustments AS adjustment
    WHERE adjustment.id = (SELECT id FROM fix_date_adjustment)
  ),
  true,
  'invalid update dates leave the canonical row unchanged except for its separate successful approval'
);

SELECT is(
  (
    SELECT adjustment.status = 'approved'
      AND adjustment.version = 2
      AND NOT EXISTS (
        SELECT 1 FROM public.progress_adjustments AS replacement
        WHERE replacement.superseded_adjustment_id = adjustment.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.progress_invoice_events AS event
        WHERE event.command_name = 'supersede_progress_adjustment'
          AND event.correlation_key = '91000000-0000-4000-8000-000000000028'
      )
    FROM public.progress_adjustments AS adjustment
    WHERE adjustment.id = (SELECT id FROM fix_date_adjustment)
  ),
  true,
  'invalid supersession date rolls back status, replacement, version, and event state'
);

CREATE TEMP TABLE fix_actor_a AS
SELECT * FROM public.create_progress_invoice_series(
  pg_temp.series_payload('91000000-0000-4000-8000-000000000030')
);

SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000009102';
CREATE TEMP TABLE fix_actor_b AS
SELECT * FROM public.create_progress_invoice_series(
  pg_temp.series_payload('91000000-0000-4000-8000-000000000030')
);

SELECT isnt(
  (SELECT id FROM fix_actor_a),
  (SELECT id FROM fix_actor_b),
  'the same create correlation key is isolated between authenticated actors'
);

SELECT is(
  (
    SELECT count(DISTINCT event.actor_id)::INT = 2
      AND count(DISTINCT event.series_id)::INT = 2
    FROM public.progress_invoice_events AS event
    WHERE event.command_name = 'create_progress_invoice_series'
      AND event.correlation_key = '91000000-0000-4000-8000-000000000030'
  ),
  true,
  'different actors receive independent idempotency events and series'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
