CREATE FUNCTION public.progress_canonicalize_supplier_abn(candidate TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  canonical TEXT;
  checksum INT := 0;
  digit_value INT;
  digit_index INT;
  weights CONSTANT INT[] := ARRAY[10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
BEGIN
  canonical := pg_catalog.regexp_replace(pg_catalog.btrim(candidate), '\s', '', 'g');
  IF canonical !~ '^[0-9]{11}$' THEN
    RETURN NULL;
  END IF;

  FOR digit_index IN 1..11 LOOP
    digit_value := pg_catalog.ascii(pg_catalog.substr(canonical, digit_index, 1))
      - pg_catalog.ascii('0');
    IF digit_index = 1 THEN
      digit_value := digit_value - 1;
    END IF;
    checksum := checksum + digit_value * weights[digit_index];
  END LOOP;

  IF checksum % 89 <> 0 THEN
    RETURN NULL;
  END IF;
  RETURN canonical;
END;
$$;

REVOKE ALL ON FUNCTION public.progress_canonicalize_supplier_abn(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_business_invoice_profile(payload JSONB)
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
  canonical_abn TEXT;
  payment_term_days_numeric NUMERIC;
  payment_term_days INT;
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

  IF jsonb_typeof(payload -> 'legal_name') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'abn') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'business_address') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'phone') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'email') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'bank_name') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'bsb') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'bank_account_name') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'bank_account_number') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'gst_rate') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'business_timezone') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'default_payment_term_days') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF payload ? 'trading_name'
    AND NOT (
      payload -> 'trading_name' = 'null'::JSONB
      OR jsonb_typeof(payload -> 'trading_name') = 'string'
    ) THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF payload ? 'contractor_licence'
    AND NOT (
      payload -> 'contractor_licence' = 'null'::JSONB
      OR jsonb_typeof(payload -> 'contractor_licence') = 'string'
    ) THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(btrim(payload ->> 'legal_name'), '') IS NULL
    OR length(btrim(payload ->> 'legal_name')) > 160
    OR length(btrim(COALESCE(payload ->> 'trading_name', ''))) > 160
    OR NULLIF(btrim(payload ->> 'abn'), '') IS NULL
    OR length(btrim(payload ->> 'abn')) > 14
    OR NULLIF(btrim(payload ->> 'business_address'), '') IS NULL
    OR length(btrim(payload ->> 'business_address')) > 300
    OR NULLIF(btrim(payload ->> 'phone'), '') IS NULL
    OR length(btrim(payload ->> 'phone')) > 40
    OR NULLIF(btrim(payload ->> 'email'), '') IS NULL
    OR length(btrim(payload ->> 'email')) > 254
    OR NULLIF(btrim(payload ->> 'bank_name'), '') IS NULL
    OR length(btrim(payload ->> 'bank_name')) > 120
    OR NULLIF(btrim(payload ->> 'bsb'), '') IS NULL
    OR length(btrim(payload ->> 'bsb')) > 16
    OR NULLIF(btrim(payload ->> 'bank_account_name'), '') IS NULL
    OR length(btrim(payload ->> 'bank_account_name')) > 120
    OR NULLIF(btrim(payload ->> 'bank_account_number'), '') IS NULL
    OR length(btrim(payload ->> 'bank_account_number')) > 32
    OR length(btrim(COALESCE(payload ->> 'contractor_licence', ''))) > 64 THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;

  canonical_abn := public.progress_canonicalize_supplier_abn(payload ->> 'abn');
  IF canonical_abn IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_ABN_INVALID' USING ERRCODE = '23514';
  END IF;

  IF btrim(payload ->> 'email') !~ $zod_email$^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}\Z$zod_email$ THEN
    RAISE EXCEPTION 'PROGRESS_EMAIL_INVALID' USING ERRCODE = '23514';
  END IF;

  IF payload ->> 'gst_rate' IS DISTINCT FROM '0.10' THEN
    RAISE EXCEPTION 'PROGRESS_GST_RATE_INVALID' USING ERRCODE = '23514';
  END IF;

  IF payload ->> 'business_timezone' IS DISTINCT FROM 'Australia/Sydney' THEN
    RAISE EXCEPTION 'PROGRESS_BUSINESS_TIMEZONE_INVALID' USING ERRCODE = '23514';
  END IF;

  payment_term_days_numeric := (payload ->> 'default_payment_term_days')::NUMERIC;
  IF payment_term_days_numeric <> trunc(payment_term_days_numeric) THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF payment_term_days_numeric < 0 OR payment_term_days_numeric > 365 THEN
    RAISE EXCEPTION 'PROGRESS_PAYMENT_TERM_DAYS_INVALID' USING ERRCODE = '23514';
  END IF;
  payment_term_days := payment_term_days_numeric::INT;

  LOCK TABLE public.business_invoice_profiles IN SHARE ROW EXCLUSIVE MODE;

  SELECT profile.*
  INTO current_profile
  FROM public.business_invoice_profiles AS profile
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    IF payload ? 'expected_version' THEN
      RAISE EXCEPTION 'PROGRESS_EXPECTED_VERSION_NOT_ALLOWED' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.business_invoice_profiles (
      legal_name, trading_name, abn, contractor_licence, business_address,
      phone, email, bank_name, bsb, bank_account_name, bank_account_number,
      gst_rate, business_timezone, default_payment_term_days, version,
      created_by, updated_by
    ) VALUES (
      btrim(payload ->> 'legal_name'),
      btrim(COALESCE(payload ->> 'trading_name', '')),
      canonical_abn,
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
      payment_term_days,
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
        abn = canonical_abn,
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
        default_payment_term_days = payment_term_days,
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
         pg_catalog.to_char(saved_profile.gst_rate, 'FM0.00'),
         saved_profile.business_timezone,
         saved_profile.default_payment_term_days,
         saved_profile.version,
         saved_profile.created_by,
         saved_profile.updated_by,
         saved_profile.created_at,
         saved_profile.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.save_business_invoice_profile(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_business_invoice_profile(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
