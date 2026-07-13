ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE OR REPLACE FUNCTION create_quote_with_children(payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  created_quote_id UUID;
  quote_row JSONB := payload -> 'quote';
  revision_row JSONB := payload -> 'price_revision';
  option_payload JSONB;
  option_id UUID;
BEGIN
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
  RETURNING quotes.id, quotes.version INTO updated_quote;

  IF updated_quote.id IS NULL THEN
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

NOTIFY pgrst, 'reload schema';
