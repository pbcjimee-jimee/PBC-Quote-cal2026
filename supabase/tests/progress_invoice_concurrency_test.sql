CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(3);

DELETE FROM public.progress_payments
WHERE id IN (
  '00000000-0000-0000-0000-000000009500',
  '00000000-0000-0000-0000-000000009501'
);
DELETE FROM public.progress_invoice_series
WHERE id IN (
  '00000000-0000-0000-0000-000000009100',
  '00000000-0000-0000-0000-000000009101'
);
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

DELETE FROM public.progress_payments
WHERE id IN (
  '00000000-0000-0000-0000-000000009500',
  '00000000-0000-0000-0000-000000009501'
);
DELETE FROM public.progress_invoice_series
WHERE id IN (
  '00000000-0000-0000-0000-000000009100',
  '00000000-0000-0000-0000-000000009101'
);
DELETE FROM auth.users
WHERE id = '00000000-0000-0000-0000-000000009001';

SELECT * FROM finish();
