BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.progress_invoice_series AS series
    WHERE series.accepted_numbering_base IS NOT NULL
      AND series.status <> 'void'
    GROUP BY lower(btrim(series.accepted_numbering_base))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'PROGRESS_NUMBERING_BASE_DUPLICATE_PREFLIGHT'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

ALTER TABLE public.progress_invoice_series
  DROP CONSTRAINT progress_invoice_series_source_type_check,
  ADD CONSTRAINT progress_invoice_series_source_type_check
    CHECK (source_type IN ('pbc_quote', 'jobber_job', 'jobber_invoice', 'manual'));

ALTER TABLE public.progress_invoice_series
  DROP CONSTRAINT progress_invoice_series_check1,
  ADD CONSTRAINT progress_invoice_series_identity_check
    CHECK (
      (
        source_type = 'manual'
        AND quote_id IS NULL
        AND jobber_account_id IS NULL
        AND jobber_invoice_id IS NULL
        AND selected_jobber_job_id IS NULL
        AND jobber_client_id IS NULL
        AND selected_jobber_property_id IS NULL
        AND original_jobber_invoice_number IS NULL
        AND NULLIF(btrim(accepted_numbering_base), '') IS NOT NULL
        AND jobber_link_locked_at IS NULL
        AND current_jobber_snapshot_id IS NULL
        AND last_jobber_sync_attempt_at IS NULL
        AND last_successful_jobber_sync_at IS NULL
        AND last_jobber_sync_error_code IS NULL
      )
      OR (
        source_type <> 'manual'
        AND (accepted_numbering_base IS NULL OR jobber_invoice_id IS NOT NULL)
      )
    );

CREATE UNIQUE INDEX uq_progress_invoice_series_numbering_base
  ON public.progress_invoice_series (lower(btrim(accepted_numbering_base)))
  WHERE accepted_numbering_base IS NOT NULL AND status <> 'void';

CREATE UNIQUE INDEX uq_progress_invoice_events_manual_create_actor_correlation
  ON public.progress_invoice_events (actor_id, command_name, correlation_key)
  WHERE command_name = 'create_manual_progress_invoice_series';

ALTER TABLE public.progress_claim_revisions
  ALTER COLUMN jobber_account_id DROP NOT NULL,
  ALTER COLUMN jobber_invoice_id DROP NOT NULL,
  ALTER COLUMN original_jobber_invoice_number DROP NOT NULL,
  ALTER COLUMN observed_jobber_invoice_number DROP NOT NULL,
  ADD CONSTRAINT progress_claim_revisions_jobber_evidence_all_or_none
    CHECK (
      (
        jobber_account_id IS NULL
        AND jobber_invoice_id IS NULL
        AND original_jobber_invoice_number IS NULL
        AND observed_jobber_invoice_number IS NULL
      )
      OR (
        jobber_account_id IS NOT NULL
        AND jobber_invoice_id IS NOT NULL
        AND original_jobber_invoice_number IS NOT NULL
        AND observed_jobber_invoice_number IS NOT NULL
      )
    );

CREATE OR REPLACE FUNCTION public.validate_progress_claim_revision_source_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  owning_source_type TEXT;
  evidence_all_null BOOLEAN;
  evidence_all_present BOOLEAN;
BEGIN
  SELECT series.source_type
  INTO owning_source_type
  FROM public.progress_claims AS claim
  JOIN public.progress_invoice_series AS series
    ON series.id = claim.series_id
  WHERE claim.id = NEW.claim_id;

  IF owning_source_type IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_PARENT_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  evidence_all_null := NEW.jobber_account_id IS NULL
    AND NEW.jobber_invoice_id IS NULL
    AND NEW.original_jobber_invoice_number IS NULL
    AND NEW.observed_jobber_invoice_number IS NULL;
  evidence_all_present := NEW.jobber_account_id IS NOT NULL
    AND NEW.jobber_invoice_id IS NOT NULL
    AND NEW.original_jobber_invoice_number IS NOT NULL
    AND NEW.observed_jobber_invoice_number IS NOT NULL;

  IF owning_source_type = 'manual' AND NOT evidence_all_null THEN
    RAISE EXCEPTION 'PROGRESS_MANUAL_CLAIM_JOBBER_EVIDENCE_FORBIDDEN'
      USING ERRCODE = '23514';
  END IF;

  IF owning_source_type <> 'manual' AND NOT evidence_all_present THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_CLAIM_EVIDENCE_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_progress_claim_revisions_validate_source_evidence
  ON public.progress_claim_revisions;
CREATE TRIGGER trg_progress_claim_revisions_validate_source_evidence
BEFORE INSERT OR UPDATE OF
  claim_id,
  jobber_account_id,
  jobber_invoice_id,
  original_jobber_invoice_number,
  observed_jobber_invoice_number
ON public.progress_claim_revisions
FOR EACH ROW EXECUTE FUNCTION public.validate_progress_claim_revision_source_evidence();

CREATE OR REPLACE FUNCTION public.progress_validate_manual_series_create_payload(payload JSONB)
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
    'source_type', 'gst_rate', 'accepted_numbering_base',
    'base_contract_ex_gst', 'recipient_name', 'recipient_company',
    'recipient_address', 'recipient_email', 'recipient_phone', 'recipient_abn',
    'site_name', 'site_address', 'default_description', 'reference',
    'correlation_key'
  ]::TEXT[]);

  IF unknown_keys IS NOT NULL THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(payload -> 'source_type') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'gst_rate') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'accepted_numbering_base') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'base_contract_ex_gst') IS DISTINCT FROM 'string'
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
    FROM unnest(ARRAY[
      'recipient_company', 'recipient_email', 'recipient_phone',
      'recipient_abn', 'reference'
    ]) AS optional_key(key)
    WHERE payload ? optional_key.key
      AND payload -> optional_key.key <> 'null'::JSONB
      AND jsonb_typeof(payload -> optional_key.key) IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  IF payload ->> 'source_type' IS DISTINCT FROM 'manual'
    OR payload ->> 'gst_rate' IS DISTINCT FROM '0.10'
    OR NULLIF(btrim(payload ->> 'accepted_numbering_base'), '') IS NULL
    OR length(btrim(payload ->> 'accepted_numbering_base')) > 120
    OR payload ->> 'base_contract_ex_gst' !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$'
    OR (payload ->> 'base_contract_ex_gst')::NUMERIC <= 0
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
    OR length(btrim(COALESCE(payload ->> 'reference', ''))) > 120
    OR payload ->> 'correlation_key' !~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$' THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(COALESCE(payload ->> 'recipient_email', '')), '') IS NOT NULL
    AND btrim(payload ->> 'recipient_email') !~ $zod_email$^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]+)[A-Za-z0-9_+\-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}\Z$zod_email$ THEN
    RAISE EXCEPTION 'PROGRESS_EMAIL_INVALID' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(COALESCE(payload ->> 'recipient_abn', '')), '') IS NOT NULL
    AND pg_catalog.regexp_replace(btrim(payload ->> 'recipient_abn'), '\s', '', 'g') !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'PROGRESS_ABN_INVALID' USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_progress_invoice_series(payload JSONB)
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
  created_series public.progress_invoice_series%ROWTYPE;
BEGIN
  PERFORM public.progress_validate_manual_series_create_payload(payload);
  requested_correlation_key := (payload ->> 'correlation_key')::UUID;
  fingerprint := public.progress_request_fingerprint(payload);

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      actor::TEXT || chr(31) || 'create_manual_progress_invoice_series'
        || chr(31) || requested_correlation_key::TEXT,
      0
    )
  );

  SELECT event.request_fingerprint, event.result_refs
  INTO prior_fingerprint, prior_result
  FROM public.progress_invoice_events AS event
  WHERE event.actor_id = actor
    AND event.command_name = 'create_manual_progress_invoice_series'
    AND event.correlation_key = requested_correlation_key;

  IF FOUND THEN
    IF prior_fingerprint <> fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN QUERY
    SELECT (prior_result ->> 'id')::UUID, (prior_result ->> 'version')::INT;
    RETURN;
  END IF;

  BEGIN
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
      jobber_link_locked_at,
      current_jobber_snapshot_id,
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
      'manual',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      btrim(payload ->> 'accepted_numbering_base'),
      NULL,
      NULL,
      (payload ->> 'base_contract_ex_gst')::NUMERIC,
      0.10,
      btrim(payload ->> 'recipient_name'),
      NULLIF(btrim(COALESCE(payload ->> 'recipient_company', '')), ''),
      btrim(payload ->> 'recipient_address'),
      NULLIF(btrim(COALESCE(payload ->> 'recipient_email', '')), ''),
      NULLIF(btrim(COALESCE(payload ->> 'recipient_phone', '')), ''),
      NULLIF(
        pg_catalog.regexp_replace(
          btrim(COALESCE(payload ->> 'recipient_abn', '')),
          '\s',
          '',
          'g'
        ),
        ''
      ),
      btrim(payload ->> 'site_name'),
      btrim(payload ->> 'site_address'),
      btrim(payload ->> 'default_description'),
      NULLIF(btrim(COALESCE(payload ->> 'reference', '')), ''),
      actor,
      actor
    )
    RETURNING * INTO created_series;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'PROGRESS_UNIQUE_CONFLICT' USING ERRCODE = 'P0001';
  END;

  PERFORM public.progress_recalculate_series_read_model(created_series.id);
  SELECT series.*
  INTO STRICT created_series
  FROM public.progress_invoice_series AS series
  WHERE series.id = created_series.id;

  PERFORM public.progress_append_event(
    created_series.id,
    NULL,
    'series_created',
    'user',
    NULL,
    NULL,
    jsonb_build_object('source_type', created_series.source_type),
    'create_manual_progress_invoice_series',
    requested_correlation_key,
    fingerprint,
    jsonb_build_object('id', created_series.id, 'version', created_series.version)
  );

  RETURN QUERY SELECT created_series.id, created_series.version;
END;
$$;

ALTER FUNCTION public.validate_progress_claim_revision_source_evidence() OWNER TO postgres;
ALTER FUNCTION public.progress_validate_manual_series_create_payload(JSONB) OWNER TO postgres;
ALTER FUNCTION public.create_manual_progress_invoice_series(JSONB) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.validate_progress_claim_revision_source_evidence()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_validate_manual_series_create_payload(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_manual_progress_invoice_series(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_manual_progress_invoice_series(JSONB)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_progress_invoice_series(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_quote_prefill(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
