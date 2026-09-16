ALTER TABLE public.quotes
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT quotes_deleted_actor_requires_timestamp CHECK (deleted_at IS NOT NULL OR deleted_by IS NULL);

CREATE INDEX idx_quotes_active_created ON public.quotes(created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_deleted_at ON public.quotes(deleted_at DESC, id DESC) WHERE deleted_at IS NOT NULL;

CREATE TABLE public.quote_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('deleted', 'restored')),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  quote_version INTEGER NOT NULL,
  UNIQUE (quote_id, quote_version)
);
CREATE INDEX idx_quote_lifecycle_events_quote ON public.quote_lifecycle_events(quote_id, occurred_at DESC);
ALTER TABLE public.quote_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quote_lifecycle_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.quote_lifecycle_events TO authenticated, service_role;
CREATE POLICY quote_lifecycle_events_admin_select ON public.quote_lifecycle_events
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
REVOKE DELETE ON public.quotes FROM authenticated, service_role;

CREATE FUNCTION app_auth.lock_quote_writes()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  RETURN NULL;
END;
$$;

CREATE FUNCTION app_auth.quote_identity_keys(jobber_id TEXT, snapshot JSONB)
RETURNS TEXT[] LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  keys TEXT[] := ARRAY[]::TEXT[];
  clean_id TEXT := nullif(btrim(jobber_id), '');
  quote_number TEXT := nullif(btrim(snapshot ->> 'quoteNumber'), '');
  decoded TEXT;
BEGIN
  IF clean_id IS NOT NULL THEN
    keys := array_append(keys, clean_id);
    BEGIN
      decoded := convert_from(decode(clean_id, 'base64'), 'UTF8');
      IF decoded ~ '^gid://Jobber/Quote/[0-9]+$' THEN
        keys := array_append(keys, substring(decoded FROM '[0-9]+$'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  IF quote_number IS NOT NULL THEN keys := array_append(keys, quote_number); END IF;
  RETURN keys;
END;
$$;

CREATE FUNCTION app_auth.guard_quote_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  changing_state BOOLEAN := false;
  restoring BOOLEAN := false;
  matching_deleted BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL OR NEW.deleted_by IS NOT NULL THEN
      RAISE EXCEPTION 'QUOTE_DELETED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    changing_state := (OLD.deleted_at IS NULL) <> (NEW.deleted_at IS NULL);
    restoring := OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL;
    IF OLD.deleted_at IS NOT NULL AND NOT changing_state THEN
      IF pg_trigger_depth() > 1 AND NEW.deleted_by IS NULL AND OLD.deleted_by IS NOT NULL
        AND (to_jsonb(NEW) - 'deleted_by') = (to_jsonb(OLD) - 'deleted_by') THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'QUOTE_DELETED' USING ERRCODE = 'P0001';
    END IF;
    IF changing_state THEN
      IF auth.uid() IS NULL OR app_auth.current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
      END IF;
      IF (to_jsonb(NEW) - ARRAY['deleted_at','deleted_by','version','updated_at','updated_by'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['deleted_at','deleted_by','version','updated_at','updated_by']) THEN
        RAISE EXCEPTION 'QUOTE_LIFECYCLE_FIELDS_ONLY' USING ERRCODE = 'P0001';
      END IF;
      NEW.deleted_at := CASE WHEN restoring THEN NULL ELSE clock_timestamp() END;
      NEW.deleted_by := CASE WHEN restoring THEN NULL ELSE auth.uid() END;
      NEW.version := OLD.version + 1;
      NEW.updated_at := clock_timestamp();
      NEW.updated_by := auth.uid();
    ELSIF NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
      RAISE EXCEPTION 'QUOTE_LIFECYCLE_FIELDS_ONLY' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR restoring OR (
    app_auth.quote_identity_keys(NEW.jobber_quote_id, NEW.jobber_snapshot)
      IS DISTINCT FROM app_auth.quote_identity_keys(OLD.jobber_quote_id, OLD.jobber_snapshot)
  ) THEN
    SELECT q.deleted_at IS NOT NULL INTO matching_deleted
    FROM public.quotes q
    WHERE q.id <> NEW.id
      AND app_auth.quote_identity_keys(q.jobber_quote_id, q.jobber_snapshot)
        && app_auth.quote_identity_keys(NEW.jobber_quote_id, NEW.jobber_snapshot)
      AND (NOT restoring OR q.deleted_at IS NULL)
    ORDER BY q.deleted_at NULLS LAST LIMIT 1;
    IF FOUND THEN
      IF restoring THEN RAISE EXCEPTION 'QUOTE_RESTORE_CONFLICT' USING ERRCODE = 'P0001'; END IF;
      IF matching_deleted THEN RAISE EXCEPTION 'QUOTE_IN_TRASH' USING ERRCODE = 'P0001'; END IF;
      RAISE EXCEPTION 'QUOTE_JOBBER_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app_auth.record_quote_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (OLD.deleted_at IS NULL) <> (NEW.deleted_at IS NULL) THEN
    IF auth.uid() IS NULL OR app_auth.current_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.quote_lifecycle_events(quote_id, event_type, actor_id, quote_version)
    VALUES (NEW.id, CASE WHEN NEW.deleted_at IS NULL THEN 'restored' ELSE 'deleted' END, auth.uid(), NEW.version);
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION app_auth.guard_quote_children()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  old_parent UUID;
  new_parent UUID;
  parent RECORD;
BEGIN
  IF TG_TABLE_NAME = 'quote_option_items' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT quote_id INTO old_parent FROM public.quote_options WHERE id = (to_jsonb(OLD)->>'option_id')::UUID;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT quote_id INTO new_parent FROM public.quote_options WHERE id = (to_jsonb(NEW)->>'option_id')::UUID;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN old_parent := (to_jsonb(OLD)->>'quote_id')::UUID; END IF;
    IF TG_OP <> 'DELETE' THEN new_parent := (to_jsonb(NEW)->>'quote_id')::UUID; END IF;
  END IF;
  FOR parent IN
    SELECT id, deleted_at FROM public.quotes
    WHERE id = ANY(ARRAY[old_parent, new_parent]) ORDER BY id FOR UPDATE
  LOOP
    IF parent.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'QUOTE_DELETED' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE relation_name TEXT;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['quotes','quote_items','quote_options','quote_option_items','quote_memos','jobber_quote_lines','quote_price_revisions'] LOOP
    EXECUTE format('CREATE TRIGGER quote_write_lock BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION app_auth.lock_quote_writes()', relation_name);
    IF relation_name <> 'quotes' THEN
      EXECUTE format('CREATE TRIGGER quote_parent_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_auth.guard_quote_children()', relation_name);
    END IF;
  END LOOP;
END;
$$;
CREATE TRIGGER quote_lifecycle_guard BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION app_auth.guard_quote_lifecycle();
CREATE TRIGGER quote_lifecycle_record AFTER UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION app_auth.record_quote_lifecycle();

CREATE FUNCTION public.soft_delete_quote(target_quote_id UUID, expected_version INTEGER)
RETURNS TABLE(id UUID, version INTEGER, deleted_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE current_quote public.quotes;
BEGIN
  IF auth.uid() IS NULL OR app_auth.current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF expected_version IS NULL OR expected_version < 1 THEN
    RAISE EXCEPTION 'QUOTE_VERSION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO current_quote FROM public.quotes q WHERE q.id = target_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF current_quote.deleted_at IS NOT NULL THEN
    RETURN QUERY SELECT current_quote.id, current_quote.version, current_quote.deleted_at;
    RETURN;
  END IF;
  IF current_quote.version <> expected_version THEN
    RAISE EXCEPTION 'QUOTE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY UPDATE public.quotes q SET deleted_at = clock_timestamp()
    WHERE q.id = target_quote_id RETURNING q.id, q.version, q.deleted_at;
END;
$$;

CREATE FUNCTION public.restore_quote(target_quote_id UUID, expected_version INTEGER)
RETURNS TABLE(id UUID, version INTEGER, deleted_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE current_quote public.quotes;
BEGIN
  IF auth.uid() IS NULL OR app_auth.current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF expected_version IS NULL OR expected_version < 1 THEN
    RAISE EXCEPTION 'QUOTE_VERSION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO current_quote FROM public.quotes q WHERE q.id = target_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF current_quote.deleted_at IS NULL THEN
    RETURN QUERY SELECT current_quote.id, current_quote.version, current_quote.deleted_at;
    RETURN;
  END IF;
  IF current_quote.version <> expected_version THEN
    RAISE EXCEPTION 'QUOTE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY UPDATE public.quotes q SET deleted_at = NULL, deleted_by = NULL
    WHERE q.id = target_quote_id RETURNING q.id, q.version, q.deleted_at;
END;
$$;

REVOKE ALL ON FUNCTION app_auth.lock_quote_writes(), app_auth.guard_quote_lifecycle(),
  app_auth.record_quote_lifecycle(), app_auth.guard_quote_children() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION app_auth.quote_identity_keys(TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_auth.quote_identity_keys(TEXT, JSONB) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.soft_delete_quote(UUID, INTEGER), public.restore_quote(UUID, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.soft_delete_quote(UUID, INTEGER), public.restore_quote(UUID, INTEGER) TO authenticated;
CREATE OR REPLACE FUNCTION create_quote_with_children(payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  created_quote_id UUID;
  quote_row JSONB := payload -> 'quote';
  revision_row JSONB := payload -> 'price_revision';
  option_payload JSONB;
  option_id UUID;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  INSERT INTO quotes (
    customer_name,
    customer_address,
    jobber_quote_id,
    jobber_snapshot,
    jobber_save_mode,
    jobber_sync_status,
    jobber_last_synced_at,
    jobber_sync_error,
    area_sqft,
    work_type,
    working_days,
    labour_per_day,
    formula1_total,
    formula2_total,
    formula3_total,
    formula4_total,
    formula5_total,
    selected_min,
    selected_max,
    interior_selected_min,
    interior_selected_max,
    exterior_selected_min,
    exterior_selected_max,
    roof_selected_min,
    roof_selected_max,
    subtotal,
    final_total,
    pricing_settings_snapshot,
    created_by,
    updated_by
  )
  VALUES (
    quote_row ->> 'customer_name',
    quote_row ->> 'customer_address',
    quote_row ->> 'jobber_quote_id',
    quote_row -> 'jobber_snapshot',
    quote_row ->> 'jobber_save_mode',
    COALESCE(quote_row ->> 'jobber_sync_status', 'not_synced'),
    (quote_row ->> 'jobber_last_synced_at')::TIMESTAMPTZ,
    quote_row ->> 'jobber_sync_error',
    (quote_row ->> 'area_sqft')::INT,
    quote_row ->> 'work_type',
    (quote_row ->> 'working_days')::NUMERIC,
    (quote_row ->> 'labour_per_day')::NUMERIC,
    (quote_row ->> 'formula1_total')::NUMERIC,
    (quote_row ->> 'formula2_total')::NUMERIC,
    (quote_row ->> 'formula3_total')::NUMERIC,
    (quote_row ->> 'formula4_total')::NUMERIC,
    (quote_row ->> 'formula5_total')::NUMERIC,
    (quote_row ->> 'selected_min')::INT,
    (quote_row ->> 'selected_max')::INT,
    (quote_row ->> 'interior_selected_min')::INT,
    (quote_row ->> 'interior_selected_max')::INT,
    (quote_row ->> 'exterior_selected_min')::INT,
    (quote_row ->> 'exterior_selected_max')::INT,
    (quote_row ->> 'roof_selected_min')::INT,
    (quote_row ->> 'roof_selected_max')::INT,
    (quote_row ->> 'subtotal')::NUMERIC,
    (quote_row ->> 'final_total')::NUMERIC,
    quote_row -> 'pricing_settings_snapshot',
    (quote_row ->> 'created_by')::UUID,
    (quote_row ->> 'updated_by')::UUID
  )
  RETURNING id INTO created_quote_id;

  IF revision_row IS NOT NULL AND jsonb_typeof(revision_row) = 'object' THEN
    INSERT INTO quote_price_revisions (
      quote_id,
      revision_number,
      event_type,
      previous_subtotal,
      previous_final_total,
      new_subtotal,
      new_final_total,
      previous_jobber_lines_total,
      new_jobber_lines_total,
      previous_options_subtotal,
      new_options_subtotal,
      previous_options_final_total,
      new_options_final_total,
      changed_by
    )
    VALUES (
      created_quote_id,
      (revision_row ->> 'revision_number')::INT,
      revision_row ->> 'event_type',
      (revision_row ->> 'previous_subtotal')::NUMERIC,
      (revision_row ->> 'previous_final_total')::NUMERIC,
      (revision_row ->> 'new_subtotal')::NUMERIC,
      (revision_row ->> 'new_final_total')::NUMERIC,
      (revision_row ->> 'previous_jobber_lines_total')::NUMERIC,
      (revision_row ->> 'new_jobber_lines_total')::NUMERIC,
      (revision_row ->> 'previous_options_subtotal')::NUMERIC,
      (revision_row ->> 'new_options_subtotal')::NUMERIC,
      (revision_row ->> 'previous_options_final_total')::NUMERIC,
      (revision_row ->> 'new_options_final_total')::NUMERIC,
      (revision_row ->> 'changed_by')::UUID
    );
  END IF;

  INSERT INTO quote_items (
    quote_id,
    product_id,
    product_name_snapshot,
    market_price_snapshot,
    actual_price_snapshot,
    quantity,
    working_days,
    labour_per_day,
    area_id,
    area_name_snapshot,
    area_scope_snapshot,
    is_custom,
    memo,
    position
  )
  SELECT
    created_quote_id,
    (item ->> 'product_id')::UUID,
    item ->> 'product_name_snapshot',
    (item ->> 'market_price_snapshot')::NUMERIC,
    (item ->> 'actual_price_snapshot')::NUMERIC,
    (item ->> 'quantity')::NUMERIC,
    (item ->> 'working_days')::NUMERIC,
    (item ->> 'labour_per_day')::NUMERIC,
    (item ->> 'area_id')::UUID,
    item ->> 'area_name_snapshot',
    item ->> 'area_scope_snapshot',
    COALESCE((item ->> 'is_custom')::BOOLEAN, false),
    COALESCE(item ->> 'memo', ''),
    (item ->> 'position')::INT
  FROM jsonb_array_elements(COALESCE(payload -> 'items', '[]'::JSONB)) AS item;

  FOR option_payload IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload -> 'options', '[]'::JSONB))
  LOOP
    INSERT INTO quote_options (
      quote_id,
      title,
      working_days,
      labour_per_day,
      material_market,
      material_actual,
      formula1_total,
      formula2_total,
      formula3_total,
      formula4_total,
      formula5_total,
      selected_min,
      selected_max,
      subtotal,
      final_total,
      position
    )
    VALUES (
      created_quote_id,
      option_payload #>> '{option,title}',
      (option_payload #>> '{option,working_days}')::NUMERIC,
      (option_payload #>> '{option,labour_per_day}')::NUMERIC,
      (option_payload #>> '{option,material_market}')::NUMERIC,
      (option_payload #>> '{option,material_actual}')::NUMERIC,
      (option_payload #>> '{option,formula1_total}')::NUMERIC,
      (option_payload #>> '{option,formula2_total}')::NUMERIC,
      (option_payload #>> '{option,formula3_total}')::NUMERIC,
      (option_payload #>> '{option,formula4_total}')::NUMERIC,
      (option_payload #>> '{option,formula5_total}')::NUMERIC,
      (option_payload #>> '{option,selected_min}')::INT,
      (option_payload #>> '{option,selected_max}')::INT,
      (option_payload #>> '{option,subtotal}')::NUMERIC,
      (option_payload #>> '{option,final_total}')::NUMERIC,
      (option_payload #>> '{option,position}')::INT
    )
    RETURNING id INTO option_id;

    INSERT INTO quote_option_items (
      option_id,
      product_id,
      product_name_snapshot,
      market_price_snapshot,
      actual_price_snapshot,
      quantity,
      working_days,
      labour_per_day,
      area_id,
      area_name_snapshot,
      area_scope_snapshot,
      is_custom,
      memo,
      position
    )
    SELECT
      option_id,
      (item ->> 'product_id')::UUID,
      item ->> 'product_name_snapshot',
      (item ->> 'market_price_snapshot')::NUMERIC,
      (item ->> 'actual_price_snapshot')::NUMERIC,
      (item ->> 'quantity')::NUMERIC,
      (item ->> 'working_days')::NUMERIC,
      (item ->> 'labour_per_day')::NUMERIC,
      (item ->> 'area_id')::UUID,
      item ->> 'area_name_snapshot',
      item ->> 'area_scope_snapshot',
      COALESCE((item ->> 'is_custom')::BOOLEAN, false),
      COALESCE(item ->> 'memo', ''),
      (item ->> 'position')::INT
    FROM jsonb_array_elements(COALESCE(option_payload -> 'items', '[]'::JSONB)) AS item;
  END LOOP;

  INSERT INTO jobber_quote_lines (
    quote_id,
    kind,
    name,
    description,
    quantity,
    unit_price,
    total_price,
    taxable,
    client_visible,
    jobber_line_item_id,
    linked_product_or_service_id,
    position
  )
  SELECT
    created_quote_id,
    line ->> 'kind',
    line ->> 'name',
    line ->> 'description',
    (line ->> 'quantity')::NUMERIC,
    (line ->> 'unit_price')::NUMERIC,
    (line ->> 'total_price')::NUMERIC,
    COALESCE((line ->> 'taxable')::BOOLEAN, true),
    COALESCE((line ->> 'client_visible')::BOOLEAN, true),
    line ->> 'jobber_line_item_id',
    line ->> 'linked_product_or_service_id',
    (line ->> 'position')::INT
  FROM jsonb_array_elements(COALESCE(payload -> 'jobber_lines', '[]'::JSONB)) AS line;

  INSERT INTO quote_memos (quote_id, body, position, created_by)
  SELECT
    created_quote_id,
    memo ->> 'body',
    (memo ->> 'position')::INT,
    (memo ->> 'created_by')::UUID
  FROM jsonb_array_elements(COALESCE(payload -> 'memos', '[]'::JSONB)) AS memo;

  RETURN created_quote_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_quote_with_children(payload JSONB)
RETURNS TABLE(id UUID, version INT)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  target_quote_id UUID := (payload ->> 'id')::UUID;
  expected_version INT := (payload ->> 'expected_version')::INT;
  quote_row JSONB := payload -> 'quote';
  revision_row JSONB := payload -> 'price_revision';
  option_payload JSONB;
  option_id UUID;
  updated_quote RECORD;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  UPDATE quotes
  SET
    customer_name = quote_row ->> 'customer_name',
    customer_address = quote_row ->> 'customer_address',
    jobber_quote_id = quote_row ->> 'jobber_quote_id',
    jobber_save_mode = quote_row ->> 'jobber_save_mode',
    jobber_sync_status = COALESCE(quote_row ->> 'jobber_sync_status', 'not_synced'),
    jobber_last_synced_at = (quote_row ->> 'jobber_last_synced_at')::TIMESTAMPTZ,
    jobber_sync_error = quote_row ->> 'jobber_sync_error',
    area_sqft = (quote_row ->> 'area_sqft')::INT,
    work_type = quote_row ->> 'work_type',
    working_days = (quote_row ->> 'working_days')::NUMERIC,
    labour_per_day = (quote_row ->> 'labour_per_day')::NUMERIC,
    formula1_total = (quote_row ->> 'formula1_total')::NUMERIC,
    formula2_total = (quote_row ->> 'formula2_total')::NUMERIC,
    formula3_total = (quote_row ->> 'formula3_total')::NUMERIC,
    formula4_total = (quote_row ->> 'formula4_total')::NUMERIC,
    formula5_total = (quote_row ->> 'formula5_total')::NUMERIC,
    selected_min = (quote_row ->> 'selected_min')::INT,
    selected_max = (quote_row ->> 'selected_max')::INT,
    interior_selected_min = (quote_row ->> 'interior_selected_min')::INT,
    interior_selected_max = (quote_row ->> 'interior_selected_max')::INT,
    exterior_selected_min = (quote_row ->> 'exterior_selected_min')::INT,
    exterior_selected_max = (quote_row ->> 'exterior_selected_max')::INT,
    roof_selected_min = (quote_row ->> 'roof_selected_min')::INT,
    roof_selected_max = (quote_row ->> 'roof_selected_max')::INT,
    subtotal = (quote_row ->> 'subtotal')::NUMERIC,
    final_total = (quote_row ->> 'final_total')::NUMERIC,
    pricing_settings_snapshot = quote_row -> 'pricing_settings_snapshot',
    updated_by = (quote_row ->> 'updated_by')::UUID,
    updated_at = now(),
    version = quotes.version + 1,
    jobber_snapshot = CASE
      WHEN quote_row ? 'jobber_snapshot' THEN quote_row -> 'jobber_snapshot'
      ELSE quotes.jobber_snapshot
    END,
    jobber_snapshot_refreshed_at = CASE
      WHEN quote_row ? 'jobber_snapshot_refreshed_at' THEN (quote_row ->> 'jobber_snapshot_refreshed_at')::TIMESTAMPTZ
      ELSE quotes.jobber_snapshot_refreshed_at
    END,
    jobber_snapshot_change_status = CASE
      WHEN quote_row ? 'jobber_snapshot_change_status' THEN quote_row ->> 'jobber_snapshot_change_status'
      ELSE quotes.jobber_snapshot_change_status
    END,
    jobber_snapshot_change_summary = CASE
      WHEN quote_row ? 'jobber_snapshot_change_summary' THEN quote_row -> 'jobber_snapshot_change_summary'
      ELSE quotes.jobber_snapshot_change_summary
    END,
    jobber_snapshot_refresh_error = CASE
      WHEN quote_row ? 'jobber_snapshot_refresh_error' THEN quote_row ->> 'jobber_snapshot_refresh_error'
      ELSE quotes.jobber_snapshot_refresh_error
    END
  WHERE quotes.id = target_quote_id
    AND quotes.version = expected_version
    AND quotes.deleted_at IS NULL
  RETURNING quotes.id, quotes.version INTO updated_quote;

  IF updated_quote.id IS NULL THEN
    IF EXISTS (SELECT 1 FROM quotes WHERE quotes.id = target_quote_id AND quotes.deleted_at IS NOT NULL) THEN
      RAISE EXCEPTION 'QUOTE_DELETED' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM quotes WHERE quotes.id = target_quote_id) THEN
      RAISE EXCEPTION 'QUOTE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF revision_row IS NOT NULL AND jsonb_typeof(revision_row) = 'object' THEN
    INSERT INTO quote_price_revisions (
      quote_id,
      revision_number,
      event_type,
      previous_subtotal,
      previous_final_total,
      new_subtotal,
      new_final_total,
      previous_jobber_lines_total,
      new_jobber_lines_total,
      previous_options_subtotal,
      new_options_subtotal,
      previous_options_final_total,
      new_options_final_total,
      changed_by
    )
    VALUES (
      target_quote_id,
      (revision_row ->> 'revision_number')::INT,
      revision_row ->> 'event_type',
      (revision_row ->> 'previous_subtotal')::NUMERIC,
      (revision_row ->> 'previous_final_total')::NUMERIC,
      (revision_row ->> 'new_subtotal')::NUMERIC,
      (revision_row ->> 'new_final_total')::NUMERIC,
      (revision_row ->> 'previous_jobber_lines_total')::NUMERIC,
      (revision_row ->> 'new_jobber_lines_total')::NUMERIC,
      (revision_row ->> 'previous_options_subtotal')::NUMERIC,
      (revision_row ->> 'new_options_subtotal')::NUMERIC,
      (revision_row ->> 'previous_options_final_total')::NUMERIC,
      (revision_row ->> 'new_options_final_total')::NUMERIC,
      (revision_row ->> 'changed_by')::UUID
    );
  END IF;

  DELETE FROM quote_items WHERE quote_id = target_quote_id;
  DELETE FROM quote_options WHERE quote_id = target_quote_id;
  DELETE FROM jobber_quote_lines WHERE quote_id = target_quote_id;
  DELETE FROM quote_memos WHERE quote_id = target_quote_id;

  INSERT INTO quote_items (
    quote_id,
    product_id,
    product_name_snapshot,
    market_price_snapshot,
    actual_price_snapshot,
    quantity,
    working_days,
    labour_per_day,
    area_id,
    area_name_snapshot,
    area_scope_snapshot,
    is_custom,
    memo,
    position
  )
  SELECT
    target_quote_id,
    (item ->> 'product_id')::UUID,
    item ->> 'product_name_snapshot',
    (item ->> 'market_price_snapshot')::NUMERIC,
    (item ->> 'actual_price_snapshot')::NUMERIC,
    (item ->> 'quantity')::NUMERIC,
    (item ->> 'working_days')::NUMERIC,
    (item ->> 'labour_per_day')::NUMERIC,
    (item ->> 'area_id')::UUID,
    item ->> 'area_name_snapshot',
    item ->> 'area_scope_snapshot',
    COALESCE((item ->> 'is_custom')::BOOLEAN, false),
    COALESCE(item ->> 'memo', ''),
    (item ->> 'position')::INT
  FROM jsonb_array_elements(COALESCE(payload -> 'items', '[]'::JSONB)) AS item;

  FOR option_payload IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload -> 'options', '[]'::JSONB))
  LOOP
    INSERT INTO quote_options (
      quote_id,
      title,
      working_days,
      labour_per_day,
      material_market,
      material_actual,
      formula1_total,
      formula2_total,
      formula3_total,
      formula4_total,
      formula5_total,
      selected_min,
      selected_max,
      subtotal,
      final_total,
      position
    )
    VALUES (
      target_quote_id,
      option_payload #>> '{option,title}',
      (option_payload #>> '{option,working_days}')::NUMERIC,
      (option_payload #>> '{option,labour_per_day}')::NUMERIC,
      (option_payload #>> '{option,material_market}')::NUMERIC,
      (option_payload #>> '{option,material_actual}')::NUMERIC,
      (option_payload #>> '{option,formula1_total}')::NUMERIC,
      (option_payload #>> '{option,formula2_total}')::NUMERIC,
      (option_payload #>> '{option,formula3_total}')::NUMERIC,
      (option_payload #>> '{option,formula4_total}')::NUMERIC,
      (option_payload #>> '{option,formula5_total}')::NUMERIC,
      (option_payload #>> '{option,selected_min}')::INT,
      (option_payload #>> '{option,selected_max}')::INT,
      (option_payload #>> '{option,subtotal}')::NUMERIC,
      (option_payload #>> '{option,final_total}')::NUMERIC,
      (option_payload #>> '{option,position}')::INT
    )
    RETURNING quote_options.id INTO option_id;

    INSERT INTO quote_option_items (
      option_id,
      product_id,
      product_name_snapshot,
      market_price_snapshot,
      actual_price_snapshot,
      quantity,
      working_days,
      labour_per_day,
      area_id,
      area_name_snapshot,
      area_scope_snapshot,
      is_custom,
      memo,
      position
    )
    SELECT
      option_id,
      (item ->> 'product_id')::UUID,
      item ->> 'product_name_snapshot',
      (item ->> 'market_price_snapshot')::NUMERIC,
      (item ->> 'actual_price_snapshot')::NUMERIC,
      (item ->> 'quantity')::NUMERIC,
      (item ->> 'working_days')::NUMERIC,
      (item ->> 'labour_per_day')::NUMERIC,
      (item ->> 'area_id')::UUID,
      item ->> 'area_name_snapshot',
      item ->> 'area_scope_snapshot',
      COALESCE((item ->> 'is_custom')::BOOLEAN, false),
      COALESCE(item ->> 'memo', ''),
      (item ->> 'position')::INT
    FROM jsonb_array_elements(COALESCE(option_payload -> 'items', '[]'::JSONB)) AS item;
  END LOOP;

  INSERT INTO jobber_quote_lines (
    quote_id,
    kind,
    name,
    description,
    quantity,
    unit_price,
    total_price,
    taxable,
    client_visible,
    jobber_line_item_id,
    linked_product_or_service_id,
    position
  )
  SELECT
    target_quote_id,
    line ->> 'kind',
    line ->> 'name',
    line ->> 'description',
    (line ->> 'quantity')::NUMERIC,
    (line ->> 'unit_price')::NUMERIC,
    (line ->> 'total_price')::NUMERIC,
    COALESCE((line ->> 'taxable')::BOOLEAN, true),
    COALESCE((line ->> 'client_visible')::BOOLEAN, true),
    line ->> 'jobber_line_item_id',
    line ->> 'linked_product_or_service_id',
    (line ->> 'position')::INT
  FROM jsonb_array_elements(COALESCE(payload -> 'jobber_lines', '[]'::JSONB)) AS line;

  INSERT INTO quote_memos (quote_id, body, position, created_by)
  SELECT
    target_quote_id,
    memo ->> 'body',
    (memo ->> 'position')::INT,
    (memo ->> 'created_by')::UUID
  FROM jsonb_array_elements(COALESCE(payload -> 'memos', '[]'::JSONB)) AS memo;

  RETURN QUERY SELECT updated_quote.id::UUID, updated_quote.version::INT;
END;
$$;

CREATE FUNCTION public.find_quote_by_jobber_identity(jobber_id TEXT, snapshot JSONB)
RETURNS TABLE(id UUID, version INTEGER, deleted_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT q.id, q.version, q.deleted_at FROM public.quotes q
  WHERE app_auth.quote_identity_keys(q.jobber_quote_id, q.jobber_snapshot)
    && app_auth.quote_identity_keys(jobber_id, snapshot)
  ORDER BY q.created_at, q.id;
$$;

CREATE FUNCTION public.apply_quote_jobber_result(
  target_quote_id UUID, expected_version INTEGER, changes JSONB, synced_lines JSONB DEFAULT '[]'::JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_quote public.quotes;
  result_quote public.quotes;
BEGIN
  IF auth.uid() IS NULL OR app_auth.current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO current_quote FROM public.quotes WHERE id = target_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND'; END IF;
  IF current_quote.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'QUOTE_DELETED'; END IF;
  IF expected_version IS NULL OR current_quote.version <> expected_version THEN
    RAISE EXCEPTION 'QUOTE_VERSION_CONFLICT';
  END IF;
  IF changes IS NULL OR jsonb_typeof(changes) <> 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(changes) AS key WHERE key <> ALL(ARRAY[
      'jobber_sync_status','jobber_last_synced_at','jobber_sync_error','jobber_snapshot',
      'jobber_snapshot_refreshed_at','jobber_snapshot_change_status',
      'jobber_snapshot_change_summary','jobber_snapshot_refresh_error'
    ])
  ) THEN RAISE EXCEPTION 'INVALID_JOBBER_RESULT'; END IF;
  result_quote := jsonb_populate_record(current_quote, changes);
  UPDATE public.quotes SET
    jobber_sync_status = result_quote.jobber_sync_status,
    jobber_last_synced_at = result_quote.jobber_last_synced_at,
    jobber_sync_error = result_quote.jobber_sync_error,
    jobber_snapshot = result_quote.jobber_snapshot,
    jobber_snapshot_refreshed_at = result_quote.jobber_snapshot_refreshed_at,
    jobber_snapshot_change_status = result_quote.jobber_snapshot_change_status,
    jobber_snapshot_change_summary = result_quote.jobber_snapshot_change_summary,
    jobber_snapshot_refresh_error = result_quote.jobber_snapshot_refresh_error
  WHERE quotes.id = target_quote_id;
  UPDATE public.jobber_quote_lines line SET jobber_line_item_id = result ->> 'jobberLineItemId'
  FROM jsonb_array_elements(synced_lines) AS result
  WHERE line.quote_id = target_quote_id AND line.position = (result ->> 'sourcePosition')::INTEGER;
END;
$$;
REVOKE ALL ON FUNCTION public.find_quote_by_jobber_identity(TEXT, JSONB) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.apply_quote_jobber_result(UUID, INTEGER, JSONB, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.find_quote_by_jobber_identity(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_quote_jobber_result(UUID, INTEGER, JSONB, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
