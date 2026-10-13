-- Preserve immutable legacy operations while extending new public line write contracts.
BEGIN;

CREATE OR REPLACE FUNCTION app_auth.normalized_jobber_item_is_valid(item JSONB, confirmed_id_required BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT app_auth.jsonb_has_only_keys(item, ARRAY[
      'sourcePosition','kind','name','description','quantity','unitPrice','totalPrice','taxable',
      'productOrServiceId','jobberLineItemId','sortOrder','optional','recommended'
    ])
    AND item ? 'kind' AND item->>'kind' IN ('line_item','text')
    AND item ? 'name' AND jsonb_typeof(item->'name') = 'string'
    AND item ? 'description' AND jsonb_typeof(item->'description') = 'string'
    AND (NOT item ? 'sourcePosition' OR (
      jsonb_typeof(item->'sourcePosition') = 'number'
      AND (item->>'sourcePosition')::NUMERIC >= 0
      AND (item->>'sourcePosition')::NUMERIC = trunc((item->>'sourcePosition')::NUMERIC)
    ))
    AND (NOT item ? 'sortOrder' OR (
      jsonb_typeof(item->'sortOrder') = 'number'
      AND (item->>'sortOrder')::NUMERIC >= 0
      AND (item->>'sortOrder')::NUMERIC = trunc((item->>'sortOrder')::NUMERIC)
    ))
    AND (NOT item ? 'quantity' OR jsonb_typeof(item->'quantity') = 'number')
    AND (NOT item ? 'unitPrice' OR jsonb_typeof(item->'unitPrice') = 'number')
    AND (NOT item ? 'totalPrice' OR jsonb_typeof(item->'totalPrice') = 'number')
    AND (NOT item ? 'optional' OR jsonb_typeof(item->'optional') = 'boolean')
    AND (NOT item ? 'recommended' OR jsonb_typeof(item->'recommended') = 'boolean')
    AND (NOT item ? 'taxable' OR jsonb_typeof(item->'taxable') = 'boolean')
    AND (NOT item ? 'productOrServiceId' OR (
      jsonb_typeof(item->'productOrServiceId') = 'string'
      AND length(btrim(item->>'productOrServiceId')) BETWEEN 1 AND 512
    ))
    AND (NOT item ? 'jobberLineItemId' OR (
      jsonb_typeof(item->'jobberLineItemId') = 'string'
      AND length(btrim(item->>'jobberLineItemId')) BETWEEN 1 AND 512
    ))
    AND (NOT confirmed_id_required OR (
      item ? 'jobberLineItemId'
      AND jsonb_typeof(item->'jobberLineItemId') = 'string'
      AND length(btrim(item->>'jobberLineItemId')) BETWEEN 1 AND 512
    ));
$$;

CREATE OR REPLACE FUNCTION app_auth.expected_jobber_completion_items(desired_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE save_mode TEXT := desired_payload->>'saveMode';
DECLARE source_line JSONB;
DECLARE expected_item JSONB;
DECLARE expected_items JSONB := '[]'::JSONB;
DECLARE source_ordinal INTEGER;
DECLARE quantity_value NUMERIC;
DECLARE unit_price_value NUMERIC;
DECLARE total_unit_price NUMERIC;
BEGIN
  IF jsonb_typeof(desired_payload)<>'object'
    OR jsonb_typeof(desired_payload->'lines')<>'array'
    OR save_mode NOT IN ('priced_line_items','description_total') THEN
    RETURN NULL;
  END IF;

  FOR source_line, source_ordinal IN
    SELECT item, (ordinality-1)::INTEGER
    FROM jsonb_array_elements(desired_payload->'lines') WITH ORDINALITY source(item,ordinality)
    ORDER BY ordinality
  LOOP
    IF save_mode='description_total' OR source_line->>'kind'='text' THEN
      expected_item := jsonb_build_object(
        'sourcePosition',(source_line->>'position')::INTEGER,
        'kind','text',
        'name',app_auth.trim_jobber_text(source_line->>'name'),
        'description',app_auth.trim_jobber_text(source_line->>'description'),
        'sortOrder',source_ordinal
      );
    ELSE
      quantity_value := round(COALESCE((source_line->>'quantity')::NUMERIC,1),2);
      unit_price_value := round(COALESCE((source_line->>'unitPrice')::NUMERIC,0),2);
      expected_item := jsonb_build_object(
        'sourcePosition',(source_line->>'position')::INTEGER,
        'kind','line_item',
        'name',app_auth.trim_jobber_text(source_line->>'name'),
        'description',app_auth.trim_jobber_text(source_line->>'description'),
        'quantity',quantity_value,
        'unitPrice',unit_price_value,
        'totalPrice',round(quantity_value*unit_price_value,2),
        'taxable',COALESCE((source_line->>'taxable')::BOOLEAN,true),
        'productOrServiceId',nullif(btrim(source_line->>'linkedProductOrServiceId'),''),
        'sortOrder',source_ordinal
      );
      IF source_line ? 'optionalWritePolicy' AND (
        source_line->>'optionalWritePolicy' IN ('set_true','set_false')
        OR nullif(btrim(source_line->>'jobberLineItemId'),'') IS NULL
      ) THEN
        expected_item := expected_item || jsonb_build_object(
          'optional', source_line->>'optionalWritePolicy' = 'set_true'
        );
      END IF;
      IF source_line ? 'recommendedWritePolicy' AND (
        source_line->>'recommendedWritePolicy' IN ('set_true','set_false')
        OR nullif(btrim(source_line->>'jobberLineItemId'),'') IS NULL
      ) THEN
        expected_item := expected_item || jsonb_build_object(
          'recommended', source_line->>'recommendedWritePolicy' = 'set_true'
        );
      END IF;
    END IF;
    IF nullif(btrim(source_line->>'jobberLineItemId'),'') IS NOT NULL THEN
      expected_item := expected_item || jsonb_build_object(
        'jobberLineItemId',btrim(source_line->>'jobberLineItemId')
      );
    END IF;
    expected_items := expected_items || jsonb_build_array(jsonb_strip_nulls(expected_item));
  END LOOP;

  IF save_mode='description_total' THEN
    total_unit_price := round((desired_payload->>'finalTotal')::NUMERIC
      / CASE WHEN COALESCE((desired_payload->>'finalTotalIncludesGst')::BOOLEAN,false) THEN 1.10 ELSE 1 END,2);
    expected_item := jsonb_build_object(
      'kind','line_item','name','Total','description','',
      'quantity',1,'unitPrice',total_unit_price,'totalPrice',total_unit_price,
      'taxable',true,'sortOrder',jsonb_array_length(expected_items)
    );
    IF nullif(btrim(desired_payload->>'totalLineItemId'),'') IS NOT NULL THEN
      expected_item := expected_item || jsonb_build_object(
        'jobberLineItemId',btrim(desired_payload->>'totalLineItemId')
      );
    END IF;
    expected_items := expected_items || jsonb_build_array(expected_item);
  END IF;
  RETURN expected_items;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR division_by_zero THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app_auth.build_jobber_desired_payload(target_quote_id UUID, extra_deleted_ids JSONB DEFAULT '[]'::JSONB)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_quote public.quotes;
DECLARE saved_lines JSONB;
DECLARE deletion_ids JSONB;
DECLARE visible_ids JSONB;
DECLARE known_total_id TEXT;
BEGIN
  PERFORM app_auth.require_active_admin();
  SELECT * INTO current_quote FROM public.quotes quote_row WHERE quote_row.id = target_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF current_quote.jobber_quote_id IS NULL OR btrim(current_quote.jobber_quote_id) = '' THEN
    RAISE EXCEPTION 'JOBBER_QUOTE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT line.position FROM public.jobber_quote_lines line
    WHERE line.quote_id = target_quote_id AND line.client_visible
    GROUP BY line.position HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'DUPLICATE_JOBBER_SOURCE_POSITION' USING ERRCODE = '22023'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'kind', line.kind,
    'name', app_auth.trim_jobber_text(line.name),
    'description', app_auth.trim_jobber_text(line.description),
    'quantity', line.quantity,
    'unitPrice', line.unit_price,
    'totalPrice', line.total_price,
    'taxable', line.taxable,
    'optional', line.optional,
    'recommended', line.recommended,
    'selected', line.selected,
    'optionalWritePolicy', CASE WHEN current_quote.jobber_save_mode = 'description_total' THEN NULL ELSE line.optional_write_policy END,
    'recommendedWritePolicy', CASE WHEN current_quote.jobber_save_mode = 'description_total' THEN NULL ELSE line.recommended_write_policy END,
    'paintComparisonKey', line.paint_comparison_key,
    'clientVisible', true,
    'jobberLineItemId', nullif(btrim(line.jobber_line_item_id), ''),
    'linkedProductOrServiceId', nullif(btrim(line.linked_product_or_service_id), ''),
    'position', line.position
  )) ORDER BY line.position, line.id), '[]'::JSONB),
  COALESCE(jsonb_agg(to_jsonb(btrim(line.jobber_line_item_id)))
    FILTER (WHERE nullif(btrim(line.jobber_line_item_id), '') IS NOT NULL), '[]'::JSONB)
  INTO saved_lines, visible_ids
  FROM public.jobber_quote_lines line
  WHERE line.quote_id = target_quote_id AND line.client_visible;

  deletion_ids := app_auth.jobber_id_union(current_quote.jobber_pending_deleted_line_item_ids, extra_deleted_ids);
  known_total_id := app_auth.latest_jobber_total_line_id(current_quote.jobber_quote_id);
  IF current_quote.jobber_save_mode IS DISTINCT FROM 'description_total' AND known_total_id IS NOT NULL THEN
    deletion_ids := app_auth.jobber_id_union(deletion_ids, jsonb_build_array(known_total_id));
  ELSIF current_quote.jobber_save_mode = 'description_total' AND known_total_id IS NOT NULL THEN
    visible_ids := app_auth.jobber_id_union(visible_ids, jsonb_build_array(known_total_id));
  END IF;
  SELECT COALESCE(jsonb_agg(item ORDER BY ordinality), '[]'::JSONB) INTO deletion_ids
  FROM jsonb_array_elements(app_auth.sanitize_jobber_ids(deletion_ids)) WITH ORDINALITY source(item, ordinality)
  WHERE NOT (visible_ids @> jsonb_build_array(item));

  RETURN jsonb_build_object(
    'saveMode', COALESCE(current_quote.jobber_save_mode, 'priced_line_items'),
    'finalTotal', current_quote.final_total::TEXT,
    'finalTotalIncludesGst', true,
    'lines', saved_lines,
    'deletedJobberLineItemIds', deletion_ids,
    'totalLineItemId', CASE WHEN current_quote.jobber_save_mode = 'description_total' THEN known_total_id ELSE NULL END
  );
END;
$$;

COMMIT;
