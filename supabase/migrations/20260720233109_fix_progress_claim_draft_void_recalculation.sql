CREATE OR REPLACE FUNCTION public.void_progress_claim_draft(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  requested_series_id UUID;
  requested_claim_id UUID;
  owning_series_id UUID;
  expected_series_version INT;
  expected_claim_version INT;
  expected_set_id UUID;
  expected_manifest_hash TEXT;
  actual_manifest_hash TEXT;
  reason_value TEXT;
  requested_correlation_key UUID;
  fingerprint TEXT;
  replay JSONB;
  response JSONB;
  series_row public.progress_invoice_series%ROWTYPE;
  claim_row public.progress_claims%ROWTYPE;
BEGIN
  PERFORM public.progress_assert_jsonb_keys(payload, ARRAY[
    'series_id', 'claim_id', 'expected_series_version', 'expected_claim_version',
    'expected_current_revision_set_id', 'expected_current_manifest_hash',
    'reason', 'correlation_key'
  ]::TEXT[]);
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 8
    OR jsonb_typeof(payload -> 'series_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'claim_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'expected_series_version') IS DISTINCT FROM 'number'
    OR jsonb_typeof(payload -> 'expected_claim_version') IS DISTINCT FROM 'number'
    OR jsonb_typeof(payload -> 'reason') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'correlation_key') IS DISTINCT FROM 'string'
    OR payload ->> 'series_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR payload ->> 'claim_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR payload ->> 'correlation_key' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR (payload -> 'expected_current_revision_set_id' <> 'null'::JSONB
      AND (jsonb_typeof(payload -> 'expected_current_revision_set_id') IS DISTINCT FROM 'string'
        OR payload ->> 'expected_current_revision_set_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'))
    OR (payload -> 'expected_current_manifest_hash' <> 'null'::JSONB
      AND (jsonb_typeof(payload -> 'expected_current_manifest_hash') IS DISTINCT FROM 'string'
        OR lower(payload ->> 'expected_current_manifest_hash') !~ '^[0-9a-f]{64}$'))
    OR ((payload -> 'expected_current_revision_set_id' = 'null'::JSONB)
      <> (payload -> 'expected_current_manifest_hash' = 'null'::JSONB)) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;

  requested_series_id := (payload ->> 'series_id')::UUID;
  requested_claim_id := (payload ->> 'claim_id')::UUID;
  expected_series_version := (payload ->> 'expected_series_version')::INT;
  expected_claim_version := (payload ->> 'expected_claim_version')::INT;
  IF expected_series_version <= 0 OR expected_claim_version <= 0 THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  expected_set_id := (payload ->> 'expected_current_revision_set_id')::UUID;
  expected_manifest_hash := lower(payload ->> 'expected_current_manifest_hash');
  reason_value := btrim(payload ->> 'reason');
  IF reason_value = '' OR length(reason_value) > 500 THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  requested_correlation_key := (payload ->> 'correlation_key')::UUID;
  fingerprint := public.progress_request_fingerprint(
    payload || jsonb_build_object('reason', reason_value, 'expected_current_manifest_hash', expected_manifest_hash)
  );

  SELECT claim.series_id INTO owning_series_id
  FROM public.progress_claims AS claim
  WHERE claim.id = requested_claim_id;
  IF NOT FOUND OR owning_series_id <> requested_series_id THEN
    RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT series.* INTO series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = requested_series_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  SELECT claim.* INTO claim_row
  FROM public.progress_claims AS claim
  WHERE claim.id = requested_claim_id
    AND claim.series_id = requested_series_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  replay := public.progress_lock_idempotency(
    series_row.id, 'void_progress_claim_draft', requested_correlation_key, fingerprint
  );
  IF replay IS NOT NULL THEN
    SELECT result.response_snapshot INTO response
    FROM public.progress_claim_command_results AS result
    WHERE result.series_id = series_row.id
      AND result.command_name = 'void_progress_claim_draft'
      AND result.correlation_key = requested_correlation_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    RETURN response;
  END IF;

  IF series_row.status = 'void' THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE = 'P0001';
  END IF;
  IF series_row.status NOT IN ('draft', 'active') THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_STATE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF claim_row.status <> 'draft' OR claim_row.original_issued_at IS NOT NULL THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_NOT_DRAFT' USING ERRCODE = 'P0001';
  END IF;
  IF expected_series_version <> series_row.version
    OR expected_claim_version <> claim_row.version THEN
    RAISE EXCEPTION 'PROGRESS_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF series_row.current_revision_set_id IS NOT NULL THEN
    SELECT lower(revision_set.aggregate_financial_manifest_hash)
    INTO actual_manifest_hash
    FROM public.progress_invoice_revision_sets AS revision_set
    WHERE revision_set.id = series_row.current_revision_set_id
      AND revision_set.series_id = series_row.id
      AND revision_set.state = 'current';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF expected_set_id IS DISTINCT FROM series_row.current_revision_set_id
    OR expected_manifest_hash IS DISTINCT FROM actual_manifest_hash THEN
    RAISE EXCEPTION 'PROGRESS_CURRENT_SET_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.progress_claims AS claim
  SET status = 'void', version = claim.version + 1, updated_by = actor, updated_at = now()
  WHERE claim.id = claim_row.id
  RETURNING claim.* INTO claim_row;

  UPDATE public.progress_invoice_series AS series
  SET version = series.version + 1, updated_by = actor, updated_at = now()
  WHERE series.id = series_row.id
  RETURNING series.* INTO series_row;

  PERFORM public.progress_recalculate_series_read_model_as(series_row.id, actor);
  SELECT series.* INTO STRICT series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = requested_series_id;

  response := jsonb_build_object(
    'series_id', series_row.id,
    'claim_id', claim_row.id,
    'series_version', series_row.version,
    'claim_version', claim_row.version,
    'status', claim_row.status
  );
  PERFORM public.progress_append_event(
    series_row.id,
    claim_row.id,
    'progress_claim_draft_voided',
    'user',
    claim_row.current_revision_id,
    claim_row.current_revision_id,
    jsonb_build_object(
      'status', jsonb_build_object('before', 'draft', 'after', 'void'),
      'reason', reason_value
    ),
    'void_progress_claim_draft',
    requested_correlation_key,
    fingerprint,
    jsonb_build_object('series_id', series_row.id, 'claim_id', claim_row.id)
  );
  INSERT INTO public.progress_claim_command_results(
    series_id, command_name, correlation_key, response_snapshot
  ) VALUES (
    series_row.id, 'void_progress_claim_draft', requested_correlation_key, response
  );
  RETURN response;
END;
$$;

ALTER FUNCTION public.void_progress_claim_draft(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.void_progress_claim_draft(JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_progress_claim_draft(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
