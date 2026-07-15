CREATE FUNCTION public.progress_require_actor()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  actor UUID := auth.uid();
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  RETURN actor;
END;
$$;

CREATE FUNCTION public.progress_require_expected_version(
  payload JSONB,
  current_version INT
)
RETURNS INT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  expected_version INT;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR NOT (payload ? 'expected_version')
    OR payload -> 'expected_version' = 'null'::JSONB THEN
    RAISE EXCEPTION 'PROGRESS_EXPECTED_VERSION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  expected_version := (payload ->> 'expected_version')::INT;

  IF expected_version <= 0 THEN
    RAISE EXCEPTION 'PROGRESS_EXPECTED_VERSION_INVALID' USING ERRCODE = '22023';
  END IF;

  IF expected_version <> current_version THEN
    RAISE EXCEPTION 'PROGRESS_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  RETURN expected_version;
END;
$$;

CREATE FUNCTION public.progress_lock_idempotency(
  owning_series_id UUID,
  requested_command_name TEXT,
  requested_correlation_key UUID,
  requested_fingerprint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  existing_fingerprint TEXT;
  existing_result_refs JSONB;
BEGIN
  IF owning_series_id IS NULL
    OR NULLIF(btrim(requested_command_name), '') IS NULL
    OR requested_correlation_key IS NULL
    OR requested_fingerprint !~ '^[0-9A-Fa-f]{64}$' THEN
    RAISE EXCEPTION 'PROGRESS_IDEMPOTENCY_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      owning_series_id::TEXT
        || chr(31)
        || requested_command_name
        || chr(31)
        || requested_correlation_key::TEXT,
      0
    )
  );

  SELECT event.request_fingerprint, event.result_refs
  INTO existing_fingerprint, existing_result_refs
  FROM public.progress_invoice_events AS event
  WHERE event.series_id = owning_series_id
    AND event.command_name = requested_command_name
    AND event.correlation_key = requested_correlation_key;

  IF FOUND AND existing_fingerprint <> requested_fingerprint THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
  END IF;

  RETURN CASE WHEN FOUND THEN existing_result_refs ELSE NULL END;
END;
$$;

CREATE FUNCTION public.progress_append_event(
  owning_series_id UUID,
  owning_claim_id UUID,
  requested_event_type TEXT,
  requested_source TEXT,
  requested_prior_revision_id UUID,
  requested_next_revision_id UUID,
  requested_safe_field_changes JSONB,
  requested_command_name TEXT,
  requested_correlation_key UUID,
  requested_fingerprint TEXT,
  requested_result_refs JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  event_id UUID;
BEGIN
  IF owning_series_id IS NULL OR NULLIF(btrim(requested_event_type), '') IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_EVENT_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.progress_invoice_events (
    series_id,
    claim_id,
    actor_id,
    event_type,
    source,
    prior_revision_id,
    next_revision_id,
    safe_field_changes,
    command_name,
    correlation_key,
    request_fingerprint,
    result_refs
  ) VALUES (
    owning_series_id,
    owning_claim_id,
    actor,
    requested_event_type,
    requested_source,
    requested_prior_revision_id,
    requested_next_revision_id,
    COALESCE(requested_safe_field_changes, '{}'::JSONB),
    requested_command_name,
    requested_correlation_key,
    requested_fingerprint,
    COALESCE(requested_result_refs, '{}'::JSONB)
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

CREATE FUNCTION public.progress_assert_current_pointer(
  pointer_id UUID,
  expected_parent_id UUID,
  actual_parent_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF pointer_id IS NOT NULL
    AND (
      expected_parent_id IS NULL
      OR actual_parent_id IS NULL
      OR actual_parent_id IS DISTINCT FROM expected_parent_id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_CURRENT_POINTER_PARENT_MISMATCH' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION public.save_business_invoice_profile(payload JSONB)
RETURNS TABLE (
  id UUID,
  legal_name TEXT,
  trading_name TEXT,
  abn TEXT,
  contractor_licence TEXT,
  business_address TEXT,
  phone TEXT,
  email TEXT,
  bank_name TEXT,
  bsb TEXT,
  bank_account_name TEXT,
  bank_account_number TEXT,
  gst_rate TEXT,
  business_timezone TEXT,
  default_payment_term_days INT,
  version INT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  current_profile public.business_invoice_profiles%ROWTYPE;
  saved_profile public.business_invoice_profiles%ROWTYPE;
  unknown_keys TEXT[];
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key)
  INTO unknown_keys
  FROM jsonb_object_keys(payload) AS keys(key)
  WHERE keys.key <> ALL (ARRAY[
    'legal_name',
    'trading_name',
    'abn',
    'contractor_licence',
    'business_address',
    'phone',
    'email',
    'bank_name',
    'bsb',
    'bank_account_name',
    'bank_account_number',
    'gst_rate',
    'business_timezone',
    'default_payment_term_days',
    'expected_version'
  ]::TEXT[]);

  IF unknown_keys IS NOT NULL THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(payload ->> 'legal_name'), '') IS NULL
    OR NULLIF(btrim(payload ->> 'abn'), '') IS NULL
    OR NULLIF(btrim(payload ->> 'business_address'), '') IS NULL
    OR NULLIF(btrim(payload ->> 'phone'), '') IS NULL
    OR NULLIF(btrim(payload ->> 'email'), '') IS NULL
    OR NULLIF(btrim(payload ->> 'bank_name'), '') IS NULL
    OR NULLIF(btrim(payload ->> 'bsb'), '') IS NULL
    OR NULLIF(btrim(payload ->> 'bank_account_name'), '') IS NULL
    OR NULLIF(btrim(payload ->> 'bank_account_number'), '') IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  IF payload ->> 'gst_rate' IS DISTINCT FROM '0.10' THEN
    RAISE EXCEPTION 'PROGRESS_GST_RATE_INVALID' USING ERRCODE = '23514';
  END IF;

  LOCK TABLE public.business_invoice_profiles IN SHARE ROW EXCLUSIVE MODE;

  SELECT profile.*
  INTO current_profile
  FROM public.business_invoice_profiles AS profile
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    IF payload ? 'expected_version'
      AND payload -> 'expected_version' <> 'null'::JSONB THEN
      RAISE EXCEPTION 'PROGRESS_EXPECTED_VERSION_NOT_ALLOWED' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.business_invoice_profiles (
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
      gst_rate,
      business_timezone,
      default_payment_term_days,
      version,
      created_by,
      updated_by
    ) VALUES (
      btrim(payload ->> 'legal_name'),
      btrim(COALESCE(payload ->> 'trading_name', '')),
      btrim(payload ->> 'abn'),
      btrim(COALESCE(payload ->> 'contractor_licence', '')),
      btrim(payload ->> 'business_address'),
      btrim(payload ->> 'phone'),
      btrim(payload ->> 'email'),
      btrim(payload ->> 'bank_name'),
      btrim(payload ->> 'bsb'),
      btrim(payload ->> 'bank_account_name'),
      btrim(payload ->> 'bank_account_number'),
      (payload ->> 'gst_rate')::NUMERIC,
      payload ->> 'business_timezone',
      (payload ->> 'default_payment_term_days')::INT,
      1,
      actor,
      actor
    )
    RETURNING * INTO saved_profile;
  ELSE
    PERFORM public.progress_require_expected_version(payload, current_profile.version);

    UPDATE public.business_invoice_profiles AS profile
    SET legal_name = btrim(payload ->> 'legal_name'),
        trading_name = btrim(COALESCE(payload ->> 'trading_name', '')),
        abn = btrim(payload ->> 'abn'),
        contractor_licence = btrim(COALESCE(payload ->> 'contractor_licence', '')),
        business_address = btrim(payload ->> 'business_address'),
        phone = btrim(payload ->> 'phone'),
        email = btrim(payload ->> 'email'),
        bank_name = btrim(payload ->> 'bank_name'),
        bsb = btrim(payload ->> 'bsb'),
        bank_account_name = btrim(payload ->> 'bank_account_name'),
        bank_account_number = btrim(payload ->> 'bank_account_number'),
        gst_rate = (payload ->> 'gst_rate')::NUMERIC,
        business_timezone = payload ->> 'business_timezone',
        default_payment_term_days = (payload ->> 'default_payment_term_days')::INT,
        version = profile.version + 1,
        updated_by = actor
    WHERE profile.id = current_profile.id
    RETURNING profile.* INTO saved_profile;
  END IF;

  RETURN QUERY
  SELECT saved_profile.id,
         saved_profile.legal_name,
         saved_profile.trading_name,
         saved_profile.abn,
         saved_profile.contractor_licence,
         saved_profile.business_address,
         saved_profile.phone,
         saved_profile.email,
         saved_profile.bank_name,
         saved_profile.bsb,
         saved_profile.bank_account_name,
         saved_profile.bank_account_number,
         saved_profile.gst_rate::TEXT,
         saved_profile.business_timezone,
         saved_profile.default_payment_term_days,
         saved_profile.version,
         saved_profile.created_by,
         saved_profile.updated_by,
         saved_profile.created_at,
         saved_profile.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.progress_require_actor() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_require_expected_version(JSONB, INT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_lock_idempotency(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_append_event(UUID, UUID, TEXT, TEXT, UUID, UUID, JSONB, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_assert_current_pointer(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_business_invoice_profile(JSONB) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.save_business_invoice_profile(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
