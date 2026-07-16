ALTER TABLE public.progress_jobber_invoice_snapshots
  ADD COLUMN IF NOT EXISTS invoice_payments_total NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS client_email_candidates JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS client_phone_candidates JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS external_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_eligibility_policy_version TEXT;

ALTER TABLE public.progress_jobber_invoice_snapshots
  ALTER COLUMN jobber_client_id DROP NOT NULL,
  ALTER COLUMN client_name DROP NOT NULL;

ALTER TABLE public.progress_jobber_invoice_snapshots
  ADD CONSTRAINT progress_jobber_snapshots_payments_total_check
    CHECK (invoice_payments_total IS NULL OR invoice_payments_total >= 0),
  ADD CONSTRAINT progress_jobber_snapshots_email_candidates_check
    CHECK (
      jsonb_typeof(client_email_candidates) = 'array'
      AND jsonb_array_length(client_email_candidates) <= 20
      AND pg_column_size(client_email_candidates) <= 8192
    ),
  ADD CONSTRAINT progress_jobber_snapshots_phone_candidates_check
    CHECK (
      jsonb_typeof(client_phone_candidates) = 'array'
      AND jsonb_array_length(client_phone_candidates) <= 20
      AND pg_column_size(client_phone_candidates) <= 8192
    );

ALTER TABLE public.progress_payment_revisions
  ADD COLUMN IF NOT EXISTS jobber_source TEXT,
  ADD COLUMN IF NOT EXISTS raw_adjustment_type TEXT,
  ADD COLUMN IF NOT EXISTS raw_signed_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS payment_eligibility_treatment TEXT;

ALTER TABLE public.progress_payment_revisions
  ADD CONSTRAINT progress_payment_revisions_jobber_source_check
    CHECK (jobber_source IS NULL OR jobber_source IN ('payment_record', 'nested_refund')),
  ADD CONSTRAINT progress_payment_revisions_direction_check
    CHECK (
      direction IS NULL
      OR direction IN ('receipt', 'refund', 'reversal', 'ambiguous', 'excluded')
    ),
  ADD CONSTRAINT progress_payment_revisions_treatment_check
    CHECK (
      payment_eligibility_treatment IS NULL
      OR payment_eligibility_treatment IN ('active', 'unconfirmed')
    );

ALTER TABLE public.progress_invoice_series
  ADD CONSTRAINT progress_invoice_series_jobber_sync_error_code_check
    CHECK (
      last_jobber_sync_error_code IS NULL
      OR last_jobber_sync_error_code IN (
        'JOBBER_NOT_CONNECTED',
        'JOBBER_AUTH_FAILED',
        'JOBBER_SCOPE_MISSING',
        'JOBBER_NOT_FOUND',
        'JOBBER_RATE_LIMITED',
        'JOBBER_SCHEMA_MISMATCH',
        'JOBBER_RESPONSE_INVALID',
        'JOBBER_TEMPORARY_FAILURE'
      )
    );

CREATE FUNCTION public.progress_assert_jsonb_keys(
  payload JSONB,
  allowed_keys TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  unknown_keys TEXT[];
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.array_agg(key ORDER BY key)
  INTO unknown_keys
  FROM jsonb_object_keys(payload) AS supplied(key)
  WHERE NOT (key = ANY(allowed_keys));

  IF unknown_keys IS NOT NULL THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE FUNCTION public.progress_require_service_actor(requested_actor UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF requested_actor IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM auth.users AS app_user WHERE app_user.id = requested_actor
    ) THEN
    RAISE EXCEPTION 'PROGRESS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN requested_actor;
END;
$$;

CREATE FUNCTION public.progress_jobber_uuid(
  payload JSONB,
  key_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  raw_value TEXT;
  parsed_value UUID;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR NULLIF(btrim(key_name), '') IS NULL
    OR NOT (payload ? key_name)
    OR jsonb_typeof(payload -> key_name) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  raw_value := payload ->> key_name;
  IF raw_value !~* (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
      || '[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  BEGIN
    parsed_value := raw_value::UUID;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END;

  RETURN parsed_value;
END;
$$;

CREATE FUNCTION public.progress_jobber_positive_int(
  payload JSONB,
  key_name TEXT
)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  raw_value TEXT;
  parsed_value INT;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR NULLIF(btrim(key_name), '') IS NULL
    OR NOT (payload ? key_name)
    OR jsonb_typeof(payload -> key_name) IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  raw_value := payload ->> key_name;
  IF raw_value !~ '^[1-9][0-9]{0,9}$'
    OR length(raw_value) = 10 AND raw_value > '2147483647' THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  BEGIN
    parsed_value := raw_value::INT;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END;

  RETURN parsed_value;
END;
$$;

CREATE FUNCTION public.progress_jobber_sydney_date(value TEXT)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  parsed_date DATE;
  parsed_timestamp TIMESTAMPTZ;
BEGIN
  IF value IS NULL OR btrim(value) = '' THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  IF value ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      parsed_date := value::DATE;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
    END;
    IF pg_catalog.to_char(parsed_date, 'YYYY-MM-DD') <> value THEN
      RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
    END IF;
    RETURN parsed_date;
  END IF;

  IF value !~ '^\d{4}-\d{2}-\d{2}T.+([zZ]|[+-]\d{2}:\d{2})$' THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    parsed_timestamp := value::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END;

  RETURN (parsed_timestamp AT TIME ZONE 'Australia/Sydney')::DATE;
END;
$$;

CREATE FUNCTION public.progress_jobber_timestamp(value TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  parsed_timestamp TIMESTAMPTZ;
BEGIN
  IF value IS NULL
    OR value !~ '^\d{4}-\d{2}-\d{2}T.+([zZ]|[+-]\d{2}:\d{2})$' THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    parsed_timestamp := value::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END;
  RETURN parsed_timestamp;
END;
$$;

CREATE FUNCTION public.progress_jobber_money(
  value JSONB,
  allow_negative BOOLEAN DEFAULT false
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  parsed NUMERIC;
BEGIN
  IF value IS NULL OR value = 'null'::JSONB THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(value) <> 'string'
    OR NOT (
      (value #>> '{}') ~ (
        CASE
          WHEN allow_negative THEN '^-?(0|[1-9]\d*)\.\d{2}$'
          ELSE '^(0|[1-9]\d*)\.\d{2}$'
        END
      )
    ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;
  BEGIN
    parsed := (value #>> '{}')::NUMERIC;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END;
  IF abs(parsed) > 999999999999.99 THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;
  RETURN parsed;
END;
$$;

CREATE FUNCTION public.progress_append_service_event(
  requested_actor UUID,
  owning_series_id UUID,
  requested_event_type TEXT,
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
  event_id UUID;
BEGIN
  IF requested_actor IS NULL
    OR owning_series_id IS NULL
    OR NULLIF(btrim(requested_event_type), '') IS NULL
    OR requested_correlation_key IS NULL
    OR requested_fingerprint !~ '^[0-9A-Fa-f]{64}$'
    OR jsonb_typeof(COALESCE(requested_safe_field_changes, '{}'::JSONB)) <> 'object'
    OR jsonb_typeof(COALESCE(requested_result_refs, '{}'::JSONB)) <> 'object' THEN
    RAISE EXCEPTION 'PROGRESS_EVENT_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.progress_invoice_events (
    series_id,
    actor_id,
    event_type,
    source,
    safe_field_changes,
    command_name,
    correlation_key,
    request_fingerprint,
    result_refs
  ) VALUES (
    owning_series_id,
    requested_actor,
    requested_event_type,
    'jobber_sync',
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

CREATE FUNCTION public.progress_recalculate_series_read_model_as(
  owning_series_id UUID,
  requested_actor UUID
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  series_row public.progress_invoice_series%ROWTYPE;
  approved_variations NUMERIC := 0;
  approved_credits NUMERIC := 0;
  claimed_ex NUMERIC := 0;
  claimed_gst NUMERIC := 0;
  claimed_inc NUMERIC := 0;
  adjusted_ex NUMERIC;
  adjusted_gst NUMERIC;
  adjusted_inc NUMERIC;
  receipts NUMERIC := 0;
  allocatable_receipts NUMERIC := 0;
  allocated_to_claim NUMERIC;
  claim_remaining NUMERIC;
  overdue_amount NUMERIC := 0;
  outstanding NUMERIC;
  credit NUMERIC;
  payment_state TEXT;
  claim_row RECORD;
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

  SELECT COALESCE(SUM(revision.effective_receipt_amount), 0)
  INTO receipts
  FROM public.progress_payments AS payment
  JOIN public.progress_payment_revisions AS revision
    ON revision.id = payment.current_revision_id
   AND revision.payment_id = payment.id
  WHERE payment.series_id = owning_series_id
    AND revision.status = 'active'
    AND (
      payment.source = 'jobber'
      OR NOT EXISTS (
        SELECT 1
        FROM public.progress_payments AS matched_jobber
        WHERE matched_jobber.matched_manual_payment_id = payment.id
      )
    );

  adjusted_ex := series_row.base_contract_ex_gst + approved_variations - approved_credits;
  adjusted_gst := round(adjusted_ex * series_row.gst_rate, 2);
  adjusted_inc := adjusted_ex + adjusted_gst;
  outstanding := GREATEST(claimed_inc - receipts, 0);
  credit := GREATEST(receipts - claimed_inc, 0);
  allocatable_receipts := GREATEST(receipts, 0);

  FOR claim_row IN
    SELECT
      revision.issue_date,
      revision.due_date,
      claim.sequence AS sequence_number,
      revision.current_claim_inc_gst AS claim_face
    FROM public.progress_claims AS claim
    JOIN public.progress_claim_revisions AS revision
      ON revision.id = claim.current_revision_id
     AND revision.claim_id = claim.id
    WHERE claim.series_id = owning_series_id
      AND claim.status = 'issued'
    ORDER BY revision.issue_date, sequence_number
  LOOP
    allocated_to_claim := LEAST(allocatable_receipts, claim_row.claim_face);
    claim_remaining := claim_row.claim_face - allocated_to_claim;
    allocatable_receipts := GREATEST(allocatable_receipts - allocated_to_claim, 0);
    IF claim_row.due_date < (pg_catalog.clock_timestamp() AT TIME ZONE 'Australia/Sydney')::DATE THEN
      overdue_amount := overdue_amount + claim_remaining;
    END IF;
  END LOOP;

  IF adjusted_ex < claimed_ex OR adjusted_gst < claimed_gst OR adjusted_inc < claimed_inc THEN
    RAISE EXCEPTION 'PROGRESS_RECONCILIATION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF adjusted_ex < 0
    OR adjusted_gst < 0
    OR adjusted_inc < 0
    OR claimed_ex < 0
    OR claimed_gst < 0
    OR claimed_inc < 0
    OR adjusted_ex > 999999999999.99
    OR adjusted_gst > 999999999999.99
    OR adjusted_inc > 999999999999.99
    OR claimed_ex > 999999999999.99
    OR claimed_gst > 999999999999.99
    OR claimed_inc > 999999999999.99
    OR abs(receipts) > 999999999999.99
    OR outstanding > 999999999999.99
    OR credit > 999999999999.99
    OR adjusted_ex - claimed_ex > 999999999999.99
    OR adjusted_gst - claimed_gst > 999999999999.99
    OR adjusted_inc - claimed_inc > 999999999999.99 THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  payment_state := CASE
    WHEN credit > 0 THEN 'credit_balance'
    WHEN claimed_inc > 0 AND outstanding = 0 THEN 'paid'
    WHEN overdue_amount > 0 THEN 'overdue'
    WHEN receipts > 0 AND outstanding > 0 THEN 'part_paid'
    ELSE 'unpaid'
  END;

  UPDATE public.progress_invoice_series AS series
  SET current_adjusted_contract_ex_gst = adjusted_ex,
      current_adjusted_contract_gst = adjusted_gst,
      current_adjusted_contract_inc_gst = adjusted_inc,
      current_claimed_ex_gst = claimed_ex,
      current_claimed_gst = claimed_gst,
      current_claimed_inc_gst = claimed_inc,
      current_actual_receipts = receipts,
      current_outstanding_receivable = outstanding,
      current_credit_balance = credit,
      current_unclaimed_ex_gst = adjusted_ex - claimed_ex,
      current_unclaimed_gst = adjusted_gst - claimed_gst,
      current_unclaimed_inc_gst = adjusted_inc - claimed_inc,
      current_cumulative_percentage = CASE
        WHEN adjusted_inc = 0 THEN 0
        ELSE round((claimed_inc / adjusted_inc) * 100, 6)
      END,
      current_payment_state = payment_state,
      updated_by = requested_actor
  WHERE series.id = owning_series_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.progress_recalculate_series_read_model(owning_series_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM public.progress_recalculate_series_read_model_as(
    owning_series_id,
    public.progress_require_actor()
  );
END;
$$;

CREATE FUNCTION public.progress_validate_jobber_observation(observation JSONB)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  required_key TEXT;
  selected_job_id TEXT;
  selected_property_id TEXT;
  expected_status TEXT;
  expected_client_email TEXT;
  expected_client_phone TEXT;
  phone_count INT;
  primary_phone_count INT;
  phone_row JSONB;
  site_row JSONB;
  warning_row JSONB;
  payment_row JSONB;
  payment_count INT;
  distinct_payment_count INT;
  payment_raw_signed NUMERIC;
  payment_absolute NUMERIC;
  payment_effective NUMERIC;
  expected_payment_direction TEXT;
  expected_payment_effective NUMERIC;
BEGIN
  PERFORM public.progress_assert_jsonb_keys(observation, ARRAY[
    'account_id', 'invoice_id', 'invoice_number', 'raw_status', 'normalized_status',
    'jobber_web_uri', 'invoice_subtotal', 'invoice_tax_amount', 'invoice_total',
    'invoice_balance', 'invoice_payments_total', 'invoice_issued_date',
    'invoice_due_date', 'invoice_received_date', 'external_created_at',
    'external_updated_at', 'client_id', 'client_name', 'client_company_name',
    'client_email', 'client_phone', 'client_email_candidates',
    'client_phone_candidates', 'billing_address', 'job_ids', 'property_ids',
    'site_address_candidates', 'selected_job_id', 'selected_property_id',
    'effective_graphql_version', 'payment_eligibility_policy_version',
    'fetched_at', 'response_fingerprint', 'warnings', 'payments'
  ]);

  FOREACH required_key IN ARRAY ARRAY[
    'account_id', 'invoice_id', 'invoice_number', 'raw_status', 'normalized_status',
    'jobber_web_uri', 'invoice_subtotal', 'invoice_tax_amount', 'invoice_total',
    'invoice_balance', 'invoice_payments_total', 'invoice_issued_date',
    'invoice_due_date', 'invoice_received_date', 'external_created_at',
    'external_updated_at', 'client_id', 'client_name', 'client_company_name',
    'client_email', 'client_phone',
    'client_email_candidates', 'client_phone_candidates', 'job_ids',
    'property_ids', 'site_address_candidates', 'billing_address',
    'selected_job_id', 'selected_property_id', 'effective_graphql_version',
    'payment_eligibility_policy_version', 'fetched_at', 'response_fingerprint',
    'warnings', 'payments'
  ] LOOP
    IF NOT (observation ? required_key) THEN
      RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF pg_column_size(observation) > 8388608
    OR jsonb_typeof(observation -> 'account_id') <> 'string'
    OR length(btrim(observation ->> 'account_id')) NOT BETWEEN 1 AND 512
    OR jsonb_typeof(observation -> 'invoice_id') <> 'string'
    OR length(btrim(observation ->> 'invoice_id')) NOT BETWEEN 1 AND 512
    OR jsonb_typeof(observation -> 'invoice_number') <> 'string'
    OR length(btrim(observation ->> 'invoice_number')) NOT BETWEEN 1 AND 120
    OR jsonb_typeof(observation -> 'raw_status') <> 'string'
    OR length(btrim(observation ->> 'raw_status')) NOT BETWEEN 1 AND 120
    OR jsonb_typeof(observation -> 'normalized_status') <> 'string'
    OR jsonb_typeof(observation -> 'jobber_web_uri') <> 'string'
    OR length(btrim(observation ->> 'jobber_web_uri')) NOT BETWEEN 1 AND 2048
    OR jsonb_typeof(observation -> 'external_created_at') <> 'string'
    OR jsonb_typeof(observation -> 'external_updated_at') <> 'string'
    OR jsonb_typeof(observation -> 'effective_graphql_version') <> 'string'
    OR length(btrim(observation ->> 'effective_graphql_version')) NOT BETWEEN 1 AND 40
    OR jsonb_typeof(observation -> 'payment_eligibility_policy_version') <> 'string'
    OR length(btrim(observation ->> 'payment_eligibility_policy_version')) NOT BETWEEN 1 AND 80
    OR jsonb_typeof(observation -> 'fetched_at') <> 'string'
    OR jsonb_typeof(observation -> 'response_fingerprint') <> 'string'
    OR observation ->> 'response_fingerprint' !~ '^[0-9a-f]{64}$'
    OR NOT (
      jsonb_typeof(observation -> 'client_id') = 'null'
      OR jsonb_typeof(observation -> 'client_id') = 'string'
        AND length(btrim(observation ->> 'client_id')) BETWEEN 1 AND 512
    )
    OR NOT (
      jsonb_typeof(observation -> 'client_name') = 'null'
      OR jsonb_typeof(observation -> 'client_name') = 'string'
        AND length(btrim(observation ->> 'client_name')) BETWEEN 1 AND 160
    )
    OR NOT (
      jsonb_typeof(observation -> 'client_company_name') = 'null'
      OR jsonb_typeof(observation -> 'client_company_name') = 'string'
        AND length(btrim(observation ->> 'client_company_name')) BETWEEN 1 AND 160
    )
    OR NOT (
      jsonb_typeof(observation -> 'client_email') = 'null'
      OR jsonb_typeof(observation -> 'client_email') = 'string'
        AND length(btrim(observation ->> 'client_email')) BETWEEN 1 AND 254
    )
    OR NOT (
      jsonb_typeof(observation -> 'client_phone') = 'null'
      OR jsonb_typeof(observation -> 'client_phone') = 'string'
        AND length(btrim(observation ->> 'client_phone')) BETWEEN 1 AND 40
    )
    OR NOT (
      jsonb_typeof(observation -> 'billing_address') = 'null'
      OR jsonb_typeof(observation -> 'billing_address') = 'string'
        AND length(btrim(observation ->> 'billing_address')) BETWEEN 1 AND 2048
    )
    OR NOT (
      jsonb_typeof(observation -> 'selected_job_id') = 'null'
      OR jsonb_typeof(observation -> 'selected_job_id') = 'string'
        AND length(btrim(observation ->> 'selected_job_id')) BETWEEN 1 AND 512
    )
    OR NOT (
      jsonb_typeof(observation -> 'selected_property_id') = 'null'
      OR jsonb_typeof(observation -> 'selected_property_id') = 'string'
        AND length(btrim(observation ->> 'selected_property_id')) BETWEEN 1 AND 512
    ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  expected_status := CASE observation ->> 'raw_status'
    WHEN 'draft' THEN 'draft'
    WHEN 'awaiting_payment' THEN 'awaiting_payment'
    WHEN 'sent_not_due' THEN 'awaiting_payment'
    WHEN 'paid' THEN 'paid'
    WHEN 'past_due' THEN 'past_due'
    ELSE 'unknown'
  END;
  IF observation ->> 'normalized_status' <> expected_status
    OR observation ->> 'normalized_status' = 'part_paid' THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
      jsonb_typeof(observation -> 'invoice_issued_date') = 'null'
      OR jsonb_typeof(observation -> 'invoice_issued_date') = 'string'
    )
    OR NOT (
      jsonb_typeof(observation -> 'invoice_due_date') = 'null'
      OR jsonb_typeof(observation -> 'invoice_due_date') = 'string'
    )
    OR NOT (
      jsonb_typeof(observation -> 'invoice_received_date') = 'null'
      OR jsonb_typeof(observation -> 'invoice_received_date') = 'string'
    ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.progress_jobber_timestamp(observation ->> 'external_created_at');
  PERFORM public.progress_jobber_timestamp(observation ->> 'external_updated_at');
  PERFORM public.progress_jobber_timestamp(observation ->> 'fetched_at');
  IF observation -> 'invoice_issued_date' <> 'null'::JSONB THEN
    PERFORM public.progress_jobber_sydney_date(observation ->> 'invoice_issued_date');
  END IF;
  IF observation -> 'invoice_due_date' <> 'null'::JSONB THEN
    PERFORM public.progress_jobber_sydney_date(observation ->> 'invoice_due_date');
  END IF;
  IF observation -> 'invoice_received_date' <> 'null'::JSONB THEN
    PERFORM public.progress_jobber_sydney_date(observation ->> 'invoice_received_date');
  END IF;

  PERFORM public.progress_jobber_money(observation -> 'invoice_subtotal');
  PERFORM public.progress_jobber_money(observation -> 'invoice_tax_amount');
  PERFORM public.progress_jobber_money(observation -> 'invoice_total');
  PERFORM public.progress_jobber_money(observation -> 'invoice_balance');
  PERFORM public.progress_jobber_money(observation -> 'invoice_payments_total');

  IF jsonb_typeof(observation -> 'client_email_candidates') <> 'array'
    OR jsonb_typeof(observation -> 'client_phone_candidates') <> 'array'
    OR jsonb_typeof(observation -> 'job_ids') <> 'array'
    OR jsonb_typeof(observation -> 'property_ids') <> 'array'
    OR jsonb_typeof(observation -> 'site_address_candidates') <> 'array'
    OR jsonb_typeof(observation -> 'warnings') <> 'array'
    OR jsonb_typeof(observation -> 'payments') <> 'array' THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_array_length(observation -> 'client_email_candidates') > 20
    OR pg_column_size(observation -> 'client_email_candidates') > 8192
    OR jsonb_array_length(observation -> 'client_phone_candidates') > 20
    OR pg_column_size(observation -> 'client_phone_candidates') > 8192
    OR jsonb_array_length(observation -> 'job_ids') > 100
    OR pg_column_size(observation -> 'job_ids') > 65536
    OR jsonb_array_length(observation -> 'property_ids') > 100
    OR pg_column_size(observation -> 'property_ids') > 65536
    OR jsonb_array_length(observation -> 'site_address_candidates') > 100
    OR pg_column_size(observation -> 'site_address_candidates') > 262144
    OR jsonb_array_length(observation -> 'warnings') > 200
    OR pg_column_size(observation -> 'warnings') > 262144
    OR jsonb_array_length(observation -> 'payments') > 1000
    OR pg_column_size(observation -> 'payments') > 7340032 THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(observation -> 'client_email_candidates') AS item(value)
    WHERE jsonb_typeof(value) <> 'string'
      OR length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 254
  ) OR (
    SELECT count(*) <> count(DISTINCT lower(value #>> '{}'))
    FROM jsonb_array_elements(observation -> 'client_email_candidates') AS item(value)
  ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  SELECT CASE WHEN count(*) = 1 THEN max(value #>> '{}') END
  INTO expected_client_email
  FROM jsonb_array_elements(observation -> 'client_email_candidates') AS item(value);
  IF NULLIF(btrim(COALESCE(observation ->> 'client_email', '')), '')
      IS DISTINCT FROM expected_client_email THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  FOR phone_row IN
    SELECT value
    FROM jsonb_array_elements(observation -> 'client_phone_candidates') AS item(value)
  LOOP
    PERFORM public.progress_assert_jsonb_keys(phone_row, ARRAY['number', 'primary']);
    IF NOT (phone_row ?& ARRAY['number', 'primary'])
      OR jsonb_typeof(phone_row -> 'number') <> 'string'
      OR length(btrim(phone_row ->> 'number')) NOT BETWEEN 1 AND 40
      OR jsonb_typeof(phone_row -> 'primary') <> 'boolean' THEN
      RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF (
    SELECT count(*) <> count(DISTINCT value ->> 'number')
    FROM jsonb_array_elements(observation -> 'client_phone_candidates') AS item(value)
  ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;
  SELECT
    count(*)::INT,
    count(*) FILTER (WHERE (value ->> 'primary')::BOOLEAN)::INT
  INTO phone_count, primary_phone_count
  FROM jsonb_array_elements(observation -> 'client_phone_candidates') AS item(value);
  IF primary_phone_count = 1 THEN
    SELECT value ->> 'number'
    INTO expected_client_phone
    FROM jsonb_array_elements(observation -> 'client_phone_candidates') AS item(value)
    WHERE (value ->> 'primary')::BOOLEAN
    LIMIT 1;
  ELSIF primary_phone_count = 0 AND phone_count = 1 THEN
    SELECT value ->> 'number'
    INTO expected_client_phone
    FROM jsonb_array_elements(observation -> 'client_phone_candidates') AS item(value)
    LIMIT 1;
  ELSE
    expected_client_phone := NULL;
  END IF;
  IF NULLIF(btrim(COALESCE(observation ->> 'client_phone', '')), '')
      IS DISTINCT FROM expected_client_phone THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(observation -> 'job_ids') AS item(value)
    WHERE jsonb_typeof(value) <> 'string'
      OR length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 512
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(observation -> 'property_ids') AS item(value)
    WHERE jsonb_typeof(value) <> 'string'
      OR length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 512
  ) OR (
    SELECT count(*) <> count(DISTINCT value #>> '{}')
    FROM jsonb_array_elements(observation -> 'job_ids') AS item(value)
  ) OR (
    SELECT count(*) <> count(DISTINCT value #>> '{}')
    FROM jsonb_array_elements(observation -> 'property_ids') AS item(value)
  ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  FOR site_row IN
    SELECT value
    FROM jsonb_array_elements(observation -> 'site_address_candidates') AS item(value)
  LOOP
    PERFORM public.progress_assert_jsonb_keys(site_row, ARRAY['property_id', 'address']);
    IF NOT (site_row ?& ARRAY['property_id', 'address'])
      OR jsonb_typeof(site_row -> 'property_id') <> 'string'
      OR length(btrim(site_row ->> 'property_id')) NOT BETWEEN 1 AND 512
      OR NOT (
        jsonb_typeof(site_row -> 'address') = 'null'
        OR jsonb_typeof(site_row -> 'address') = 'string'
          AND length(btrim(site_row ->> 'address')) BETWEEN 1 AND 2048
      ) THEN
      RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF (
      SELECT count(*) <> count(DISTINCT value ->> 'property_id')
      FROM jsonb_array_elements(observation -> 'site_address_candidates') AS item(value)
    )
    OR jsonb_array_length(observation -> 'site_address_candidates')
      <> jsonb_array_length(observation -> 'property_ids')
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(observation -> 'site_address_candidates') AS item(value)
      WHERE NOT (
        observation -> 'property_ids' @> jsonb_build_array(value ->> 'property_id')
      )
    ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  selected_job_id := NULLIF(btrim(COALESCE(observation ->> 'selected_job_id', '')), '');
  selected_property_id := NULLIF(btrim(COALESCE(observation ->> 'selected_property_id', '')), '');
  IF jsonb_array_length(observation -> 'job_ids') = 0 AND selected_job_id IS NOT NULL
    OR jsonb_array_length(observation -> 'job_ids') > 0 AND selected_job_id IS NULL
    OR selected_job_id IS NOT NULL
      AND NOT (observation -> 'job_ids' @> jsonb_build_array(selected_job_id))
    OR jsonb_array_length(observation -> 'property_ids') = 0 AND selected_property_id IS NOT NULL
    OR jsonb_array_length(observation -> 'property_ids') > 0 AND selected_property_id IS NULL
    OR selected_property_id IS NOT NULL
      AND NOT (observation -> 'property_ids' @> jsonb_build_array(selected_property_id)) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  FOR warning_row IN
    SELECT value FROM jsonb_array_elements(observation -> 'warnings') AS item(value)
  LOOP
    PERFORM public.progress_assert_jsonb_keys(warning_row, ARRAY['code', 'payment_id']);
    IF NOT (warning_row ? 'code')
      OR jsonb_typeof(warning_row -> 'code') <> 'string'
      OR warning_row ->> 'code' NOT IN (
        'unknown_invoice_status',
        'no_invoice_jobs',
        'no_invoice_properties',
        'ambiguous_payment_adjustment',
        'unknown_payment_adjustment_type',
        'missing_jobber_payment_status',
        'unknown_payment_status',
        'ambiguous_payment_evidence'
      )
      OR warning_row ? 'payment_id' AND (
        jsonb_typeof(warning_row -> 'payment_id') <> 'string'
        OR length(btrim(warning_row ->> 'payment_id')) NOT BETWEEN 1 AND 512
      ) THEN
      RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  FOR payment_row IN
    SELECT value FROM jsonb_array_elements(observation -> 'payments') AS item(value)
  LOOP
    PERFORM public.progress_assert_jsonb_keys(payment_row, ARRAY[
      'jobber_payment_id', 'source', 'raw_adjustment_type', 'raw_signed_amount',
      'absolute_amount', 'direction', 'effective_amount', 'entry_date', 'method',
      'reference', 'external_status', 'external_updated_at', 'treatment'
    ]);
    IF NOT (payment_row ?& ARRAY[
        'jobber_payment_id', 'source', 'raw_adjustment_type', 'raw_signed_amount',
        'absolute_amount', 'direction', 'effective_amount', 'entry_date', 'method',
        'reference', 'external_status', 'external_updated_at', 'treatment'
      ])
      OR jsonb_typeof(payment_row -> 'jobber_payment_id') <> 'string'
      OR jsonb_typeof(payment_row -> 'source') <> 'string'
      OR jsonb_typeof(payment_row -> 'raw_adjustment_type') <> 'string'
      OR NOT (
        jsonb_typeof(payment_row -> 'raw_signed_amount') = 'null'
        OR jsonb_typeof(payment_row -> 'raw_signed_amount') = 'string'
      )
      OR jsonb_typeof(payment_row -> 'absolute_amount') <> 'string'
      OR jsonb_typeof(payment_row -> 'direction') <> 'string'
      OR jsonb_typeof(payment_row -> 'effective_amount') <> 'string'
      OR jsonb_typeof(payment_row -> 'entry_date') <> 'string'
      OR NOT (
        jsonb_typeof(payment_row -> 'method') = 'null'
        OR jsonb_typeof(payment_row -> 'method') = 'string'
          AND length(btrim(payment_row ->> 'method')) BETWEEN 1 AND 120
      )
      OR NOT (
        jsonb_typeof(payment_row -> 'reference') = 'null'
        OR jsonb_typeof(payment_row -> 'reference') = 'string'
          AND length(btrim(payment_row ->> 'reference')) BETWEEN 1 AND 240
      )
      OR NOT (
        jsonb_typeof(payment_row -> 'external_status') = 'null'
        OR jsonb_typeof(payment_row -> 'external_status') = 'string'
          AND length(btrim(payment_row ->> 'external_status')) BETWEEN 1 AND 120
      )
      OR NOT (
        jsonb_typeof(payment_row -> 'external_updated_at') = 'null'
        OR jsonb_typeof(payment_row -> 'external_updated_at') = 'string'
      )
      OR jsonb_typeof(payment_row -> 'treatment') <> 'string'
      OR payment_row ->> 'source' NOT IN ('payment_record', 'nested_refund')
      OR payment_row ->> 'direction' NOT IN (
        'receipt', 'refund', 'reversal', 'ambiguous', 'excluded'
      )
      OR payment_row ->> 'treatment' NOT IN ('active', 'unconfirmed')
      OR length(btrim(COALESCE(payment_row ->> 'jobber_payment_id', ''))) NOT BETWEEN 1 AND 512
      OR length(btrim(COALESCE(payment_row ->> 'raw_adjustment_type', ''))) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
    END IF;
    payment_raw_signed := public.progress_jobber_money(
      payment_row -> 'raw_signed_amount',
      true
    );
    payment_absolute := public.progress_jobber_money(payment_row -> 'absolute_amount');
    payment_effective := public.progress_jobber_money(
      payment_row -> 'effective_amount',
      true
    );
    expected_payment_direction := CASE payment_row ->> 'raw_adjustment_type'
      WHEN 'PAYMENT' THEN 'receipt'
      WHEN 'DEPOSIT' THEN 'receipt'
      WHEN 'REFUND' THEN 'refund'
      WHEN 'FAILED_ACH_PAYMENT' THEN 'reversal'
      WHEN 'INVOICE' THEN 'excluded'
      WHEN 'INITIAL_BALANCE' THEN 'excluded'
      WHEN 'BAD_DEBT' THEN 'excluded'
      WHEN 'VOIDED' THEN 'excluded'
      ELSE 'ambiguous'
    END;
    expected_payment_effective := CASE
      WHEN payment_row ->> 'treatment' = 'unconfirmed' THEN 0
      WHEN expected_payment_direction = 'receipt' THEN payment_absolute
      WHEN expected_payment_direction IN ('refund', 'reversal') THEN -payment_absolute
      ELSE 0
    END;
    IF payment_row ->> 'direction' <> expected_payment_direction
      OR payment_effective <> expected_payment_effective
      OR payment_raw_signed IS NOT NULL
        AND abs(payment_raw_signed) <> payment_absolute
      OR expected_payment_direction IN ('ambiguous', 'excluded')
        AND payment_row ->> 'treatment' <> 'unconfirmed' THEN
      RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.progress_jobber_sydney_date(payment_row ->> 'entry_date');
    IF payment_row -> 'external_updated_at' <> 'null'::JSONB THEN
      PERFORM public.progress_jobber_timestamp(payment_row ->> 'external_updated_at');
    END IF;
  END LOOP;

  payment_count := jsonb_array_length(observation -> 'payments');
  SELECT count(DISTINCT value ->> 'jobber_payment_id')::INT
  INTO distinct_payment_count
  FROM jsonb_array_elements(observation -> 'payments') AS item(value);
  IF distinct_payment_count <> payment_count THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE FUNCTION public.progress_insert_jobber_snapshot(
  owning_series_id UUID,
  requested_actor UUID,
  observation JSONB,
  requested_original_number TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  snapshot_id UUID;
  selected_property_address TEXT;
BEGIN
  PERFORM public.progress_validate_jobber_observation(observation);

  SELECT candidate ->> 'address'
  INTO selected_property_address
  FROM jsonb_array_elements(observation -> 'site_address_candidates') AS item(candidate)
  WHERE candidate ->> 'property_id' = observation ->> 'selected_property_id'
  LIMIT 1;

  INSERT INTO public.progress_jobber_invoice_snapshots (
    series_id,
    jobber_account_id,
    jobber_invoice_id,
    selected_jobber_job_id,
    jobber_client_id,
    selected_jobber_property_id,
    original_invoice_number,
    observed_invoice_number,
    raw_status,
    normalized_status,
    jobber_web_uri,
    invoice_subtotal,
    invoice_tax,
    invoice_total,
    invoice_balance,
    invoice_payments_total,
    issued_date,
    due_date,
    received_date,
    external_created_at,
    external_updated_at,
    client_name,
    client_company_name,
    client_email,
    client_phone,
    client_email_candidates,
    client_phone_candidates,
    billing_address,
    property_address,
    jobber_job_ids,
    jobber_property_ids,
    site_candidates,
    effective_graphql_version,
    payment_eligibility_policy_version,
    fetched_at,
    response_fingerprint,
    normalization_warnings,
    created_by
  ) VALUES (
    owning_series_id,
    btrim(observation ->> 'account_id'),
    btrim(observation ->> 'invoice_id'),
    NULLIF(btrim(COALESCE(observation ->> 'selected_job_id', '')), ''),
    NULLIF(btrim(COALESCE(observation ->> 'client_id', '')), ''),
    NULLIF(btrim(COALESCE(observation ->> 'selected_property_id', '')), ''),
    requested_original_number,
    btrim(observation ->> 'invoice_number'),
    btrim(observation ->> 'raw_status'),
    observation ->> 'normalized_status',
    btrim(observation ->> 'jobber_web_uri'),
    public.progress_jobber_money(observation -> 'invoice_subtotal'),
    public.progress_jobber_money(observation -> 'invoice_tax_amount'),
    public.progress_jobber_money(observation -> 'invoice_total'),
    public.progress_jobber_money(observation -> 'invoice_balance'),
    public.progress_jobber_money(observation -> 'invoice_payments_total'),
    CASE WHEN observation -> 'invoice_issued_date' = 'null'::JSONB THEN NULL
      ELSE public.progress_jobber_sydney_date(observation ->> 'invoice_issued_date') END,
    CASE WHEN observation -> 'invoice_due_date' = 'null'::JSONB THEN NULL
      ELSE public.progress_jobber_sydney_date(observation ->> 'invoice_due_date') END,
    CASE WHEN observation -> 'invoice_received_date' = 'null'::JSONB THEN NULL
      ELSE public.progress_jobber_sydney_date(observation ->> 'invoice_received_date') END,
    public.progress_jobber_timestamp(observation ->> 'external_created_at'),
    public.progress_jobber_timestamp(observation ->> 'external_updated_at'),
    NULLIF(btrim(COALESCE(observation ->> 'client_name', '')), ''),
    NULLIF(btrim(COALESCE(observation ->> 'client_company_name', '')), ''),
    NULLIF(btrim(COALESCE(observation ->> 'client_email', '')), ''),
    NULLIF(btrim(COALESCE(observation ->> 'client_phone', '')), ''),
    observation -> 'client_email_candidates',
    observation -> 'client_phone_candidates',
    NULLIF(btrim(COALESCE(observation ->> 'billing_address', '')), ''),
    NULLIF(btrim(COALESCE(selected_property_address, '')), ''),
    observation -> 'job_ids',
    observation -> 'property_ids',
    observation -> 'site_address_candidates',
    btrim(observation ->> 'effective_graphql_version'),
    btrim(observation ->> 'payment_eligibility_policy_version'),
    public.progress_jobber_timestamp(observation ->> 'fetched_at'),
    observation ->> 'response_fingerprint',
    observation -> 'warnings',
    requested_actor
  )
  RETURNING id INTO snapshot_id;

  RETURN snapshot_id;
END;
$$;

CREATE FUNCTION public.progress_apply_jobber_payments(
  owning_series_id UUID,
  requested_actor UUID,
  observation JSONB
)
RETURNS TABLE (
  inserted_payments INT,
  revised_payments INT,
  unconfirmed_payments INT
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  payment_payload JSONB;
  payment_row public.progress_payments%ROWTYPE;
  current_revision public.progress_payment_revisions%ROWTYPE;
  next_revision public.progress_payment_revisions%ROWTYPE;
  requested_status TEXT;
  requested_sync_state TEXT;
  requested_raw_signed NUMERIC;
  requested_absolute NUMERIC;
  requested_effective NUMERIC;
  requested_entry_date DATE;
  requested_external_updated_at TIMESTAMPTZ;
BEGIN
  inserted_payments := 0;
  revised_payments := 0;
  unconfirmed_payments := 0;

  PERFORM payment.id
  FROM public.progress_payments AS payment
  WHERE payment.series_id = owning_series_id
  ORDER BY payment.id
  FOR UPDATE;

  FOR payment_payload IN
    SELECT value
    FROM jsonb_array_elements(observation -> 'payments') AS item(value)
    ORDER BY value ->> 'jobber_payment_id'
  LOOP
    requested_raw_signed := public.progress_jobber_money(
      payment_payload -> 'raw_signed_amount',
      true
    );
    requested_absolute := public.progress_jobber_money(payment_payload -> 'absolute_amount');
    requested_effective := public.progress_jobber_money(
      payment_payload -> 'effective_amount',
      true
    );
    requested_entry_date := public.progress_jobber_sydney_date(
      payment_payload ->> 'entry_date'
    );
    requested_external_updated_at := CASE
      WHEN payment_payload -> 'external_updated_at' = 'null'::JSONB THEN NULL
      ELSE public.progress_jobber_timestamp(payment_payload ->> 'external_updated_at')
    END;
    requested_status := CASE payment_payload ->> 'treatment'
      WHEN 'active' THEN 'active'
      ELSE 'unconfirmed'
    END;
    requested_sync_state := CASE payment_payload ->> 'direction'
      WHEN 'refund' THEN 'refunded'
      WHEN 'reversal' THEN 'reversed'
      WHEN 'ambiguous' THEN 'ambiguous'
      WHEN 'excluded' THEN 'ambiguous'
      ELSE 'observed'
    END;

    SELECT payment.* INTO payment_row
    FROM public.progress_payments AS payment
    WHERE payment.series_id = owning_series_id
      AND payment.source = 'jobber'
      AND payment.jobber_payment_id = payment_payload ->> 'jobber_payment_id';

    IF NOT FOUND THEN
      INSERT INTO public.progress_payments (
        series_id,
        source,
        jobber_payment_id,
        created_by,
        updated_by
      ) VALUES (
        owning_series_id,
        'jobber',
        payment_payload ->> 'jobber_payment_id',
        requested_actor,
        requested_actor
      )
      RETURNING * INTO payment_row;

      INSERT INTO public.progress_payment_revisions (
        payment_id,
        revision_number,
        received_date,
        observed_amount,
        effective_receipt_amount,
        payment_method,
        reference,
        external_status,
        external_updated_at,
        sync_state,
        status,
        predecessor_revision_id,
        source_observed_at,
        created_by,
        jobber_source,
        raw_adjustment_type,
        raw_signed_amount,
        direction,
        payment_eligibility_treatment
      ) VALUES (
        payment_row.id,
        1,
        requested_entry_date,
        requested_absolute,
        requested_effective,
        NULLIF(btrim(COALESCE(payment_payload ->> 'method', '')), ''),
        NULLIF(btrim(COALESCE(payment_payload ->> 'reference', '')), ''),
        NULLIF(btrim(COALESCE(payment_payload ->> 'external_status', '')), ''),
        requested_external_updated_at,
        requested_sync_state,
        requested_status,
        NULL,
        public.progress_jobber_timestamp(observation ->> 'fetched_at'),
        requested_actor,
        payment_payload ->> 'source',
        payment_payload ->> 'raw_adjustment_type',
        requested_raw_signed,
        payment_payload ->> 'direction',
        payment_payload ->> 'treatment'
      )
      RETURNING * INTO next_revision;

      UPDATE public.progress_payments AS payment
      SET current_revision_id = next_revision.id,
          updated_by = requested_actor
      WHERE payment.id = payment_row.id;

      inserted_payments := inserted_payments + 1;
      IF requested_status = 'unconfirmed' THEN
        unconfirmed_payments := unconfirmed_payments + 1;
      END IF;
      CONTINUE;
    END IF;

    SELECT revision.* INTO STRICT current_revision
    FROM public.progress_payment_revisions AS revision
    WHERE revision.id = payment_row.current_revision_id
      AND revision.payment_id = payment_row.id;

    IF ROW(
      current_revision.received_date,
      current_revision.observed_amount,
      current_revision.effective_receipt_amount,
      current_revision.payment_method,
      current_revision.reference,
      current_revision.external_status,
      current_revision.external_updated_at,
      current_revision.status,
      current_revision.jobber_source,
      current_revision.raw_adjustment_type,
      current_revision.raw_signed_amount,
      current_revision.direction,
      current_revision.payment_eligibility_treatment
    ) IS NOT DISTINCT FROM ROW(
      requested_entry_date,
      requested_absolute,
      requested_effective,
      NULLIF(btrim(COALESCE(payment_payload ->> 'method', '')), ''),
      NULLIF(btrim(COALESCE(payment_payload ->> 'reference', '')), ''),
      NULLIF(btrim(COALESCE(payment_payload ->> 'external_status', '')), ''),
      requested_external_updated_at,
      requested_status,
      payment_payload ->> 'source',
      payment_payload ->> 'raw_adjustment_type',
      requested_raw_signed,
      payment_payload ->> 'direction',
      payment_payload ->> 'treatment'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.progress_payment_revisions (
      payment_id,
      revision_number,
      received_date,
      observed_amount,
      effective_receipt_amount,
      payment_method,
      reference,
      external_status,
      external_updated_at,
      sync_state,
      status,
      predecessor_revision_id,
      source_observed_at,
      created_by,
      reason,
      jobber_source,
      raw_adjustment_type,
      raw_signed_amount,
      direction,
      payment_eligibility_treatment
    ) VALUES (
      payment_row.id,
      current_revision.revision_number + 1,
      requested_entry_date,
      requested_absolute,
      requested_effective,
      NULLIF(btrim(COALESCE(payment_payload ->> 'method', '')), ''),
      NULLIF(btrim(COALESCE(payment_payload ->> 'reference', '')), ''),
      NULLIF(btrim(COALESCE(payment_payload ->> 'external_status', '')), ''),
      requested_external_updated_at,
      CASE
        WHEN requested_sync_state = 'observed' THEN 'changed'
        ELSE requested_sync_state
      END,
      requested_status,
      current_revision.id,
      public.progress_jobber_timestamp(observation ->> 'fetched_at'),
      requested_actor,
      'Jobber payment observation changed',
      payment_payload ->> 'source',
      payment_payload ->> 'raw_adjustment_type',
      requested_raw_signed,
      payment_payload ->> 'direction',
      payment_payload ->> 'treatment'
    )
    RETURNING * INTO next_revision;

    UPDATE public.progress_payments AS payment
    SET current_revision_id = next_revision.id,
        version = payment.version + 1,
        updated_by = requested_actor
    WHERE payment.id = payment_row.id;

    revised_payments := revised_payments + 1;
    IF requested_status = 'unconfirmed' THEN
      unconfirmed_payments := unconfirmed_payments + 1;
    END IF;
  END LOOP;

  FOR payment_row IN
    SELECT payment.*
    FROM public.progress_payments AS payment
    WHERE payment.series_id = owning_series_id
      AND payment.source = 'jobber'
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(observation -> 'payments') AS item(value)
        WHERE value ->> 'jobber_payment_id' = payment.jobber_payment_id
      )
    ORDER BY payment.id
  LOOP
    SELECT revision.* INTO STRICT current_revision
    FROM public.progress_payment_revisions AS revision
    WHERE revision.id = payment_row.current_revision_id
      AND revision.payment_id = payment_row.id;

    IF current_revision.status = 'unconfirmed'
      AND current_revision.sync_state = 'disappeared' THEN
      CONTINUE;
    END IF;

    INSERT INTO public.progress_payment_revisions (
      payment_id,
      revision_number,
      received_date,
      observed_amount,
      effective_receipt_amount,
      payment_method,
      reference,
      external_status,
      external_updated_at,
      sync_state,
      status,
      predecessor_revision_id,
      source_observed_at,
      created_by,
      reason,
      jobber_source,
      raw_adjustment_type,
      raw_signed_amount,
      direction,
      payment_eligibility_treatment
    ) VALUES (
      payment_row.id,
      current_revision.revision_number + 1,
      current_revision.received_date,
      current_revision.observed_amount,
      0,
      current_revision.payment_method,
      current_revision.reference,
      current_revision.external_status,
      current_revision.external_updated_at,
      'disappeared',
      'unconfirmed',
      current_revision.id,
      public.progress_jobber_timestamp(observation ->> 'fetched_at'),
      requested_actor,
      'Jobber payment disappeared from the complete observation',
      current_revision.jobber_source,
      current_revision.raw_adjustment_type,
      current_revision.raw_signed_amount,
      current_revision.direction,
      'unconfirmed'
    )
    RETURNING * INTO next_revision;

    UPDATE public.progress_payments AS payment
    SET current_revision_id = next_revision.id,
        version = payment.version + 1,
        updated_by = requested_actor
    WHERE payment.id = payment_row.id;

    revised_payments := revised_payments + 1;
    unconfirmed_payments := unconfirmed_payments + 1;
  END LOOP;

  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.get_progress_invoice_jobber_context(payload JSONB)
RETURNS TABLE (
  series_id UUID,
  series_version INT,
  jobber_account_id TEXT,
  jobber_invoice_id TEXT,
  selected_jobber_job_id TEXT,
  selected_jobber_property_id TEXT,
  current_snapshot_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := auth.uid();
  requested_series_id UUID;
  series_row public.progress_invoice_series%ROWTYPE;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  PERFORM public.progress_assert_jsonb_keys(payload, ARRAY['series_id']);
  IF NOT (payload ? 'series_id')
    OR jsonb_typeof(payload -> 'series_id') <> 'string' THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  requested_series_id := public.progress_jobber_uuid(payload, 'series_id');

  SELECT series.* INTO series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = requested_series_id
    AND series.status <> 'void';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF series_row.jobber_account_id IS NULL
    OR series_row.jobber_invoice_id IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY SELECT
    series_row.id,
    series_row.version,
    series_row.jobber_account_id,
    series_row.jobber_invoice_id,
    series_row.selected_jobber_job_id,
    series_row.selected_jobber_property_id,
    series_row.current_jobber_snapshot_id;
END;
$$;

CREATE FUNCTION public.link_progress_jobber_invoice(payload JSONB)
RETURNS TABLE (
  series_id UUID,
  version INT,
  quote_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID;
  requested_series_id UUID;
  correlation_key UUID;
  fingerprint TEXT;
  prior_result JSONB;
  observation JSONB;
  series_row public.progress_invoice_series%ROWTYPE;
  was_unlinked BOOLEAN;
  same_identity BOOLEAN;
  selector_changed BOOLEAN;
  original_number TEXT;
  accepted_number TEXT;
  snapshot_id UUID;
  selected_site_address TEXT;
  sync_time TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM public.progress_assert_jsonb_keys(payload, ARRAY[
    'actor_id', 'series_id', 'expected_version', 'correlation_key',
    'request_fingerprint', 'observation'
  ]);
  IF NOT (payload ?& ARRAY[
      'actor_id', 'series_id', 'expected_version', 'correlation_key',
      'request_fingerprint', 'observation'
    ])
    OR jsonb_typeof(payload -> 'observation') <> 'object'
    OR payload ->> 'request_fingerprint' !~ '^[0-9A-Fa-f]{64}$' THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  actor := public.progress_require_service_actor(
    public.progress_jobber_uuid(payload, 'actor_id')
  );
  requested_series_id := public.progress_jobber_uuid(payload, 'series_id');
  PERFORM public.progress_jobber_positive_int(payload, 'expected_version');
  correlation_key := public.progress_jobber_uuid(payload, 'correlation_key');
  fingerprint := payload ->> 'request_fingerprint';
  observation := payload -> 'observation';
  PERFORM public.progress_validate_jobber_observation(observation);

  prior_result := public.progress_lock_idempotency(
    requested_series_id,
    'link_progress_jobber_invoice',
    correlation_key,
    fingerprint
  );
  IF prior_result IS NOT NULL THEN
    RETURN QUERY SELECT
      (prior_result ->> 'series_id')::UUID,
      (prior_result ->> 'version')::INT,
      (prior_result ->> 'quote_id')::UUID;
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

  SELECT series.* INTO series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = requested_series_id
    AND series.status <> 'void'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.progress_invoice_series AS existing_series
    WHERE existing_series.id <> series_row.id
      AND existing_series.status <> 'void'
      AND existing_series.jobber_account_id = btrim(observation ->> 'account_id')
      AND existing_series.jobber_invoice_id = btrim(observation ->> 'invoice_id')
  ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.progress_require_expected_version(payload, series_row.version);
  IF series_row.jobber_link_locked_at IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.progress_claims AS claim
      WHERE claim.series_id = series_row.id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_LINK_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  was_unlinked := series_row.jobber_account_id IS NULL;
  same_identity := COALESCE(
    series_row.jobber_account_id = btrim(observation ->> 'account_id')
      AND series_row.jobber_invoice_id = btrim(observation ->> 'invoice_id'),
    false
  );
  selector_changed :=
    series_row.selected_jobber_job_id IS DISTINCT FROM NULLIF(
      btrim(COALESCE(observation ->> 'selected_job_id', '')),
      ''
    )
    OR series_row.selected_jobber_property_id IS DISTINCT FROM NULLIF(
      btrim(COALESCE(observation ->> 'selected_property_id', '')),
      ''
    );
  original_number := CASE
    WHEN same_identity THEN COALESCE(
      series_row.original_jobber_invoice_number,
      btrim(observation ->> 'invoice_number')
    )
    ELSE btrim(observation ->> 'invoice_number')
  END;
  accepted_number := CASE
    WHEN same_identity THEN COALESCE(
      series_row.accepted_numbering_base,
      original_number
    )
    ELSE btrim(observation ->> 'invoice_number')
  END;

  snapshot_id := public.progress_insert_jobber_snapshot(
    series_row.id,
    actor,
    observation,
    original_number
  );
  PERFORM *
  FROM public.progress_apply_jobber_payments(series_row.id, actor, observation);

  SELECT candidate ->> 'address'
  INTO selected_site_address
  FROM jsonb_array_elements(observation -> 'site_address_candidates') AS item(candidate)
  WHERE candidate ->> 'property_id' = observation ->> 'selected_property_id'
  LIMIT 1;

  UPDATE public.progress_invoice_series AS series
  SET jobber_account_id = btrim(observation ->> 'account_id'),
      jobber_invoice_id = btrim(observation ->> 'invoice_id'),
      selected_jobber_job_id = NULLIF(
        btrim(COALESCE(observation ->> 'selected_job_id', '')),
        ''
      ),
      jobber_client_id = NULLIF(btrim(COALESCE(observation ->> 'client_id', '')), ''),
      selected_jobber_property_id = NULLIF(
        btrim(COALESCE(observation ->> 'selected_property_id', '')),
        ''
      ),
      original_jobber_invoice_number = original_number,
      accepted_numbering_base = accepted_number,
      current_jobber_snapshot_id = snapshot_id,
      recipient_name = CASE
        WHEN was_unlinked AND NULLIF(btrim(COALESCE(observation ->> 'client_name', '')), '') IS NOT NULL
          THEN btrim(observation ->> 'client_name')
        ELSE series.recipient_name
      END,
      recipient_company = CASE
        WHEN was_unlinked AND NULLIF(btrim(COALESCE(observation ->> 'client_company_name', '')), '') IS NOT NULL
          THEN btrim(observation ->> 'client_company_name')
        ELSE series.recipient_company
      END,
      recipient_address = CASE
        WHEN was_unlinked AND NULLIF(btrim(COALESCE(observation ->> 'billing_address', '')), '') IS NOT NULL
          THEN btrim(observation ->> 'billing_address')
        ELSE series.recipient_address
      END,
      recipient_email = CASE
        WHEN was_unlinked AND NULLIF(btrim(COALESCE(observation ->> 'client_email', '')), '') IS NOT NULL
          THEN btrim(observation ->> 'client_email')
        ELSE series.recipient_email
      END,
      recipient_phone = CASE
        WHEN was_unlinked AND NULLIF(btrim(COALESCE(observation ->> 'client_phone', '')), '') IS NOT NULL
          THEN btrim(observation ->> 'client_phone')
        ELSE series.recipient_phone
      END,
      site_address = CASE
        WHEN was_unlinked AND NULLIF(btrim(COALESCE(selected_site_address, '')), '') IS NOT NULL
          THEN btrim(selected_site_address)
        ELSE series.site_address
      END,
      last_jobber_sync_attempt_at = sync_time,
      last_successful_jobber_sync_at = sync_time,
      last_jobber_sync_error_code = NULL,
      version = series.version + 1,
      updated_by = actor
  WHERE series.id = series_row.id
  RETURNING series.* INTO series_row;

  PERFORM public.progress_recalculate_series_read_model_as(series_row.id, actor);
  PERFORM public.progress_append_service_event(
    actor,
    series_row.id,
    CASE WHEN was_unlinked THEN 'jobber_invoice_linked' ELSE 'jobber_invoice_relinked' END,
    jsonb_build_object(
      'identity_changed', NOT same_identity,
      'selector_changed', selector_changed,
      'snapshot_advanced', true
    ),
    'link_progress_jobber_invoice',
    correlation_key,
    fingerprint,
    jsonb_build_object(
      'series_id', series_row.id,
      'version', series_row.version,
      'quote_id', series_row.quote_id
    )
  );

  RETURN QUERY SELECT series_row.id, series_row.version, series_row.quote_id;
END;
$$;

CREATE FUNCTION public.apply_progress_invoice_jobber_refresh(payload JSONB)
RETURNS TABLE (
  series_id UUID,
  snapshot_id UUID,
  series_version INT,
  inserted_payments INT,
  revised_payments INT,
  unconfirmed_payments INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID;
  requested_series_id UUID;
  idempotency_key UUID;
  fingerprint TEXT;
  prior_result JSONB;
  observation JSONB;
  series_row public.progress_invoice_series%ROWTYPE;
  prior_snapshot public.progress_jobber_invoice_snapshots%ROWTYPE;
  next_snapshot_id UUID;
  payment_result RECORD;
  selected_site_address TEXT;
  sync_time TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM public.progress_assert_jsonb_keys(payload, ARRAY[
    'actor_id', 'series_id', 'expected_version', 'idempotency_key',
    'request_fingerprint', 'observation'
  ]);
  IF NOT (payload ?& ARRAY[
      'actor_id', 'series_id', 'expected_version', 'idempotency_key',
      'request_fingerprint', 'observation'
    ])
    OR jsonb_typeof(payload -> 'observation') <> 'object'
    OR payload ->> 'request_fingerprint' !~ '^[0-9A-Fa-f]{64}$' THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  actor := public.progress_require_service_actor(
    public.progress_jobber_uuid(payload, 'actor_id')
  );
  requested_series_id := public.progress_jobber_uuid(payload, 'series_id');
  PERFORM public.progress_jobber_positive_int(payload, 'expected_version');
  idempotency_key := public.progress_jobber_uuid(payload, 'idempotency_key');
  fingerprint := payload ->> 'request_fingerprint';
  observation := payload -> 'observation';
  PERFORM public.progress_validate_jobber_observation(observation);

  prior_result := public.progress_lock_idempotency(
    requested_series_id,
    'apply_progress_invoice_jobber_refresh',
    idempotency_key,
    fingerprint
  );
  IF prior_result IS NOT NULL THEN
    RETURN QUERY SELECT
      (prior_result ->> 'series_id')::UUID,
      (prior_result ->> 'snapshot_id')::UUID,
      (prior_result ->> 'series_version')::INT,
      (prior_result ->> 'inserted_payments')::INT,
      (prior_result ->> 'revised_payments')::INT,
      (prior_result ->> 'unconfirmed_payments')::INT;
    RETURN;
  END IF;

  SELECT series.* INTO series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = requested_series_id
    AND series.status <> 'void'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.progress_require_expected_version(payload, series_row.version);

  IF series_row.jobber_account_id IS DISTINCT FROM btrim(observation ->> 'account_id')
    OR series_row.jobber_invoice_id IS DISTINCT FROM btrim(observation ->> 'invoice_id')
    OR series_row.selected_jobber_job_id IS DISTINCT FROM NULLIF(
      btrim(COALESCE(observation ->> 'selected_job_id', '')),
      ''
    )
    OR series_row.selected_jobber_property_id IS DISTINCT FROM NULLIF(
      btrim(COALESCE(observation ->> 'selected_property_id', '')),
      ''
    ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  SELECT snapshot.* INTO prior_snapshot
  FROM public.progress_jobber_invoice_snapshots AS snapshot
  WHERE snapshot.id = series_row.current_jobber_snapshot_id
    AND snapshot.series_id = series_row.id;

  IF FOUND
    AND prior_snapshot.response_fingerprint = observation ->> 'response_fingerprint' THEN
    next_snapshot_id := prior_snapshot.id;
  ELSE
    next_snapshot_id := public.progress_insert_jobber_snapshot(
      series_row.id,
      actor,
      observation,
      series_row.original_jobber_invoice_number
    );
  END IF;

  PERFORM payment.id
  FROM public.progress_payments AS payment
  WHERE payment.series_id = series_row.id
  ORDER BY payment.id
  FOR UPDATE;

  SELECT * INTO STRICT payment_result
  FROM public.progress_apply_jobber_payments(series_row.id, actor, observation);

  SELECT candidate ->> 'address'
  INTO selected_site_address
  FROM jsonb_array_elements(observation -> 'site_address_candidates') AS item(candidate)
  WHERE candidate ->> 'property_id' = observation ->> 'selected_property_id'
  LIMIT 1;

  UPDATE public.progress_invoice_series AS series
  SET current_jobber_snapshot_id = next_snapshot_id,
      jobber_client_id = NULLIF(btrim(COALESCE(observation ->> 'client_id', '')), ''),
      last_jobber_sync_attempt_at = sync_time,
      last_successful_jobber_sync_at = sync_time,
      last_jobber_sync_error_code = NULL,
      version = series.version + 1,
      updated_by = actor
  WHERE series.id = series_row.id
  RETURNING series.* INTO series_row;

  PERFORM public.progress_recalculate_series_read_model_as(series_row.id, actor);
  PERFORM public.progress_append_service_event(
    actor,
    series_row.id,
    'jobber_invoice_refreshed',
    jsonb_build_object(
      'snapshot_advanced', next_snapshot_id IS DISTINCT FROM prior_snapshot.id,
      'invoice_number_changed',
        prior_snapshot.observed_invoice_number IS DISTINCT FROM observation ->> 'invoice_number',
      'recipient_suggestion_changed',
        prior_snapshot.client_name IS DISTINCT FROM observation ->> 'client_name'
          OR prior_snapshot.client_company_name IS DISTINCT FROM observation ->> 'client_company_name'
          OR prior_snapshot.billing_address IS DISTINCT FROM observation ->> 'billing_address'
          OR prior_snapshot.client_email IS DISTINCT FROM NULLIF(
            btrim(COALESCE(observation ->> 'client_email', '')),
            ''
          )
          OR prior_snapshot.client_phone IS DISTINCT FROM NULLIF(
            btrim(COALESCE(observation ->> 'client_phone', '')),
            ''
          )
          OR prior_snapshot.client_email_candidates IS DISTINCT FROM
            observation -> 'client_email_candidates'
          OR prior_snapshot.client_phone_candidates IS DISTINCT FROM
            observation -> 'client_phone_candidates',
      'site_suggestion_changed',
        prior_snapshot.selected_jobber_property_id IS DISTINCT FROM NULLIF(
          btrim(COALESCE(observation ->> 'selected_property_id', '')),
          ''
        )
          OR prior_snapshot.property_address IS DISTINCT FROM NULLIF(
            btrim(COALESCE(selected_site_address, '')),
            ''
          )
          OR prior_snapshot.site_candidates IS DISTINCT FROM
            observation -> 'site_address_candidates'
    ),
    'apply_progress_invoice_jobber_refresh',
    idempotency_key,
    fingerprint,
    jsonb_build_object(
      'series_id', series_row.id,
      'snapshot_id', next_snapshot_id,
      'series_version', series_row.version,
      'inserted_payments', payment_result.inserted_payments,
      'revised_payments', payment_result.revised_payments,
      'unconfirmed_payments', payment_result.unconfirmed_payments
    )
  );

  RETURN QUERY SELECT
    series_row.id,
    next_snapshot_id,
    series_row.version,
    payment_result.inserted_payments,
    payment_result.revised_payments,
    payment_result.unconfirmed_payments;
END;
$$;

CREATE FUNCTION public.record_progress_jobber_refresh_failure(payload JSONB)
RETURNS TABLE (
  series_id UUID,
  version INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID;
  requested_series_id UUID;
  idempotency_key UUID;
  fingerprint TEXT;
  prior_result JSONB;
  series_row public.progress_invoice_series%ROWTYPE;
  safe_code TEXT;
BEGIN
  PERFORM public.progress_assert_jsonb_keys(payload, ARRAY[
    'actor_id', 'series_id', 'expected_version', 'jobber_account_id',
    'jobber_invoice_id', 'idempotency_key', 'error_code'
  ]);
  IF NOT (payload ?& ARRAY[
      'actor_id', 'series_id', 'expected_version', 'jobber_account_id',
      'jobber_invoice_id', 'idempotency_key', 'error_code'
    ])
    OR jsonb_typeof(payload -> 'jobber_account_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'jobber_invoice_id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'error_code') IS DISTINCT FROM 'string'
    OR length(btrim(COALESCE(payload ->> 'jobber_account_id', ''))) NOT BETWEEN 1 AND 512
    OR length(btrim(COALESCE(payload ->> 'jobber_invoice_id', ''))) NOT BETWEEN 1 AND 512 THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  actor := public.progress_require_service_actor(
    public.progress_jobber_uuid(payload, 'actor_id')
  );
  requested_series_id := public.progress_jobber_uuid(payload, 'series_id');
  PERFORM public.progress_jobber_positive_int(payload, 'expected_version');
  idempotency_key := public.progress_jobber_uuid(payload, 'idempotency_key');
  safe_code := payload ->> 'error_code';
  IF safe_code NOT IN (
    'JOBBER_NOT_CONNECTED',
    'JOBBER_AUTH_FAILED',
    'JOBBER_SCOPE_MISSING',
    'JOBBER_NOT_FOUND',
    'JOBBER_RATE_LIMITED',
    'JOBBER_SCHEMA_MISMATCH',
    'JOBBER_RESPONSE_INVALID',
    'JOBBER_TEMPORARY_FAILURE'
  ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;
  fingerprint := public.progress_request_fingerprint(jsonb_build_object(
    'series_id', requested_series_id,
    'jobber_account_id', payload ->> 'jobber_account_id',
    'jobber_invoice_id', payload ->> 'jobber_invoice_id',
    'error_code', safe_code,
    'correlation_key', idempotency_key
  ));

  prior_result := public.progress_lock_idempotency(
    requested_series_id,
    'record_progress_jobber_refresh_failure',
    idempotency_key,
    fingerprint
  );
  IF prior_result IS NOT NULL THEN
    RETURN QUERY SELECT
      (prior_result ->> 'series_id')::UUID,
      (prior_result ->> 'version')::INT;
    RETURN;
  END IF;

  SELECT series.* INTO series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = requested_series_id
    AND series.status <> 'void'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.progress_require_expected_version(payload, series_row.version);
  IF series_row.jobber_account_id IS DISTINCT FROM payload ->> 'jobber_account_id'
    OR series_row.jobber_invoice_id IS DISTINCT FROM payload ->> 'jobber_invoice_id' THEN
    RAISE EXCEPTION 'PROGRESS_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.progress_invoice_series AS series
  SET last_jobber_sync_attempt_at = pg_catalog.clock_timestamp(),
      last_jobber_sync_error_code = safe_code,
      updated_by = actor
  WHERE series.id = series_row.id;

  PERFORM public.progress_append_service_event(
    actor,
    series_row.id,
    'jobber_refresh_failed',
    jsonb_build_object('error_code', safe_code),
    'record_progress_jobber_refresh_failure',
    idempotency_key,
    fingerprint,
    jsonb_build_object('series_id', series_row.id, 'version', series_row.version)
  );

  RETURN QUERY SELECT series_row.id, series_row.version;
END;
$$;

CREATE FUNCTION public.accept_progress_jobber_invoice_number(payload JSONB)
RETURNS TABLE (
  id UUID,
  version INT,
  conflict BOOLEAN,
  current JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := auth.uid();
  requested_series_id UUID;
  requested_observation_id UUID;
  requested_expected_version INT;
  number_source TEXT;
  idempotency_key UUID;
  fingerprint TEXT;
  prior_result JSONB;
  series_row public.progress_invoice_series%ROWTYPE;
  snapshot_row public.progress_jobber_invoice_snapshots%ROWTYPE;
  selected_number TEXT;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  PERFORM public.progress_assert_jsonb_keys(payload, ARRAY[
    'series_id', 'expected_version', 'observation_id', 'number_source',
    'idempotency_key'
  ]);
  IF NOT (payload ?& ARRAY[
      'series_id', 'expected_version', 'observation_id', 'number_source',
      'idempotency_key'
    ])
    OR payload ->> 'number_source' NOT IN ('original', 'latest') THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;

  requested_series_id := public.progress_jobber_uuid(payload, 'series_id');
  requested_observation_id := public.progress_jobber_uuid(payload, 'observation_id');
  requested_expected_version := public.progress_jobber_positive_int(
    payload,
    'expected_version'
  );
  number_source := payload ->> 'number_source';
  idempotency_key := public.progress_jobber_uuid(payload, 'idempotency_key');
  fingerprint := public.progress_request_fingerprint(
    payload || jsonb_build_object('correlation_key', idempotency_key)
  );
  prior_result := public.progress_lock_idempotency(
    requested_series_id,
    'accept_progress_jobber_invoice_number',
    idempotency_key,
    fingerprint
  );
  IF prior_result IS NOT NULL THEN
    RETURN QUERY SELECT
      (prior_result ->> 'id')::UUID,
      (prior_result ->> 'version')::INT,
      false,
      NULL::JSONB;
    RETURN;
  END IF;

  SELECT series.* INTO series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = requested_series_id
    AND series.status <> 'void'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF requested_expected_version <> series_row.version THEN
    RETURN QUERY SELECT
      series_row.id,
      series_row.version,
      true,
      public.progress_series_safe_dto(series_row);
    RETURN;
  END IF;
  IF series_row.jobber_link_locked_at IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.progress_claims AS claim WHERE claim.series_id = series_row.id
    ) THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_LINK_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  SELECT snapshot.* INTO snapshot_row
  FROM public.progress_jobber_invoice_snapshots AS snapshot
  WHERE snapshot.id = requested_observation_id
    AND snapshot.series_id = series_row.id
    AND snapshot.id = series_row.current_jobber_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_JOBBER_ERROR' USING ERRCODE = 'P0001';
  END IF;

  selected_number := CASE number_source
    WHEN 'original' THEN snapshot_row.original_invoice_number
    ELSE snapshot_row.observed_invoice_number
  END;
  UPDATE public.progress_invoice_series AS series
  SET accepted_numbering_base = selected_number,
      version = series.version + 1,
      updated_by = actor
  WHERE series.id = series_row.id
  RETURNING series.* INTO series_row;

  PERFORM public.progress_append_event(
    series_row.id,
    NULL,
    'jobber_invoice_number_accepted',
    'user',
    NULL,
    NULL,
    jsonb_build_object('number_source', number_source),
    'accept_progress_jobber_invoice_number',
    idempotency_key,
    fingerprint,
    jsonb_build_object('id', series_row.id, 'version', series_row.version)
  );

  RETURN QUERY SELECT series_row.id, series_row.version, false, NULL::JSONB;
END;
$$;

REVOKE ALL ON FUNCTION public.progress_assert_jsonb_keys(JSONB, TEXT[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_require_service_actor(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_jobber_uuid(JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_jobber_positive_int(JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_jobber_sydney_date(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_jobber_timestamp(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_jobber_money(JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_append_service_event(
  UUID, UUID, TEXT, JSONB, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_recalculate_series_read_model_as(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_validate_jobber_observation(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_insert_jobber_snapshot(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_apply_jobber_payments(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_progress_invoice_jobber_context(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_progress_jobber_invoice_number(JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_progress_invoice_jobber_context(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_progress_jobber_invoice_number(JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.link_progress_jobber_invoice(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_progress_invoice_jobber_refresh(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_progress_jobber_refresh_failure(JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_progress_jobber_invoice(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_progress_invoice_jobber_refresh(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_progress_jobber_refresh_failure(JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
