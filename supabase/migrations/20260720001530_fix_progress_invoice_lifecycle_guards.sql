BEGIN;

CREATE OR REPLACE FUNCTION public.protect_progress_series_locked_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  legitimate_quote_fk_clear BOOLEAN := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_IDENTITY_PERMANENT' USING ERRCODE = '55000';
  END IF;

  IF NEW.quote_id IS DISTINCT FROM OLD.quote_id THEN
    legitimate_quote_fk_clear := NEW.quote_id IS NULL
      AND OLD.quote_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.quotes AS quote WHERE quote.id = OLD.quote_id
      )
      AND (to_jsonb(NEW) - 'quote_id') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'quote_id');

    IF NOT legitimate_quote_fk_clear THEN
      RAISE EXCEPTION 'PROGRESS_SERIES_PROVENANCE_IMMUTABLE' USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE = '55000';
  END IF;

  IF ROW(NEW.id, NEW.source_type, NEW.created_by, NEW.created_at)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.source_type, OLD.created_by, OLD.created_at) THEN
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

CREATE OR REPLACE FUNCTION public.protect_progress_claim_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_REVISION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF ROW(
    NEW.id,
    NEW.claim_id,
    NEW.revision_number,
    NEW.created_by,
    NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id,
    OLD.claim_id,
    OLD.revision_number,
    OLD.created_by,
    OLD.created_at
  ) THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_REVISION_IDENTITY_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF OLD.state = 'superseded' THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_REVISION_IMMUTABLE' USING ERRCODE = '55000';
  END IF;

  IF OLD.state = 'issued' THEN
    IF NEW.state <> 'superseded'
      OR (to_jsonb(NEW) - 'state') IS DISTINCT FROM (to_jsonb(OLD) - 'state') THEN
      RAISE EXCEPTION 'PROGRESS_CLAIM_REVISION_IMMUTABLE' USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.state = 'draft' AND NEW.state = 'superseded' THEN
    RAISE EXCEPTION 'PROGRESS_CLAIM_REVISION_STATE_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.protect_progress_series_locked_link() OWNER TO postgres;
ALTER FUNCTION public.protect_progress_claim_revision() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_progress_series_locked_link()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_progress_claim_revision()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
