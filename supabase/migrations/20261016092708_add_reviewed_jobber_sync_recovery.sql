BEGIN;

CREATE TABLE public.jobber_sync_recoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL UNIQUE REFERENCES public.jobber_sync_operations(id) ON DELETE RESTRICT,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  old_quote_version INTEGER NOT NULL CHECK (old_quote_version > 0),
  new_quote_version INTEGER NOT NULL CHECK (new_quote_version = old_quote_version + 1),
  line_mappings JSONB NOT NULL CHECK (jsonb_typeof(line_mappings) = 'array'),
  observed_remote_ids JSONB NOT NULL CHECK (app_auth.jobber_id_array_is_valid(observed_remote_ids)),
  pending_deleted_ids JSONB NOT NULL CHECK (app_auth.jobber_id_array_is_valid(pending_deleted_ids)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.jobber_sync_recoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY jobber_sync_recoveries_admin_select ON public.jobber_sync_recoveries
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
REVOKE ALL ON TABLE public.jobber_sync_recoveries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.jobber_sync_recoveries TO authenticated;

CREATE FUNCTION app_auth.recover_jobber_sync_operation_impl(
  target_operation_id UUID, target_quote_id UUID, expected_version INTEGER,
  line_mappings JSONB, observed_remote_ids JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor UUID := app_auth.require_active_admin();
DECLARE operation_row public.jobber_sync_operations;
DECLARE current_quote public.quotes;
DECLARE step public.jobber_sync_steps;
DECLARE eligible_ids JSONB := '[]'::JSONB;
DECLARE mapped_ids JSONB;
DECLARE pending_ids JSONB;
DECLARE request_ids JSONB;
DECLARE result_ids JSONB;
DECLARE expected_synced JSONB;
DECLARE mapping JSONB;
DECLARE created_id TEXT;
DECLARE line_uuid UUID;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO operation_row FROM public.jobber_sync_operations
    WHERE id = target_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO current_quote FROM public.quotes WHERE id = target_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF operation_row.quote_id IS DISTINCT FROM target_quote_id
    OR NOT app_auth.jobber_remote_ids_match(current_quote.jobber_quote_id, operation_row.jobber_quote_id) THEN
    RAISE EXCEPTION 'SYNC_RECOVERY_QUOTE_MISMATCH' USING ERRCODE = '22023';
  END IF;
  IF current_quote.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'QUOTE_DELETED' USING ERRCODE = 'P0001'; END IF;
  IF expected_version IS NULL OR current_quote.version <> expected_version THEN
    RAISE EXCEPTION 'QUOTE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF current_quote.jobber_save_mode IS DISTINCT FROM 'priced_line_items'
    OR operation_row.desired_payload->>'saveMode' IS DISTINCT FROM 'priced_line_items' THEN
    RAISE EXCEPTION 'SYNC_RECOVERY_UNSUPPORTED_MODE' USING ERRCODE = 'P0001';
  END IF;
  IF operation_row.status <> 'reconciliation_required'
    OR COALESCE(operation_row.failure_code, '') LIKE 'legacy_%'
    OR operation_row.attempt_count < 1 THEN
    RAISE EXCEPTION 'SYNC_RECOVERY_NOT_ELIGIBLE' USING ERRCODE = 'P0001';
  END IF;
  IF operation_row.lease_expires_at > clock_timestamp() THEN
    RAISE EXCEPTION 'SYNC_RECOVERY_LEASE_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.jobber_sync_operations other
    WHERE other.id <> target_operation_id
      AND other.status IN ('queued', 'running', 'retryable', 'reconciliation_required')
      AND (other.quote_id = target_quote_id
        OR app_auth.jobber_remote_ids_match(other.jobber_quote_id, operation_row.jobber_quote_id))
  ) THEN RAISE EXCEPTION 'SYNC_RECOVERY_OTHER_OPERATION' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobber_sync_steps WHERE operation_id = target_operation_id)
    OR EXISTS (SELECT 1 FROM public.jobber_sync_steps WHERE operation_id = target_operation_id AND status <> 'applied') THEN
    RAISE EXCEPTION 'SYNC_STEPS_INCOMPLETE' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(line_mappings) IS DISTINCT FROM 'array'
    OR jsonb_typeof(observed_remote_ids) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_SYNC_RECOVERY_INPUT' USING ERRCODE = '22023';
  END IF;
  IF app_auth.jobber_id_array_is_valid(observed_remote_ids) IS NOT TRUE
    OR jsonb_array_length(observed_remote_ids) = 0
    OR observed_remote_ids IS DISTINCT FROM app_auth.sanitize_jobber_ids(observed_remote_ids) THEN
    RAISE EXCEPTION 'INVALID_SYNC_RECOVERY_OBSERVATION' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(operation_row.desired_payload->'lines') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SYNC_RECOVERY_INVALID_JOURNAL' USING ERRCODE = 'P0001';
  END IF;
  SELECT app_auth.sanitize_jobber_ids(COALESCE(jsonb_agg(line->'jobberLineItemId'), '[]'::JSONB))
    INTO eligible_ids FROM jsonb_array_elements(operation_row.desired_payload->'lines') line;
  IF nullif(btrim(operation_row.desired_payload->>'totalLineItemId'), '') IS NOT NULL THEN
    eligible_ids := app_auth.jobber_id_union(eligible_ids, jsonb_build_array(operation_row.desired_payload->>'totalLineItemId'));
  END IF;

  FOR step IN SELECT * FROM public.jobber_sync_steps
    WHERE operation_id = target_operation_id ORDER BY sequence FOR UPDATE LOOP
    IF app_auth.jobber_step_request_is_valid(step.kind, step.request_payload) IS NOT TRUE
      OR app_auth.jobber_step_result_is_valid(step.result_payload) IS NOT TRUE THEN
      RAISE EXCEPTION 'SYNC_RECOVERY_INVALID_JOURNAL' USING ERRCODE = 'P0001';
    END IF;
    IF step.kind = 'create' THEN
      result_ids := step.result_payload->'createdLineItemIds';
      IF jsonb_typeof(result_ids) IS DISTINCT FROM 'array' OR jsonb_array_length(result_ids) <> 1 THEN
        RAISE EXCEPTION 'SYNC_RECOVERY_INVALID_JOURNAL' USING ERRCODE = 'P0001';
      END IF;
      created_id := result_ids->>0;
      IF created_id <> btrim(created_id) OR eligible_ids @> result_ids
        OR step.request_payload->'lineItems'->0 ? 'jobberLineItemId'
        OR step.result_payload ?| ARRAY['editedLineItemIds', 'deletedLineItemIds'] THEN
        RAISE EXCEPTION 'SYNC_RECOVERY_INVALID_JOURNAL' USING ERRCODE = 'P0001';
      END IF;
      expected_synced := CASE WHEN step.request_payload->'lineItems'->0 ? 'sourcePosition'
        THEN jsonb_build_array(jsonb_build_object(
          'sourcePosition', step.request_payload->'lineItems'->0->'sourcePosition', 'jobberLineItemId', created_id))
        ELSE '[]'::JSONB END;
      IF COALESCE(step.result_payload->'syncedLineItems', '[]'::JSONB) IS DISTINCT FROM expected_synced THEN
        RAISE EXCEPTION 'SYNC_RECOVERY_INVALID_JOURNAL' USING ERRCODE = 'P0001';
      END IF;
      eligible_ids := app_auth.jobber_id_union(eligible_ids, result_ids);
    ELSE
      IF step.kind = 'delete' THEN
        request_ids := step.request_payload->'lineItemIds';
        result_ids := step.result_payload->'deletedLineItemIds';
        IF step.result_payload ?| ARRAY['createdLineItemIds', 'editedLineItemIds', 'syncedLineItems'] THEN
          RAISE EXCEPTION 'SYNC_RECOVERY_INVALID_JOURNAL' USING ERRCODE = 'P0001';
        END IF;
      ELSE
        IF app_auth.normalized_jobber_items_are_valid(step.request_payload->'lineItems', true) IS NOT TRUE THEN
          RAISE EXCEPTION 'SYNC_RECOVERY_INVALID_JOURNAL' USING ERRCODE = 'P0001';
        END IF;
        SELECT jsonb_agg(item->'jobberLineItemId') INTO request_ids
          FROM jsonb_array_elements(step.request_payload->'lineItems') item;
        result_ids := step.result_payload->'editedLineItemIds';
        IF step.result_payload ?| ARRAY['createdLineItemIds', 'deletedLineItemIds'] THEN
          RAISE EXCEPTION 'SYNC_RECOVERY_INVALID_JOURNAL' USING ERRCODE = 'P0001';
        END IF;
        IF step.kind = 'edit' THEN
          SELECT COALESCE(jsonb_agg(jsonb_build_object('sourcePosition', item->'sourcePosition',
            'jobberLineItemId', item->'jobberLineItemId')), '[]'::JSONB) INTO expected_synced
            FROM jsonb_array_elements(step.request_payload->'lineItems') item WHERE item ? 'sourcePosition';
          IF COALESCE(step.result_payload->'syncedLineItems', '[]'::JSONB) IS DISTINCT FROM expected_synced THEN
            RAISE EXCEPTION 'SYNC_RECOVERY_INVALID_JOURNAL' USING ERRCODE = 'P0001';
          END IF;
        END IF;
      END IF;
      IF result_ids IS NULL OR result_ids IS DISTINCT FROM app_auth.sanitize_jobber_ids(result_ids)
        OR request_ids IS DISTINCT FROM app_auth.sanitize_jobber_ids(request_ids)
        OR NOT (request_ids @> result_ids AND result_ids @> request_ids) THEN
        RAISE EXCEPTION 'SYNC_RECOVERY_INVALID_JOURNAL' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;

  FOR mapping IN SELECT value FROM jsonb_array_elements(line_mappings) LOOP
    IF app_auth.jsonb_has_only_keys(mapping, ARRAY['lineId', 'jobberLineItemId']) IS NOT TRUE
      OR jsonb_typeof(mapping->'lineId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(mapping->'jobberLineItemId') IS DISTINCT FROM 'string'
      OR length(mapping->>'jobberLineItemId') NOT BETWEEN 1 AND 512
      OR mapping->>'jobberLineItemId' <> btrim(mapping->>'jobberLineItemId') THEN
      RAISE EXCEPTION 'INVALID_SYNC_RECOVERY_MAPPING' USING ERRCODE = '22023';
    END IF;
    BEGIN line_uuid := (mapping->>'lineId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_SYNC_RECOVERY_MAPPING' USING ERRCODE = '22023';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.jobber_quote_lines
      WHERE id = line_uuid AND quote_id = target_quote_id AND client_visible) THEN
      RAISE EXCEPTION 'SYNC_RECOVERY_LINE_MISMATCH' USING ERRCODE = '22023';
    END IF;
    IF NOT (observed_remote_ids @> jsonb_build_array(mapping->>'jobberLineItemId')) THEN
      RAISE EXCEPTION 'SYNC_RECOVERY_UNKNOWN_REMOTE_ID' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(line_mappings) item
    GROUP BY (item->>'lineId')::UUID HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(line_mappings) item
    GROUP BY item->>'jobberLineItemId' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'SYNC_RECOVERY_DUPLICATE_MAPPING' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.jobber_quote_lines line WHERE line.quote_id = target_quote_id AND line.client_visible
      AND nullif(btrim(line.jobber_line_item_id), '') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(line_mappings) item WHERE (item->>'lineId')::UUID = line.id)
  ) THEN RAISE EXCEPTION 'SYNC_RECOVERY_EXISTING_MAPPING_REQUIRED' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(jsonb_agg(item->'jobberLineItemId'), '[]'::JSONB) INTO mapped_ids
    FROM jsonb_array_elements(line_mappings) item;
  SELECT app_auth.jobber_id_union(eligible_ids, COALESCE(jsonb_agg(to_jsonb(line.jobber_line_item_id)), '[]'::JSONB))
    INTO eligible_ids FROM public.jobber_quote_lines line
    WHERE line.quote_id = target_quote_id AND NOT line.client_visible
      AND nullif(btrim(line.jobber_line_item_id), '') IS NOT NULL;
  IF EXISTS (
    SELECT 1 FROM public.jobber_quote_lines line JOIN public.quotes other ON other.id = line.quote_id
    WHERE other.id <> target_quote_id AND other.deleted_at IS NULL
      AND app_auth.jobber_remote_ids_match(other.jobber_quote_id, operation_row.jobber_quote_id)
      AND (eligible_ids @> jsonb_build_array(line.jobber_line_item_id)
        OR mapped_ids @> jsonb_build_array(line.jobber_line_item_id))
  ) THEN RAISE EXCEPTION 'SYNC_RECOVERY_REMOTE_ID_IN_USE' USING ERRCODE = 'P0001'; END IF;
  SELECT COALESCE(jsonb_agg(item ORDER BY ordinality), '[]'::JSONB) INTO pending_ids
    FROM jsonb_array_elements(app_auth.jobber_id_union(current_quote.jobber_pending_deleted_line_item_ids, eligible_ids))
      WITH ORDINALITY source(item, ordinality)
    WHERE NOT (mapped_ids @> jsonb_build_array(item));

  UPDATE public.jobber_quote_lines line SET jobber_line_item_id = item->>'jobberLineItemId'
    FROM jsonb_array_elements(line_mappings) item
    WHERE line.id = (item->>'lineId')::UUID AND line.quote_id = target_quote_id;
  -- Retire only the reviewed operation before the quote-version trigger runs.
  UPDATE public.jobber_sync_operations SET status = 'superseded', failure_code = 'recovery_reviewed',
    claim_token = NULL, lease_expires_at = NULL WHERE id = target_operation_id;
  UPDATE public.quotes SET version = version + 1, updated_by = actor, updated_at = clock_timestamp(),
    jobber_sync_status = 'not_synced', jobber_sync_error = NULL, jobber_pending_deleted_line_item_ids = pending_ids
    WHERE id = target_quote_id;
  INSERT INTO public.jobber_sync_recoveries(operation_id, quote_id, actor_id, old_quote_version,
    new_quote_version, line_mappings, observed_remote_ids, pending_deleted_ids)
    VALUES(target_operation_id, target_quote_id, actor, expected_version, expected_version + 1,
      line_mappings, observed_remote_ids, pending_ids);
  RETURN jsonb_build_object('id', target_quote_id, 'version', expected_version + 1);
END;
$$;

CREATE FUNCTION public.recover_jobber_sync_operation(
  operation_id UUID, target_quote_id UUID, expected_version INTEGER,
  line_mappings JSONB, observed_remote_ids JSONB
)
RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_auth.recover_jobber_sync_operation_impl(
    operation_id, target_quote_id, expected_version, line_mappings, observed_remote_ids);
$$;

REVOKE ALL ON FUNCTION app_auth.recover_jobber_sync_operation_impl(UUID,UUID,INTEGER,JSONB,JSONB),
  public.recover_jobber_sync_operation(UUID,UUID,INTEGER,JSONB,JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_auth.recover_jobber_sync_operation_impl(UUID,UUID,INTEGER,JSONB,JSONB),
  public.recover_jobber_sync_operation(UUID,UUID,INTEGER,JSONB,JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
