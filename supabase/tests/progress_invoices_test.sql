CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(434);

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
  requested_abn TEXT DEFAULT '99 000 000 000',
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

CREATE FUNCTION pg_temp.task2_payment(
  requested_id TEXT,
  requested_amount TEXT,
  requested_method TEXT,
  requested_reference TEXT
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'jobber_payment_id', requested_id,
    'source', 'payment_record',
    'raw_adjustment_type', 'PAYMENT',
    'raw_signed_amount', requested_amount,
    'absolute_amount', requested_amount,
    'direction', 'receipt',
    'effective_amount', requested_amount,
    'entry_date', '2026-01-02',
    'method', requested_method,
    'reference', requested_reference,
    'external_status', 'SUCCEEDED',
    'external_updated_at', NULL,
    'treatment', 'active'
  );
$$;

CREATE FUNCTION pg_temp.manual_series_payload(
  requested_correlation_key UUID,
  requested_numbering_base TEXT DEFAULT '2906',
  requested_contract TEXT DEFAULT '17220.50'
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'source_type', 'manual',
    'gst_rate', '0.10',
    'accepted_numbering_base', requested_numbering_base,
    'base_contract_ex_gst', requested_contract,
    'recipient_name', 'Manual Builder',
    'recipient_company', NULL,
    'recipient_address', '1 Billing Street',
    'recipient_email', NULL,
    'recipient_phone', NULL,
    'recipient_abn', NULL,
    'site_name', 'Manual Site',
    'site_address', '4 Site Street',
    'default_description', 'Progress painting works',
    'reference', NULL,
    'correlation_key', requested_correlation_key
  );
$$;

CREATE FUNCTION pg_temp.task2_observation(
  requested_fingerprint TEXT,
  requested_invoice_number TEXT,
  requested_payments JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'account_id', 'task2-standalone-account',
    'invoice_id', 'task2-standalone-invoice',
    'invoice_number', requested_invoice_number,
    'raw_status', 'awaiting_payment',
    'normalized_status', 'awaiting_payment',
    'jobber_web_uri', 'https://secure.getjobber.com/invoices/task2-standalone-invoice',
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
    'client_id', 'task2-client',
    'client_name', 'Task 2 Builder',
    'client_company_name', 'Task 2 Builder Pty Ltd',
    'client_email', 'accounts@example.test',
    'client_phone', NULL,
    'client_email_candidates', jsonb_build_array('accounts@example.test'),
    'client_phone_candidates', jsonb_build_array(
      jsonb_build_object('number', '0400000000', 'primary', true),
      jsonb_build_object('number', '0411111111', 'primary', true)
    ),
    'billing_address', '1 Billing Street, Sydney NSW 2000, Australia',
    'job_ids', jsonb_build_array('task2-job-1', 'task2-job-2'),
    'property_ids', jsonb_build_array('task2-property-1', 'task2-property-2'),
    'site_address_candidates', jsonb_build_array(
      jsonb_build_object(
        'property_id', 'task2-property-1',
        'address', '4 Curra Close, Frenchs Forest NSW 2086, Australia'
      ),
      jsonb_build_object('property_id', 'task2-property-2', 'address', NULL)
    ),
    'selected_job_id', 'task2-job-2',
    'selected_property_id', 'task2-property-1',
    'effective_graphql_version', '2025-04-16',
    'payment_eligibility_policy_version', '2026-07-v1',
    'fetched_at', '2026-01-02T01:00:00Z',
    'response_fingerprint', requested_fingerprint,
    'warnings', '[]'::JSONB,
    'payments', requested_payments
  );
$$;

CREATE FUNCTION pg_temp.task2_standalone_import_payload(
  requested_key UUID,
  requested_fingerprint TEXT,
  requested_observation JSONB,
  requested_recipient_name TEXT DEFAULT 'Edited Builder'
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'actor_id', '00000000-0000-0000-0000-000000008001',
    'correlation_key', requested_key,
    'request_fingerprint', requested_fingerprint,
    'series', jsonb_build_object(
      'source_type', 'jobber_invoice',
      'quote_id', NULL,
      'base_contract_ex_gst', '17220.50',
      'gst_rate', '0.10',
      'recipient_name', requested_recipient_name,
      'recipient_company', NULL,
      'recipient_address', 'Edited billing address',
      'recipient_email', NULL,
      'recipient_phone', NULL,
      'recipient_abn', NULL,
      'site_name', 'Edited site',
      'site_address', 'Edited site address',
      'default_description', 'Progress painting works',
      'reference', 'Jobber 2906',
      'correlation_key', requested_key
    ),
    'observation', requested_observation
  );
$$;

CREATE TEMP TABLE task2_standalone_import_payload AS
SELECT pg_temp.task2_standalone_import_payload(
  '82000000-0000-4000-8000-000000000101',
  repeat('1', 64),
  pg_temp.task2_observation(
    repeat('5', 64),
    'INV-STANDALONE',
    jsonb_build_array(
      pg_temp.task2_payment('standalone-payment-1', '125.00', 'EFT', 'ONE'),
      pg_temp.task2_payment('standalone-payment-2', '150.00', 'CARD', 'TWO')
    )
  ) || jsonb_build_object(
    'account_id', 'task2-standalone-account',
    'invoice_id', 'task2-standalone-invoice'
  )
) AS payload;

CREATE TEMP TABLE task2_standalone_import_result AS
SELECT *
FROM public.create_progress_invoice_series_from_jobber(
  (SELECT payload FROM task2_standalone_import_payload)
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'version', result.version,
      'snapshot_matches', result.snapshot_id = series.current_jobber_snapshot_id,
      'imported_payments', result.imported_payments,
      'series_rows', (
        SELECT count(*) FROM public.progress_invoice_series
        WHERE id = result.series_id
      ),
      'snapshot_rows', (
        SELECT count(*) FROM public.progress_jobber_invoice_snapshots
        WHERE series_id = result.series_id
      ),
      'payment_rows', (
        SELECT count(*) FROM public.progress_payments
        WHERE series_id = result.series_id
      ),
      'revision_rows', (
        SELECT count(*)
        FROM public.progress_payment_revisions AS revision
        JOIN public.progress_payments AS payment ON payment.id = revision.payment_id
        WHERE payment.series_id = result.series_id
      )
    )
    FROM task2_standalone_import_result AS result
    JOIN public.progress_invoice_series AS series ON series.id = result.series_id
  ),
  jsonb_build_object(
    'version', 1,
    'snapshot_matches', true,
    'imported_payments', 2,
    'series_rows', 1,
    'snapshot_rows', 1,
    'payment_rows', 2,
    'revision_rows', 2
  ),
  'standalone import atomically creates one series, snapshot, and payment revisions'
);

SELECT is(
  (
    SELECT jsonb_agg(payment.jobber_payment_id ORDER BY payment.jobber_payment_id)
    FROM public.progress_payments AS payment
    WHERE payment.series_id = (SELECT series_id FROM task2_standalone_import_result)
  ),
  jsonb_build_array('standalone-payment-1', 'standalone-payment-2'),
  'standalone import preserves stable Jobber payment identities'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'series_recipient', series.recipient_name,
      'series_address', series.recipient_address,
      'series_site', series.site_name,
      'series_site_address', series.site_address,
      'snapshot_client', snapshot.client_name,
      'snapshot_billing', snapshot.billing_address,
      'snapshot_property', snapshot.property_address
    )
    FROM public.progress_invoice_series AS series
    JOIN public.progress_jobber_invoice_snapshots AS snapshot
      ON snapshot.id = series.current_jobber_snapshot_id
    WHERE series.id = (SELECT series_id FROM task2_standalone_import_result)
  ),
  jsonb_build_object(
    'series_recipient', 'Edited Builder',
    'series_address', 'Edited billing address',
    'series_site', 'Edited site',
    'series_site_address', 'Edited site address',
    'snapshot_client', 'Task 2 Builder',
    'snapshot_billing', '1 Billing Street, Sydney NSW 2000, Australia',
    'snapshot_property', '4 Curra Close, Frenchs Forest NSW 2086, Australia'
  ),
  'edited series fields remain distinct from immutable Jobber observation fields'
);

SELECT is(
  (
    SELECT to_jsonb(replayed)
    FROM public.create_progress_invoice_series_from_jobber(
      (SELECT payload FROM task2_standalone_import_payload)
    ) AS replayed
  ),
  (SELECT to_jsonb(original) FROM task2_standalone_import_result AS original),
  'exact standalone import retry returns the prior result'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'series', count(DISTINCT series.id),
      'snapshots', count(DISTINCT snapshot.id),
      'payments', count(DISTINCT payment.id),
      'events', count(DISTINCT event.id)
    )
    FROM public.progress_invoice_series AS series
    LEFT JOIN public.progress_jobber_invoice_snapshots AS snapshot ON snapshot.series_id = series.id
    LEFT JOIN public.progress_payments AS payment ON payment.series_id = series.id
    LEFT JOIN public.progress_invoice_events AS event
      ON event.series_id = series.id
     AND event.command_name = 'create_progress_invoice_series_from_jobber'
    WHERE series.id = (SELECT series_id FROM task2_standalone_import_result)
  ),
  jsonb_build_object('series', 1, 'snapshots', 1, 'payments', 2, 'events', 1),
  'exact standalone import retry appends no extra rows'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.create_progress_invoice_series_from_jobber(%L::JSONB)',
    pg_temp.task2_standalone_import_payload(
      '82000000-0000-4000-8000-000000000101',
      repeat('2', 64),
      (SELECT payload -> 'observation' FROM task2_standalone_import_payload),
      'Different Edited Builder'
    )::TEXT
  ),
  'P0001',
  'IDEMPOTENCY_KEY_REUSED',
  'same standalone import key with different editable input is rejected'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.create_progress_invoice_series_from_jobber(%L::JSONB)',
    pg_temp.task2_standalone_import_payload(
      '82000000-0000-4000-8000-000000000102',
      repeat('3', 64),
      (SELECT payload -> 'observation' FROM task2_standalone_import_payload)
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'duplicate non-void standalone Jobber identity is rejected'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.progress_invoice_series
    WHERE jobber_account_id = 'task2-standalone-account'
      AND jobber_invoice_id = 'task2-standalone-invoice'
      AND status <> 'void'
  ),
  1::BIGINT,
  'duplicate standalone identity rejection leaves no second series'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.create_progress_invoice_series_from_jobber(%L::JSONB)',
    pg_temp.task2_standalone_import_payload(
      '82000000-0000-4000-8000-000000000103',
      repeat('4', 64),
      (
        pg_temp.task2_observation(
          repeat('6', 64),
          'INV-BAD-PAYMENT',
          jsonb_build_array(
            pg_temp.task2_payment('standalone-bad-payment', '10.00', 'EFT', 'BAD')
              || jsonb_build_object('effective_amount', '999.00')
          )
        ) || jsonb_build_object(
          'account_id', 'task2-bad-payment-account',
          'invoice_id', 'task2-bad-payment-invoice'
        )
      )
    )::TEXT
  ),
  'P0001',
  'PROGRESS_JOBBER_ERROR',
  'invalid standalone payment observation rejects the command'
);

SELECT is(
  (
    SELECT count(*) FROM public.progress_invoice_series
    WHERE jobber_account_id = 'task2-bad-payment-account'
  ),
  0::BIGINT,
  'invalid standalone payment observation rolls back the series'
);

SELECT is(
  has_function_privilege(
    'service_role',
    'public.create_progress_invoice_series_from_jobber(jsonb)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.create_progress_invoice_series_from_jobber(jsonb)',
      'EXECUTE'
    ),
  true,
  'standalone Jobber import RPC is executable only by service_role'
);

ALTER TABLE public.progress_invoice_events
  DISABLE TRIGGER trg_progress_invoice_events_append_only;
DELETE FROM public.progress_invoice_events
WHERE series_id = (SELECT series_id FROM task2_standalone_import_result);
ALTER TABLE public.progress_invoice_events
  ENABLE TRIGGER trg_progress_invoice_events_append_only;

BEGIN;
SET CONSTRAINTS ALL DEFERRED;
ALTER TABLE public.progress_payment_revisions
  DISABLE TRIGGER trg_progress_payment_revisions_immutable;
UPDATE public.progress_payments
SET current_revision_id = NULL
WHERE series_id = (SELECT series_id FROM task2_standalone_import_result);
DELETE FROM public.progress_payment_revisions AS revision
USING public.progress_payments AS payment
WHERE revision.payment_id = payment.id
  AND payment.series_id = (SELECT series_id FROM task2_standalone_import_result);
ALTER TABLE public.progress_payments
  DISABLE TRIGGER trg_progress_payments_protect_identity;
DELETE FROM public.progress_payments
WHERE series_id = (SELECT series_id FROM task2_standalone_import_result);
ALTER TABLE public.progress_payments
  ENABLE TRIGGER trg_progress_payments_protect_identity;
ALTER TABLE public.progress_payment_revisions
  ENABLE TRIGGER trg_progress_payment_revisions_immutable;
COMMIT;

UPDATE public.progress_invoice_series
SET current_jobber_snapshot_id = NULL
WHERE id = (SELECT series_id FROM task2_standalone_import_result);
ALTER TABLE public.progress_jobber_invoice_snapshots
  DISABLE TRIGGER trg_progress_jobber_snapshots_immutable;
DELETE FROM public.progress_jobber_invoice_snapshots
WHERE series_id = (SELECT series_id FROM task2_standalone_import_result);
ALTER TABLE public.progress_jobber_invoice_snapshots
  ENABLE TRIGGER trg_progress_jobber_snapshots_immutable;
ALTER TABLE public.progress_invoice_numbering_base_reservations
  DISABLE TRIGGER trg_progress_numbering_base_reservation_protect;
DELETE FROM public.progress_invoice_numbering_base_reservations
WHERE series_id = (SELECT series_id FROM task2_standalone_import_result);
ALTER TABLE public.progress_invoice_numbering_base_reservations
  ENABLE TRIGGER trg_progress_numbering_base_reservation_protect;
ALTER TABLE public.progress_invoice_series
  DISABLE TRIGGER trg_progress_series_locked_link;
ALTER TABLE public.progress_invoice_series
  DISABLE TRIGGER trg_progress_series_sync_numbering_base;
DELETE FROM public.progress_invoice_series
WHERE id = (SELECT series_id FROM task2_standalone_import_result);
ALTER TABLE public.progress_invoice_series
  ENABLE TRIGGER trg_progress_series_sync_numbering_base;
ALTER TABLE public.progress_invoice_series
  ENABLE TRIGGER trg_progress_series_locked_link;

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
        '99000000000',
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
  (SELECT abn FROM public.business_invoice_profiles),
  '99000000000',
  'first save canonicalizes a formatted checksum-valid supplier ABN'
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
      pg_temp.profile_payload('Paint Buddy & Co Updated', '43123456783', 21, 1)
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
  (SELECT abn FROM public.business_invoice_profiles),
  '43123456783',
  'profile updates store a distinct checksum-valid supplier ABN canonically'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      (
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
        pg_temp.profile_payload('Safe Base', '99000000000', 14, 2)
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
      pg_temp.profile_payload('Stale Overwrite', '99000000000', 14, 1)::TEXT
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
      pg_temp.profile_payload('Bad Checksum', '99000000001', 14, 2)::TEXT
    )
  ),
  '23514',
  'the database boundary rejects a checksum-invalid eleven-digit supplier ABN'
);

SELECT is(
  (SELECT abn FROM public.business_invoice_profiles),
  '43123456783',
  'a checksum-invalid supplier ABN leaves the canonical profile unchanged'
);

SELECT is(
  pg_temp.capture_sqlstate(
    format(
      'SELECT * FROM public.save_business_invoice_profile(%L::JSONB)',
      pg_temp.profile_payload('Bad Terms', '99000000000', 366, 2)::TEXT
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
        pg_temp.profile_payload('Forged Actor', '99000000000', 14, 2)
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

SELECT has_function(
  'public',
  'progress_canonicalize_supplier_abn',
  ARRAY['text'],
  'the private supplier ABN helper exists with the approved signature'
);

SELECT is(
  (
    SELECT routine.provolatile = 'i'
      AND routine.proconfig @> ARRAY['search_path=""']::TEXT[]
    FROM pg_proc AS routine
    WHERE routine.oid = to_regprocedure('public.progress_canonicalize_supplier_abn(text)')
  ),
  true,
  'the supplier ABN helper is immutable with a fixed empty search path'
);

SELECT is(
  NOT has_function_privilege('anon', to_regprocedure('public.progress_canonicalize_supplier_abn(text)'), 'EXECUTE')
    AND NOT has_function_privilege('authenticated', to_regprocedure('public.progress_canonicalize_supplier_abn(text)'), 'EXECUTE')
    AND NOT has_function_privilege('service_role', to_regprocedure('public.progress_canonicalize_supplier_abn(text)'), 'EXECUTE'),
  true,
  'the supplier ABN helper grants no API-role execution'
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
            'abn', '99000000000',
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
        'abn', '43123456783',
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
  NOT has_function_privilege('anon', 'public.create_progress_invoice_series(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.create_progress_invoice_series(jsonb)', 'EXECUTE'),
  'anon and authenticated cannot execute the legacy create-series RPC'
);

-- Task 5 assertion 03
SELECT ok(
  NOT has_function_privilege('service_role', 'public.create_progress_invoice_series(jsonb)', 'EXECUTE'),
  'service_role is not an alternate series write surface'
);

RESET ROLE;
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

GRANT ALL ON task5_standalone_result, task5_quote_result TO authenticated;

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

INSERT INTO public.progress_invoice_templates (
  id, version, status, source_evidence_path, source_byte_length, source_sha256,
  normalized_master_path, normalized_sha256, logo_sha256, manifest_version,
  cell_map_version, page_layout_version, font_version, font_regular_sha256,
  font_bold_sha256, manifest, registered_by
) VALUES (
  '00000000-0000-0000-0000-000000008129', 1, 'pending', 'task2/source.xlsx', 1, repeat('1', 64),
  'task2/master.xlsx', repeat('2', 64), repeat('3', 64), 'v1', 'v1', 'v1', 'v1',
  repeat('4', 64), repeat('5', 64), '{}'::JSONB, '00000000-0000-0000-0000-000000008101'
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
  calculation_policy_version, template_id, template_version,
  edit_classification, financial_snapshot_hash, created_by
) VALUES (
  '00000000-0000-0000-0000-000000008131', '00000000-0000-0000-0000-000000008130',
  1, 'issued', 'current_claim_amount', 990, '2026-07-16', '2026-07-30', 'Issued works',
  1, 'Paint Buddy & Co Pty Ltd', 'Paint Buddy & Co', '12345678901', '', '1 Supplier Street',
  '0400000000', 'accounts@example.test', 'Bank', '000-000', 'Paint Buddy & Co', '00000000', 14,
  'Task 5 Builder', '1 Billing Street', 'Task 5 Site', '2 Site Street', 'task5-account',
  'task5-invoice', 'INV-TASK5', 'INV-TASK5', 'INV-TASK5', 1050, 105, 1155,
  900, 90, 990, 900, 90, 990, 85.714286, 150, 15, 165,
  'v1', '00000000-0000-0000-0000-000000008129', 1,
  'clerical', repeat('a', 64), '00000000-0000-0000-0000-000000008101'
);

UPDATE public.progress_claims SET
  current_revision_id = '00000000-0000-0000-0000-000000008131',
  status = 'issued', original_issued_at = now()
WHERE id = '00000000-0000-0000-0000-000000008130';

INSERT INTO public.progress_invoice_revision_sets (
  id, series_id, set_number, revision_manifest, state,
  aggregate_financial_manifest_hash, created_by, published_at
) VALUES (
  '00000000-0000-0000-0000-000000008132', (SELECT id FROM task5_standalone_result), 1,
  '[{"claim_id":"00000000-0000-0000-0000-000000008130","revision_id":"00000000-0000-0000-0000-000000008131"}]',
  'current', repeat('9', 64), '00000000-0000-0000-0000-000000008101', now()
);
UPDATE public.progress_invoice_series
SET current_revision_set_id = '00000000-0000-0000-0000-000000008132'
WHERE id = (SELECT id FROM task5_standalone_result);

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

CREATE TEMP TABLE task5_partial_receipt AS
SELECT * FROM public.create_manual_progress_payment(jsonb_build_object(
  'series_id',(SELECT id FROM task5_standalone_result),
  'expected_series_version',(SELECT version FROM public.progress_invoice_series WHERE id=(SELECT id FROM task5_standalone_result)),
  'received_date','2026-07-20','amount','100.00','method','EFT','reference','PARTIAL',
  'correlation_key','81000000-0000-4000-8000-000000000021'
));
SELECT is((
  SELECT current_actual_receipts=100 AND current_outstanding_receivable=890
    AND current_credit_balance=0 AND current_payment_state='part_paid'
  FROM public.progress_invoice_series WHERE id=(SELECT id FROM task5_standalone_result)
),true,'Current-manifest Claim cache records a partial actual receipt');

CREATE TEMP TABLE task5_full_receipt AS
SELECT * FROM public.create_manual_progress_payment(jsonb_build_object(
  'series_id',(SELECT id FROM task5_standalone_result),
  'expected_series_version',(SELECT version FROM public.progress_invoice_series WHERE id=(SELECT id FROM task5_standalone_result)),
  'received_date','2026-07-20','amount','890.00','method','EFT','reference','FULL',
  'correlation_key','81000000-0000-4000-8000-000000000022'
));
SELECT is((
  SELECT current_actual_receipts=990 AND current_outstanding_receivable=0
    AND current_credit_balance=0 AND current_payment_state='paid'
  FROM public.progress_invoice_series WHERE id=(SELECT id FROM task5_standalone_result)
),true,'Current-manifest Claim cache records full payment exactly');

CREATE TEMP TABLE task5_overpayment AS
SELECT * FROM public.create_manual_progress_payment(jsonb_build_object(
  'series_id',(SELECT id FROM task5_standalone_result),
  'expected_series_version',(SELECT version FROM public.progress_invoice_series WHERE id=(SELECT id FROM task5_standalone_result)),
  'received_date','2026-07-20','amount','10.00','method','EFT','reference','OVER',
  'correlation_key','81000000-0000-4000-8000-000000000023'
));
SELECT is((
  SELECT current_actual_receipts=1000 AND current_outstanding_receivable=0
    AND current_credit_balance=10 AND current_payment_state='credit_balance'
  FROM public.progress_invoice_series WHERE id=(SELECT id FROM task5_standalone_result)
),true,'Current-manifest Claim cache exposes uncapped overpayment as Credit Balance');

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
        'public.create_manual_progress_invoice_series(jsonb)',
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
    'CREATE TEMP TABLE first_create_result AS SELECT * FROM public.create_manual_progress_invoice_series(%L::JSONB)',
    pg_temp.manual_series_payload(
      '81000000-0000-4000-8000-000000000030',
      'TASK5-CONCURRENT'
    )::TEXT
  )
);
SELECT extensions.dblink_exec('task5_create_b', 'BEGIN');
SELECT extensions.dblink_exec('task5_create_b', 'SET LOCAL ROLE authenticated');
SELECT extensions.dblink_exec('task5_create_b', $$SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000008101'$$);
SELECT extensions.dblink_send_query(
  'task5_create_b',
  format(
    'SELECT id::TEXT, version FROM public.create_manual_progress_invoice_series(%L::JSONB)',
    pg_temp.manual_series_payload(
      '81000000-0000-4000-8000-000000000030',
      'TASK5-CONCURRENT'
    )::TEXT
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
     AND event.command_name = 'create_manual_progress_invoice_series'
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
      AND event.command_name = 'create_manual_progress_invoice_series'
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
      AND event.command_name = 'create_manual_progress_invoice_series'
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

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';

CREATE TEMP TABLE manual_create_first AS
SELECT * FROM public.create_manual_progress_invoice_series(
  pg_temp.manual_series_payload('83000000-0000-4000-8000-000000000001')
);

CREATE TEMP TABLE manual_create_replay AS
SELECT * FROM public.create_manual_progress_invoice_series(
  pg_temp.manual_series_payload('83000000-0000-4000-8000-000000000001')
);

SELECT is(
  (
    SELECT series.source_type = 'manual'
      AND series.quote_id IS NULL
      AND series.jobber_account_id IS NULL
      AND series.jobber_invoice_id IS NULL
      AND series.selected_jobber_job_id IS NULL
      AND series.jobber_client_id IS NULL
      AND series.selected_jobber_property_id IS NULL
      AND series.original_jobber_invoice_number IS NULL
      AND series.current_jobber_snapshot_id IS NULL
      AND series.accepted_numbering_base = '2906'
      AND series.gst_rate = 0.1000
      AND series.current_adjusted_contract_ex_gst = 17220.50
      AND series.current_adjusted_contract_gst = 1722.05
      AND series.current_adjusted_contract_inc_gst = 18942.55
      AND series.current_claimed_ex_gst = 0
      AND series.current_claimed_gst = 0
      AND series.current_claimed_inc_gst = 0
      AND series.current_actual_receipts = 0
      AND series.current_unclaimed_ex_gst = 17220.50
      AND series.current_unclaimed_gst = 1722.05
      AND series.current_unclaimed_inc_gst = 18942.55
    FROM public.progress_invoice_series AS series
    WHERE series.id = (SELECT id FROM manual_create_first)
  ),
  true,
  'Manual creation stores isolated provenance and exact financial caches'
);

SELECT is(
  (SELECT id FROM manual_create_replay),
  (SELECT id FROM manual_create_first),
  'exact Manual replay returns the original series ID'
);

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.progress_invoice_events AS event
    WHERE event.command_name = 'create_manual_progress_invoice_series'
      AND event.correlation_key = '83000000-0000-4000-8000-000000000001'
  ),
  1,
  'exact Manual replay does not append a second creation event'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.create_manual_progress_invoice_series(%L::JSONB)',
    pg_temp.manual_series_payload(
      '83000000-0000-4000-8000-000000000001',
      '2906',
      '17221.50'
    )::TEXT
  ),
  'P0001',
  'IDEMPOTENCY_KEY_REUSED',
  'changed Manual payload cannot reuse an actor correlation key'
);

SELECT throws_ok(
  format(
    'SELECT * FROM public.create_manual_progress_invoice_series(%L::JSONB)',
    pg_temp.manual_series_payload(
      '83000000-0000-4000-8000-000000000002',
      ' 2906 '
    )::TEXT
  ),
  'P0001',
  'PROGRESS_UNIQUE_CONFLICT',
  'active normalized numbering-base duplicates return the stable conflict'
);

SELECT is(
  pg_temp.capture_sqlstate($sql$
    INSERT INTO public.progress_invoice_series (
      source_type, accepted_numbering_base, base_contract_ex_gst,
      recipient_name, recipient_address, site_name, site_address,
      default_description, created_by, updated_by
    ) VALUES (
      'manual', 'DIRECT-MANUAL', 1000, 'Direct', 'Direct address',
      'Direct site', 'Direct site address', 'Direct work',
      '00000000-0000-0000-0000-000000008001',
      '00000000-0000-0000-0000-000000008001'
    )
  $sql$),
  '42501',
  'authenticated cannot directly insert a Manual series'
);

SELECT is(
  pg_temp.capture_sqlstate(format(
    'UPDATE public.progress_invoice_series SET recipient_name = %L WHERE id = %L',
    'Direct update',
    (SELECT id FROM manual_create_first)::TEXT
  )),
  '42501',
  'authenticated cannot directly update a Manual series'
);

RESET ROLE;

UPDATE public.progress_invoice_series
SET status = 'void'
WHERE id = (SELECT id FROM manual_create_first);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';

SELECT lives_ok(
  format(
    'SELECT * FROM public.create_manual_progress_invoice_series(%L::JSONB)',
    pg_temp.manual_series_payload(
      '83000000-0000-4000-8000-000000000003',
      ' 2906 '
    )::TEXT
  ),
  'a void-series numbering base may be reused'
);

SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008002';

SELECT lives_ok(
  format(
    'SELECT * FROM public.create_manual_progress_invoice_series(%L::JSONB)',
    pg_temp.manual_series_payload(
      '83000000-0000-4000-8000-000000000001',
      '2907'
    )::TEXT
  ),
  'another actor may reuse a Manual correlation key'
);

SELECT is(
  (
    SELECT count(*)::INT
    FROM public.progress_invoice_series AS series
    WHERE series.source_type IN ('pbc_quote', 'jobber_job')
  ) > 0,
  true,
  'historical PBC Quote and Jobber Job rows remain readable'
);

RESET ROLE;

SELECT is(
  pg_temp.capture_sqlstate($sql$
    INSERT INTO public.progress_invoice_series (
      source_type, quote_id, jobber_account_id, jobber_invoice_id,
      accepted_numbering_base, base_contract_ex_gst, recipient_name,
      recipient_address, site_name, site_address, default_description,
      created_by, updated_by
    ) VALUES (
      'manual', NULL, 'forbidden-account', 'forbidden-invoice', 'FORBIDDEN',
      1000, 'Forbidden', 'Forbidden address', 'Forbidden site',
      'Forbidden site address', 'Forbidden work',
      '00000000-0000-0000-0000-000000008001',
      '00000000-0000-0000-0000-000000008001'
    )
  $sql$),
  '23514',
  'Manual rows reject Quote and Jobber identity values'
);

SELECT is(
  pg_temp.capture_sqlstate($sql$
    INSERT INTO public.progress_invoice_series (
      source_type, accepted_numbering_base, base_contract_ex_gst,
      recipient_name, recipient_address, site_name, site_address,
      default_description, created_by, updated_by
    ) VALUES (
      'manual', '   ', 1000, 'Blank base', 'Blank base address',
      'Blank base site', 'Blank base site address', 'Blank base work',
      '00000000-0000-0000-0000-000000008001',
      '00000000-0000-0000-0000-000000008001'
    )
  $sql$),
  '23514',
  'Manual rows reject an accepted numbering base that is blank after trimming'
);

SELECT is(
  pg_temp.capture_sqlstate($sql$
    INSERT INTO public.progress_invoice_series (
      source_type, accepted_numbering_base, base_contract_ex_gst,
      recipient_name, recipient_address, site_name, site_address,
      default_description, last_jobber_sync_attempt_at, created_by, updated_by
    ) VALUES (
      'manual', 'MANUAL-SYNC-ATTEMPT', 1000, 'Sync attempt', 'Sync address',
      'Sync site', 'Sync site address', 'Sync work', now(),
      '00000000-0000-0000-0000-000000008001',
      '00000000-0000-0000-0000-000000008001'
    )
  $sql$),
  '23514',
  'Manual rows reject a Jobber sync-attempt timestamp'
);

SELECT is(
  pg_temp.capture_sqlstate($sql$
    INSERT INTO public.progress_invoice_series (
      source_type, accepted_numbering_base, base_contract_ex_gst,
      recipient_name, recipient_address, site_name, site_address,
      default_description, last_successful_jobber_sync_at, created_by, updated_by
    ) VALUES (
      'manual', 'MANUAL-SYNC-SUCCESS', 1000, 'Sync success', 'Sync address',
      'Sync site', 'Sync site address', 'Sync work', now(),
      '00000000-0000-0000-0000-000000008001',
      '00000000-0000-0000-0000-000000008001'
    )
  $sql$),
  '23514',
  'Manual rows reject a successful Jobber sync timestamp'
);

SELECT is(
  pg_temp.capture_sqlstate($sql$
    INSERT INTO public.progress_invoice_series (
      source_type, accepted_numbering_base, base_contract_ex_gst,
      recipient_name, recipient_address, site_name, site_address,
      default_description, last_jobber_sync_error_code, created_by, updated_by
    ) VALUES (
      'manual', 'MANUAL-SYNC-ERROR', 1000, 'Sync error', 'Sync address',
      'Sync site', 'Sync site address', 'Sync work', 'JOBBER_NOT_FOUND',
      '00000000-0000-0000-0000-000000008001',
      '00000000-0000-0000-0000-000000008001'
    )
  $sql$),
  '23514',
  'Manual rows reject a Jobber sync error code'
);

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
  'Manual command is executable only by authenticated'
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
  'legacy Quote create and prefill are not executable by application roles'
);

SELECT is(
  (
    SELECT event.safe_field_changes = '{"source_type":"manual"}'::JSONB
      AND event.result_refs ?& ARRAY['id', 'version']
      AND (SELECT count(*) FROM jsonb_object_keys(event.result_refs)) = 2
    FROM public.progress_invoice_events AS event
    WHERE event.command_name = 'create_manual_progress_invoice_series'
      AND event.correlation_key = '83000000-0000-4000-8000-000000000001'
      AND event.actor_id = '00000000-0000-0000-0000-000000008001'
  ),
  true,
  'Manual creation event contains only safe source and result references'
);

INSERT INTO public.progress_claims (
  id, series_id, sequence, kind, suffix, tax_invoice_number,
  created_by, updated_by
) VALUES (
  '83000000-0000-4000-8000-000000000010',
  (
    SELECT id
    FROM public.progress_invoice_series
    WHERE source_type = 'manual'
      AND accepted_numbering_base = '2907'
      AND created_by = '00000000-0000-0000-0000-000000008002'
  ),
  1,
  'progress',
  'P01',
  '2907-P01-MANUAL-TEST',
  '00000000-0000-0000-0000-000000008001',
  '00000000-0000-0000-0000-000000008001'
);

SELECT lives_ok(
  $sql$
    INSERT INTO public.progress_claim_revisions
    SELECT (jsonb_populate_record(
      NULL::public.progress_claim_revisions,
      to_jsonb(source_revision)
        || jsonb_build_object(
          'id', '83000000-0000-4000-8000-000000000011',
          'claim_id', '83000000-0000-4000-8000-000000000010',
          'revision_number', 1,
          'state', 'draft',
          'jobber_account_id', NULL,
          'jobber_invoice_id', NULL,
          'original_jobber_invoice_number', NULL,
          'observed_jobber_invoice_number', NULL,
          'accepted_numbering_base', '2907'
        )
    )).* FROM public.progress_claim_revisions AS source_revision LIMIT 1
  $sql$,
  'Manual Claim Revision accepts all-null Jobber evidence with an accepted base'
);

SELECT is(
  pg_temp.capture_sqlstate($sql$
    INSERT INTO public.progress_claim_revisions
    SELECT (jsonb_populate_record(
      NULL::public.progress_claim_revisions,
      to_jsonb(source_revision)
        || jsonb_build_object(
          'id', '83000000-0000-4000-8000-000000000012',
          'claim_id', '83000000-0000-4000-8000-000000000010',
          'revision_number', 2,
          'state', 'draft',
          'jobber_account_id', 'partial-account',
          'jobber_invoice_id', NULL,
          'original_jobber_invoice_number', NULL,
          'observed_jobber_invoice_number', NULL,
          'accepted_numbering_base', '2907'
        )
    )).* FROM public.progress_claim_revisions AS source_revision LIMIT 1
  $sql$),
  '23514',
  'Claim Revision rejects partial Jobber evidence'
);

SELECT is(
  pg_temp.capture_sqlstate($sql$
    INSERT INTO public.progress_claim_revisions
    SELECT (jsonb_populate_record(
      NULL::public.progress_claim_revisions,
      to_jsonb(source_revision)
        || jsonb_build_object(
          'id', '83000000-0000-4000-8000-000000000013',
          'claim_id', source_revision.claim_id,
          'revision_number', 99,
          'state', 'draft',
          'jobber_account_id', NULL,
          'jobber_invoice_id', NULL,
          'original_jobber_invoice_number', NULL,
          'observed_jobber_invoice_number', NULL,
          'accepted_numbering_base', 'LEGACY'
        )
    )).* FROM public.progress_claim_revisions AS source_revision
    JOIN public.progress_claims AS source_claim ON source_claim.id = source_revision.claim_id
    JOIN public.progress_invoice_series AS source_series ON source_series.id = source_claim.series_id
    WHERE source_series.source_type <> 'manual'
    LIMIT 1
  $sql$),
  '23514',
  'non-Manual Claim Revision requires complete Jobber evidence'
);

SELECT extensions.dblink_connect(
  'manual_changed_race_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
SELECT extensions.dblink_connect(
  'manual_changed_race_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
SELECT extensions.dblink_exec('manual_changed_race_a', 'BEGIN');
SELECT extensions.dblink_exec('manual_changed_race_a', 'SET LOCAL ROLE authenticated');
SELECT extensions.dblink_exec(
  'manual_changed_race_a',
  $$SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001'$$
);
SELECT extensions.dblink_exec(
  'manual_changed_race_a',
  format(
    'CREATE TEMP TABLE changed_race_winner AS SELECT * FROM public.create_manual_progress_invoice_series(%L::JSONB)',
    pg_temp.manual_series_payload(
      '83000000-0000-4000-8000-000000000020',
      'MANUAL-CHANGED-RACE'
    )::TEXT
  )
);

SELECT extensions.dblink_exec('manual_changed_race_b', 'BEGIN');
SELECT extensions.dblink_exec('manual_changed_race_b', 'SET LOCAL ROLE authenticated');
SELECT extensions.dblink_exec(
  'manual_changed_race_b',
  $$SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001'$$
);
SELECT extensions.dblink_send_query(
  'manual_changed_race_b',
  format(
    'SELECT id::TEXT, version FROM public.create_manual_progress_invoice_series(%L::JSONB)',
    pg_temp.manual_series_payload(
      '83000000-0000-4000-8000-000000000020',
      'MANUAL-CHANGED-RACE',
      '17221.50'
    )::TEXT
  )
);
SELECT pg_sleep(0.1);
SELECT extensions.dblink_exec('manual_changed_race_a', 'COMMIT');
CREATE TEMP TABLE manual_changed_race_observation (error_text TEXT);
DO $$
DECLARE
  observed_error TEXT;
BEGIN
  PERFORM result.id, result.version
  FROM extensions.dblink_get_result('manual_changed_race_b', false)
    AS result(id TEXT, version INT);
  observed_error := extensions.dblink_error_message('manual_changed_race_b');
  PERFORM result.id, result.version
  FROM extensions.dblink_get_result('manual_changed_race_b', false)
    AS result(id TEXT, version INT);
  INSERT INTO manual_changed_race_observation (error_text) VALUES (observed_error);
END;
$$;
SELECT extensions.dblink_exec('manual_changed_race_b', 'ROLLBACK');

SELECT is(
  (
    SELECT observation.error_text LIKE '%IDEMPOTENCY_KEY_REUSED%'
      AND (
        SELECT count(*)
        FROM public.progress_invoice_events AS event
        WHERE event.actor_id = '00000000-0000-0000-0000-000000008001'
          AND event.command_name = 'create_manual_progress_invoice_series'
          AND event.correlation_key = '83000000-0000-4000-8000-000000000020'
      ) = 1
    FROM manual_changed_race_observation AS observation
  ),
  true,
  'concurrent changed Manual payload cannot bypass idempotency-key reuse protection'
);

SELECT extensions.dblink_disconnect('manual_changed_race_a');
SELECT extensions.dblink_disconnect('manual_changed_race_b');

SELECT extensions.dblink_connect(
  'manual_base_race_a',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
SELECT extensions.dblink_connect(
  'manual_base_race_b',
  'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres'
);
SELECT extensions.dblink_exec('manual_base_race_a', 'BEGIN');
SELECT extensions.dblink_exec('manual_base_race_a', 'SET LOCAL ROLE authenticated');
SELECT extensions.dblink_exec(
  'manual_base_race_a',
  $$SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001'$$
);
SELECT extensions.dblink_exec(
  'manual_base_race_a',
  format(
    'CREATE TEMP TABLE base_race_winner AS SELECT * FROM public.create_manual_progress_invoice_series(%L::JSONB)',
    pg_temp.manual_series_payload(
      '83000000-0000-4000-8000-000000000021',
      'MANUAL-BASE-RACE'
    )::TEXT
  )
);
SELECT extensions.dblink_exec('manual_base_race_b', 'BEGIN');
SELECT extensions.dblink_exec('manual_base_race_b', 'SET LOCAL ROLE authenticated');
SELECT extensions.dblink_exec(
  'manual_base_race_b',
  $$SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000008002'$$
);
SELECT extensions.dblink_send_query(
  'manual_base_race_b',
  format(
    'SELECT id::TEXT, version FROM public.create_manual_progress_invoice_series(%L::JSONB)',
    pg_temp.manual_series_payload(
      '83000000-0000-4000-8000-000000000022',
      ' manual-base-race '
    )::TEXT
  )
);
SELECT pg_sleep(0.1);
SELECT extensions.dblink_exec('manual_base_race_a', 'COMMIT');
CREATE TEMP TABLE manual_base_race_observation (error_text TEXT);
DO $$
DECLARE
  observed_error TEXT;
BEGIN
  PERFORM result.id, result.version
  FROM extensions.dblink_get_result('manual_base_race_b', false)
    AS result(id TEXT, version INT);
  observed_error := extensions.dblink_error_message('manual_base_race_b');
  PERFORM result.id, result.version
  FROM extensions.dblink_get_result('manual_base_race_b', false)
    AS result(id TEXT, version INT);
  INSERT INTO manual_base_race_observation (error_text) VALUES (observed_error);
END;
$$;
SELECT extensions.dblink_exec('manual_base_race_b', 'ROLLBACK');

SELECT is(
  (
    SELECT observation.error_text LIKE '%PROGRESS_UNIQUE_CONFLICT%'
      AND (
        SELECT count(*)
        FROM public.progress_invoice_series AS series
        WHERE lower(btrim(series.accepted_numbering_base)) = 'manual-base-race'
          AND series.status <> 'void'
      ) = 1
    FROM manual_base_race_observation AS observation
  ),
  true,
  'concurrent normalized Manual numbering-base race returns the stable unique conflict'
);

SELECT extensions.dblink_disconnect('manual_base_race_a');
SELECT extensions.dblink_disconnect('manual_base_race_b');

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

RESET ROLE;

INSERT INTO public.progress_invoice_series (
  id, source_type, accepted_numbering_base, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description,
  status, created_by, updated_by
) VALUES
  (
    '84000000-0000-4000-8000-000000000001', 'manual', 'TASK2-A', 1000,
    'Task2 Dashboard Builder', 'Billing A', 'Site A', 'Site address A', 'Works A',
    'active', '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '84000000-0000-4000-8000-000000000002', 'manual', 'TASK2-B', 2000,
    'Task2 Dashboard Builder', 'Billing B', 'Site B', 'Site address B', 'Works B',
    'active', '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '84000000-0000-4000-8000-000000000003', 'manual', 'TASK2-VOID', 3000,
    'Task2 Dashboard Builder', 'Billing V', 'Site V', 'Site address V', 'Works V',
    'void', '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  );

INSERT INTO public.progress_payments (
  id, series_id, source, current_revision_id, created_by, updated_by
) VALUES (
  '84000000-0000-4000-8000-000000000010', '84000000-0000-4000-8000-000000000001',
  'manual', NULL, '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);
INSERT INTO public.progress_payment_revisions (
  id, payment_id, revision_number, received_date, observed_amount,
  effective_receipt_amount, sync_state, status, created_by
) VALUES (
  '84000000-0000-4000-8000-000000000011', '84000000-0000-4000-8000-000000000010',
  1, current_date, 50, 50, 'manual', 'active', '00000000-0000-0000-0000-000000008001'
);
UPDATE public.progress_payments SET current_revision_id = '84000000-0000-4000-8000-000000000011'
WHERE id = '84000000-0000-4000-8000-000000000010';

INSERT INTO public.progress_payments (
  id, series_id, source, jobber_payment_id, current_revision_id, matched_manual_payment_id,
  created_by, updated_by
) VALUES (
  '84000000-0000-4000-8000-000000000012', '84000000-0000-4000-8000-000000000001',
  'jobber', 'TASK2-PAYMENT', NULL, '84000000-0000-4000-8000-000000000010',
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);
INSERT INTO public.progress_payment_revisions (
  id, payment_id, revision_number, received_date, observed_amount,
  effective_receipt_amount, sync_state, status, created_by
) VALUES (
  '84000000-0000-4000-8000-000000000013', '84000000-0000-4000-8000-000000000012',
  1, current_date, 50, 50, 'observed', 'active', '00000000-0000-0000-0000-000000008001'
);
UPDATE public.progress_payments SET current_revision_id = '84000000-0000-4000-8000-000000000013'
WHERE id = '84000000-0000-4000-8000-000000000012';

SELECT public.progress_recalculate_series_read_model_as(
  '84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000008001'
);
SELECT public.progress_recalculate_series_read_model_as(
  '84000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000008001'
);

SELECT is(
  (SELECT current_claimed_inc_gst FROM public.progress_invoice_series WHERE id = '84000000-0000-4000-8000-000000000001'),
  0::NUMERIC,
  'no Current set yields zero issued Claims'
);
SELECT is(
  (SELECT current_actual_receipts = 50 AND current_credit_balance = 50
   FROM public.progress_invoice_series WHERE id = '84000000-0000-4000-8000-000000000001'),
  true,
  'Jobber receipt replaces its matched Manual receipt without double counting'
);

INSERT INTO public.progress_claims (
  id, series_id, sequence, kind, suffix, tax_invoice_number, status,
  original_issued_at, created_by, updated_by
) VALUES (
  '84000000-0000-4000-8000-000000000020', '84000000-0000-4000-8000-000000000001',
  1, 'progress', 'P01', 'TASK2-A-P01', 'draft', NULL,
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);

INSERT INTO public.progress_claim_revisions
SELECT (jsonb_populate_record(
  NULL::public.progress_claim_revisions,
  to_jsonb(source_revision) || jsonb_build_object(
    'id', '84000000-0000-4000-8000-000000000021',
    'claim_id', '84000000-0000-4000-8000-000000000020',
    'revision_number', 1, 'state', 'issued',
    'issue_date', '2026-01-01', 'due_date', '2026-01-02',
    'authoritative_current_claim_inc_gst', 110,
    'reference', 'Revision one', 'accepted_numbering_base', 'TASK2-A',
    'jobber_account_id', NULL, 'jobber_invoice_id', NULL,
    'original_jobber_invoice_number', NULL, 'observed_jobber_invoice_number', NULL,
    'adjusted_contract_ex_gst', 1000, 'adjusted_contract_gst', 100,
    'adjusted_contract_inc_gst', 1100, 'current_claim_ex_gst', 100,
    'current_claim_gst', 10, 'current_claim_inc_gst', 110,
    'cumulative_target_ex_gst', 100, 'cumulative_target_gst', 10,
    'cumulative_target_inc_gst', 110, 'cumulative_percentage', 10,
    'remaining_ex_gst', 900, 'remaining_gst', 90, 'remaining_inc_gst', 990,
    'financial_snapshot_hash', repeat('b', 64)
  )
)).* FROM public.progress_claim_revisions AS source_revision LIMIT 1;

INSERT INTO public.progress_claim_revisions
SELECT (jsonb_populate_record(
  NULL::public.progress_claim_revisions,
  to_jsonb(source_revision) || jsonb_build_object(
    'id', '84000000-0000-4000-8000-000000000022',
    'claim_id', '84000000-0000-4000-8000-000000000020',
    'revision_number', 2, 'state', 'issued',
    'issue_date', '2026-01-01', 'due_date', '2026-01-02',
    'authoritative_current_claim_inc_gst', 220,
    'reference', 'Revision two', 'accepted_numbering_base', 'TASK2-A',
    'jobber_account_id', NULL, 'jobber_invoice_id', NULL,
    'original_jobber_invoice_number', NULL, 'observed_jobber_invoice_number', NULL,
    'adjusted_contract_ex_gst', 1000, 'adjusted_contract_gst', 100,
    'adjusted_contract_inc_gst', 1100, 'current_claim_ex_gst', 200,
    'current_claim_gst', 20, 'current_claim_inc_gst', 220,
    'cumulative_target_ex_gst', 200, 'cumulative_target_gst', 20,
    'cumulative_target_inc_gst', 220, 'cumulative_percentage', 20,
    'remaining_ex_gst', 800, 'remaining_gst', 80, 'remaining_inc_gst', 880,
    'financial_snapshot_hash', repeat('c', 64)
  )
)).* FROM public.progress_claim_revisions AS source_revision LIMIT 1;

UPDATE public.progress_claims
SET current_revision_id = '84000000-0000-4000-8000-000000000021',
    status = 'issued', original_issued_at = now()
WHERE id = '84000000-0000-4000-8000-000000000020';

INSERT INTO public.progress_invoice_revision_sets (
  id, series_id, set_number, revision_manifest, state,
  aggregate_financial_manifest_hash, created_by, published_at, superseded_at
) VALUES
  (
    '84000000-0000-4000-8000-000000000031', '84000000-0000-4000-8000-000000000001', 1,
    '[{"claim_id":"84000000-0000-4000-8000-000000000020","revision_id":"84000000-0000-4000-8000-000000000021"}]',
    'superseded', repeat('d', 64), '00000000-0000-0000-0000-000000008001', now(), now()
  ),
  (
    '84000000-0000-4000-8000-000000000032', '84000000-0000-4000-8000-000000000001', 2,
    '[{"claim_id":"84000000-0000-4000-8000-000000000020","revision_id":"84000000-0000-4000-8000-000000000022"}]',
    'current', repeat('e', 64), '00000000-0000-0000-0000-000000008001', now(), NULL
  );

UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000032'
WHERE id = '84000000-0000-4000-8000-000000000001';
SELECT public.progress_recalculate_series_read_model_as(
  '84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000008001'
);

SELECT is(
  (SELECT current_claimed_inc_gst FROM public.progress_invoice_series WHERE id = '84000000-0000-4000-8000-000000000001'),
  220::NUMERIC,
  'Current manifest wins when the Claim pointer deliberately selects another Revision'
);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';

SELECT is(
  (SELECT item ->> 'current_manifest_claim_count' = '1'
      AND item ->> 'invoice_number' = 'TASK2-A-P01'
      AND item ->> 'reference' = 'Revision two'
      AND item ->> 'current_payment_state' = 'overdue'
   FROM jsonb_array_elements(public.list_progress_invoice_series(jsonb_build_object(
     'query', 'TASK2-A', 'statuses', '[]'::JSONB, 'page', 1, 'page_size', 1, 'quote_id', NULL
   )) -> 'items') AS item),
  true,
  'dashboard item exposes Current count, invoice, reference, and Sydney overdue state'
);

SELECT is(
  (SELECT (response -> 'summary' ->> 'current_adjusted_contract_ex_gst')::NUMERIC
      > (response -> 'items' -> 0 ->> 'current_adjusted_contract_ex_gst')::NUMERIC
   FROM (SELECT public.list_progress_invoice_series(jsonb_build_object(
     'query', 'Task2 Dashboard Builder', 'statuses', '[]'::JSONB,
     'page', 1, 'page_size', 1, 'quote_id', NULL
   )) AS response) AS listed),
  true,
  'dashboard summary covers all filtered Series rather than only one paged item'
);

SELECT is(
  (public.list_progress_invoice_series(jsonb_build_object(
    'query', 'Task2 Dashboard Builder', 'statuses', '[]'::JSONB,
    'page', 1, 'page_size', 20, 'quote_id', NULL
  )) ->> 'total')::INT,
  2,
  'default dashboard view excludes Void Series'
);

SELECT is(
  (SELECT (response ->> 'total')::INT = 1
      AND response -> 'items' -> 0 ->> 'status' = 'void'
   FROM (SELECT public.list_progress_invoice_series(jsonb_build_object(
     'query', 'Task2 Dashboard Builder', 'statuses', '["void","active","paid"]'::JSONB,
     'page', 1, 'page_size', 20, 'quote_id', NULL
   )) AS response) AS listed),
  true,
  'any mixed Void request is an explicit Void-only view'
);

RESET ROLE;
UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000032';
UPDATE public.progress_invoice_revision_sets SET state = 'current', superseded_at = NULL
WHERE id = '84000000-0000-4000-8000-000000000031';
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000031'
WHERE id = '84000000-0000-4000-8000-000000000001';
SELECT public.progress_recalculate_series_read_model_as(
  '84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000008001'
);
SELECT is(
  (SELECT current_claimed_inc_gst FROM public.progress_invoice_series WHERE id = '84000000-0000-4000-8000-000000000001'),
  110::NUMERIC,
  'changing the Current set changes cached totals without changing the Claim pointer'
);

UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000031';
INSERT INTO public.progress_invoice_revision_sets (
  id, series_id, set_number, revision_manifest, state,
  aggregate_financial_manifest_hash, created_by, published_at
) VALUES (
  '84000000-0000-4000-8000-000000000033', '84000000-0000-4000-8000-000000000001', 3,
  '[{"claim_id":"84000000-0000-4000-8000-000000000020","revision_id":"84000000-0000-4000-8000-000000000022","extra":"invalid"}]',
  'current', repeat('f', 64), '00000000-0000-0000-0000-000000008001', now()
);
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000033'
WHERE id = '84000000-0000-4000-8000-000000000001';
SELECT is(
  pg_temp.capture_sqlstate($sql$
    SELECT public.progress_recalculate_series_read_model_as(
      '84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000008001'
    )
  $sql$),
  'P0001',
  'invalid manifest object shape fails closed'
);

UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000033';
INSERT INTO public.progress_invoice_revision_sets (
  id, series_id, set_number, revision_manifest, state,
  aggregate_financial_manifest_hash, created_by, published_at
) VALUES (
  '84000000-0000-4000-8000-000000000034', '84000000-0000-4000-8000-000000000001', 4,
  '[]', 'current', repeat('1', 64), '00000000-0000-0000-0000-000000008001', now()
);
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000034'
WHERE id = '84000000-0000-4000-8000-000000000001';
SELECT public.progress_recalculate_series_read_model_as(
  '84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000008001'
);
SELECT is(
  (SELECT current_claimed_inc_gst = 0 AND current_actual_receipts = 50 AND current_credit_balance = 50
   FROM public.progress_invoice_series WHERE id = '84000000-0000-4000-8000-000000000001'),
  true,
  'an empty Current manifest keeps independent receipts and credit while issued totals are zero'
);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  (SELECT item ->> 'current_manifest_claim_count'
   FROM jsonb_array_elements(public.list_progress_invoice_series(jsonb_build_object(
     'query', 'TASK2-A', 'statuses', '["credit_balance"]'::JSONB, 'page', 1, 'page_size', 1, 'quote_id', NULL
   )) -> 'items') AS item),
  '0',
  'Credit Balance filtering preserves a no-Claim row and its empty Current manifest count'
);

RESET ROLE;

INSERT INTO public.progress_payments (
  id, series_id, source, current_revision_id, created_by, updated_by
) VALUES (
  '84000000-0000-4000-8000-000000000040', '84000000-0000-4000-8000-000000000002',
  'manual', NULL, '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);
INSERT INTO public.progress_payment_revisions (
  id, payment_id, revision_number, received_date, observed_amount,
  effective_receipt_amount, sync_state, status, created_by
) VALUES (
  '84000000-0000-4000-8000-000000000041', '84000000-0000-4000-8000-000000000040',
  1, current_date, 10, -10, 'reversed', 'active', '00000000-0000-0000-0000-000000008001'
);
UPDATE public.progress_payments SET current_revision_id = '84000000-0000-4000-8000-000000000041'
WHERE id = '84000000-0000-4000-8000-000000000040';
SELECT public.progress_recalculate_series_read_model_as(
  '84000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000008001'
);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  (SELECT (response ->> 'total')::INT = 0
      AND jsonb_array_length(response -> 'items') = 0
      AND response -> 'summary' = jsonb_build_object(
        'current_adjusted_contract_ex_gst', '0.00',
        'current_claimed_inc_gst', '0.00',
        'current_actual_receipts', '0.00',
        'current_outstanding_receivable', '0.00',
        'current_credit_balance', '0.00',
        'current_unclaimed_inc_gst', '0.00'
      )
   FROM (SELECT public.list_progress_invoice_series(jsonb_build_object(
     'query', 'TASK2-B', 'statuses', '["unpaid"]'::JSONB,
     'page', 1, 'page_size', 20, 'quote_id', NULL
   )) AS response) AS listed),
  true,
  'Unpaid excludes a zero-manifest Series even when a signed reversal leaves positive cached outstanding'
);

RESET ROLE;
UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000034';
UPDATE public.progress_invoice_revision_sets SET state = 'current', superseded_at = NULL
WHERE id = '84000000-0000-4000-8000-000000000033';
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000033'
WHERE id = '84000000-0000-4000-8000-000000000001';

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  pg_temp.capture_sqlstate($sql$
    SELECT public.list_progress_invoice_series(
      '{"query":"TASK2-A","statuses":[],"page":1,"page_size":20,"quote_id":null}'::JSONB
    )
  $sql$),
  'P0001',
  'list RPC rejects a Current manifest entry with extra keys using a safe Progress error'
);

RESET ROLE;
UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000033';
INSERT INTO public.progress_invoice_revision_sets (
  id, series_id, set_number, revision_manifest, state,
  aggregate_financial_manifest_hash, created_by, published_at
) VALUES (
  '84000000-0000-4000-8000-000000000035', '84000000-0000-4000-8000-000000000001', 5,
  '[{"claim_id":"not-a-uuid","revision_id":"84000000-0000-4000-8000-000000000022"}]',
  'current', repeat('2', 64), '00000000-0000-0000-0000-000000008001', now()
);
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000035'
WHERE id = '84000000-0000-4000-8000-000000000001';

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  pg_temp.capture_sqlstate($sql$
    SELECT public.list_progress_invoice_series(
      '{"query":"TASK2-A","statuses":[],"page":1,"page_size":20,"quote_id":null}'::JSONB
    )
  $sql$),
  'P0001',
  'list RPC rejects malformed manifest UUID text without exposing native cast errors'
);

RESET ROLE;
UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000035';
UPDATE public.progress_invoice_revision_sets SET state = 'current', superseded_at = NULL
WHERE id = '84000000-0000-4000-8000-000000000034';
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000034'
WHERE id = '84000000-0000-4000-8000-000000000001';

INSERT INTO public.progress_claims (
  id, series_id, sequence, kind, suffix, tax_invoice_number, status,
  original_issued_at, created_by, updated_by
) VALUES
  (
    '84000000-0000-4000-8000-000000000060', '84000000-0000-4000-8000-000000000001',
    2, 'progress', 'P02', 'TASK2-A-P02', 'draft', NULL,
    '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '84000000-0000-4000-8000-000000000062', '84000000-0000-4000-8000-000000000001',
    3, 'progress', 'P03', 'TASK2-A-P03', 'draft', NULL,
    '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '84000000-0000-4000-8000-000000000064', '84000000-0000-4000-8000-000000000001',
    4, 'progress', 'P04', 'TASK2-A-P04', 'draft', NULL,
    '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  );

INSERT INTO public.progress_claim_revisions
SELECT (jsonb_populate_record(NULL::public.progress_claim_revisions,
  to_jsonb(source_revision) || jsonb_build_object(
    'id', '84000000-0000-4000-8000-000000000061',
    'claim_id', '84000000-0000-4000-8000-000000000060', 'revision_number', 1,
    'state', 'issued', 'authoritative_current_claim_inc_gst', 330,
    'issue_date', '2026-02-01', 'due_date', '2099-01-01', 'reference', 'Future claim',
    'accepted_numbering_base', 'TASK2-A', 'jobber_account_id', NULL, 'jobber_invoice_id', NULL,
    'original_jobber_invoice_number', NULL, 'observed_jobber_invoice_number', NULL,
    'adjusted_contract_ex_gst', 1000, 'adjusted_contract_gst', 100, 'adjusted_contract_inc_gst', 1100,
    'previous_claims_ex_gst', 200, 'previous_claims_gst', 20, 'previous_claims_inc_gst', 220,
    'cumulative_target_ex_gst', 500, 'cumulative_target_gst', 50, 'cumulative_target_inc_gst', 550,
    'current_claim_ex_gst', 300, 'current_claim_gst', 30, 'current_claim_inc_gst', 330,
    'cumulative_percentage', 50, 'remaining_ex_gst', 500, 'remaining_gst', 50,
    'remaining_inc_gst', 550, 'financial_snapshot_hash', repeat('6', 64)
  ))).* FROM public.progress_claim_revisions AS source_revision LIMIT 1;

INSERT INTO public.progress_claim_revisions
SELECT (jsonb_populate_record(NULL::public.progress_claim_revisions,
  to_jsonb(source_revision) || jsonb_build_object(
    'id', '84000000-0000-4000-8000-000000000063',
    'claim_id', '84000000-0000-4000-8000-000000000062', 'revision_number', 1,
    'state', 'issued', 'authoritative_current_claim_inc_gst', 55,
    'issue_date', '2026-03-01', 'due_date', '2026-03-15', 'reference', 'Mismatch evidence',
    'accepted_numbering_base', 'TASK2-A', 'jobber_account_id', NULL, 'jobber_invoice_id', NULL,
    'original_jobber_invoice_number', NULL, 'observed_jobber_invoice_number', NULL,
    'adjusted_contract_ex_gst', 1000, 'adjusted_contract_gst', 100, 'adjusted_contract_inc_gst', 1100,
    'previous_claims_ex_gst', 500, 'previous_claims_gst', 50, 'previous_claims_inc_gst', 550,
    'cumulative_target_ex_gst', 550, 'cumulative_target_gst', 55, 'cumulative_target_inc_gst', 605,
    'current_claim_ex_gst', 50, 'current_claim_gst', 5, 'current_claim_inc_gst', 55,
    'cumulative_percentage', 55, 'remaining_ex_gst', 450, 'remaining_gst', 45,
    'remaining_inc_gst', 495, 'financial_snapshot_hash', repeat('7', 64)
  ))).* FROM public.progress_claim_revisions AS source_revision LIMIT 1;

INSERT INTO public.progress_claim_revisions
SELECT (jsonb_populate_record(NULL::public.progress_claim_revisions,
  to_jsonb(source_revision) || jsonb_build_object(
    'id', '84000000-0000-4000-8000-000000000065',
    'claim_id', '84000000-0000-4000-8000-000000000064', 'revision_number', 1,
    'state', 'draft', 'template_id', NULL, 'template_version', NULL,
    'authoritative_current_claim_inc_gst', 55, 'reference', 'Draft evidence',
    'accepted_numbering_base', 'TASK2-A', 'jobber_account_id', NULL, 'jobber_invoice_id', NULL,
    'original_jobber_invoice_number', NULL, 'observed_jobber_invoice_number', NULL,
    'financial_snapshot_hash', repeat('8', 64)
  ))).* FROM public.progress_claim_revisions AS source_revision LIMIT 1;

UPDATE public.progress_claims SET
  current_revision_id = CASE id
    WHEN '84000000-0000-4000-8000-000000000060' THEN '84000000-0000-4000-8000-000000000061'::UUID
    WHEN '84000000-0000-4000-8000-000000000062' THEN '84000000-0000-4000-8000-000000000063'::UUID
  END,
  status = 'issued', original_issued_at = now()
WHERE id IN ('84000000-0000-4000-8000-000000000060', '84000000-0000-4000-8000-000000000062');

UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000034';
INSERT INTO public.progress_invoice_revision_sets (
  id, series_id, set_number, revision_manifest, state,
  aggregate_financial_manifest_hash, created_by, published_at
) VALUES (
  '84000000-0000-4000-8000-000000000066', '84000000-0000-4000-8000-000000000001', 6,
  '[{"claim_id":"84000000-0000-4000-8000-000000000020","revision_id":"84000000-0000-4000-8000-000000000022"},{"claim_id":"84000000-0000-4000-8000-000000000060","revision_id":"84000000-0000-4000-8000-000000000061"}]',
  'current', repeat('9', 64), '00000000-0000-0000-0000-000000008001', now()
);
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000066'
WHERE id = '84000000-0000-4000-8000-000000000001';
SELECT public.progress_recalculate_series_read_model_as(
  '84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000008001'
);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  (SELECT series.current_cumulative_percentage = 50
      AND response -> 'items' -> 0 ->> 'current_payment_state' = 'overdue'
   FROM public.progress_invoice_series AS series
   CROSS JOIN LATERAL public.list_progress_invoice_series(jsonb_build_object(
     'query', 'TASK2-A', 'statuses', '[]'::JSONB, 'page', 1, 'page_size', 1, 'quote_id', NULL
   )) AS response
   WHERE series.id = '84000000-0000-4000-8000-000000000001'),
  true,
  'two manifested Claims derive 50 percent cumulative progress and an overdue state'
);

RESET ROLE;
CREATE FUNCTION pg_temp.set_task2_receipt(requested_id UUID, requested_number INT, requested_observed NUMERIC, requested_effective NUMERIC)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.progress_payment_revisions (
    id, payment_id, revision_number, received_date, observed_amount,
    effective_receipt_amount, sync_state, status, predecessor_revision_id, created_by
  ) VALUES (
    requested_id, '84000000-0000-4000-8000-000000000012', requested_number,
    current_date, requested_observed, requested_effective,
    CASE WHEN requested_effective < 0 THEN 'reversed' ELSE 'observed' END,
    'active', (SELECT current_revision_id FROM public.progress_payments WHERE id = '84000000-0000-4000-8000-000000000012'),
    '00000000-0000-0000-0000-000000008001'
  );
  UPDATE public.progress_payments SET current_revision_id = requested_id
  WHERE id = '84000000-0000-4000-8000-000000000012';
  PERFORM public.progress_recalculate_series_read_model_as(
    '84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000008001'
  );
END;
$$;

SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000071', 2, 220, 220);
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  (SELECT series.current_outstanding_receivable = 330
      AND response -> 'items' -> 0 ->> 'current_payment_state' = 'part_paid'
   FROM public.progress_invoice_series AS series
   CROSS JOIN LATERAL public.list_progress_invoice_series(jsonb_build_object(
     'query', 'TASK2-A', 'statuses', '["part_paid"]'::JSONB, 'page', 1, 'page_size', 1, 'quote_id', NULL
   )) AS response
   WHERE series.id = '84000000-0000-4000-8000-000000000001'),
  true,
  'FIFO applies receipt to the earlier overdue Claim before the later future-due Claim'
);

RESET ROLE;
SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000072', 3, 550, 550);
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  public.list_progress_invoice_series(jsonb_build_object(
    'query', 'TASK2-A', 'statuses', '["paid"]'::JSONB, 'page', 1, 'page_size', 1, 'quote_id', NULL
  )) -> 'items' -> 0 ->> 'current_payment_state',
  'paid',
  'manifested Claims become paid when receipts exactly equal issued value'
);

RESET ROLE;
SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000073', 4, 600, 600);
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  public.list_progress_invoice_series(jsonb_build_object(
    'query', 'TASK2-A', 'statuses', '["credit_balance"]'::JSONB, 'page', 1, 'page_size', 1, 'quote_id', NULL
  )) -> 'items' -> 0 ->> 'current_payment_state',
  'credit_balance',
  'manifested Claims expose credit balance after overpayment'
);

RESET ROLE;
SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000074', 5, 10, -10);
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  (SELECT series.current_actual_receipts = -10
      AND series.current_outstanding_receivable = 560
      AND response -> 'items' -> 0 ->> 'current_payment_state' = 'overdue'
   FROM public.progress_invoice_series AS series
   CROSS JOIN LATERAL public.list_progress_invoice_series(jsonb_build_object(
     'query', 'TASK2-A', 'statuses', '["overdue"]'::JSONB, 'page', 1, 'page_size', 1, 'quote_id', NULL
   )) AS response
   WHERE series.id = '84000000-0000-4000-8000-000000000001'),
  true,
  'signed reversal remains negative and returns the manifested Series to overdue'
);

RESET ROLE;
UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000066';
UPDATE public.progress_invoice_revision_sets SET state = 'current', superseded_at = NULL
WHERE id = '84000000-0000-4000-8000-000000000031';
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000031'
WHERE id = '84000000-0000-4000-8000-000000000001';
SELECT public.progress_recalculate_series_read_model_as(
  '84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000008001'
);
SELECT is(
  (SELECT current_cumulative_percentage FROM public.progress_invoice_series WHERE id = '84000000-0000-4000-8000-000000000001'),
  10::NUMERIC,
  'switching the Current set also switches cached cumulative percentage'
);

UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000031';
INSERT INTO public.progress_invoice_revision_sets (
  id, series_id, set_number, revision_manifest, state, aggregate_financial_manifest_hash, created_by, published_at
) VALUES (
  '84000000-0000-4000-8000-000000000081', '84000000-0000-4000-8000-000000000001', 7,
  '[{"claim_id":"84000000-0000-4000-8000-000000000020","revision_id":"84000000-0000-4000-8000-000000000022"},{"claim_id":"84000000-0000-4000-8000-000000000020","revision_id":"84000000-0000-4000-8000-000000000022"}]',
  'current', repeat('a', 64), '00000000-0000-0000-0000-000000008001', now()
);
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000081'
WHERE id = '84000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.list_progress_invoice_series('{"query":"TASK2-A","statuses":[],"page":1,"page_size":20,"quote_id":null}'::JSONB)
$sql$), 'P0001', 'list RPC rejects duplicate Claim and Revision identities');

RESET ROLE;
UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000081';
INSERT INTO public.progress_invoice_revision_sets (
  id, series_id, set_number, revision_manifest, state, aggregate_financial_manifest_hash, created_by, published_at
) VALUES (
  '84000000-0000-4000-8000-000000000082', '84000000-0000-4000-8000-000000000001', 8,
  '[{"claim_id":"84000000-0000-4000-8000-000000000020","revision_id":"84000000-0000-4000-8000-000000000063"}]',
  'current', repeat('b', 64), '00000000-0000-0000-0000-000000008001', now()
);
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000082'
WHERE id = '84000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.list_progress_invoice_series('{"query":"TASK2-A","statuses":[],"page":1,"page_size":20,"quote_id":null}'::JSONB)
$sql$), 'P0001', 'list RPC rejects a Claim to Revision ownership mismatch');

RESET ROLE;
UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000082';
INSERT INTO public.progress_invoice_revision_sets (
  id, series_id, set_number, revision_manifest, state, aggregate_financial_manifest_hash, created_by, published_at
) VALUES (
  '84000000-0000-4000-8000-000000000083', '84000000-0000-4000-8000-000000000001', 9,
  '[{"claim_id":"84000000-0000-4000-8000-000000000064","revision_id":"84000000-0000-4000-8000-000000000065"}]',
  'current', repeat('c', 64), '00000000-0000-0000-0000-000000008001', now()
);
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000083'
WHERE id = '84000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.list_progress_invoice_series('{"query":"TASK2-A","statuses":[],"page":1,"page_size":20,"quote_id":null}'::JSONB)
$sql$), 'P0001', 'list RPC rejects non-issued Claim and Revision state');

RESET ROLE;
UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE id = '84000000-0000-4000-8000-000000000083';
INSERT INTO public.progress_invoice_revision_sets (
  id, series_id, set_number, revision_manifest, state, aggregate_financial_manifest_hash, created_by, published_at
) VALUES (
  '84000000-0000-4000-8000-000000000084', '84000000-0000-4000-8000-000000000002', 1,
  '[{"claim_id":"84000000-0000-4000-8000-000000000020","revision_id":"84000000-0000-4000-8000-000000000022"}]',
  'current', repeat('d', 64), '00000000-0000-0000-0000-000000008001', now()
);
UPDATE public.progress_invoice_series SET current_revision_set_id = '84000000-0000-4000-8000-000000000084'
WHERE id = '84000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.list_progress_invoice_series('{"query":"TASK2-B","statuses":[],"page":1,"page_size":20,"quote_id":null}'::JSONB)
$sql$), 'P0001', 'list RPC rejects a Current manifest Claim owned by another Series');

RESET ROLE;

SELECT extensions.ok(
  position(
    'claim.current_revision_id'
    IN pg_get_functiondef('public.progress_recalculate_series_read_model_as(uuid,uuid)'::regprocedure)
  ) = 0,
  'series read model never reads issued Claims from the mutable Claim pointer'
);

SELECT is(
  NOT has_function_privilege('anon', 'public.progress_resolve_current_manifest(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.progress_resolve_current_manifest(uuid)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.progress_resolve_current_manifest(uuid)', 'EXECUTE'),
  true,
  'Current manifest resolver remains private to trusted database functions'
);

SELECT has_function(
  'public',
  'get_progress_invoice_workspace',
  ARRAY['jsonb'],
  'workspace read RPC exists'
);

SELECT function_returns(
  'public',
  'get_progress_invoice_workspace',
  ARRAY['jsonb'],
  'jsonb',
  'workspace read RPC returns one bounded JSON object'
);

SELECT has_function(
  'public',
  'list_progress_invoice_history',
  ARRAY['jsonb'],
  'history read RPC exists'
);

SELECT function_returns(
  'public',
  'list_progress_invoice_history',
  ARRAY['jsonb'],
  'jsonb',
  'history read RPC returns one cursor page JSON object'
);

SELECT is(
  has_function_privilege('authenticated', 'public.get_progress_invoice_workspace(jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.list_progress_invoice_history(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.get_progress_invoice_workspace(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.get_progress_invoice_workspace(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.list_progress_invoice_history(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.list_progress_invoice_history(jsonb)', 'EXECUTE'),
  true,
  'workspace RPCs are exposed only to authenticated'
);

RESET ROLE;
RESET request.jwt.claim.sub;
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::JSONB)
$sql$), '28000', 'workspace requires an authenticated actor before reading data');

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001","extra":true}'::JSONB)
$sql$), '22023', 'workspace rejects unknown payload keys before data access');

SELECT is(
  public.get_progress_invoice_workspace('{"series_id":"99000000-0000-4000-8000-000000000099"}'::JSONB),
  '{"series":null}'::JSONB,
  'missing workspace Series returns only a safe null Series'
);

RESET ROLE;
UPDATE public.progress_invoice_revision_sets SET state = 'superseded', superseded_at = now()
WHERE series_id = '84000000-0000-4000-8000-000000000001' AND state = 'current';
UPDATE public.progress_invoice_revision_sets SET state = 'current', superseded_at = NULL
WHERE id = '84000000-0000-4000-8000-000000000032';
UPDATE public.progress_invoice_series
SET current_revision_set_id = '84000000-0000-4000-8000-000000000032'
WHERE id = '84000000-0000-4000-8000-000000000001';
SELECT public.progress_recalculate_series_read_model_as(
  '84000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000008001'
);

INSERT INTO public.progress_adjustments (
  id, series_id, type, status, effective_date, display_order, description,
  amount_ex_gst, created_by, updated_by
) VALUES
  ('85000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000001',
   'credit', 'draft', '2026-07-03', 2, 'Later credit', 5,
   '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'),
  ('85000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001',
   'variation', 'approved', '2026-07-01', 1, 'Earlier variation', 10,
   '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001');

INSERT INTO public.progress_invoice_series (
  id, source_type, jobber_account_id, jobber_invoice_id, accepted_numbering_base,
  base_contract_ex_gst, recipient_name, recipient_address, site_name, site_address,
  default_description, status, created_by, updated_by
) VALUES (
  '85000000-0000-4000-8000-000000000009', 'jobber_invoice', 'workspace-account',
  'workspace-invoice', '2875', 1000, 'Workspace Jobber Builder', 'Billing J',
  'Site J', 'Site address J', 'Works J', 'active',
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);

INSERT INTO public.progress_jobber_invoice_snapshots (
  id, series_id, jobber_account_id, jobber_invoice_id, jobber_client_id,
  original_invoice_number, observed_invoice_number, raw_status, normalized_status,
  jobber_web_uri, invoice_subtotal, invoice_tax, invoice_total, invoice_balance,
  issued_date, due_date, client_name, billing_address, property_address,
  effective_graphql_version, fetched_at, response_fingerprint, normalization_warnings,
  created_by
) VALUES (
  '85000000-0000-4000-8000-000000000010', '85000000-0000-4000-8000-000000000009',
  'unsafe-account-id', 'unsafe-invoice-id', 'unsafe-client-id', '2875', '2875',
  'PAST_DUE', 'past_due', 'https://unsafe.example/invoice', 1000, 100, 1100, 880,
  '2026-07-01', '2026-07-15', 'Task2 Dashboard Builder', 'Billing A', 'Site address A',
  '2026-06-20', '2026-07-16T01:00:00+00:00', repeat('9', 64),
  '["unsafe raw warning"]'::JSONB, '00000000-0000-0000-0000-000000008001'
);
UPDATE public.progress_invoice_series
SET current_jobber_snapshot_id = '85000000-0000-4000-8000-000000000010'
WHERE id = '85000000-0000-4000-8000-000000000009';

INSERT INTO public.progress_invoice_templates (
  id, version, status, source_evidence_path, source_byte_length, source_sha256,
  normalized_master_path, normalized_sha256, logo_sha256, manifest_version,
  cell_map_version, page_layout_version, font_version, font_regular_sha256,
  font_bold_sha256, manifest, registered_by
) VALUES (
  '85000000-0000-4000-8000-000000000020', 850, 'pending', 'private/source.xlsx', 1,
  repeat('1', 64), 'private/master.xlsx', repeat('2', 64), repeat('3', 64),
  'v1', 'v1', 'v1', 'v1', repeat('4', 64), repeat('5', 64), '{}'::JSONB,
  '00000000-0000-0000-0000-000000008001'
);
INSERT INTO public.progress_documents (
  id, series_id, claim_revision_id, scope, format, state, template_id,
  template_version, renderer_version, storage_path, sha256,
  page_or_worksheet_count, snapshot_hash, generation_correlation_key,
  created_by, generated_at
) VALUES (
  '85000000-0000-4000-8000-000000000021', '84000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000022', 'current_claim', 'pdf', 'ready',
  '85000000-0000-4000-8000-000000000020', 850, 'renderer-v1',
  'private/unsafe-storage-path.pdf', repeat('6', 64), 1, repeat('7', 64),
  '85000000-0000-4000-8000-000000000022', '00000000-0000-0000-0000-000000008001', now()
);

INSERT INTO public.progress_invoice_events (
  id, series_id, actor_id, event_type, source, occurred_at, safe_field_changes
) VALUES
  ('85000000-0000-4000-8000-000000000031', '84000000-0000-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000008001', 'workspace_newer', 'user',
   '2026-07-18T02:00:00+00:00',
   '{"reference":{"before":null,"after":"Stage one"},"bank_account_number":"1234","storage_path":"private/file","url":"https://unsafe.example"}'::JSONB),
  ('85000000-0000-4000-8000-000000000032', '84000000-0000-4000-8000-000000000001',
   '00000000-0000-0000-0000-000000008001', 'workspace_older', 'system',
   '2026-07-18T01:00:00+00:00', '{}'::JSONB),
  ('85000000-0000-4000-8000-000000000033', '84000000-0000-4000-8000-000000000002',
   '00000000-0000-0000-0000-000000008001', 'foreign_series_event', 'user',
   '2026-07-18T03:00:00+00:00', '{}'::JSONB);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::JSONB)
    #>> '{current_revision_set,current_claim_revision_id}',
  '84000000-0000-4000-8000-000000000022',
  'workspace Current Claim revision follows the Current manifest instead of the Claim pointer'
);

SELECT is(
  public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::JSONB)
    #>> '{claims,0,current_revision,id}',
  '84000000-0000-4000-8000-000000000022',
  'Claim timeline exposes the manifest-selected Revision metadata'
);

SELECT is(
  (SELECT payment ->> 'source' = 'manual'
      AND payment #>> '{current_revision,status}' = 'active'
      AND NOT (payment ? 'jobber_payment_id')
   FROM jsonb_array_elements(
     public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::JSONB) -> 'payments'
   ) AS payment
   WHERE payment ->> 'id' = '84000000-0000-4000-8000-000000000010'),
  true,
  'payment ledger keeps source and current Revision status independent from Claim payment state'
);

SELECT is(
  (WITH workspace AS (
    SELECT public.get_progress_invoice_workspace('{"series_id":"85000000-0000-4000-8000-000000000009"}'::JSONB) AS value
  ) SELECT value #>> '{imported_jobber_observation,normalized_status}' = 'past_due'
      AND value::TEXT NOT LIKE '%unsafe-account-id%'
      AND value::TEXT NOT LIKE '%unsafe-invoice-id%'
      AND value::TEXT NOT LIKE '%response_fingerprint%'
      AND value::TEXT NOT LIKE '%unsafe raw warning%'
    FROM workspace),
  true,
  'stored Jobber observation exposes normalized display fields without raw or external identities'
);

SELECT is(
  (WITH workspace AS (
    SELECT public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::JSONB) AS value
  ) SELECT value::TEXT NOT LIKE '%private/unsafe-storage-path.pdf%'
      AND value::TEXT NOT LIKE '%bank_account_number%'
      AND value::TEXT NOT LIKE '%https://unsafe.example%'
      AND value #>> '{recent_events,0,safe_field_changes,reference,after}' = 'Stage one'
    FROM workspace),
  true,
  'workspace strips document storage paths and reconstructs events from the safe allowlist'
);

SELECT is(
  (WITH workspace AS (
    SELECT public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::JSONB) AS value
  ) SELECT value #>> '{adjustments,0,id}' = '85000000-0000-4000-8000-000000000001'
      AND value #>> '{adjustments,1,id}' = '85000000-0000-4000-8000-000000000002'
      AND value #>> '{recent_events,0,id}' = '85000000-0000-4000-8000-000000000031'
      AND value #>> '{recent_events,1,id}' = '85000000-0000-4000-8000-000000000032'
    FROM workspace),
  true,
  'bounded workspace arrays use deterministic business chronology'
);

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.list_progress_invoice_history('{"series_id":"84000000-0000-4000-8000-000000000001","cursor":null,"limit":51}'::JSONB)
$sql$), '23514', 'history enforces the approved 1 through 50 page limit');

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.list_progress_invoice_history('{"series_id":"84000000-0000-4000-8000-000000000001","cursor":"85000000-0000-4000-8000-000000000033","limit":20}'::JSONB)
$sql$), '22023', 'history rejects a cursor owned by another Series');

SELECT is(
  (WITH first_page AS (
    SELECT public.list_progress_invoice_history('{"series_id":"84000000-0000-4000-8000-000000000001","cursor":null,"limit":1}'::JSONB) AS value
  ) SELECT value #>> '{events,0,id}' = '85000000-0000-4000-8000-000000000031'
      AND value ->> 'next_cursor' = '85000000-0000-4000-8000-000000000031'
    FROM first_page),
  true,
  'history returns deterministic newest-first data with an opaque last-event cursor'
);

SELECT is(
  (SELECT bool_and('search_path=""' = ANY(function_row.proconfig))
   FROM pg_catalog.pg_proc AS function_row
   JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = function_row.pronamespace
   WHERE namespace.nspname = 'public'
     AND function_row.proname IN ('get_progress_invoice_workspace', 'list_progress_invoice_history')
     AND pg_catalog.pg_get_function_identity_arguments(function_row.oid) = 'payload jsonb'),
  true,
  'workspace and history RPCs pin an empty search_path in the catalog'
);

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.get_progress_invoice_workspace('[]'::JSONB)
$sql$), '22023', 'workspace rejects a non-object payload');

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.get_progress_invoice_workspace('{"series_id":123}'::JSONB)
$sql$), '22023', 'workspace rejects a non-string Series UUID');

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.list_progress_invoice_history('{"series_id":"84000000-0000-4000-8000-000000000001","cursor":null}'::JSONB)
$sql$), '22023', 'history rejects a payload missing its exact limit key');

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.list_progress_invoice_history('{"series_id":"84000000-0000-4000-8000-000000000001","cursor":123,"limit":20}'::JSONB)
$sql$), '22023', 'history rejects a non-string cursor');

RESET ROLE;
INSERT INTO public.progress_invoice_series (
  id, source_type, accepted_numbering_base, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description,
  status, created_by, updated_by
) VALUES (
  '86000000-0000-4000-8000-000000000001', 'manual', 'CAPABILITY-LOCK', 1000,
  'Capability Builder', 'Capability Billing', 'Capability Site', 'Capability Site address',
  'Capability works', 'active', '00000000-0000-0000-0000-000000008001',
  '00000000-0000-0000-0000-000000008001'
);
INSERT INTO public.progress_claims (
  id, series_id, sequence, kind, suffix, tax_invoice_number, status, created_by, updated_by
) VALUES (
  '86000000-0000-4000-8000-000000000002', '86000000-0000-4000-8000-000000000001',
  1, 'progress', 'P01', 'CAPABILITY-LOCK-P01', 'draft',
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  public.get_progress_invoice_workspace('{"series_id":"86000000-0000-4000-8000-000000000001"}'::JSONB)
    #>> '{capabilities,can_edit_base_contract}',
  'false',
  'a Draft Claim permanently locks the Base Contract outside the Current manifest'
);

RESET ROLE;
UPDATE public.progress_claims SET status = 'void'
WHERE id = '86000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(
  public.get_progress_invoice_workspace('{"series_id":"86000000-0000-4000-8000-000000000001"}'::JSONB)
    #>> '{capabilities,can_edit_base_contract}',
  'false',
  'a Void Claim keeps the Base Contract permanently locked'
);

RESET ROLE;
INSERT INTO public.progress_invoice_series (
  id, source_type, accepted_numbering_base, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description,
  status, created_by, updated_by
) VALUES (
  '86000000-0000-4000-8000-000000000010', 'manual', 'CAP-PLUS-ONE', 1000,
  'Cap Builder', 'Cap Billing', 'Cap Site', 'Cap Site address', 'Cap works', 'active',
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);
INSERT INTO public.progress_claims (
  series_id, sequence, kind, suffix, tax_invoice_number, status, created_by, updated_by
)
SELECT
  '86000000-0000-4000-8000-000000000010', value,
  'progress', 'P' || lpad(value::TEXT, 3, '0'), 'CAP-PLUS-ONE-P' || lpad(value::TEXT, 3, '0'),
  'draft', '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
FROM generate_series(1, 101) AS value;
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.get_progress_invoice_workspace('{"series_id":"86000000-0000-4000-8000-000000000010"}'::JSONB)
$sql$), 'P0001', 'workspace fails closed when a bounded collection reaches cap plus one');

RESET ROLE;

-- Task 4: Series lifecycle, lifetime numbering-base reservations, and direct Void.
SELECT has_table(
  'public',
  'progress_invoice_numbering_base_reservations',
  'numbering-base reservations are a first-class RLS table'
);

SELECT has_function(
  'public',
  'void_progress_invoice_series',
  ARRAY['jsonb'],
  'direct Series Void is exposed through one JSON command RPC'
);

SELECT is(
  (
    SELECT relrowsecurity
    FROM pg_catalog.pg_class
    WHERE oid = 'public.progress_invoice_numbering_base_reservations'::regclass
  ),
  true,
  'numbering-base reservations enable RLS'
);

SELECT is(
  has_table_privilege('authenticated', 'public.progress_invoice_numbering_base_reservations', 'SELECT'),
  true,
  'authenticated users can inspect reservation state'
);

SELECT is(
  has_table_privilege('authenticated', 'public.progress_invoice_numbering_base_reservations', 'INSERT')
    OR has_table_privilege('authenticated', 'public.progress_invoice_numbering_base_reservations', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.progress_invoice_numbering_base_reservations', 'DELETE'),
  false,
  'authenticated users have no direct reservation write surface'
);

SELECT is(
  has_function_privilege('authenticated', 'public.void_progress_invoice_series(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.void_progress_invoice_series(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.void_progress_invoice_series(jsonb)', 'EXECUTE'),
  true,
  'only authenticated users can execute direct Series Void'
);

SELECT is(
  (
    SELECT bool_and('search_path=""' = ANY(function_row.proconfig))
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public'
      AND function_row.proname IN ('update_progress_invoice_series', 'void_progress_invoice_series')
      AND pg_catalog.pg_get_function_identity_arguments(function_row.oid) = 'payload jsonb'
  ),
  true,
  'Series mutation RPCs pin an empty search_path'
);

INSERT INTO public.progress_invoice_series (
  id, source_type, accepted_numbering_base, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description,
  status, created_by, updated_by
) VALUES
  (
    '87000000-0000-4000-8000-000000000001', 'manual', ' Task4-Free ', 1000,
    'Task 4 Free', 'Task 4 Billing', 'Task 4 Site', 'Task 4 Site address', 'Task 4 works',
    'active', '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '87000000-0000-4000-8000-000000000010', 'manual', 'Task4-Draft', 1000,
    'Task 4 Draft', 'Task 4 Billing', 'Task 4 Site', 'Task 4 Site address', 'Task 4 works',
    'active', '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '87000000-0000-4000-8000-000000000020', 'manual', 'Task4-Issued', 1000,
    'Task 4 Issued', 'Task 4 Billing', 'Task 4 Site', 'Task 4 Site address', 'Task 4 works',
    'active', '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '87000000-0000-4000-8000-000000000030', 'manual', 'Task4-Legacy-Void', 1000,
    'Task 4 Void', 'Task 4 Billing', 'Task 4 Site', 'Task 4 Site address', 'Task 4 works',
    'void', '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '87000000-0000-4000-8000-000000000050', 'manual', 'Task4-Lifetime-Issued', 1000,
    'Task 4 Lifetime Issued', 'Task 4 Billing', 'Task 4 Site', 'Task 4 Site address', 'Task 4 works',
    'active', '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  );

INSERT INTO public.progress_claims (
  id, series_id, sequence, kind, suffix, tax_invoice_number, status,
  original_issued_at, created_by, updated_by
) VALUES
  (
    '87000000-0000-4000-8000-000000000011', '87000000-0000-4000-8000-000000000010',
    1, 'progress', 'P01', 'Task4-Draft-P01', 'draft', NULL,
    '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '87000000-0000-4000-8000-000000000021', '87000000-0000-4000-8000-000000000020',
    1, 'progress', 'P01', 'Task4-Issued-P01', 'issued', now(),
    '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '87000000-0000-4000-8000-000000000051', '87000000-0000-4000-8000-000000000050',
    1, 'progress', 'P01', 'Task4-Lifetime-Issued-P01', 'void', now(),
    '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  );

INSERT INTO public.progress_claim_revisions
SELECT (jsonb_populate_record(
  NULL::public.progress_claim_revisions,
  to_jsonb(source_revision) || jsonb_build_object(
    'id', '87000000-0000-4000-8000-000000000012',
    'claim_id', '87000000-0000-4000-8000-000000000011',
    'revision_number', 1,
    'state', 'draft',
    'jobber_account_id', NULL,
    'jobber_invoice_id', NULL,
    'original_jobber_invoice_number', NULL,
    'observed_jobber_invoice_number', NULL,
    'accepted_numbering_base', 'Task4-Draft'
  )
)).*
FROM public.progress_claim_revisions AS source_revision
LIMIT 1;

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$
  DELETE FROM public.progress_claim_revisions
  WHERE id = '87000000-0000-4000-8000-000000000012'
$sql$), '42501', 'authenticated callers cannot delete a Draft Claim Revision directly');
RESET ROLE;

SELECT is(pg_temp.capture_sqlstate($sql$
  DELETE FROM public.progress_claim_revisions
  WHERE id = '87000000-0000-4000-8000-000000000012'
$sql$), '55000', 'superuser maintenance cannot delete a Draft Claim Revision');

SELECT is(
  (SELECT count(*)::INT FROM public.progress_claim_revisions
   WHERE id = '87000000-0000-4000-8000-000000000012'),
  1,
  'the rejected Draft Claim Revision deletion preserves history'
);

SELECT is(
  (
    SELECT jsonb_object_agg(lower(btrim(series.accepted_numbering_base)), reservation.state)
    FROM public.progress_invoice_series AS series
    JOIN public.progress_invoice_numbering_base_reservations AS reservation
      ON reservation.series_id = series.id
    WHERE series.id IN (
      '87000000-0000-4000-8000-000000000001',
      '87000000-0000-4000-8000-000000000010',
      '87000000-0000-4000-8000-000000000020',
      '87000000-0000-4000-8000-000000000030'
    )
  ),
  '{"task4-draft":"permanent","task4-free":"active","task4-issued":"permanent","task4-legacy-void":"released"}'::JSONB,
  'insert and first-Claim triggers maintain active, permanent, and released reservation states'
);

SELECT is(
  (
    SELECT first_claim_id
    FROM public.progress_invoice_numbering_base_reservations
    WHERE series_id = '87000000-0000-4000-8000-000000000010'
  ),
  '87000000-0000-4000-8000-000000000011'::UUID,
  'the earliest Claim permanently owns the numbering-base reservation provenance'
);

SELECT is(pg_temp.capture_sqlstate($sql$
  UPDATE public.progress_invoice_numbering_base_reservations
  SET normalized_base = 'mutated'
  WHERE series_id = '87000000-0000-4000-8000-000000000010'
$sql$), '55000', 'reservation identity is immutable');

SELECT is(pg_temp.capture_sqlstate($sql$
  UPDATE public.progress_invoice_numbering_base_reservations
  SET state = 'released'
  WHERE series_id = '87000000-0000-4000-8000-000000000010'
$sql$), '55000', 'a permanent reservation can never be released');

SELECT is(pg_temp.capture_sqlstate($sql$
  DELETE FROM public.progress_invoice_numbering_base_reservations
  WHERE series_id = '87000000-0000-4000-8000-000000000010'
$sql$), '55000', 'reservation rows cannot be deleted');

SELECT is(pg_temp.capture_sqlstate($sql$
  DELETE FROM public.progress_invoice_series
  WHERE id = '87000000-0000-4000-8000-000000000001'
$sql$), '55000', 'Series rows cannot be hard-deleted even without children');

SELECT is(pg_temp.capture_sqlstate($sql$
  UPDATE public.progress_invoice_series
  SET created_at = created_at + interval '1 second'
  WHERE id = '87000000-0000-4000-8000-000000000001'
$sql$), '55000', 'Series creator and creation time provenance is immutable');

SELECT is(pg_temp.capture_sqlstate($sql$
  UPDATE public.progress_invoice_series
  SET accepted_numbering_base = 'Task4-Changed'
  WHERE id = '87000000-0000-4000-8000-000000000010'
$sql$), '55000', 'accepted numbering is immutable after any Claim exists');

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';

CREATE TEMP TABLE task4_preclaim_update AS
SELECT * FROM public.update_progress_invoice_series(jsonb_build_object(
  'series_id', '87000000-0000-4000-8000-000000000001',
  'expected_version', 1,
  'base_contract_ex_gst', '1250.00',
  'recipient_name', 'Future Recipient',
  'correlation_key', '87000000-0000-4000-8000-000000000101'
));

SELECT is(
  (SELECT jsonb_build_object(
    'version', series.version,
    'base', to_char(series.base_contract_ex_gst, 'FM999999999999990.00'),
    'adjusted', to_char(series.current_adjusted_contract_ex_gst, 'FM999999999999990.00'),
    'recipient', series.recipient_name
  ) FROM public.progress_invoice_series AS series
  WHERE series.id = '87000000-0000-4000-8000-000000000001'),
  '{"version":2,"base":"1250.00","adjusted":"1250.00","recipient":"Future Recipient"}'::JSONB,
  'a pre-Claim base edit recalculates the read model and future defaults'
);

SELECT results_eq(
  $sql$ SELECT id, version, quote_id, conflict FROM public.update_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000001',
    'expected_version', 1,
    'base_contract_ex_gst', '1250.00',
    'recipient_name', 'Future Recipient',
    'correlation_key', '87000000-0000-4000-8000-000000000101'
  )) $sql$,
  $sql$ SELECT id, version, quote_id, conflict FROM task4_preclaim_update $sql$,
  'exact update replay returns the original result before current-state rejection'
);

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.update_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000001',
    'expected_version', 2,
    'recipient_name', 'Changed fingerprint',
    'correlation_key', '87000000-0000-4000-8000-000000000101'
  ))
$sql$), 'P0001', 'a changed update fingerprint is rejected');

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.update_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000010',
    'expected_version', 1,
    'base_contract_ex_gst', '1500.00',
    'correlation_key', '87000000-0000-4000-8000-000000000102'
  ))
$sql$), 'P0001', 'a Draft Claim permanently locks Base Contract Ex GST');

SELECT lives_ok($sql$
  SELECT * FROM public.update_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000010',
    'expected_version', 1,
    'reference', 'Future claims only',
    'correlation_key', '87000000-0000-4000-8000-000000000103'
  ))
$sql$, 'future recipient/site/reference/description defaults remain editable after a Claim');

CREATE TEMP TABLE task4_before_issued_void AS
SELECT to_jsonb(series) AS series_state,
  (SELECT count(*) FROM public.progress_invoice_events WHERE series_id = series.id) AS event_count
FROM public.progress_invoice_series AS series
WHERE series.id = '87000000-0000-4000-8000-000000000020';

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.void_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000020',
    'expected_version', 1,
    'expected_current_revision_set_id', NULL,
    'expected_current_manifest_hash', NULL,
    'prepared_revision_set_id', NULL,
    'reason', 'Void issued series',
    'correlation_key', '87000000-0000-4000-8000-000000000104'
  ))
$sql$), 'P0001', 'an Issued Claim requires the official reconciliation workflow');

SELECT is(
  (SELECT jsonb_build_object(
    'same_series', to_jsonb(series) = before_state.series_state,
    'same_events', (SELECT count(*) FROM public.progress_invoice_events WHERE series_id = series.id) = before_state.event_count
  )
   FROM public.progress_invoice_series AS series
   CROSS JOIN task4_before_issued_void AS before_state
   WHERE series.id = '87000000-0000-4000-8000-000000000020'),
  '{"same_events":true,"same_series":true}'::JSONB,
  'Issued-Claim direct Void failure makes no mutation'
);

CREATE TEMP TABLE task4_before_lifetime_issued_void AS
SELECT
  to_jsonb(series) AS series_state,
  (SELECT to_jsonb(claim) FROM public.progress_claims AS claim
   WHERE claim.id = '87000000-0000-4000-8000-000000000051') AS claim_state,
  (SELECT to_jsonb(reservation)
   FROM public.progress_invoice_numbering_base_reservations AS reservation
   WHERE reservation.series_id = series.id) AS reservation_state,
  (SELECT count(*) FROM public.progress_invoice_events AS event
   WHERE event.series_id = series.id) AS event_count,
  (SELECT count(*) FROM public.progress_invoice_events AS event
   WHERE event.series_id = series.id
     AND event.command_name = 'void_progress_invoice_series'
     AND event.correlation_key = '87000000-0000-4000-8000-000000000111') AS idempotency_count
FROM public.progress_invoice_series AS series
WHERE series.id = '87000000-0000-4000-8000-000000000050';

SELECT throws_ok($sql$
  SELECT * FROM public.void_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000050',
    'expected_version', 1,
    'expected_current_revision_set_id', NULL,
    'expected_current_manifest_hash', NULL,
    'prepared_revision_set_id', NULL,
    'reason', 'Void lifetime-issued series',
    'correlation_key', '87000000-0000-4000-8000-000000000111'
  ))
$sql$, 'P0001', 'PROGRESS_CLAIM_VOID_REQUIRED',
  'a historically Issued Claim requires the official Void workflow even after its status becomes Void');

SELECT is(
  (SELECT jsonb_build_object(
    'same_series', to_jsonb(series) = before_state.series_state,
    'same_claim', (SELECT to_jsonb(claim) FROM public.progress_claims AS claim
      WHERE claim.id = '87000000-0000-4000-8000-000000000051') = before_state.claim_state,
    'same_reservation', (SELECT to_jsonb(reservation)
      FROM public.progress_invoice_numbering_base_reservations AS reservation
      WHERE reservation.series_id = series.id) = before_state.reservation_state,
    'same_events', (SELECT count(*) FROM public.progress_invoice_events AS event
      WHERE event.series_id = series.id) = before_state.event_count,
    'same_idempotency', (SELECT count(*) FROM public.progress_invoice_events AS event
      WHERE event.series_id = series.id
        AND event.command_name = 'void_progress_invoice_series'
        AND event.correlation_key = '87000000-0000-4000-8000-000000000111') = before_state.idempotency_count
  )
   FROM public.progress_invoice_series AS series
   CROSS JOIN task4_before_lifetime_issued_void AS before_state
   WHERE series.id = '87000000-0000-4000-8000-000000000050'),
  '{"same_claim":true,"same_events":true,"same_idempotency":true,"same_reservation":true,"same_series":true}'::JSONB,
  'historically Issued Claim rejection preserves Series, Claim, reservation, event, and idempotency state'
);

CREATE TEMP TABLE task4_free_void AS
SELECT * FROM public.void_progress_invoice_series(jsonb_build_object(
  'series_id', '87000000-0000-4000-8000-000000000001',
  'expected_version', 2,
  'expected_current_revision_set_id', NULL,
  'expected_current_manifest_hash', NULL,
  'prepared_revision_set_id', NULL,
  'reason', 'Claim-free duplicate',
  'correlation_key', '87000000-0000-4000-8000-000000000105'
));

SELECT is(
  (SELECT jsonb_build_object(
    'series', result.series_id,
    'version', result.version,
    'mode', result.mode,
    'revision_set', result.revision_set_id,
    'status', series.status,
    'reservation', reservation.state
  )
   FROM task4_free_void AS result
   JOIN public.progress_invoice_series AS series ON series.id = result.series_id
   JOIN public.progress_invoice_numbering_base_reservations AS reservation ON reservation.series_id = series.id),
  '{"series":"87000000-0000-4000-8000-000000000001","version":3,"mode":"direct","revision_set":null,"status":"void","reservation":"released"}'::JSONB,
  'Claim-free direct Void archives the Series and releases its active base'
);

SELECT results_eq(
  $sql$ SELECT series_id, version, mode, revision_set_id FROM public.void_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000001',
    'expected_version', 2,
    'expected_current_revision_set_id', NULL,
    'expected_current_manifest_hash', NULL,
    'prepared_revision_set_id', NULL,
    'reason', 'Claim-free duplicate',
    'correlation_key', '87000000-0000-4000-8000-000000000105'
  )) $sql$,
  $sql$ SELECT series_id, version, mode, revision_set_id FROM task4_free_void $sql$,
  'exact direct-Void replay succeeds even though the Series is now Void'
);

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.update_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000001',
    'expected_version', 3,
    'reference', 'Forbidden after Void',
    'correlation_key', '87000000-0000-4000-8000-000000000106'
  ))
$sql$), 'P0001', 'new edits are rejected for a Void Series');

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.void_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000001',
    'expected_version', 3,
    'expected_current_revision_set_id', NULL,
    'expected_current_manifest_hash', NULL,
    'prepared_revision_set_id', NULL,
    'reason', 'Changed fingerprint',
    'correlation_key', '87000000-0000-4000-8000-000000000105'
  ))
$sql$), 'P0001', 'changed direct-Void fingerprint is rejected');

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.void_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000010',
    'expected_version', 1,
    'expected_current_revision_set_id', NULL,
    'expected_current_manifest_hash', NULL,
    'prepared_revision_set_id', NULL,
    'reason', 'Stale version',
    'correlation_key', '87000000-0000-4000-8000-000000000107'
  ))
$sql$), 'P0001', 'stale direct-Void Series version is rejected without mutation');

CREATE TEMP TABLE task4_draft_void AS
SELECT * FROM public.void_progress_invoice_series(jsonb_build_object(
  'series_id', '87000000-0000-4000-8000-000000000010',
  'expected_version', 2,
  'expected_current_revision_set_id', NULL,
  'expected_current_manifest_hash', NULL,
  'prepared_revision_set_id', NULL,
  'reason', 'Draft-only duplicate',
  'correlation_key', '87000000-0000-4000-8000-000000000108'
));

SELECT is(
  (SELECT jsonb_build_object(
    'series_status', series.status,
    'claim_status', claim.status,
    'claim_number', claim.tax_invoice_number,
    'reservation', reservation.state,
    'first_claim', reservation.first_claim_id
  )
   FROM public.progress_invoice_series AS series
   JOIN public.progress_claims AS claim ON claim.series_id = series.id
   JOIN public.progress_invoice_numbering_base_reservations AS reservation ON reservation.series_id = series.id
   WHERE series.id = '87000000-0000-4000-8000-000000000010'),
  '{"series_status":"void","claim_status":"void","claim_number":"Task4-Draft-P01","reservation":"permanent","first_claim":"87000000-0000-4000-8000-000000000011"}'::JSONB,
  'Draft-only direct Void preserves Claim identity and permanent numbering/base reservations'
);

RESET ROLE;

SELECT is(pg_temp.capture_sqlstate($sql$
  INSERT INTO public.progress_invoice_series (
    source_type, accepted_numbering_base, base_contract_ex_gst,
    recipient_name, recipient_address, site_name, site_address, default_description,
    created_by, updated_by
  ) VALUES (
    'manual', ' task4-draft ', 1000, 'Reuse', 'Billing', 'Site', 'Address', 'Works',
    '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  )
$sql$), '23505', 'a permanent normalized base remains unavailable after Draft-only Void');

SELECT lives_ok($sql$
  INSERT INTO public.progress_invoice_series (
    source_type, accepted_numbering_base, base_contract_ex_gst,
    recipient_name, recipient_address, site_name, site_address, default_description,
    created_by, updated_by
  ) VALUES (
    'manual', 'task4-free', 1000, 'Reuse', 'Billing', 'Site', 'Address', 'Works',
    '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  )
$sql$, 'a released Claim-free normalized base can be reserved by a new Series');

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.void_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000020',
    'expected_version', 1,
    'expected_current_revision_set_id', '87000000-0000-4000-8000-000000000099',
    'expected_current_manifest_hash', repeat('a', 64),
    'prepared_revision_set_id', NULL,
    'reason', 'Stale Current set',
    'correlation_key', '87000000-0000-4000-8000-000000000109'
  ))
$sql$), 'P0001', 'exact Current-set pointer and canonical manifest hash are required');

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.void_progress_invoice_series(jsonb_build_object(
    'series_id', '87000000-0000-4000-8000-000000000020',
    'expected_version', 1,
    'expected_current_revision_set_id', NULL,
    'expected_current_manifest_hash', NULL,
    'prepared_revision_set_id', '87000000-0000-4000-8000-000000000099',
    'reason', 'Prepared set is not supported',
    'correlation_key', '87000000-0000-4000-8000-000000000110'
  ))
$sql$), 'P0001', 'Task 4 rejects a non-null prepared Revision Set');

RESET ROLE;

SELECT is(pg_temp.capture_sqlstate($sql$
  UPDATE public.progress_invoice_series
  SET jobber_account_id = 'forbidden', jobber_invoice_id = 'forbidden'
  WHERE id = '87000000-0000-4000-8000-000000000010'
$sql$), '55000', 'Claim existence freezes applicable Jobber identity and selectors');

SELECT is(
  (
    SELECT jobber_account_id IS NULL
      AND jobber_invoice_id IS NULL
      AND selected_jobber_job_id IS NULL
      AND selected_jobber_property_id IS NULL
    FROM public.progress_invoice_series
    WHERE id = '87000000-0000-4000-8000-000000000010'
  ),
  true,
  'Manual-Series Jobber-null invariants remain intact'
);

INSERT INTO public.quotes (
  id, customer_name, customer_address, working_days,
  formula1_total, formula2_total, formula3_total, formula4_total, formula5_total,
  selected_min, selected_max, interior_selected_min, interior_selected_max,
  exterior_selected_min, exterior_selected_max, roof_selected_min, roof_selected_max,
  subtotal, final_total, pricing_settings_snapshot, created_by
) VALUES
  (
    '87000000-0000-4000-8000-000000000040', 'Active Quote', '1 Quote Street', 1,
    1000, 1000, 1000, 1000, 1000, 1, 1, 1, 1, 1, 1, 1, 1,
    1000, 1100, '{}'::JSONB, '00000000-0000-0000-0000-000000008001'
  ),
  (
    '87000000-0000-4000-8000-000000000041', 'Void Quote', '2 Quote Street', 1,
    1000, 1000, 1000, 1000, 1000, 1, 1, 1, 1, 1, 1, 1, 1,
    1000, 1100, '{}'::JSONB, '00000000-0000-0000-0000-000000008001'
  );

INSERT INTO public.progress_invoice_series (
  id, source_type, quote_id, jobber_account_id, jobber_invoice_id,
  accepted_numbering_base, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description,
  status, created_by, updated_by
) VALUES
  (
    '87000000-0000-4000-8000-000000000042', 'pbc_quote',
    '87000000-0000-4000-8000-000000000040', 'task4-quote-account', 'task4-active-invoice',
    'Task4-Quote-Active', 1000,
    'Active Quote', 'Billing', 'Site', 'Site address', 'Works', 'active',
    '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  ),
  (
    '87000000-0000-4000-8000-000000000043', 'pbc_quote',
    '87000000-0000-4000-8000-000000000041', 'task4-quote-account', 'task4-void-invoice',
    'Task4-Quote-Void', 1000,
    'Void Quote', 'Billing', 'Site', 'Site address', 'Works', 'void',
    '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
  );

SELECT is(pg_temp.capture_sqlstate($sql$
  UPDATE public.progress_invoice_series SET quote_id = NULL
  WHERE id = '87000000-0000-4000-8000-000000000042'
$sql$), '55000', 'direct active-Series Quote provenance clearing remains forbidden');

SELECT lives_ok($sql$
  DELETE FROM public.quotes WHERE id = '87000000-0000-4000-8000-000000000040'
$sql$, 'active-Series Quote deletion may apply the legitimate FK SET NULL transition');

SELECT is(
  (SELECT quote_id FROM public.progress_invoice_series
   WHERE id = '87000000-0000-4000-8000-000000000042'),
  NULL::UUID,
  'active-Series Quote deletion clears only the FK link'
);

SELECT is(pg_temp.capture_sqlstate($sql$
  UPDATE public.progress_invoice_series SET quote_id = NULL
  WHERE id = '87000000-0000-4000-8000-000000000043'
$sql$), '55000', 'direct Void-Series Quote provenance clearing remains forbidden');

SELECT lives_ok($sql$
  DELETE FROM public.quotes WHERE id = '87000000-0000-4000-8000-000000000041'
$sql$, 'Void-Series Quote deletion may apply the legitimate FK SET NULL transition');

SELECT is(
  (SELECT quote_id FROM public.progress_invoice_series
   WHERE id = '87000000-0000-4000-8000-000000000043'),
  NULL::UUID,
  'Void-Series Quote deletion clears only the FK link while keeping the Series archived'
);

-- Task 5 ledger command assertions
RESET ROLE;
INSERT INTO public.progress_invoice_series (
  id, source_type, accepted_numbering_base, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description,
  created_by, updated_by
) VALUES (
  '88000000-0000-4000-8000-000000000001', 'manual', 'TASK5-LEDGER', 1000,
  'Ledger Builder', '1 Billing Street', 'Ledger Site', '2 Site Street', 'Ledger works',
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);

SELECT is((
  SELECT bool_and(
    has_function_privilege('authenticated', to_regprocedure(signature), 'EXECUTE')
    AND NOT has_function_privilege('anon', to_regprocedure(signature), 'EXECUTE')
    AND NOT has_function_privilege('service_role', to_regprocedure(signature), 'EXECUTE')
  )
  FROM unnest(ARRAY[
    'public.reject_progress_adjustment(jsonb)',
    'public.create_manual_progress_payment(jsonb)',
    'public.replace_manual_progress_payment(jsonb)',
    'public.void_manual_progress_payment(jsonb)',
    'public.reconcile_progress_payment(jsonb)',
    'public.undo_progress_payment_reconciliation(jsonb)'
  ]) signature
), true, 'Task 5 ledger RPC ACL exposes authenticated only');

SELECT is((
  SELECT bool_and(proconfig @> ARRAY['search_path=""'])
  FROM pg_proc
  WHERE oid = ANY(ARRAY[
    to_regprocedure('public.reject_progress_adjustment(jsonb)'),
    to_regprocedure('public.create_manual_progress_payment(jsonb)'),
    to_regprocedure('public.replace_manual_progress_payment(jsonb)'),
    to_regprocedure('public.void_manual_progress_payment(jsonb)'),
    to_regprocedure('public.reconcile_progress_payment(jsonb)'),
    to_regprocedure('public.undo_progress_payment_reconciliation(jsonb)')
  ])
), true, 'Task 5 ledger RPCs pin an empty search path');

INSERT INTO public.progress_adjustments (
  id, series_id, type, status, effective_date, description, amount_ex_gst, created_by, updated_by
) VALUES (
  '88000000-0000-4000-8000-000000000002', '88000000-0000-4000-8000-000000000001',
  'credit', 'draft', '2026-07-20', 'Entered in error', 10,
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';

CREATE TEMP TABLE task5_ledger_reject AS
SELECT * FROM public.reject_progress_adjustment(jsonb_build_object(
  'adjustment_id','88000000-0000-4000-8000-000000000002','expected_version',1,
  'reason','Entered in error','correlation_key','88000000-0000-4000-8000-000000000010'
));
SELECT is((SELECT status='rejected' AND version=2 FROM public.progress_adjustments WHERE id='88000000-0000-4000-8000-000000000002'),true,
  'Draft Adjustment rejection is terminal and versioned');
SELECT is(pg_temp.capture_sqlstate($sql$UPDATE public.progress_adjustments SET description='forbidden' WHERE id='88000000-0000-4000-8000-000000000002'$sql$),'42501',
  'authenticated callers cannot mutate rejected Adjustment evidence');

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.create_manual_progress_payment('{"series_id":"88000000-0000-4000-8000-000000000001","expected_series_version":1,"received_date":"2026-07-20","amount":"25.00","method":"EFT","reference":null,"correlation_key":"88000000-0000-4000-8000-000000000011","retention":"1.00"}'::jsonb)
$sql$),'22023','ledger payload rejects unknown Retention keys');

CREATE TEMP TABLE task5_manual_create AS
SELECT * FROM public.create_manual_progress_payment(jsonb_build_object(
  'series_id','88000000-0000-4000-8000-000000000001','expected_series_version',1,
  'received_date','2026-07-20','amount','100.00','method','EFT','reference','M-1',
  'correlation_key','88000000-0000-4000-8000-000000000012'
));
SELECT is((SELECT current_actual_receipts=100 AND current_credit_balance=100 FROM public.progress_invoice_series WHERE id='88000000-0000-4000-8000-000000000001'),true,
  'Manual actual receipt updates authoritative caches and allows overpayment credit');
SELECT is((SELECT count(*)=1 AND min(revision_number)=1 AND bool_and(status='active') FROM public.progress_payment_revisions WHERE payment_id=(SELECT id FROM task5_manual_create)),true,
  'Manual create appends Revision 1 Active');

SELECT * FROM public.create_manual_progress_payment(jsonb_build_object(
  'series_id','88000000-0000-4000-8000-000000000001','expected_series_version',1,
  'received_date','2026-07-20','amount','100.00','method','EFT','reference','M-1',
  'correlation_key','88000000-0000-4000-8000-000000000012'
));
SELECT is((SELECT count(*) FROM public.progress_payment_revisions WHERE payment_id=(SELECT id FROM task5_manual_create)),1::BIGINT,
  'exact Manual create replay appends no duplicate revision');
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.create_manual_progress_payment('{"series_id":"88000000-0000-4000-8000-000000000001","expected_series_version":1,"received_date":"2026-07-20","amount":"101.00","method":"EFT","reference":"M-1","correlation_key":"88000000-0000-4000-8000-000000000012"}'::jsonb)
$sql$),'P0001','reused Manual correlation key with different payload fails');

CREATE TEMP TABLE task5_manual_replace AS
SELECT * FROM public.replace_manual_progress_payment(jsonb_build_object(
  'payment_id',(SELECT id FROM task5_manual_create),'expected_version',1,'received_date','2026-07-20',
  'amount','120.00','method','EFT','reference','M-2','reason','Correct receipt',
  'correlation_key','88000000-0000-4000-8000-000000000013'
));
SELECT is((SELECT count(*)=2 AND max(revision_number)=2 AND bool_and(predecessor_revision_id IS NOT NULL) FILTER (WHERE revision_number=2)
  FROM public.progress_payment_revisions WHERE payment_id=(SELECT id FROM task5_manual_create)),true,
  'Manual replacement is append-only with a predecessor pointer');

RESET ROLE;
INSERT INTO public.progress_payments(id,series_id,source,jobber_payment_id,created_by,updated_by)
VALUES('88000000-0000-4000-8000-000000000020','88000000-0000-4000-8000-000000000001','jobber','JOBBER-1',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
INSERT INTO public.progress_payment_revisions(id,payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,
  sync_state,status,created_by,jobber_source,raw_signed_amount,direction,payment_eligibility_treatment)
VALUES('88000000-0000-4000-8000-000000000021','88000000-0000-4000-8000-000000000020',1,'2026-07-20',120,120,
  'observed','active','00000000-0000-0000-0000-000000008001','payment_record',120,'receipt','active');
UPDATE public.progress_payments SET current_revision_id='88000000-0000-4000-8000-000000000021' WHERE id='88000000-0000-4000-8000-000000000020';
SELECT public.progress_recalculate_series_read_model_as('88000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000008001');
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';

CREATE TEMP TABLE task5_match AS SELECT * FROM public.reconcile_progress_payment(jsonb_build_object(
  'jobber_payment_id','88000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_manual_create),
  'jobber_expected_version',1,'manual_expected_version',2,'reason','Same bank receipt',
  'correlation_key','88000000-0000-4000-8000-000000000014'
));
SELECT is((SELECT current_actual_receipts=120 FROM public.progress_invoice_series WHERE id='88000000-0000-4000-8000-000000000001'),true,
  'explicit match prevents Manual and Jobber double counting');
SELECT is((SELECT j.matched_manual_payment_id=m.id AND r.status='superseded' AND r.effective_receipt_amount=0
  FROM public.progress_payments j JOIN public.progress_payments m ON m.id=j.matched_manual_payment_id
  JOIN public.progress_payment_revisions r ON r.id=m.current_revision_id WHERE j.id='88000000-0000-4000-8000-000000000020'),true,
  'match keeps Jobber Active and appends a Superseded Manual revision');

SELECT * FROM public.undo_progress_payment_reconciliation(jsonb_build_object(
  'jobber_payment_id','88000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_manual_create),
  'jobber_expected_version',2,'manual_expected_version',3,'reason','Not the same receipt',
  'correlation_key','88000000-0000-4000-8000-000000000015'
));
SELECT is((SELECT current_actual_receipts=240 FROM public.progress_invoice_series WHERE id='88000000-0000-4000-8000-000000000001'),true,
  'undo restores the independent Manual effective receipt');
SELECT is((SELECT j.matched_manual_payment_id IS NULL AND r.status='active' AND r.revision_number=4
  FROM public.progress_payments j CROSS JOIN public.progress_payments m
  JOIN public.progress_payment_revisions r ON r.id=m.current_revision_id
  WHERE j.id='88000000-0000-4000-8000-000000000020' AND m.id=(SELECT id FROM task5_manual_create)),true,
  'undo clears the pointer and appends a restored Active Manual revision');

SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.void_manual_progress_payment('{"payment_id":"88000000-0000-4000-8000-000000000020","expected_version":3,"reason":"forbidden","correlation_key":"88000000-0000-4000-8000-000000000016"}'::jsonb)
$sql$),'55000','Jobber receipt revisions remain read-only to Manual mutation commands');

RESET ROLE;
INSERT INTO public.progress_payments(id,series_id,source,jobber_payment_id,created_by,updated_by)
VALUES('88000000-0000-4000-8000-000000000022','88000000-0000-4000-8000-000000000001','jobber','JOBBER-REFUND',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
INSERT INTO public.progress_payment_revisions(id,payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,
  sync_state,status,created_by,jobber_source,raw_signed_amount,direction,payment_eligibility_treatment)
VALUES('88000000-0000-4000-8000-000000000023','88000000-0000-4000-8000-000000000022',1,'2026-07-20',25,-25,
  'refunded','active','00000000-0000-0000-0000-000000008001','nested_refund',-25,'refund','active');
UPDATE public.progress_payments SET current_revision_id='88000000-0000-4000-8000-000000000023' WHERE id='88000000-0000-4000-8000-000000000022';
SELECT public.progress_recalculate_series_read_model_as('88000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000008001');
SELECT is((SELECT current_actual_receipts=215 FROM public.progress_invoice_series WHERE id='88000000-0000-4000-8000-000000000001'),true,
  'signed Jobber refund effects remain independent in the authoritative ledger');

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is((SELECT conflict FROM public.reconcile_progress_payment(jsonb_build_object(
  'jobber_payment_id','88000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_manual_create),
  'jobber_expected_version',1,'manual_expected_version',4,'reason','Stale Jobber version',
  'correlation_key','88000000-0000-4000-8000-000000000018'))),true,
  'match returns a stale-current conflict for a stale Jobber version');
SELECT is((SELECT conflict FROM public.reconcile_progress_payment(jsonb_build_object(
  'jobber_payment_id','88000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_manual_create),
  'jobber_expected_version',3,'manual_expected_version',1,'reason','Stale Manual version',
  'correlation_key','88000000-0000-4000-8000-000000000019'))),true,
  'match returns a stale-current conflict for a stale Manual version');
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.undo_progress_payment_reconciliation(jsonb_build_object(
    'jobber_payment_id','88000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_manual_create),
    'jobber_expected_version',3,'manual_expected_version',4,'reason','No active match exists',
    'correlation_key','88000000-0000-4000-8000-000000000024'))
$sql$),'23514','undo rejects an otherwise-current pair without an active match');
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.reconcile_progress_payment(jsonb_build_object(
    'jobber_payment_id',(SELECT id FROM task5_manual_create),'manual_payment_id','88000000-0000-4000-8000-000000000020',
    'jobber_expected_version',4,'manual_expected_version',3,'reason','Sources are reversed',
    'correlation_key','88000000-0000-4000-8000-000000000025'))
$sql$),'23514','match rejects reversed Manual/Jobber source roles');

RESET ROLE;
INSERT INTO public.progress_invoice_series (
  id, source_type, accepted_numbering_base, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description, created_by, updated_by
) VALUES (
  '88000000-0000-4000-8000-000000000030','manual','TASK5-OTHER',100,
  'Other Builder','Other Billing','Other Site','Other address','Other works',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001'
);
INSERT INTO public.progress_payments(id,series_id,source,created_by,updated_by)
VALUES('88000000-0000-4000-8000-000000000031','88000000-0000-4000-8000-000000000030','manual',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
INSERT INTO public.progress_payment_revisions(id,payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,
  sync_state,status,created_by)
VALUES('88000000-0000-4000-8000-000000000032','88000000-0000-4000-8000-000000000031',1,'2026-07-20',10,10,
  'manual','active','00000000-0000-0000-0000-000000008001');
UPDATE public.progress_payments SET current_revision_id='88000000-0000-4000-8000-000000000032'
WHERE id='88000000-0000-4000-8000-000000000031';
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.reconcile_progress_payment(jsonb_build_object(
    'jobber_payment_id','88000000-0000-4000-8000-000000000020','manual_payment_id','88000000-0000-4000-8000-000000000031',
    'jobber_expected_version',3,'manual_expected_version',1,'reason','Different Series',
    'correlation_key','88000000-0000-4000-8000-000000000026'))
$sql$),'23514','match rejects receipts owned by different Series');

CREATE TEMP TABLE task5_rematch AS SELECT * FROM public.reconcile_progress_payment(jsonb_build_object(
  'jobber_payment_id','88000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_manual_create),
  'jobber_expected_version',3,'manual_expected_version',4,'reason','Verified again',
  'correlation_key','88000000-0000-4000-8000-000000000027'));
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.reconcile_progress_payment(jsonb_build_object(
    'jobber_payment_id','88000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_manual_create),
    'jobber_expected_version',4,'manual_expected_version',5,'reason','Already matched',
    'correlation_key','88000000-0000-4000-8000-000000000028'))
$sql$),'23514','match rejects current versions in already Matched/Superseded state');
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.replace_manual_progress_payment(jsonb_build_object(
    'payment_id',(SELECT id FROM task5_manual_create),'expected_version',5,'received_date','2026-07-20',
    'amount','120.00','method','EFT','reference','M-2','reason','Forbidden matched replacement',
    'correlation_key','88000000-0000-4000-8000-000000000029'))
$sql$),'55000','replace rejects a Matched/Superseded Manual receipt');
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.void_manual_progress_payment(jsonb_build_object(
    'payment_id',(SELECT id FROM task5_manual_create),'expected_version',5,'reason','Forbidden matched Void',
    'correlation_key','88000000-0000-4000-8000-000000000033'))
$sql$),'55000','Void rejects a Matched/Superseded Manual receipt');

RESET ROLE;
UPDATE public.progress_invoice_series SET status='void' WHERE id='88000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.create_manual_progress_payment('{"series_id":"88000000-0000-4000-8000-000000000001","expected_series_version":7,"received_date":"2026-07-20","amount":"1.00","method":"EFT","reference":null,"correlation_key":"88000000-0000-4000-8000-000000000017"}'::jsonb)
$sql$),'P0001','Void Series rejects ledger mutation');

RESET ROLE;
SELECT is(pg_temp.capture_sqlstate($sql$DELETE FROM public.progress_payments WHERE id='88000000-0000-4000-8000-000000000020'$sql$),'55000',
  'Payment identities have no DELETE path');

-- Task 5 review: exact idempotent results survive later terminal/current-state changes.
INSERT INTO public.progress_invoice_series (
  id, source_type, accepted_numbering_base, base_contract_ex_gst,
  recipient_name, recipient_address, site_name, site_address, default_description,
  created_by, updated_by
) VALUES (
  '89000000-0000-4000-8000-000000000001', 'manual', 'TASK5-REPLAY', 1000,
  'Replay Builder', '1 Replay Street', 'Replay Site', '2 Replay Street', 'Replay works',
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);
INSERT INTO public.progress_adjustments (
  id, series_id, type, status, effective_date, description, amount_ex_gst, created_by, updated_by
) VALUES (
  '89000000-0000-4000-8000-000000000002', '89000000-0000-4000-8000-000000000001',
  'variation', 'draft', '2026-07-20', 'Replay adjustment', 10,
  '00000000-0000-0000-0000-000000008001', '00000000-0000-0000-0000-000000008001'
);
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';

CREATE TEMP TABLE task5_replay_reject AS SELECT * FROM public.reject_progress_adjustment(jsonb_build_object(
  'adjustment_id','89000000-0000-4000-8000-000000000002','expected_version',1,'reason','No longer required',
  'correlation_key','89000000-0000-4000-8000-000000000010'));
CREATE TEMP TABLE task5_replay_create AS SELECT * FROM public.create_manual_progress_payment(jsonb_build_object(
  'series_id','89000000-0000-4000-8000-000000000001','expected_series_version',1,'received_date','2026-07-20',
  'amount','100.00','method','EFT','reference','RP-1','correlation_key','89000000-0000-4000-8000-000000000011'));
CREATE TEMP TABLE task5_replay_replace AS SELECT * FROM public.replace_manual_progress_payment(jsonb_build_object(
  'payment_id',(SELECT id FROM task5_replay_create),'expected_version',1,'received_date','2026-07-21',
  'amount','101.00','method','EFT','reference','RP-2','reason','Bank correction',
  'correlation_key','89000000-0000-4000-8000-000000000012'));
CREATE TEMP TABLE task5_replay_void AS SELECT * FROM public.void_manual_progress_payment(jsonb_build_object(
  'payment_id',(SELECT id FROM task5_replay_create),'expected_version',2,'reason','Duplicate entry',
  'correlation_key','89000000-0000-4000-8000-000000000013'));
CREATE TEMP TABLE task5_replay_match_manual AS SELECT * FROM public.create_manual_progress_payment(jsonb_build_object(
  'series_id','89000000-0000-4000-8000-000000000001','expected_series_version',4,'received_date','2026-07-22',
  'amount','75.00','method','Card','reference','RP-M','correlation_key','89000000-0000-4000-8000-000000000014'));

RESET ROLE;
INSERT INTO public.progress_payments(id,series_id,source,jobber_payment_id,created_by,updated_by)
VALUES('89000000-0000-4000-8000-000000000020','89000000-0000-4000-8000-000000000001','jobber','JOBBER-REPLAY',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
INSERT INTO public.progress_payment_revisions(id,payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,
  payment_method,reference,sync_state,status,created_by,jobber_source,raw_signed_amount,direction,payment_eligibility_treatment)
VALUES('89000000-0000-4000-8000-000000000021','89000000-0000-4000-8000-000000000020',1,'2026-07-22',75,75,
  'Card','JB-RP','observed','active','00000000-0000-0000-0000-000000008001','payment_record',75,'receipt','active');
UPDATE public.progress_payments SET current_revision_id='89000000-0000-4000-8000-000000000021'
WHERE id='89000000-0000-4000-8000-000000000020';

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
CREATE TEMP TABLE task5_replay_reconcile AS SELECT * FROM public.reconcile_progress_payment(jsonb_build_object(
  'jobber_payment_id','89000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_replay_match_manual),
  'jobber_expected_version',1,'manual_expected_version',1,'reason','Verified same receipt',
  'correlation_key','89000000-0000-4000-8000-000000000015'));
CREATE TEMP TABLE task5_replay_undo AS SELECT * FROM public.undo_progress_payment_reconciliation(jsonb_build_object(
  'jobber_payment_id','89000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_replay_match_manual),
  'jobber_expected_version',2,'manual_expected_version',2,'reason','Match was incorrect',
  'correlation_key','89000000-0000-4000-8000-000000000016'));

RESET ROLE;
UPDATE public.progress_invoice_series SET status='void' WHERE id='89000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';

SELECT is((SELECT to_jsonb(replayed) FROM public.reject_progress_adjustment(jsonb_build_object(
  'adjustment_id','89000000-0000-4000-8000-000000000002','expected_version',1,'reason','No longer required',
  'correlation_key','89000000-0000-4000-8000-000000000010')) replayed),
  (SELECT to_jsonb(saved) FROM task5_replay_reject saved), 'reject replay returns the exact prior result after Series Void');
SELECT is((SELECT to_jsonb(replayed) FROM public.create_manual_progress_payment(jsonb_build_object(
  'series_id','89000000-0000-4000-8000-000000000001','expected_series_version',1,'received_date','2026-07-20',
  'amount','100.00','method','EFT','reference','RP-1','correlation_key','89000000-0000-4000-8000-000000000011')) replayed),
  (SELECT to_jsonb(saved) FROM task5_replay_create saved), 'create replay returns the exact prior result after Series Void');
SELECT is((SELECT to_jsonb(replayed) FROM public.replace_manual_progress_payment(jsonb_build_object(
  'payment_id',(SELECT id FROM task5_replay_create),'expected_version',1,'received_date','2026-07-21','amount','101.00',
  'method','EFT','reference','RP-2','reason','Bank correction','correlation_key','89000000-0000-4000-8000-000000000012')) replayed),
  (SELECT to_jsonb(saved) FROM task5_replay_replace saved), 'replace replay returns the exact prior result after later Void/current-state changes');
SELECT is((SELECT to_jsonb(replayed) FROM public.void_manual_progress_payment(jsonb_build_object(
  'payment_id',(SELECT id FROM task5_replay_create),'expected_version',2,'reason','Duplicate entry',
  'correlation_key','89000000-0000-4000-8000-000000000013')) replayed),
  (SELECT to_jsonb(saved) FROM task5_replay_void saved), 'Void replay returns the exact prior result after Series Void');
SELECT is((SELECT to_jsonb(replayed) FROM public.reconcile_progress_payment(jsonb_build_object(
  'jobber_payment_id','89000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_replay_match_manual),
  'jobber_expected_version',1,'manual_expected_version',1,'reason','Verified same receipt',
  'correlation_key','89000000-0000-4000-8000-000000000015')) replayed),
  (SELECT to_jsonb(saved) FROM task5_replay_reconcile saved), 'match replay returns the exact prior result after undo and Series Void');
SELECT is((SELECT to_jsonb(replayed) FROM public.undo_progress_payment_reconciliation(jsonb_build_object(
  'jobber_payment_id','89000000-0000-4000-8000-000000000020','manual_payment_id',(SELECT id FROM task5_replay_match_manual),
  'jobber_expected_version',2,'manual_expected_version',2,'reason','Match was incorrect',
  'correlation_key','89000000-0000-4000-8000-000000000016')) replayed),
  (SELECT to_jsonb(saved) FROM task5_replay_undo saved), 'undo replay returns the exact prior result after Series Void');
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT * FROM public.create_manual_progress_payment('{"series_id":"89000000-0000-4000-8000-000000000001","expected_series_version":1,"received_date":"2026-07-20","amount":"999.00","method":"EFT","reference":"RP-1","correlation_key":"89000000-0000-4000-8000-000000000011"}'::jsonb)
$sql$),'P0001','reused replay key with a different fingerprint still fails after Series Void');

-- Task 6: Draft Claim numbering, snapshots, calculations, literal dates and private replay.
RESET ROLE;
DELETE FROM public.business_invoice_profiles;
INSERT INTO public.business_invoice_profiles(
  legal_name,trading_name,abn,contractor_licence,business_address,phone,email,bank_name,bsb,bank_account_name,bank_account_number,
  gst_rate,business_timezone,default_payment_term_days,created_by,updated_by
) VALUES('Paint Buddy & Co Pty Ltd','Paint Buddy & Co','51824753556','LIC-1','1 Paint Street, Sydney NSW 2000','0400000000',
  'accounts@example.test','Test Bank','000-000','Paint Buddy & Co','12345678',0.10,'Australia/Sydney',14,
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
INSERT INTO public.progress_invoice_series(id,source_type,accepted_numbering_base,base_contract_ex_gst,recipient_name,recipient_address,
  site_name,site_address,default_description,reference,created_by,updated_by)
VALUES('91000000-0000-4000-8000-000000000001','manual','900001',10000,'Builder','1 Builder Street','Site A','2 Site Street',
  'Progress painting works','SITE-A','00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');

SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
CREATE TEMP TABLE task6_p01 AS SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','kind','progress','input_mode','cumulative_percentage',
  'authoritative_value','90.000000','issue_date','2026-07-20','due_date','2026-08-03','description','Progress painting works',
  'notes',null,'expected_series_version',1,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'correlation_key','91000000-0000-4000-8000-000000000010')) AS dto;
SELECT is((SELECT dto->>'suffix' FROM task6_p01),'P01','first Draft reserves P01');
SELECT is((SELECT dto->>'tax_invoice_number' FROM task6_p01),'900001-P01','Tax Invoice number preserves visible accepted base');
SELECT is((SELECT dto->>'current_claim_inc_gst' FROM task6_p01),'9900.00','arbitrary 90 percent Draft derives exact Inc GST');
SELECT is((SELECT dto->>'cumulative_percentage' FROM task6_p01),'90.000000','percentage persistence retains NUMERIC(9,6) precision');
SELECT ok((SELECT dto->'jobber_account_id'='null'::jsonb AND dto->'jobber_invoice_id'='null'::jsonb
  AND dto->'original_jobber_invoice_number'='null'::jsonb AND dto->'observed_jobber_invoice_number'='null'::jsonb FROM task6_p01),
  'Manual Draft snapshots all-null Jobber evidence');
SELECT is((SELECT state FROM public.progress_invoice_numbering_base_reservations WHERE series_id='91000000-0000-4000-8000-000000000001'),
  'permanent','first Draft permanently promotes numbering-base reservation');

CREATE TEMP TABLE task6_save AS SELECT public.save_progress_claim_draft(jsonb_build_object(
  'claim_id',(SELECT dto->>'claim_id' FROM task6_p01),'expected_claim_version',1,'expected_series_version',2,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'input_mode','current_claim_amount',
  'authoritative_value','1000.00','issue_date','2026-07-21','due_date','2026-08-04','description','Updated progress works','notes','Internal note',
  'correlation_key','91000000-0000-4000-8000-000000000011')) AS dto;
SELECT is((SELECT dto->>'input_mode' FROM task6_save),'current_claim_amount','save changes the authoritative mode on Draft Revision 1');
SELECT is((SELECT dto->>'current_claim_inc_gst' FROM task6_save),'1000.00','amount mode persists the authoritative cents exactly');
SELECT is((SELECT dto->>'revision_number' FROM task6_save),'1','save retains Draft Revision 1 identity');
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.save_progress_claim_draft(jsonb_build_object(
    'claim_id',(SELECT dto->>'claim_id' FROM task6_p01),'expected_claim_version',1,'expected_series_version',2,
    'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'input_mode','current_claim_amount',
    'authoritative_value','1001.00','issue_date','2026-07-21','due_date','2026-08-04','description','Updated progress works','notes','Internal note',
    'correlation_key','91000000-0000-4000-8000-000000000011'))
$sql$),'P0001','same save key with changed fingerprint is rejected');

RESET ROLE;
UPDATE public.progress_claims SET status='void' WHERE id=(SELECT (dto->>'claim_id')::uuid FROM task6_p01);
SET ROLE authenticated;
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000008001';
CREATE TEMP TABLE task6_p02 AS SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','kind','progress','input_mode','current_claim_amount','authoritative_value','100.00',
  'issue_date','2026-07-22','due_date','2026-08-05','description','Second Draft','notes',null,'expected_series_version',3,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','91000000-0000-4000-8000-000000000012')) AS dto;
SELECT is((SELECT dto->>'suffix' FROM task6_p02),'P02','Void P01 identity is not reused');
SELECT is((SELECT count(*)::int FROM public.progress_claims WHERE series_id='91000000-0000-4000-8000-000000000001' AND suffix='P01'),1,
  'historical P01 remains unique and permanent');

RESET ROLE;
INSERT INTO public.progress_claims(series_id,sequence,kind,suffix,tax_invoice_number,status,created_by,updated_by)
SELECT '91000000-0000-4000-8000-000000000001',n,'progress','P'||lpad(n::text,2,'0'),'900001-P'||lpad(n::text,2,'0'),'void',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001' FROM generate_series(3,9) n;
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
CREATE TEMP TABLE task6_p10 AS SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','kind','progress','input_mode','current_claim_amount','authoritative_value','100.00',
  'issue_date','2026-07-23','due_date','2026-08-06','description','Tenth Draft','notes',null,'expected_series_version',4,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','91000000-0000-4000-8000-000000000013')) AS dto;
SELECT is((SELECT dto->>'suffix' FROM task6_p10),'P10','sequence 10 uses P10');
RESET ROLE;
INSERT INTO public.progress_claims(series_id,sequence,kind,suffix,tax_invoice_number,status,created_by,updated_by)
SELECT '91000000-0000-4000-8000-000000000001',n,'progress','P'||n::text,'900001-P'||n::text,'void',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001' FROM generate_series(11,99) n;
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
CREATE TEMP TABLE task6_p100 AS SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','kind','progress','input_mode','current_claim_amount','authoritative_value','100.00',
  'issue_date','2026-07-24','due_date','2026-08-07','description','Hundredth Draft','notes',null,'expected_series_version',5,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','91000000-0000-4000-8000-000000000014')) AS dto;
SELECT is((SELECT dto->>'suffix' FROM task6_p100),'P100','sequence 100 uses P100 without truncation');
SELECT is((SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','kind','progress','input_mode','cumulative_percentage',
  'authoritative_value','90.000000','issue_date','2026-07-20','due_date','2026-08-03','description','Progress painting works',
  'notes',null,'expected_series_version',1,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'correlation_key','91000000-0000-4000-8000-000000000010'))),
  (SELECT dto FROM task6_p01),'create exact replay returns original DTO after later saves and Series version changes');
SELECT is((SELECT public.save_progress_claim_draft(jsonb_build_object(
  'claim_id',(SELECT dto->>'claim_id' FROM task6_p01),'expected_claim_version',1,'expected_series_version',2,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'input_mode','current_claim_amount','authoritative_value','1000.00',
  'issue_date','2026-07-21','due_date','2026-08-04','description','Updated progress works','notes','Internal note',
  'correlation_key','91000000-0000-4000-8000-000000000011'))),
  (SELECT dto FROM task6_save),'save exact replay returns original DTO after later Series changes');

RESET ROLE;
INSERT INTO public.progress_invoice_series(id,source_type,accepted_numbering_base,base_contract_ex_gst,recipient_name,recipient_address,site_name,site_address,default_description,created_by,updated_by)
VALUES('92000000-0000-4000-8000-000000000001','manual','FINAL-1',1000,'Builder','Billing','Final Site','Site','Final works',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
CREATE TEMP TABLE task6_final AS SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','92000000-0000-4000-8000-000000000001','kind','final','input_mode','current_claim_amount','authoritative_value','1100.00',
  'issue_date','2026-07-20','due_date','2026-08-03','description','Final works','notes',null,'expected_series_version',1,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','92000000-0000-4000-8000-000000000010')) AS dto;
SELECT is((SELECT dto->>'suffix' FROM task6_final),'FINAL','FINAL uses permanent FINAL suffix');
SELECT is((SELECT dto->>'current_claim_inc_gst' FROM task6_final),'1100.00','FINAL consumes exact residual Inc GST');
SELECT is((SELECT dto->>'remaining_inc_gst' FROM task6_final),'0.00','FINAL leaves zero exact residual');
SELECT is((public.get_progress_invoice_workspace('{"series_id":"92000000-0000-4000-8000-000000000001"}'::jsonb)
  #>> '{capabilities,can_create_claim}')::BOOLEAN,false,
  'workspace disables Claim creation whenever a FINAL Claim exists');
SELECT is((public.get_progress_claim_defaults('{"series_id":"92000000-0000-4000-8000-000000000001"}'::jsonb)
  ->>'can_save')::BOOLEAN,false,
  'new Claim defaults cannot save whenever a FINAL Claim exists');
SELECT is((public.get_progress_claim_editor(jsonb_build_object('claim_id',(SELECT dto->>'claim_id' FROM task6_final)))
  ->>'can_save')::BOOLEAN,true,
  'the existing FINAL Draft editor remains saveable');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','92000000-0000-4000-8000-000000000001','kind','progress','input_mode','current_claim_amount','authoritative_value','1.00',
  'issue_date','2026-07-21','due_date','2026-08-04','description','After Final','notes',null,'expected_series_version',2,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','92000000-0000-4000-8000-000000000011'))$sql$),
  '23514','no Claim may be created after FINAL');
RESET ROLE;
UPDATE public.progress_claims SET status='issued',original_issued_at=now()
WHERE id=(SELECT (dto->>'claim_id')::UUID FROM task6_final);
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT ok((public.get_progress_invoice_workspace('{"series_id":"92000000-0000-4000-8000-000000000001"}'::jsonb)
    #>> '{capabilities,can_create_claim}')::BOOLEAN IS FALSE
    AND (public.get_progress_claim_defaults('{"series_id":"92000000-0000-4000-8000-000000000001"}'::jsonb)
      ->>'can_save')::BOOLEAN IS FALSE,
  'Issued FINAL keeps workspace and new-Claim defaults closed');
RESET ROLE;
UPDATE public.progress_claims SET status='void'
WHERE id=(SELECT (dto->>'claim_id')::UUID FROM task6_final);
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT ok((public.get_progress_invoice_workspace('{"series_id":"92000000-0000-4000-8000-000000000001"}'::jsonb)
    #>> '{capabilities,can_create_claim}')::BOOLEAN IS FALSE
    AND (public.get_progress_claim_defaults('{"series_id":"92000000-0000-4000-8000-000000000001"}'::jsonb)
      ->>'can_save')::BOOLEAN IS FALSE,
  'Void FINAL permanently keeps workspace and new-Claim defaults closed');

RESET ROLE;
INSERT INTO public.progress_invoice_series(id,source_type,accepted_numbering_base,base_contract_ex_gst,recipient_name,recipient_address,site_name,site_address,default_description,created_by,updated_by)
VALUES('93000000-0000-4000-8000-000000000001','manual','ADJ-1',1000,'Builder','Billing','Adjusted Site','Site','Adjusted works',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
INSERT INTO public.progress_adjustments(series_id,type,status,effective_date,description,amount_ex_gst,display_order,created_by,updated_by)
VALUES('93000000-0000-4000-8000-000000000001','variation','approved','2026-07-20','Approved extra',100,1,'00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001'),
('93000000-0000-4000-8000-000000000001','credit','approved','2026-07-20','Approved credit',20,2,'00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001'),
('93000000-0000-4000-8000-000000000001','variation','draft','2026-07-20','Draft excluded',999,3,'00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
CREATE TEMP TABLE task6_defaults AS SELECT public.get_progress_claim_defaults('{"series_id":"93000000-0000-4000-8000-000000000001"}'::jsonb) AS dto;
SELECT is((SELECT dto->>'approved_variations_ex_gst' FROM task6_defaults),'100.00','defaults snapshot includes Approved Variations only');
SELECT is((SELECT dto->>'approved_credits_ex_gst' FROM task6_defaults),'20.00','defaults snapshot includes Approved Credits only');
SELECT is((SELECT jsonb_array_length(dto->'approved_adjustments') FROM task6_defaults),2,'defaults preserves complete Approved adjustment list');
SELECT is((SELECT dto->>'adjusted_contract_ex_gst' FROM task6_defaults),'1080.00','Draft adjustment is excluded from adjusted contract');
SELECT is((SELECT jsonb_array_length(dto->'previous_claims') FROM task6_defaults),0,'defaults predecessors come only from Current manifest');
SELECT is(((TIMESTAMPTZ '2026-07-19 14:01:00+00' AT TIME ZONE 'Australia/Sydney')::date)::text,'2026-07-20','Sydney date crosses the UTC boundary safely');
SELECT is((DATE '2028-02-29'+14)::text,'2028-03-14','literal leap-day payment terms add calendar days');
SELECT is((SELECT ((dto->>'due_date')::date-(dto->>'issue_date')::date)::int FROM task6_defaults),14,'default due date uses snapshotted payment terms');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','93000000-0000-4000-8000-000000000001','kind','progress','input_mode','current_claim_amount','authoritative_value','1.00',
  'issue_date','2026-07-21','due_date','2026-07-20','description','Invalid date','notes',null,'expected_series_version',1,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','93000000-0000-4000-8000-000000000010'))$sql$),
  '23514','due date before issue date is rejected');
SELECT is(has_table_privilege('authenticated','public.progress_claim_command_results','SELECT'),false,'authenticated cannot read private Claim command result snapshots');
SELECT is(has_table_privilege('service_role','public.progress_claim_command_results','SELECT'),false,'service role cannot read private Claim command result snapshots');
SELECT ok((SELECT bool_and(has_function_privilege('authenticated',signature,'EXECUTE')
    AND NOT has_function_privilege('anon',signature,'EXECUTE')
    AND NOT has_function_privilege('service_role',signature,'EXECUTE'))
  FROM unnest(ARRAY[
    'public.get_progress_claim_defaults(jsonb)','public.get_progress_claim_editor(jsonb)',
    'public.create_progress_claim_draft(jsonb)','public.save_progress_claim_draft(jsonb)'
  ]::TEXT[]) signature),
  'only authenticated receives the four public Claim RPC grants');
SELECT ok((SELECT bool_and(NOT has_function_privilege('anon',signature,'EXECUTE')
    AND NOT has_function_privilege('authenticated',signature,'EXECUTE')
    AND NOT has_function_privilege('service_role',signature,'EXECUTE'))
  FROM unnest(ARRAY[
    'public.progress_claim_money(numeric)','public.progress_claim_percentage(numeric)',
    'public.progress_claim_assert_text(text,integer,boolean)',
    'public.progress_claim_profile_ready(public.business_invoice_profiles)',
    'public.progress_claim_assert_current_set(public.progress_invoice_series,uuid,text)',
    'public.progress_claim_source_observation(public.progress_invoice_series)',
    'public.progress_claim_financial_snapshot(public.progress_invoice_series,text,text,text)',
    'public.progress_claim_defaults_snapshot(public.progress_invoice_series)',
    'public.progress_claim_editor_dto(uuid,uuid)'
  ]::TEXT[]) signature),
  'private Claim helpers are not executable by API roles');
SELECT is((SELECT count(*)::int FROM public.progress_invoice_events WHERE command_name IN ('create_progress_claim_draft','save_progress_claim_draft')
  AND (safe_field_changes ? 'recipient_name' OR safe_field_changes ? 'supplier_bank_account_number')),0,'Claim events exclude recipient and bank snapshots');
SELECT ok((SELECT (public.get_progress_invoice_workspace('{"series_id":"91000000-0000-4000-8000-000000000001"}'::jsonb)->'claims'->1->'current_revision'->>'state')='draft'),
  'workspace timeline exposes Draft Revision 1 without making it Current-manifest issued truth');
SELECT is(pg_temp.capture_sqlstate($sql$
  SELECT public.create_progress_claim_draft(jsonb_build_object(
    'series_id','91000000-0000-4000-8000-000000000001','kind','progress','input_mode','cumulative_percentage',
    'authoritative_value','90.000000','issue_date','2026-07-20','due_date','2026-08-03','description','Changed replay payload',
    'notes',null,'expected_series_version',1,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
    'correlation_key','91000000-0000-4000-8000-000000000010'))
$sql$),'P0001','create replay key rejects a changed fingerprint before stale-state handling');
SELECT ok((SELECT (response->>'conflict')::BOOLEAN
    AND response #>> '{current,claim_id}'=(SELECT dto->>'claim_id' FROM task6_p02)
  FROM (SELECT public.save_progress_claim_draft(jsonb_build_object(
    'claim_id',(SELECT dto->>'claim_id' FROM task6_p02),'expected_claim_version',999,'expected_series_version',999,
    'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'input_mode','current_claim_amount',
    'authoritative_value','100.00','issue_date','2026-07-22','due_date','2026-08-05','description','Second Draft','notes',null,
    'correlation_key','91000000-0000-4000-8000-000000000019')) AS response) stale),
  'stale Claim and Series versions return the strict current editor conflict DTO');
RESET ROLE;
UPDATE public.progress_invoice_revision_sets SET state='superseded',superseded_at=now()
WHERE series_id='84000000-0000-4000-8000-000000000001' AND state='current';
UPDATE public.progress_invoice_revision_sets SET state='current',superseded_at=NULL,published_at=COALESCE(published_at,now())
WHERE id='84000000-0000-4000-8000-000000000032';
UPDATE public.progress_invoice_series SET current_revision_set_id='84000000-0000-4000-8000-000000000032'
WHERE id='84000000-0000-4000-8000-000000000001';
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT ok((SELECT (response->>'conflict')::BOOLEAN
    AND response #>> '{current,expected_current_revision_set_id}'='84000000-0000-4000-8000-000000000032'
    AND response #>> '{current,expected_current_manifest_hash}'=repeat('e',64)
  FROM (SELECT public.create_progress_claim_draft(jsonb_build_object(
    'series_id','84000000-0000-4000-8000-000000000001','kind','progress','input_mode','current_claim_amount',
    'authoritative_value','1.00','issue_date','2026-07-20','due_date','2026-08-03','description','Stale manifest','notes',null,
    'expected_series_version',(SELECT version FROM public.progress_invoice_series WHERE id='84000000-0000-4000-8000-000000000001'),
    'expected_current_revision_set_id','84000000-0000-4000-8000-000000000033',
    'expected_current_manifest_hash',repeat('f',64),'correlation_key','91000000-0000-4000-8000-000000000020')) AS response) stale),
  'stale Current-set id and hash return the authoritative Current manifest identity');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','93000000-0000-4000-8000-000000000001','kind','progress','input_mode','current_claim_amount','authoritative_value','0.00',
  'issue_date','2026-07-21','due_date','2026-07-22','description','Zero','notes',null,'expected_series_version',1,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','93000000-0000-4000-8000-000000000021'))$sql$),
  '23514','zero-value Draft persistence is rejected');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','93000000-0000-4000-8000-000000000001','kind','progress','input_mode','current_claim_amount','authoritative_value','1188.01',
  'issue_date','2026-07-21','due_date','2026-07-22','description','Overclaim','notes',null,'expected_series_version',1,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','93000000-0000-4000-8000-000000000022'))$sql$),
  '23514','overclaim above the adjusted-contract residual is rejected');
RESET ROLE;
INSERT INTO public.progress_invoice_series(id,source_type,accepted_numbering_base,base_contract_ex_gst,recipient_name,recipient_address,site_name,site_address,default_description,created_by,updated_by)
VALUES('94000000-0000-4000-8000-000000000001','manual','FINAL-INVALID',1000,'Builder','Billing','Final Invalid Site','Site','Final works',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','94000000-0000-4000-8000-000000000001','kind','final','input_mode','current_claim_amount','authoritative_value','1099.99',
  'issue_date','2026-07-21','due_date','2026-07-22','description','Invalid final residual','notes',null,'expected_series_version',1,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','94000000-0000-4000-8000-000000000010'))$sql$),
  '23514','FINAL must consume the exact residual');
RESET ROLE;
INSERT INTO public.progress_payments(id,series_id,source,created_by,updated_by)
VALUES('93000000-0000-4000-8000-000000000030','93000000-0000-4000-8000-000000000001','manual',
  '00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
INSERT INTO public.progress_payment_revisions(id,payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,
  payment_method,reference,sync_state,status,created_by)
VALUES('93000000-0000-4000-8000-000000000031','93000000-0000-4000-8000-000000000030',1,'2026-07-20',999,999,
  'EFT','RECEIPT-ONLY','manual','active','00000000-0000-0000-0000-000000008001');
UPDATE public.progress_payments SET current_revision_id='93000000-0000-4000-8000-000000000031' WHERE id='93000000-0000-4000-8000-000000000030';
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is((public.get_progress_claim_defaults(
  '{"series_id":"93000000-0000-4000-8000-000000000001"}'::jsonb)->>'previous_claims_inc_gst'), '0.00',
  'actual receipts are excluded from Claim financial predecessors');
RESET ROLE;
UPDATE public.progress_invoice_series SET jobber_account_id='unsafe-account-id',jobber_invoice_id='unsafe-invoice-id'
WHERE id='85000000-0000-4000-8000-000000000009';
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT ok((SELECT dto->>'jobber_account_id'='unsafe-account-id' AND dto->>'jobber_invoice_id'='unsafe-invoice-id'
    AND dto->>'original_jobber_invoice_number'='2875' AND dto->>'observed_jobber_invoice_number'='2875'
  FROM (SELECT public.get_progress_claim_defaults('{"series_id":"85000000-0000-4000-8000-000000000009"}'::jsonb) AS dto) snapshot),
  'imported Series Claim defaults use only the stored Jobber snapshot evidence');
SELECT is((public.get_progress_claim_defaults('{"series_id":"84000000-0000-4000-8000-000000000001"}'::jsonb)
    #>> '{previous_claims,0,revision_id}'),
  '84000000-0000-4000-8000-000000000022',
  'Claim predecessors follow the Current manifest instead of a deliberately different Claim pointer');
SELECT is(public.get_progress_claim_editor('{"claim_id":"99000000-0000-4000-8000-000000000099"}'::jsonb),NULL::jsonb,
  'unknown Claim identity returns not found without leaking another Series');
SELECT ok(NOT has_table_privilege('authenticated','public.progress_claim_command_results','INSERT')
    AND NOT has_table_privilege('authenticated','public.progress_claim_command_results','UPDATE')
    AND NOT has_table_privilege('authenticated','public.progress_claim_command_results','DELETE')
    AND NOT has_table_privilege('service_role','public.progress_claim_command_results','INSERT'),
  'private replay snapshots block direct DML for authenticated and service roles');
RESET ROLE;
UPDATE public.business_invoice_profiles SET email='invalid-email';
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','93000000-0000-4000-8000-000000000001','kind','progress','input_mode','current_claim_amount','authoritative_value','1.00',
  'issue_date','2026-07-21','due_date','2026-07-22','description','Profile gate','notes',null,'expected_series_version',1,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','93000000-0000-4000-8000-000000000011'))$sql$),
  'P0001','direct Claim RPC rejects a legacy/corrupt profile that fails Task 3A readiness');
SELECT is((SELECT jsonb_build_object('supplier_email',response->>'supplier_email','supplier_profile_version',response->>'supplier_profile_version')
  FROM (SELECT public.save_progress_claim_draft(jsonb_build_object(
    'claim_id',(SELECT dto->>'claim_id' FROM task6_p02),'expected_claim_version',1,'expected_series_version',6,
    'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'input_mode','current_claim_amount',
    'authoritative_value','101.00','issue_date','2026-07-22','due_date','2026-08-05','description','Snapshot-only save','notes',null,
    'correlation_key','91000000-0000-4000-8000-000000000023')) AS response) saved),
  '{"supplier_email":"accounts@example.test","supplier_profile_version":"1"}'::jsonb,
  'Draft save succeeds after live profile corruption and preserves the immutable supplier snapshot');
SELECT is((public.get_progress_claim_editor(jsonb_build_object(
  'claim_id',(SELECT dto->>'claim_id' FROM task6_p02)))->>'supplier_email'), 'accounts@example.test',
  'an existing Draft remains readable from its immutable supplier snapshot after the live profile becomes invalid');

-- Task 6B: per-Claim FIFO collection table and Draft delete-as-Void.
RESET ROLE;
UPDATE public.business_invoice_profiles SET email='accounts@example.test';
SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000075',6,0,0);
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is((SELECT jsonb_build_object('collected',claim->>'collected_inc_gst','outstanding',claim->>'outstanding_inc_gst','date',claim->'collected_date')
  FROM jsonb_array_elements(public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::jsonb)->'claims') claim
  WHERE claim->>'id'='84000000-0000-4000-8000-000000000020'),
  '{"collected":"0.00","outstanding":"220.00","date":null}'::jsonb,'no receipt allocates zero to the Current Claim');
RESET ROLE; SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000076',7,100,100);
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is((SELECT (claim->>'collected_inc_gst')||'/'||(claim->>'outstanding_inc_gst')
  FROM jsonb_array_elements(public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::jsonb)->'claims') claim
  WHERE claim->>'id'='84000000-0000-4000-8000-000000000020'),'100.00/120.00','partial receipt allocates FIFO without changing Claim price');
RESET ROLE; SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000077',8,220,220);
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is((SELECT (claim->>'collected_inc_gst')||'/'||(claim->>'outstanding_inc_gst')
  FROM jsonb_array_elements(public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::jsonb)->'claims') claim
  WHERE claim->>'id'='84000000-0000-4000-8000-000000000020'),'220.00/0.00','full receipt closes the Current Claim');
RESET ROLE; SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000078',9,300,300);
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is((SELECT (claim->>'collected_inc_gst')||'/'||(claim->>'outstanding_inc_gst')
  FROM jsonb_array_elements(public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::jsonb)->'claims') claim
  WHERE claim->>'id'='84000000-0000-4000-8000-000000000020'),'220.00/0.00','overpayment is clamped to the Claim price');
RESET ROLE; SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000079',10,200,200);
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is((SELECT (claim->>'collected_inc_gst')||'/'||(claim->>'outstanding_inc_gst')
  FROM jsonb_array_elements(public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::jsonb)->'claims') claim
  WHERE claim->>'id'='84000000-0000-4000-8000-000000000020'),'200.00/20.00','matched Manual receipt is excluded once its Jobber payment is current');
RESET ROLE; SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000080',11,10,-10);
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is((SELECT jsonb_build_object('collected',claim->>'collected_inc_gst','outstanding',claim->>'outstanding_inc_gst','date',claim->'collected_date')
  FROM jsonb_array_elements(public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::jsonb)->'claims') claim
  WHERE claim->>'id'='84000000-0000-4000-8000-000000000020'),
  '{"collected":"0.00","outstanding":"220.00","date":null}'::jsonb,'a refund/reversal reopens a previously collected Claim');

RESET ROLE;
SELECT pg_temp.set_task2_receipt('84000000-0000-4000-8000-000000000081',12,0,0);
INSERT INTO public.progress_payments(id,series_id,source,jobber_payment_id,created_by,updated_by) VALUES
('84000000-0000-4000-8000-000000000082','84000000-0000-4000-8000-000000000001','jobber','RECROSS-1','00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001'),
('84000000-0000-4000-8000-000000000084','84000000-0000-4000-8000-000000000001','jobber','RECROSS-2','00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001'),
('84000000-0000-4000-8000-000000000086','84000000-0000-4000-8000-000000000001','jobber','RECROSS-3','00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
INSERT INTO public.progress_payment_revisions(id,payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,sync_state,status,created_by) VALUES
('84000000-0000-4000-8000-000000000083','84000000-0000-4000-8000-000000000082',1,'2026-07-01',250,250,'observed','active','00000000-0000-0000-0000-000000008001'),
('84000000-0000-4000-8000-000000000085','84000000-0000-4000-8000-000000000084',1,'2026-07-02',100,-100,'reversed','active','00000000-0000-0000-0000-000000008001'),
('84000000-0000-4000-8000-000000000087','84000000-0000-4000-8000-000000000086',1,'2026-07-03',70,70,'observed','active','00000000-0000-0000-0000-000000008001');
UPDATE public.progress_payments SET current_revision_id=CASE id
WHEN '84000000-0000-4000-8000-000000000082' THEN '84000000-0000-4000-8000-000000000083'::uuid
WHEN '84000000-0000-4000-8000-000000000084' THEN '84000000-0000-4000-8000-000000000085'::uuid
WHEN '84000000-0000-4000-8000-000000000086' THEN '84000000-0000-4000-8000-000000000087'::uuid END
WHERE id IN ('84000000-0000-4000-8000-000000000082','84000000-0000-4000-8000-000000000084','84000000-0000-4000-8000-000000000086');
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is((SELECT claim->>'collected_date' FROM jsonb_array_elements(public.get_progress_invoice_workspace('{"series_id":"84000000-0000-4000-8000-000000000001"}'::jsonb)->'claims') claim
  WHERE claim->>'id'='84000000-0000-4000-8000-000000000020'),'2026-07-03','collected date is the latest threshold re-crossing date');

CREATE TEMP TABLE task6b_void AS SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p02),
  'expected_series_version',7,'expected_claim_version',2,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason','Created in error','correlation_key','91000000-0000-4000-8000-000000000030')) AS dto;
SELECT is((SELECT dto FROM task6b_void),jsonb_build_object('series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p02),'series_version',8,'claim_version',3,'status','void'),
  'Draft Void increments Claim and Series versions and returns a strict response');
SELECT is((SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p02),
  'expected_series_version',7,'expected_claim_version',2,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason','Created in error','correlation_key','91000000-0000-4000-8000-000000000030'))),(SELECT dto FROM task6b_void),'exact Draft Void replay returns the original response');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p02),
  'expected_series_version',7,'expected_claim_version',2,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason','Different reason','correlation_key','91000000-0000-4000-8000-000000000030'))$sql$),'P0001','same Draft Void key with a different fingerprint is rejected');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p10),
  'expected_series_version',999,'expected_claim_version',1,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason','Stale Series','correlation_key','91000000-0000-4000-8000-000000000031'))$sql$),'P0001','stale Series version rejects Draft Void');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p10),
  'expected_series_version',8,'expected_claim_version',999,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason','Stale Claim','correlation_key','91000000-0000-4000-8000-000000000032'))$sql$),'P0001','stale Claim version rejects Draft Void');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p10),
  'expected_series_version',8,'expected_claim_version',1,'expected_current_revision_set_id','84000000-0000-4000-8000-000000000032','expected_current_manifest_hash',repeat('e',64),
  'reason','Stale set','correlation_key','91000000-0000-4000-8000-000000000033'))$sql$),'P0001','stale Current-set identity rejects Draft Void');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','84000000-0000-4000-8000-000000000001','claim_id','84000000-0000-4000-8000-000000000064',
  'expected_series_version',(SELECT version FROM public.progress_invoice_series WHERE id='84000000-0000-4000-8000-000000000001'),
  'expected_claim_version',1,'expected_current_revision_set_id','84000000-0000-4000-8000-000000000031','expected_current_manifest_hash',repeat('e',64),
  'reason','Independent stale set','correlation_key','84000000-0000-4000-8000-000000000090'))$sql$),'P0001','Current-set ID is checked independently from the manifest hash');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','84000000-0000-4000-8000-000000000001','claim_id','84000000-0000-4000-8000-000000000064',
  'expected_series_version',(SELECT version FROM public.progress_invoice_series WHERE id='84000000-0000-4000-8000-000000000001'),
  'expected_claim_version',1,'expected_current_revision_set_id','84000000-0000-4000-8000-000000000032','expected_current_manifest_hash',repeat('f',64),
  'reason','Independent stale hash','correlation_key','84000000-0000-4000-8000-000000000091'))$sql$),'P0001','Current manifest hash is checked independently from the Current-set ID');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p10),
  'expected_series_version',8,'expected_claim_version',1,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason',' ','correlation_key','91000000-0000-4000-8000-000000000034'))$sql$),'23514','Draft Void requires a bounded non-empty reason');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','93000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p100),
  'expected_series_version',8,'expected_claim_version',1,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason','Wrong Series','correlation_key','91000000-0000-4000-8000-000000000035'))$sql$),'P0001','cross-Series Draft Void is rejected');
SELECT ok((SELECT claim.status='void' AND claim.version=3 AND series.version=8 AND event.event_type='progress_claim_draft_voided'
  FROM public.progress_claims claim JOIN public.progress_invoice_series series ON series.id=claim.series_id
  JOIN public.progress_invoice_events event ON event.claim_id=claim.id AND event.command_name='void_progress_claim_draft'
  WHERE claim.id=(SELECT (dto->>'claim_id')::uuid FROM task6_p02)),'Draft Void retains an auditable actor-stamped Claim and Series mutation');
SELECT ok((SELECT count(*)=1 FROM public.progress_claims WHERE id=(SELECT (dto->>'claim_id')::uuid FROM task6_p02))
  AND (SELECT count(*)=1 FROM public.progress_claim_revisions WHERE claim_id=(SELECT (dto->>'claim_id')::uuid FROM task6_p02))
  AND (SELECT state='permanent' FROM public.progress_invoice_numbering_base_reservations WHERE series_id='91000000-0000-4000-8000-000000000001'),
  'Draft Void retains Claim, Revision 1, Tax Invoice number, and permanent numbering-base reservation');
SELECT is(pg_temp.capture_sqlstate($sql$DELETE FROM public.progress_claims WHERE id=(SELECT (dto->>'claim_id')::uuid FROM task6_p02)$sql$),'42501','Claim direct delete remains blocked by the ACL and trigger invariant');

RESET ROLE;
UPDATE public.progress_claims SET status='issued',original_issued_at=now() WHERE id=(SELECT (dto->>'claim_id')::uuid FROM task6_p10);
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p10),
  'expected_series_version',8,'expected_claim_version',1,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason','Issued forbidden','correlation_key','91000000-0000-4000-8000-000000000036'))$sql$),'P0001','Issued Claim rejects Draft-only Void');
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p02),
  'expected_series_version',8,'expected_claim_version',3,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason','Void forbidden','correlation_key','91000000-0000-4000-8000-000000000037'))$sql$),'P0001','already Void Claim rejects Draft-only Void');

RESET ROLE;
INSERT INTO public.progress_invoice_series(id,source_type,accepted_numbering_base,base_contract_ex_gst,recipient_name,recipient_address,site_name,site_address,default_description,created_by,updated_by)
VALUES('95000000-0000-4000-8000-000000000001','manual','FINAL-VOID',100,'Builder','Billing','Final Void','Site','Final works','00000000-0000-0000-0000-000000008001','00000000-0000-0000-0000-000000008001');
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
CREATE TEMP TABLE task6b_final AS SELECT public.create_progress_claim_draft(jsonb_build_object(
  'series_id','95000000-0000-4000-8000-000000000001','kind','final','input_mode','current_claim_amount','authoritative_value','110.00',
  'issue_date','2026-07-20','due_date','2026-08-03','description','Final','notes',null,'expected_series_version',1,
  'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,'correlation_key','95000000-0000-4000-8000-000000000010')) dto;
SELECT public.void_progress_claim_draft(jsonb_build_object('series_id','95000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6b_final),
  'expected_series_version',2,'expected_claim_version',1,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason','Final created in error','correlation_key','95000000-0000-4000-8000-000000000011'));
SELECT ok((public.get_progress_invoice_workspace('{"series_id":"95000000-0000-4000-8000-000000000001"}'::jsonb)#>>'{capabilities,can_create_claim}')::boolean IS FALSE
  AND (public.get_progress_claim_defaults('{"series_id":"95000000-0000-4000-8000-000000000001"}'::jsonb)->>'can_save')::boolean IS FALSE,
  'voided Draft FINAL permanently prevents another Claim');

RESET ROLE;
UPDATE public.progress_invoice_series SET status='void' WHERE id='91000000-0000-4000-8000-000000000001';
SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-0000-0000-000000008001';
SELECT is(pg_temp.capture_sqlstate($sql$SELECT public.void_progress_claim_draft(jsonb_build_object(
  'series_id','91000000-0000-4000-8000-000000000001','claim_id',(SELECT dto->>'claim_id' FROM task6_p100),
  'expected_series_version',8,'expected_claim_version',1,'expected_current_revision_set_id',null,'expected_current_manifest_hash',null,
  'reason','Series Void','correlation_key','91000000-0000-4000-8000-000000000038'))$sql$),'P0001','Void Series rejects Draft Void');
SELECT ok((SELECT claim->>'created_at' IS NOT NULL AND claim->'current_revision' <> 'null'::jsonb
    AND claim->'collected_inc_gst'='null'::jsonb AND claim->'outstanding_inc_gst'='null'::jsonb
  FROM jsonb_array_elements(public.get_progress_invoice_workspace('{"series_id":"91000000-0000-4000-8000-000000000001"}'::jsonb)->'claims') claim
  WHERE claim->>'id'=(SELECT dto->>'claim_id' FROM task6_p02)),'workspace retains safe selected Revision and created timestamp for historical Void');
SELECT ok((SELECT bool_and(proconfig @> ARRAY['search_path=""']) FROM pg_proc WHERE oid IN (
  'public.get_progress_invoice_workspace(jsonb)'::regprocedure,'public.void_progress_claim_draft(jsonb)'::regprocedure)),
  'workspace and Draft Void public functions pin an empty search_path');
SELECT ok(NOT has_function_privilege('authenticated','public.progress_claim_table_dtos(uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.progress_claim_table_dtos(uuid)','EXECUTE'),
  'Claim table allocation helper is private from API roles');

SELECT has_function(
  'public',
  'void_progress_claim_draft',
  ARRAY['jsonb'],
  'Draft Void command exists'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.void_progress_claim_draft(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.void_progress_claim_draft(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('service_role', 'public.void_progress_claim_draft(jsonb)', 'EXECUTE'),
  'Draft Void command is authenticated-only'
);

SELECT * FROM finish();
