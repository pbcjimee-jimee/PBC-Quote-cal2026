CREATE UNIQUE INDEX uq_progress_events_standalone_jobber_correlation
  ON public.progress_invoice_events (actor_id, command_name, correlation_key)
  WHERE command_name = 'create_progress_invoice_series_from_jobber';

CREATE FUNCTION public.create_progress_invoice_series_from_jobber(payload JSONB)
RETURNS TABLE (
  series_id UUID,
  version INT,
  snapshot_id UUID,
  imported_payments INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID;
  requested_correlation_key UUID;
  fingerprint TEXT;
  prior_fingerprint TEXT;
  prior_result JSONB;
  series_payload JSONB;
  observation JSONB;
  created_series public.progress_invoice_series%ROWTYPE;
  created_snapshot_id UUID;
  applied_payment_count INT;
  sync_time TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM public.progress_assert_jsonb_keys(payload, ARRAY[
    'actor_id', 'correlation_key', 'request_fingerprint', 'series', 'observation'
  ]);
  IF NOT (payload ?& ARRAY[
      'actor_id', 'correlation_key', 'request_fingerprint', 'series', 'observation'
    ])
    OR jsonb_typeof(payload -> 'actor_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'correlation_key') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'request_fingerprint') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'series') IS DISTINCT FROM 'object'
    OR jsonb_typeof(payload -> 'observation') IS DISTINCT FROM 'object'
    OR payload ->> 'request_fingerprint' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  actor := public.progress_require_service_actor(
    public.progress_jobber_uuid(payload, 'actor_id')
  );
  requested_correlation_key := public.progress_jobber_uuid(payload, 'correlation_key');
  fingerprint := payload ->> 'request_fingerprint';
  series_payload := payload -> 'series';
  observation := payload -> 'observation';

  PERFORM public.progress_validate_series_create_payload(series_payload);
  PERFORM public.progress_validate_jobber_observation(observation);
  IF series_payload ->> 'source_type' IS DISTINCT FROM 'jobber_invoice'
    OR NOT (series_payload ? 'quote_id')
    OR series_payload -> 'quote_id' IS DISTINCT FROM 'null'::JSONB
    OR (series_payload ->> 'correlation_key')::UUID IS DISTINCT FROM requested_correlation_key THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      actor::TEXT
        || chr(31)
        || 'create_progress_invoice_series_from_jobber'
        || chr(31)
        || requested_correlation_key::TEXT,
      0
    )
  );

  SELECT event.request_fingerprint, event.result_refs
  INTO prior_fingerprint, prior_result
  FROM public.progress_invoice_events AS event
  WHERE event.actor_id = actor
    AND event.command_name = 'create_progress_invoice_series_from_jobber'
    AND event.correlation_key = requested_correlation_key;

  IF FOUND THEN
    IF prior_fingerprint <> fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY SELECT
      (prior_result ->> 'series_id')::UUID,
      (prior_result ->> 'version')::INT,
      (prior_result ->> 'snapshot_id')::UUID,
      (prior_result ->> 'imported_payments')::INT;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      btrim(observation ->> 'account_id')
        || chr(31)
        || btrim(observation ->> 'invoice_id'),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.progress_invoice_series AS existing_series
    WHERE existing_series.status <> 'void'
      AND existing_series.jobber_account_id = btrim(observation ->> 'account_id')
      AND existing_series.jobber_invoice_id = btrim(observation ->> 'invoice_id')
  ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.progress_invoice_series (
    quote_id,
    source_type,
    jobber_account_id,
    jobber_invoice_id,
    selected_jobber_job_id,
    jobber_client_id,
    selected_jobber_property_id,
    original_jobber_invoice_number,
    accepted_numbering_base,
    base_contract_ex_gst,
    gst_rate,
    recipient_name,
    recipient_company,
    recipient_address,
    recipient_email,
    recipient_phone,
    recipient_abn,
    site_name,
    site_address,
    default_description,
    reference,
    created_by,
    updated_by
  ) VALUES (
    NULL,
    'jobber_invoice',
    btrim(observation ->> 'account_id'),
    btrim(observation ->> 'invoice_id'),
    NULLIF(btrim(COALESCE(observation ->> 'selected_job_id', '')), ''),
    NULLIF(btrim(COALESCE(observation ->> 'client_id', '')), ''),
    NULLIF(btrim(COALESCE(observation ->> 'selected_property_id', '')), ''),
    btrim(observation ->> 'invoice_number'),
    btrim(observation ->> 'invoice_number'),
    (series_payload ->> 'base_contract_ex_gst')::NUMERIC,
    (series_payload ->> 'gst_rate')::NUMERIC,
    btrim(series_payload ->> 'recipient_name'),
    NULLIF(btrim(COALESCE(series_payload ->> 'recipient_company', '')), ''),
    btrim(series_payload ->> 'recipient_address'),
    NULLIF(btrim(COALESCE(series_payload ->> 'recipient_email', '')), ''),
    NULLIF(btrim(COALESCE(series_payload ->> 'recipient_phone', '')), ''),
    NULLIF(pg_catalog.regexp_replace(
      btrim(COALESCE(series_payload ->> 'recipient_abn', '')),
      '\s',
      '',
      'g'
    ), ''),
    btrim(series_payload ->> 'site_name'),
    btrim(series_payload ->> 'site_address'),
    btrim(series_payload ->> 'default_description'),
    NULLIF(btrim(COALESCE(series_payload ->> 'reference', '')), ''),
    actor,
    actor
  ) RETURNING * INTO created_series;

  created_snapshot_id := public.progress_insert_jobber_snapshot(
    created_series.id,
    actor,
    observation,
    created_series.original_jobber_invoice_number
  );

  SELECT applied.inserted_payments
  INTO STRICT applied_payment_count
  FROM public.progress_apply_jobber_payments(
    created_series.id,
    actor,
    observation
  ) AS applied;

  UPDATE public.progress_invoice_series AS series
  SET current_jobber_snapshot_id = created_snapshot_id,
      last_jobber_sync_attempt_at = sync_time,
      last_successful_jobber_sync_at = sync_time,
      last_jobber_sync_error_code = NULL,
      updated_by = actor
  WHERE series.id = created_series.id
  RETURNING series.* INTO created_series;

  PERFORM public.progress_recalculate_series_read_model_as(created_series.id, actor);
  SELECT series.* INTO STRICT created_series
  FROM public.progress_invoice_series AS series
  WHERE series.id = created_series.id;

  PERFORM public.progress_append_service_event(
    actor,
    created_series.id,
    'standalone_jobber_invoice_imported',
    jsonb_build_object(
      'source_type', created_series.source_type,
      'snapshot_imported', true,
      'payments_imported', applied_payment_count
    ),
    'create_progress_invoice_series_from_jobber',
    requested_correlation_key,
    fingerprint,
    jsonb_build_object(
      'series_id', created_series.id,
      'version', created_series.version,
      'snapshot_id', created_snapshot_id,
      'imported_payments', applied_payment_count
    )
  );

  RETURN QUERY SELECT
    created_series.id,
    created_series.version,
    created_snapshot_id,
    applied_payment_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_progress_invoice_series_from_jobber(JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_progress_invoice_series_from_jobber(JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
