CREATE FUNCTION public.progress_ledger_assert_payload(
  payload JSONB,
  allowed_keys TEXT[],
  required_string_keys TEXT[],
  required_number_keys TEXT[],
  nullable_string_keys TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  unknown_keys TEXT[];
  key_name TEXT;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT pg_catalog.array_agg(keys.key ORDER BY keys.key)
  INTO unknown_keys
  FROM jsonb_object_keys(payload) AS keys(key)
  WHERE keys.key <> ALL (allowed_keys);
  IF unknown_keys IS NOT NULL THEN
    RAISE EXCEPTION 'PROGRESS_PAYLOAD_UNKNOWN_KEYS' USING ERRCODE = '22023';
  END IF;
  FOREACH key_name IN ARRAY required_string_keys LOOP
    IF jsonb_typeof(payload -> key_name) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY required_number_keys LOOP
    IF jsonb_typeof(payload -> key_name) IS DISTINCT FROM 'number'
      OR (payload ->> key_name)::NUMERIC <> trunc((payload ->> key_name)::NUMERIC)
      OR (payload ->> key_name)::NUMERIC <= 0
      OR (payload ->> key_name)::NUMERIC > 2147483647 THEN
      RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH key_name IN ARRAY nullable_string_keys LOOP
    IF payload ? key_name
      AND payload -> key_name <> 'null'::JSONB
      AND jsonb_typeof(payload -> key_name) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'PROGRESS_PAYLOAD_TYPE_INVALID' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.progress_ledger_validate_reason(value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF NULLIF(btrim(value), '') IS NULL OR length(btrim(value)) > 500 THEN
    RAISE EXCEPTION 'PROGRESS_REASON_REQUIRED' USING ERRCODE = '23514';
  END IF;
  RETURN btrim(value);
END;
$$;

CREATE FUNCTION public.progress_ledger_validate_money(value TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF value !~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$'
    OR value::NUMERIC <= 0 OR value::NUMERIC > 999999999999.99 THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE = '23514';
  END IF;
  RETURN value::NUMERIC;
END;
$$;

CREATE FUNCTION public.progress_ledger_validate_date(value JSONB)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  RETURN public.progress_require_iso_date(value);
END;
$$;

CREATE FUNCTION public.progress_payment_safe_dto(
  payment_row public.progress_payments,
  revision_row public.progress_payment_revisions
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', payment_row.id,
    'series_id', payment_row.series_id,
    'source', payment_row.source,
    'version', payment_row.version,
    'matched_manual_payment_id', payment_row.matched_manual_payment_id,
    'revision_id', revision_row.id,
    'revision_number', revision_row.revision_number,
    'received_date', revision_row.received_date,
    'observed_amount', pg_catalog.to_char(revision_row.observed_amount, 'FM999999999999990.00'),
    'effective_receipt_amount', pg_catalog.to_char(revision_row.effective_receipt_amount, 'FM999999999999990.00'),
    'status', revision_row.status,
    'sync_state', revision_row.sync_state
  );
$$;

CREATE FUNCTION public.progress_reject_void_series_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  owning_series_id UUID := CASE WHEN TG_TABLE_NAME = 'progress_adjustments' THEN NEW.series_id ELSE NEW.series_id END;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.progress_invoice_series AS series
    WHERE series.id = owning_series_id AND series.status = 'void'
  ) THEN
    RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE = '55000';
  END IF;
  IF TG_TABLE_NAME = 'progress_adjustments' AND TG_OP = 'UPDATE'
    AND to_jsonb(OLD) ->> 'status' = 'rejected' THEN
    RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_progress_adjustments_reject_void_series
BEFORE INSERT OR UPDATE ON public.progress_adjustments
FOR EACH ROW EXECUTE FUNCTION public.progress_reject_void_series_ledger_mutation();

CREATE TRIGGER trg_progress_payments_reject_void_series
BEFORE INSERT OR UPDATE ON public.progress_payments
FOR EACH ROW EXECUTE FUNCTION public.progress_reject_void_series_ledger_mutation();

CREATE FUNCTION public.reject_progress_adjustment(payload JSONB)
RETURNS TABLE (
  id UUID, series_id UUID, quote_id UUID, version INT,
  replacement_id UUID, conflict BOOLEAN, current JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  adjustment_row public.progress_adjustments%ROWTYPE;
  series_row public.progress_invoice_series%ROWTYPE;
  key UUID;
  fingerprint TEXT;
  prior JSONB;
  result_refs JSONB;
BEGIN
  PERFORM public.progress_ledger_assert_payload(payload,
    ARRAY['adjustment_id','expected_version','reason','correlation_key'],
    ARRAY['adjustment_id','reason','correlation_key'], ARRAY['expected_version']);
  PERFORM public.progress_ledger_validate_reason(payload ->> 'reason');
  SELECT adjustment.* INTO adjustment_row
  FROM public.progress_adjustments AS adjustment
  WHERE adjustment.id = (payload ->> 'adjustment_id')::UUID;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT series.* INTO STRICT series_row
  FROM public.progress_invoice_series AS series
  WHERE series.id = adjustment_row.series_id FOR UPDATE;
  SELECT adjustment.* INTO STRICT adjustment_row
  FROM public.progress_adjustments AS adjustment
  WHERE adjustment.id = adjustment_row.id FOR UPDATE;
  IF series_row.status = 'void' THEN RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE = 'P0001'; END IF;
  key := (payload ->> 'correlation_key')::UUID;
  fingerprint := public.progress_request_fingerprint(payload);
  prior := public.progress_lock_idempotency(series_row.id, 'reject_progress_adjustment', key, fingerprint);
  IF prior IS NOT NULL THEN
    RETURN QUERY SELECT (prior->>'id')::UUID,(prior->>'series_id')::UUID,(prior->>'quote_id')::UUID,
      (prior->>'version')::INT,NULL::UUID,false,NULL::JSONB;
    RETURN;
  END IF;
  IF adjustment_row.version <> (payload ->> 'expected_version')::INT THEN
    RETURN QUERY SELECT adjustment_row.id,series_row.id,series_row.quote_id,adjustment_row.version,
      NULL::UUID,true,public.progress_adjustment_safe_dto(adjustment_row);
    RETURN;
  END IF;
  IF adjustment_row.status <> 'draft' THEN
    RAISE EXCEPTION 'PROGRESS_ADJUSTMENT_IMMUTABLE' USING ERRCODE = '55000';
  END IF;
  UPDATE public.progress_adjustments AS adjustment
  SET status='rejected', reason=public.progress_ledger_validate_reason(payload->>'reason'),
      version=adjustment.version+1, updated_by=actor
  WHERE adjustment.id=adjustment_row.id RETURNING adjustment.* INTO adjustment_row;
  result_refs := jsonb_build_object('id',adjustment_row.id,'series_id',series_row.id,
    'quote_id',series_row.quote_id,'version',adjustment_row.version);
  PERFORM public.progress_append_event(series_row.id,NULL,'adjustment_rejected','user',NULL,NULL,
    jsonb_build_object('adjustment_id',adjustment_row.id,'type',adjustment_row.type),
    'reject_progress_adjustment',key,fingerprint,result_refs);
  RETURN QUERY SELECT adjustment_row.id,series_row.id,series_row.quote_id,adjustment_row.version,
    NULL::UUID,false,NULL::JSONB;
END;
$$;

CREATE FUNCTION public.create_manual_progress_payment(payload JSONB)
RETURNS TABLE (
  id UUID, series_id UUID, series_version INT, version INT,
  revision_id UUID, conflict BOOLEAN, current JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  series_row public.progress_invoice_series%ROWTYPE;
  payment_row public.progress_payments%ROWTYPE;
  revision_row public.progress_payment_revisions%ROWTYPE;
  key UUID; fingerprint TEXT; prior JSONB; result_refs JSONB;
BEGIN
  PERFORM public.progress_ledger_assert_payload(payload,
    ARRAY['series_id','expected_series_version','received_date','amount','method','reference','correlation_key'],
    ARRAY['series_id','received_date','amount','method','correlation_key'],ARRAY['expected_series_version'],ARRAY['reference']);
  IF NULLIF(btrim(payload->>'method'),'') IS NULL OR length(btrim(payload->>'method')) > 80
    OR length(btrim(COALESCE(payload->>'reference',''))) > 120 THEN
    RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE='23514';
  END IF;
  PERFORM public.progress_ledger_validate_money(payload->>'amount');
  PERFORM public.progress_ledger_validate_date(payload->'received_date');
  SELECT series.* INTO series_row FROM public.progress_invoice_series AS series
  WHERE series.id=(payload->>'series_id')::UUID FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF series_row.status='void' THEN RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE='P0001'; END IF;
  key := (payload->>'correlation_key')::UUID; fingerprint := public.progress_request_fingerprint(payload);
  prior := public.progress_lock_idempotency(series_row.id,'create_manual_progress_payment',key,fingerprint);
  IF prior IS NOT NULL THEN
    RETURN QUERY SELECT (prior->>'id')::UUID,(prior->>'series_id')::UUID,(prior->>'series_version')::INT,
      (prior->>'version')::INT,(prior->>'revision_id')::UUID,false,NULL::JSONB; RETURN;
  END IF;
  IF series_row.version <> (payload->>'expected_series_version')::INT THEN
    RETURN QUERY SELECT NULL::UUID,series_row.id,series_row.version,NULL::INT,NULL::UUID,true,
      jsonb_build_object('series_id',series_row.id,'series_version',series_row.version); RETURN;
  END IF;
  INSERT INTO public.progress_payments(series_id,source,created_by,updated_by)
  VALUES(series_row.id,'manual',actor,actor) RETURNING * INTO payment_row;
  INSERT INTO public.progress_payment_revisions(
    payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,
    payment_method,reference,sync_state,status,created_by
  ) VALUES(
    payment_row.id,1,public.progress_ledger_validate_date(payload->'received_date'),
    public.progress_ledger_validate_money(payload->>'amount'),public.progress_ledger_validate_money(payload->>'amount'),
    btrim(payload->>'method'),NULLIF(btrim(COALESCE(payload->>'reference','')),''),'manual','active',actor
  ) RETURNING * INTO revision_row;
  UPDATE public.progress_payments AS payment SET current_revision_id=revision_row.id,updated_by=actor
  WHERE payment.id=payment_row.id RETURNING payment.* INTO payment_row;
  UPDATE public.progress_invoice_series AS series SET version=series.version+1,updated_by=actor
  WHERE series.id=series_row.id RETURNING series.* INTO series_row;
  PERFORM public.progress_recalculate_series_read_model_as(series_row.id,actor);
  result_refs := jsonb_build_object('id',payment_row.id,'series_id',series_row.id,'series_version',series_row.version,
    'version',payment_row.version,'revision_id',revision_row.id);
  PERFORM public.progress_append_event(series_row.id,NULL,'manual_payment_created','user',NULL,NULL,
    jsonb_build_object('payment_id',payment_row.id),'create_manual_progress_payment',key,fingerprint,result_refs);
  RETURN QUERY SELECT payment_row.id,series_row.id,series_row.version,payment_row.version,revision_row.id,false,NULL::JSONB;
END;
$$;

CREATE FUNCTION public.replace_manual_progress_payment(payload JSONB)
RETURNS TABLE (
  id UUID, series_id UUID, series_version INT, version INT,
  revision_id UUID, conflict BOOLEAN, current JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor UUID := public.progress_require_actor();
  series_row public.progress_invoice_series%ROWTYPE; payment_row public.progress_payments%ROWTYPE;
  current_revision public.progress_payment_revisions%ROWTYPE; next_revision public.progress_payment_revisions%ROWTYPE;
  key UUID; fingerprint TEXT; prior JSONB; result_refs JSONB;
BEGIN
  PERFORM public.progress_ledger_assert_payload(payload,
    ARRAY['payment_id','expected_version','received_date','amount','method','reference','reason','correlation_key'],
    ARRAY['payment_id','received_date','amount','method','reason','correlation_key'],ARRAY['expected_version'],ARRAY['reference']);
  PERFORM public.progress_ledger_validate_reason(payload->>'reason');
  PERFORM public.progress_ledger_validate_money(payload->>'amount');
  PERFORM public.progress_ledger_validate_date(payload->'received_date');
  IF NULLIF(btrim(payload->>'method'),'') IS NULL OR length(btrim(payload->>'method'))>80
    OR length(btrim(COALESCE(payload->>'reference','')))>120 THEN RAISE EXCEPTION 'PROGRESS_VALIDATION_FAILED' USING ERRCODE='23514'; END IF;
  SELECT payment.* INTO payment_row FROM public.progress_payments AS payment WHERE payment.id=(payload->>'payment_id')::UUID;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  SELECT series.* INTO STRICT series_row FROM public.progress_invoice_series AS series WHERE series.id=payment_row.series_id FOR UPDATE;
  SELECT payment.* INTO STRICT payment_row FROM public.progress_payments AS payment WHERE payment.id=payment_row.id FOR UPDATE;
  SELECT revision.* INTO STRICT current_revision FROM public.progress_payment_revisions AS revision
  WHERE revision.id=payment_row.current_revision_id AND revision.payment_id=payment_row.id;
  IF series_row.status='void' THEN RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE='P0001'; END IF;
  key := (payload->>'correlation_key')::UUID; fingerprint := public.progress_request_fingerprint(payload);
  prior := public.progress_lock_idempotency(series_row.id,'replace_manual_progress_payment',key,fingerprint);
  IF prior IS NOT NULL THEN RETURN QUERY SELECT (prior->>'id')::UUID,(prior->>'series_id')::UUID,(prior->>'series_version')::INT,
    (prior->>'version')::INT,(prior->>'revision_id')::UUID,false,NULL::JSONB; RETURN; END IF;
  IF payment_row.version<>(payload->>'expected_version')::INT THEN RETURN QUERY SELECT payment_row.id,series_row.id,series_row.version,
    payment_row.version,current_revision.id,true,public.progress_payment_safe_dto(payment_row,current_revision); RETURN; END IF;
  IF payment_row.source<>'manual' OR current_revision.status<>'active' OR EXISTS(
    SELECT 1 FROM public.progress_payments AS jobber WHERE jobber.matched_manual_payment_id=payment_row.id
  ) THEN RAISE EXCEPTION 'PROGRESS_PAYMENT_IMMUTABLE' USING ERRCODE='55000'; END IF;
  INSERT INTO public.progress_payment_revisions(payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,
    payment_method,reference,sync_state,status,predecessor_revision_id,created_by,reason)
  VALUES(payment_row.id,current_revision.revision_number+1,public.progress_ledger_validate_date(payload->'received_date'),
    public.progress_ledger_validate_money(payload->>'amount'),public.progress_ledger_validate_money(payload->>'amount'),
    btrim(payload->>'method'),NULLIF(btrim(COALESCE(payload->>'reference','')),''),'manual','active',current_revision.id,actor,
    public.progress_ledger_validate_reason(payload->>'reason')) RETURNING * INTO next_revision;
  UPDATE public.progress_payments AS payment SET current_revision_id=next_revision.id,version=payment.version+1,updated_by=actor
  WHERE payment.id=payment_row.id RETURNING payment.* INTO payment_row;
  UPDATE public.progress_invoice_series AS series SET version=series.version+1,updated_by=actor WHERE series.id=series_row.id RETURNING series.* INTO series_row;
  PERFORM public.progress_recalculate_series_read_model_as(series_row.id,actor);
  result_refs:=jsonb_build_object('id',payment_row.id,'series_id',series_row.id,'series_version',series_row.version,'version',payment_row.version,'revision_id',next_revision.id);
  PERFORM public.progress_append_event(series_row.id,NULL,'manual_payment_replaced','user',NULL,NULL,jsonb_build_object('payment_id',payment_row.id),
    'replace_manual_progress_payment',key,fingerprint,result_refs);
  RETURN QUERY SELECT payment_row.id,series_row.id,series_row.version,payment_row.version,next_revision.id,false,NULL::JSONB;
END;
$$;

CREATE FUNCTION public.void_manual_progress_payment(payload JSONB)
RETURNS TABLE (id UUID,series_id UUID,series_version INT,version INT,revision_id UUID,conflict BOOLEAN,current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor UUID:=public.progress_require_actor(); series_row public.progress_invoice_series%ROWTYPE;
  payment_row public.progress_payments%ROWTYPE; current_revision public.progress_payment_revisions%ROWTYPE;
  next_revision public.progress_payment_revisions%ROWTYPE; key UUID; fingerprint TEXT; prior JSONB; result_refs JSONB;
BEGIN
  PERFORM public.progress_ledger_assert_payload(payload,ARRAY['payment_id','expected_version','reason','correlation_key'],
    ARRAY['payment_id','reason','correlation_key'],ARRAY['expected_version']);
  PERFORM public.progress_ledger_validate_reason(payload->>'reason');
  SELECT payment.* INTO payment_row FROM public.progress_payments AS payment WHERE payment.id=(payload->>'payment_id')::UUID;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  SELECT series.* INTO STRICT series_row FROM public.progress_invoice_series AS series WHERE series.id=payment_row.series_id FOR UPDATE;
  SELECT payment.* INTO STRICT payment_row FROM public.progress_payments AS payment WHERE payment.id=payment_row.id FOR UPDATE;
  SELECT revision.* INTO STRICT current_revision FROM public.progress_payment_revisions AS revision WHERE revision.id=payment_row.current_revision_id AND revision.payment_id=payment_row.id;
  IF series_row.status='void' THEN RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE='P0001'; END IF;
  key:=(payload->>'correlation_key')::UUID; fingerprint:=public.progress_request_fingerprint(payload);
  prior:=public.progress_lock_idempotency(series_row.id,'void_manual_progress_payment',key,fingerprint);
  IF prior IS NOT NULL THEN RETURN QUERY SELECT (prior->>'id')::UUID,(prior->>'series_id')::UUID,(prior->>'series_version')::INT,(prior->>'version')::INT,(prior->>'revision_id')::UUID,false,NULL::JSONB; RETURN; END IF;
  IF payment_row.version<>(payload->>'expected_version')::INT THEN RETURN QUERY SELECT payment_row.id,series_row.id,series_row.version,payment_row.version,current_revision.id,true,public.progress_payment_safe_dto(payment_row,current_revision); RETURN; END IF;
  IF payment_row.source<>'manual' OR current_revision.status<>'active' OR EXISTS(SELECT 1 FROM public.progress_payments j WHERE j.matched_manual_payment_id=payment_row.id)
  THEN RAISE EXCEPTION 'PROGRESS_PAYMENT_IMMUTABLE' USING ERRCODE='55000'; END IF;
  INSERT INTO public.progress_payment_revisions(payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,payment_method,
    reference,sync_state,status,predecessor_revision_id,created_by,reason)
  VALUES(payment_row.id,current_revision.revision_number+1,current_revision.received_date,current_revision.observed_amount,0,current_revision.payment_method,
    current_revision.reference,'manual','void',current_revision.id,actor,public.progress_ledger_validate_reason(payload->>'reason')) RETURNING * INTO next_revision;
  UPDATE public.progress_payments AS payment SET current_revision_id=next_revision.id,version=payment.version+1,updated_by=actor WHERE payment.id=payment_row.id RETURNING payment.* INTO payment_row;
  UPDATE public.progress_invoice_series AS series SET version=series.version+1,updated_by=actor WHERE series.id=series_row.id RETURNING series.* INTO series_row;
  PERFORM public.progress_recalculate_series_read_model_as(series_row.id,actor);
  result_refs:=jsonb_build_object('id',payment_row.id,'series_id',series_row.id,'series_version',series_row.version,'version',payment_row.version,'revision_id',next_revision.id);
  PERFORM public.progress_append_event(series_row.id,NULL,'manual_payment_voided','user',NULL,NULL,jsonb_build_object('payment_id',payment_row.id),'void_manual_progress_payment',key,fingerprint,result_refs);
  RETURN QUERY SELECT payment_row.id,series_row.id,series_row.version,payment_row.version,next_revision.id,false,NULL::JSONB;
END;
$$;

CREATE FUNCTION public.reconcile_progress_payment(payload JSONB)
RETURNS TABLE (id UUID,series_id UUID,series_version INT,version INT,revision_id UUID,conflict BOOLEAN,current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor UUID:=public.progress_require_actor(); series_row public.progress_invoice_series%ROWTYPE;
  jobber public.progress_payments%ROWTYPE; manual public.progress_payments%ROWTYPE;
  jobber_revision public.progress_payment_revisions%ROWTYPE; manual_revision public.progress_payment_revisions%ROWTYPE;
  next_manual public.progress_payment_revisions%ROWTYPE; key UUID; fingerprint TEXT; prior JSONB; result_refs JSONB; lock_id UUID;
BEGIN
  PERFORM public.progress_ledger_assert_payload(payload,
    ARRAY['jobber_payment_id','manual_payment_id','jobber_expected_version','manual_expected_version','reason','correlation_key'],
    ARRAY['jobber_payment_id','manual_payment_id','reason','correlation_key'],ARRAY['jobber_expected_version','manual_expected_version']);
  PERFORM public.progress_ledger_validate_reason(payload->>'reason');
  SELECT payment.* INTO jobber FROM public.progress_payments AS payment WHERE payment.id=(payload->>'jobber_payment_id')::UUID;
  SELECT payment.* INTO manual FROM public.progress_payments AS payment WHERE payment.id=(payload->>'manual_payment_id')::UUID;
  IF jobber.id IS NULL OR manual.id IS NULL THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF jobber.series_id<>manual.series_id THEN RAISE EXCEPTION 'PROGRESS_PAYMENT_MATCH_PARENT_MISMATCH' USING ERRCODE='23514'; END IF;
  SELECT series.* INTO STRICT series_row FROM public.progress_invoice_series AS series WHERE series.id=jobber.series_id FOR UPDATE;
  FOR lock_id IN SELECT value FROM unnest(ARRAY[jobber.id,manual.id]) value ORDER BY value LOOP
    PERFORM payment.id FROM public.progress_payments AS payment WHERE payment.id=lock_id FOR UPDATE;
  END LOOP;
  SELECT payment.* INTO STRICT jobber FROM public.progress_payments AS payment WHERE payment.id=(payload->>'jobber_payment_id')::UUID;
  SELECT payment.* INTO STRICT manual FROM public.progress_payments AS payment WHERE payment.id=(payload->>'manual_payment_id')::UUID;
  SELECT revision.* INTO STRICT jobber_revision FROM public.progress_payment_revisions AS revision WHERE revision.id=jobber.current_revision_id AND revision.payment_id=jobber.id;
  SELECT revision.* INTO STRICT manual_revision FROM public.progress_payment_revisions AS revision WHERE revision.id=manual.current_revision_id AND revision.payment_id=manual.id;
  IF series_row.status='void' THEN RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE='P0001'; END IF;
  key:=(payload->>'correlation_key')::UUID; fingerprint:=public.progress_request_fingerprint(payload);
  prior:=public.progress_lock_idempotency(series_row.id,'reconcile_progress_payment',key,fingerprint);
  IF prior IS NOT NULL THEN RETURN QUERY SELECT (prior->>'id')::UUID,(prior->>'series_id')::UUID,(prior->>'series_version')::INT,(prior->>'version')::INT,(prior->>'revision_id')::UUID,false,NULL::JSONB; RETURN; END IF;
  IF jobber.version<>(payload->>'jobber_expected_version')::INT THEN RETURN QUERY SELECT jobber.id,series_row.id,series_row.version,jobber.version,manual_revision.id,true,public.progress_payment_safe_dto(jobber,jobber_revision); RETURN; END IF;
  IF manual.version<>(payload->>'manual_expected_version')::INT THEN RETURN QUERY SELECT manual.id,series_row.id,series_row.version,manual.version,manual_revision.id,true,public.progress_payment_safe_dto(manual,manual_revision); RETURN; END IF;
  IF jobber.source<>'jobber' OR manual.source<>'manual' OR jobber.matched_manual_payment_id IS NOT NULL
    OR jobber_revision.status<>'active' OR manual_revision.status<>'active'
    OR EXISTS(SELECT 1 FROM public.progress_payments AS other WHERE other.matched_manual_payment_id=manual.id)
  THEN RAISE EXCEPTION 'PROGRESS_PAYMENT_MATCH_INVALID' USING ERRCODE='23514'; END IF;
  INSERT INTO public.progress_payment_revisions(payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,payment_method,
    reference,sync_state,status,predecessor_revision_id,created_by,reason)
  VALUES(manual.id,manual_revision.revision_number+1,manual_revision.received_date,manual_revision.observed_amount,0,manual_revision.payment_method,
    manual_revision.reference,'manual','superseded',manual_revision.id,actor,public.progress_ledger_validate_reason(payload->>'reason')) RETURNING * INTO next_manual;
  UPDATE public.progress_payments AS payment SET current_revision_id=next_manual.id,version=payment.version+1,updated_by=actor WHERE payment.id=manual.id RETURNING payment.* INTO manual;
  UPDATE public.progress_payments AS payment SET matched_manual_payment_id=manual.id,version=payment.version+1,updated_by=actor WHERE payment.id=jobber.id RETURNING payment.* INTO jobber;
  UPDATE public.progress_invoice_series AS series SET version=series.version+1,updated_by=actor WHERE series.id=series_row.id RETURNING series.* INTO series_row;
  PERFORM public.progress_recalculate_series_read_model_as(series_row.id,actor);
  result_refs:=jsonb_build_object('id',jobber.id,'series_id',series_row.id,'series_version',series_row.version,'version',jobber.version,'revision_id',next_manual.id);
  PERFORM public.progress_append_event(series_row.id,NULL,'payment_reconciled','user',NULL,NULL,jsonb_build_object('payment_id',jobber.id),'reconcile_progress_payment',key,fingerprint,result_refs);
  RETURN QUERY SELECT jobber.id,series_row.id,series_row.version,jobber.version,next_manual.id,false,NULL::JSONB;
END;
$$;

CREATE FUNCTION public.undo_progress_payment_reconciliation(payload JSONB)
RETURNS TABLE (id UUID,series_id UUID,series_version INT,version INT,revision_id UUID,conflict BOOLEAN,current JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor UUID:=public.progress_require_actor(); series_row public.progress_invoice_series%ROWTYPE;
  jobber public.progress_payments%ROWTYPE; manual public.progress_payments%ROWTYPE;
  jobber_revision public.progress_payment_revisions%ROWTYPE; manual_revision public.progress_payment_revisions%ROWTYPE;
  next_manual public.progress_payment_revisions%ROWTYPE; key UUID; fingerprint TEXT; prior JSONB; result_refs JSONB; lock_id UUID;
BEGIN
  PERFORM public.progress_ledger_assert_payload(payload,
    ARRAY['jobber_payment_id','manual_payment_id','jobber_expected_version','manual_expected_version','reason','correlation_key'],
    ARRAY['jobber_payment_id','manual_payment_id','reason','correlation_key'],ARRAY['jobber_expected_version','manual_expected_version']);
  PERFORM public.progress_ledger_validate_reason(payload->>'reason');
  SELECT payment.* INTO jobber FROM public.progress_payments AS payment WHERE payment.id=(payload->>'jobber_payment_id')::UUID;
  SELECT payment.* INTO manual FROM public.progress_payments AS payment WHERE payment.id=(payload->>'manual_payment_id')::UUID;
  IF jobber.id IS NULL OR manual.id IS NULL THEN RAISE EXCEPTION 'PROGRESS_NOT_FOUND' USING ERRCODE='P0001'; END IF;
  IF jobber.series_id<>manual.series_id THEN RAISE EXCEPTION 'PROGRESS_PAYMENT_MATCH_PARENT_MISMATCH' USING ERRCODE='23514'; END IF;
  SELECT series.* INTO STRICT series_row FROM public.progress_invoice_series AS series WHERE series.id=jobber.series_id FOR UPDATE;
  FOR lock_id IN SELECT value FROM unnest(ARRAY[jobber.id,manual.id]) value ORDER BY value LOOP
    PERFORM payment.id FROM public.progress_payments AS payment WHERE payment.id=lock_id FOR UPDATE;
  END LOOP;
  SELECT payment.* INTO STRICT jobber FROM public.progress_payments AS payment WHERE payment.id=(payload->>'jobber_payment_id')::UUID;
  SELECT payment.* INTO STRICT manual FROM public.progress_payments AS payment WHERE payment.id=(payload->>'manual_payment_id')::UUID;
  SELECT revision.* INTO STRICT jobber_revision FROM public.progress_payment_revisions AS revision WHERE revision.id=jobber.current_revision_id AND revision.payment_id=jobber.id;
  SELECT revision.* INTO STRICT manual_revision FROM public.progress_payment_revisions AS revision WHERE revision.id=manual.current_revision_id AND revision.payment_id=manual.id;
  IF series_row.status='void' THEN RAISE EXCEPTION 'PROGRESS_SERIES_VOID' USING ERRCODE='P0001'; END IF;
  key:=(payload->>'correlation_key')::UUID; fingerprint:=public.progress_request_fingerprint(payload);
  prior:=public.progress_lock_idempotency(series_row.id,'undo_progress_payment_reconciliation',key,fingerprint);
  IF prior IS NOT NULL THEN RETURN QUERY SELECT (prior->>'id')::UUID,(prior->>'series_id')::UUID,(prior->>'series_version')::INT,(prior->>'version')::INT,(prior->>'revision_id')::UUID,false,NULL::JSONB; RETURN; END IF;
  IF jobber.version<>(payload->>'jobber_expected_version')::INT THEN RETURN QUERY SELECT jobber.id,series_row.id,series_row.version,jobber.version,manual_revision.id,true,public.progress_payment_safe_dto(jobber,jobber_revision); RETURN; END IF;
  IF manual.version<>(payload->>'manual_expected_version')::INT THEN RETURN QUERY SELECT manual.id,series_row.id,series_row.version,manual.version,manual_revision.id,true,public.progress_payment_safe_dto(manual,manual_revision); RETURN; END IF;
  IF jobber.source<>'jobber' OR manual.source<>'manual' OR jobber.matched_manual_payment_id IS DISTINCT FROM manual.id
    OR jobber_revision.status<>'active' OR manual_revision.status<>'superseded'
  THEN RAISE EXCEPTION 'PROGRESS_PAYMENT_MATCH_INVALID' USING ERRCODE='23514'; END IF;
  INSERT INTO public.progress_payment_revisions(payment_id,revision_number,received_date,observed_amount,effective_receipt_amount,payment_method,
    reference,sync_state,status,predecessor_revision_id,created_by,reason)
  VALUES(manual.id,manual_revision.revision_number+1,manual_revision.received_date,manual_revision.observed_amount,manual_revision.observed_amount,
    manual_revision.payment_method,manual_revision.reference,'manual','active',manual_revision.id,actor,public.progress_ledger_validate_reason(payload->>'reason')) RETURNING * INTO next_manual;
  UPDATE public.progress_payments AS payment SET current_revision_id=next_manual.id,version=payment.version+1,updated_by=actor WHERE payment.id=manual.id RETURNING payment.* INTO manual;
  UPDATE public.progress_payments AS payment SET matched_manual_payment_id=NULL,version=payment.version+1,updated_by=actor WHERE payment.id=jobber.id RETURNING payment.* INTO jobber;
  UPDATE public.progress_invoice_series AS series SET version=series.version+1,updated_by=actor WHERE series.id=series_row.id RETURNING series.* INTO series_row;
  PERFORM public.progress_recalculate_series_read_model_as(series_row.id,actor);
  result_refs:=jsonb_build_object('id',jobber.id,'series_id',series_row.id,'series_version',series_row.version,'version',jobber.version,'revision_id',next_manual.id);
  PERFORM public.progress_append_event(series_row.id,NULL,'payment_reconciliation_undone','user',NULL,NULL,jsonb_build_object('payment_id',jobber.id),'undo_progress_payment_reconciliation',key,fingerprint,result_refs);
  RETURN QUERY SELECT jobber.id,series_row.id,series_row.version,jobber.version,next_manual.id,false,NULL::JSONB;
END;
$$;

REVOKE ALL ON FUNCTION public.progress_ledger_assert_payload(JSONB,TEXT[],TEXT[],TEXT[],TEXT[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_ledger_validate_reason(TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_ledger_validate_money(TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_ledger_validate_date(JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_payment_safe_dto(public.progress_payments,public.progress_payment_revisions) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.progress_reject_void_series_ledger_mutation() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.reject_progress_adjustment(JSONB) FROM PUBLIC,anon,service_role,authenticated;
REVOKE ALL ON FUNCTION public.create_manual_progress_payment(JSONB) FROM PUBLIC,anon,service_role,authenticated;
REVOKE ALL ON FUNCTION public.replace_manual_progress_payment(JSONB) FROM PUBLIC,anon,service_role,authenticated;
REVOKE ALL ON FUNCTION public.void_manual_progress_payment(JSONB) FROM PUBLIC,anon,service_role,authenticated;
REVOKE ALL ON FUNCTION public.reconcile_progress_payment(JSONB) FROM PUBLIC,anon,service_role,authenticated;
REVOKE ALL ON FUNCTION public.undo_progress_payment_reconciliation(JSONB) FROM PUBLIC,anon,service_role,authenticated;
GRANT EXECUTE ON FUNCTION public.reject_progress_adjustment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_progress_payment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_manual_progress_payment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_manual_progress_payment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_progress_payment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_progress_payment_reconciliation(JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
