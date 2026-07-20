ALTER TABLE public.progress_claim_command_results
  DROP CONSTRAINT progress_claim_command_results_command_name_check,
  ADD CONSTRAINT progress_claim_command_results_command_name_check
    CHECK (command_name IN (
      'create_progress_claim_draft',
      'save_progress_claim_draft',
      'void_progress_claim_draft'
    ));

CREATE FUNCTION public.progress_claim_table_dtos(requested_series_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH manifested AS MATERIALIZED (
    SELECT *
    FROM public.progress_resolve_current_manifest(requested_series_id)
  ),
  eligible_receipts AS MATERIALIZED (
    SELECT
      revision.received_date,
      revision.created_at,
      payment.id AS payment_id,
      revision.effective_receipt_amount
    FROM public.progress_payments AS payment
    JOIN public.progress_payment_revisions AS revision
      ON revision.id = payment.current_revision_id
     AND revision.payment_id = payment.id
     AND revision.status = 'active'
    WHERE payment.series_id = requested_series_id
      AND (
        payment.source = 'jobber'
        OR (
          payment.source = 'manual'
          AND NOT EXISTS (
            SELECT 1
            FROM public.progress_payments AS matched_jobber
            WHERE matched_jobber.series_id = payment.series_id
              AND matched_jobber.source = 'jobber'
              AND matched_jobber.matched_manual_payment_id = payment.id
          )
        )
      )
  ),
  receipt_activity AS MATERIALIZED (
    SELECT
      receipt.received_date,
      sum(receipt.effective_receipt_amount) OVER (
        ORDER BY receipt.received_date, receipt.created_at, receipt.payment_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS running_total,
      COALESCE(sum(receipt.effective_receipt_amount) OVER (
        ORDER BY receipt.received_date, receipt.created_at, receipt.payment_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0::NUMERIC) AS prior_running_total
    FROM eligible_receipts AS receipt
  ),
  receipt_total AS (
    SELECT GREATEST(COALESCE(sum(effective_receipt_amount), 0), 0) AS amount
    FROM eligible_receipts
  ),
  claim_rows AS MATERIALIZED (
    SELECT
      claim.*,
      manifested.manifest_ordinal,
      selected_revision.id AS selected_revision_id,
      selected_revision.revision_number,
      selected_revision.state AS revision_state,
      selected_revision.issue_date,
      selected_revision.due_date,
      selected_revision.description,
      selected_revision.reference,
      selected_revision.current_claim_ex_gst,
      selected_revision.current_claim_gst,
      selected_revision.current_claim_inc_gst,
      selected_revision.cumulative_percentage,
      selected_revision.remaining_ex_gst,
      selected_revision.remaining_gst,
      selected_revision.remaining_inc_gst,
      selected_revision.edit_classification,
      selected_revision.tax_review_state,
      selected_revision.created_at AS revision_created_at
    FROM public.progress_claims AS claim
    LEFT JOIN manifested ON manifested.claim_id = claim.id
    LEFT JOIN public.progress_claim_revisions AS selected_revision
      ON selected_revision.id = COALESCE(manifested.revision_id, claim.current_revision_id)
     AND selected_revision.claim_id = claim.id
    WHERE claim.series_id = requested_series_id
  ),
  current_ordered AS MATERIALIZED (
    SELECT
      claim.id,
      claim.current_claim_inc_gst,
      COALESCE(sum(claim.current_claim_inc_gst) OVER (
        ORDER BY claim.issue_date, claim.sequence, claim.manifest_ordinal
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0::NUMERIC) AS prior_claims_inc_gst,
      sum(claim.current_claim_inc_gst) OVER (
        ORDER BY claim.issue_date, claim.sequence, claim.manifest_ordinal
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumulative_threshold
    FROM claim_rows AS claim
    WHERE claim.manifest_ordinal IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', claim.id,
    'sequence', claim.sequence,
    'kind', claim.kind,
    'suffix', claim.suffix,
    'tax_invoice_number', claim.tax_invoice_number,
    'status', claim.status,
    'original_issued_at', claim.original_issued_at,
    'latest_revised_at', claim.latest_revised_at,
    'version', claim.version,
    'created_at', claim.created_at,
    'collected_inc_gst', CASE WHEN current_claim.id IS NULL THEN NULL ELSE
      public.progress_claim_money(LEAST(
        GREATEST(receipt_total.amount - current_claim.prior_claims_inc_gst, 0),
        current_claim.current_claim_inc_gst
      )) END,
    'collected_date', CASE
      WHEN current_claim.id IS NULL OR receipt_total.amount < current_claim.cumulative_threshold THEN NULL
      ELSE (
        SELECT max(activity.received_date)
        FROM receipt_activity AS activity
        WHERE activity.prior_running_total < current_claim.cumulative_threshold
          AND activity.running_total >= current_claim.cumulative_threshold
      )
    END,
    'outstanding_inc_gst', CASE WHEN current_claim.id IS NULL THEN NULL ELSE
      public.progress_claim_money(current_claim.current_claim_inc_gst - LEAST(
        GREATEST(receipt_total.amount - current_claim.prior_claims_inc_gst, 0),
        current_claim.current_claim_inc_gst
      )) END,
    'current_revision', CASE WHEN claim.selected_revision_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', claim.selected_revision_id,
      'revision_number', claim.revision_number,
      'state', claim.revision_state,
      'issue_date', claim.issue_date,
      'due_date', claim.due_date,
      'description', claim.description,
      'reference', claim.reference,
      'current_claim_ex_gst', public.progress_claim_money(claim.current_claim_ex_gst),
      'current_claim_gst', public.progress_claim_money(claim.current_claim_gst),
      'current_claim_inc_gst', public.progress_claim_money(claim.current_claim_inc_gst),
      'cumulative_percentage', public.progress_claim_percentage(claim.cumulative_percentage),
      'remaining_ex_gst', public.progress_claim_money(claim.remaining_ex_gst),
      'remaining_gst', public.progress_claim_money(claim.remaining_gst),
      'remaining_inc_gst', public.progress_claim_money(claim.remaining_inc_gst),
      'edit_classification', claim.edit_classification,
      'tax_review_state', claim.tax_review_state,
      'created_at', claim.revision_created_at
    ) END
  ) ORDER BY claim.sequence, claim.id), '[]'::JSONB)
  FROM claim_rows AS claim
  LEFT JOIN current_ordered AS current_claim ON current_claim.id = claim.id
  CROSS JOIN receipt_total;
$$;

ALTER FUNCTION public.get_progress_invoice_workspace(JSONB)
  RENAME TO progress_get_invoice_workspace_before_claim_table;

CREATE FUNCTION public.get_progress_invoice_workspace(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  base JSONB;
  requested_series_id UUID;
BEGIN
  PERFORM public.progress_require_actor();
  base := public.progress_get_invoice_workspace_before_claim_table(payload);
  IF base -> 'series' = 'null'::JSONB THEN
    RETURN base;
  END IF;
  requested_series_id := (base #>> '{series,id}')::UUID;
  RETURN jsonb_set(
    base,
    '{claims}',
    public.progress_claim_table_dtos(requested_series_id),
    false
  );
END;
$$;

CREATE FUNCTION public.void_progress_claim_draft(payload JSONB)
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

ALTER FUNCTION public.progress_claim_table_dtos(UUID) OWNER TO postgres;
ALTER FUNCTION public.progress_get_invoice_workspace_before_claim_table(JSONB) OWNER TO postgres;
ALTER FUNCTION public.get_progress_invoice_workspace(JSONB) OWNER TO postgres;
ALTER FUNCTION public.void_progress_claim_draft(JSONB) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.progress_claim_table_dtos(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_get_invoice_workspace_before_claim_table(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_workspace(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.void_progress_claim_draft(JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_progress_invoice_workspace(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_progress_claim_draft(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
