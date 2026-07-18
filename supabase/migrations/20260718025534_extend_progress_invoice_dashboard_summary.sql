CREATE OR REPLACE FUNCTION public.progress_resolve_current_manifest(owning_series_id UUID)
RETURNS TABLE (
  manifest_ordinal BIGINT,
  claim_id UUID,
  revision_id UUID,
  claim_sequence INT,
  tax_invoice_number TEXT,
  revision_reference TEXT,
  issue_date DATE,
  due_date DATE,
  current_claim_ex_gst NUMERIC,
  current_claim_gst NUMERIC,
  current_claim_inc_gst NUMERIC
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  pointed_set_id UUID;
  manifest JSONB := '[]'::JSONB;
  manifest_count INT := 0;
BEGIN
  SELECT series.current_revision_set_id
  INTO pointed_set_id
  FROM public.progress_invoice_series AS series
  WHERE series.id = owning_series_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF pointed_set_id IS NULL THEN
    RETURN;
  END IF;

  SELECT revision_set.revision_manifest
  INTO manifest
  FROM public.progress_invoice_revision_sets AS revision_set
  WHERE revision_set.id = pointed_set_id
    AND revision_set.series_id = owning_series_id
    AND revision_set.state = 'current';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  manifest_count := jsonb_array_length(manifest);
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(manifest) AS item(value)
    WHERE CASE
      WHEN jsonb_typeof(item.value) IS DISTINCT FROM 'object' THEN true
      ELSE (SELECT count(*) FROM jsonb_object_keys(item.value)) <> 2
        OR NOT (item.value ? 'claim_id' AND item.value ? 'revision_id')
        OR jsonb_typeof(item.value -> 'claim_id') IS DISTINCT FROM 'string'
        OR jsonb_typeof(item.value -> 'revision_id') IS DISTINCT FROM 'string'
        OR item.value ->> 'claim_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        OR item.value ->> 'revision_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      END
  ) OR (
    SELECT count(DISTINCT item.value ->> 'claim_id') <> manifest_count
      OR count(DISTINCT item.value ->> 'revision_id') <> manifest_count
    FROM jsonb_array_elements(manifest) AS item(value)
  ) THEN
    RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF (
    SELECT count(*)
    FROM jsonb_array_elements(manifest) WITH ORDINALITY AS item(value, ordinal)
    JOIN public.progress_claims AS claim
      ON claim.id = (item.value ->> 'claim_id')::UUID
     AND claim.series_id = owning_series_id
     AND claim.status = 'issued'
    JOIN public.progress_claim_revisions AS revision
      ON revision.id = (item.value ->> 'revision_id')::UUID
     AND revision.claim_id = claim.id
     AND revision.state = 'issued'
  ) <> manifest_count THEN
    RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    item.ordinal,
    claim.id,
    revision.id,
    claim.sequence,
    claim.tax_invoice_number,
    revision.reference,
    revision.issue_date,
    revision.due_date,
    revision.current_claim_ex_gst,
    revision.current_claim_gst,
    revision.current_claim_inc_gst
  FROM jsonb_array_elements(manifest) WITH ORDINALITY AS item(value, ordinal)
  JOIN public.progress_claims AS claim
    ON claim.id = (item.value ->> 'claim_id')::UUID
   AND claim.series_id = owning_series_id
   AND claim.status = 'issued'
  JOIN public.progress_claim_revisions AS revision
    ON revision.id = (item.value ->> 'revision_id')::UUID
   AND revision.claim_id = claim.id
   AND revision.state = 'issued'
  ORDER BY item.ordinal;
END;
$$;

CREATE OR REPLACE FUNCTION public.progress_recalculate_series_read_model_as(
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
  FROM public.progress_resolve_current_manifest(owning_series_id) AS revision;

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
      revision.claim_sequence AS sequence_number,
      revision.manifest_ordinal,
      revision.current_claim_inc_gst AS claim_face
    FROM public.progress_resolve_current_manifest(owning_series_id) AS revision
    ORDER BY revision.issue_date, revision.claim_sequence, revision.manifest_ordinal
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
  IF adjusted_ex < 0 OR adjusted_gst < 0 OR adjusted_inc < 0
    OR claimed_ex < 0 OR claimed_gst < 0 OR claimed_inc < 0
    OR adjusted_ex > 999999999999.99 OR adjusted_gst > 999999999999.99
    OR adjusted_inc > 999999999999.99 OR claimed_ex > 999999999999.99
    OR claimed_gst > 999999999999.99 OR claimed_inc > 999999999999.99
    OR abs(receipts) > 999999999999.99 OR outstanding > 999999999999.99
    OR credit > 999999999999.99 OR adjusted_ex - claimed_ex > 999999999999.99
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

CREATE OR REPLACE FUNCTION public.list_progress_invoice_series(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := auth.uid();
  unknown_keys TEXT[];
  requested_query TEXT;
  requested_statuses TEXT[];
  lifecycle_statuses TEXT[];
  payment_statuses TEXT[];
  requested_page_number NUMERIC;
  requested_page_size_number NUMERIC;
  requested_page INT;
  requested_page_size INT;
  requested_quote_id UUID;
  void_requested BOOLEAN;
  result JSONB;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'PROGRESS_AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key) INTO unknown_keys
  FROM jsonb_object_keys(payload) AS keys(key)
  WHERE keys.key <> ALL (ARRAY['query', 'statuses', 'page', 'page_size', 'quote_id']::TEXT[]);
  IF unknown_keys IS NOT NULL
    OR jsonb_typeof(payload -> 'query') IS DISTINCT FROM 'string'
    OR jsonb_typeof(payload -> 'statuses') IS DISTINCT FROM 'array'
    OR jsonb_typeof(payload -> 'page') IS DISTINCT FROM 'number'
    OR jsonb_typeof(payload -> 'page_size') IS DISTINCT FROM 'number'
    OR (payload -> 'quote_id' <> 'null'::JSONB AND jsonb_typeof(payload -> 'quote_id') IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload -> 'statuses') AS status(value)
    WHERE jsonb_typeof(status.value) IS DISTINCT FROM 'string'
  ) THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  requested_query := payload ->> 'query';
  requested_page_number := (payload ->> 'page')::NUMERIC;
  requested_page_size_number := (payload ->> 'page_size')::NUMERIC;
  SELECT COALESCE(pg_catalog.array_agg(status.value), ARRAY[]::TEXT[]) INTO requested_statuses
  FROM jsonb_array_elements_text(payload -> 'statuses') AS status(value);
  IF length(requested_query) > 160
    OR requested_page_number <> trunc(requested_page_number)
    OR requested_page_number < 1 OR requested_page_number > 2147483647
    OR requested_page_size_number <> trunc(requested_page_size_number)
    OR requested_page_size_number < 1 OR requested_page_size_number > 100
    OR array_length(requested_statuses, 1) > 10
    OR EXISTS (SELECT 1 FROM unnest(requested_statuses) AS status(value) WHERE value NOT IN ('draft','active','completed','reconciliation_required','void','unpaid','part_paid','paid','overdue','credit_balance')) THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  IF payload -> 'quote_id' <> 'null'::JSONB
    AND payload ->> 'quote_id' !~ '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;

  requested_page := requested_page_number::INT;
  requested_page_size := requested_page_size_number::INT;
  requested_quote_id := CASE WHEN payload -> 'quote_id' = 'null'::JSONB THEN NULL ELSE (payload ->> 'quote_id')::UUID END;
  void_requested := 'void' = ANY(requested_statuses);
  SELECT COALESCE(pg_catalog.array_agg(value), ARRAY[]::TEXT[]) INTO lifecycle_statuses
  FROM unnest(requested_statuses) AS status(value)
  WHERE value IN ('draft','active','completed','reconciliation_required');
  SELECT COALESCE(pg_catalog.array_agg(value), ARRAY[]::TEXT[]) INTO payment_statuses
  FROM unnest(requested_statuses) AS status(value)
  WHERE value IN ('unpaid','part_paid','paid','overdue','credit_balance');

  WITH enriched AS (
    SELECT
      series.*,
      manifest.claim_count AS manifest_claim_count,
      COALESCE(manifest.latest_tax_invoice_number, NULLIF(btrim(series.accepted_numbering_base), ''), NULLIF(btrim(series.original_jobber_invoice_number), ''), '') AS display_invoice_number,
      COALESCE(manifest.latest_reference, series.reference, '') AS display_reference,
      CASE
        WHEN series.current_credit_balance > 0 THEN 'credit_balance'
        WHEN manifest.claim_count = 0 THEN 'no_claims'
        WHEN series.current_claimed_inc_gst > 0 AND series.current_outstanding_receivable = 0 THEN 'paid'
        WHEN COALESCE(manifest.has_overdue, false) THEN 'overdue'
        WHEN series.current_actual_receipts > 0 AND series.current_outstanding_receivable > 0 THEN 'part_paid'
        WHEN series.current_outstanding_receivable > 0 THEN 'unpaid'
        ELSE 'no_claims'
      END AS display_payment_state
    FROM public.progress_invoice_series AS series
    CROSS JOIN LATERAL (
      WITH resolved AS MATERIALIZED (
        SELECT * FROM public.progress_resolve_current_manifest(series.id)
      ), ordered AS (
        SELECT resolved.*,
          COALESCE(sum(resolved.current_claim_inc_gst) OVER (
            ORDER BY resolved.issue_date, resolved.claim_sequence, resolved.manifest_ordinal
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0) AS prior_claims
        FROM resolved
      )
      SELECT
        count(*)::INT AS claim_count,
        (array_agg(ordered.tax_invoice_number ORDER BY ordered.manifest_ordinal DESC))[1] AS latest_tax_invoice_number,
        (array_agg(ordered.revision_reference ORDER BY ordered.manifest_ordinal DESC))[1] AS latest_reference,
        bool_or(
        ordered.due_date < (pg_catalog.clock_timestamp() AT TIME ZONE 'Australia/Sydney')::DATE
        AND ordered.current_claim_inc_gst
          - GREATEST(LEAST(GREATEST(series.current_actual_receipts, 0) - ordered.prior_claims, ordered.current_claim_inc_gst), 0) > 0
        ) AS has_overdue
      FROM ordered
    ) AS manifest
  ), matching AS (
    SELECT enriched.*
    FROM enriched
    WHERE (requested_quote_id IS NULL OR enriched.quote_id = requested_quote_id)
      AND (
        (void_requested AND enriched.status = 'void')
        OR (NOT void_requested AND enriched.status <> 'void'
          AND (cardinality(lifecycle_statuses) = 0 OR enriched.status = ANY(lifecycle_statuses))
          AND (cardinality(payment_statuses) = 0 OR enriched.display_payment_state = ANY(payment_statuses)))
      )
      AND (requested_query = '' OR position(lower(requested_query) IN lower(concat_ws(' ', enriched.recipient_name, enriched.recipient_company, enriched.site_name, enriched.default_description, enriched.reference, enriched.accepted_numbering_base, enriched.original_jobber_invoice_number))) > 0)
  ), paged AS (
    SELECT matching.* FROM matching
    ORDER BY matching.updated_at DESC, matching.id DESC
    OFFSET (requested_page::BIGINT - 1) * requested_page_size::BIGINT
    LIMIT requested_page_size
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', paged.id, 'source_type', paged.source_type, 'quote_id', paged.quote_id,
      'recipient_name', paged.recipient_name, 'recipient_company', COALESCE(paged.recipient_company, ''), 'site_name', paged.site_name,
      'status', paged.status,
      'current_adjusted_contract_ex_gst', pg_catalog.to_char(paged.current_adjusted_contract_ex_gst, 'FM999999999999990.00'),
      'current_claimed_inc_gst', pg_catalog.to_char(paged.current_claimed_inc_gst, 'FM999999999999990.00'),
      'current_actual_receipts', pg_catalog.to_char(paged.current_actual_receipts, 'FM999999999999990.00'),
      'current_outstanding_receivable', pg_catalog.to_char(paged.current_outstanding_receivable, 'FM999999999999990.00'),
      'current_credit_balance', pg_catalog.to_char(paged.current_credit_balance, 'FM999999999999990.00'),
      'current_unclaimed_inc_gst', pg_catalog.to_char(paged.current_unclaimed_inc_gst, 'FM999999999999990.00'),
      'current_cumulative_percentage', pg_catalog.to_char(paged.current_cumulative_percentage, 'FM999999990.000000'),
      'current_payment_state', CASE WHEN paged.display_payment_state = 'no_claims' THEN 'unpaid' ELSE paged.display_payment_state END,
      'current_manifest_claim_count', paged.manifest_claim_count,
      'invoice_number', paged.display_invoice_number,
      'reference', paged.display_reference,
      'last_successful_jobber_sync_at', paged.last_successful_jobber_sync_at,
      'last_jobber_sync_error_code', paged.last_jobber_sync_error_code,
      'version', paged.version
    ) ORDER BY paged.updated_at DESC, paged.id DESC) FROM paged), '[]'::JSONB),
    'summary', jsonb_build_object(
      'current_adjusted_contract_ex_gst', COALESCE((SELECT pg_catalog.to_char(sum(matching.current_adjusted_contract_ex_gst), 'FM999999999999990.00') FROM matching), '0.00'),
      'current_claimed_inc_gst', COALESCE((SELECT pg_catalog.to_char(sum(matching.current_claimed_inc_gst), 'FM999999999999990.00') FROM matching), '0.00'),
      'current_actual_receipts', COALESCE((SELECT pg_catalog.to_char(sum(matching.current_actual_receipts), 'FM999999999999990.00') FROM matching), '0.00'),
      'current_outstanding_receivable', COALESCE((SELECT pg_catalog.to_char(sum(matching.current_outstanding_receivable), 'FM999999999999990.00') FROM matching), '0.00'),
      'current_credit_balance', COALESCE((SELECT pg_catalog.to_char(sum(matching.current_credit_balance), 'FM999999999999990.00') FROM matching), '0.00'),
      'current_unclaimed_inc_gst', COALESCE((SELECT pg_catalog.to_char(sum(matching.current_unclaimed_inc_gst), 'FM999999999999990.00') FROM matching), '0.00')
    ),
    'page', requested_page, 'page_size', requested_page_size, 'total', (SELECT count(*) FROM matching)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.progress_resolve_current_manifest(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_recalculate_series_read_model_as(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_recalculate_series_read_model(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_progress_invoice_series(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_progress_invoice_series(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
