CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(103);

DELETE FROM public.business_invoice_profiles;
DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000008001',
  '00000000-0000-0000-0000-000000008002',
  '00000000-0000-0000-0000-000000008003'
);

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0000-000000008001',
    'progress-profile@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000008002',
    'progress-race-a@example.test',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000008003',
    'progress-race-b@example.test',
    now(),
    now()
  );

CREATE FUNCTION pg_temp.profile_payload(
  requested_legal_name TEXT,
  requested_abn TEXT DEFAULT '12345678901',
  requested_payment_terms INT DEFAULT 14,
  requested_expected_version INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'legal_name', requested_legal_name,
    'abn', requested_abn,
    'business_address', '1 Test Street, Sydney NSW 2000',
    'phone', '0400000000',
    'email', 'accounts@example.test',
    'bank_name', 'Test Bank',
    'bsb', '000-000',
    'bank_account_name', 'Paint Buddy & Co',
    'bank_account_number', '00000000',
    'gst_rate', '0.10',
    'business_timezone', 'Australia/Sydney',
    'default_payment_term_days', requested_payment_terms,
    'expected_version', requested_expected_version
  ));
$$;

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

SET ROLE anon;
SELECT is(
  pg_temp.capture_sqlstate(
    $$SELECT * FROM public.save_business_invoice_profile('{}'::JSONB)$$
  ),
  '42501',
  'anon cannot execute the profile RPC'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT is(
  pg_temp.capture_sqlstate(
    $$SELECT * FROM public.save_business_invoice_profile('{}'::JSONB)$$
  ),
  '28000',
  'an authenticated role without auth.uid() is rejected'
);
RESET ROLE;

SET ROLE service_role;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000008001',
  false
);
SELECT is(
  pg_temp.capture_sqlstate(
    $$SELECT * FROM public.save_business_invoice_profile('{}'::JSONB)$$
  ),
  '42501',
  'service_role cannot execute the authenticated profile RPC'
);
RESET ROLE;

SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000008001',
  false
);
SELECT is(
  pg_temp.capture_sqlstate(
    $$INSERT INTO public.business_invoice_profiles (
        legal_name,
        trading_name,
        abn,
        contractor_licence,
        business_address,
        phone,
        email,
        bank_name,
        bsb,
        bank_account_name,
        bank_account_number,
        created_by,
        updated_by
      ) VALUES (
        'Direct Write',
        '',
        '12345678901',
        '',
        '1 Test Street',
        '0400000000',
        'accounts@example.test',
        'Test Bank',
        '000-000',
        'Direct Write',
        '00000000',
        '00000000-0000-0000-0000-000000008001',
        '00000000-0000-0000-0000-000000008001'
      )$$
  ),
  '42501',
  'authenticated users cannot write the profile table directly'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Explicit Null Version')
        || jsonb_build_object('expected_version', NULL)
      )::TEXT
    )
  ),
  '22023',
  'first save rejects expected_version whenever the key is present, including JSON null'
);

SELECT is(
  (SELECT count(*)::INT FROM public.business_invoice_profiles),
  0,
  'an explicit-null first-save attempt leaves the singleton empty'
);

SELECT lives_ok(
  format(
    'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
    pg_temp.profile_payload('Paint Buddy & Co Pty Ltd')::TEXT
  ),
  'an authenticated user can create the singleton profile'
);

SELECT is(
  (SELECT count(*)::INT FROM public.business_invoice_profiles),
  1,
  'first save creates exactly one profile'
);

SELECT is(
  (SELECT version FROM public.business_invoice_profiles),
  1,
  'first save starts at version one'
);

SELECT is(
  (
    SELECT created_by = '00000000-0000-0000-0000-000000008001'::UUID
      AND updated_by = '00000000-0000-0000-0000-000000008001'::UUID
    FROM public.business_invoice_profiles
  ),
  true,
  'first save derives both actor fields from auth.uid()'
);

SELECT is(
  (
    SELECT trading_name = '' AND contractor_licence = ''
    FROM public.business_invoice_profiles
  ),
  true,
  'missing optional profile text normalizes to empty strings'
);

SELECT is(
  (
    SELECT gst_rate
    FROM public.save_business_invoice_profile(
      pg_temp.profile_payload('Paint Buddy & Co Updated', '12345678901', 21, 1)
    )
  ),
  '0.10',
  'profile updates return GST as canonical v1 text'
);

SELECT is(
  (SELECT version FROM public.business_invoice_profiles),
  2,
  'a matching expected version increments the profile version'
);

SELECT is(
  (SELECT legal_name FROM public.business_invoice_profiles),
  'Paint Buddy & Co Updated',
  'a matching expected version updates profile values'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('legal_name', jsonb_build_object('nested', 'object'))
      )::TEXT
    )
  ),
  '22023',
  'required text rejects a JSON object before text extraction'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('email', jsonb_build_array('not', 'email'))
      )::TEXT
    )
  ),
  '22023',
  'required text rejects a JSON array before text extraction'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('gst_rate', 0.10::NUMERIC)
      )::TEXT
    )
  ),
  '22023',
  'GST rejects a JSON number even when numerically equal to 0.10'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('default_payment_term_days', '14')
      )::TEXT
    )
  ),
  '22023',
  'payment terms reject a numeric-looking JSON string'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('default_payment_term_days', 14.5)
      )::TEXT
    )
  ),
  '22023',
  'payment terms reject a fractional JSON number'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('trading_name', jsonb_build_object('bad', true))
      )::TEXT
    )
  ),
  '22023',
  'optional trading name accepts only JSON string or null'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('contractor_licence', jsonb_build_array('bad'))
      )::TEXT
    )
  ),
  '22023',
  'optional contractor licence accepts only JSON string or null'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('business_timezone', 10)
      )::TEXT
    )
  ),
  '22023',
  'business timezone rejects non-string JSON values'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('email', 'not-an-email')
      )::TEXT
    )
  ),
  '23514',
  'email content is validated at the database boundary'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('email', '.alice@example.com')
      )::TEXT
    )
  ),
  '23514',
  'email rejects a leading local-part dot exactly like Zod v4'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('email', 'a..b@example.com')
      )::TEXT
    )
  ),
  '23514',
  'email rejects consecutive local-part dots exactly like Zod v4'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('email', 'alice@-example.com')
      )::TEXT
    )
  ),
  '23514',
  'email rejects a leading-hyphen domain label exactly like Zod v4'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('email', 'alice@example.c')
      )::TEXT
    )
  ),
  '23514',
  'email rejects a single-letter TLD exactly like Zod v4'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('email', 'alice@example.c0m')
      )::TEXT
    )
  ),
  '23514',
  'email rejects a non-alpha TLD exactly like Zod v4'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('email', 'o''connor+tag@example.com')
      )::TEXT
    )
  ),
  'NO_ERROR',
  'email accepts an apostrophe and plus tag exactly like Zod v4'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('email', 'user@example-.com')
      )::TEXT
    )
  ),
  'NO_ERROR',
  'email preserves Zod v4 acceptance of a trailing-hyphen domain label'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('email', 'A_B+C@0-.Technology')
      )::TEXT
    )
  ),
  'NO_ERROR',
  'email preserves Zod v4 acceptance of uppercase, underscore, and an alpha TLD'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('phone', '   ')
      )::TEXT
    )
  ),
  '23514',
  'required text rejects whitespace-only content'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('legal_name', repeat('L', 161))
      )::TEXT
    )
  ),
  '23514',
  'legal name enforces the approved maximum length'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('expected_version', '2')
      )::TEXT
    )
  ),
  '22023',
  'expected_version rejects a numeric-looking JSON string'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('expected_version', 2.5)
      )::TEXT
    )
  ),
  '22023',
  'expected_version rejects a fractional JSON number'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('expected_version', jsonb_build_array(2))
      )::TEXT
    )
  ),
  '22023',
  'expected_version rejects a JSON array'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('bank_account_number', repeat('1', 33))
      )::TEXT
    )
  ),
  '23514',
  'bank account number enforces the approved maximum length'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '12345678901', 14, 2)
        || jsonb_build_object('business_timezone', 'UTC')
      )::TEXT
    )
  ),
  '23514',
  'business timezone enforces the fixed Australia/Sydney value'
);

SELECT is(
  (
    SELECT version = 2
      AND legal_name = 'Paint Buddy & Co Updated'
      AND email = 'accounts@example.test'
      AND default_payment_term_days = 21
    FROM public.business_invoice_profiles
  ),
  true,
  'all rejected type and content probes leave the profile and version unchanged'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      pg_temp.profile_payload('Stale Overwrite', '12345678901', 14, 1)::TEXT
    )
  ),
  'P0001',
  'a stale expected version is rejected'
);

SELECT is(
  (SELECT version FROM public.business_invoice_profiles),
  2,
  'a stale write leaves the current version unchanged'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      pg_temp.profile_payload('Missing Version')::TEXT
    )
  ),
  '22023',
  'an existing profile requires expected_version'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      pg_temp.profile_payload('Bad ABN', '1234', 14, 2)::TEXT
    )
  ),
  '23514',
  'the database ABN constraint rejects malformed values'
);

SELECT is(
  (SELECT legal_name FROM public.business_invoice_profiles),
  'Paint Buddy & Co Updated',
  'a malformed ABN rolls the profile update back'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      pg_temp.profile_payload('Bad Terms', '12345678901', 366, 2)::TEXT
    )
  ),
  '23514',
  'the database payment-term constraint rejects out-of-range values'
);

SELECT is(
  (SELECT default_payment_term_days FROM public.business_invoice_profiles),
  21,
  'invalid payment terms roll the profile update back'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Forged Actor', '12345678901', 14, 2)
        || jsonb_build_object(
          'actor_id', '00000000-0000-0000-0000-000000008003'
        )
      )::TEXT
    )
  ),
  '22023',
  'forged actor keys are rejected as unknown input'
);

SELECT is(
  (SELECT updated_by FROM public.business_invoice_profiles),
  '00000000-0000-0000-0000-000000008001'::UUID,
  'a forged actor attempt cannot change the stored actor'
);

SELECT is(
  (SELECT count(*)::INT FROM public.progress_invoice_events),
  0,
  'profile saves do not append series events'
);
RESET ROLE;

DELETE FROM public.business_invoice_profiles;

SELECT extensions.dblink_connect(
  'progress_profile_race_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
SELECT extensions.dblink_connect(
  'progress_profile_race_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);

SELECT extensions.dblink_exec('progress_profile_race_a', 'BEGIN');
SELECT extensions.dblink_exec(
  'progress_profile_race_a',
  $$SET LOCAL ROLE authenticated$$
);
SELECT extensions.dblink_exec(
  'progress_profile_race_a',
  $$SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000008002'$$
);
SELECT is(
  extensions.dblink_exec(
    'progress_profile_race_a',
    $remote$
      DO $body$
      BEGIN
        PERFORM *
        FROM public.save_business_invoice_profile(
          jsonb_build_object(
            'legal_name', 'Concurrent Winner',
            'abn', '12345678901',
            'business_address', '2 Race Street, Sydney NSW 2000',
            'phone', '0400000000',
            'email', 'race-a@example.test',
            'bank_name', 'Test Bank',
            'bsb', '000-000',
            'bank_account_name', 'Concurrent Winner',
            'bank_account_number', '00000000',
            'gst_rate', '0.10',
            'business_timezone', 'Australia/Sydney',
            'default_payment_term_days', 14
          )
        );
      END;
      $body$;
    $remote$
  ),
  'DO',
  'the first concurrent session creates version one'
);

SELECT extensions.dblink_exec('progress_profile_race_b', 'BEGIN');
SELECT extensions.dblink_exec(
  'progress_profile_race_b',
  $$SET LOCAL ROLE authenticated$$
);
SELECT extensions.dblink_exec(
  'progress_profile_race_b',
  $$SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000008003'$$
);
SELECT extensions.dblink_send_query(
  'progress_profile_race_b',
  $$SELECT id::TEXT, version
    FROM public.save_business_invoice_profile(
      jsonb_build_object(
        'legal_name', 'Concurrent Loser',
        'abn', '10987654321',
        'business_address', '3 Race Street, Sydney NSW 2000',
        'phone', '0400000001',
        'email', 'race-b@example.test',
        'bank_name', 'Test Bank',
        'bsb', '000-000',
        'bank_account_name', 'Concurrent Loser',
        'bank_account_number', '00000001',
        'gst_rate', '0.10',
        'business_timezone', 'Australia/Sydney',
        'default_payment_term_days', 14
      )
    )$$
);

SELECT pg_sleep(0.1);
SELECT is(
  extensions.dblink_is_busy('progress_profile_race_b'),
  1,
  'the second first-save session waits on the singleton transaction lock'
);

SELECT extensions.dblink_exec('progress_profile_race_a', 'COMMIT');

CREATE TEMP TABLE progress_profile_race_b_observation (
  returned_id TEXT,
  returned_version INT,
  error_message TEXT NOT NULL
);

DO $$
DECLARE
  observed_id TEXT;
  observed_version INT;
  observed_error TEXT;
BEGIN
  SELECT result.profile_id, result.profile_version
  INTO observed_id, observed_version
  FROM extensions.dblink_get_result('progress_profile_race_b', false)
    AS result(profile_id TEXT, profile_version INT);

  observed_error := extensions.dblink_error_message('progress_profile_race_b');

  PERFORM result.profile_id, result.profile_version
  FROM extensions.dblink_get_result('progress_profile_race_b', false)
    AS result(profile_id TEXT, profile_version INT);

  INSERT INTO progress_profile_race_b_observation (
    returned_id,
    returned_version,
    error_message
  ) VALUES (
    observed_id,
    observed_version,
    observed_error
  );
END;
$$;

SELECT ok(
  returned_id IS NULL
    AND error_message LIKE '%PROGRESS_EXPECTED_VERSION_REQUIRED%',
  'the losing concurrent first-save observes the committed singleton and fails safely'
)
FROM progress_profile_race_b_observation;

SELECT extensions.dblink_exec('progress_profile_race_b', 'ROLLBACK');

SELECT is(
  (SELECT count(*)::INT FROM public.business_invoice_profiles),
  1,
  'concurrent first saves leave exactly one singleton row'
);

SELECT is(
  (
    SELECT legal_name = 'Concurrent Winner'
      AND created_by = '00000000-0000-0000-0000-000000008002'::UUID
    FROM public.business_invoice_profiles
  ),
  true,
  'the committed concurrent winner retains its value and authenticated actor'
);

SELECT extensions.dblink_disconnect('progress_profile_race_a');
SELECT extensions.dblink_disconnect('progress_profile_race_b');

CREATE FUNCTION pg_temp.series_payload(
  requested_source_type TEXT,
  requested_correlation_key UUID,
  requested_quote_id UUID DEFAULT NULL,
  requested_base TEXT DEFAULT '1000.00'
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'source_type', requested_source_type,
    'quote_id', requested_quote_id,
    'base_contract_ex_gst', requested_base,
    'gst_rate', '0.10',
    'recipient_name', 'Task 5 Builder',
    'recipient_company', 'Task 5 Builder Pty Ltd',
    'recipient_address', '1 Billing Street, Sydney NSW 2000',
    'recipient_email', 'billing@example.test',
    'recipient_phone', '0400000000',
    'recipient_abn', '12345678901',
    'site_name', 'Task 5 Site',
    'site_address', '2 Site Street, Sydney NSW 2000',
    'default_description', 'Progress painting works',
    'reference', 'TASK-5',
    'correlation_key', requested_correlation_key
  ));
$$;

INSERT INTO auth.users (id, email, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000008101', 'progress-series@example.test', now(), now());

INSERT INTO public.quotes (
  id, customer_name, customer_address, working_days,
  formula1_total, formula2_total, formula3_total, formula4_total, formula5_total,
  selected_min, selected_max, interior_selected_min, interior_selected_max,
  exterior_selected_min, exterior_selected_max, roof_selected_min, roof_selected_max,
  subtotal, final_total, pricing_settings_snapshot, created_by
) VALUES (
  '00000000-0000-0000-0000-000000008110', 'Snapshot Quote', '3 Quote Street', 1,
  1000, 1000, 1000, 1000, 1000, 1, 1, 1, 1, 1, 1, 1, 1,
  1000, 1100, '{}'::JSONB, '00000000-0000-0000-0000-000000008101'
);

RESET request.jwt.claim.sub;

-- Task 5 assertion 01
SELECT is(
  pg_temp.capture_sqlstate(
    format('SELECT * FROM public.create_progress_invoice_series(%L::JSONB)',
      pg_temp.series_payload('jobber_job', '81000000-0000-4000-8000-000000000001')::TEXT)
  ),
  '28000',
  'series creation requires auth.uid even when the function name is known'
);

-- Task 5 assertion 02
SELECT ok(
  NOT has_function_privilege('anon', 'public.create_progress_invoice_series(jsonb)', 'EXECUTE'),
  'anon cannot execute the create-series RPC'
);

-- Task 5 assertion 03
SELECT ok(
  NOT has_function_privilege('service_role', 'public.create_progress_invoice_series(jsonb)', 'EXECUTE'),
  'service_role is not an alternate series write surface'
);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008101';

CREATE TEMP TABLE task5_standalone_result AS
SELECT * FROM public.create_progress_invoice_series(
  pg_temp.series_payload('jobber_job', '81000000-0000-4000-8000-000000000001')
);

-- Task 5 assertion 04
SELECT ok(
  id IS NOT NULL AND version = 1,
  'standalone series creation returns a versioned identity'
) FROM task5_standalone_result;

-- Task 5 assertion 05
SELECT is(
  (
    SELECT series.current_adjusted_contract_ex_gst = 1000
      AND series.current_adjusted_contract_gst = 100
      AND series.current_adjusted_contract_inc_gst = 1100
      AND series.current_unclaimed_inc_gst = 1100
    FROM public.progress_invoice_series series
    JOIN task5_standalone_result result ON result.id = series.id
  ),
  true,
  'new series initializes its transactionally maintained read model'
);

-- Task 5 assertion 06
SELECT is(
  (
    SELECT retry.id = original.id AND retry.version = original.version
    FROM public.create_progress_invoice_series(
      pg_temp.series_payload('jobber_job', '81000000-0000-4000-8000-000000000001')
    ) retry
    CROSS JOIN task5_standalone_result original
  ),
  true,
  'an exact create retry returns the exact original result'
);

-- Task 5 assertion 07
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.progress_invoice_events event
    JOIN task5_standalone_result result ON result.id = event.series_id
    WHERE event.command_name = 'create_progress_invoice_series'
  ),
  1,
  'an exact create retry does not append a duplicate event'
);

-- Task 5 assertion 08
SELECT is(
  pg_temp.capture_sqlstate(
    format('SELECT * FROM public.create_progress_invoice_series(%L::JSONB)',
      pg_temp.series_payload('jobber_job', '81000000-0000-4000-8000-000000000001', NULL, '1001.00')::TEXT)
  ),
  'P0001',
  'a reused owner-global create key with another fingerprint is rejected'
);

-- Task 5 assertion 09
SELECT is(
  pg_temp.capture_sqlstate(
    format('SELECT * FROM public.create_progress_invoice_series(%L::JSONB)',
      (pg_temp.series_payload('jobber_job', '81000000-0000-4000-8000-000000000002')
        || jsonb_build_object('raw_jobber_response', jsonb_build_object('private', true)))::TEXT)
  ),
  '22023',
  'raw Jobber candidates cannot cross the create-series database boundary'
);

-- Task 5 assertion 10
SELECT is(
  pg_temp.capture_sqlstate(
    format('SELECT * FROM public.create_progress_invoice_series(%L::JSONB)',
      pg_temp.series_payload('pbc_quote', '81000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000008119')::TEXT)
  ),
  'P0001',
  'a PBC-quote series requires an existing locked Quote row'
);

CREATE TEMP TABLE task5_quote_result AS
SELECT * FROM public.create_progress_invoice_series(
  pg_temp.series_payload(
    'pbc_quote',
    '81000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000008110'
  )
);

-- Task 5 assertion 11
SELECT is(
  (
    SELECT series.quote_id = '00000000-0000-0000-0000-000000008110'::UUID
      AND series.source_type = 'pbc_quote'
      AND series.base_contract_ex_gst = 1000
    FROM public.progress_invoice_series series
    JOIN task5_quote_result result ON result.id = series.id
  ),
  true,
  'PBC creation snapshots the accepted quote-linked values and provenance'
);

RESET ROLE;
UPDATE public.quotes SET subtotal = 2400, final_total = 2640
WHERE id = '00000000-0000-0000-0000-000000008110';
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008101';

-- Task 5 assertion 12
SELECT is(
  (
    SELECT series.base_contract_ex_gst
    FROM public.progress_invoice_series series
    JOIN task5_quote_result result ON result.id = series.id
  ),
  1000.00::NUMERIC,
  'later Quote edits cannot change the accepted series amount snapshot'
);

-- Task 5 assertion 13
SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.update_progress_invoice_series(%L::JSONB)',
      jsonb_build_object(
        'series_id', (SELECT id FROM task5_quote_result),
        'expected_version', 1,
        'source_type', 'jobber_invoice',
        'correlation_key', '81000000-0000-4000-8000-000000000005'
      )::TEXT
    )
  ),
  '22023',
  'source provenance is rejected as an unknown direct RPC update key'
);

-- Task 5 assertion 14
SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.update_progress_invoice_series(%L::JSONB)',
      jsonb_build_object(
        'series_id', (SELECT id FROM task5_quote_result),
        'expected_version', 1,
        'quote_id', NULL,
        'correlation_key', '81000000-0000-4000-8000-000000000006'
      )::TEXT
    )
  ),
  '22023',
  'the original Quote link cannot be manually cleared through the RPC'
);

-- Task 5 assertion 15
SELECT is(
  (
    SELECT conflict
      AND version = 1
      AND current ->> 'recipient_name' = 'Task 5 Builder'
      AND current ->> 'version' = '1'
    FROM public.update_progress_invoice_series(jsonb_build_object(
      'series_id', (SELECT id FROM task5_quote_result),
      'expected_version', 2,
      'recipient_name', 'Stale Builder',
      'correlation_key', '81000000-0000-4000-8000-000000000007'
    ))
  ),
  true,
  'stale series updates return the current safe DTO and do not overwrite'
);

CREATE TEMP TABLE task5_quote_update AS
SELECT * FROM public.update_progress_invoice_series(jsonb_build_object(
  'series_id', (SELECT id FROM task5_quote_result),
  'expected_version', 1,
  'recipient_name', 'Edited Builder',
  'recipient_company', 'Edited Builder Pty Ltd',
  'recipient_address', '4 Edited Billing Street',
  'recipient_email', 'edited@example.test',
  'recipient_phone', '0411111111',
  'recipient_abn', '10987654321',
  'site_name', 'Edited Site',
  'site_address', '5 Edited Site Street',
  'correlation_key', '81000000-0000-4000-8000-000000000008'
));

-- Task 5 assertion 16
SELECT is(
  (
    SELECT NOT update_result.conflict
      AND update_result.version = 2
      AND series.recipient_name = 'Edited Builder'
      AND series.recipient_company = 'Edited Builder Pty Ltd'
      AND series.recipient_abn = '10987654321'
      AND series.site_name = 'Edited Site'
    FROM task5_quote_update update_result
    JOIN public.progress_invoice_series series ON series.id = update_result.id
  ),
  true,
  'recipient, company, ABN, contact, and site snapshots remain explicitly editable'
);

-- Task 5 assertion 17
SELECT is(
  (
    SELECT series.source_type = 'pbc_quote'
      AND series.quote_id = '00000000-0000-0000-0000-000000008110'::UUID
    FROM public.progress_invoice_series series
    JOIN task5_quote_result result ON result.id = series.id
  ),
  true,
  'editable snapshot updates preserve immutable creation provenance'
);

RESET ROLE;
DELETE FROM public.quotes WHERE id = '00000000-0000-0000-0000-000000008110';

-- Task 5 assertion 18
SELECT is(
  (
    SELECT series.quote_id IS NULL AND series.source_type = 'pbc_quote'
    FROM public.progress_invoice_series series
    JOIN task5_quote_result result ON result.id = series.id
  ),
  true,
  'ON DELETE SET NULL is the intentional exception that preserves pbc_quote provenance'
);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008101';

-- Task 5 assertion 19
SELECT is(
  pg_temp.capture_sqlstate(
    $$INSERT INTO public.progress_invoice_series (
      source_type, base_contract_ex_gst, recipient_name, recipient_address,
      site_name, site_address, default_description, created_by, updated_by
    ) VALUES (
      'jobber_job', 1, 'Bypass', 'Bypass', 'Bypass', 'Bypass', 'Bypass',
      '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101'
    )$$
  ),
  '42501',
  'authenticated callers cannot bypass audited RPCs with direct table writes'
);

RESET ROLE;
INSERT INTO public.progress_adjustments (
  series_id, type, status, effective_date, display_order, description,
  amount_ex_gst, created_by, updated_by
) VALUES
  ((SELECT id FROM task5_standalone_result), 'variation', 'rejected', '2026-07-16', 50, 'Rejected', 500,
   '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101'),
  ((SELECT id FROM task5_standalone_result), 'variation', 'void', '2026-07-16', 51, 'Void', 500,
   '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101');
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008101';

CREATE TEMP TABLE task5_variation AS
SELECT * FROM public.create_progress_adjustment(jsonb_build_object(
  'series_id', (SELECT id FROM task5_standalone_result),
  'type', 'variation', 'effective_date', '2026-07-16',
  'description', 'Approved variation', 'amount_ex_gst', '100.00', 'gst_rate', '0.10',
  'correlation_key', '81000000-0000-4000-8000-000000000010'
));

-- Task 5 assertion 20
SELECT is(
  (
    SELECT result.version = 1 AND adjustment.status = 'draft' AND adjustment.amount_ex_gst = 100
    FROM task5_variation result JOIN public.progress_adjustments adjustment ON adjustment.id = result.id
  ),
  true,
  'Variation creation stores a positive Ex GST Draft amount'
);

-- Task 5 assertion 21
SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.create_progress_adjustment(%L::JSONB)',
    jsonb_build_object(
      'series_id', (SELECT id FROM task5_standalone_result), 'type', 'credit',
      'effective_date', '2026-07-16', 'description', 'Negative credit',
      'amount_ex_gst', '-1.00', 'gst_rate', '0.10',
      'correlation_key', '81000000-0000-4000-8000-000000000011'
    )::TEXT
  )),
  '23514',
  'adjustment amounts are always positive and type supplies the sign'
);

CREATE TEMP TABLE task5_variation_approval AS
SELECT * FROM public.approve_progress_adjustment(jsonb_build_object(
  'adjustment_id', (SELECT id FROM task5_variation), 'expected_version', 1,
  'correlation_key', '81000000-0000-4000-8000-000000000012'
));

-- Task 5 assertion 22
SELECT is(
  (
    SELECT result.version = 2 AND adjustment.status = 'approved'
    FROM task5_variation_approval result JOIN public.progress_adjustments adjustment ON adjustment.id = result.id
  ),
  true,
  'a Draft Variation can be approved transactionally'
);

-- Task 5 assertion 23
SELECT is(
  (
    SELECT series.current_adjusted_contract_ex_gst = 1100
      AND series.current_adjusted_contract_gst = 110
      AND series.current_adjusted_contract_inc_gst = 1210
    FROM public.progress_invoice_series series JOIN task5_standalone_result result ON result.id = series.id
  ),
  true,
  'only Approved adjustments affect the read model; rejected and void rows are excluded'
);

-- Task 5 assertion 24
SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.update_progress_adjustment_draft(%L::JSONB)',
    jsonb_build_object(
      'adjustment_id', (SELECT id FROM task5_variation), 'expected_version', 2,
      'amount_ex_gst', '101.00',
      'correlation_key', '81000000-0000-4000-8000-000000000013'
    )::TEXT
  )),
  '55000',
  'Approved adjustments are immutable through the public RPC'
);

CREATE TEMP TABLE task5_credit AS
SELECT * FROM public.create_progress_adjustment(jsonb_build_object(
  'series_id', (SELECT id FROM task5_standalone_result),
  'type', 'credit', 'effective_date', '2026-07-16',
  'description', 'Approved credit', 'amount_ex_gst', '50.00', 'gst_rate', '0.10',
  'correlation_key', '81000000-0000-4000-8000-000000000014'
));

-- Task 5 assertion 25
SELECT ok(
  (SELECT id IS NOT NULL AND version = 1 FROM task5_credit),
  'Credit creation also stores a positive Ex GST Draft amount'
);

-- Task 5 assertion 26
SELECT is(
  (
    SELECT conflict
      AND version = 1
      AND current ->> 'status' = 'draft'
      AND current ->> 'amount_ex_gst' = '50.00'
    FROM public.update_progress_adjustment_draft(jsonb_build_object(
      'adjustment_id', (SELECT id FROM task5_credit), 'expected_version', 2,
      'description', 'Stale credit',
      'correlation_key', '81000000-0000-4000-8000-000000000015'
    ))
  ),
  true,
  'stale adjustment edits return the current safe adjustment DTO'
);

SELECT * INTO TEMP TABLE task5_credit_approval
FROM public.approve_progress_adjustment(jsonb_build_object(
  'adjustment_id', (SELECT id FROM task5_credit), 'expected_version', 1,
  'correlation_key', '81000000-0000-4000-8000-000000000016'
));

-- Task 5 assertion 27
SELECT is(
  (
    SELECT series.current_adjusted_contract_ex_gst = 1050
      AND series.current_adjusted_contract_gst = 105
      AND series.current_adjusted_contract_inc_gst = 1155
    FROM public.progress_invoice_series series JOIN task5_standalone_result result ON result.id = series.id
  ),
  true,
  'an Approved Credit reduces the adjusted contract by its positive amount'
);

CREATE TEMP TABLE task5_over_credit AS
SELECT * FROM public.create_progress_adjustment(jsonb_build_object(
  'series_id', (SELECT id FROM task5_standalone_result),
  'type', 'credit', 'effective_date', '2026-07-16',
  'description', 'Over-claimed credit', 'amount_ex_gst', '200.00', 'gst_rate', '0.10',
  'correlation_key', '81000000-0000-4000-8000-000000000017'
));

RESET ROLE;
UPDATE public.progress_invoice_series SET
  jobber_account_id = 'task5-account', jobber_invoice_id = 'task5-invoice',
  accepted_numbering_base = 'INV-TASK5', jobber_link_locked_at = now()
WHERE id = (SELECT id FROM task5_standalone_result);

INSERT INTO public.progress_claims (
  id, series_id, sequence, kind, suffix, tax_invoice_number, status,
  original_issued_at, created_by, updated_by
) VALUES (
  '00000000-0000-0000-0000-000000008130', (SELECT id FROM task5_standalone_result),
  1, 'progress', 'P01', 'INV-TASK5-P01', 'draft', NULL,
  '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101'
);

INSERT INTO public.progress_claim_revisions (
  id, claim_id, revision_number, state, input_mode, authoritative_current_claim_inc_gst,
  issue_date, due_date, description, supplier_profile_version, supplier_legal_name,
  supplier_trading_name, supplier_abn, supplier_contractor_licence, supplier_address,
  supplier_phone, supplier_email, supplier_bank_name, supplier_bsb,
  supplier_bank_account_name, supplier_bank_account_number, supplier_default_payment_term_days,
  recipient_name, recipient_address, site_name, site_address, jobber_account_id,
  jobber_invoice_id, original_jobber_invoice_number, observed_jobber_invoice_number,
  accepted_numbering_base, adjusted_contract_ex_gst, adjusted_contract_gst,
  adjusted_contract_inc_gst, cumulative_target_ex_gst, cumulative_target_gst,
  cumulative_target_inc_gst, current_claim_ex_gst, current_claim_gst, current_claim_inc_gst,
  cumulative_percentage, remaining_ex_gst, remaining_gst, remaining_inc_gst,
  calculation_policy_version, edit_classification, financial_snapshot_hash, created_by
) VALUES (
  '00000000-0000-0000-0000-000000008131', '00000000-0000-0000-0000-000000008130',
  1, 'draft', 'current_claim_amount', 990, '2026-07-16', '2026-07-30', 'Issued works',
  1, 'Paint Buddy & Co Pty Ltd', 'Paint Buddy & Co', '12345678901', '', '1 Supplier Street',
  '0400000000', 'accounts@example.test', 'Bank', '000-000', 'Paint Buddy & Co', '00000000', 14,
  'Task 5 Builder', '1 Billing Street', 'Task 5 Site', '2 Site Street', 'task5-account',
  'task5-invoice', 'INV-TASK5', 'INV-TASK5', 'INV-TASK5', 1050, 105, 1155,
  900, 90, 990, 900, 90, 990, 85.714286, 150, 15, 165,
  'v1', 'clerical', repeat('a', 64), '00000000-0000-0000-0000-000000008101'
);

UPDATE public.progress_claims SET
  current_revision_id = '00000000-0000-0000-0000-000000008131',
  status = 'issued', original_issued_at = now()
WHERE id = '00000000-0000-0000-0000-000000008130';

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008101';
SELECT * INTO TEMP TABLE task5_before_failed_credit
FROM public.progress_invoice_series WHERE id = (SELECT id FROM task5_standalone_result);

-- Task 5 assertion 28
SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.approve_progress_adjustment(%L::JSONB)',
    jsonb_build_object(
      'adjustment_id', (SELECT id FROM task5_over_credit), 'expected_version', 1,
      'correlation_key', '81000000-0000-4000-8000-000000000018'
    )::TEXT
  )),
  'P0001',
  'an over-claimed Credit approval fails atomically with reconciliation required'
);

-- Task 5 assertion 29
SELECT is(
  (
    SELECT adjustment.status = 'draft' AND adjustment.version = 1
    FROM public.progress_adjustments adjustment JOIN task5_over_credit result ON result.id = adjustment.id
  ),
  true,
  'the rejected over-claimed Credit remains Draft at its prior version'
);

-- Task 5 assertion 30
SELECT is(
  (
    SELECT series.status = before.status
      AND series.version = before.version
      AND series.current_adjusted_contract_ex_gst = before.current_adjusted_contract_ex_gst
      AND series.current_claimed_ex_gst = before.current_claimed_ex_gst
      AND series.current_unclaimed_ex_gst = before.current_unclaimed_ex_gst
    FROM public.progress_invoice_series series
    CROSS JOIN task5_before_failed_credit before
    WHERE series.id = before.id
  ),
  true,
  'failed Credit approval rolls back series status, version, and cached read model'
);

-- Task 5 assertion 31
SELECT is(
  (
    SELECT count(*)::INT FROM public.progress_invoice_events event
    WHERE event.series_id = (SELECT id FROM task5_standalone_result)
      AND event.command_name = 'approve_progress_adjustment'
      AND event.correlation_key = '81000000-0000-4000-8000-000000000018'
  ),
  0,
  'failed Credit approval leaves no audit or idempotency result'
);

-- Task 5 assertion 32
SELECT is(
  pg_temp.capture_sqlstate(format(
    'SELECT * FROM public.supersede_progress_adjustment(%L::JSONB)',
    jsonb_build_object(
      'adjustment_id', (SELECT id FROM task5_variation), 'expected_version', 2,
      'reason', ' ',
      'replacement', jsonb_build_object(
        'type', 'variation', 'effective_date', '2026-07-16',
        'description', 'Corrected variation', 'amount_ex_gst', '120.00', 'gst_rate', '0.10'
      ),
      'correlation_key', '81000000-0000-4000-8000-000000000019'
    )::TEXT
  )),
  '23514',
  'an adjustment correction requires a non-empty reason'
);

CREATE TEMP TABLE task5_supersession AS
SELECT * FROM public.supersede_progress_adjustment(jsonb_build_object(
  'adjustment_id', (SELECT id FROM task5_variation), 'expected_version', 2,
  'reason', 'Correct approved amount',
  'replacement', jsonb_build_object(
    'type', 'variation', 'effective_date', '2026-07-16',
    'description', 'Corrected variation', 'amount_ex_gst', '120.00', 'gst_rate', '0.10'
  ),
  'correlation_key', '81000000-0000-4000-8000-000000000020'
));

-- Task 5 assertion 33
SELECT ok(
  (SELECT replacement_id IS NOT NULL AND version = 3 FROM task5_supersession),
  'superseding correction creates a linked replacement and advances the original version'
);

-- Task 5 assertion 34
SELECT is(
  (
    SELECT adjustment.status = 'superseded'
      AND adjustment.reason = 'Correct approved amount'
      AND adjustment.version = 3
    FROM public.progress_adjustments adjustment JOIN task5_variation source ON source.id = adjustment.id
  ),
  true,
  'the original Approved adjustment becomes immutable Superseded evidence'
);

-- Task 5 assertion 35
SELECT is(
  (
    SELECT replacement.status = 'approved'
      AND replacement.superseded_adjustment_id = source.id
      AND replacement.reason = 'Correct approved amount'
      AND replacement.amount_ex_gst = 120
    FROM task5_supersession result
    JOIN public.progress_adjustments replacement ON replacement.id = result.replacement_id
    JOIN task5_variation source ON true
  ),
  true,
  'the replacement is linked, reasoned, Approved, and preserves its own amount snapshot'
);

-- Task 5 assertion 36
SELECT is(
  (
    SELECT series.current_adjusted_contract_ex_gst = 1070
      AND series.current_claimed_ex_gst = 900
      AND series.current_unclaimed_ex_gst = 170
      AND series.current_adjusted_contract_inc_gst = 1177
    FROM public.progress_invoice_series series JOIN task5_standalone_result result ON result.id = series.id
  ),
  true,
  'supersession recalculates from Approved adjustments and Current claim revisions only'
);

RESET ROLE;
INSERT INTO public.progress_invoice_series (
  id, source_type, jobber_account_id, jobber_invoice_id, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description,
  created_by, updated_by
) VALUES (
  '00000000-0000-0000-0000-000000008140', 'jobber_invoice', 'unique-account', 'unique-invoice', 1,
  'Unique', 'Unique', 'Unique', 'Unique', 'Unique',
  '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101'
);

-- Task 5 assertion 37
SELECT is(
  pg_temp.capture_sqlstate($sql$
    INSERT INTO public.progress_invoice_series (
      source_type, jobber_account_id, jobber_invoice_id, base_contract_ex_gst,
      recipient_name, recipient_address, site_name, site_address, default_description,
      created_by, updated_by
    ) VALUES (
      'jobber_invoice', 'unique-account', 'unique-invoice', 1,
      'Duplicate', 'Duplicate', 'Duplicate', 'Duplicate', 'Duplicate',
      '00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000008101'
    )
  $sql$),
  '23505',
  'non-void Jobber account and invoice identity remains series-unique'
);

-- Task 5 assertion 38
SELECT is(
  pg_temp.capture_sqlstate($sql$
    UPDATE public.progress_invoice_series
    SET jobber_invoice_id = 'changed-after-lock'
    WHERE id = (SELECT id FROM task5_standalone_result)
  $sql$),
  '55000',
  'account, invoice, and accepted numbering fields cannot change after link lock'
);

-- Task 5 assertion 39
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
        'public.create_progress_invoice_series(jsonb)',
        'public.update_progress_invoice_series(jsonb)',
        'public.create_progress_adjustment(jsonb)',
        'public.update_progress_adjustment_draft(jsonb)',
        'public.approve_progress_adjustment(jsonb)',
        'public.supersede_progress_adjustment(jsonb)'
      ]) rpc(signature)
    ) rpcs
  ),
  true,
  'all Task 5 public RPCs are exposed only to authenticated callers'
);

-- Task 5 assertion 40
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
        'public.progress_request_fingerprint(jsonb)',
        'public.progress_series_safe_dto(public.progress_invoice_series)',
        'public.progress_adjustment_safe_dto(public.progress_adjustments)',
        'public.progress_validate_series_create_payload(jsonb)',
        'public.progress_recalculate_series_read_model(uuid)',
        'public.progress_validate_adjustment_payload(jsonb,boolean)'
      ]) helper(signature)
    ) helpers
  ),
  true,
  'Task 5 internal helpers are not callable by API roles'
);

SELECT extensions.dblink_connect(
  'task5_create_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
SELECT extensions.dblink_connect(
  'task5_create_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
SELECT extensions.dblink_exec('task5_create_a', 'BEGIN');
SELECT extensions.dblink_exec('task5_create_a', 'SET LOCAL ROLE authenticated');
SELECT extensions.dblink_exec('task5_create_a', $$SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000008101'$$);
SELECT extensions.dblink_exec(
  'task5_create_a',
  format(
    'CREATE TEMP TABLE first_create_result AS SELECT * FROM public.create_progress_invoice_series(%L::JSONB)',
    pg_temp.series_payload('jobber_job', '81000000-0000-4000-8000-000000000030')::TEXT
  )
);
SELECT extensions.dblink_exec('task5_create_b', 'BEGIN');
SELECT extensions.dblink_exec('task5_create_b', 'SET LOCAL ROLE authenticated');
SELECT extensions.dblink_exec('task5_create_b', $$SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000008101'$$);
SELECT extensions.dblink_send_query(
  'task5_create_b',
  format(
    'SELECT id::TEXT, version FROM public.create_progress_invoice_series(%L::JSONB)',
    pg_temp.series_payload('jobber_job', '81000000-0000-4000-8000-000000000030')::TEXT
  )
);
SELECT pg_sleep(0.1);

-- Task 5 assertion 41
SELECT is(
  extensions.dblink_is_busy('task5_create_b'),
  1,
  'a genuine second create session waits on the owner-global correlation lock'
);

SELECT extensions.dblink_exec('task5_create_a', 'COMMIT');
CREATE TEMP TABLE task5_concurrent_second (id TEXT, version INT);
INSERT INTO task5_concurrent_second
SELECT result.id, result.version
FROM extensions.dblink_get_result('task5_create_b', false) AS result(id TEXT, version INT);
DO $$
BEGIN
  PERFORM result.id, result.version
  FROM extensions.dblink_get_result('task5_create_b', false) AS result(id TEXT, version INT);
END;
$$;
SELECT extensions.dblink_exec('task5_create_b', 'COMMIT');

-- Task 5 assertion 42
SELECT is(
  (
    SELECT second.id::UUID = event.series_id AND second.version = (event.result_refs ->> 'version')::INT
    FROM task5_concurrent_second second
    JOIN public.progress_invoice_events event
      ON event.actor_id = '00000000-0000-0000-0000-000000008101'::UUID
     AND event.command_name = 'create_progress_invoice_series'
     AND event.correlation_key = '81000000-0000-4000-8000-000000000030'
  ),
  true,
  'both concurrent create sessions resolve to the exact same series result'
);

-- Task 5 assertion 43
SELECT is(
  (
    SELECT count(*)::INT FROM public.progress_invoice_events event
    WHERE event.actor_id = '00000000-0000-0000-0000-000000008101'::UUID
      AND event.command_name = 'create_progress_invoice_series'
      AND event.correlation_key = '81000000-0000-4000-8000-000000000030'
  ),
  1,
  'concurrent identical creates leave one idempotency event'
);

-- Task 5 assertion 44
SELECT is(
  (
    SELECT count(*)::INT
    FROM public.progress_invoice_series series
    JOIN public.progress_invoice_events event ON event.series_id = series.id
    WHERE event.actor_id = '00000000-0000-0000-0000-000000008101'::UUID
      AND event.command_name = 'create_progress_invoice_series'
      AND event.correlation_key = '81000000-0000-4000-8000-000000000030'
  ),
  1,
  'concurrent identical creates leave one series and no orphan duplicate'
);

SELECT extensions.dblink_disconnect('task5_create_a');
SELECT extensions.dblink_disconnect('task5_create_b');

-- Task 5 assertion 45
SELECT is(
  (
    SELECT count(*)::INT FROM public.progress_invoice_events event
    WHERE event.series_id = (SELECT id FROM task5_standalone_result)
      AND event.command_name = 'supersede_progress_adjustment'
      AND event.correlation_key = '81000000-0000-4000-8000-000000000020'
  ),
  1,
  'successful correction appends one audited idempotency result'
);

-- Task 5 assertion 46
SELECT is(
  (
    SELECT series.status FROM public.progress_invoice_series series
    JOIN task5_standalone_result result ON result.id = series.id
  ),
  'draft',
  'successful adjustments do not silently invent a lifecycle transition'
);

-- Task 5 assertion 47
SELECT is(
  (
    SELECT count(*)::INT FROM public.progress_adjustments adjustment
    WHERE adjustment.series_id = (SELECT id FROM task5_standalone_result)
      AND adjustment.status = 'approved'
  ),
  2,
  'the final register has exactly the current Approved Variation and Credit'
);

RESET ROLE;

SELECT is(
  (
    SELECT has_function_privilege(
      'authenticated',
      'public.save_business_invoice_profile(jsonb)',
      'EXECUTE'
    )
      AND NOT has_function_privilege(
        'anon',
        'public.save_business_invoice_profile(jsonb)',
        'EXECUTE'
      )
      AND NOT has_function_privilege(
        'service_role',
        'public.save_business_invoice_profile(jsonb)',
        'EXECUTE'
      )
  ),
  true,
  'catalog privileges expose the profile RPC only to authenticated'
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
        'public.progress_require_actor()',
        'public.progress_require_expected_version(jsonb,integer)',
        'public.progress_lock_idempotency(uuid,text,uuid,text)',
        'public.progress_append_event(uuid,uuid,text,text,uuid,uuid,jsonb,text,uuid,text,jsonb)',
        'public.progress_assert_current_pointer(uuid,uuid,uuid)'
      ]) AS helper(signature)
    ) AS helpers
  ),
  true,
  'internal helper functions have no API-role EXECUTE privilege'
);

DELETE FROM public.business_invoice_profiles;
DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000008001',
  '00000000-0000-0000-0000-000000008002',
  '00000000-0000-0000-0000-000000008003'
);

SELECT * FROM finish();
