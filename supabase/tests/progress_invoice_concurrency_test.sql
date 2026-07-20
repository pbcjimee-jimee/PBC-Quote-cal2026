CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(6);

DELETE FROM auth.users
WHERE id = '00000000-0000-0000-0000-000000009001';

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000009001',
  'progress-race@example.test',
  now(),
  now()
);

INSERT INTO public.progress_invoice_series (
  id,
  source_type,
  base_contract_ex_gst,
  recipient_name,
  recipient_address,
  site_name,
  site_address,
  default_description,
  created_by,
  updated_by
) VALUES
  (
    '00000000-0000-0000-0000-000000009100',
    'jobber_job',
    1000,
    'Race Builder A',
    '1 Race Street',
    'Race Site A',
    '1 Race Site Street',
    'Progress works',
    '00000000-0000-0000-0000-000000009001',
    '00000000-0000-0000-0000-000000009001'
  ),
  (
    '00000000-0000-0000-0000-000000009101',
    'jobber_job',
    1000,
    'Race Builder B',
    '2 Race Street',
    'Race Site B',
    '2 Race Site Street',
    'Progress works',
    '00000000-0000-0000-0000-000000009001',
    '00000000-0000-0000-0000-000000009001'
  );

INSERT INTO public.progress_payments (
  id,
  series_id,
  source,
  jobber_payment_id,
  created_by,
  updated_by
) VALUES
  (
    '00000000-0000-0000-0000-000000009500',
    '00000000-0000-0000-0000-000000009100',
    'manual',
    NULL,
    '00000000-0000-0000-0000-000000009001',
    '00000000-0000-0000-0000-000000009001'
  ),
  (
    '00000000-0000-0000-0000-000000009501',
    '00000000-0000-0000-0000-000000009100',
    'jobber',
    'jobber-payment-race',
    '00000000-0000-0000-0000-000000009001',
    '00000000-0000-0000-0000-000000009001'
  );

SELECT extensions.dblink_connect(
  'progress_race_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
SELECT extensions.dblink_connect(
  'progress_race_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);

SELECT extensions.dblink_exec('progress_race_a', 'BEGIN');
SELECT extensions.dblink_exec(
  'progress_race_a',
  $$UPDATE public.progress_payments
    SET matched_manual_payment_id = '00000000-0000-0000-0000-000000009500'
    WHERE id = '00000000-0000-0000-0000-000000009501'$$
);

SELECT extensions.dblink_send_query(
  'progress_race_b',
  $$UPDATE public.progress_payments
    SET series_id = '00000000-0000-0000-0000-000000009101'
    WHERE id = '00000000-0000-0000-0000-000000009500'
    RETURNING id::TEXT$$
);

SELECT pg_sleep(0.1);
SELECT extensions.dblink_exec('progress_race_a', 'COMMIT');

CREATE TEMP TABLE progress_race_observation (
  returned_id TEXT,
  error_message TEXT NOT NULL
);

DO $$
DECLARE
  observed_id TEXT;
  observed_error TEXT;
BEGIN
  SELECT result.returned_id
  INTO observed_id
  FROM extensions.dblink_get_result('progress_race_b', false) AS result(returned_id TEXT);

  observed_error := extensions.dblink_error_message('progress_race_b');

  INSERT INTO progress_race_observation (returned_id, error_message)
  VALUES (observed_id, observed_error);
END;
$$;

SELECT ok(
  returned_id IS NULL AND error_message <> 'OK',
  'concurrent reverse-side Manual payment reparent is rejected'
)
FROM progress_race_observation;

SELECT is(
  (
    SELECT series_id
    FROM public.progress_payments
    WHERE id = '00000000-0000-0000-0000-000000009500'
  ),
  '00000000-0000-0000-0000-000000009100'::UUID,
  'concurrent attempt leaves the Manual payment in its original series'
);

SELECT is(
  (
    SELECT matched_manual_payment_id
    FROM public.progress_payments
    WHERE id = '00000000-0000-0000-0000-000000009501'
  ),
  '00000000-0000-0000-0000-000000009500'::UUID,
  'the committed Jobber-to-Manual match remains intact'
);

SELECT extensions.dblink_disconnect('progress_race_a');
SELECT extensions.dblink_disconnect('progress_race_b');

SELECT extensions.dblink_connect(
  'progress_base_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
SELECT extensions.dblink_connect(
  'progress_base_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);

SELECT extensions.dblink_exec('progress_base_a', 'BEGIN');
SELECT extensions.dblink_exec(
  'progress_base_a',
  $$SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000009001'$$
);
SELECT result.id
FROM extensions.dblink(
  'progress_base_a',
  $$SELECT id::TEXT FROM public.create_manual_progress_invoice_series(
    '{
      "source_type":"manual","gst_rate":"0.10","accepted_numbering_base":" Race-Base ",
      "base_contract_ex_gst":"1000.00","recipient_name":"Race A",
      "recipient_company":null,"recipient_address":"1 Race Street",
      "recipient_email":null,"recipient_phone":null,"recipient_abn":null,
      "site_name":"Race Site A","site_address":"1 Race Site Street",
      "default_description":"Progress works","reference":null,
      "correlation_key":"00000000-0000-4000-8000-000000009601"
    }'::jsonb
  )$$
) AS result(id TEXT);

SELECT extensions.dblink_exec('progress_base_b', 'BEGIN');
SELECT extensions.dblink_exec(
  'progress_base_b',
  $$SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000009001'$$
);
SELECT extensions.dblink_send_query(
  'progress_base_b',
  $$SELECT id::TEXT FROM public.create_manual_progress_invoice_series(
      '{
        "source_type":"manual","gst_rate":"0.10","accepted_numbering_base":"race-base",
        "base_contract_ex_gst":"1000.00","recipient_name":"Race B",
        "recipient_company":null,"recipient_address":"2 Race Street",
        "recipient_email":null,"recipient_phone":null,"recipient_abn":null,
        "site_name":"Race Site B","site_address":"2 Race Site Street",
        "default_description":"Progress works","reference":null,
        "correlation_key":"00000000-0000-4000-8000-000000009602"
      }'::jsonb
    )
  $$
);

SELECT pg_sleep(0.1);
SELECT extensions.dblink_exec('progress_base_a', 'COMMIT');

CREATE TEMP TABLE progress_base_race_observation (error_message TEXT NOT NULL);
DO $$
DECLARE
  observed_error TEXT;
BEGIN
  PERFORM * FROM extensions.dblink_get_result('progress_base_b', false) AS result(status TEXT);
  observed_error := extensions.dblink_error_message('progress_base_b');
  PERFORM * FROM extensions.dblink_get_result('progress_base_b', false) AS result(status TEXT);
  INSERT INTO progress_base_race_observation VALUES (observed_error);
END;
$$;

SELECT ok(
  error_message <> 'OK',
  'concurrent normalized numbering-base loser is rejected'
) FROM progress_base_race_observation;

SELECT is(
  (SELECT count(*)::INT FROM public.progress_invoice_series
   WHERE lower(btrim(accepted_numbering_base)) = 'race-base'),
  1,
  'only one concurrent Series owns the normalized numbering base'
);

SELECT is(
  (SELECT count(*)::INT FROM public.progress_invoice_numbering_base_reservations
   WHERE normalized_base = 'race-base' AND state IN ('active', 'permanent')),
  1,
  'only one active/permanent lifetime reservation survives the race'
);

SELECT extensions.dblink_exec('progress_base_b', 'ROLLBACK');
SELECT extensions.dblink_disconnect('progress_base_a');
SELECT extensions.dblink_disconnect('progress_base_b');

SELECT * FROM finish();
