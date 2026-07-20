BEGIN;

CREATE TABLE public.progress_invoice_numbering_base_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_base TEXT NOT NULL
    CHECK (
      normalized_base = lower(btrim(normalized_base))
      AND length(normalized_base) BETWEEN 1 AND 120
    ),
  series_id UUID NOT NULL
    REFERENCES public.progress_invoice_series(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK (state IN ('active', 'permanent', 'released')),
  first_claim_id UUID REFERENCES public.progress_claims(id) ON DELETE RESTRICT,
  state_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (state = 'permanent' AND first_claim_id IS NOT NULL)
    OR (state IN ('active', 'released') AND first_claim_id IS NULL)
  )
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.progress_invoice_series AS series
    WHERE NULLIF(btrim(series.accepted_numbering_base), '') IS NOT NULL
      AND (
        series.status <> 'void'
        OR EXISTS (
          SELECT 1 FROM public.progress_claims AS claim
          WHERE claim.series_id = series.id
        )
      )
    GROUP BY lower(btrim(series.accepted_numbering_base))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'PROGRESS_NUMBERING_BASE_DUPLICATE_PREFLIGHT'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

INSERT INTO public.progress_invoice_numbering_base_reservations (
  normalized_base,
  series_id,
  state,
  first_claim_id,
  created_by,
  updated_by,
  created_at,
  updated_at,
  state_changed_at
)
SELECT
  lower(btrim(series.accepted_numbering_base)),
  series.id,
  CASE
    WHEN first_claim.id IS NOT NULL THEN 'permanent'
    WHEN series.status = 'void' THEN 'released'
    ELSE 'active'
  END,
  first_claim.id,
  series.created_by,
  series.updated_by,
  series.created_at,
  series.updated_at,
  CASE WHEN first_claim.id IS NOT NULL THEN first_claim.created_at ELSE series.updated_at END
FROM public.progress_invoice_series AS series
LEFT JOIN LATERAL (
  SELECT claim.id, claim.created_at
  FROM public.progress_claims AS claim
  WHERE claim.series_id = series.id
  ORDER BY claim.created_at, claim.id
  LIMIT 1
) AS first_claim ON true
WHERE NULLIF(btrim(series.accepted_numbering_base), '') IS NOT NULL;

CREATE UNIQUE INDEX uq_progress_numbering_base_reserved
  ON public.progress_invoice_numbering_base_reservations (normalized_base)
  WHERE state IN ('active', 'permanent');

CREATE INDEX idx_progress_numbering_base_reservations_series
  ON public.progress_invoice_numbering_base_reservations (series_id, created_at);

DROP INDEX public.uq_progress_invoice_series_numbering_base;

CREATE FUNCTION public.protect_progress_numbering_base_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PROGRESS_NUMBERING_BASE_RESERVATION_IMMUTABLE'
      USING ERRCODE = '55000';
  END IF;

  IF ROW(NEW.id, NEW.normalized_base, NEW.series_id, NEW.created_by, NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.normalized_base, OLD.series_id, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'PROGRESS_NUMBERING_BASE_RESERVATION_IMMUTABLE'
      USING ERRCODE = '55000';
  END IF;

  IF NOT (
    OLD.state = 'active'
    AND NEW.state IN ('permanent', 'released')
    AND NEW.state IS DISTINCT FROM OLD.state
    AND NEW.first_claim_id IS NOT DISTINCT FROM CASE
      WHEN NEW.state = 'permanent' THEN NEW.first_claim_id
      ELSE NULL
    END
    AND (NEW.state <> 'permanent' OR NEW.first_claim_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'PROGRESS_NUMBERING_BASE_STATE_INVALID'
      USING ERRCODE = '55000';
  END IF;

  NEW.updated_at := now();
  NEW.state_changed_at := now();
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.sync_progress_numbering_base_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  old_normalized TEXT := NULLIF(lower(btrim(COALESCE(OLD.accepted_numbering_base, ''))), '');
  new_normalized TEXT := NULLIF(lower(btrim(COALESCE(NEW.accepted_numbering_base, ''))), '');
BEGIN
  IF TG_OP = 'UPDATE' AND old_normalized IS DISTINCT FROM new_normalized
    AND old_normalized IS NOT NULL THEN
    UPDATE public.progress_invoice_numbering_base_reservations AS reservation
    SET state = 'released', first_claim_id = NULL, updated_by = NEW.updated_by
    WHERE reservation.series_id = NEW.id
      AND reservation.normalized_base = old_normalized
      AND reservation.state = 'active';
  END IF;

  IF new_normalized IS NOT NULL
    AND (
      TG_OP = 'INSERT'
      OR old_normalized IS DISTINCT FROM new_normalized
    ) THEN
    INSERT INTO public.progress_invoice_numbering_base_reservations (
      normalized_base, series_id, state, first_claim_id, created_by, updated_by
    ) VALUES (
      new_normalized,
      NEW.id,
      CASE WHEN NEW.status = 'void' THEN 'released' ELSE 'active' END,
      NULL,
      NEW.created_by,
      NEW.updated_by
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'void' AND OLD.status <> 'void' THEN
    UPDATE public.progress_invoice_numbering_base_reservations AS reservation
    SET state = 'released', first_claim_id = NULL, updated_by = NEW.updated_by
    WHERE reservation.series_id = NEW.id
      AND reservation.normalized_base = new_normalized
      AND reservation.state = 'active';
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'PROGRESS_NUMBERING_BASE_CONFLICT' USING ERRCODE = '23505';
END;
$$;

CREATE FUNCTION public.promote_progress_numbering_base_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  owning_base TEXT;
BEGIN
  SELECT NULLIF(lower(btrim(series.accepted_numbering_base)), '')
  INTO owning_base
  FROM public.progress_invoice_series AS series
  WHERE series.id = NEW.series_id
  FOR UPDATE;

  IF owning_base IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.progress_invoice_numbering_base_reservations AS reservation
  SET state = 'permanent', first_claim_id = NEW.id, updated_by = NEW.created_by
  WHERE reservation.series_id = NEW.series_id
    AND reservation.normalized_base = owning_base
    AND reservation.state = 'active';

  IF NOT FOUND AND NOT EXISTS (
    SELECT 1
    FROM public.progress_invoice_numbering_base_reservations AS reservation
    WHERE reservation.series_id = NEW.series_id
      AND reservation.normalized_base = owning_base
      AND reservation.state = 'permanent'
  ) THEN
    RAISE EXCEPTION 'PROGRESS_NUMBERING_BASE_RESERVATION_MISSING'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_progress_numbering_base_reservation_protect
BEFORE UPDATE OR DELETE ON public.progress_invoice_numbering_base_reservations
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_numbering_base_reservation();

CREATE TRIGGER trg_progress_series_sync_numbering_base
AFTER INSERT OR UPDATE OF accepted_numbering_base, status
ON public.progress_invoice_series
FOR EACH ROW EXECUTE FUNCTION public.sync_progress_numbering_base_reservation();

CREATE TRIGGER trg_progress_claim_promote_numbering_base
AFTER INSERT ON public.progress_claims
FOR EACH ROW EXECUTE FUNCTION public.promote_progress_numbering_base_reservation();

ALTER TABLE public.progress_invoice_numbering_base_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.progress_invoice_numbering_base_reservations
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.progress_invoice_numbering_base_reservations TO authenticated;
CREATE POLICY "progress_numbering_base_reservations_authenticated_select"
  ON public.progress_invoice_numbering_base_reservations
  FOR SELECT TO authenticated USING (true);

ALTER FUNCTION public.protect_progress_numbering_base_reservation() OWNER TO postgres;
ALTER FUNCTION public.sync_progress_numbering_base_reservation() OWNER TO postgres;
ALTER FUNCTION public.promote_progress_numbering_base_reservation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_progress_numbering_base_reservation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_progress_numbering_base_reservation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.promote_progress_numbering_base_reservation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_progress_series_locked_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_IDENTITY_PERMANENT' USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE = '55000';
  END IF;

  IF ROW(NEW.id, NEW.source_type, NEW.created_by, NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.source_type, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_PROVENANCE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF NEW.quote_id IS DISTINCT FROM OLD.quote_id
    AND NOT (
      NEW.quote_id IS NULL
      AND OLD.quote_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.quotes AS quote WHERE quote.id = OLD.quote_id
      )
    ) THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_PROVENANCE_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.progress_claims AS claim WHERE claim.series_id = OLD.id
  ) THEN
    IF NEW.base_contract_ex_gst IS DISTINCT FROM OLD.base_contract_ex_gst THEN
      RAISE EXCEPTION 'PROGRESS_BASE_CONTRACT_LOCKED' USING ERRCODE = '55000';
    END IF;
    IF ROW(
      NEW.accepted_numbering_base,
      NEW.jobber_account_id,
      NEW.jobber_invoice_id,
      NEW.selected_jobber_job_id,
      NEW.jobber_client_id,
      NEW.selected_jobber_property_id,
      NEW.original_jobber_invoice_number,
      NEW.jobber_link_locked_at
    ) IS DISTINCT FROM ROW(
      OLD.accepted_numbering_base,
      OLD.jobber_account_id,
      OLD.jobber_invoice_id,
      OLD.selected_jobber_job_id,
      OLD.jobber_client_id,
      OLD.selected_jobber_property_id,
      OLD.original_jobber_invoice_number,
      OLD.jobber_link_locked_at
    ) THEN
      RAISE EXCEPTION 'PROGRESS_SERIES_IDENTITY_PERMANENT' USING ERRCODE = '55000';
    END IF;
  ELSIF OLD.jobber_link_locked_at IS NOT NULL
    AND ROW(
      NEW.jobber_account_id,
      NEW.jobber_invoice_id,
      NEW.accepted_numbering_base,
      NEW.jobber_link_locked_at
    ) IS DISTINCT FROM ROW(
      OLD.jobber_account_id,
      OLD.jobber_invoice_id,
      OLD.accepted_numbering_base,
      OLD.jobber_link_locked_at
    ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_LINK_LOCKED' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER trg_progress_series_locked_link ON public.progress_invoice_series;
CREATE TRIGGER trg_progress_series_locked_link
BEFORE UPDATE OR DELETE ON public.progress_invoice_series
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_series_locked_link();

CREATE FUNCTION public.reject_progress_row_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'PROGRESS_ROW_DELETE_FORBIDDEN' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER trg_progress_revision_sets_reject_delete
BEFORE DELETE ON public.progress_invoice_revision_sets
FOR EACH ROW EXECUTE FUNCTION public.reject_progress_row_delete();

CREATE OR REPLACE FUNCTION public.protect_progress_payment_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PROGRESS_PAYMENT_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  IF ROW(NEW.id, NEW.series_id, NEW.source, NEW.jobber_payment_id, NEW.created_by, NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.series_id, OLD.source, OLD.jobber_payment_id, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'PROGRESS_PAYMENT_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_progress_payments_protect_identity
  ON public.progress_payments;
CREATE TRIGGER trg_progress_payments_protect_identity
BEFORE UPDATE OR DELETE ON public.progress_payments
FOR EACH ROW EXECUTE FUNCTION public.protect_progress_payment_identity();

CREATE OR REPLACE FUNCTION public.protect_progress_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PROGRESS_DOCUMENT_DELETE_FORBIDDEN' USING ERRCODE = '55000';
  END IF;
  IF OLD.state = 'ready' THEN
    RAISE EXCEPTION 'PROGRESS_DOCUMENT_READY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.reject_progress_row_delete() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reject_progress_row_delete()
  FROM PUBLIC, anon, authenticated, service_role;

ALTER FUNCTION public.update_progress_invoice_series(JSONB)
  RENAME TO progress_update_invoice_series_v1;
REVOKE ALL ON FUNCTION public.progress_update_invoice_series_v1(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.update_progress_invoice_series(payload JSONB)
RETURNS TABLE (id UUID, version INT, quote_id UUID, conflict BOOLEAN, current JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  series_row public.progress_invoice_series%ROWTYPE;
  existing_result JSONB;
  fingerprint TEXT;
  correlation_key UUID;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR jsonb_typeof(payload -> 'series_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'correlation_key') IS DISTINCT FROM 'string'
    OR payload ->> 'series_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    OR payload ->> 'correlation_key' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT series.* INTO series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = (payload ->> 'series_id')::UUID
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  correlation_key := (payload ->> 'correlation_key')::UUID;
  fingerprint := public.progress_request_fingerprint(payload);
  existing_result := public.progress_lock_idempotency(
    series_row.id,
    'update_progress_invoice_series',
    correlation_key,
    fingerprint
  );
  IF existing_result IS NOT NULL THEN
    RETURN QUERY SELECT
      (existing_result ->> 'id')::UUID,
      (existing_result ->> 'version')::INT,
      (existing_result ->> 'quote_id')::UUID,
      false,
      NULL::JSONB;
    RETURN;
  END IF;

  IF series_row.status = 'void' THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE = 'P0001';
  END IF;

  IF payload ? 'base_contract_ex_gst'
    AND jsonb_typeof(payload -> 'base_contract_ex_gst') = 'string'
    AND payload ->> 'base_contract_ex_gst' ~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$'
    AND (payload ->> 'base_contract_ex_gst')::NUMERIC IS DISTINCT FROM series_row.base_contract_ex_gst
    AND EXISTS (
      SELECT 1 FROM public.progress_claims AS claim WHERE claim.series_id = series_row.id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_BASE_CONTRACT_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT * FROM public.progress_update_invoice_series_v1(payload);
END;
$$;

ALTER FUNCTION public.update_progress_invoice_series(JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_progress_invoice_series(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_progress_invoice_series(JSONB) TO authenticated;

CREATE FUNCTION public.void_progress_invoice_series(payload JSONB)
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

  SELECT count(*)::INT, count(*) FILTER (WHERE claim.status = 'issued')::INT
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
