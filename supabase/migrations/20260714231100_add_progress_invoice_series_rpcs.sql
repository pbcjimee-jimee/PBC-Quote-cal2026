CREATE UNIQUE INDEX uq_progress_invoice_events_create_owner_correlation
  ON public.progress_invoice_events (actor_id, command_name, correlation_key)
  WHERE command_name = 'create_progress_invoice_series';

CREATE FUNCTION public.progress_request_fingerprint(payload JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to((payload - 'correlation_key')::TEXT, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

CREATE FUNCTION public.progress_series_safe_dto(series public.progress_invoice_series)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', series.id,
    'quote_id', series.quote_id,
    'source_type', series.source_type,
    'version', series.version,
    'base_contract_ex_gst', pg_catalog.to_char(series.base_contract_ex_gst, 'FM999999999999990.00'),
    'gst_rate', pg_catalog.to_char(series.gst_rate, 'FM0.00'),
    'recipient_name', series.recipient_name,
    'recipient_company', COALESCE(series.recipient_company, ''),
    'recipient_address', series.recipient_address,
    'recipient_email', COALESCE(series.recipient_email, ''),
    'recipient_phone', COALESCE(series.recipient_phone, ''),
    'recipient_abn', COALESCE(series.recipient_abn, ''),
    'site_name', series.site_name,
    'site_address', series.site_address,
    'default_description', series.default_description,
    'reference', COALESCE(series.reference, ''),
    'status', series.status,
    'accepted_numbering_base', series.accepted_numbering_base,
    'jobber_link_locked_at', series.jobber_link_locked_at,
    'current_adjusted_contract_ex_gst', pg_catalog.to_char(series.current_adjusted_contract_ex_gst, 'FM999999999999990.00'),
    'current_adjusted_contract_gst', pg_catalog.to_char(series.current_adjusted_contract_gst, 'FM999999999999990.00'),
    'current_adjusted_contract_inc_gst', pg_catalog.to_char(series.current_adjusted_contract_inc_gst, 'FM999999999999990.00'),
    'current_claimed_ex_gst', pg_catalog.to_char(series.current_claimed_ex_gst, 'FM999999999999990.00'),
    'current_claimed_gst', pg_catalog.to_char(series.current_claimed_gst, 'FM999999999999990.00'),
    'current_claimed_inc_gst', pg_catalog.to_char(series.current_claimed_inc_gst, 'FM999999999999990.00'),
    'current_unclaimed_ex_gst', pg_catalog.to_char(series.current_unclaimed_ex_gst, 'FM999999999999990.00'),
    'current_unclaimed_gst', pg_catalog.to_char(series.current_unclaimed_gst, 'FM999999999999990.00'),
    'current_unclaimed_inc_gst', pg_catalog.to_char(series.current_unclaimed_inc_gst, 'FM999999999999990.00'),
    'current_cumulative_percentage', pg_catalog.to_char(series.current_cumulative_percentage, 'FM999999990.000000')
  );
$$;

CREATE FUNCTION public.progress_adjustment_safe_dto(adjustment public.progress_adjustments)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', adjustment.id,
    'series_id', adjustment.series_id,
    'type', adjustment.type,
    'status', adjustment.status,
    'effective_date', adjustment.effective_date,
    'display_order', adjustment.display_order,
    'description', adjustment.description,
    'amount_ex_gst', pg_catalog.to_char(adjustment.amount_ex_gst, 'FM999999999999990.00'),
    'gst_rate', pg_catalog.to_char(adjustment.gst_rate, 'FM0.00'),
    'superseded_adjustment_id', adjustment.superseded_adjustment_id,
    'reason', adjustment.reason,
    'quote_item_id', adjustment.quote_item_id,
    'version', adjustment.version
  );
$$;

CREATE FUNCTION public.progress_validate_series_create_payload(payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  unknown_keys TEXT[];
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key)
  INTO unknown_keys
  FROM jsonb_object_keys(payload) AS keys(key)
  WHERE keys.key <> ALL (ARRAY[
    'source_type', 'quote_id', 'base_contract_ex_gst', 'gst_rate',
    'recipient_name', 'recipient_company', 'recipient_address', 'recipient_email',
    'recipient_phone', 'recipient_abn', 'site_name', 'site_address',
    'default_description', 'reference', 'correlation_key'
  ]::TEXT[]);

  IF unknown_keys IS NOT NULL THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(payload -> 'source_type') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'base_contract_ex_gst') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'gst_rate') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'recipient_name') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'recipient_address') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'site_name') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'site_address') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'default_description') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'correlation_key') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY['quote_id', 'recipient_company', 'recipient_email', 'recipient_phone', 'recipient_abn', 'reference']) AS optional_key(key)
    WHERE payload ? optional_key.key
      AND payload -> optional_key.key <> 'null'::JSONB
      AND jsonb_typeof(payload -> optional_key.key) IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF payload ->> 'source_type' NOT IN ('pbc_quote', 'jobber_job', 'jobber_invoice')
    OR payload ->> 'base_contract_ex_gst' !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$'
    OR (payload ->> 'base_contract_ex_gst')::NUMERIC <= 0
    OR payload ->> 'gst_rate' IS DISTINCT FROM '0.10'
    OR NULLIF(btrim(payload ->> 'recipient_name'), '') IS NULL
    OR length(btrim(payload ->> 'recipient_name')) > 160
    OR length(btrim(COALESCE(payload ->> 'recipient_company', ''))) > 160
    OR NULLIF(btrim(payload ->> 'recipient_address'), '') IS NULL
    OR length(btrim(payload ->> 'recipient_address')) > 300
    OR length(btrim(COALESCE(payload ->> 'recipient_email', ''))) > 254
    OR length(btrim(COALESCE(payload ->> 'recipient_phone', ''))) > 40
    OR length(btrim(COALESCE(payload ->> 'recipient_abn', ''))) > 14
    OR NULLIF(btrim(payload ->> 'site_name'), '') IS NULL
    OR length(btrim(payload ->> 'site_name')) > 160
    OR NULLIF(btrim(payload ->> 'site_address'), '') IS NULL
    OR length(btrim(payload ->> 'site_address')) > 300
    OR NULLIF(btrim(payload ->> 'default_description'), '') IS NULL
    OR length(btrim(payload ->> 'default_description')) > 1200
    OR length(btrim(COALESCE(payload ->> 'reference', ''))) > 120 THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(COALESCE(payload ->> 'recipient_email', '')), '') IS NOT NULL
    AND btrim(payload ->> 'recipient_email') !~ $zod_email$^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}\Z$zod_email$ THEN
    RAISE EXCEPTION 'PROGRESS_EMAIL_INVALID' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(COALESCE(payload ->> 'recipient_abn', '')), '') IS NOT NULL
    AND pg_catalog.regexp_replace(btrim(payload ->> 'recipient_abn'), '\s', '', 'g') !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'PROGRESS_ABN_INVALID' USING ERRCODE = '23514';
  END IF;

  IF payload ->> 'source_type' = 'pbc_quote'
    AND (NOT (payload ? 'quote_id') OR payload -> 'quote_id' = 'null'::JSONB) THEN
    RAISE EXCEPTION 'PROGRESS_QUOTE_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF payload ->> 'source_type' <> 'pbc_quote'
    AND payload ? 'quote_id' AND payload -> 'quote_id' <> 'null'::JSONB THEN
    RAISE EXCEPTION 'PROGRESS_QUOTE_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION public.progress_recalculate_series_read_model(owning_series_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  series_row public.progress_invoice_series%ROWTYPE;
  approved_variations NUMERIC(14,2);
  approved_credits NUMERIC(14,2);
  claimed_ex NUMERIC(14,2);
  claimed_gst NUMERIC(14,2);
  claimed_inc NUMERIC(14,2);
  adjusted_ex NUMERIC(14,2);
  adjusted_gst NUMERIC(14,2);
  adjusted_inc NUMERIC(14,2);
BEGIN
  SELECT series.* INTO STRICT series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = owning_series_id
  FOR UPDATE;

  SELECT
    COALESCE(sum(adjustment.amount_ex_gst) FILTER (
      WHERE adjustment.status = 'approved' AND adjustment.type = 'variation'
    ), 0),
    COALESCE(sum(adjustment.amount_ex_gst) FILTER (
      WHERE adjustment.status = 'approved' AND adjustment.type = 'credit'
    ), 0)
  INTO approved_variations, approved_credits
  FROM public.progress_adjustments AS adjustment
  WHERE adjustment.series_id = owning_series_id;

  SELECT
    COALESCE(sum(revision.current_claim_ex_gst), 0),
    COALESCE(sum(revision.current_claim_gst), 0),
    COALESCE(sum(revision.current_claim_inc_gst), 0)
  INTO claimed_ex, claimed_gst, claimed_inc
  FROM public.progress_claims AS claim
  JOIN public.progress_claim_revisions AS revision
    ON revision.id = claim.current_revision_id
   AND revision.claim_id = claim.id
  WHERE claim.series_id = owning_series_id
    AND claim.status = 'issued';

  adjusted_ex := series_row.base_contract_ex_gst + approved_variations - approved_credits;
  adjusted_gst := round(adjusted_ex * series_row.gst_rate, 2);
  adjusted_inc := adjusted_ex + adjusted_gst;

  IF adjusted_ex < claimed_ex OR adjusted_gst < claimed_gst OR adjusted_inc < claimed_inc THEN
    RAISE EXCEPTION 'PROGRESS_RECONCILIATION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.progress_invoice_series AS series
  SET current_adjusted_contract_ex_gst = adjusted_ex,
      current_adjusted_contract_gst = adjusted_gst,
      current_adjusted_contract_inc_gst = adjusted_inc,
      current_claimed_ex_gst = claimed_ex,
      current_claimed_gst = claimed_gst,
      current_claimed_inc_gst = claimed_inc,
      current_unclaimed_ex_gst = adjusted_ex - claimed_ex,
      current_unclaimed_gst = adjusted_gst - claimed_gst,
      current_unclaimed_inc_gst = adjusted_inc - claimed_inc,
      current_cumulative_percentage = CASE
        WHEN adjusted_inc = 0 THEN 0
        ELSE round((claimed_inc / adjusted_inc) * 100, 6)
      END,
      updated_by = public.progress_require_actor()
  WHERE series.id = owning_series_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_progress_series_locked_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.source_type IS DISTINCT FROM OLD.source_type THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_PROVENANCE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
    IF NOT (
      OLD.source_type = 'pbc_quote'
      AND OLD.quote_id IS NOT NULL
      AND NEW.quote_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.quotes AS quote WHERE quote.id = OLD.quote_id
      )
    ) THEN
      RAISE EXCEPTION 'PROGRESS_SERIES_PROVENANCE_IMMUTABLE' USING ERRCODE = '55000';
    END IF;
  END IF;

  IF OLD.jobber_link_locked_at IS NOT NULL
    AND ROW(NEW.jobber_account_id, NEW.jobber_invoice_id, NEW.accepted_numbering_base, NEW.jobber_link_locked_at)
      IS DISTINCT FROM ROW(OLD.jobber_account_id, OLD.jobber_invoice_id, OLD.accepted_numbering_base, OLD.jobber_link_locked_at) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_LINK_LOCKED' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION public.create_progress_invoice_series(payload JSONB)
RETURNS TABLE (id UUID, version INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  requested_correlation_key UUID;
  fingerprint TEXT;
  prior_fingerprint TEXT;
  prior_result JSONB;
  requested_quote_id UUID;
  created_series public.progress_invoice_series%ROWTYPE;
BEGIN
  PERFORM public.progress_validate_series_create_payload(payload);
  requested_correlation_key := (payload ->> 'correlation_key')::UUID;
  fingerprint := public.progress_request_fingerprint(payload);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor::TEXT || chr(31) || 'create_progress_invoice_series' || chr(31) || requested_correlation_key::TEXT, 0)
  );

  SELECT event.request_fingerprint, event.result_refs
  INTO prior_fingerprint, prior_result
  FROM public.progress_invoice_events AS event
  WHERE event.actor_id = actor
    AND event.command_name = 'create_progress_invoice_series'
    AND event.correlation_key = requested_correlation_key;

  IF FOUND THEN
    IF prior_fingerprint <> fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY SELECT (prior_result ->> 'id')::UUID, (prior_result ->> 'version')::INT;
    RETURN;
  END IF;

  IF payload ->> 'source_type' = 'pbc_quote' THEN
    requested_quote_id := (payload ->> 'quote_id')::UUID;
    PERFORM quote.id
    FROM public.quotes AS quote
    WHERE quote.id = requested_quote_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.progress_invoice_series (
    quote_id, source_type, base_contract_ex_gst, gst_rate,
    recipient_name, recipient_company, recipient_address, recipient_email,
    recipient_phone, recipient_abn, site_name, site_address,
    default_description, reference, created_by, updated_by
  ) VALUES (
    requested_quote_id,
    payload ->> 'source_type',
    (payload ->> 'base_contract_ex_gst')::NUMERIC,
    (payload ->> 'gst_rate')::NUMERIC,
    btrim(payload ->> 'recipient_name'),
    NULLIF(btrim(COALESCE(payload ->> 'recipient_company', '')), ''),
    btrim(payload ->> 'recipient_address'),
    NULLIF(btrim(COALESCE(payload ->> 'recipient_email', '')), ''),
    NULLIF(btrim(COALESCE(payload ->> 'recipient_phone', '')), ''),
    NULLIF(pg_catalog.regexp_replace(btrim(COALESCE(payload ->> 'recipient_abn', '')), '\s', '', 'g'), ''),
    btrim(payload ->> 'site_name'),
    btrim(payload ->> 'site_address'),
    btrim(payload ->> 'default_description'),
    NULLIF(btrim(COALESCE(payload ->> 'reference', '')), ''),
    actor,
    actor
  ) RETURNING * INTO created_series;

  PERFORM public.progress_recalculate_series_read_model(created_series.id);
  SELECT series.* INTO created_series
  FROM public.progress_invoice_series AS series WHERE series.id = created_series.id;

  PERFORM public.progress_append_event(
    created_series.id, NULL, 'series_created', 'user', NULL, NULL,
    jsonb_build_object('source_type', created_series.source_type, 'quote_id', created_series.quote_id),
    'create_progress_invoice_series', requested_correlation_key, fingerprint,
    jsonb_build_object('id', created_series.id, 'version', created_series.version)
  );

  RETURN QUERY SELECT created_series.id, created_series.version;
END;
$$;

CREATE FUNCTION public.update_progress_invoice_series(payload JSONB)
RETURNS TABLE (id UUID, version INT, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  unknown_keys TEXT[];
  series_row public.progress_invoice_series%ROWTYPE;
  existing_result JSONB;
  fingerprint TEXT;
  correlation_key UUID;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key) INTO unknown_keys
  FROM jsonb_object_keys(payload) AS keys(key)
  WHERE keys.key <> ALL (ARRAY[
    'series_id', 'expected_version', 'base_contract_ex_gst', 'gst_rate',
    'recipient_name', 'recipient_company', 'recipient_address', 'recipient_email',
    'recipient_phone', 'recipient_abn', 'site_name', 'site_address',
    'default_description', 'reference', 'correlation_key'
  ]::TEXT[]);
  IF unknown_keys IS NOT NULL THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(payload -> 'series_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'expected_version') IS DISTINCT FROM 'number'
    OR jsonb_typeof(payload -> 'correlation_key') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[
      'base_contract_ex_gst', 'gst_rate', 'recipient_name', 'recipient_company',
      'recipient_address', 'recipient_email', 'recipient_phone', 'recipient_abn',
      'site_name', 'site_address', 'default_description', 'reference'
    ]) AS optional_key(key)
    WHERE payload ? optional_key.key
      AND payload -> optional_key.key <> 'null'::JSONB
      AND jsonb_typeof(payload -> optional_key.key) IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'base_contract_ex_gst' AND (
    payload ->> 'base_contract_ex_gst' !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$'
    OR (payload ->> 'base_contract_ex_gst')::NUMERIC <= 0
  ) THEN RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514'; END IF;
  IF payload ? 'gst_rate' AND payload ->> 'gst_rate' IS DISTINCT FROM '0.10' THEN
    RAISE EXCEPTION 'PROGRESS_GST_RATE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF payload ? 'recipient_name' AND (NULLIF(btrim(payload ->> 'recipient_name'), '') IS NULL OR length(btrim(payload ->> 'recipient_name')) > 160) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  IF payload ? 'recipient_address' AND (NULLIF(btrim(payload ->> 'recipient_address'), '') IS NULL OR length(btrim(payload ->> 'recipient_address')) > 300) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  IF payload ? 'site_name' AND (NULLIF(btrim(payload ->> 'site_name'), '') IS NULL OR length(btrim(payload ->> 'site_name')) > 160) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  IF payload ? 'site_address' AND (NULLIF(btrim(payload ->> 'site_address'), '') IS NULL OR length(btrim(payload ->> 'site_address')) > 300) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  IF payload ? 'default_description' AND (NULLIF(btrim(payload ->> 'default_description'), '') IS NULL OR length(btrim(payload ->> 'default_description')) > 1200) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;

  SELECT series.* INTO series_row FROM public.progress_invoice_series AS series
  WHERE series.id = (payload ->> 'series_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  correlation_key := (payload ->> 'correlation_key')::UUID;
  fingerprint := public.progress_request_fingerprint(payload);
  existing_result := public.progress_lock_idempotency(series_row.id, 'update_progress_invoice_series', correlation_key, fingerprint);
  IF existing_result IS NOT NULL THEN
    RETURN QUERY SELECT (existing_result ->> 'id')::UUID, (existing_result ->> 'version')::INT, false, NULL::JSONB;
    RETURN;
  END IF;

  IF (payload ->> 'expected_version')::NUMERIC <> series_row.version THEN
    RETURN QUERY SELECT series_row.id, series_row.version, true, public.progress_series_safe_dto(series_row);
    RETURN;
  END IF;

  UPDATE public.progress_invoice_series AS series SET
    base_contract_ex_gst = CASE WHEN payload ? 'base_contract_ex_gst' THEN (payload ->> 'base_contract_ex_gst')::NUMERIC ELSE series.base_contract_ex_gst END,
    gst_rate = CASE WHEN payload ? 'gst_rate' THEN (payload ->> 'gst_rate')::NUMERIC ELSE series.gst_rate END,
    recipient_name = CASE WHEN payload ? 'recipient_name' THEN btrim(payload ->> 'recipient_name') ELSE series.recipient_name END,
    recipient_company = CASE WHEN payload ? 'recipient_company' THEN NULLIF(btrim(COALESCE(payload ->> 'recipient_company', '')), '') ELSE series.recipient_company END,
    recipient_address = CASE WHEN payload ? 'recipient_address' THEN btrim(payload ->> 'recipient_address') ELSE series.recipient_address END,
    recipient_email = CASE WHEN payload ? 'recipient_email' THEN NULLIF(btrim(COALESCE(payload ->> 'recipient_email', '')), '') ELSE series.recipient_email END,
    recipient_phone = CASE WHEN payload ? 'recipient_phone' THEN NULLIF(btrim(COALESCE(payload ->> 'recipient_phone', '')), '') ELSE series.recipient_phone END,
    recipient_abn = CASE WHEN payload ? 'recipient_abn' THEN NULLIF(pg_catalog.regexp_replace(btrim(COALESCE(payload ->> 'recipient_abn', '')), '\s', '', 'g'), '') ELSE series.recipient_abn END,
    site_name = CASE WHEN payload ? 'site_name' THEN btrim(payload ->> 'site_name') ELSE series.site_name END,
    site_address = CASE WHEN payload ? 'site_address' THEN btrim(payload ->> 'site_address') ELSE series.site_address END,
    default_description = CASE WHEN payload ? 'default_description' THEN btrim(payload ->> 'default_description') ELSE series.default_description END,
    reference = CASE WHEN payload ? 'reference' THEN NULLIF(btrim(COALESCE(payload ->> 'reference', '')), '') ELSE series.reference END,
    version = series.version + 1,
    updated_by = actor
  WHERE series.id = series_row.id RETURNING series.* INTO series_row;

  PERFORM public.progress_recalculate_series_read_model(series_row.id);
  SELECT series.* INTO series_row FROM public.progress_invoice_series AS series WHERE series.id = series_row.id;
  PERFORM public.progress_append_event(
    series_row.id, NULL, 'series_updated', 'user', NULL, NULL, '{}'::JSONB,
    'update_progress_invoice_series', correlation_key, fingerprint,
    jsonb_build_object('id', series_row.id, 'version', series_row.version)
  );
  RETURN QUERY SELECT series_row.id, series_row.version, false, NULL::JSONB;
END;
$$;

CREATE FUNCTION public.progress_validate_adjustment_payload(payload JSONB, require_all BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF require_all AND (
    NOT (payload ? 'type') OR NOT (payload ? 'effective_date') OR NOT (payload ? 'description')
    OR NOT (payload ? 'amount_ex_gst') OR NOT (payload ? 'gst_rate')
  ) THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE = '22023'; END IF;
  IF payload ? 'type' AND (jsonb_typeof(payload -> 'type') IS DISTINCT FROM 'string' OR payload ->> 'type' NOT IN ('variation', 'credit')) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  IF payload ? 'effective_date' AND jsonb_typeof(payload -> 'effective_date') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'effective_date' THEN PERFORM (payload ->> 'effective_date')::DATE; END IF;
  IF payload ? 'description' AND (jsonb_typeof(payload -> 'description') IS DISTINCT FROM 'string' OR NULLIF(btrim(payload ->> 'description'), '') IS NULL OR length(btrim(payload ->> 'description')) > 500) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  IF payload ? 'amount_ex_gst' AND (
    jsonb_typeof(payload -> 'amount_ex_gst') IS DISTINCT FROM 'string'
    OR payload ->> 'amount_ex_gst' !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$'
    OR (payload ->> 'amount_ex_gst')::NUMERIC <= 0
  ) THEN RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514'; END IF;
  IF payload ? 'gst_rate' AND (jsonb_typeof(payload -> 'gst_rate') IS DISTINCT FROM 'string' OR payload ->> 'gst_rate' IS DISTINCT FROM '0.10') THEN
    RAISE EXCEPTION 'PROGRESS_GST_RATE_INVALID' USING ERRCODE = '23514';
  END IF;
  IF payload ? 'quote_item_id' AND payload -> 'quote_item_id' <> 'null'::JSONB AND jsonb_typeof(payload -> 'quote_item_id') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE FUNCTION public.create_progress_adjustment(payload JSONB)
RETURNS TABLE (id UUID, series_id UUID, version INT, replacement_id UUID, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  unknown_keys TEXT[];
  series_row public.progress_invoice_series%ROWTYPE;
  adjustment_row public.progress_adjustments%ROWTYPE;
  correlation_key UUID;
  fingerprint TEXT;
  existing_result JSONB;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key) INTO unknown_keys FROM jsonb_object_keys(payload) keys(key)
  WHERE keys.key <> ALL (ARRAY['series_id','type','effective_date','description','amount_ex_gst','gst_rate','quote_item_id','correlation_key']::TEXT[]);
  IF unknown_keys IS NOT NULL THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(payload -> 'series_id') IS DISTINCT FROM 'string' OR jsonb_typeof(payload -> 'correlation_key') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM public.progress_validate_adjustment_payload(payload, true);
  SELECT series.* INTO series_row FROM public.progress_invoice_series series WHERE series.id = (payload ->> 'series_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  correlation_key := (payload ->> 'correlation_key')::UUID;
  fingerprint := public.progress_request_fingerprint(payload);
  existing_result := public.progress_lock_idempotency(series_row.id, 'create_progress_adjustment', correlation_key, fingerprint);
  IF existing_result IS NOT NULL THEN
    RETURN QUERY SELECT (existing_result->>'id')::UUID, (existing_result->>'series_id')::UUID, (existing_result->>'version')::INT, NULL::UUID, false, NULL::JSONB;
    RETURN;
  END IF;
  INSERT INTO public.progress_adjustments (
    series_id, type, effective_date, display_order, description, amount_ex_gst, gst_rate,
    quote_item_id, created_by, updated_by
  ) VALUES (
    series_row.id, payload->>'type', (payload->>'effective_date')::DATE,
    COALESCE((SELECT max(existing.display_order) + 1 FROM public.progress_adjustments existing WHERE existing.series_id = series_row.id), 0),
    btrim(payload->>'description'), (payload->>'amount_ex_gst')::NUMERIC, (payload->>'gst_rate')::NUMERIC,
    CASE WHEN payload->'quote_item_id' = 'null'::JSONB OR NOT (payload ? 'quote_item_id') THEN NULL ELSE (payload->>'quote_item_id')::UUID END,
    actor, actor
  ) RETURNING * INTO adjustment_row;
  PERFORM public.progress_append_event(series_row.id, NULL, 'adjustment_created', 'user', NULL, NULL,
    jsonb_build_object('adjustment_id', adjustment_row.id, 'type', adjustment_row.type),
    'create_progress_adjustment', correlation_key, fingerprint,
    jsonb_build_object('id', adjustment_row.id, 'series_id', series_row.id, 'version', adjustment_row.version));
  RETURN QUERY SELECT adjustment_row.id, series_row.id, adjustment_row.version, NULL::UUID, false, NULL::JSONB;
END;
$$;

CREATE FUNCTION public.update_progress_adjustment_draft(payload JSONB)
RETURNS TABLE (id UUID, series_id UUID, version INT, replacement_id UUID, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor(); unknown_keys TEXT[];
  adjustment_row public.progress_adjustments%ROWTYPE; existing_result JSONB; fingerprint TEXT; correlation_key UUID;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE='22023'; END IF;
  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key) INTO unknown_keys FROM jsonb_object_keys(payload) keys(key)
  WHERE keys.key <> ALL (ARRAY['adjustment_id','expected_version','type','effective_date','description','amount_ex_gst','gst_rate','quote_item_id','correlation_key']::TEXT[]);
  IF unknown_keys IS NOT NULL THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(payload->'adjustment_id') IS DISTINCT FROM 'string' OR jsonb_typeof(payload->'expected_version') IS DISTINCT FROM 'number' OR jsonb_typeof(payload->'correlation_key') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE='22023'; END IF;
  PERFORM public.progress_validate_adjustment_payload(payload, false);
  SELECT adjustment.* INTO adjustment_row FROM public.progress_adjustments adjustment WHERE adjustment.id=(payload->>'adjustment_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  correlation_key := (payload->>'correlation_key')::UUID; fingerprint := public.progress_request_fingerprint(payload);
  existing_result := public.progress_lock_idempotency(adjustment_row.series_id,'update_progress_adjustment_draft',correlation_key,fingerprint);
  IF existing_result IS NOT NULL THEN RETURN QUERY SELECT (existing_result->>'id')::UUID,(existing_result->>'series_id')::UUID,(existing_result->>'version')::INT,NULL::UUID,false,NULL::JSONB; RETURN; END IF;
  IF (payload->>'expected_version')::NUMERIC <> adjustment_row.version THEN
    RETURN QUERY SELECT adjustment_row.id,adjustment_row.series_id,adjustment_row.version,NULL::UUID,true,public.progress_adjustment_safe_dto(adjustment_row); RETURN; END IF;
  IF adjustment_row.status <> 'draft' THEN RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_IMMUTABLE' USING ERRCODE='55000'; END IF;
  UPDATE public.progress_adjustments adjustment SET
    type=CASE WHEN payload?'type' THEN payload->>'type' ELSE adjustment.type END,
    effective_date=CASE WHEN payload?'effective_date' THEN (payload->>'effective_date')::DATE ELSE adjustment.effective_date END,
    description=CASE WHEN payload?'description' THEN btrim(payload->>'description') ELSE adjustment.description END,
    amount_ex_gst=CASE WHEN payload?'amount_ex_gst' THEN (payload->>'amount_ex_gst')::NUMERIC ELSE adjustment.amount_ex_gst END,
    gst_rate=CASE WHEN payload?'gst_rate' THEN (payload->>'gst_rate')::NUMERIC ELSE adjustment.gst_rate END,
    quote_item_id=CASE WHEN payload?'quote_item_id' THEN CASE WHEN payload->'quote_item_id'='null'::JSONB THEN NULL ELSE (payload->>'quote_item_id')::UUID END ELSE adjustment.quote_item_id END,
    version=adjustment.version+1, updated_by=actor
  WHERE adjustment.id=adjustment_row.id RETURNING adjustment.* INTO adjustment_row;
  PERFORM public.progress_append_event(adjustment_row.series_id,NULL,'adjustment_draft_updated','user',NULL,NULL,jsonb_build_object('adjustment_id',adjustment_row.id),
    'update_progress_adjustment_draft',correlation_key,fingerprint,jsonb_build_object('id',adjustment_row.id,'series_id',adjustment_row.series_id,'version',adjustment_row.version));
  RETURN QUERY SELECT adjustment_row.id,adjustment_row.series_id,adjustment_row.version,NULL::UUID,false,NULL::JSONB;
END;
$$;

CREATE FUNCTION public.approve_progress_adjustment(payload JSONB)
RETURNS TABLE (id UUID, series_id UUID, version INT, replacement_id UUID, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor UUID:=public.progress_require_actor(); unknown_keys TEXT[]; adjustment_row public.progress_adjustments%ROWTYPE;
  existing_result JSONB; fingerprint TEXT; correlation_key UUID;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE='22023'; END IF;
  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key) INTO unknown_keys FROM jsonb_object_keys(payload) keys(key)
  WHERE keys.key <> ALL (ARRAY['adjustment_id','expected_version','correlation_key']::TEXT[]);
  IF unknown_keys IS NOT NULL THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(payload->'adjustment_id') IS DISTINCT FROM 'string' OR jsonb_typeof(payload->'expected_version') IS DISTINCT FROM 'number' OR jsonb_typeof(payload->'correlation_key') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE='22023'; END IF;
  SELECT adjustment.* INTO adjustment_row FROM public.progress_adjustments adjustment WHERE adjustment.id=(payload->>'adjustment_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  PERFORM 1 FROM public.progress_invoice_series series WHERE series.id=adjustment_row.series_id FOR UPDATE;
  correlation_key := (payload->>'correlation_key')::UUID; fingerprint := public.progress_request_fingerprint(payload);
  existing_result := public.progress_lock_idempotency(adjustment_row.series_id,'approve_progress_adjustment',correlation_key,fingerprint);
  IF existing_result IS NOT NULL THEN RETURN QUERY SELECT (existing_result->>'id')::UUID,(existing_result->>'series_id')::UUID,(existing_result->>'version')::INT,NULL::UUID,false,NULL::JSONB; RETURN; END IF;
  IF (payload->>'expected_version')::NUMERIC <> adjustment_row.version THEN RETURN QUERY SELECT adjustment_row.id,adjustment_row.series_id,adjustment_row.version,NULL::UUID,true,public.progress_adjustment_safe_dto(adjustment_row); RETURN; END IF;
  IF adjustment_row.status <> 'draft' THEN RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_IMMUTABLE' USING ERRCODE='55000'; END IF;
  UPDATE public.progress_adjustments adjustment SET status='approved',version=adjustment.version+1,updated_by=actor
  WHERE adjustment.id=adjustment_row.id RETURNING adjustment.* INTO adjustment_row;
  PERFORM public.progress_recalculate_series_read_model(adjustment_row.series_id);
  UPDATE public.progress_invoice_series series
  SET version = series.version + 1, updated_by = actor
  WHERE series.id = adjustment_row.series_id;
  PERFORM public.progress_append_event(adjustment_row.series_id,NULL,'adjustment_approved','user',NULL,NULL,jsonb_build_object('adjustment_id',adjustment_row.id,'type',adjustment_row.type),
    'approve_progress_adjustment',correlation_key,fingerprint,jsonb_build_object('id',adjustment_row.id,'series_id',adjustment_row.series_id,'version',adjustment_row.version));
  RETURN QUERY SELECT adjustment_row.id,adjustment_row.series_id,adjustment_row.version,NULL::UUID,false,NULL::JSONB;
END;
$$;

CREATE FUNCTION public.supersede_progress_adjustment(payload JSONB)
RETURNS TABLE (id UUID, series_id UUID, version INT, replacement_id UUID, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor UUID:=public.progress_require_actor(); unknown_keys TEXT[]; original public.progress_adjustments%ROWTYPE; replacement public.progress_adjustments%ROWTYPE;
  replacement_payload JSONB; existing_result JSONB; fingerprint TEXT; correlation_key UUID;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE='22023'; END IF;
  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key) INTO unknown_keys FROM jsonb_object_keys(payload) keys(key)
  WHERE keys.key <> ALL (ARRAY['adjustment_id','expected_version','reason','replacement','correlation_key']::TEXT[]);
  IF unknown_keys IS NOT NULL THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(payload->'adjustment_id') IS DISTINCT FROM 'string' OR jsonb_typeof(payload->'expected_version') IS DISTINCT FROM 'number' OR jsonb_typeof(payload->'reason') IS DISTINCT FROM 'string' OR jsonb_typeof(payload->'replacement') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'correlation_key') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE='22023'; END IF;
  IF NULLIF(btrim(payload->>'reason'),'') IS NULL OR length(btrim(payload->>'reason'))>500 THEN RAISE EXCEPTION 'PROGRESS_REASON_REQUIRED' USING ERRCODE='23514'; END IF;
  replacement_payload := payload->'replacement';
  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key) INTO unknown_keys FROM jsonb_object_keys(replacement_payload) keys(key)
  WHERE keys.key <> ALL (ARRAY['type','effective_date','description','amount_ex_gst','gst_rate','quote_item_id']::TEXT[]);
  IF unknown_keys IS NOT NULL THEN RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE='22023'; END IF;
  PERFORM public.progress_validate_adjustment_payload(replacement_payload,true);
  SELECT adjustment.* INTO original FROM public.progress_adjustments adjustment WHERE adjustment.id=(payload->>'adjustment_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  PERFORM 1 FROM public.progress_invoice_series series WHERE series.id=original.series_id FOR UPDATE;
  correlation_key := (payload->>'correlation_key')::UUID; fingerprint := public.progress_request_fingerprint(payload);
  existing_result := public.progress_lock_idempotency(original.series_id,'supersede_progress_adjustment',correlation_key,fingerprint);
  IF existing_result IS NOT NULL THEN RETURN QUERY SELECT (existing_result->>'id')::UUID,(existing_result->>'series_id')::UUID,(existing_result->>'version')::INT,(existing_result->>'replacement_id')::UUID,false,NULL::JSONB; RETURN; END IF;
  IF (payload->>'expected_version')::NUMERIC <> original.version THEN RETURN QUERY SELECT original.id,original.series_id,original.version,NULL::UUID,true,public.progress_adjustment_safe_dto(original); RETURN; END IF;
  IF original.status <> 'approved' THEN RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_IMMUTABLE' USING ERRCODE='55000'; END IF;
  INSERT INTO public.progress_adjustments(series_id,type,status,effective_date,display_order,description,amount_ex_gst,gst_rate,superseded_adjustment_id,reason,quote_item_id,created_by,updated_by)
  VALUES(original.series_id,replacement_payload->>'type','approved',(replacement_payload->>'effective_date')::DATE,original.display_order,btrim(replacement_payload->>'description'),(replacement_payload->>'amount_ex_gst')::NUMERIC,(replacement_payload->>'gst_rate')::NUMERIC,original.id,btrim(payload->>'reason'),CASE WHEN replacement_payload->'quote_item_id'='null'::JSONB OR NOT(replacement_payload?'quote_item_id') THEN NULL ELSE (replacement_payload->>'quote_item_id')::UUID END,actor,actor)
  RETURNING * INTO replacement;
  UPDATE public.progress_adjustments adjustment SET status='superseded',reason=btrim(payload->>'reason'),version=adjustment.version+1,updated_by=actor
  WHERE adjustment.id=original.id RETURNING adjustment.* INTO original;
  PERFORM public.progress_recalculate_series_read_model(original.series_id);
  UPDATE public.progress_invoice_series series
  SET version = series.version + 1, updated_by = actor
  WHERE series.id = original.series_id;
  PERFORM public.progress_append_event(original.series_id,NULL,'adjustment_superseded','user',NULL,NULL,jsonb_build_object('adjustment_id',original.id,'replacement_id',replacement.id),
    'supersede_progress_adjustment',correlation_key,fingerprint,jsonb_build_object('id',original.id,'series_id',original.series_id,'version',original.version,'replacement_id',replacement.id));
  RETURN QUERY SELECT original.id,original.series_id,original.version,replacement.id,false,NULL::JSONB;
END;
$$;

REVOKE ALL ON FUNCTION public.progress_request_fingerprint(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_series_safe_dto(public.progress_invoice_series) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_adjustment_safe_dto(public.progress_adjustments) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_validate_series_create_payload(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_recalculate_series_read_model(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_validate_adjustment_payload(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_progress_invoice_series(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_progress_invoice_series(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_progress_adjustment(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_progress_adjustment_draft(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_progress_adjustment(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.supersede_progress_adjustment(JSONB) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_progress_invoice_series(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_progress_invoice_series(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_progress_adjustment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_progress_adjustment_draft(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_progress_adjustment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supersede_progress_adjustment(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
