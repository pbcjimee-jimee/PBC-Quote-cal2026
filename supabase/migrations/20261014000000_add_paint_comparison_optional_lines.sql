ALTER TABLE public.quotes
  ADD COLUMN paint_comparisons JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD CONSTRAINT quotes_paint_comparisons_shape CHECK (
    jsonb_typeof(paint_comparisons) = 'array' AND jsonb_array_length(paint_comparisons) <= 1
    AND (jsonb_array_length(paint_comparisons) = 0 OR COALESCE((
      paint_comparisons #>> '{0,version}' = '1'
      AND jsonb_typeof(paint_comparisons #> '{0,alternatives}') = 'array'
      AND (paint_comparisons #>> '{0,key}') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    ), false))
  );

ALTER TABLE public.quote_items ADD COLUMN logical_key UUID,
  ADD COLUMN timber_role TEXT NOT NULL DEFAULT 'none';
ALTER TABLE public.quote_items DISABLE TRIGGER quote_parent_guard;
UPDATE public.quote_items SET logical_key = id;
ALTER TABLE public.quote_items ENABLE TRIGGER quote_parent_guard;
ALTER TABLE public.quote_items ALTER COLUMN logical_key SET NOT NULL,
  ALTER COLUMN logical_key SET DEFAULT gen_random_uuid(),
  ADD CONSTRAINT quote_items_logical_key_unique UNIQUE (logical_key),
  ADD CONSTRAINT quote_items_timber_role_check CHECK (timber_role IN ('none','shared','finish')),
  ADD CONSTRAINT quote_items_timber_interior_check CHECK (
    timber_role = 'none' OR (area_id IS NOT NULL AND area_scope_snapshot IS NOT DISTINCT FROM 'interior')
  );

ALTER TABLE public.jobber_quote_lines
  DROP CONSTRAINT jobber_quote_lines_unit_price_check,
  DROP CONSTRAINT jobber_quote_lines_total_price_check,
  ADD COLUMN optional BOOLEAN,
  ADD COLUMN recommended BOOLEAN,
  ADD COLUMN selected BOOLEAN,
  ADD COLUMN optional_write_policy TEXT NOT NULL DEFAULT 'preserve',
  ADD COLUMN recommended_write_policy TEXT NOT NULL DEFAULT 'preserve',
  ADD COLUMN paint_comparison_key UUID,
  ADD CONSTRAINT jobber_quote_lines_optional_write_policy_check CHECK (optional_write_policy IN ('preserve','set_true','set_false')),
  ADD CONSTRAINT jobber_quote_lines_recommended_write_policy_check CHECK (recommended_write_policy IN ('preserve','set_true','set_false')),
  ADD CONSTRAINT jobber_quote_lines_comparison_optional_check CHECK (
    paint_comparison_key IS NULL OR (kind = 'line_item' AND optional IS TRUE AND quantity IS NOT DISTINCT FROM 1 AND taxable AND client_visible)
  );

-- Remote-linked legacy observations remain unknown until read back from Jobber.
ALTER TABLE public.jobber_quote_lines DISABLE TRIGGER quote_parent_guard;
UPDATE public.jobber_quote_lines SET optional = false, recommended = false,
  optional_write_policy = 'set_false', recommended_write_policy = 'set_false'
WHERE jobber_line_item_id IS NULL;
ALTER TABLE public.jobber_quote_lines ENABLE TRIGGER quote_parent_guard;
CREATE UNIQUE INDEX jobber_quote_lines_comparison_unique
  ON public.jobber_quote_lines(quote_id, paint_comparison_key) WHERE paint_comparison_key IS NOT NULL;

CREATE FUNCTION app_auth.guard_paint_comparison_line()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.paint_comparison_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.quotes q WHERE q.id = NEW.quote_id
      AND q.paint_comparisons #>> '{0,key}' = NEW.paint_comparison_key::TEXT
  ) THEN
    RAISE EXCEPTION 'PAINT_COMPARISON_QUOTE_MISMATCH' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER paint_comparison_line_guard BEFORE INSERT OR UPDATE ON public.jobber_quote_lines
  FOR EACH ROW EXECUTE FUNCTION app_auth.guard_paint_comparison_line();
REVOKE ALL ON FUNCTION app_auth.guard_paint_comparison_line() FROM PUBLIC, anon, authenticated;
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
    paint_comparisons,
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
    COALESCE(quote_row -> 'paint_comparisons', '[]'::JSONB),
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
    logical_key, timber_role,
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
    COALESCE((item ->> 'logical_key')::UUID, gen_random_uuid()), COALESCE(item ->> 'timber_role', 'none'),
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
    optional, recommended, selected, optional_write_policy, recommended_write_policy, paint_comparison_key,
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
    (line ->> 'optional')::BOOLEAN, (line ->> 'recommended')::BOOLEAN, (line ->> 'selected')::BOOLEAN,
    COALESCE(line ->> 'optional_write_policy', 'preserve'), COALESCE(line ->> 'recommended_write_policy', 'preserve'), (line ->> 'paint_comparison_key')::UUID,
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
    paint_comparisons = COALESCE(quote_row -> 'paint_comparisons', '[]'::JSONB),
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
    logical_key, timber_role,
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
    COALESCE((item ->> 'logical_key')::UUID, gen_random_uuid()), COALESCE(item ->> 'timber_role', 'none'),
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
    optional, recommended, selected, optional_write_policy, recommended_write_policy, paint_comparison_key,
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
    (line ->> 'optional')::BOOLEAN, (line ->> 'recommended')::BOOLEAN, (line ->> 'selected')::BOOLEAN,
    COALESCE(line ->> 'optional_write_policy', 'preserve'), COALESCE(line ->> 'recommended_write_policy', 'preserve'), (line ->> 'paint_comparison_key')::UUID,
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


NOTIFY pgrst, 'reload schema';
