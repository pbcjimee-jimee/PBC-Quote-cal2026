ALTER TABLE public.quotes
  ADD COLUMN jobber_pending_deleted_line_item_ids JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE TABLE public.jobber_sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  quote_version INTEGER NOT NULL CHECK (quote_version > 0),
  jobber_quote_id TEXT NOT NULL CHECK (length(btrim(jobber_quote_id)) > 0),
  desired_payload JSONB NOT NULL CHECK (jsonb_typeof(desired_payload) = 'object'),
  status TEXT NOT NULL CHECK (status IN (
    'queued', 'running', 'retryable', 'reconciliation_required', 'succeeded', 'superseded'
  )),
  claim_token UUID,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  failure_code TEXT,
  result JSONB CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (quote_id, quote_version)
);

CREATE INDEX idx_jobber_sync_operations_remote_status
  ON public.jobber_sync_operations(jobber_quote_id, status, created_at);
CREATE INDEX idx_jobber_sync_operations_quote_status
  ON public.jobber_sync_operations(quote_id, status, created_at);
CREATE INDEX idx_jobber_sync_operations_created_by
  ON public.jobber_sync_operations(created_by);

CREATE TABLE public.jobber_sync_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID NOT NULL REFERENCES public.jobber_sync_operations(id) ON DELETE RESTRICT,
  step_key TEXT NOT NULL CHECK (length(btrim(step_key)) BETWEEN 1 AND 200),
  sequence INTEGER NOT NULL CHECK (sequence >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('edit', 'create', 'delete', 'reorder')),
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('sending', 'applied')),
  result_payload JSONB CHECK (result_payload IS NULL OR jsonb_typeof(result_payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (operation_id, step_key),
  UNIQUE (operation_id, sequence)
);

CREATE INDEX idx_jobber_sync_steps_operation
  ON public.jobber_sync_steps(operation_id, sequence);

ALTER TABLE public.jobber_sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobber_sync_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobber_sync_operations_admin_select ON public.jobber_sync_operations
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');
CREATE POLICY jobber_sync_steps_admin_select ON public.jobber_sync_steps
  FOR SELECT TO authenticated USING (app_auth.current_role() = 'admin');

REVOKE ALL ON TABLE public.jobber_sync_operations FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.jobber_sync_steps FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (
  id, quote_id, quote_version, jobber_quote_id, desired_payload, status, lease_expires_at,
  attempt_count, failure_code, result, created_at, updated_at
) ON public.jobber_sync_operations TO authenticated;
GRANT SELECT ON TABLE public.jobber_sync_steps TO authenticated;

CREATE FUNCTION app_auth.jobber_id_array_is_valid(value JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_typeof(value) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(value) item
      WHERE jsonb_typeof(item) <> 'string'
        OR length(btrim(item #>> '{}')) NOT BETWEEN 1 AND 512
    );
$$;

ALTER TABLE public.quotes ADD CONSTRAINT quotes_jobber_pending_deleted_ids_valid
  CHECK (app_auth.jobber_id_array_is_valid(jobber_pending_deleted_line_item_ids));

CREATE FUNCTION app_auth.sanitize_jobber_ids(value JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(clean_id) ORDER BY first_ordinal), '[]'::JSONB)
  FROM (
    SELECT btrim(item #>> '{}') AS clean_id, min(ordinality) AS first_ordinal
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::JSONB END)
      WITH ORDINALITY AS source(item, ordinality)
    WHERE jsonb_typeof(item) = 'string'
      AND length(btrim(item #>> '{}')) BETWEEN 1 AND 512
    GROUP BY btrim(item #>> '{}')
  ) ids;
$$;

CREATE FUNCTION app_auth.jobber_id_union(left_value JSONB, right_value JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT app_auth.sanitize_jobber_ids(
    (CASE WHEN jsonb_typeof(left_value) = 'array' THEN left_value ELSE '[]'::JSONB END)
    || (CASE WHEN jsonb_typeof(right_value) = 'array' THEN right_value ELSE '[]'::JSONB END)
  );
$$;

CREATE FUNCTION app_auth.jobber_remote_ids_match(left_id TEXT, right_id TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT COALESCE(
    app_auth.quote_identity_keys(left_id, NULL::JSONB)
      && app_auth.quote_identity_keys(right_id, NULL::JSONB),
    false
  );
$$;

CREATE FUNCTION app_auth.trim_jobber_text(value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.btrim(COALESCE(value,''),
    U&'\0009\000B\000C\0020\00A0\FEFF\000A\000D\2028\2029\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\202F\205F\3000');
$$;

CREATE FUNCTION app_auth.jsonb_has_only_keys(value JSONB, allowed_keys TEXT[])
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(value) key_name
      WHERE NOT (key_name = ANY(allowed_keys))
    );
$$;

CREATE FUNCTION app_auth.normalized_jobber_item_is_valid(item JSONB, confirmed_id_required BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT app_auth.jsonb_has_only_keys(item, ARRAY[
      'sourcePosition','kind','name','description','quantity','unitPrice','totalPrice','taxable',
      'productOrServiceId','jobberLineItemId','sortOrder'
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

CREATE FUNCTION app_auth.normalized_jobber_items_are_valid(value JSONB, confirmed_ids_required BOOLEAN DEFAULT false)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_typeof(value) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(value) item
      WHERE NOT app_auth.normalized_jobber_item_is_valid(item, confirmed_ids_required)
    )
    AND NOT EXISTS (
      SELECT item->>'sourcePosition'
      FROM jsonb_array_elements(value) item
      WHERE item ? 'sourcePosition'
      GROUP BY item->>'sourcePosition' HAVING count(*) > 1
    )
    AND (
      NOT confirmed_ids_required OR NOT EXISTS (
        SELECT item->>'jobberLineItemId'
        FROM jsonb_array_elements(value) item
        GROUP BY item->>'jobberLineItemId' HAVING count(*) > 1
      )
    );
$$;

CREATE FUNCTION app_auth.jobber_step_request_is_valid(step_kind TEXT, value JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT value IS NOT NULL
    AND step_kind IN ('edit','create','delete','reorder')
    AND app_auth.jsonb_has_only_keys(value, ARRAY['lineItems','lineItemIds'])
    AND value ? 'lineItems'
    AND app_auth.normalized_jobber_items_are_valid(value->'lineItems', false)
    AND (NOT value ? 'lineItemIds' OR app_auth.jobber_id_array_is_valid(value->'lineItemIds'))
    AND CASE step_kind
      WHEN 'create' THEN jsonb_array_length(value->'lineItems') = 1
      WHEN 'edit' THEN jsonb_array_length(value->'lineItems') > 0
      WHEN 'reorder' THEN jsonb_array_length(value->'lineItems') > 0
      WHEN 'delete' THEN jsonb_array_length(value->'lineItems') = 0
        AND value ? 'lineItemIds' AND jsonb_array_length(value->'lineItemIds') > 0
      ELSE false
    END;
$$;

CREATE FUNCTION app_auth.synced_jobber_items_are_valid(value JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_typeof(value) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(value) item
      WHERE NOT app_auth.jsonb_has_only_keys(item, ARRAY['sourcePosition','jobberLineItemId'])
        OR NOT item ? 'sourcePosition' OR jsonb_typeof(item->'sourcePosition') <> 'number'
        OR (item->>'sourcePosition')::NUMERIC < 0
        OR (item->>'sourcePosition')::NUMERIC <> trunc((item->>'sourcePosition')::NUMERIC)
        OR NOT item ? 'jobberLineItemId' OR jsonb_typeof(item->'jobberLineItemId') <> 'string'
        OR length(btrim(item->>'jobberLineItemId')) NOT BETWEEN 1 AND 512
    )
    AND NOT EXISTS (
      SELECT item->>'sourcePosition' FROM jsonb_array_elements(value) item
      GROUP BY item->>'sourcePosition' HAVING count(*) > 1
    );
$$;

CREATE FUNCTION app_auth.jobber_step_result_is_valid(value JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT value IS NOT NULL
    AND app_auth.jsonb_has_only_keys(value, ARRAY[
      'createdLineItemIds','editedLineItemIds','deletedLineItemIds','syncedLineItems'
    ])
    AND (NOT value ? 'createdLineItemIds' OR app_auth.jobber_id_array_is_valid(value->'createdLineItemIds'))
    AND (NOT value ? 'editedLineItemIds' OR app_auth.jobber_id_array_is_valid(value->'editedLineItemIds'))
    AND (NOT value ? 'deletedLineItemIds' OR app_auth.jobber_id_array_is_valid(value->'deletedLineItemIds'))
    AND (NOT value ? 'syncedLineItems' OR app_auth.synced_jobber_items_are_valid(value->'syncedLineItems'));
$$;

CREATE FUNCTION app_auth.jobber_completion_is_valid(value JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT $1 IS NOT NULL
    AND app_auth.jsonb_has_only_keys($1, ARRAY['syncedLineItems','expectedLineItems','deletedLineItemIds'])
    AND $1 ? 'syncedLineItems' AND app_auth.synced_jobber_items_are_valid($1->'syncedLineItems')
    AND $1 ? 'expectedLineItems' AND app_auth.normalized_jobber_items_are_valid($1->'expectedLineItems', true)
    AND $1 ? 'deletedLineItemIds' AND app_auth.jobber_id_array_is_valid($1->'deletedLineItemIds')
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements($1->'syncedLineItems') synced
      WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements($1->'expectedLineItems') expected
        WHERE expected->>'sourcePosition' = synced->>'sourcePosition'
          AND expected->>'jobberLineItemId' = synced->>'jobberLineItemId'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements($1->'expectedLineItems') expected
      WHERE expected ? 'sourcePosition' AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements($1->'syncedLineItems') synced
        WHERE synced->>'sourcePosition' = expected->>'sourcePosition'
          AND synced->>'jobberLineItemId' = expected->>'jobberLineItemId'
      )
    );
$$;

CREATE FUNCTION app_auth.expected_jobber_completion_items(desired_payload JSONB)
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

CREATE FUNCTION app_auth.require_active_admin()
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor UUID := auth.uid();
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_profiles profile
    WHERE profile.id = actor AND profile.role = 'admin' AND profile.is_active
  ) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN actor;
END;
$$;

CREATE FUNCTION app_auth.mark_expired_jobber_sync_claim(target_operation_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM app_auth.require_active_admin();
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  UPDATE public.jobber_sync_operations
  SET status='reconciliation_required',failure_code='lease_expired'
  WHERE id=target_operation_id AND status='running'
    AND lease_expires_at IS NOT NULL AND lease_expires_at<=clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE FUNCTION app_auth.jobber_completion_matches_operation(
  target_operation_id UUID, target_result_payload JSONB
)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_row public.jobber_sync_operations;
DECLARE expected_template JSONB;
DECLARE actual_item JSONB;
DECLARE template_item JSONB;
DECLARE actual_id TEXT;
DECLARE known_id TEXT;
DECLARE desired_deleted_ids JSONB;
DECLARE actual_deleted_ids JSONB;
DECLARE id_is_journaled BOOLEAN;
BEGIN
  PERFORM app_auth.require_active_admin();
  SELECT * INTO operation_row FROM public.jobber_sync_operations WHERE id=target_operation_id;
  IF NOT FOUND THEN RETURN false; END IF;
  expected_template := app_auth.expected_jobber_completion_items(operation_row.desired_payload);
  IF expected_template IS NULL
    OR jsonb_array_length(expected_template)<>jsonb_array_length(target_result_payload->'expectedLineItems') THEN
    RETURN false;
  END IF;

  IF jsonb_array_length(expected_template)>0 THEN
    FOR item_index IN 0..jsonb_array_length(expected_template)-1 LOOP
      template_item := expected_template->item_index;
      actual_item := target_result_payload->'expectedLineItems'->item_index;
      IF (actual_item-'jobberLineItemId') IS DISTINCT FROM (template_item-'jobberLineItemId') THEN
        RETURN false;
      END IF;
      actual_id := nullif(btrim(actual_item->>'jobberLineItemId'),'');
      known_id := nullif(btrim(template_item->>'jobberLineItemId'),'');
      IF known_id IS NOT NULL THEN
        IF actual_id IS DISTINCT FROM known_id THEN RETURN false; END IF;
      ELSIF template_item ? 'sourcePosition' THEN
        SELECT EXISTS (
          SELECT 1 FROM public.jobber_sync_steps step
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(step.result_payload->'syncedLineItems','[]'::JSONB)) synced
          WHERE step.operation_id=target_operation_id AND step.status='applied'
            AND synced->>'sourcePosition'=template_item->>'sourcePosition'
            AND synced->>'jobberLineItemId'=actual_id
        ) INTO id_is_journaled;
        IF NOT id_is_journaled THEN RETURN false; END IF;
      ELSE
        SELECT EXISTS (
          SELECT 1 FROM public.jobber_sync_steps step
          CROSS JOIN LATERAL jsonb_array_elements_text(
            COALESCE(step.result_payload->'createdLineItemIds','[]'::JSONB)
          ) AS created(created_id)
          WHERE step.operation_id=target_operation_id AND step.status='applied'
            AND created_id=actual_id
        ) INTO id_is_journaled;
        IF NOT id_is_journaled THEN RETURN false; END IF;
      END IF;
    END LOOP;
  END IF;

  desired_deleted_ids := app_auth.sanitize_jobber_ids(
    operation_row.desired_payload->'deletedJobberLineItemIds'
  );
  actual_deleted_ids := app_auth.sanitize_jobber_ids(target_result_payload->'deletedLineItemIds');
  IF NOT (desired_deleted_ids @> actual_deleted_ids AND actual_deleted_ids @> desired_deleted_ids) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE FUNCTION app_auth.latest_jobber_total_line_id(remote_quote_id TEXT)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE latest_operation public.jobber_sync_operations;
DECLARE synthetic_ids TEXT[];
BEGIN
  PERFORM app_auth.require_active_admin();
  SELECT operation.* INTO latest_operation
  FROM public.jobber_sync_operations operation
  WHERE app_auth.jobber_remote_ids_match(operation.jobber_quote_id, remote_quote_id)
    AND operation.status = 'succeeded'
  ORDER BY operation.updated_at DESC, operation.created_at DESC, operation.id DESC
  LIMIT 1;
  IF NOT FOUND OR latest_operation.desired_payload->>'saveMode' IS DISTINCT FROM 'description_total' THEN
    RETURN NULL;
  END IF;
  SELECT array_agg(item->>'jobberLineItemId' ORDER BY ordinality) INTO synthetic_ids
  FROM jsonb_array_elements(COALESCE(latest_operation.result->'expectedLineItems','[]'::JSONB))
    WITH ORDINALITY AS expected(item, ordinality)
  WHERE NOT item ? 'sourcePosition'
    AND jsonb_typeof(item->'jobberLineItemId') = 'string'
    AND length(btrim(item->>'jobberLineItemId')) BETWEEN 1 AND 512;
  IF COALESCE(array_length(synthetic_ids, 1), 0) <> 1 THEN RETURN NULL; END IF;
  RETURN synthetic_ids[1];
END;
$$;

CREATE FUNCTION app_auth.build_jobber_desired_payload(target_quote_id UUID, extra_deleted_ids JSONB DEFAULT '[]'::JSONB)
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

CREATE FUNCTION app_auth.operation_safe_json(target_operation_id UUID)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_row public.jobber_sync_operations;
DECLARE safe_value JSONB;
DECLARE step_rows JSONB;
BEGIN
  PERFORM app_auth.require_active_admin();
  SELECT * INTO operation_row FROM public.jobber_sync_operations WHERE id = target_operation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(step) ORDER BY step.sequence), '[]'::JSONB)
    INTO step_rows FROM public.jobber_sync_steps step WHERE step.operation_id = target_operation_id;
  safe_value := (to_jsonb(operation_row) - ARRAY['claim_token','created_by'])
    || jsonb_build_object('steps', step_rows);
  RETURN safe_value;
END;
$$;

CREATE FUNCTION app_auth.enqueue_jobber_sync(target_quote_id UUID, target_version INTEGER, extra_deleted_ids JSONB DEFAULT '[]'::JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor UUID;
DECLARE current_quote public.quotes;
DECLARE existing_id UUID;
DECLARE blocker_id UUID;
DECLARE desired JSONB;
BEGIN
  actor := app_auth.require_active_admin();
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO current_quote FROM public.quotes quote_row WHERE quote_row.id = target_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF current_quote.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'QUOTE_DELETED' USING ERRCODE = 'P0001'; END IF;
  IF target_version IS NULL OR current_quote.version <> target_version THEN
    RAISE EXCEPTION 'QUOTE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF current_quote.jobber_quote_id IS NULL OR btrim(current_quote.jobber_quote_id) = '' THEN
    RAISE EXCEPTION 'JOBBER_QUOTE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO existing_id FROM public.jobber_sync_operations
    WHERE quote_id = target_quote_id AND quote_version = target_version;
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;
  SELECT operation.id INTO blocker_id
  FROM public.jobber_sync_operations operation
  WHERE operation.status IN ('queued','running','retryable','reconciliation_required')
    AND (operation.quote_id = target_quote_id
      OR app_auth.jobber_remote_ids_match(operation.jobber_quote_id,current_quote.jobber_quote_id))
  ORDER BY operation.created_at, operation.id LIMIT 1 FOR UPDATE;
  IF blocker_id IS NOT NULL THEN RETURN blocker_id; END IF;
  desired := app_auth.build_jobber_desired_payload(target_quote_id, extra_deleted_ids);
  INSERT INTO public.jobber_sync_operations(
    quote_id, quote_version, jobber_quote_id, desired_payload, status, created_by
  ) VALUES (
    target_quote_id, target_version, current_quote.jobber_quote_id, desired, 'queued', actor
  ) RETURNING id INTO existing_id;
  RETURN existing_id;
END;
$$;

CREATE FUNCTION app_auth.capture_legacy_jobber_barrier(target_quote_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor UUID;
DECLARE current_quote public.quotes;
DECLARE operation_id UUID;
DECLARE legacy_code TEXT;
DECLARE desired JSONB;
BEGIN
  actor := app_auth.require_active_admin();
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO current_quote FROM public.quotes quote_row WHERE quote_row.id = target_quote_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id INTO operation_id FROM public.jobber_sync_operations
    WHERE quote_id = target_quote_id AND quote_version = current_quote.version;
  IF operation_id IS NOT NULL THEN RETURN operation_id; END IF;
  IF current_quote.jobber_sync_status = 'failed' THEN
    legacy_code := 'legacy_unjournaled';
  ELSIF current_quote.jobber_sync_status = 'synced'
    AND current_quote.jobber_save_mode = 'description_total'
    AND app_auth.latest_jobber_total_line_id(current_quote.jobber_quote_id) IS NULL THEN
    legacy_code := 'legacy_total_unjournaled';
  ELSE
    RETURN NULL;
  END IF;
  desired := app_auth.build_jobber_desired_payload(target_quote_id, '[]'::JSONB);
  INSERT INTO public.jobber_sync_operations(
    quote_id, quote_version, jobber_quote_id, desired_payload, status, failure_code, created_by
  ) VALUES (
    target_quote_id, current_quote.version, current_quote.jobber_quote_id, desired,
    'reconciliation_required', legacy_code, actor
  ) RETURNING id INTO operation_id;
  RETURN operation_id;
END;
$$;

CREATE FUNCTION app_auth.guard_jobber_sync_operation_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.quote_id IS DISTINCT FROM OLD.quote_id
    OR NEW.quote_version IS DISTINCT FROM OLD.quote_version
    OR NEW.jobber_quote_id IS DISTINCT FROM OLD.jobber_quote_id
    OR NEW.desired_payload IS DISTINCT FROM OLD.desired_payload
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE_SYNC_OPERATION' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE FUNCTION app_auth.guard_jobber_sync_step_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
    OR NEW.step_key IS DISTINCT FROM OLD.step_key OR NEW.sequence IS DISTINCT FROM OLD.sequence
    OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.request_payload IS DISTINCT FROM OLD.request_payload
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE_SYNC_STEP' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER jobber_sync_operation_immutability
  BEFORE UPDATE ON public.jobber_sync_operations FOR EACH ROW
  EXECUTE FUNCTION app_auth.guard_jobber_sync_operation_immutability();
CREATE TRIGGER jobber_sync_step_immutability
  BEFORE UPDATE ON public.jobber_sync_steps FOR EACH ROW
  EXECUTE FUNCTION app_auth.guard_jobber_sync_step_immutability();

CREATE FUNCTION app_auth.handle_quote_change_for_jobber_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.version IS NOT DISTINCT FROM OLD.version
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
    AND app_auth.jobber_remote_ids_match(NEW.jobber_quote_id,OLD.jobber_quote_id) THEN
    RETURN NEW;
  END IF;
  UPDATE public.jobber_sync_operations operation SET
    status = CASE
      WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL
        AND app_auth.jobber_remote_ids_match(NEW.jobber_quote_id,OLD.jobber_quote_id)
        AND operation.status IN ('queued','retryable')
        AND NOT EXISTS (SELECT 1 FROM public.jobber_sync_steps step WHERE step.operation_id = operation.id)
      THEN 'superseded'
      ELSE 'reconciliation_required'
    END,
    failure_code = CASE
      WHEN operation.failure_code IN ('legacy_unjournaled','legacy_total_unjournaled')
      THEN operation.failure_code ELSE 'quote_changed' END,
    claim_token = CASE
      WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL
        AND app_auth.jobber_remote_ids_match(NEW.jobber_quote_id,OLD.jobber_quote_id)
        AND operation.status IN ('queued','retryable')
        AND NOT EXISTS (SELECT 1 FROM public.jobber_sync_steps step WHERE step.operation_id = operation.id)
      THEN NULL ELSE operation.claim_token END,
    lease_expires_at = CASE
      WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NULL
        AND app_auth.jobber_remote_ids_match(NEW.jobber_quote_id,OLD.jobber_quote_id)
        AND operation.status IN ('queued','retryable')
        AND NOT EXISTS (SELECT 1 FROM public.jobber_sync_steps step WHERE step.operation_id = operation.id)
      THEN NULL ELSE operation.lease_expires_at END
  WHERE operation.quote_id = NEW.id
    AND operation.status IN ('queued','running','retryable','reconciliation_required');
  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_jobber_sync_change_guard
  AFTER UPDATE OF version, deleted_at, jobber_quote_id ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION app_auth.handle_quote_change_for_jobber_sync();

CREATE FUNCTION app_auth.claim_jobber_sync_operation_impl(target_operation_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_row public.jobber_sync_operations;
DECLARE current_quote public.quotes;
DECLARE blocker_id UUID;
DECLARE new_token UUID;
BEGIN
  PERFORM app_auth.require_active_admin();
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO operation_row FROM public.jobber_sync_operations
    WHERE id = target_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF operation_row.status = 'running' AND operation_row.lease_expires_at <= clock_timestamp() THEN
    UPDATE public.jobber_sync_operations SET status='reconciliation_required', failure_code='lease_expired'
      WHERE id=target_operation_id;
    RETURN jsonb_build_object('claimed',false,'operation',app_auth.operation_safe_json(target_operation_id));
  END IF;
  IF operation_row.status NOT IN ('queued','retryable') THEN
    RETURN jsonb_build_object('claimed',false,'operation',app_auth.operation_safe_json(target_operation_id));
  END IF;
  SELECT * INTO current_quote FROM public.quotes quote_row WHERE quote_row.id=operation_row.quote_id FOR UPDATE;
  IF NOT FOUND OR current_quote.deleted_at IS NOT NULL OR current_quote.version <> operation_row.quote_version
    OR NOT app_auth.jobber_remote_ids_match(current_quote.jobber_quote_id,operation_row.jobber_quote_id) THEN
    UPDATE public.jobber_sync_operations SET status='reconciliation_required', failure_code='quote_changed'
      WHERE id=target_operation_id;
    RETURN jsonb_build_object('claimed',false,'operation',app_auth.operation_safe_json(target_operation_id));
  END IF;
  SELECT predecessor.id INTO blocker_id FROM public.jobber_sync_operations predecessor
  WHERE predecessor.id <> operation_row.id
    AND predecessor.status IN ('queued','running','retryable','reconciliation_required')
    AND (predecessor.quote_id=operation_row.quote_id
      OR app_auth.jobber_remote_ids_match(predecessor.jobber_quote_id,operation_row.jobber_quote_id))
    AND (predecessor.created_at, predecessor.id) < (operation_row.created_at, operation_row.id)
  ORDER BY predecessor.created_at, predecessor.id LIMIT 1 FOR UPDATE;
  IF blocker_id IS NOT NULL THEN
    RETURN jsonb_build_object('claimed',false,'operation',app_auth.operation_safe_json(blocker_id));
  END IF;
  new_token := gen_random_uuid();
  UPDATE public.jobber_sync_operations SET status='running', claim_token=new_token,
    lease_expires_at=clock_timestamp()+make_interval(mins => 5), attempt_count=attempt_count+1,
    failure_code=NULL WHERE id=target_operation_id;
  RETURN jsonb_build_object('claimed',true,'operation',
    app_auth.operation_safe_json(target_operation_id) || jsonb_build_object('claim_token',new_token));
END;
$$;

CREATE FUNCTION app_auth.begin_jobber_sync_step_impl(
  target_operation_id UUID, provided_claim_token UUID, target_step_key TEXT,
  target_step_kind TEXT, target_request_payload JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_row public.jobber_sync_operations;
DECLARE current_quote public.quotes;
DECLARE existing_step public.jobber_sync_steps;
DECLARE next_sequence INTEGER;
BEGIN
  PERFORM app_auth.require_active_admin();
  IF app_auth.jobber_step_request_is_valid(target_step_kind,target_request_payload) IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_STEP_REQUEST' USING ERRCODE = '22023';
  END IF;
  IF target_step_key IS NULL OR length(btrim(target_step_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_STEP_KEY' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO operation_row FROM public.jobber_sync_operations WHERE id=target_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF provided_claim_token IS NULL OR operation_row.status <> 'running'
    OR operation_row.claim_token IS DISTINCT FROM provided_claim_token THEN
    RAISE EXCEPTION 'SYNC_CLAIM_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF operation_row.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'SYNC_CLAIM_EXPIRED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO current_quote FROM public.quotes quote_row WHERE quote_row.id=operation_row.quote_id FOR UPDATE;
  IF NOT FOUND OR current_quote.deleted_at IS NOT NULL OR current_quote.version<>operation_row.quote_version
    OR NOT app_auth.jobber_remote_ids_match(current_quote.jobber_quote_id,operation_row.jobber_quote_id) THEN
    RAISE EXCEPTION 'QUOTE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO existing_step FROM public.jobber_sync_steps
    WHERE operation_id=target_operation_id AND step_key=target_step_key FOR UPDATE;
  IF FOUND THEN
    IF existing_step.kind IS DISTINCT FROM target_step_kind
      OR existing_step.request_payload IS DISTINCT FROM target_request_payload THEN
      RAISE EXCEPTION 'STEP_REQUEST_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'STEP_ALREADY_STARTED' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(max(sequence)+1,0) INTO next_sequence FROM public.jobber_sync_steps
    WHERE operation_id=target_operation_id;
  INSERT INTO public.jobber_sync_steps(operation_id,step_key,sequence,kind,request_payload,status)
    VALUES(target_operation_id,btrim(target_step_key),next_sequence,target_step_kind,target_request_payload,'sending');
END;
$$;

CREATE FUNCTION app_auth.complete_jobber_sync_step_impl(
  target_operation_id UUID, provided_claim_token UUID, target_step_key TEXT, target_result_payload JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_row public.jobber_sync_operations;
DECLARE existing_step public.jobber_sync_steps;
BEGIN
  PERFORM app_auth.require_active_admin();
  IF app_auth.jobber_step_result_is_valid(target_result_payload) IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_STEP_RESULT' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO operation_row FROM public.jobber_sync_operations WHERE id=target_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF provided_claim_token IS NULL OR operation_row.claim_token IS DISTINCT FROM provided_claim_token
    OR operation_row.status NOT IN ('running','reconciliation_required') THEN
    RAISE EXCEPTION 'SYNC_CLAIM_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_auth.mark_expired_jobber_sync_claim(target_operation_id);
  SELECT * INTO existing_step FROM public.jobber_sync_steps
    WHERE operation_id=target_operation_id AND step_key=target_step_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_STEP_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF existing_step.status='applied' THEN
    IF existing_step.result_payload IS DISTINCT FROM target_result_payload THEN
      RAISE EXCEPTION 'STEP_RESULT_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
    RETURN;
  END IF;
  UPDATE public.jobber_sync_steps SET status='applied', result_payload=target_result_payload
    WHERE id=existing_step.id;
END;
$$;

CREATE FUNCTION app_auth.record_jobber_sync_completion_impl(
  target_operation_id UUID, provided_claim_token UUID, target_result_payload JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_row public.jobber_sync_operations;
BEGIN
  PERFORM app_auth.require_active_admin();
  IF app_auth.jobber_completion_is_valid(target_result_payload) IS NOT TRUE THEN
    RAISE EXCEPTION 'INVALID_SYNC_RESULT' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO operation_row FROM public.jobber_sync_operations WHERE id=target_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF provided_claim_token IS NULL OR operation_row.claim_token IS DISTINCT FROM provided_claim_token
    OR operation_row.status NOT IN ('running','reconciliation_required') THEN
    RAISE EXCEPTION 'SYNC_CLAIM_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_auth.mark_expired_jobber_sync_claim(target_operation_id);
  IF EXISTS (SELECT 1 FROM public.jobber_sync_steps WHERE operation_id=target_operation_id AND status<>'applied') THEN
    RAISE EXCEPTION 'SYNC_STEPS_INCOMPLETE' USING ERRCODE = 'P0001';
  END IF;
  IF app_auth.jobber_completion_matches_operation(target_operation_id,target_result_payload) IS NOT TRUE THEN
    RAISE EXCEPTION 'SYNC_RESULT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;
  IF operation_row.result IS NOT NULL AND operation_row.result IS DISTINCT FROM target_result_payload THEN
    RAISE EXCEPTION 'SYNC_RESULT_MISMATCH' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.jobber_sync_operations SET result=target_result_payload WHERE id=target_operation_id;
END;
$$;

CREATE FUNCTION app_auth.apply_jobber_sync_success(target_operation_id UUID, strict_version BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_row public.jobber_sync_operations;
DECLARE current_quote public.quotes;
DECLARE remaining_ids JSONB;
BEGIN
  PERFORM app_auth.require_active_admin();
  SELECT * INTO operation_row FROM public.jobber_sync_operations WHERE id=target_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF operation_row.result IS NULL OR EXISTS (
    SELECT 1 FROM public.jobber_sync_steps WHERE operation_id=target_operation_id AND status<>'applied'
  ) THEN RAISE EXCEPTION 'SYNC_COMPLETION_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO current_quote FROM public.quotes quote_row WHERE quote_row.id=operation_row.quote_id FOR UPDATE;
  IF NOT FOUND OR current_quote.deleted_at IS NOT NULL OR current_quote.version<>operation_row.quote_version
    OR NOT app_auth.jobber_remote_ids_match(current_quote.jobber_quote_id,operation_row.jobber_quote_id) THEN
    UPDATE public.jobber_sync_operations SET status='reconciliation_required',failure_code='quote_changed'
      WHERE id=target_operation_id;
    IF strict_version THEN RAISE EXCEPTION 'QUOTE_VERSION_CONFLICT' USING ERRCODE = 'P0001'; END IF;
    RETURN false;
  END IF;
  UPDATE public.jobber_quote_lines line SET jobber_line_item_id=synced->>'jobberLineItemId'
  FROM jsonb_array_elements(operation_row.result->'syncedLineItems') synced
  WHERE line.quote_id=operation_row.quote_id AND line.client_visible
    AND line.position=(synced->>'sourcePosition')::INTEGER
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(operation_row.desired_payload->'lines') desired_line
      WHERE (desired_line->>'position')::INTEGER=(synced->>'sourcePosition')::INTEGER
    );
  SELECT COALESCE(jsonb_agg(item ORDER BY ordinality),'[]'::JSONB) INTO remaining_ids
  FROM jsonb_array_elements(current_quote.jobber_pending_deleted_line_item_ids)
    WITH ORDINALITY pending(item,ordinality)
  WHERE NOT (operation_row.desired_payload->'deletedJobberLineItemIds' @> jsonb_build_array(item));
  UPDATE public.quotes SET jobber_sync_status='synced',jobber_last_synced_at=clock_timestamp(),
    jobber_sync_error=NULL,jobber_pending_deleted_line_item_ids=remaining_ids
    WHERE id=operation_row.quote_id;
  UPDATE public.jobber_sync_operations SET status='succeeded',claim_token=NULL,
    lease_expires_at=NULL,failure_code=NULL WHERE id=target_operation_id;
  RETURN true;
END;
$$;

CREATE FUNCTION app_auth.finish_jobber_sync_operation_impl(
  target_operation_id UUID, provided_claim_token UUID, target_outcome TEXT,
  provided_failure_code TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_row public.jobber_sync_operations;
DECLARE has_steps BOOLEAN;
BEGIN
  PERFORM app_auth.require_active_admin();
  IF target_outcome NOT IN ('succeeded','retryable','reconciliation_required') THEN
    RAISE EXCEPTION 'INVALID_SYNC_OUTCOME' USING ERRCODE = '22023';
  END IF;
  IF provided_failure_code IS NOT NULL AND (
    provided_failure_code <> 'line_kind_mismatch' OR target_outcome <> 'retryable'
  ) THEN
    RAISE EXCEPTION 'INVALID_SYNC_FAILURE_CODE' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO operation_row FROM public.jobber_sync_operations WHERE id=target_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF provided_claim_token IS NULL OR operation_row.claim_token IS DISTINCT FROM provided_claim_token
    OR operation_row.status NOT IN ('running','reconciliation_required') THEN
    RAISE EXCEPTION 'SYNC_CLAIM_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF app_auth.mark_expired_jobber_sync_claim(target_operation_id) THEN
    operation_row.status := 'reconciliation_required';
    operation_row.failure_code := 'lease_expired';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.jobber_sync_steps WHERE operation_id=target_operation_id) INTO has_steps;
  IF target_outcome='retryable' THEN
    IF operation_row.status='reconciliation_required' THEN
      UPDATE public.jobber_sync_operations SET failure_code=COALESCE(failure_code,'operation_uncertain')
        WHERE id=target_operation_id;
    ELSIF has_steps THEN
      UPDATE public.jobber_sync_operations SET status='reconciliation_required',failure_code='mutation_begun'
        WHERE id=target_operation_id;
    ELSE
      UPDATE public.jobber_sync_operations SET status='retryable',claim_token=NULL,lease_expires_at=NULL,
        failure_code=COALESCE(provided_failure_code,'preflight_failed') WHERE id=target_operation_id;
    END IF;
    RETURN;
  END IF;
  IF target_outcome='reconciliation_required' THEN
    UPDATE public.jobber_sync_operations SET status='reconciliation_required',failure_code=COALESCE(failure_code,'operation_uncertain')
      WHERE id=target_operation_id;
    RETURN;
  END IF;
  IF operation_row.status='reconciliation_required' THEN
    RETURN;
  END IF;
  PERFORM app_auth.apply_jobber_sync_success(target_operation_id,false);
END;
$$;

CREATE FUNCTION app_auth.resolve_jobber_sync_operation_impl(target_operation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation_row public.jobber_sync_operations;
BEGIN
  PERFORM app_auth.require_active_admin();
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO operation_row FROM public.jobber_sync_operations WHERE id=target_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SYNC_OPERATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF operation_row.status<>'reconciliation_required' THEN
    RAISE EXCEPTION 'RECONCILIATION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.jobber_sync_steps WHERE operation_id=target_operation_id AND status='sending') THEN
    RAISE EXCEPTION 'SYNC_STEPS_INCOMPLETE' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_auth.apply_jobber_sync_success(target_operation_id,true);
END;
$$;

CREATE FUNCTION public.create_quote_with_jobber_sync(payload JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE saved_id UUID;
DECLARE requested BOOLEAN;
DECLARE deletion_ids JSONB;
DECLARE visible_ids JSONB;
DECLARE saved_quote public.quotes;
BEGIN
  PERFORM app_auth.require_active_admin();
  IF jsonb_typeof(payload)<>'object' OR (payload ? 'sync_requested' AND jsonb_typeof(payload->'sync_requested')<>'boolean') THEN
    RAISE EXCEPTION 'INVALID_SYNC_SAVE_PAYLOAD' USING ERRCODE = '22023';
  END IF;
  requested := COALESCE((payload->>'sync_requested')::BOOLEAN,false);
  deletion_ids := app_auth.sanitize_jobber_ids(payload->'deleted_jobber_line_item_ids');
  IF EXISTS (
    SELECT (line->>'position')::INTEGER FROM jsonb_array_elements(COALESCE(payload->'jobber_lines','[]'::JSONB)) line
    WHERE COALESCE((line->>'client_visible')::BOOLEAN,true)
    GROUP BY (line->>'position')::INTEGER HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'DUPLICATE_JOBBER_SOURCE_POSITION' USING ERRCODE = '22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  saved_id := public.create_quote_with_children(payload);
  SELECT app_auth.sanitize_jobber_ids(COALESCE(jsonb_agg(to_jsonb(btrim(line.jobber_line_item_id)))
    FILTER (WHERE line.client_visible AND nullif(btrim(line.jobber_line_item_id),'') IS NOT NULL),'[]'::JSONB))
  INTO visible_ids FROM public.jobber_quote_lines line WHERE line.quote_id=saved_id;
  SELECT COALESCE(jsonb_agg(item ORDER BY ordinality),'[]'::JSONB) INTO deletion_ids
  FROM jsonb_array_elements(deletion_ids) WITH ORDINALITY source(item,ordinality)
  WHERE NOT (visible_ids @> jsonb_build_array(item));
  UPDATE public.quotes SET jobber_pending_deleted_line_item_ids=deletion_ids WHERE id=saved_id;
  SELECT * INTO saved_quote FROM public.quotes WHERE quotes.id=saved_id;
  IF requested AND nullif(btrim(saved_quote.jobber_quote_id),'') IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.jobber_quote_lines WHERE quote_id=saved_id AND client_visible)
    OR jsonb_array_length(deletion_ids)>0
  ) THEN
    PERFORM app_auth.enqueue_jobber_sync(saved_id,1,deletion_ids);
  END IF;
  RETURN saved_id;
END;
$$;

CREATE FUNCTION public.update_quote_with_jobber_sync(payload JSONB)
RETURNS TABLE(id UUID, version INTEGER) LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE target_id UUID;
DECLARE expected INTEGER;
DECLARE current_quote public.quotes;
DECLARE explicit_ids JSONB;
DECLARE removed_ids JSONB;
DECLARE carried_ids JSONB;
DECLARE visible_new_ids JSONB;
DECLARE pending_ids JSONB;
DECLARE known_total_id TEXT;
DECLARE saved RECORD;
DECLARE requested BOOLEAN;
DECLARE saved_quote public.quotes;
DECLARE incoming_remote_id TEXT;
DECLARE same_remote_identity BOOLEAN;
BEGIN
  PERFORM app_auth.require_active_admin();
  IF jsonb_typeof(payload)<>'object' OR (payload ? 'sync_requested' AND jsonb_typeof(payload->'sync_requested')<>'boolean') THEN
    RAISE EXCEPTION 'INVALID_SYNC_SAVE_PAYLOAD' USING ERRCODE = '22023';
  END IF;
  target_id := (payload->>'id')::UUID;
  expected := (payload->>'expected_version')::INTEGER;
  requested := COALESCE((payload->>'sync_requested')::BOOLEAN,false);
  explicit_ids := app_auth.sanitize_jobber_ids(payload->'deleted_jobber_line_item_ids');
  IF EXISTS (
    SELECT (line->>'position')::INTEGER FROM jsonb_array_elements(COALESCE(payload->'jobber_lines','[]'::JSONB)) line
    WHERE COALESCE((line->>'client_visible')::BOOLEAN,true)
    GROUP BY (line->>'position')::INTEGER HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'DUPLICATE_JOBBER_SOURCE_POSITION' USING ERRCODE = '22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO current_quote FROM public.quotes quote_row WHERE quote_row.id=target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF current_quote.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'QUOTE_DELETED' USING ERRCODE = 'P0001'; END IF;
  IF expected IS NULL OR current_quote.version<>expected THEN
    RAISE EXCEPTION 'QUOTE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  incoming_remote_id := nullif(btrim(payload #>> '{quote,jobber_quote_id}'),'');
  same_remote_identity := app_auth.jobber_remote_ids_match(
    current_quote.jobber_quote_id,incoming_remote_id
  );
  PERFORM app_auth.capture_legacy_jobber_barrier(target_id);
  SELECT app_auth.sanitize_jobber_ids(COALESCE(jsonb_agg(to_jsonb(btrim(line->>'jobber_line_item_id')))
    FILTER (WHERE COALESCE((line->>'client_visible')::BOOLEAN,true)
      AND nullif(btrim(line->>'jobber_line_item_id'),'') IS NOT NULL),'[]'::JSONB))
  INTO visible_new_ids FROM jsonb_array_elements(COALESCE(payload->'jobber_lines','[]'::JSONB)) line;
  IF same_remote_identity THEN
    SELECT app_auth.sanitize_jobber_ids(COALESCE(jsonb_agg(to_jsonb(btrim(old_line.jobber_line_item_id)))
      FILTER (WHERE nullif(btrim(old_line.jobber_line_item_id),'') IS NOT NULL
        AND NOT (visible_new_ids @> jsonb_build_array(to_jsonb(btrim(old_line.jobber_line_item_id))))),'[]'::JSONB))
    INTO removed_ids FROM public.jobber_quote_lines old_line WHERE old_line.quote_id=target_id;
    SELECT app_auth.sanitize_jobber_ids(COALESCE(jsonb_agg(item),'[]'::JSONB)) INTO carried_ids
    FROM public.jobber_sync_operations operation
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(operation.desired_payload->'deletedJobberLineItemIds','[]'::JSONB)
    ) item
    WHERE operation.quote_id=target_id AND operation.status IN ('queued','running','retryable','reconciliation_required');
    pending_ids := app_auth.jobber_id_union(current_quote.jobber_pending_deleted_line_item_ids,explicit_ids);
    pending_ids := app_auth.jobber_id_union(pending_ids,removed_ids);
    pending_ids := app_auth.jobber_id_union(pending_ids,carried_ids);
    known_total_id := app_auth.latest_jobber_total_line_id(current_quote.jobber_quote_id);
    IF current_quote.jobber_save_mode='description_total'
      AND payload #>> '{quote,jobber_save_mode}' IS DISTINCT FROM 'description_total'
      AND known_total_id IS NOT NULL THEN
      pending_ids := app_auth.jobber_id_union(pending_ids,jsonb_build_array(known_total_id));
    ELSIF payload #>> '{quote,jobber_save_mode}' = 'description_total' AND known_total_id IS NOT NULL THEN
      visible_new_ids := app_auth.jobber_id_union(visible_new_ids,jsonb_build_array(known_total_id));
    END IF;
    SELECT COALESCE(jsonb_agg(item ORDER BY ordinality),'[]'::JSONB) INTO pending_ids
    FROM jsonb_array_elements(pending_ids) WITH ORDINALITY source(item,ordinality)
    WHERE NOT (visible_new_ids @> jsonb_build_array(item));
  ELSE
    pending_ids := '[]'::JSONB;
  END IF;
  UPDATE public.quotes SET jobber_pending_deleted_line_item_ids=pending_ids WHERE quotes.id=target_id;
  SELECT * INTO saved FROM public.update_quote_with_children(payload);
  SELECT * INTO saved_quote FROM public.quotes WHERE quotes.id=saved.id;
  IF requested AND nullif(btrim(saved_quote.jobber_quote_id),'') IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.jobber_quote_lines WHERE quote_id=saved.id AND client_visible)
    OR jsonb_array_length(pending_ids)>0
  ) THEN
    PERFORM app_auth.enqueue_jobber_sync(saved.id,saved.version,pending_ids);
  END IF;
  RETURN QUERY SELECT saved.id::UUID,saved.version::INTEGER;
END;
$$;

CREATE FUNCTION public.request_jobber_sync(target_quote_id UUID, expected_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE legacy_id UUID;
DECLARE operation_id UUID;
DECLARE current_quote public.quotes;
BEGIN
  PERFORM app_auth.require_active_admin();
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO current_quote FROM public.quotes quote_row WHERE quote_row.id=target_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF current_quote.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'QUOTE_DELETED' USING ERRCODE = 'P0001'; END IF;
  IF expected_version IS NULL OR current_quote.version<>expected_version THEN
    RAISE EXCEPTION 'QUOTE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(btrim(current_quote.jobber_quote_id),'') IS NULL THEN
    RAISE EXCEPTION 'JOBBER_QUOTE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.jobber_quote_lines WHERE quote_id=target_quote_id AND client_visible)
    AND jsonb_array_length(current_quote.jobber_pending_deleted_line_item_ids)=0 THEN
    RAISE EXCEPTION 'NO_SAVED_JOBBER_LINES' USING ERRCODE = '22023';
  END IF;
  legacy_id := app_auth.capture_legacy_jobber_barrier(target_quote_id);
  IF legacy_id IS NOT NULL THEN RETURN app_auth.operation_safe_json(legacy_id); END IF;
  operation_id := app_auth.enqueue_jobber_sync(target_quote_id,expected_version,'[]'::JSONB);
  RETURN app_auth.operation_safe_json(operation_id);
END;
$$;

CREATE FUNCTION public.get_jobber_sync_operation(target_quote_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE current_quote public.quotes;
DECLARE operation_id UUID;
BEGIN
  PERFORM app_auth.require_active_admin();
  PERFORM pg_catalog.pg_advisory_xact_lock(814253321);
  SELECT * INTO current_quote FROM public.quotes quote_row
    WHERE quote_row.id=target_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT operation.id INTO operation_id FROM public.jobber_sync_operations operation
  WHERE operation.status IN ('queued','running','retryable','reconciliation_required')
    AND (operation.quote_id=target_quote_id
      OR app_auth.jobber_remote_ids_match(operation.jobber_quote_id,current_quote.jobber_quote_id))
  ORDER BY operation.created_at,operation.id LIMIT 1;
  IF operation_id IS NULL THEN
    SELECT operation.id INTO operation_id FROM public.jobber_sync_operations operation
    WHERE operation.quote_id=target_quote_id AND operation.quote_version=current_quote.version
    ORDER BY operation.created_at DESC,operation.id DESC LIMIT 1;
  END IF;
  IF operation_id IS NOT NULL THEN
    PERFORM app_auth.mark_expired_jobber_sync_claim(operation_id);
  END IF;
  RETURN app_auth.operation_safe_json(operation_id);
END;
$$;

CREATE FUNCTION public.claim_jobber_sync_operation(operation_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_auth.claim_jobber_sync_operation_impl(operation_id);
$$;

CREATE FUNCTION public.begin_jobber_sync_step(
  operation_id UUID, claim_token UUID, step_key TEXT, step_kind TEXT, request_payload JSONB
)
RETURNS VOID LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_auth.begin_jobber_sync_step_impl(operation_id,claim_token,step_key,step_kind,request_payload);
$$;

CREATE FUNCTION public.complete_jobber_sync_step(
  operation_id UUID, claim_token UUID, step_key TEXT, result_payload JSONB
)
RETURNS VOID LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_auth.complete_jobber_sync_step_impl(operation_id,claim_token,step_key,result_payload);
$$;

CREATE FUNCTION public.record_jobber_sync_completion(
  operation_id UUID, claim_token UUID, result_payload JSONB
)
RETURNS VOID LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_auth.record_jobber_sync_completion_impl(operation_id,claim_token,result_payload);
$$;

CREATE FUNCTION public.finish_jobber_sync_operation(
  operation_id UUID, claim_token UUID, outcome TEXT, failure_code TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_auth.finish_jobber_sync_operation_impl(operation_id,claim_token,outcome,failure_code);
$$;

CREATE FUNCTION public.resolve_jobber_sync_operation(operation_id UUID)
RETURNS VOID LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT app_auth.resolve_jobber_sync_operation_impl(operation_id);
$$;

REVOKE ALL ON FUNCTION app_auth.jobber_id_array_is_valid(JSONB),
  app_auth.sanitize_jobber_ids(JSONB), app_auth.jobber_id_union(JSONB,JSONB),
  app_auth.jobber_remote_ids_match(TEXT,TEXT), app_auth.trim_jobber_text(TEXT),
  app_auth.jsonb_has_only_keys(JSONB,TEXT[]), app_auth.normalized_jobber_item_is_valid(JSONB,BOOLEAN),
  app_auth.normalized_jobber_items_are_valid(JSONB,BOOLEAN), app_auth.jobber_step_request_is_valid(TEXT,JSONB),
  app_auth.synced_jobber_items_are_valid(JSONB), app_auth.jobber_step_result_is_valid(JSONB),
  app_auth.jobber_completion_is_valid(JSONB), app_auth.expected_jobber_completion_items(JSONB),
  app_auth.require_active_admin(), app_auth.mark_expired_jobber_sync_claim(UUID),
  app_auth.jobber_completion_matches_operation(UUID,JSONB),
  app_auth.latest_jobber_total_line_id(TEXT), app_auth.build_jobber_desired_payload(UUID,JSONB),
  app_auth.operation_safe_json(UUID), app_auth.enqueue_jobber_sync(UUID,INTEGER,JSONB),
  app_auth.capture_legacy_jobber_barrier(UUID), app_auth.guard_jobber_sync_operation_immutability(),
  app_auth.guard_jobber_sync_step_immutability(), app_auth.handle_quote_change_for_jobber_sync(),
  app_auth.claim_jobber_sync_operation_impl(UUID),
  app_auth.begin_jobber_sync_step_impl(UUID,UUID,TEXT,TEXT,JSONB),
  app_auth.complete_jobber_sync_step_impl(UUID,UUID,TEXT,JSONB),
  app_auth.record_jobber_sync_completion_impl(UUID,UUID,JSONB),
  app_auth.apply_jobber_sync_success(UUID,BOOLEAN),
  app_auth.finish_jobber_sync_operation_impl(UUID,UUID,TEXT,TEXT),
  app_auth.resolve_jobber_sync_operation_impl(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION app_auth.jobber_id_array_is_valid(JSONB),
  app_auth.sanitize_jobber_ids(JSONB), app_auth.jobber_id_union(JSONB,JSONB),
  app_auth.jobber_remote_ids_match(TEXT,TEXT),
  app_auth.jsonb_has_only_keys(JSONB,TEXT[]), app_auth.normalized_jobber_item_is_valid(JSONB,BOOLEAN),
  app_auth.normalized_jobber_items_are_valid(JSONB,BOOLEAN), app_auth.jobber_step_request_is_valid(TEXT,JSONB),
  app_auth.synced_jobber_items_are_valid(JSONB), app_auth.jobber_step_result_is_valid(JSONB),
  app_auth.jobber_completion_is_valid(JSONB), app_auth.require_active_admin(),
  app_auth.mark_expired_jobber_sync_claim(UUID),
  app_auth.operation_safe_json(UUID), app_auth.enqueue_jobber_sync(UUID,INTEGER,JSONB),
  app_auth.capture_legacy_jobber_barrier(UUID), app_auth.claim_jobber_sync_operation_impl(UUID),
  app_auth.begin_jobber_sync_step_impl(UUID,UUID,TEXT,TEXT,JSONB),
  app_auth.complete_jobber_sync_step_impl(UUID,UUID,TEXT,JSONB),
  app_auth.record_jobber_sync_completion_impl(UUID,UUID,JSONB),
  app_auth.finish_jobber_sync_operation_impl(UUID,UUID,TEXT,TEXT),
  app_auth.resolve_jobber_sync_operation_impl(UUID)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_quote_with_jobber_sync(JSONB),
  public.update_quote_with_jobber_sync(JSONB), public.request_jobber_sync(UUID,INTEGER),
  public.get_jobber_sync_operation(UUID), public.claim_jobber_sync_operation(UUID),
  public.begin_jobber_sync_step(UUID,UUID,TEXT,TEXT,JSONB),
  public.complete_jobber_sync_step(UUID,UUID,TEXT,JSONB),
  public.record_jobber_sync_completion(UUID,UUID,JSONB),
  public.finish_jobber_sync_operation(UUID,UUID,TEXT,TEXT), public.resolve_jobber_sync_operation(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_quote_with_jobber_sync(JSONB),
  public.update_quote_with_jobber_sync(JSONB), public.request_jobber_sync(UUID,INTEGER),
  public.get_jobber_sync_operation(UUID), public.claim_jobber_sync_operation(UUID),
  public.begin_jobber_sync_step(UUID,UUID,TEXT,TEXT,JSONB),
  public.complete_jobber_sync_step(UUID,UUID,TEXT,JSONB),
  public.record_jobber_sync_completion(UUID,UUID,JSONB),
  public.finish_jobber_sync_operation(UUID,UUID,TEXT,TEXT), public.resolve_jobber_sync_operation(UUID)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
