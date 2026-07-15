CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(56);

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
