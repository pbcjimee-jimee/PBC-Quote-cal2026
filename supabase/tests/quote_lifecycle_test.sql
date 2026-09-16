BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('90000000-0000-4000-8000-000000000001', 'lifecycle-admin@example.test'),
  ('90000000-0000-4000-8000-000000000002', 'lifecycle-supervisor@example.test');
INSERT INTO public.user_profiles (id, email, role, is_active) VALUES
  ('90000000-0000-4000-8000-000000000001', 'lifecycle-admin@example.test', 'admin', true),
  ('90000000-0000-4000-8000-000000000002', 'lifecycle-supervisor@example.test', 'supervisor', true);
INSERT INTO public.quotes (id, customer_name, jobber_quote_id, jobber_snapshot, working_days,
  labour_per_day, formula1_total, formula2_total, formula3_total, formula4_total, formula5_total,
  selected_min, selected_max, subtotal, final_total, pricing_settings_snapshot, created_by,
  interior_selected_min, interior_selected_max, exterior_selected_min, exterior_selected_max, roof_selected_min, roof_selected_max)
VALUES ('90000000-0000-4000-8000-000000000101', 'Recovery fixture', 'jobber-lifecycle-test',
  '{"quoteNumber":"lifecycle-test"}', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
  '90000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2);
INSERT INTO public.quote_items (quote_id, product_name_snapshot, market_price_snapshot, actual_price_snapshot, quantity, memo)
VALUES ('90000000-0000-4000-8000-000000000101', 'Fixture paint', 10, 8, 1, 'Keep this memo');
INSERT INTO public.quote_options (id, quote_id, title, working_days, labour_per_day, material_market,
  material_actual, formula1_total, formula2_total, formula3_total, formula4_total, formula5_total,
  selected_min, selected_max, subtotal, final_total)
VALUES ('90000000-0000-4000-8000-000000000201', '90000000-0000-4000-8000-000000000101',
  'Fixture option', 1, 1, 10, 8, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55);
INSERT INTO public.quote_option_items (option_id, product_name_snapshot, market_price_snapshot, actual_price_snapshot, quantity)
VALUES ('90000000-0000-4000-8000-000000000201', 'Option fixture paint', 10, 8, 1);
INSERT INTO public.quote_memos (quote_id, body) VALUES ('90000000-0000-4000-8000-000000000101', 'Internal memo');
INSERT INTO public.jobber_quote_lines (quote_id, kind, name, jobber_line_item_id)
VALUES ('90000000-0000-4000-8000-000000000101', 'line_item', 'Fixture service', 'original-line-id');
INSERT INTO public.quote_price_revisions (quote_id, revision_number, event_type, new_subtotal, new_final_total)
VALUES ('90000000-0000-4000-8000-000000000101', 1, 'created', 10.50, 11.55);

CREATE TEMP TABLE original_children AS
SELECT 'parent' AS kind, to_jsonb(q) - ARRAY['deleted_at','deleted_by','version','updated_at','updated_by'] AS body FROM public.quotes q
UNION ALL SELECT 'items', to_jsonb(i) FROM public.quote_items i
UNION ALL SELECT 'options', to_jsonb(o) FROM public.quote_options o
UNION ALL SELECT 'option_items', to_jsonb(i) FROM public.quote_option_items i
UNION ALL SELECT 'memos', to_jsonb(m) FROM public.quote_memos m
UNION ALL SELECT 'lines', to_jsonb(l) FROM public.jobber_quote_lines l
UNION ALL SELECT 'revisions', to_jsonb(r) FROM public.quote_price_revisions r;
GRANT SELECT ON original_children TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$SELECT * FROM public.soft_delete_quote('90000000-0000-4000-8000-000000000101', 1)$$,
  'admin moves the quote to trash');
SELECT is((SELECT count(*) FROM public.quotes WHERE id='90000000-0000-4000-8000-000000000101'), 1::bigint, 'parent retained');
SELECT ok((SELECT deleted_at IS NOT NULL AND deleted_by=auth.uid() AND version=2 FROM public.quotes WHERE id='90000000-0000-4000-8000-000000000101'), 'server records actor and increments version');
SELECT lives_ok($$SELECT * FROM public.soft_delete_quote('90000000-0000-4000-8000-000000000101', 1)$$, 'delete retry is idempotent');
SELECT is((SELECT count(*) FROM public.quote_lifecycle_events), 1::bigint, 'one delete event');
SELECT is((SELECT count(*) FROM public.find_quote_by_jobber_identity(NULL, '{"quoteNumber":"lifecycle-test"}')), 1::bigint, 'identity lookup includes archived snapshot matches');
SELECT ok(app_auth.quote_identity_keys(encode(convert_to('gid://Jobber/Quote/52237381','UTF8'),'base64'), NULL) && ARRAY['52237381'], 'encoded Jobber IDs match numeric legacy IDs');
SELECT throws_ok($$SELECT public.apply_quote_jobber_result('90000000-0000-4000-8000-000000000101',2,'{"jobber_sync_status":"synced"}','[{"sourcePosition":0,"jobberLineItemId":"late-id"}]')$$, 'P0001', 'QUOTE_DELETED', 'late sync cannot modify archived parent or lines');
SELECT throws_ok($$SELECT * FROM public.soft_delete_quote('90000000-0000-4000-8000-000000000101', 0)$$, '22023', 'QUOTE_VERSION_REQUIRED', 'invalid versions rejected');
SELECT throws_ok($$SELECT * FROM public.restore_quote('90000000-0000-4000-8000-000000000199', 1)$$, 'P0002', 'QUOTE_NOT_FOUND', 'missing quote is not a successful restore');
SELECT throws_ok($$SELECT * FROM public.update_quote_with_children('{"id":"90000000-0000-4000-8000-000000000101","expected_version":2,"quote":{}}')$$, 'P0001', 'QUOTE_DELETED', 'save RPC refuses an archived parent before replacing children');
SELECT throws_ok($$INSERT INTO public.quotes SELECT (jsonb_populate_record(NULL::public.quotes, to_jsonb(q) || '{"id":"90000000-0000-4000-8000-000000000102","deleted_at":null,"deleted_by":null}')).* FROM public.quotes q WHERE q.id='90000000-0000-4000-8000-000000000101'$$, 'P0001', 'QUOTE_IN_TRASH', 'direct re-import cannot overwrite or bypass trash');
SELECT throws_ok($$DELETE FROM public.quotes WHERE id='90000000-0000-4000-8000-000000000101'$$, '42501', NULL, 'physical delete denied');
SELECT throws_ok($$UPDATE public.quotes SET customer_name='lost' WHERE id='90000000-0000-4000-8000-000000000101'$$, 'P0001', 'QUOTE_DELETED', 'archived body protected');
SELECT throws_ok($$DELETE FROM public.quote_items WHERE quote_id='90000000-0000-4000-8000-000000000101'$$, 'P0001', 'QUOTE_DELETED', 'archived materials protected');
SELECT throws_ok($$UPDATE public.quote_option_items SET quantity=2 WHERE option_id='90000000-0000-4000-8000-000000000201'$$, 'P0001', 'QUOTE_DELETED', 'archived option materials protected');
SELECT throws_ok($$DELETE FROM public.quote_options WHERE id='90000000-0000-4000-8000-000000000201'$$, 'P0001', 'QUOTE_DELETED', 'archived option cascade prevented');
SELECT throws_ok($$DELETE FROM public.quote_lifecycle_events$$, '42501', NULL, 'event deletion denied');
SELECT throws_ok($$INSERT INTO public.quote_lifecycle_events(quote_id,event_type,quote_version) VALUES ('90000000-0000-4000-8000-000000000101','restored',88)$$, '42501', NULL, 'client cannot fabricate audit events');
SELECT throws_ok($$UPDATE public.quotes SET deleted_at=NULL,customer_name='changed on restore' WHERE id='90000000-0000-4000-8000-000000000101'$$, 'P0001', 'QUOTE_LIFECYCLE_FIELDS_ONLY', 'restore cannot change saved content');
SELECT throws_ok($$SELECT * FROM public.restore_quote('90000000-0000-4000-8000-000000000101', 1)$$, 'P0001', 'QUOTE_VERSION_CONFLICT', 'stale restore rejected');
SELECT lives_ok($$SELECT * FROM public.restore_quote('90000000-0000-4000-8000-000000000101', 2)$$, 'restore succeeds');
SELECT lives_ok($$SELECT * FROM public.restore_quote('90000000-0000-4000-8000-000000000101', 2)$$, 'restore retry is idempotent');
SELECT ok((SELECT deleted_at IS NULL AND deleted_by IS NULL AND version=3 FROM public.quotes WHERE id='90000000-0000-4000-8000-000000000101'), 'same quote restored with new version');
SELECT is((SELECT count(*) FROM public.quote_lifecycle_events), 2::bigint, 'delete history survives restore');
SELECT ok(NOT EXISTS (
  (SELECT * FROM original_children EXCEPT
    (SELECT 'parent', to_jsonb(q) - ARRAY['deleted_at','deleted_by','version','updated_at','updated_by'] FROM public.quotes q
    UNION ALL SELECT 'items', to_jsonb(i) FROM public.quote_items i
    UNION ALL SELECT 'options', to_jsonb(o) FROM public.quote_options o
    UNION ALL SELECT 'option_items', to_jsonb(i) FROM public.quote_option_items i
    UNION ALL SELECT 'memos', to_jsonb(m) FROM public.quote_memos m
    UNION ALL SELECT 'lines', to_jsonb(l) FROM public.jobber_quote_lines l
    UNION ALL SELECT 'revisions', to_jsonb(r) FROM public.quote_price_revisions r))
), 'original parent fields and all child IDs and contents survive delete and restore');
SELECT is((SELECT count(*) FROM original_children), (
  (SELECT count(*) FROM public.quotes) + (SELECT count(*) FROM public.quote_items) +
  (SELECT count(*) FROM public.quote_options) + (SELECT count(*) FROM public.quote_option_items) +
  (SELECT count(*) FROM public.quote_memos) + (SELECT count(*) FROM public.jobber_quote_lines) +
  (SELECT count(*) FROM public.quote_price_revisions)
), 'delete and restore create no additional parent or child rows');
SELECT throws_ok($$SELECT * FROM public.soft_delete_quote('90000000-0000-4000-8000-000000000101', 1)$$, 'P0001', 'QUOTE_VERSION_CONFLICT', 'stale editor cannot delete restored quote');
SELECT throws_ok($$SELECT public.apply_quote_jobber_result('90000000-0000-4000-8000-000000000101',1,'{"jobber_sync_status":"synced"}','[{"sourcePosition":0,"jobberLineItemId":"late-id"}]')$$, 'P0001', 'QUOTE_VERSION_CONFLICT', 'pre-delete sync cannot modify a restored quote');
SELECT throws_ok($$SELECT public.apply_quote_jobber_result('90000000-0000-4000-8000-000000000101',3,'{"deleted_at":null}')$$, 'P0001', 'INVALID_JOBBER_RESULT', 'sync RPC cannot alter lifecycle or unrelated fields');
SELECT lives_ok($$SELECT public.apply_quote_jobber_result('90000000-0000-4000-8000-000000000101',3,'{"jobber_sync_status":"synced"}','[{"sourcePosition":0,"jobberLineItemId":"current-id"}]')$$, 'current sync result succeeds atomically');
SELECT is((SELECT jobber_line_item_id FROM public.jobber_quote_lines WHERE quote_id='90000000-0000-4000-8000-000000000101'), 'current-id', 'current line mapping saved');
SELECT throws_ok($$SELECT public.apply_quote_jobber_result('90000000-0000-4000-8000-000000000101',3,'{"jobber_sync_status":"failed"}','[{"sourcePosition":"invalid","jobberLineItemId":"bad-id"}]')$$, '22P02', NULL, 'invalid child update rolls back sync status');
SELECT is((SELECT jobber_sync_status FROM public.quotes WHERE id='90000000-0000-4000-8000-000000000101'), 'synced', 'failed sync transaction leaves parent unchanged');
SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
SELECT throws_ok($$SELECT * FROM public.soft_delete_quote('90000000-0000-4000-8000-000000000101', 3)$$, '42501', 'ADMIN_REQUIRED', 'supervisor cannot delete');
SELECT throws_ok($$SELECT * FROM public.restore_quote('90000000-0000-4000-8000-000000000101', 3)$$, '42501', 'ADMIN_REQUIRED', 'supervisor cannot restore');
SELECT is((SELECT count(*) FROM public.quote_lifecycle_events), 0::bigint, 'supervisor cannot read audit events');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.restore_quote('90000000-0000-4000-8000-000000000101',3)$$, '42501', NULL, 'anonymous restore denied');
RESET ROLE;
SELECT ok(NOT has_table_privilege('service_role', 'public.quotes', 'DELETE'), 'service role cannot physically delete quotes');
ALTER TABLE public.quotes DISABLE TRIGGER quote_lifecycle_guard;
INSERT INTO public.quotes SELECT (jsonb_populate_record(NULL::public.quotes, to_jsonb(q) || '{"id":"90000000-0000-4000-8000-000000000102"}')).* FROM public.quotes q WHERE q.id='90000000-0000-4000-8000-000000000101';
ALTER TABLE public.quotes ENABLE TRIGGER quote_lifecycle_guard;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
SELECT lives_ok($$SELECT * FROM public.soft_delete_quote('90000000-0000-4000-8000-000000000102',3)$$, 'legacy duplicate can be archived');
SELECT throws_ok($$SELECT * FROM public.restore_quote('90000000-0000-4000-8000-000000000102',4)$$, 'P0001', 'QUOTE_RESTORE_CONFLICT', 'restore refuses an active legacy duplicate');
SELECT ok((SELECT deleted_at IS NOT NULL AND version=4 FROM public.quotes WHERE id='90000000-0000-4000-8000-000000000102'), 'failed restore retains trash and version');
SELECT is((SELECT count(*) FROM public.quote_lifecycle_events WHERE quote_id='90000000-0000-4000-8000-000000000102'),1::bigint,'failed restore records no false event');
RESET ROLE;
CREATE FUNCTION pg_temp.reject_lifecycle_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'TEST_AUDIT_FAILURE'; END;
$$;
CREATE TRIGGER test_reject_event BEFORE INSERT ON public.quote_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_lifecycle_event();
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.soft_delete_quote('90000000-0000-4000-8000-000000000101',3)$$, 'P0001', 'TEST_AUDIT_FAILURE', 'audit failure aborts delete');
SELECT ok((SELECT deleted_at IS NULL AND version=3 FROM public.quotes WHERE id='90000000-0000-4000-8000-000000000101'), 'audit failure rolls back parent lifecycle');
SELECT is((SELECT count(*) FROM public.quote_lifecycle_events WHERE quote_id='90000000-0000-4000-8000-000000000101'),2::bigint,'audit failure leaves event count unchanged');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
