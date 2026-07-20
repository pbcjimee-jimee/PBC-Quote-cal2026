BEGIN;

CREATE OR REPLACE FUNCTION public.void_progress_invoice_series(payload JSONB)
RETURNS TABLE (
  series_id UUID,
  version INT,
  mode TEXT,
  revision_set_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  unknown_keys TEXT[];
  requested_series_id UUID;
  requested_version NUMERIC;
  requested_set_id UUID;
  requested_hash TEXT;
  correlation_key UUID;
  reason TEXT;
  fingerprint TEXT;
  existing_result JSONB;
  series_row public.progress_invoice_series%ROWTYPE;
  actual_hash TEXT;
  claim_count INT;
  issued_count INT;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key)
  INTO unknown_keys
  FROM jsonb_object_keys(payload) AS keys(key)
  WHERE keys.key <> ALL (ARRAY[
    'series_id',
    'expected_version',
    'expected_current_revision_set_id',
    'expected_current_manifest_hash',
    'prepared_revision_set_id',
    'reason',
    'correlation_key'
  ]::TEXT[]);
  IF unknown_keys IS NOT NULL
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 7 THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(payload -> 'series_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'expected_version') IS DISTINCT FROM 'number'
    OR jsonb_typeof(payload -> 'reason') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'correlation_key') IS DISTINCT FROM 'string'
    OR (payload -> 'expected_current_revision_set_id' <> 'null'::JSONB
      AND jsonb_typeof(payload -> 'expected_current_revision_set_id') IS DISTINCT FROM 'string')
    OR (payload -> 'expected_current_manifest_hash' <> 'null'::JSONB
      AND jsonb_typeof(payload -> 'expected_current_manifest_hash') IS DISTINCT FROM 'string')
    OR (payload -> 'prepared_revision_set_id' <> 'null'::JSONB
      AND jsonb_typeof(payload -> 'prepared_revision_set_id') IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF payload ->> 'series_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR payload ->> 'correlation_key' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR (payload ->> 'expected_current_revision_set_id' IS NOT NULL
      AND payload ->> 'expected_current_revision_set_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    OR (payload ->> 'prepared_revision_set_id' IS NOT NULL
      AND payload ->> 'prepared_revision_set_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;

  requested_version := (payload ->> 'expected_version')::NUMERIC;
  reason := btrim(payload ->> 'reason');
  requested_hash := lower(payload ->> 'expected_current_manifest_hash');
  IF requested_version <> trunc(requested_version)
    OR requested_version <= 0
    OR requested_version > 2147483647
    OR length(reason) NOT BETWEEN 1 AND 500
    OR (requested_hash IS NOT NULL AND requested_hash !~ '^[0-9a-f]{64}$')
    OR ((payload ->> 'expected_current_revision_set_id' IS NULL)
      IS DISTINCT FROM (requested_hash IS NULL)) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;

  IF payload ->> 'prepared_revision_set_id' IS NOT NULL THEN
    RAISE EXCEPTION 'PROGRESS_PREPARED_SET_UNSUPPORTED' USING ERRCODE = 'P0001';
  END IF;

  requested_series_id := (payload ->> 'series_id')::UUID;
  requested_set_id := (payload ->> 'expected_current_revision_set_id')::UUID;
  correlation_key := (payload ->> 'correlation_key')::UUID;
  fingerprint := public.progress_request_fingerprint(
    payload || jsonb_build_object(
      'reason', reason,
      'expected_current_manifest_hash', requested_hash
    )
  );

  SELECT series.* INTO series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = requested_series_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  existing_result := public.progress_lock_idempotency(
    series_row.id,
    'void_progress_invoice_series',
    correlation_key,
    fingerprint
  );
  IF existing_result IS NOT NULL THEN
    RETURN QUERY SELECT
      (existing_result ->> 'series_id')::UUID,
      (existing_result ->> 'version')::INT,
      existing_result ->> 'mode',
      (existing_result ->> 'revision_set_id')::UUID;
    RETURN;
  END IF;

  IF series_row.status = 'void' THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.progress_require_expected_version(payload, series_row.version);

  IF series_row.current_revision_set_id IS NOT NULL THEN
    SELECT lower(revision_set.aggregate_financial_manifest_hash)
    INTO actual_hash
    FROM public.progress_invoice_revision_sets AS revision_set
    WHERE revision_set.id = series_row.current_revision_set_id
      AND revision_set.series_id = series_row.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF requested_set_id IS DISTINCT FROM series_row.current_revision_set_id
    OR requested_hash IS DISTINCT FROM actual_hash THEN
    RAISE EXCEPTION 'PROGRESS_CURRENT_SET_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  PERFORM claim.id
  FROM public.progress_claims AS claim
  WHERE claim.series_id = series_row.id
  ORDER BY claim.created_at, claim.id
  FOR UPDATE;

  SELECT count(*)::INT, count(*) FILTER (WHERE claim.status = 'issued' OR claim.original_issued_at IS NOT NULL)::INT
  INTO claim_count, issued_count
  FROM public.progress_claims AS claim
  WHERE claim.series_id = series_row.id;

  IF issued_count > 0 THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_VOID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF claim_count > 0 THEN
    UPDATE public.progress_claims AS claim
    SET status = 'void', version = claim.version + 1, updated_by = actor
    WHERE claim.series_id = series_row.id
      AND claim.status = 'draft';
  END IF;

  UPDATE public.progress_invoice_series AS series
  SET status = 'void', version = series.version + 1, updated_by = actor
  WHERE series.id = series_row.id
  RETURNING series.* INTO series_row;

  PERFORM public.progress_append_event(
    series_row.id,
    NULL,
    'series_voided',
    'user',
    NULL,
    NULL,
    jsonb_build_object('void_reason', reason),
    'void_progress_invoice_series',
    correlation_key,
    fingerprint,
    jsonb_build_object(
      'series_id', series_row.id,
      'version', series_row.version,
      'mode', 'direct',
      'revision_set_id', NULL
    )
  );

  RETURN QUERY SELECT series_row.id, series_row.version, 'direct'::TEXT, NULL::UUID;
END;
$$;

ALTER FUNCTION public.void_progress_invoice_series(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.void_progress_invoice_series(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_progress_invoice_series(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
