CREATE FUNCTION public.progress_safe_event_field_changes(changes JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  value JSONB;
  before_value JSONB;
  after_value JSONB;
  key_name TEXT;
  unsafe_pattern CONSTANT TEXT := '(?i)(https?://|s3://|storage[_ -]?path|bank[_ -]|account[_ -]|\bbsb\b|response[_ -]?fingerprint|raw[_ -])';
BEGIN
  IF jsonb_typeof(changes) IS DISTINCT FROM 'object' THEN
    RETURN result;
  END IF;

  IF jsonb_typeof(changes -> 'source_type') = 'string'
    AND changes ->> 'source_type' IN ('pbc_quote', 'jobber_job', 'jobber_invoice', 'manual') THEN
    result := result || jsonb_build_object('source_type', changes ->> 'source_type');
  END IF;
  IF jsonb_typeof(changes -> 'type') = 'string'
    AND changes ->> 'type' IN ('variation', 'credit') THEN
    result := result || jsonb_build_object('type', changes ->> 'type');
  END IF;
  IF jsonb_typeof(changes -> 'number_source') = 'string'
    AND changes ->> 'number_source' IN ('original', 'latest') THEN
    result := result || jsonb_build_object('number_source', changes ->> 'number_source');
  END IF;
  FOREACH key_name IN ARRAY ARRAY['quote_id', 'adjustment_id', 'replacement_id']::TEXT[] LOOP
    IF jsonb_typeof(changes -> key_name) = 'string'
      AND changes ->> key_name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      result := result || jsonb_build_object(key_name, changes ->> key_name);
    END IF;
  END LOOP;

  FOREACH key_name IN ARRAY ARRAY[
    'base_contract_ex_gst', 'gst_rate', 'recipient_name', 'recipient_company',
    'recipient_address', 'recipient_email', 'recipient_phone', 'recipient_abn',
    'site_name', 'site_address', 'default_description', 'reference',
    'effective_date', 'description', 'amount_ex_gst', 'quote_item_id'
  ]::TEXT[] LOOP
    value := changes -> key_name;
    IF jsonb_typeof(value) = 'object' THEN
      before_value := value -> 'before';
      after_value := value -> 'after';
      IF jsonb_typeof(before_value) IN ('string', 'number', 'null')
        AND jsonb_typeof(after_value) IN ('string', 'number', 'null')
        AND COALESCE(before_value #>> '{}', '') !~ unsafe_pattern
        AND COALESCE(after_value #>> '{}', '') !~ unsafe_pattern
        AND length(COALESCE(before_value #>> '{}', '')) <= 2000
        AND length(COALESCE(after_value #>> '{}', '')) <= 2000 THEN
        result := result || jsonb_build_object(
          key_name,
          jsonb_build_object('before', before_value, 'after', after_value)
        );
      END IF;
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

CREATE FUNCTION public.progress_safe_event_dto(event_row public.progress_invoice_events)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', event_row.id,
    'claim_id', event_row.claim_id,
    'event_type', event_row.event_type,
    'source', event_row.source,
    'occurred_at', event_row.occurred_at,
    'prior_revision_id', event_row.prior_revision_id,
    'next_revision_id', event_row.next_revision_id,
    'safe_field_changes', public.progress_safe_event_field_changes(event_row.safe_field_changes)
  );
$$;

CREATE FUNCTION public.get_progress_invoice_workspace(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := auth.uid();
  unknown_keys TEXT[];
  requested_series_id UUID;
  series_row public.progress_invoice_series%ROWTYPE;
  snapshot_row public.progress_jobber_invoice_snapshots%ROWTYPE;
  current_set public.progress_invoice_revision_sets%ROWTYPE;
  manifest_count INT := 0;
  current_claim_revision_id UUID;
  adjustments JSONB;
  claims JSONB;
  payments JSONB;
  ready_documents JSONB;
  recent_events JSONB;
  imported_observation JSONB := NULL;
  current_set_dto JSONB := NULL;
  current_document_exists BOOLEAN := false;
  historical_document_exists BOOLEAN := false;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key)
  INTO unknown_keys
  FROM jsonb_object_keys(payload) AS keys(key)
  WHERE keys.key <> 'series_id';
  IF unknown_keys IS NOT NULL
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 1
    OR jsonb_typeof(payload -> 'series_id') IS DISTINCT FROM 'string'
    OR payload ->> 'series_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
  requested_series_id := (payload ->> 'series_id')::UUID;

  SELECT series.* INTO series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = requested_series_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('series', NULL);
  END IF;

  IF (SELECT count(*) FROM (
      SELECT 1 FROM public.progress_adjustments WHERE series_id = requested_series_id LIMIT 251
    ) AS bounded_adjustments) > 250
    OR (SELECT count(*) FROM (
      SELECT 1 FROM public.progress_claims WHERE series_id = requested_series_id LIMIT 101
    ) AS bounded_claims) > 100
    OR (SELECT count(*) FROM (
      SELECT 1 FROM public.progress_payments WHERE series_id = requested_series_id LIMIT 501
    ) AS bounded_payments) > 500
    OR (SELECT count(*) FROM (
      SELECT 1 FROM public.progress_documents
      WHERE series_id = requested_series_id AND state = 'ready' LIMIT 101
    ) AS bounded_documents) > 100
    OR (SELECT count(*) FROM (
      SELECT 1 FROM public.progress_invoice_events WHERE series_id = requested_series_id LIMIT 21
    ) AS bounded_events) > 20 THEN
    RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF series_row.current_jobber_snapshot_id IS NOT NULL THEN
    SELECT snapshot.* INTO snapshot_row
    FROM public.progress_jobber_invoice_snapshots AS snapshot
    WHERE snapshot.id = series_row.current_jobber_snapshot_id
      AND snapshot.series_id = requested_series_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    imported_observation := jsonb_build_object(
      'original_invoice_number', snapshot_row.original_invoice_number,
      'observed_invoice_number', snapshot_row.observed_invoice_number,
      'normalized_status', snapshot_row.normalized_status,
      'invoice_subtotal', CASE WHEN snapshot_row.invoice_subtotal IS NULL THEN NULL ELSE pg_catalog.to_char(snapshot_row.invoice_subtotal, 'FM999999999999990.00') END,
      'invoice_tax', CASE WHEN snapshot_row.invoice_tax IS NULL THEN NULL ELSE pg_catalog.to_char(snapshot_row.invoice_tax, 'FM999999999999990.00') END,
      'invoice_total', CASE WHEN snapshot_row.invoice_total IS NULL THEN NULL ELSE pg_catalog.to_char(snapshot_row.invoice_total, 'FM999999999999990.00') END,
      'invoice_balance', CASE WHEN snapshot_row.invoice_balance IS NULL THEN NULL ELSE pg_catalog.to_char(snapshot_row.invoice_balance, 'FM999999999999990.00') END,
      'issued_date', snapshot_row.issued_date,
      'due_date', snapshot_row.due_date,
      'received_date', snapshot_row.received_date,
      'external_updated_at', snapshot_row.external_updated_at,
      'client_name', snapshot_row.client_name,
      'client_company_name', snapshot_row.client_company_name,
      'client_email', snapshot_row.client_email,
      'client_phone', snapshot_row.client_phone,
      'billing_address', snapshot_row.billing_address,
      'property_address', snapshot_row.property_address,
      'fetched_at', snapshot_row.fetched_at
    );
  END IF;

  IF series_row.current_revision_set_id IS NOT NULL THEN
    SELECT revision_set.* INTO current_set
    FROM public.progress_invoice_revision_sets AS revision_set
    WHERE revision_set.id = series_row.current_revision_set_id
      AND revision_set.series_id = requested_series_id
      AND revision_set.state = 'current';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*)::INT,
      (pg_catalog.array_agg(resolved.revision_id ORDER BY resolved.manifest_ordinal DESC))[1]
    INTO manifest_count, current_claim_revision_id
    FROM public.progress_resolve_current_manifest(requested_series_id) AS resolved;
    IF manifest_count <> jsonb_array_length(current_set.revision_manifest) THEN
      RAISE EXCEPTION 'PROGRESS_RESPONSE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    current_set_dto := jsonb_build_object(
      'id', current_set.id,
      'revision_manifest_hash', current_set.aggregate_financial_manifest_hash,
      'current_manifest_claim_count', manifest_count,
      'current_claim_revision_id', current_claim_revision_id
    );
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', adjustment.id,
    'type', adjustment.type,
    'status', adjustment.status,
    'effective_date', adjustment.effective_date,
    'display_order', adjustment.display_order,
    'description', adjustment.description,
    'amount_ex_gst', pg_catalog.to_char(adjustment.amount_ex_gst, 'FM999999999999990.00'),
    'gst_rate', pg_catalog.to_char(adjustment.gst_rate, 'FM0.00'),
    'reason', adjustment.reason,
    'version', adjustment.version
  ) ORDER BY adjustment.effective_date, adjustment.display_order, adjustment.id), '[]'::JSONB)
  INTO adjustments
  FROM public.progress_adjustments AS adjustment
  WHERE adjustment.series_id = requested_series_id;

  WITH manifested AS MATERIALIZED (
    SELECT * FROM public.progress_resolve_current_manifest(requested_series_id)
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
    'current_revision', CASE WHEN revision.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', revision.id,
      'revision_number', revision.revision_number,
      'state', revision.state,
      'issue_date', revision.issue_date,
      'due_date', revision.due_date,
      'description', revision.description,
      'reference', revision.reference,
      'current_claim_ex_gst', pg_catalog.to_char(revision.current_claim_ex_gst, 'FM999999999999990.00'),
      'current_claim_gst', pg_catalog.to_char(revision.current_claim_gst, 'FM999999999999990.00'),
      'current_claim_inc_gst', pg_catalog.to_char(revision.current_claim_inc_gst, 'FM999999999999990.00'),
      'cumulative_percentage', pg_catalog.to_char(revision.cumulative_percentage, 'FM999999990.000000'),
      'remaining_ex_gst', pg_catalog.to_char(revision.remaining_ex_gst, 'FM999999999999990.00'),
      'remaining_gst', pg_catalog.to_char(revision.remaining_gst, 'FM999999999999990.00'),
      'remaining_inc_gst', pg_catalog.to_char(revision.remaining_inc_gst, 'FM999999999999990.00'),
      'edit_classification', revision.edit_classification,
      'tax_review_state', revision.tax_review_state,
      'created_at', revision.created_at
    ) END
  ) ORDER BY claim.sequence, claim.id), '[]'::JSONB)
  INTO claims
  FROM public.progress_claims AS claim
  LEFT JOIN manifested ON manifested.claim_id = claim.id
  LEFT JOIN public.progress_claim_revisions AS revision
    ON revision.id = manifested.revision_id
   AND revision.claim_id = claim.id
  WHERE claim.series_id = requested_series_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', payment.id,
    'source', payment.source,
    'matched_manual_payment_id', payment.matched_manual_payment_id,
    'version', payment.version,
    'current_revision', CASE WHEN revision.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', revision.id,
      'revision_number', revision.revision_number,
      'received_date', revision.received_date,
      'observed_amount', pg_catalog.to_char(revision.observed_amount, 'FM999999999999990.00'),
      'effective_receipt_amount', pg_catalog.to_char(revision.effective_receipt_amount, 'FM999999999999990.00'),
      'payment_method', revision.payment_method,
      'reference', revision.reference,
      'external_status', revision.external_status,
      'external_updated_at', revision.external_updated_at,
      'sync_state', revision.sync_state,
      'status', revision.status,
      'source_observed_at', revision.source_observed_at,
      'reason', revision.reason,
      'created_at', revision.created_at
    ) END
  ) ORDER BY revision.received_date, payment.created_at, payment.id), '[]'::JSONB)
  INTO payments
  FROM public.progress_payments AS payment
  LEFT JOIN public.progress_payment_revisions AS revision
    ON revision.id = payment.current_revision_id
   AND revision.payment_id = payment.id
  WHERE payment.series_id = requested_series_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', document.id,
    'claim_revision_id', document.claim_revision_id,
    'revision_set_id', document.revision_set_id,
    'scope', document.scope,
    'format', document.format,
    'template_id', document.template_id,
    'template_version', document.template_version,
    'renderer_version', document.renderer_version,
    'sha256', document.sha256,
    'page_or_worksheet_count', document.page_or_worksheet_count,
    'revision_manifest_hash', document.revision_manifest_hash,
    'generated_at', document.generated_at,
    'created_at', document.created_at,
    'is_current', series_row.status <> 'void' AND (
      (document.scope = 'current_claim' AND document.claim_revision_id = current_claim_revision_id)
      OR (document.scope = 'series_bundle' AND document.revision_set_id = series_row.current_revision_set_id)
    )
  ) ORDER BY document.generated_at DESC, document.id DESC), '[]'::JSONB),
  COALESCE(bool_or(series_row.status <> 'void' AND (
    (document.scope = 'current_claim' AND document.claim_revision_id = current_claim_revision_id)
    OR (document.scope = 'series_bundle' AND document.revision_set_id = series_row.current_revision_set_id)
  )), false),
  COALESCE(bool_or(series_row.status = 'void' OR NOT (
    (document.scope = 'current_claim' AND document.claim_revision_id = current_claim_revision_id)
    OR (document.scope = 'series_bundle' AND document.revision_set_id = series_row.current_revision_set_id)
  )), false)
  INTO ready_documents, current_document_exists, historical_document_exists
  FROM public.progress_documents AS document
  WHERE document.series_id = requested_series_id
    AND document.state = 'ready';

  SELECT COALESCE(jsonb_agg(public.progress_safe_event_dto(event) ORDER BY event.occurred_at DESC, event.id DESC), '[]'::JSONB)
  INTO recent_events
  FROM public.progress_invoice_events AS event
  WHERE event.series_id = requested_series_id;

  RETURN jsonb_build_object(
    'series', public.progress_series_safe_dto(series_row),
    'summary', jsonb_build_object(
      'adjusted_ex_gst', pg_catalog.to_char(series_row.current_adjusted_contract_ex_gst, 'FM999999999999990.00'),
      'adjusted_gst', pg_catalog.to_char(series_row.current_adjusted_contract_gst, 'FM999999999999990.00'),
      'adjusted_inc_gst', pg_catalog.to_char(series_row.current_adjusted_contract_inc_gst, 'FM999999999999990.00'),
      'claimed_inc_gst', pg_catalog.to_char(series_row.current_claimed_inc_gst, 'FM999999999999990.00'),
      'received_inc_gst', pg_catalog.to_char(series_row.current_actual_receipts, 'FM999999999999990.00'),
      'outstanding_inc_gst', pg_catalog.to_char(series_row.current_outstanding_receivable, 'FM999999999999990.00'),
      'credit_balance_inc_gst', pg_catalog.to_char(series_row.current_credit_balance, 'FM999999999999990.00'),
      'unclaimed_inc_gst', pg_catalog.to_char(series_row.current_unclaimed_inc_gst, 'FM999999999999990.00'),
      'cumulative_percentage', pg_catalog.to_char(series_row.current_cumulative_percentage, 'FM999999990.000000')
    ),
    'imported_jobber_observation', imported_observation,
    'current_revision_set', current_set_dto,
    'adjustments', adjustments,
    'claims', claims,
    'payments', payments,
    'ready_documents', ready_documents,
    'recent_events', recent_events,
    'history', jsonb_build_object('next_cursor', NULL),
    'capabilities', jsonb_build_object(
      'can_edit_series', series_row.status <> 'void',
      'can_edit_base_contract', series_row.status <> 'void' AND manifest_count = 0,
      'can_void_series_directly', series_row.status <> 'void' AND manifest_count = 0,
      'requires_claim_void_workflow', series_row.status <> 'void' AND manifest_count > 0,
      'can_create_claim', series_row.status NOT IN ('void', 'reconciliation_required', 'completed'),
      'can_download_current', current_document_exists,
      'can_download_historical', historical_document_exists
    )
  );
END;
$$;

CREATE FUNCTION public.list_progress_invoice_history(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := auth.uid();
  unknown_keys TEXT[];
  requested_series_id UUID;
  requested_cursor UUID;
  requested_limit_numeric NUMERIC;
  requested_limit INT;
  cursor_occurred_at TIMESTAMPTZ;
  events JSONB;
  next_cursor UUID;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'PROGRESS_AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key)
  INTO unknown_keys
  FROM jsonb_object_keys(payload) AS keys(key)
  WHERE keys.key <> ALL (ARRAY['series_id', 'cursor', 'limit']::TEXT[]);
  IF unknown_keys IS NOT NULL
    OR (SELECT count(*) FROM jsonb_object_keys(payload)) <> 3
    OR jsonb_typeof(payload -> 'series_id') IS DISTINCT FROM 'string'
    OR (payload -> 'cursor' <> 'null'::JSONB AND jsonb_typeof(payload -> 'cursor') IS DISTINCT FROM 'string')
    OR jsonb_typeof(payload -> 'limit') IS DISTINCT FROM 'number'
    OR payload ->> 'series_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    OR (payload -> 'cursor' <> 'null'::JSONB AND payload ->> 'cursor' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$') THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
  END IF;
  requested_limit_numeric := (payload ->> 'limit')::NUMERIC;
  IF requested_limit_numeric <> trunc(requested_limit_numeric)
    OR requested_limit_numeric < 1 OR requested_limit_numeric > 50 THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  requested_series_id := (payload ->> 'series_id')::UUID;
  requested_limit := requested_limit_numeric::INT;

  IF NOT EXISTS (SELECT 1 FROM public.progress_invoice_series WHERE id = requested_series_id) THEN
    RETURN jsonb_build_object('events', '[]'::JSONB, 'next_cursor', NULL);
  END IF;

  IF payload -> 'cursor' <> 'null'::JSONB THEN
    requested_cursor := (payload ->> 'cursor')::UUID;
    SELECT event.occurred_at INTO cursor_occurred_at
    FROM public.progress_invoice_events AS event
    WHERE event.id = requested_cursor
      AND event.series_id = requested_series_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PROGRESS_CURSOR_INVALID' USING ERRCODE = '22023';
    END IF;
  END IF;

  WITH page AS MATERIALIZED (
    SELECT event.*,
      public.progress_safe_event_dto(event) AS event_dto,
      row_number() OVER (ORDER BY event.occurred_at DESC, event.id DESC) AS page_row
    FROM public.progress_invoice_events AS event
    WHERE event.series_id = requested_series_id
      AND (requested_cursor IS NULL OR (event.occurred_at, event.id) < (cursor_occurred_at, requested_cursor))
    ORDER BY event.occurred_at DESC, event.id DESC
    LIMIT requested_limit + 1
  )
  SELECT
    COALESCE(jsonb_agg(page.event_dto ORDER BY page.occurred_at DESC, page.id DESC)
      FILTER (WHERE page.page_row <= requested_limit), '[]'::JSONB),
    CASE WHEN count(*) > requested_limit
      THEN (pg_catalog.array_agg(page.id ORDER BY page.occurred_at DESC, page.id DESC)
        FILTER (WHERE page.page_row = requested_limit))[1]
      ELSE NULL END
  INTO events, next_cursor
  FROM page;

  RETURN jsonb_build_object('events', events, 'next_cursor', next_cursor);
END;
$$;

REVOKE ALL ON FUNCTION public.progress_safe_event_field_changes(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.progress_safe_event_dto(public.progress_invoice_events)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_progress_invoice_workspace(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_progress_invoice_history(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_progress_invoice_workspace(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_progress_invoice_history(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
