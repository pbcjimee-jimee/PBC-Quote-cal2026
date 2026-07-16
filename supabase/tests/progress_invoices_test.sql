CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(178);

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

-- Task 7: Jobber observation persistence authority and date semantics
SELECT has_column(
  'public',
  'progress_jobber_invoice_snapshots',
  'invoice_payments_total',
  'immutable observations preserve Jobber invoice payments total'
);

SELECT has_column(
  'public',
  'progress_jobber_invoice_snapshots',
  'client_email_candidates',
  'immutable observations preserve all Jobber email candidates'
);

SELECT has_column(
  'public',
  'progress_jobber_invoice_snapshots',
  'client_phone_candidates',
  'immutable observations preserve all Jobber phone candidates'
);

SELECT is(
  has_function_privilege(
    'service_role',
    'public.link_progress_jobber_invoice(jsonb)',
    'EXECUTE'
  )
    AND has_function_privilege(
      'service_role',
      'public.apply_progress_invoice_jobber_refresh(jsonb)',
      'EXECUTE'
    )
    AND has_function_privilege(
      'service_role',
      'public.record_progress_jobber_refresh_failure(jsonb)',
      'EXECUTE'
    ),
  true,
  'service role alone receives authoritative Jobber persistence commands'
);

SELECT is(
  has_function_privilege(
    'authenticated',
    'public.get_progress_invoice_jobber_context(jsonb)',
    'EXECUTE'
  )
    AND has_function_privilege(
      'authenticated',
      'public.accept_progress_jobber_invoice_number(jsonb)',
      'EXECUTE'
    ),
  true,
  'authenticated callers receive only narrow context and acceptance commands'
);

SELECT is(
  NOT has_function_privilege(
    'authenticated',
    'public.link_progress_jobber_invoice(jsonb)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.apply_progress_invoice_jobber_refresh(jsonb)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'authenticated',
      'public.record_progress_jobber_refresh_failure(jsonb)',
      'EXECUTE'
    ),
  true,
  'authenticated browsers cannot submit authoritative Jobber observations'
);

SELECT is(
  NOT has_function_privilege(
    'service_role',
    'public.get_progress_invoice_jobber_context(jsonb)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'service_role',
      'public.accept_progress_jobber_invoice_number(jsonb)',
      'EXECUTE'
    ),
  true,
  'service role is not an alternate authenticated context or number command surface'
);

SELECT is(
  public.progress_jobber_sydney_date('2026-01-01'),
  '2026-01-01'::DATE,
  'Jobber date-only metadata remains the same calendar date'
);

SELECT is(
  public.progress_jobber_sydney_date('2026-01-01T13:30:00Z'),
  '2026-01-02'::DATE,
  'Jobber UTC timestamp crosses the AEDT calendar boundary explicitly'
);

SELECT is(
  public.progress_jobber_sydney_date('2026-07-01T14:30:00Z'),
  '2026-07-02'::DATE,
  'Jobber UTC timestamp crosses the AEST calendar boundary explicitly'
);

SELECT throws_ok(
  $$SELECT public.progress_jobber_sydney_date('2026-07-01T14:30:00')$$,
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'timezone-less Jobber date-times are rejected'
);

SELECT is(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conname = 'progress_invoice_series_jobber_sync_error_code_check'
      AND constraint_row.conrelid = 'public.progress_invoice_series'::regclass
  ),
  true,
  'series sync errors are constrained to the bounded safe allowlist'
);

CREATE FUNCTION pg_temp.task7_payment(
  requested_id TEXT,
  requested_amount TEXT,
  requested_method TEXT,
  requested_reference TEXT,
  requested_direction TEXT DEFAULT 'receipt',
  requested_treatment TEXT DEFAULT 'active'
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'jobber_payment_id', requested_id,
    'source', 'payment_record',
    'raw_adjustment_type', CASE
      WHEN requested_direction = 'refund' THEN 'REFUND'
      WHEN requested_direction = 'reversal' THEN 'FAILED_ACH_PAYMENT'
      ELSE 'PAYMENT'
    END,
    'raw_signed_amount', requested_amount,
    'absolute_amount', ltrim(requested_amount, '-'),
    'direction', requested_direction,
    'effective_amount', requested_amount,
    'entry_date', '2026-01-02',
    'method', requested_method,
    'reference', requested_reference,
    'external_status', 'SUCCEEDED',
    'external_updated_at', NULL,
    'treatment', requested_treatment
  );
$$;

CREATE FUNCTION pg_temp.task7_observation(
  requested_fingerprint TEXT,
  requested_invoice_number TEXT,
  requested_payments JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'account_id', 'task7-account',
    'invoice_id', 'task7-invoice',
    'invoice_number', requested_invoice_number,
    'raw_status', 'awaiting_payment',
    'normalized_status', 'awaiting_payment',
    'jobber_web_uri', 'https://secure.getjobber.com/invoices/task7-invoice',
    'invoice_subtotal', '1000.00',
    'invoice_tax_amount', '100.00',
    'invoice_total', '1100.00',
    'invoice_balance', '825.00',
    'invoice_payments_total', '275.00',
    'invoice_issued_date', '2026-01-01T13:30:00Z',
    'invoice_due_date', '2026-01-15',
    'invoice_received_date', NULL,
    'external_created_at', '2026-01-01T00:00:00Z',
    'external_updated_at', '2026-01-02T00:00:00Z',
    'client_id', 'task7-client',
    'client_name', 'Task 7 Builder',
    'client_company_name', 'Task 7 Builder Pty Ltd',
    'client_email', 'accounts@example.test',
    'client_phone', NULL,
    'client_email_candidates', jsonb_build_array('accounts@example.test'),
    'client_phone_candidates', jsonb_build_array(
      jsonb_build_object('number', '0400000000', 'primary', true),
      jsonb_build_object('number', '0411111111', 'primary', true)
    ),
    'billing_address', '1 Billing Street, Sydney NSW 2000, Australia',
    'job_ids', jsonb_build_array('task7-job-1', 'task7-job-2'),
    'property_ids', jsonb_build_array('task7-property-1', 'task7-property-2'),
    'site_address_candidates', jsonb_build_array(
      jsonb_build_object(
        'property_id', 'task7-property-1',
        'address', '4 Curra Close, Frenchs Forest NSW 2086, Australia'
      ),
      jsonb_build_object('property_id', 'task7-property-2', 'address', NULL)
    ),
    'selected_job_id', 'task7-job-2',
    'selected_property_id', 'task7-property-1',
    'effective_graphql_version', '2025-04-16',
    'payment_eligibility_policy_version', '2026-07-v1',
    'fetched_at', '2026-01-02T01:00:00Z',
    'response_fingerprint', requested_fingerprint,
    'warnings', '[]'::JSONB,
    'payments', requested_payments
  );
$$;

CREATE FUNCTION pg_temp.task7_link_payload(
  requested_series_id UUID,
  requested_version INT,
  requested_key UUID,
  requested_fingerprint TEXT,
  requested_observation JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'actor_id', '00000000-0000-0000-0000-000000008101',
    'series_id', requested_series_id,
    'expected_version', requested_version,
    'correlation_key', requested_key,
    'request_fingerprint', requested_fingerprint,
    'observation', requested_observation
  );
$$;

CREATE FUNCTION pg_temp.task7_create_series(requested_label TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  created_id UUID;
BEGIN
  INSERT INTO public.progress_invoice_series (
    source_type,
    base_contract_ex_gst,
    recipient_name,
    recipient_address,
    site_name,
    site_address,
    default_description,
    created_by,
    updated_by
  ) VALUES (
    'jobber_invoice',
    1000.00,
    requested_label || ' Recipient',
    requested_label || ' Address',
    requested_label || ' Site',
    requested_label || ' Site Address',
    requested_label,
    '00000000-0000-0000-0000-000000008101',
    '00000000-0000-0000-0000-000000008101'
  )
  RETURNING id INTO created_id;

  RETURN created_id;
END;
$$;

CREATE TEMP TABLE task7_series_result (id UUID PRIMARY KEY);
WITH inserted AS (
  INSERT INTO public.progress_invoice_series (
    source_type,
    base_contract_ex_gst,
    recipient_name,
    recipient_address,
    site_name,
    site_address,
    default_description,
    created_by,
    updated_by
  ) VALUES (
    'jobber_invoice',
    1000.00,
    'Task 7 Initial Recipient',
    'Task 7 Initial Address',
    'Task 7 Initial Site',
    'Task 7 Initial Site Address',
    'Task 7 Jobber Invoice',
    '00000000-0000-0000-0000-000000008101',
    '00000000-0000-0000-0000-000000008101'
  )
  RETURNING id
)
INSERT INTO task7_series_result (id)
SELECT id FROM inserted;

-- Task 5 assertions are complete. Repoint its temporary result holder so the
-- existing Task 7 expressions below operate on an isolated, claim-free series.
UPDATE task5_standalone_result
SET id = (SELECT id FROM task7_series_result);

CREATE TEMP TABLE task7_initial_link_payload AS
SELECT pg_temp.task7_link_payload(
  series.id,
  series.version,
  '82000000-0000-4000-8000-000000000001',
  repeat('1', 64),
  pg_temp.task7_observation(
    repeat('a', 64),
    'INV-100',
    jsonb_build_array(pg_temp.task7_payment('task7-payment-1', '275.00', NULL, NULL))
  )
) AS payload
FROM public.progress_invoice_series AS series
WHERE series.id = (SELECT id FROM task5_standalone_result);

CREATE TEMP TABLE task7_link_result AS
SELECT *
FROM public.link_progress_jobber_invoice(
  (SELECT payload FROM task7_initial_link_payload)
);

-- Task 7 behavior assertion 1
SELECT is(
  (SELECT series_id FROM task7_link_result),
  (SELECT id FROM task5_standalone_result),
  'first Jobber link returns the linked series'
);

-- Task 7 behavior assertion 2
SELECT is(
  (
    SELECT jsonb_build_object(
      'issued', snapshot.issued_date,
      'payments_total', snapshot.invoice_payments_total,
      'emails', snapshot.client_email_candidates,
      'phones', snapshot.client_phone_candidates
    )
    FROM public.progress_jobber_invoice_snapshots AS snapshot
    WHERE snapshot.id = (
      SELECT series.current_jobber_snapshot_id
      FROM public.progress_invoice_series AS series
      WHERE series.id = (SELECT id FROM task5_standalone_result)
    )
  ),
  jsonb_build_object(
    'issued', '2026-01-02'::DATE,
    'payments_total', 275.00::NUMERIC,
    'emails', jsonb_build_array('accounts@example.test'),
    'phones', jsonb_build_array(
      jsonb_build_object('number', '0400000000', 'primary', true),
      jsonb_build_object('number', '0411111111', 'primary', true)
    )
  ),
  'first link stores complete immutable observation evidence'
);

-- Task 7 behavior assertion 3
SELECT is(
  (
    SELECT jsonb_build_object(
      'original', series.original_jobber_invoice_number,
      'accepted', series.accepted_numbering_base,
      'recipient', series.recipient_name,
      'email', series.recipient_email,
      'phone', series.recipient_phone,
      'site', series.site_address
    )
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM task5_standalone_result)
  ),
  jsonb_build_object(
    'original', 'INV-100',
    'accepted', 'INV-100',
    'recipient', 'Task 7 Builder',
    'email', 'accounts@example.test',
    'phone', NULL,
    'site', '4 Curra Close, Frenchs Forest NSW 2086, Australia'
  ),
  'first link separates numbering and applies only deterministic editable prefill'
);

-- Task 7 behavior assertion 4
SELECT is(
  (
    SELECT jsonb_build_object(
      'payment_version', payment.version,
      'revision_number', revision.revision_number,
      'pointer', payment.current_revision_id = revision.id,
      'method', revision.payment_method,
      'reference', revision.reference,
      'status', revision.status
    )
    FROM public.progress_payments AS payment
    JOIN public.progress_payment_revisions AS revision
      ON revision.id = payment.current_revision_id
     AND revision.payment_id = payment.id
    WHERE payment.series_id = (SELECT id FROM task5_standalone_result)
      AND payment.jobber_payment_id = 'task7-payment-1'
  ),
  jsonb_build_object(
    'payment_version', 1,
    'revision_number', 1,
    'pointer', true,
    'method', NULL,
    'reference', NULL,
    'status', 'active'
  ),
  'new Jobber payment identity, revision one, and current pointer commit together'
);

-- Task 7 behavior assertion 5
SELECT is(
  (
    SELECT jsonb_build_object(
      'receipts', series.current_actual_receipts,
      'credit', series.current_credit_balance,
      'state', series.current_payment_state
    )
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM task5_standalone_result)
  ),
  jsonb_build_object('receipts', 275.00::NUMERIC, 'credit', 275.00::NUMERIC, 'state', 'credit_balance'),
  'signed Jobber receipts feed the cached financial read model'
);

-- Task 7 behavior assertion 6
SELECT is(
  (
    SELECT count(*)::INT = 1
      AND bool_and(event.actor_id = '00000000-0000-0000-0000-000000008101'::UUID)
      AND bool_and(event.safe_field_changes = jsonb_build_object(
        'identity_changed', true,
        'selector_changed', true,
        'snapshot_advanced', true
      ))
      AND bool_and(event.safe_field_changes::TEXT !~ 'Task 7 Builder|275.00|accounts@example')
    FROM public.progress_invoice_events AS event
    WHERE event.series_id = (SELECT id FROM task5_standalone_result)
      AND event.command_name = 'link_progress_jobber_invoice'
      AND event.correlation_key = '82000000-0000-4000-8000-000000000001'
  ),
  true,
  'link audit is actor-attributed and contains no PII or financial values'
);

SELECT *
FROM public.link_progress_jobber_invoice(
  (SELECT payload FROM task7_initial_link_payload)
);

-- Task 7 behavior assertion 7
SELECT is(
  (
    SELECT jsonb_build_object(
      'snapshots', (
        SELECT count(*) FROM public.progress_jobber_invoice_snapshots
        WHERE series_id = series.id
      ),
      'revisions', (
        SELECT count(*)
        FROM public.progress_payment_revisions AS revision
        JOIN public.progress_payments AS payment ON payment.id = revision.payment_id
        WHERE payment.series_id = series.id
      ),
      'events', (
        SELECT count(*) FROM public.progress_invoice_events
        WHERE series_id = series.id
          AND command_name = 'link_progress_jobber_invoice'
          AND correlation_key = '82000000-0000-4000-8000-000000000001'
      )
    )
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM task5_standalone_result)
  ),
  jsonb_build_object('snapshots', 1, 'revisions', 1, 'events', 1),
  'exact link replay returns before locks and appends no evidence'
);

-- Task 7 behavior assertion 8
SELECT throws_ok(
  format(
    'SELECT * FROM public.link_progress_jobber_invoice(%L::JSONB)',
    (
      (SELECT payload FROM task7_initial_link_payload)
      || jsonb_build_object('request_fingerprint', repeat('2', 64))
    )::TEXT
  ),
  'P0001',
  'IDEMPOTENCY_KEY_REUSED',
  'same link key with a different request fingerprint is rejected atomically'
);

UPDATE public.progress_invoice_series
SET recipient_name = 'User Edited Recipient',
    recipient_address = 'User Edited Billing Address',
    site_address = 'User Edited Site Address',
    updated_by = '00000000-0000-0000-0000-000000008101'
WHERE id = (SELECT id FROM task5_standalone_result);

CREATE TEMP TABLE task7_refresh_result AS
SELECT *
FROM public.apply_progress_invoice_jobber_refresh(jsonb_build_object(
  'actor_id', '00000000-0000-0000-0000-000000008101',
  'series_id', (SELECT id FROM task5_standalone_result),
  'expected_version', (
    SELECT version FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  'idempotency_key', '82000000-0000-4000-8000-000000000002',
  'request_fingerprint', repeat('3', 64),
  'observation', pg_temp.task7_observation(
    repeat('b', 64),
    'INV-101',
    jsonb_build_array(pg_temp.task7_payment(
      'task7-payment-1', '300.00', 'EFT', 'RECEIPT-300'
    ))
  )
));

-- Task 7 behavior assertion 9
SELECT is(
  (
    SELECT jsonb_build_object(
      'inserted', inserted_payments,
      'revised', revised_payments,
      'unconfirmed', unconfirmed_payments
    ) FROM task7_refresh_result
  ),
  jsonb_build_object('inserted', 0, 'revised', 1, 'unconfirmed', 0),
  'changed payment evidence appends exactly one revision'
);

-- Task 7 behavior assertion 10
SELECT is(
  (
    SELECT jsonb_build_object(
      'snapshot_count', count(*),
      'original', min(snapshot.original_invoice_number),
      'latest', max(snapshot.observed_invoice_number)
    )
    FROM public.progress_jobber_invoice_snapshots AS snapshot
    WHERE snapshot.series_id = (SELECT id FROM task5_standalone_result)
  ),
  jsonb_build_object('snapshot_count', 2, 'original', 'INV-100', 'latest', 'INV-101'),
  'changed observation advances immutable latest evidence while preserving original numbering'
);

-- Task 7 behavior assertion 11
SELECT is(
  (
    SELECT jsonb_build_object(
      'recipient', series.recipient_name,
      'billing', series.recipient_address,
      'site', series.site_address,
      'accepted', series.accepted_numbering_base
    )
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM task5_standalone_result)
  ),
  jsonb_build_object(
    'recipient', 'User Edited Recipient',
    'billing', 'User Edited Billing Address',
    'site', 'User Edited Site Address',
    'accepted', 'INV-100'
  ),
  'refresh preserves user-edited snapshots and accepted numbering'
);

-- Task 7 behavior assertion 12
SELECT is(
  (
    SELECT jsonb_build_object(
      'version', payment.version,
      'revision', revision.revision_number,
      'effective', revision.effective_receipt_amount,
      'method', revision.payment_method,
      'reference', revision.reference
    )
    FROM public.progress_payments AS payment
    JOIN public.progress_payment_revisions AS revision
      ON revision.id = payment.current_revision_id
    WHERE payment.series_id = (SELECT id FROM task5_standalone_result)
      AND payment.jobber_payment_id = 'task7-payment-1'
  ),
  jsonb_build_object(
    'version', 2,
    'revision', 2,
    'effective', 300.00::NUMERIC,
    'method', 'EFT',
    'reference', 'RECEIPT-300'
  ),
  'amount, method, and reference changes advance one stable payment version'
);

-- Task 7 behavior assertion 13
SELECT is(
  (
    SELECT jsonb_build_object(
      'receipts', current_actual_receipts,
      'credit', current_credit_balance,
      'state', current_payment_state
    )
    FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  jsonb_build_object('receipts', 300.00::NUMERIC, 'credit', 300.00::NUMERIC, 'state', 'credit_balance'),
  'changed signed effect is reflected in the read model'
);

CREATE TEMP TABLE task7_disappearance_result AS
SELECT *
FROM public.apply_progress_invoice_jobber_refresh(jsonb_build_object(
  'actor_id', '00000000-0000-0000-0000-000000008101',
  'series_id', (SELECT id FROM task5_standalone_result),
  'expected_version', (
    SELECT version FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  'idempotency_key', '82000000-0000-4000-8000-000000000003',
  'request_fingerprint', repeat('4', 64),
  'observation', pg_temp.task7_observation(repeat('c', 64), 'INV-101', '[]'::JSONB)
));

-- Task 7 behavior assertion 14
SELECT is(
  (SELECT unconfirmed_payments FROM task7_disappearance_result),
  1,
  'first complete-observation disappearance appends one Unconfirmed revision'
);

-- Task 7 behavior assertion 15
SELECT is(
  (
    SELECT jsonb_build_object(
      'version', payment.version,
      'revision', revision.revision_number,
      'effective', revision.effective_receipt_amount,
      'sync', revision.sync_state,
      'status', revision.status
    )
    FROM public.progress_payments AS payment
    JOIN public.progress_payment_revisions AS revision
      ON revision.id = payment.current_revision_id
    WHERE payment.series_id = (SELECT id FROM task5_standalone_result)
      AND payment.jobber_payment_id = 'task7-payment-1'
  ),
  jsonb_build_object(
    'version', 3,
    'revision', 3,
    'effective', 0.00::NUMERIC,
    'sync', 'disappeared',
    'status', 'unconfirmed'
  ),
  'disappearance preserves identity with a zero-effect current revision'
);

-- Task 7 behavior assertion 16
SELECT is(
  (
    SELECT jsonb_build_object(
      'receipts', current_actual_receipts,
      'state', current_payment_state
    )
    FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  jsonb_build_object('receipts', 0.00::NUMERIC, 'state', 'unpaid'),
  'Unconfirmed disappeared evidence does not count as a receipt'
);

SELECT *
FROM public.apply_progress_invoice_jobber_refresh(jsonb_build_object(
  'actor_id', '00000000-0000-0000-0000-000000008101',
  'series_id', (SELECT id FROM task5_standalone_result),
  'expected_version', (
    SELECT version FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  'idempotency_key', '82000000-0000-4000-8000-000000000004',
  'request_fingerprint', repeat('4', 64),
  'observation', pg_temp.task7_observation(repeat('c', 64), 'INV-101', '[]'::JSONB)
));

-- Task 7 behavior assertion 17
SELECT is(
  (
    SELECT jsonb_build_object(
      'snapshot_count', (
        SELECT count(*) FROM public.progress_jobber_invoice_snapshots
        WHERE series_id = payment.series_id
      ),
      'payment_version', payment.version,
      'revision_count', (
        SELECT count(*) FROM public.progress_payment_revisions
        WHERE payment_id = payment.id
      )
    )
    FROM public.progress_payments AS payment
    WHERE payment.series_id = (SELECT id FROM task5_standalone_result)
      AND payment.jobber_payment_id = 'task7-payment-1'
  ),
  jsonb_build_object('snapshot_count', 3, 'payment_version', 3, 'revision_count', 3),
  'unchanged fingerprint under a new key reuses evidence and adds no payment revision'
);

SELECT *
FROM public.apply_progress_invoice_jobber_refresh(jsonb_build_object(
  'actor_id', '00000000-0000-0000-0000-000000008101',
  'series_id', (SELECT id FROM task5_standalone_result),
  'expected_version', (
    SELECT version FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  'idempotency_key', '82000000-0000-4000-8000-000000000005',
  'request_fingerprint', repeat('5', 64),
  'observation', pg_temp.task7_observation(
    repeat('d', 64),
    'INV-101',
    jsonb_build_array(pg_temp.task7_payment(
      'task7-payment-1', '300.00', 'EFT', 'RECEIPT-300'
    ))
  )
));

-- Task 7 behavior assertion 18
SELECT is(
  (
    SELECT jsonb_build_object(
      'version', payment.version,
      'revision', revision.revision_number,
      'status', revision.status,
      'receipts', series.current_actual_receipts
    )
    FROM public.progress_payments AS payment
    JOIN public.progress_payment_revisions AS revision
      ON revision.id = payment.current_revision_id
    JOIN public.progress_invoice_series AS series ON series.id = payment.series_id
    WHERE payment.series_id = (SELECT id FROM task5_standalone_result)
      AND payment.jobber_payment_id = 'task7-payment-1'
  ),
  jsonb_build_object(
    'version', 4,
    'revision', 4,
    'status', 'active',
    'receipts', 300.00::NUMERIC
  ),
  'reappearing payment appends one active revision and restores receipts'
);

SELECT *
FROM public.link_progress_jobber_invoice(
  pg_temp.task7_link_payload(
    (SELECT id FROM task5_standalone_result),
    (
      SELECT version FROM public.progress_invoice_series
      WHERE id = (SELECT id FROM task5_standalone_result)
    ),
    '82000000-0000-4000-8000-000000000014',
    repeat('9', 64),
    pg_temp.task7_observation(
      repeat('d', 64),
      'INV-101',
      jsonb_build_array(pg_temp.task7_payment(
        'task7-payment-1', '300.00', 'EFT', 'RECEIPT-300'
      ))
    )
  )
);

SELECT is(
  (
    SELECT safe_field_changes
    FROM public.progress_invoice_events
    WHERE series_id = (SELECT id FROM task5_standalone_result)
      AND command_name = 'link_progress_jobber_invoice'
      AND correlation_key = '82000000-0000-4000-8000-000000000014'
  ),
  jsonb_build_object(
    'identity_changed', false,
    'selector_changed', false,
    'snapshot_advanced', true
  ),
  'same-identity relink records unchanged selectors instead of a hardcoded change'
);

INSERT INTO public.progress_payments (
  id,
  series_id,
  source,
  version,
  created_by,
  updated_by
) VALUES (
  '00000000-0000-0000-0000-000000008701',
  (SELECT id FROM task5_standalone_result),
  'manual',
  4,
  '00000000-0000-0000-0000-000000008101',
  '00000000-0000-0000-0000-000000008101'
);

INSERT INTO public.progress_payment_revisions (
  id,
  payment_id,
  revision_number,
  received_date,
  observed_amount,
  effective_receipt_amount,
  payment_method,
  reference,
  sync_state,
  status,
  created_by
) VALUES (
  '00000000-0000-0000-0000-000000008702',
  '00000000-0000-0000-0000-000000008701',
  1,
  '2026-01-02',
  25.00,
  25.00,
  'EFT',
  'MANUAL-25',
  'manual',
  'active',
  '00000000-0000-0000-0000-000000008101'
);

UPDATE public.progress_payments
SET current_revision_id = '00000000-0000-0000-0000-000000008702'
WHERE id = '00000000-0000-0000-0000-000000008701';

UPDATE public.progress_payments
SET matched_manual_payment_id = '00000000-0000-0000-0000-000000008701'
WHERE series_id = (SELECT id FROM task5_standalone_result)
  AND jobber_payment_id = 'task7-payment-1';

CREATE TEMP TABLE task7_manual_before AS
SELECT
  to_jsonb(manual_payment) AS payment_row,
  to_jsonb(manual_revision) AS revision_row,
  jobber_payment.matched_manual_payment_id
FROM public.progress_payments AS manual_payment
JOIN public.progress_payment_revisions AS manual_revision
  ON manual_revision.id = manual_payment.current_revision_id
JOIN public.progress_payments AS jobber_payment
  ON jobber_payment.series_id = manual_payment.series_id
 AND jobber_payment.jobber_payment_id = 'task7-payment-1'
WHERE manual_payment.id = '00000000-0000-0000-0000-000000008701';

CREATE TEMP TABLE task7_suggestion_refresh_payload AS
SELECT jsonb_build_object(
  'actor_id', '00000000-0000-0000-0000-000000008101',
  'series_id', (SELECT id FROM task5_standalone_result),
  'expected_version', (
    SELECT version FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  'idempotency_key', '82000000-0000-4000-8000-000000000015',
  'request_fingerprint', repeat('a', 64),
  'observation', pg_temp.task7_observation(
    repeat('e', 64),
    'INV-101',
    jsonb_build_array(pg_temp.task7_payment(
      'task7-payment-1', '300.00', 'EFT', 'RECEIPT-300'
    ))
  ) || jsonb_build_object(
    'client_email', 'billing@example.test',
    'client_email_candidates', jsonb_build_array('billing@example.test'),
    'client_phone', '0400000000',
    'client_phone_candidates', jsonb_build_array(
      jsonb_build_object('number', '0400000000', 'primary', true)
    ),
    'site_address_candidates', jsonb_build_array(
      jsonb_build_object(
        'property_id', 'task7-property-1',
        'address', '6 Curra Close, Frenchs Forest NSW 2086, Australia'
      ),
      jsonb_build_object('property_id', 'task7-property-2', 'address', NULL)
    )
  )
) AS payload;

CREATE TEMP TABLE task7_suggestion_refresh_result AS
SELECT *
FROM public.apply_progress_invoice_jobber_refresh(
  (SELECT payload FROM task7_suggestion_refresh_payload)
);

SELECT is(
  (
    SELECT safe_field_changes
    FROM public.progress_invoice_events
    WHERE series_id = (SELECT id FROM task5_standalone_result)
      AND command_name = 'apply_progress_invoice_jobber_refresh'
      AND correlation_key = '82000000-0000-4000-8000-000000000015'
  ),
  jsonb_build_object(
    'snapshot_advanced', true,
    'invoice_number_changed', false,
    'recipient_suggestion_changed', true,
    'site_suggestion_changed', true
  ),
  'contact-only and selected-site candidate changes surface bounded suggestion flags'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'payment_unchanged', before.payment_row = to_jsonb(manual_payment),
      'revision_unchanged', before.revision_row = to_jsonb(manual_revision),
      'pointer_unchanged',
        manual_payment.current_revision_id = '00000000-0000-0000-0000-000000008702',
      'match_unchanged',
        jobber_payment.matched_manual_payment_id = before.matched_manual_payment_id
    )
    FROM task7_manual_before AS before
    JOIN public.progress_payments AS manual_payment
      ON manual_payment.id = '00000000-0000-0000-0000-000000008701'
    JOIN public.progress_payment_revisions AS manual_revision
      ON manual_revision.id = manual_payment.current_revision_id
    JOIN public.progress_payments AS jobber_payment
      ON jobber_payment.series_id = manual_payment.series_id
     AND jobber_payment.jobber_payment_id = 'task7-payment-1'
  ),
  jsonb_build_object(
    'payment_unchanged', true,
    'revision_unchanged', true,
    'pointer_unchanged', true,
    'match_unchanged', true
  ),
  'refresh preserves the complete Manual payment row, revision, version, pointer, and match'
);

CREATE TEMP TABLE task7_before_refresh_replay AS
SELECT jsonb_build_object(
  'version', series.version,
  'snapshot', series.current_jobber_snapshot_id,
  'snapshots', (
    SELECT count(*) FROM public.progress_jobber_invoice_snapshots
    WHERE series_id = series.id
  ),
  'payment_revisions', (
    SELECT count(*)
    FROM public.progress_payment_revisions AS revision
    JOIN public.progress_payments AS payment ON payment.id = revision.payment_id
    WHERE payment.series_id = series.id
  ),
  'events', (
    SELECT count(*) FROM public.progress_invoice_events
    WHERE series_id = series.id
      AND command_name = 'apply_progress_invoice_jobber_refresh'
      AND correlation_key = '82000000-0000-4000-8000-000000000015'
  )
) AS state
FROM public.progress_invoice_series AS series
WHERE series.id = (SELECT id FROM task5_standalone_result);

SELECT *
FROM public.apply_progress_invoice_jobber_refresh(
  (SELECT payload FROM task7_suggestion_refresh_payload)
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'version', series.version,
      'snapshot', series.current_jobber_snapshot_id,
      'snapshots', (
        SELECT count(*) FROM public.progress_jobber_invoice_snapshots
        WHERE series_id = series.id
      ),
      'payment_revisions', (
        SELECT count(*)
        FROM public.progress_payment_revisions AS revision
        JOIN public.progress_payments AS payment ON payment.id = revision.payment_id
        WHERE payment.series_id = series.id
      ),
      'events', (
        SELECT count(*) FROM public.progress_invoice_events
        WHERE series_id = series.id
          AND command_name = 'apply_progress_invoice_jobber_refresh'
          AND correlation_key = '82000000-0000-4000-8000-000000000015'
      )
    )
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM task5_standalone_result)
  ),
  (SELECT state FROM task7_before_refresh_replay),
  'exact refresh replay returns before locks and appends no observation, revision, or event'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.apply_progress_invoice_jobber_refresh(%L::JSONB)',
    (
      (SELECT payload FROM task7_suggestion_refresh_payload)
      || jsonb_build_object('request_fingerprint', repeat('b', 64))
    )::TEXT
  ),
  'P0001',
  'IDEMPOTENCY_KEY_REUSED',
  'same refresh key with a different request fingerprint is rejected'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'version', series.version,
      'snapshot', series.current_jobber_snapshot_id,
      'snapshots', (
        SELECT count(*) FROM public.progress_jobber_invoice_snapshots
        WHERE series_id = series.id
      ),
      'payment_revisions', (
        SELECT count(*)
        FROM public.progress_payment_revisions AS revision
        JOIN public.progress_payments AS payment ON payment.id = revision.payment_id
        WHERE payment.series_id = series.id
      ),
      'events', (
        SELECT count(*) FROM public.progress_invoice_events
        WHERE series_id = series.id
          AND command_name = 'apply_progress_invoice_jobber_refresh'
          AND correlation_key = '82000000-0000-4000-8000-000000000015'
      )
    )
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM task5_standalone_result)
  ),
  (SELECT state FROM task7_before_refresh_replay),
  'rejected refresh key reuse leaves series, observation, ledger, and audit unchanged'
);

CREATE TEMP TABLE task7_before_failure AS
SELECT
  series.current_jobber_snapshot_id,
  series.last_jobber_sync_attempt_at,
  series.last_successful_jobber_sync_at,
  series.last_jobber_sync_error_code,
  series.version,
  payment.version AS payment_version,
  payment.current_revision_id
FROM public.progress_invoice_series AS series
JOIN public.progress_payments AS payment ON payment.series_id = series.id
WHERE series.id = (SELECT id FROM task5_standalone_result)
  AND payment.jobber_payment_id = 'task7-payment-1';

SELECT throws_ok(
  format(
    'SELECT * FROM public.record_progress_jobber_refresh_failure(%L::JSONB)',
    jsonb_build_object(
      'actor_id', '00000000-0000-0000-0000-000000008101',
      'series_id', (SELECT id FROM task5_standalone_result),
      'expected_version', (SELECT version FROM task7_before_failure),
      'jobber_account_id', 'wrong-account',
      'jobber_invoice_id', 'task7-invoice',
      'idempotency_key', '82000000-0000-4000-8000-000000000016',
      'error_code', 'JOBBER_RATE_LIMITED'
    )::TEXT
  ),
  'P0001',
  'PROGRESS_VERSION_CONFLICT',
  'failure recording rejects a wrong locked account or invoice identity'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'attempt_preserved',
        series.last_jobber_sync_attempt_at = before_failure.last_jobber_sync_attempt_at,
      'success_preserved',
        series.last_successful_jobber_sync_at = before_failure.last_successful_jobber_sync_at,
      'error_preserved',
        series.last_jobber_sync_error_code IS NOT DISTINCT FROM
          before_failure.last_jobber_sync_error_code,
      'version_preserved', series.version = before_failure.version,
      'event_absent', NOT EXISTS (
        SELECT 1 FROM public.progress_invoice_events
        WHERE series_id = series.id
          AND correlation_key = '82000000-0000-4000-8000-000000000016'
      )
    )
    FROM public.progress_invoice_series AS series
    JOIN task7_before_failure AS before_failure ON true
    WHERE series.id = (SELECT id FROM task5_standalone_result)
  ),
  jsonb_build_object(
    'attempt_preserved', true,
    'success_preserved', true,
    'error_preserved', true,
    'version_preserved', true,
    'event_absent', true
  ),
  'wrong-identity failure guard rolls back attempt metadata and audit state'
);

SELECT *
FROM public.record_progress_jobber_refresh_failure(jsonb_build_object(
  'actor_id', '00000000-0000-0000-0000-000000008101',
  'series_id', (SELECT id FROM task5_standalone_result),
  'expected_version', (SELECT version FROM task7_before_failure),
  'jobber_account_id', 'task7-account',
  'jobber_invoice_id', 'task7-invoice',
  'idempotency_key', '82000000-0000-4000-8000-000000000006',
  'error_code', 'JOBBER_RATE_LIMITED'
));

-- Task 7 behavior assertion 19
SELECT is(
  (
    SELECT jsonb_build_object(
      'snapshot_preserved',
        series.current_jobber_snapshot_id = before_failure.current_jobber_snapshot_id,
      'success_preserved',
        series.last_successful_jobber_sync_at = before_failure.last_successful_jobber_sync_at,
      'version_preserved', series.version = before_failure.version,
      'payment_preserved',
        payment.version = before_failure.payment_version
          AND payment.current_revision_id = before_failure.current_revision_id
    )
    FROM public.progress_invoice_series AS series
    JOIN task7_before_failure AS before_failure ON true
    JOIN public.progress_payments AS payment ON payment.series_id = series.id
    WHERE series.id = (SELECT id FROM task5_standalone_result)
      AND payment.jobber_payment_id = 'task7-payment-1'
  ),
  jsonb_build_object(
    'snapshot_preserved', true,
    'success_preserved', true,
    'version_preserved', true,
    'payment_preserved', true
  ),
  'failure recording preserves observation, ledger, last success, and series version'
);

-- Task 7 behavior assertion 20
SELECT is(
  (
    SELECT last_jobber_sync_error_code = 'JOBBER_RATE_LIMITED'
      AND last_jobber_sync_attempt_at IS NOT NULL
    FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  true,
  'failure recording updates only bounded attempt metadata'
);

-- Task 7 behavior assertion 21
SELECT is(
  (
    SELECT count(*)::INT = 1
      AND bool_and(event.safe_field_changes = jsonb_build_object(
        'error_code', 'JOBBER_RATE_LIMITED'
      ))
      AND bool_and(event.safe_field_changes::TEXT !~ 'task7-account|task7-invoice|300.00')
    FROM public.progress_invoice_events AS event
    WHERE event.series_id = (SELECT id FROM task5_standalone_result)
      AND event.command_name = 'record_progress_jobber_refresh_failure'
      AND event.correlation_key = '82000000-0000-4000-8000-000000000006'
  ),
  true,
  'failure audit stores only the safe code'
);

SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000008101',
  false
);

CREATE TEMP TABLE task7_accept_result AS
SELECT *
FROM public.accept_progress_jobber_invoice_number(jsonb_build_object(
  'series_id', (SELECT id FROM task5_standalone_result),
  'expected_version', (
    SELECT version FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  'observation_id', (
    SELECT current_jobber_snapshot_id FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  'number_source', 'latest',
  'idempotency_key', '82000000-0000-4000-8000-000000000007'
));

-- Task 7 behavior assertion 22
SELECT is(
  (
    SELECT accepted_numbering_base
    FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task5_standalone_result)
  ),
  'INV-101',
  'accepted numbering is derived from the current series-owned observation'
);

-- Task 7 behavior assertion 23
SELECT throws_ok(
  format(
    'SELECT * FROM public.accept_progress_jobber_invoice_number(%L::JSONB)',
    jsonb_build_object(
      'series_id', (SELECT id FROM task5_standalone_result),
      'expected_version', (
        SELECT version FROM public.progress_invoice_series
        WHERE id = (SELECT id FROM task5_standalone_result)
      ),
      'observation_id', '00000000-0000-4000-8000-000000000099',
      'number_source', 'latest',
      'idempotency_key', '82000000-0000-4000-8000-000000000008'
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'foreign or stale observation cannot supply an accepted number'
);

-- Task 7 behavior assertion 24
SELECT is(
  (
    SELECT jsonb_build_object(
      'account', context.jobber_account_id,
      'invoice', context.jobber_invoice_id,
      'job', context.selected_jobber_job_id,
      'property', context.selected_jobber_property_id
    )
    FROM public.get_progress_invoice_jobber_context(jsonb_build_object(
      'series_id', (SELECT id FROM task5_standalone_result)
    )) AS context
  ),
  jsonb_build_object(
    'account', 'task7-account',
    'invoice', 'task7-invoice',
    'job', 'task7-job-2',
    'property', 'task7-property-1'
  ),
  'authenticated refresh context returns only locked identity and selectors'
);

SELECT throws_ok(
  $$SELECT * FROM public.get_progress_invoice_jobber_context(
    '{"series_id":"not-a-uuid"}'::JSONB
  )$$,
  '22023',
  'PROGRESS_VALIDATION_FAILED',
  'authenticated context maps malformed UUID text to one validation error'
);

SELECT throws_ok(
  $$SELECT * FROM public.get_progress_invoice_jobber_context(
    '{"series_id":123}'::JSONB
  )$$,
  '22023',
  'PROGRESS_VALIDATION_FAILED',
  'authenticated context rejects a numeric JSON series ID before casting'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.accept_progress_jobber_invoice_number(%L::JSONB)',
    jsonb_build_object(
      'series_id', (SELECT id FROM task5_standalone_result),
      'expected_version', '1',
      'observation_id', (
        SELECT current_jobber_snapshot_id FROM public.progress_invoice_series
        WHERE id = (SELECT id FROM task5_standalone_result)
      ),
      'number_source', 'latest',
      'idempotency_key', '82000000-0000-4000-8000-000000000017'
    )::TEXT
  ),
  '22023',
  'PROGRESS_VALIDATION_FAILED',
  'accepted-number command rejects string expected_version before numeric casting'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.accept_progress_jobber_invoice_number(%L::JSONB)',
    jsonb_build_object(
      'series_id', (SELECT id FROM task5_standalone_result),
      'expected_version', 2147483648,
      'observation_id', (
        SELECT current_jobber_snapshot_id FROM public.progress_invoice_series
        WHERE id = (SELECT id FROM task5_standalone_result)
      ),
      'number_source', 'latest',
      'idempotency_key', '82000000-0000-4000-8000-000000000018'
    )::TEXT
  ),
  '22023',
  'PROGRESS_VALIDATION_FAILED',
  'accepted-number command rejects expected_version integer overflow safely'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.accept_progress_jobber_invoice_number(%L::JSONB)',
    jsonb_build_object(
      'series_id', (SELECT id FROM task5_standalone_result),
      'expected_version', (
        SELECT version FROM public.progress_invoice_series
        WHERE id = (SELECT id FROM task5_standalone_result)
      ),
      'observation_id', 'not-a-uuid',
      'number_source', 'latest',
      'idempotency_key', '82000000-0000-4000-8000-000000000019'
    )::TEXT
  ),
  '22023',
  'PROGRESS_VALIDATION_FAILED',
  'accepted-number command rejects malformed observation UUID text safely'
);

RESET ROLE;

SELECT throws_ok(
  format(
    'SELECT * FROM public.link_progress_jobber_invoice(%L::JSONB)',
    (
      pg_temp.task7_link_payload(
        (SELECT id FROM task5_standalone_result),
        (
          SELECT version FROM public.progress_invoice_series
          WHERE id = (SELECT id FROM task5_standalone_result)
        ),
        '82000000-0000-4000-8000-000000000020',
        repeat('c', 64),
        pg_temp.task7_observation(
          repeat('f', 64),
          'INV-101',
          jsonb_build_array(pg_temp.task7_payment(
            'task7-payment-1', '300.00', 'EFT', 'RECEIPT-300'
          ))
        )
      ) || jsonb_build_object('actor_id', 'not-a-uuid')
    )::TEXT
  ),
  '22023',
  'PROGRESS_VALIDATION_FAILED',
  'service link rejects malformed actor UUID text before authority lookup'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.apply_progress_invoice_jobber_refresh(%L::JSONB)',
    jsonb_build_object(
      'actor_id', '00000000-0000-0000-0000-000000008101',
      'series_id', (SELECT id FROM task5_standalone_result),
      'expected_version', (
        SELECT version FROM public.progress_invoice_series
        WHERE id = (SELECT id FROM task5_standalone_result)
      ),
      'idempotency_key', 123,
      'request_fingerprint', repeat('c', 64),
      'observation', pg_temp.task7_observation(
        repeat('f', 64),
        'INV-101',
        jsonb_build_array(pg_temp.task7_payment(
          'task7-payment-1', '300.00', 'EFT', 'RECEIPT-300'
        ))
      )
    )::TEXT
  ),
  '22023',
  'PROGRESS_VALIDATION_FAILED',
  'service refresh rejects numeric JSON idempotency keys before casting'
);

SELECT throws_ok(
  format(
    'SELECT public.progress_validate_jobber_observation(%L::JSONB)',
    (
      pg_temp.task7_observation(repeat('f', 64), 'INV-STRICT', '[]'::JSONB)
      || jsonb_build_object(
        'client_email', NULL,
        'client_email_candidates', jsonb_build_array(
          'Accounts@example.test',
          'accounts@example.test'
        )
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'normalized email candidates reject case-insensitive duplicates'
);

SELECT throws_ok(
  format(
    'SELECT public.progress_validate_jobber_observation(%L::JSONB)',
    (
      pg_temp.task7_observation(repeat('f', 64), 'INV-STRICT', '[]'::JSONB)
      || jsonb_build_object(
        'client_email', NULL,
        'client_email_candidates', jsonb_build_array(123)
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'normalized email candidates require bounded strings'
);

SELECT throws_ok(
  format(
    'SELECT public.progress_validate_jobber_observation(%L::JSONB)',
    (
      pg_temp.task7_observation(repeat('f', 64), 'INV-STRICT', '[]'::JSONB)
      || jsonb_build_object(
        'client_phone', '0400000000',
        'client_phone_candidates', jsonb_build_array(
          jsonb_build_object(
            'number', '0400000000',
            'primary', true,
            'raw_label', 'secret'
          )
        )
      )
    )::TEXT
  ),
  '22023',
  'PROGRESS_PAYLOAD_UNKNOWN_KEYS',
  'normalized phone candidates enforce exact number/primary keys'
);

SELECT throws_ok(
  format(
    'SELECT public.progress_validate_jobber_observation(%L::JSONB)',
    (
      pg_temp.task7_observation(repeat('f', 64), 'INV-STRICT', '[]'::JSONB)
      || jsonb_build_object(
        'site_address_candidates', jsonb_build_array(
          jsonb_build_object('property_id', 'task7-property-1', 'address', 123),
          jsonb_build_object('property_id', 'task7-property-2', 'address', NULL)
        )
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'normalized site candidates require nullable bounded string addresses'
);

SELECT throws_ok(
  format(
    'SELECT public.progress_validate_jobber_observation(%L::JSONB)',
    (
      pg_temp.task7_observation(repeat('f', 64), 'INV-STRICT', '[]'::JSONB)
      || jsonb_build_object(
        'warnings', jsonb_build_array(
          jsonb_build_object(
            'code', 'unknown_payment_status',
            'payment_id', 123
          )
        )
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'normalized warnings require bounded string payment IDs when present'
);

SELECT throws_ok(
  format(
    'SELECT public.progress_validate_jobber_observation(%L::JSONB)',
    pg_temp.task7_observation(
      repeat('f', 64),
      'INV-STRICT',
      jsonb_build_array(
        pg_temp.task7_payment('strict-payment', '10.00', 'EFT', 'STRICT') - 'method'
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'normalized payments require every exact field including nullable method'
);

SELECT throws_ok(
  format(
    'SELECT public.progress_validate_jobber_observation(%L::JSONB)',
    pg_temp.task7_observation(
      repeat('f', 64),
      'INV-STRICT',
      jsonb_build_array(
        pg_temp.task7_payment('strict-payment', '10.00', 'EFT', 'STRICT')
          || jsonb_build_object('method', 123)
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'normalized nullable payment strings reject numeric JSON values'
);

SELECT throws_ok(
  format(
    'SELECT public.progress_validate_jobber_observation(%L::JSONB)',
    pg_temp.task7_observation(
      repeat('f', 64),
      'INV-STRICT',
      jsonb_build_array(
        pg_temp.task7_payment('duplicate-payment', '10.00', 'EFT', 'ONE'),
        pg_temp.task7_payment('duplicate-payment', '10.00', 'EFT', 'TWO')
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'normalized payments reject duplicate stable Jobber IDs'
);

SELECT throws_ok(
  format(
    'SELECT public.progress_validate_jobber_observation(%L::JSONB)',
    (
      pg_temp.task7_observation(repeat('f', 64), 'INV-STRICT', '[]'::JSONB)
      || jsonb_build_object(
        'job_ids', jsonb_build_array('task7-only-job'),
        'selected_job_id', NULL
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'a sole Jobber job candidate must be selected explicitly by the normalized contract'
);

SELECT throws_ok(
  format(
    'SELECT public.progress_validate_jobber_observation(%L::JSONB)',
    (
      pg_temp.task7_observation(repeat('f', 64), 'INV-STRICT', '[]'::JSONB)
      || jsonb_build_object(
        'property_ids', jsonb_build_array('task7-only-property'),
        'site_address_candidates', jsonb_build_array(
          jsonb_build_object(
            'property_id', 'task7-only-property',
            'address', 'Only Site Address'
          )
        ),
        'selected_property_id', NULL
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'a sole Jobber property candidate must be selected explicitly by the normalized contract'
);

INSERT INTO public.progress_claims (
  series_id,
  sequence,
  kind,
  suffix,
  tax_invoice_number,
  created_by,
  updated_by
) VALUES (
  (SELECT id FROM task5_standalone_result),
  1,
  'progress',
  'P01',
  'INV-101-P01',
  '00000000-0000-0000-0000-000000008101',
  '00000000-0000-0000-0000-000000008101'
);

-- Task 7 behavior assertion 25
SELECT throws_ok(
  format(
    'SELECT * FROM public.link_progress_jobber_invoice(%L::JSONB)',
    pg_temp.task7_link_payload(
      (SELECT id FROM task5_standalone_result),
      (
        SELECT version FROM public.progress_invoice_series
        WHERE id = (SELECT id FROM task5_standalone_result)
      ),
      '82000000-0000-4000-8000-000000000009',
      repeat('6', 64),
      pg_temp.task7_observation(repeat('e', 64), 'INV-102', '[]'::JSONB)
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_LINK_LOCKED',
  'any existing Claim permanently locks relink and selector correction'
);

SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000008101',
  false
);

-- Task 7 behavior assertion 26
SELECT throws_ok(
  format(
    'SELECT * FROM public.accept_progress_jobber_invoice_number(%L::JSONB)',
    jsonb_build_object(
      'series_id', (SELECT id FROM task5_standalone_result),
      'expected_version', (
        SELECT version FROM public.progress_invoice_series
        WHERE id = (SELECT id FROM task5_standalone_result)
      ),
      'observation_id', (
        SELECT current_jobber_snapshot_id FROM public.progress_invoice_series
        WHERE id = (SELECT id FROM task5_standalone_result)
      ),
      'number_source', 'original',
      'idempotency_key', '82000000-0000-4000-8000-000000000010'
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_LINK_LOCKED',
  'any existing Claim permanently locks accepted-number changes'
);

RESET ROLE;

-- Task 7 behavior assertion 27
SELECT lives_ok(
  format(
    'SELECT * FROM public.link_progress_jobber_invoice(%L::JSONB)',
    (SELECT payload::TEXT FROM task7_initial_link_payload)
  ),
  'exact pre-lock replay remains valid after a Claim exists'
);

-- Task 7 behavior assertion 28
SELECT throws_ok(
  format(
    'SELECT * FROM public.record_progress_jobber_refresh_failure(%L::JSONB)',
    jsonb_build_object(
      'actor_id', '00000000-0000-0000-0000-000000008101',
      'series_id', (SELECT id FROM task5_standalone_result),
      'expected_version', (
        SELECT version FROM public.progress_invoice_series
        WHERE id = (SELECT id FROM task5_standalone_result)
      ),
      'jobber_account_id', 'task7-account',
      'jobber_invoice_id', 'task7-invoice',
      'idempotency_key', '82000000-0000-4000-8000-000000000011',
      'error_code', 'JOBBER_RATE_LIMITED',
      'raw_message', 'forged secret'
    )::TEXT
  ),
  '22023',
  'PROGRESS_PAYLOAD_UNKNOWN_KEYS',
  'failure RPC rejects raw-message and unknown payload fields'
);

CREATE TEMP TABLE task7_adjusted_overflow_series (id UUID PRIMARY KEY);
WITH inserted AS (
  INSERT INTO public.progress_invoice_series (
    source_type,
    base_contract_ex_gst,
    recipient_name,
    recipient_address,
    site_name,
    site_address,
    default_description,
    created_by,
    updated_by
  ) VALUES (
    'jobber_invoice',
    999999999999.99,
    'Overflow Recipient',
    'Overflow Address',
    'Overflow Site',
    'Overflow Site Address',
    'Overflow Test',
    '00000000-0000-0000-0000-000000008101',
    '00000000-0000-0000-0000-000000008101'
  )
  RETURNING id
)
INSERT INTO task7_adjusted_overflow_series (id)
SELECT id FROM inserted;

-- Task 7 behavior assertion 29
SELECT throws_ok(
  format(
    'SELECT * FROM public.link_progress_jobber_invoice(%L::JSONB)',
    pg_temp.task7_link_payload(
      (SELECT id FROM task7_adjusted_overflow_series),
      1,
      '82000000-0000-4000-8000-000000000012',
      repeat('7', 64),
      pg_temp.task7_observation(repeat('f', 64), 'INV-OVERFLOW', '[]'::JSONB)
        || jsonb_build_object(
          'account_id', 'overflow-account',
          'invoice_id', 'overflow-invoice'
        )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'adjusted-contract cache overflow raises one safe error'
);

-- Task 7 behavior assertion 30
SELECT is(
  (
    SELECT jsonb_build_object(
      'linked', series.jobber_invoice_id IS NOT NULL,
      'version', series.version,
      'snapshots', (
        SELECT count(*) FROM public.progress_jobber_invoice_snapshots
        WHERE series_id = series.id
      ),
      'payments', (
        SELECT count(*) FROM public.progress_payments WHERE series_id = series.id
      ),
      'events', (
        SELECT count(*) FROM public.progress_invoice_events WHERE series_id = series.id
      )
    )
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM task7_adjusted_overflow_series)
  ),
  jsonb_build_object(
    'linked', false,
    'version', 1,
    'snapshots', 0,
    'payments', 0,
    'events', 0
  ),
  'late adjusted-contract overflow rolls back link, observation, ledger, and audit'
);

CREATE TEMP TABLE task7_receipt_overflow_series (id UUID PRIMARY KEY);
WITH inserted AS (
  INSERT INTO public.progress_invoice_series (
    source_type,
    base_contract_ex_gst,
    recipient_name,
    recipient_address,
    site_name,
    site_address,
    default_description,
    created_by,
    updated_by
  ) VALUES (
    'jobber_invoice',
    100.00,
    'Receipt Overflow Recipient',
    'Receipt Overflow Address',
    'Receipt Overflow Site',
    'Receipt Overflow Site Address',
    'Receipt Overflow Test',
    '00000000-0000-0000-0000-000000008101',
    '00000000-0000-0000-0000-000000008101'
  )
  RETURNING id
)
INSERT INTO task7_receipt_overflow_series (id)
SELECT id FROM inserted;

-- Task 7 behavior assertion 31
SELECT throws_ok(
  format(
    'SELECT * FROM public.link_progress_jobber_invoice(%L::JSONB)',
    pg_temp.task7_link_payload(
      (SELECT id FROM task7_receipt_overflow_series),
      1,
      '82000000-0000-4000-8000-000000000013',
      repeat('8', 64),
      pg_temp.task7_observation(
        repeat('0', 64),
        'INV-RECEIPT-OVERFLOW',
        jsonb_build_array(
          pg_temp.task7_payment('overflow-payment-1', '600000000000.00', 'EFT', 'ONE'),
          pg_temp.task7_payment('overflow-payment-2', '600000000000.00', 'EFT', 'TWO')
        )
      ) || jsonb_build_object(
        'account_id', 'receipt-overflow-account',
        'invoice_id', 'receipt-overflow-invoice'
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'aggregate signed receipt overflow is rejected before cached assignment'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'linked', series.jobber_invoice_id IS NOT NULL,
      'version', series.version,
      'snapshots', (
        SELECT count(*) FROM public.progress_jobber_invoice_snapshots
        WHERE series_id = series.id
      ),
      'payments', (
        SELECT count(*) FROM public.progress_payments WHERE series_id = series.id
      ),
      'events', (
        SELECT count(*) FROM public.progress_invoice_events WHERE series_id = series.id
      )
    )
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM task7_receipt_overflow_series)
  ),
  jsonb_build_object(
    'linked', false,
    'version', 1,
    'snapshots', 0,
    'payments', 0,
    'events', 0
  ),
  'aggregate receipt overflow rolls back link, observations, ledger, and audit'
);

CREATE TEMP TABLE task7_negative_series AS
SELECT pg_temp.task7_create_series('Task 7 Negative Receipts') AS id;

SELECT *
FROM public.link_progress_jobber_invoice(
  pg_temp.task7_link_payload(
    (SELECT id FROM task7_negative_series),
    1,
    '82000000-0000-4000-8000-000000000021',
    repeat('d', 64),
    pg_temp.task7_observation(
      repeat('1', 64),
      'INV-NEGATIVE',
      jsonb_build_array(
        pg_temp.task7_payment('negative-receipt', '50.00', 'EFT', 'RECEIPT'),
        pg_temp.task7_payment(
          'negative-refund', '-80.00', 'EFT', 'REFUND', 'refund'
        ),
        pg_temp.task7_payment(
          'negative-reversal', '-20.00', 'EFT', 'REVERSAL', 'reversal'
        )
      )
    ) || jsonb_build_object(
      'account_id', 'negative-account',
      'invoice_id', 'negative-invoice'
    )
  )
);

SELECT is(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', payment.jobber_payment_id,
        'direction', revision.direction,
        'effect', revision.effective_receipt_amount
      )
      ORDER BY payment.jobber_payment_id
    )
    FROM public.progress_payments AS payment
    JOIN public.progress_payment_revisions AS revision
      ON revision.id = payment.current_revision_id
    WHERE payment.series_id = (SELECT id FROM task7_negative_series)
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'negative-receipt', 'direction', 'receipt', 'effect', 50.00::NUMERIC
    ),
    jsonb_build_object(
      'id', 'negative-refund', 'direction', 'refund', 'effect', -80.00::NUMERIC
    ),
    jsonb_build_object(
      'id', 'negative-reversal', 'direction', 'reversal', 'effect', -20.00::NUMERIC
    )
  ),
  'refund and failed-payment reversal revisions preserve their signed effects'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'receipts', current_actual_receipts,
      'outstanding', current_outstanding_receivable,
      'credit', current_credit_balance,
      'state', current_payment_state
    )
    FROM public.progress_invoice_series
    WHERE id = (SELECT id FROM task7_negative_series)
  ),
  jsonb_build_object(
    'receipts', -50.00::NUMERIC,
    'outstanding', 50.00::NUMERIC,
    'credit', 0.00::NUMERIC,
    'state', 'unpaid'
  ),
  'negative net receipts remain a signed deficit without creating phantom overdue'
);

CREATE TEMP TABLE task7_duplicate_first_series AS
SELECT pg_temp.task7_create_series('Task 7 Duplicate First Link') AS id;

SELECT throws_ok(
  format(
    'SELECT * FROM public.link_progress_jobber_invoice(%L::JSONB)',
    pg_temp.task7_link_payload(
      (SELECT id FROM task7_duplicate_first_series),
      1,
      '82000000-0000-4000-8000-000000000022',
      repeat('e', 64),
      pg_temp.task7_observation(repeat('2', 64), 'INV-DUPLICATE', '[]'::JSONB)
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'first link rejects an account and invoice identity owned by another active series'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'linked', jobber_invoice_id IS NOT NULL,
      'version', version,
      'snapshots', (
        SELECT count(*) FROM public.progress_jobber_invoice_snapshots
        WHERE series_id = series.id
      ),
      'payments', (
        SELECT count(*) FROM public.progress_payments WHERE series_id = series.id
      ),
      'events', (
        SELECT count(*) FROM public.progress_invoice_events WHERE series_id = series.id
      )
    )
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM task7_duplicate_first_series)
  ),
  jsonb_build_object(
    'linked', false,
    'version', 1,
    'snapshots', 0,
    'payments', 0,
    'events', 0
  ),
  'duplicate first-link conflict leaves the target series wholly unchanged'
);

CREATE TEMP TABLE task7_duplicate_relink_series AS
SELECT pg_temp.task7_create_series('Task 7 Duplicate Relink') AS id;

SELECT *
FROM public.link_progress_jobber_invoice(
  pg_temp.task7_link_payload(
    (SELECT id FROM task7_duplicate_relink_series),
    1,
    '82000000-0000-4000-8000-000000000023',
    repeat('f', 64),
    pg_temp.task7_observation(repeat('3', 64), 'INV-ORIGINAL', '[]'::JSONB)
      || jsonb_build_object(
        'account_id', 'relink-original-account',
        'invoice_id', 'relink-original-invoice'
      )
  )
);

CREATE TEMP TABLE task7_before_duplicate_relink AS
SELECT jsonb_build_object(
  'series', to_jsonb(series),
  'snapshots', (
    SELECT count(*) FROM public.progress_jobber_invoice_snapshots
    WHERE series_id = series.id
  ),
  'payments', (
    SELECT count(*) FROM public.progress_payments WHERE series_id = series.id
  ),
  'events', (
    SELECT count(*) FROM public.progress_invoice_events WHERE series_id = series.id
  )
) AS state
FROM public.progress_invoice_series AS series
WHERE series.id = (SELECT id FROM task7_duplicate_relink_series);

SELECT throws_ok(
  format(
    'SELECT * FROM public.link_progress_jobber_invoice(%L::JSONB)',
    pg_temp.task7_link_payload(
      (SELECT id FROM task7_duplicate_relink_series),
      (
        SELECT version FROM public.progress_invoice_series
        WHERE id = (SELECT id FROM task7_duplicate_relink_series)
      ),
      '82000000-0000-4000-8000-000000000024',
      repeat('0', 64),
      pg_temp.task7_observation(repeat('4', 64), 'INV-DUPLICATE', '[]'::JSONB)
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'relink rejects an account and invoice identity owned by another active series'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'series', to_jsonb(series),
      'snapshots', (
        SELECT count(*) FROM public.progress_jobber_invoice_snapshots
        WHERE series_id = series.id
      ),
      'payments', (
        SELECT count(*) FROM public.progress_payments WHERE series_id = series.id
      ),
      'events', (
        SELECT count(*) FROM public.progress_invoice_events WHERE series_id = series.id
      )
    )
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM task7_duplicate_relink_series)
  ),
  (SELECT state FROM task7_before_duplicate_relink),
  'duplicate relink conflict preserves the original identity and all evidence atomically'
);

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
