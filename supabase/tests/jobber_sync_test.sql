BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users (id, email) VALUES
  ('91000000-0000-4000-8000-000000000001', 'jobber-sync-admin@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'jobber-sync-supervisor@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'jobber-sync-inactive@example.test');
INSERT INTO public.user_profiles (id, email, role, is_active) VALUES
  ('91000000-0000-4000-8000-000000000001', 'jobber-sync-admin@example.test', 'admin', true),
  ('91000000-0000-4000-8000-000000000002', 'jobber-sync-supervisor@example.test', 'supervisor', true),
  ('91000000-0000-4000-8000-000000000003', 'jobber-sync-inactive@example.test', 'admin', false);

INSERT INTO public.quotes (id, customer_name, jobber_quote_id, jobber_save_mode, jobber_sync_status,
  working_days, labour_per_day, formula1_total, formula2_total, formula3_total, formula4_total,
  formula5_total, selected_min, selected_max, subtotal, final_total, pricing_settings_snapshot,
  created_by, interior_selected_min, interior_selected_max, exterior_selected_min,
  exterior_selected_max, roof_selected_min, roof_selected_max)
VALUES
  ('91000000-0000-4000-8000-000000000101', 'Durable fixture', 'remote-durable-101',
    'priced_line_items', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000102', 'Legacy failed fixture', 'remote-durable-102',
    'priced_line_items', 'failed', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000103', 'Tombstone fixture', 'remote-durable-103',
    'priced_line_items', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000104', 'Remote serialization fixture', 'remote-durable-104',
    'priced_line_items', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000105', 'Late result fixture', 'remote-durable-105',
    'priced_line_items', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000106', 'Legacy total fixture', 'remote-durable-106',
    'description_total', 'synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000107', 'Durable total fixture', 'remote-durable-107',
    'description_total', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000108', 'Read-only resolution fixture', 'remote-durable-108',
    'priced_line_items', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000109', 'Relink completed fixture', 'remote-old-109',
    'description_total', 'synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000110', 'Relink blocked fixture', 'remote-old-110',
    'priced_line_items', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000111', 'Archive restore fixture', 'remote-durable-111',
    'priced_line_items', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000112', 'Normalization parity fixture', 'remote-durable-112',
    'priced_line_items', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000113', 'Expired completed fixture', 'remote-durable-113',
    'priced_line_items', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2),
  ('91000000-0000-4000-8000-000000000114', 'Expired incomplete fixture', 'remote-durable-114',
    'priced_line_items', 'not_synced', 1, 1, 10, 11, 12, 13, 14, 1, 2, 10.50, 11.55, '{}',
    '91000000-0000-4000-8000-000000000001', 1, 2, 1, 2, 1, 2);
INSERT INTO public.jobber_quote_lines (quote_id, kind, name, description, quantity, unit_price,
  total_price, taxable, client_visible, jobber_line_item_id, position)
VALUES
  ('91000000-0000-4000-8000-000000000101','line_item','Walls','Public description',1,10,10,true,true,'remote-line-a',0),
  ('91000000-0000-4000-8000-000000000101','line_item','Ceiling','Removed later',1,20,20,true,true,'remote-line-b',1),
  ('91000000-0000-4000-8000-000000000102','line_item','Legacy line','',1,30,30,true,true,'legacy-line',0),
  ('91000000-0000-4000-8000-000000000103','line_item','Keep','',1,10,10,true,true,'keep-line',0),
  ('91000000-0000-4000-8000-000000000103','line_item','Remove','',1,20,20,true,true,'remove-line',1),
  ('91000000-0000-4000-8000-000000000104','line_item','Other local quote','',1,40,40,true,true,'other-line',0),
  ('91000000-0000-4000-8000-000000000105','line_item','Late result line','',1,50,50,true,true,NULL,0),
  ('91000000-0000-4000-8000-000000000106','text','Legacy scope','',NULL,NULL,NULL,false,true,'legacy-text-id',0),
  ('91000000-0000-4000-8000-000000000107','text','Durable scope','',NULL,NULL,NULL,false,true,'durable-text-id',0),
  ('91000000-0000-4000-8000-000000000108','line_item','Verified line','',1,25,25,true,true,NULL,0),
  ('91000000-0000-4000-8000-000000000108','line_item','Hidden collision','',1,99,99,true,false,'hidden-sentinel-id',0),
  ('91000000-0000-4000-8000-000000000109','text','Old scope','',NULL,NULL,NULL,false,true,'old-109-text',0),
  ('91000000-0000-4000-8000-000000000110','line_item','Old blocked line','',1,10,10,true,true,'old-110-line',0),
  ('91000000-0000-4000-8000-000000000111','line_item','Lifecycle line','',1,10,10,true,true,'lifecycle-line',0),
  ('91000000-0000-4000-8000-000000000112','line_item',E'\t Fractional line \n',E'\r Public note\t',1.235,2.345,2.90,true,true,'fractional-line-id',0),
  ('91000000-0000-4000-8000-000000000112','text',E'\n Notes\t',E' Trim me \r\n',7,99,693,true,true,'text-line-id',1),
  ('91000000-0000-4000-8000-000000000113','line_item','Expired completed line','',1,10,10,true,true,'expired-complete-id',0),
  ('91000000-0000-4000-8000-000000000114','line_item','Expired incomplete line','',1,10,10,true,true,'expired-incomplete-id',0);

INSERT INTO public.jobber_sync_operations (
  quote_id, quote_version, jobber_quote_id, desired_payload, status, result, created_by
) VALUES (
  '91000000-0000-4000-8000-000000000109',1,'remote-old-109',
  '{"saveMode":"description_total","finalTotal":"11.55","finalTotalIncludesGst":true,"lines":[{"kind":"text","name":"Old scope","description":"","clientVisible":true,"jobberLineItemId":"old-109-text","position":0}],"deletedJobberLineItemIds":[],"totalLineItemId":null}',
  'succeeded',
  '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"old-109-text"}],"expectedLineItems":[{"sourcePosition":0,"kind":"text","name":"Old scope","description":"","jobberLineItemId":"old-109-text","sortOrder":0},{"kind":"line_item","name":"Total","description":"","quantity":1,"unitPrice":10.50,"totalPrice":10.50,"taxable":true,"jobberLineItemId":"old-109-total","sortOrder":1}],"deletedLineItemIds":[]}',
  '91000000-0000-4000-8000-000000000001'
);

ALTER TABLE public.quotes DISABLE TRIGGER quote_lifecycle_guard;
UPDATE public.quotes SET jobber_quote_id=CASE id
  WHEN '91000000-0000-4000-8000-000000000103' THEN encode(convert_to('gid://Jobber/Quote/9103','UTF8'),'base64')
  WHEN '91000000-0000-4000-8000-000000000104' THEN '9103'
  WHEN '91000000-0000-4000-8000-000000000107' THEN encode(convert_to('gid://Jobber/Quote/9107','UTF8'),'base64')
END
WHERE id IN ('91000000-0000-4000-8000-000000000103','91000000-0000-4000-8000-000000000104','91000000-0000-4000-8000-000000000107');
ALTER TABLE public.quotes ENABLE TRIGGER quote_lifecycle_guard;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);

SELECT ok(has_column_privilege('authenticated','public.jobber_sync_operations','status','select'), 'safe operation columns are readable');
SELECT ok(not has_column_privilege('authenticated','public.jobber_sync_operations','claim_token','select'), 'claim tokens are not directly readable');
SELECT ok(not has_table_privilege('authenticated','public.jobber_sync_operations','insert,update,delete'), 'operations are RPC-only');
SELECT ok(not has_table_privilege('authenticated','public.jobber_sync_steps','insert,update,delete'), 'journal is RPC-only');

SELECT ok(has_function_privilege('authenticated','app_auth.latest_jobber_total_line_id(text)','execute'),
  'authenticated save wrappers can invoke the admin-guarded total ID lookup');
SELECT ok(not has_function_privilege('anon','app_auth.latest_jobber_total_line_id(text)','execute'),
  'anonymous users have no total ID lookup grant');
SELECT ok(not has_function_privilege('service_role','app_auth.latest_jobber_total_line_id(text)','execute'),
  'service role has no total ID lookup grant');
SELECT ok(not EXISTS (
  SELECT 1 FROM pg_proc procedure_row
  CROSS JOIN LATERAL aclexplode(COALESCE(procedure_row.proacl, acldefault('f',procedure_row.proowner))) privilege_row
  WHERE procedure_row.oid='app_auth.latest_jobber_total_line_id(text)'::regprocedure
    AND privilege_row.grantee=0 AND privilege_row.privilege_type='EXECUTE'
), 'PUBLIC has no total ID lookup grant');
SELECT lives_ok($$SELECT app_auth.latest_jobber_total_line_id('remote-old-109')$$,
  'active admin can invoke the total ID lookup through its granted execution boundary');
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT throws_ok($$SELECT app_auth.latest_jobber_total_line_id('remote-old-109')$$,
  '42501', 'ADMIN_REQUIRED', 'authenticated role without a user cannot look up total IDs');
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);

CREATE TEMP TABLE compatibility_creates AS
SELECT 'unlinked' AS kind, public.create_quote_with_jobber_sync(jsonb_build_object(
  'sync_requested',true,'quote',to_jsonb(q) || '{"jobber_quote_id":null,"jobber_sync_status":"not_synced"}'::jsonb,
  'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'jobber_lines','[]'::jsonb,'price_revision',NULL
)) AS quote_id FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'empty', public.create_quote_with_jobber_sync(jsonb_build_object(
  'sync_requested',true,'quote',to_jsonb(q) || '{"jobber_quote_id":"remote-empty","jobber_sync_status":"not_synced"}'::jsonb,
  'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'jobber_lines','[]'::jsonb,'price_revision',NULL
)) AS quote_id FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000101'
UNION ALL
SELECT 'hidden', public.create_quote_with_jobber_sync(jsonb_build_object(
  'sync_requested',true,'quote',to_jsonb(q) || '{"jobber_quote_id":"remote-hidden","jobber_sync_status":"not_synced"}'::jsonb,
  'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
  'jobber_lines','[{"kind":"line_item","name":"Internal only","description":"","quantity":1,"unit_price":10,"total_price":10,"taxable":true,"client_visible":false,"jobber_line_item_id":"hidden-only-id","position":0}]'::jsonb
)) AS quote_id FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000101';
SELECT is((SELECT count(id) FROM public.jobber_sync_operations operation
  WHERE operation.quote_id IN (SELECT quote_id FROM compatibility_creates)),0::bigint,
  'Save and Sync still saves without enqueue for unlinked or empty quotes');
SELECT throws_ok($$SELECT public.request_jobber_sync((SELECT quote_id FROM compatibility_creates WHERE kind='unlinked'),1)$$,
  '22023','JOBBER_QUOTE_REQUIRED','manual Retry rejects an unlinked saved quote');
SELECT throws_ok($$SELECT public.request_jobber_sync((SELECT quote_id FROM compatibility_creates WHERE kind='empty'),1)$$,
  '22023','NO_SAVED_JOBBER_LINES','manual Retry rejects a saved quote with no lines or tombstones');
SELECT throws_ok($$SELECT public.request_jobber_sync((SELECT quote_id FROM compatibility_creates WHERE kind='hidden'),1)$$,
  '22023','NO_SAVED_JOBBER_LINES','hidden-only rows do not create remote intent');
SELECT throws_ok($$
  SELECT public.create_quote_with_jobber_sync(jsonb_build_object(
    'sync_requested',false,'quote',to_jsonb(q) || '{"jobber_quote_id":"remote-duplicate-create","jobber_sync_status":"not_synced"}'::jsonb,
    'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
    'jobber_lines','[{"kind":"line_item","name":"First","description":"","quantity":1,"unit_price":10,"total_price":10,"taxable":true,"client_visible":true,"position":0},{"kind":"line_item","name":"Second","description":"","quantity":1,"unit_price":20,"total_price":20,"taxable":true,"client_visible":true,"position":0}]'::jsonb
  )) FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000101'
$$, '22023','DUPLICATE_JOBBER_SOURCE_POSITION','create wrapper rejects duplicate source positions before saving');
CREATE TEMP TABLE create_tombstone_overlap AS
SELECT public.create_quote_with_jobber_sync(jsonb_build_object(
  'sync_requested',false,'deleted_jobber_line_item_ids','["visible-create-id"]'::jsonb,
  'quote',to_jsonb(q) || '{"jobber_quote_id":"remote-visible-create","jobber_sync_status":"not_synced"}'::jsonb,
  'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
  'jobber_lines','[{"kind":"line_item","name":"Visible","description":"","quantity":1,"unit_price":10,"total_price":10,"taxable":true,"client_visible":true,"jobber_line_item_id":"visible-create-id","position":0}]'::jsonb
)) AS quote_id FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000101';
SELECT is((SELECT jobber_pending_deleted_line_item_ids FROM public.quotes
  WHERE id=(SELECT quote_id FROM create_tombstone_overlap)), '[]'::jsonb,
  'create wrapper subtracts a re-visible ID from pending tombstones');

CREATE TEMP TABLE requested_operation AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000101', 1) AS body;
SELECT is((SELECT count(id) FROM public.jobber_sync_operations WHERE quote_id='91000000-0000-4000-8000-000000000101'), 1::bigint, 'one immutable operation per version');
SELECT is((SELECT body->>'status' FROM requested_operation), 'queued', 'request queues a durable operation');
SELECT ok(not ((SELECT body FROM requested_operation) ? 'claim_token'), 'normal request does not expose claim token');
SELECT is((SELECT body #>> '{desired_payload,lines,0,name}' FROM requested_operation), 'Walls', 'desired payload is derived from saved public lines');
SELECT ok(not ((SELECT body #> '{desired_payload,lines,0}' FROM requested_operation) ? 'actual_price'), 'desired payload excludes private prices');
SELECT is((SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000101',1)->>'id'),
  (SELECT body->>'id' FROM requested_operation), 'duplicate request reuses immutable operation');

CREATE TEMP TABLE winning_claim AS
SELECT public.claim_jobber_sync_operation((SELECT (body->>'id')::uuid FROM requested_operation)) AS body;
SELECT ok((SELECT (body->>'claimed')::boolean FROM winning_claim), 'first claimant wins');
SELECT ok((SELECT body->'operation' ? 'claim_token' FROM winning_claim), 'successful claimant receives token');
CREATE TEMP TABLE losing_claim AS
SELECT public.claim_jobber_sync_operation((SELECT (body->>'id')::uuid FROM requested_operation)) AS body;
SELECT ok(not (SELECT (body->>'claimed')::boolean FROM losing_claim), 'second claimant loses');
SELECT ok(not (SELECT body->'operation' ? 'claim_token' FROM losing_claim), 'loser receives no claim token');

SELECT throws_ok($$SELECT public.begin_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM requested_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
  'edit:0','edit','{"lineItems":[{"sourcePosition":0,"name":"Walls","actualPrice":1}]}'
)$$, '22023', 'INVALID_STEP_REQUEST', 'private request fields are rejected');
SELECT throws_ok($$SELECT public.begin_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM requested_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
  'null-request','edit',NULL
)$$, '22023', 'INVALID_STEP_REQUEST', 'SQL NULL step requests are rejected explicitly');
SELECT lives_ok($$SELECT public.begin_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM requested_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
  'edit:0','edit','{"lineItems":[{"sourcePosition":0,"kind":"line_item","name":"Walls","description":"Public description","quantity":1,"unitPrice":10,"totalPrice":10,"taxable":true,"jobberLineItemId":"remote-line-a","sortOrder":0}]}'
)$$, 'valid normalized request starts one step');
SELECT throws_ok($$SELECT public.begin_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM requested_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
  'edit:0','edit','{"lineItems":[{"sourcePosition":0,"kind":"line_item","name":"Walls","description":"Public description","quantity":1,"unitPrice":10,"totalPrice":10,"taxable":true,"jobberLineItemId":"remote-line-a","sortOrder":0}]}'
)$$, 'P0001', 'STEP_ALREADY_STARTED', 'replaying begin cannot authorize a duplicate external send');
SELECT throws_ok($$DO $test$ BEGIN
  PERFORM public.complete_jobber_sync_step(
    (SELECT (body->>'id')::uuid FROM requested_operation),
    (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
    'edit:0',NULL
  );
  RAISE EXCEPTION 'TEST_EXPECTED_ROLLBACK' USING ERRCODE='P0001';
END $test$;$$, '22023', 'INVALID_STEP_RESULT', 'SQL NULL step results are rejected explicitly');
SELECT lives_ok($$SELECT public.complete_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM requested_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
  'edit:0','{"editedLineItemIds":["remote-line-a"],"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"remote-line-a"}]}'
)$$, 'already-sent result is durably recorded');
SELECT throws_ok($$SELECT public.complete_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM requested_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
  'edit:0','{"error":"raw remote error"}'
)$$, '22023', 'INVALID_STEP_RESULT', 'raw errors cannot enter the journal');

SELECT throws_ok($$SELECT public.record_jobber_sync_completion(
  (SELECT (body->>'id')::uuid FROM requested_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
  '{"syncedLineItems":[],"expectedLineItems":[],"deletedLineItemIds":[],"claimToken":"private"}'
)$$, '22023', 'INVALID_SYNC_RESULT', 'completion rejects private fields');
SELECT throws_ok($$DO $test$ BEGIN
  PERFORM public.record_jobber_sync_completion(
    (SELECT (body->>'id')::uuid FROM requested_operation),
    (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
    NULL
  );
  RAISE EXCEPTION 'TEST_EXPECTED_ROLLBACK' USING ERRCODE='P0001';
END $test$;$$, '22023', 'INVALID_SYNC_RESULT', 'SQL NULL completion payloads are rejected explicitly');
SELECT throws_ok($$DO $test$ BEGIN
  PERFORM public.record_jobber_sync_completion(
    (SELECT (body->>'id')::uuid FROM requested_operation),
    (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
    '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"remote-line-a"},{"sourcePosition":1,"jobberLineItemId":"remote-line-b"}],"expectedLineItems":[{"sourcePosition":0,"kind":"line_item","name":"Tampered walls","description":"Public description","quantity":1,"unitPrice":10,"totalPrice":10,"taxable":true,"jobberLineItemId":"remote-line-a","sortOrder":0},{"sourcePosition":1,"kind":"line_item","name":"Ceiling","description":"Removed later","quantity":1,"unitPrice":20,"totalPrice":20,"taxable":true,"jobberLineItemId":"remote-line-b","sortOrder":1}],"deletedLineItemIds":[]}'
  );
  RAISE EXCEPTION 'TEST_EXPECTED_ROLLBACK' USING ERRCODE='P0001';
END $test$;$$, 'P0001', 'SYNC_RESULT_MISMATCH', 'completion public values must match the immutable desired snapshot');
SELECT throws_ok($$DO $test$ BEGIN
  PERFORM public.record_jobber_sync_completion(
    (SELECT (body->>'id')::uuid FROM requested_operation),
    (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
    '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"remote-line-a"},{"sourcePosition":1,"jobberLineItemId":"remote-line-b"}],"expectedLineItems":[{"sourcePosition":1,"kind":"line_item","name":"Ceiling","description":"Removed later","quantity":1,"unitPrice":20,"totalPrice":20,"taxable":true,"jobberLineItemId":"remote-line-b","sortOrder":1},{"sourcePosition":0,"kind":"line_item","name":"Walls","description":"Public description","quantity":1,"unitPrice":10,"totalPrice":10,"taxable":true,"jobberLineItemId":"remote-line-a","sortOrder":0}],"deletedLineItemIds":[]}'
  );
  RAISE EXCEPTION 'TEST_EXPECTED_ROLLBACK' USING ERRCODE='P0001';
END $test$;$$, 'P0001', 'SYNC_RESULT_MISMATCH', 'completion order must match the immutable desired snapshot');
SELECT throws_ok($$DO $test$ BEGIN
  PERFORM public.record_jobber_sync_completion(
    (SELECT (body->>'id')::uuid FROM requested_operation),
    (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
    '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"remote-line-a"},{"sourcePosition":1,"jobberLineItemId":"invented-line-id"}],"expectedLineItems":[{"sourcePosition":0,"kind":"line_item","name":"Walls","description":"Public description","quantity":1,"unitPrice":10,"totalPrice":10,"taxable":true,"jobberLineItemId":"remote-line-a","sortOrder":0},{"sourcePosition":1,"kind":"line_item","name":"Ceiling","description":"Removed later","quantity":1,"unitPrice":20,"totalPrice":20,"taxable":true,"jobberLineItemId":"invented-line-id","sortOrder":1}],"deletedLineItemIds":[]}'
  );
  RAISE EXCEPTION 'TEST_EXPECTED_ROLLBACK' USING ERRCODE='P0001';
END $test$;$$, 'P0001', 'SYNC_RESULT_MISMATCH', 'completion cannot replace an immutable known remote ID');
SELECT lives_ok($$SELECT public.record_jobber_sync_completion(
  (SELECT (body->>'id')::uuid FROM requested_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim),
  '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"remote-line-a"},{"sourcePosition":1,"jobberLineItemId":"remote-line-b"}],"expectedLineItems":[{"sourcePosition":0,"kind":"line_item","name":"Walls","description":"Public description","quantity":1,"unitPrice":10,"totalPrice":10,"taxable":true,"jobberLineItemId":"remote-line-a","sortOrder":0},{"sourcePosition":1,"kind":"line_item","name":"Ceiling","description":"Removed later","quantity":1,"unitPrice":20,"totalPrice":20,"taxable":true,"jobberLineItemId":"remote-line-b","sortOrder":1}],"deletedLineItemIds":[]}'
)$$, 'full public completion marker is accepted');
SELECT lives_ok($$SELECT public.finish_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM requested_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM winning_claim), 'succeeded'
)$$, 'recorded completion can finish');
SELECT is((SELECT status FROM public.jobber_sync_operations WHERE id=(SELECT (body->>'id')::uuid FROM requested_operation)), 'succeeded', 'operation finishes once');
SELECT is((SELECT jobber_sync_status FROM public.quotes WHERE id='91000000-0000-4000-8000-000000000101'), 'synced', 'compatibility status follows authoritative success');

CREATE TEMP TABLE resolution_operation AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000108',1) AS body;
CREATE TEMP TABLE resolution_claim AS
SELECT public.claim_jobber_sync_operation((SELECT (body->>'id')::uuid FROM resolution_operation)) AS body;
SELECT lives_ok($$SELECT public.begin_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM resolution_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM resolution_claim),
  'create:0','create','{"lineItems":[{"sourcePosition":0,"kind":"line_item","name":"Verified line","description":"","quantity":1,"unitPrice":25,"totalPrice":25,"taxable":true,"sortOrder":0}]}'
)$$, 'read-only resolution fixture begins a mutation');
SELECT lives_ok($$SELECT public.complete_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM resolution_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM resolution_claim),
  'create:0','{"createdLineItemIds":["verified-line-id"],"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"verified-line-id"}]}'
)$$, 'read-only resolution fixture records the returned ID');
SELECT lives_ok($$SELECT public.record_jobber_sync_completion(
  (SELECT (body->>'id')::uuid FROM resolution_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM resolution_claim),
  '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"verified-line-id"}],"expectedLineItems":[{"sourcePosition":0,"kind":"line_item","name":"Verified line","description":"","quantity":1,"unitPrice":25,"totalPrice":25,"taxable":true,"jobberLineItemId":"verified-line-id","sortOrder":0}],"deletedLineItemIds":[]}'
)$$, 'read-only resolution fixture records full verified completion');
SELECT lives_ok($$SELECT public.finish_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM resolution_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM resolution_claim), 'reconciliation_required'
)$$, 'a known outcome can remain blocked for read-only verification');
SELECT lives_ok($$SELECT public.resolve_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM resolution_operation)
)$$, 'read-only verification resolves a complete same-version operation');
SELECT is((SELECT status FROM public.jobber_sync_operations WHERE id=(SELECT (body->>'id')::uuid FROM resolution_operation)),
  'succeeded', 'read-only resolution marks the operation succeeded');
SELECT is((SELECT jobber_line_item_id FROM public.jobber_quote_lines
  WHERE quote_id='91000000-0000-4000-8000-000000000108' AND client_visible),
  'verified-line-id', 'read-only resolution maps only a verified same-version ID');
SELECT is((SELECT jobber_line_item_id FROM public.jobber_quote_lines
  WHERE quote_id='91000000-0000-4000-8000-000000000108' AND NOT client_visible),
  'hidden-sentinel-id', 'success never maps a hidden row sharing the visible source position');

SELECT is((SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000106',1)->>'failure_code'),
  'legacy_total_unjournaled', 'legacy description-total sync without a proven Total ID is reconciliation-only');

CREATE TEMP TABLE total_operation AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000107',1) AS body;
CREATE TEMP TABLE total_claim AS
SELECT public.claim_jobber_sync_operation((SELECT (body->>'id')::uuid FROM total_operation)) AS body;
SELECT lives_ok($$SELECT public.begin_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM total_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM total_claim),
  'create:total','create','{"lineItems":[{"kind":"line_item","name":"Total","description":"","quantity":1,"unitPrice":10.50,"totalPrice":10.50,"taxable":true}]}'
)$$, 'description-total synthetic line begins with no local source position');
SELECT lives_ok($$SELECT public.complete_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM total_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM total_claim),
  'create:total','{"createdLineItemIds":["durable-total-id"]}'
)$$, 'synthetic Total ID is journaled');
SELECT lives_ok($$SELECT public.record_jobber_sync_completion(
  (SELECT (body->>'id')::uuid FROM total_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM total_claim),
  '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"durable-text-id"}],"expectedLineItems":[{"sourcePosition":0,"kind":"text","name":"Durable scope","description":"","jobberLineItemId":"durable-text-id","sortOrder":0},{"kind":"line_item","name":"Total","description":"","quantity":1,"unitPrice":10.50,"totalPrice":10.50,"taxable":true,"jobberLineItemId":"durable-total-id","sortOrder":1}],"deletedLineItemIds":[]}'
)$$, 'completion records the confirmed synthetic Total ID');
SELECT lives_ok($$SELECT public.finish_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM total_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM total_claim), 'succeeded'
)$$, 'description-total operation succeeds');
SELECT lives_ok($$
  SELECT public.update_quote_with_jobber_sync(jsonb_build_object(
    'id',q.id,'expected_version',q.version,'sync_requested',false,
    'quote',to_jsonb(q) || '{"jobber_quote_id":"9107","jobber_sync_status":"not_synced"}'::jsonb,
    'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
    'jobber_lines','[{"kind":"text","name":"Durable scope v2","description":"","taxable":false,"client_visible":true,"jobber_line_item_id":"durable-text-id","position":0}]'::jsonb
  )) FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000107'
$$, 'description-total quote advances across an equivalent remote ID encoding');
SELECT is((SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000107',2) #>> '{desired_payload,totalLineItemId}'),
  'durable-total-id', 'next description-total operation reuses the proven synthetic Total ID');
SELECT lives_ok($$
  SELECT public.update_quote_with_jobber_sync(jsonb_build_object(
    'id',q.id,'expected_version',q.version,'sync_requested',false,
    'quote',to_jsonb(q) || '{"jobber_save_mode":"priced_line_items","jobber_sync_status":"not_synced"}'::jsonb,
    'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
    'jobber_lines','[{"kind":"line_item","name":"Durable scope v3","description":"","quantity":1,"unit_price":10,"total_price":10,"taxable":true,"client_visible":true,"jobber_line_item_id":"durable-text-id","position":0}]'::jsonb
  )) FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000107'
$$, 'mode can change only through the wrapper');
SELECT ok((SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000107',3) #> '{desired_payload,deletedJobberLineItemIds}') @> '["durable-total-id"]'::jsonb,
  'switching to priced lines tombstones the proven synthetic Total ID');
SELECT lives_ok($$
  SELECT public.update_quote_with_jobber_sync(jsonb_build_object(
    'id',q.id,'expected_version',q.version,'sync_requested',false,
    'quote',to_jsonb(q) || '{"jobber_save_mode":"description_total","jobber_sync_status":"not_synced"}'::jsonb,
    'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
    'jobber_lines','[{"kind":"text","name":"Durable scope v4","description":"","taxable":false,"client_visible":true,"jobber_line_item_id":"durable-text-id","position":0}]'::jsonb
  )) FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000107'
$$, 'returning to description-total supersedes an unstarted priced operation');
SELECT ok(NOT (SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000107',4)
  #> '{desired_payload,deletedJobberLineItemIds}') @> '["durable-total-id"]'::jsonb,
  'a re-visible proven Total ID is removed from pending tombstones');
SELECT is((SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000107',4)
  #>> '{desired_payload,totalLineItemId}'),'durable-total-id',
  'the re-visible synthetic Total reuses its proven ID instead of creating a duplicate');

SELECT lives_ok($$
  SELECT public.update_quote_with_jobber_sync(jsonb_build_object(
    'id',q.id,'expected_version',q.version,'sync_requested',true,
    'deleted_jobber_line_item_ids','["old-109-explicit"]'::jsonb,
    'quote',to_jsonb(q) || '{"jobber_quote_id":"remote-new-109","jobber_save_mode":"priced_line_items","jobber_sync_status":"not_synced"}'::jsonb,
    'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
    'jobber_lines','[{"kind":"line_item","name":"New target line","description":"","quantity":1,"unit_price":15,"total_price":15,"taxable":true,"client_visible":true,"jobber_line_item_id":"new-109-line","position":0}]'::jsonb
  )) FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000109'
$$, 'a completed quote can relink through the save wrapper');
CREATE TEMP TABLE relinked_operation AS
SELECT public.get_jobber_sync_operation('91000000-0000-4000-8000-000000000109') AS body;
SELECT is((SELECT body->>'jobber_quote_id' FROM relinked_operation), 'remote-new-109',
  'relink enqueues only the incoming remote target');
SELECT ok(NOT ((SELECT body #> '{desired_payload,deletedJobberLineItemIds}' FROM relinked_operation)
  ?| ARRAY['old-109-text','old-109-total','old-109-explicit']),
  'relink never carries old-target line IDs or tombstones into the incoming target');
SELECT is((SELECT jobber_pending_deleted_line_item_ids FROM public.quotes
  WHERE id='91000000-0000-4000-8000-000000000109'), '[]'::jsonb,
  'relink clears old-target pending deletion state instead of re-scoping it');

CREATE TEMP TABLE relink_blocker AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000110',1) AS body;
SELECT lives_ok($$
  SELECT public.update_quote_with_jobber_sync(jsonb_build_object(
    'id',q.id,'expected_version',q.version,'sync_requested',true,
    'quote',to_jsonb(q) || '{"jobber_quote_id":"remote-new-110","jobber_sync_status":"not_synced"}'::jsonb,
    'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
    'jobber_lines','[{"kind":"line_item","name":"New blocked target line","description":"","quantity":1,"unit_price":20,"total_price":20,"taxable":true,"client_visible":true,"jobber_line_item_id":"new-110-line","position":0}]'::jsonb
  )) FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000110'
$$, 'relink saves locally while preserving an unresolved predecessor barrier');
SELECT is((SELECT status FROM public.jobber_sync_operations
  WHERE id=(SELECT (body->>'id')::uuid FROM relink_blocker)), 'reconciliation_required',
  'relink turns unresolved old-target work into a reconciliation barrier');
SELECT is((SELECT count(id) FROM public.jobber_sync_operations
  WHERE quote_id='91000000-0000-4000-8000-000000000110'), 1::bigint,
  'relink does not enqueue incoming-target work behind unresolved old-target work');
SELECT is((SELECT jobber_pending_deleted_line_item_ids FROM public.quotes
  WHERE id='91000000-0000-4000-8000-000000000110'), '[]'::jsonb,
  'relink barrier retains old evidence in its operation without copying IDs to the new target');

CREATE TEMP TABLE lifecycle_operation AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000111',1) AS body;
SELECT lives_ok($$SELECT public.soft_delete_quote('91000000-0000-4000-8000-000000000111',1)$$,
  'archive succeeds with a pending operation');
SELECT is((SELECT status FROM public.jobber_sync_operations
  WHERE id=(SELECT (body->>'id')::uuid FROM lifecycle_operation)), 'reconciliation_required',
  'archive preserves pending work as a reconciliation barrier');
SELECT lives_ok($$SELECT public.restore_quote('91000000-0000-4000-8000-000000000111',2)$$,
  'restore succeeds without discarding the barrier');
SELECT is((SELECT status FROM public.jobber_sync_operations
  WHERE id=(SELECT (body->>'id')::uuid FROM lifecycle_operation)), 'reconciliation_required',
  'restore keeps the archived predecessor reconciliation-only');

CREATE TEMP TABLE legacy_request AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000102',1) AS body;
SELECT is((SELECT body->>'status' FROM legacy_request), 'reconciliation_required', 'legacy failed work is reconciliation-only');
SELECT is((SELECT body->>'failure_code' FROM legacy_request), 'legacy_unjournaled', 'legacy uncertainty is explicit');
SELECT ok(not (SELECT (public.claim_jobber_sync_operation((body->>'id')::uuid)->>'claimed')::boolean FROM legacy_request), 'legacy failed work cannot be blindly claimed');
SELECT throws_ok($$SELECT public.record_jobber_sync_completion(
  (SELECT (body->>'id')::uuid FROM legacy_request),NULL,
  '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"legacy-line"}],"expectedLineItems":[{"sourcePosition":0,"kind":"line_item","name":"Legacy line","description":"","quantity":1,"unitPrice":30,"totalPrice":30,"taxable":true,"jobberLineItemId":"legacy-line","sortOrder":0}],"deletedLineItemIds":[]}'
)$$, 'P0001','SYNC_CLAIM_INVALID','a NULL token cannot fabricate a legacy completion');
SELECT throws_ok($$SELECT public.finish_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM legacy_request),NULL,'retryable'
)$$, 'P0001','SYNC_CLAIM_INVALID','a NULL token cannot unlock a legacy barrier');
SELECT lives_ok($$
  SELECT public.update_quote_with_jobber_sync(jsonb_build_object(
    'id',q.id,'expected_version',q.version,'sync_requested',false,
    'quote',to_jsonb(q) || '{"jobber_sync_status":"not_synced"}'::jsonb,
    'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
    'jobber_lines','[{"kind":"line_item","name":"Legacy line v2","description":"","quantity":1,"unit_price":30,"total_price":30,"taxable":true,"client_visible":true,"jobber_line_item_id":"legacy-line","position":0}]'::jsonb
  )) FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000102'
$$, 'plain Save advances after preserving a legacy barrier');
SELECT is((SELECT public.get_jobber_sync_operation('91000000-0000-4000-8000-000000000102')->>'failure_code'),
  'legacy_unjournaled','plain Save cannot erase the legacy reconciliation classification');

SELECT lives_ok($$
  SELECT public.update_quote_with_jobber_sync(jsonb_build_object(
    'id',q.id,'expected_version',q.version,'sync_requested',false,
    'deleted_jobber_line_item_ids','["explicit-delete"]'::jsonb,
    'quote',to_jsonb(q) || '{"jobber_sync_status":"not_synced"}'::jsonb,
    'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
    'jobber_lines','[{"kind":"line_item","name":"Keep","description":"","quantity":1,"unit_price":10,"total_price":10,"taxable":true,"client_visible":true,"jobber_line_item_id":"keep-line","position":0}]'::jsonb
  )) FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000103'
$$, 'plain Save uses the wrapper without enqueueing');
SELECT is((SELECT count(id) FROM public.jobber_sync_operations WHERE quote_id='91000000-0000-4000-8000-000000000103'), 0::bigint, 'plain Save creates no remote intent');
SELECT ok((SELECT jobber_pending_deleted_line_item_ids FROM public.quotes WHERE id='91000000-0000-4000-8000-000000000103')
  @> '["remove-line", "explicit-delete"]'::jsonb, 'plain Save preserves removed and explicit tombstones');

CREATE TEMP TABLE tombstone_operation AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000103',2) AS body;
SELECT ok((SELECT body #> '{desired_payload,deletedJobberLineItemIds}' FROM tombstone_operation)
  @> '["remove-line", "explicit-delete"]'::jsonb, 'later Retry includes all pending tombstones');
CREATE TEMP TABLE tombstone_claim AS
SELECT public.claim_jobber_sync_operation((SELECT (body->>'id')::uuid FROM tombstone_operation)) AS body;
SELECT throws_ok($$DO $test$ BEGIN
  PERFORM public.record_jobber_sync_completion(
    (SELECT (body->>'id')::uuid FROM tombstone_operation),
    (SELECT (body #>> '{operation,claim_token}')::uuid FROM tombstone_claim),
    '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"keep-line"}],"expectedLineItems":[{"sourcePosition":0,"kind":"line_item","name":"Keep","description":"","quantity":1,"unitPrice":10,"totalPrice":10,"taxable":true,"jobberLineItemId":"keep-line","sortOrder":0}],"deletedLineItemIds":[]}'
  );
  RAISE EXCEPTION 'TEST_EXPECTED_ROLLBACK' USING ERRCODE='P0001';
END $test$;$$, 'P0001', 'SYNC_RESULT_MISMATCH', 'completion must cover every intended deletion or confirmed absence');
SELECT throws_ok($$SELECT public.finish_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM tombstone_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM tombstone_claim),
  'retryable','remote_graphql_error'
)$$, '22023', 'INVALID_SYNC_FAILURE_CODE', 'arbitrary or raw preflight failure codes are rejected');
SELECT throws_ok($$SELECT public.finish_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM tombstone_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM tombstone_claim),
  'succeeded','line_kind_mismatch'
)$$, '22023', 'INVALID_SYNC_FAILURE_CODE', 'the safe preflight code is incompatible with non-retryable outcomes');
SELECT lives_ok($$SELECT public.finish_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM tombstone_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM tombstone_claim),
  'retryable','line_kind_mismatch'
)$$, 'known line-kind preflight failure can return to retryable');
SELECT is((SELECT failure_code FROM public.jobber_sync_operations
  WHERE id=(SELECT (body->>'id')::uuid FROM tombstone_operation)), 'line_kind_mismatch',
  'allowlisted line-kind mismatch is retained for status UI');
SELECT is((SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000104',1)->>'id'),
  (SELECT body->>'id' FROM tombstone_operation), 'same remote target returns its unresolved predecessor');
SELECT is((SELECT count(id) FROM public.jobber_sync_operations WHERE quote_id='91000000-0000-4000-8000-000000000104'), 0::bigint, 'same remote target cannot enqueue parallel work');

SELECT lives_ok($$
  SELECT public.update_quote_with_jobber_sync(jsonb_build_object(
    'id',q.id,'expected_version',q.version,'sync_requested',false,
    'quote',to_jsonb(q) || '{"jobber_sync_status":"not_synced"}'::jsonb,
    'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
    'jobber_lines','[{"kind":"line_item","name":"Keep","description":"","quantity":1,"unit_price":10,"total_price":10,"taxable":true,"client_visible":true,"jobber_line_item_id":"keep-line","position":0}]'::jsonb
  )) FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000103'
$$, 'a later plain Save supersedes only never-started work');
SELECT is((SELECT status FROM public.jobber_sync_operations WHERE id=(SELECT (body->>'id')::uuid FROM tombstone_operation)),
  'superseded', 'unclaimed old-version work is safely superseded');
SELECT ok((SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000103',3) #> '{desired_payload,deletedJobberLineItemIds}')
  @> '["remove-line", "explicit-delete"]'::jsonb, 'superseded work cannot drop its tombstones');

CREATE TEMP TABLE normalization_operation AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000112',1) AS body;
CREATE TEMP TABLE normalization_claim AS
SELECT public.claim_jobber_sync_operation((SELECT (body->>'id')::uuid FROM normalization_operation)) AS body;
SELECT lives_ok($$SELECT public.record_jobber_sync_completion(
  (SELECT (body->>'id')::uuid FROM normalization_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM normalization_claim),
  '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"fractional-line-id"},{"sourcePosition":1,"jobberLineItemId":"text-line-id"}],"expectedLineItems":[{"sourcePosition":0,"kind":"line_item","name":"Fractional line","description":"Public note","quantity":1.24,"unitPrice":2.35,"totalPrice":2.91,"taxable":true,"jobberLineItemId":"fractional-line-id","sortOrder":0},{"sourcePosition":1,"kind":"text","name":"Notes","description":"Trim me","jobberLineItemId":"text-line-id","sortOrder":1}],"deletedLineItemIds":[]}'
)$$, 'completion binding matches JavaScript whitespace trimming and two-stage fractional rounding');
SELECT lives_ok($$SELECT public.finish_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM normalization_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM normalization_claim), 'succeeded'
)$$, 'normalization parity completion can finish successfully');

CREATE TEMP TABLE late_operation AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000105',1) AS body;
CREATE TEMP TABLE late_claim AS
SELECT public.claim_jobber_sync_operation((SELECT (body->>'id')::uuid FROM late_operation)) AS body;
SELECT lives_ok($$SELECT public.begin_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM late_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM late_claim),
  'create:0','create','{"lineItems":[{"sourcePosition":0,"kind":"line_item","name":"Late result line","description":"","quantity":1,"unitPrice":50,"totalPrice":50,"taxable":true,"sortOrder":0}]}'
)$$, 'late-result fixture begins a remote mutation');
SELECT lives_ok($$
  SELECT public.update_quote_with_jobber_sync(jsonb_build_object(
    'id',q.id,'expected_version',q.version,'sync_requested',false,
    'quote',to_jsonb(q) || '{"jobber_sync_status":"not_synced"}'::jsonb,
    'items','[]'::jsonb,'options','[]'::jsonb,'memos','[]'::jsonb,'price_revision',NULL,
    'jobber_lines','[{"kind":"line_item","name":"Late result line v2","description":"","quantity":1,"unit_price":60,"total_price":60,"taxable":true,"client_visible":true,"position":0}]'::jsonb
  )) FROM public.quotes q WHERE q.id='91000000-0000-4000-8000-000000000105'
$$, 'plain Save may advance while an already-sent request is uncertain');
SELECT is((SELECT status FROM public.jobber_sync_operations WHERE id=(SELECT (body->>'id')::uuid FROM late_operation)),
  'reconciliation_required', 'version advance preserves a blocking uncertain predecessor');
SELECT is((SELECT failure_code FROM public.jobber_sync_operations WHERE id=(SELECT (body->>'id')::uuid FROM late_operation)),
  'quote_changed', 'changed quote is recorded without raw errors');
SELECT lives_ok($$SELECT public.finish_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM late_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM late_claim),
  'retryable','line_kind_mismatch'
)$$, 'retry request on an uncertain operation is ignored safely');
SELECT is((SELECT status FROM public.jobber_sync_operations WHERE id=(SELECT (body->>'id')::uuid FROM late_operation)),
  'reconciliation_required', 'an uncertain operation can never move back to retryable');
SELECT is((SELECT failure_code FROM public.jobber_sync_operations WHERE id=(SELECT (body->>'id')::uuid FROM late_operation)),
  'quote_changed', 'safe preflight reason cannot overwrite quote-changed uncertainty');
SELECT lives_ok($$SELECT public.complete_jobber_sync_step(
  (SELECT (body->>'id')::uuid FROM late_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM late_claim),
  'create:0','{"createdLineItemIds":["late-created-id"],"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"late-created-id"}]}'
)$$, 'late returned IDs remain recordable with the original token');
SELECT lives_ok($$SELECT public.record_jobber_sync_completion(
  (SELECT (body->>'id')::uuid FROM late_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM late_claim),
  '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"late-created-id"}],"expectedLineItems":[{"sourcePosition":0,"kind":"line_item","name":"Late result line","description":"","quantity":1,"unitPrice":50,"totalPrice":50,"taxable":true,"jobberLineItemId":"late-created-id","sortOrder":0}],"deletedLineItemIds":[]}'
)$$, 'late full result remains durable for reconciliation');
SELECT lives_ok($$SELECT public.finish_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM late_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM late_claim), 'succeeded'
)$$, 'late finish fails closed without discarding evidence');
SELECT is((SELECT status FROM public.jobber_sync_operations WHERE id=(SELECT (body->>'id')::uuid FROM late_operation)),
  'reconciliation_required', 'late finish cannot become success');
SELECT is((SELECT jobber_line_item_id FROM public.jobber_quote_lines WHERE quote_id='91000000-0000-4000-8000-000000000105'),
  NULL, 'late result never maps an old position onto the new quote version');
SELECT throws_ok($$SELECT public.resolve_jobber_sync_operation((SELECT (body->>'id')::uuid FROM late_operation))$$,
  'P0001', 'QUOTE_VERSION_CONFLICT', 'read-only resolution cannot clear a changed-version barrier');

SELECT ok((SELECT jsonb_array_length(body->'steps')=1 FROM (
  SELECT public.get_jobber_sync_operation('91000000-0000-4000-8000-000000000105') AS body
) status), 'normal status includes the safe step journal');
SELECT ok(not (SELECT body ? 'claim_token' FROM (
  SELECT public.get_jobber_sync_operation('91000000-0000-4000-8000-000000000105') AS body
) status), 'normal status omits the retained claim token');

CREATE TEMP TABLE expired_completed_operation AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000113',1) AS body;
CREATE TEMP TABLE expired_completed_claim AS
SELECT public.claim_jobber_sync_operation((SELECT (body->>'id')::uuid FROM expired_completed_operation)) AS body;
SELECT lives_ok($$SELECT public.record_jobber_sync_completion(
  (SELECT (body->>'id')::uuid FROM expired_completed_operation),
  (SELECT (body #>> '{operation,claim_token}')::uuid FROM expired_completed_claim),
  '{"syncedLineItems":[{"sourcePosition":0,"jobberLineItemId":"expired-complete-id"}],"expectedLineItems":[{"sourcePosition":0,"kind":"line_item","name":"Expired completed line","description":"","quantity":1,"unitPrice":10,"totalPrice":10,"taxable":true,"jobberLineItemId":"expired-complete-id","sortOrder":0}],"deletedLineItemIds":[]}'
)$$, 'lost-worker fixture records a full completion marker before expiry');
RESET ROLE;
UPDATE public.jobber_sync_operations SET lease_expires_at=clock_timestamp()-interval '1 second'
WHERE id=(SELECT (body->>'id')::uuid FROM expired_completed_operation);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
CREATE TEMP TABLE expired_completed_status AS
SELECT public.get_jobber_sync_operation('91000000-0000-4000-8000-000000000113') AS body;
SELECT is((SELECT body->>'status' FROM expired_completed_status), 'reconciliation_required',
  'status read expires a lost worker without claiming it');
SELECT ok((SELECT body->'result' IS NOT NULL FROM expired_completed_status),
  'status expiry retains the full completion evidence');
SELECT ok(not (SELECT body ? 'claim_token' FROM expired_completed_status),
  'status expiry emits no claim token');
SELECT is((SELECT version FROM public.quotes WHERE id='91000000-0000-4000-8000-000000000113'), 1,
  'status expiry leaves the quote version unchanged');
SELECT lives_ok($$SELECT public.resolve_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM expired_completed_operation)
)$$, 'expired completed work permits read-only reconciliation');
SELECT is((SELECT status FROM public.jobber_sync_operations
  WHERE id=(SELECT (body->>'id')::uuid FROM expired_completed_operation)), 'succeeded',
  'read-only reconciliation completes the expired fully recorded operation');

CREATE TEMP TABLE expired_incomplete_operation AS
SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000114',1) AS body;
CREATE TEMP TABLE expired_incomplete_claim AS
SELECT public.claim_jobber_sync_operation((SELECT (body->>'id')::uuid FROM expired_incomplete_operation)) AS body;
RESET ROLE;
UPDATE public.jobber_sync_operations SET lease_expires_at=clock_timestamp()-interval '1 second'
WHERE id=(SELECT (body->>'id')::uuid FROM expired_incomplete_operation);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000001', true);
CREATE TEMP TABLE expired_incomplete_status AS
SELECT public.get_jobber_sync_operation('91000000-0000-4000-8000-000000000114') AS body;
SELECT is((SELECT body->>'status' FROM expired_incomplete_status), 'reconciliation_required',
  'status read also expires running work without completion evidence');
SELECT ok((SELECT body->'result' = 'null'::jsonb FROM expired_incomplete_status),
  'expired work without completion retains no fabricated evidence');
SELECT throws_ok($$SELECT public.resolve_jobber_sync_operation(
  (SELECT (body->>'id')::uuid FROM expired_incomplete_operation)
)$$, 'P0001', 'SYNC_COMPLETION_REQUIRED', 'expired work without completion remains blocked');
SELECT is((SELECT version FROM public.quotes WHERE id='91000000-0000-4000-8000-000000000114'), 1,
  'blocked expiry leaves its quote version unchanged');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000002', true);
SELECT is((SELECT count(id) FROM public.jobber_sync_operations), 0::bigint, 'supervisor cannot read journal rows');
SELECT throws_ok($$SELECT public.request_jobber_sync('91000000-0000-4000-8000-000000000101',1)$$,
  '42501', 'ADMIN_REQUIRED', 'supervisor cannot request sync');
SELECT throws_ok($$SELECT app_auth.mark_expired_jobber_sync_claim('91000000-0000-4000-8000-000000000799')$$,
  '42501', 'ADMIN_REQUIRED', 'supervisor cannot invoke the status expiry helper');
SELECT throws_ok($$SELECT app_auth.latest_jobber_total_line_id('remote-old-109')$$,
  '42501', 'ADMIN_REQUIRED', 'supervisor cannot look up total IDs');
SELECT set_config('request.jwt.claim.sub', '91000000-0000-4000-8000-000000000003', true);
SELECT throws_ok($$SELECT app_auth.mark_expired_jobber_sync_claim('91000000-0000-4000-8000-000000000799')$$,
  '42501', 'ADMIN_REQUIRED', 'inactive admin cannot invoke the status expiry helper');
SELECT throws_ok($$SELECT app_auth.latest_jobber_total_line_id('remote-old-109')$$,
  '42501', 'ADMIN_REQUIRED', 'inactive admin cannot look up total IDs');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.get_jobber_sync_operation('91000000-0000-4000-8000-000000000101')$$,
  '42501', NULL, 'anonymous status access is denied');
SELECT throws_ok($$SELECT app_auth.mark_expired_jobber_sync_claim('91000000-0000-4000-8000-000000000799')$$,
  '42501', NULL, 'anonymous user cannot invoke the status expiry helper');
SELECT throws_ok($$SELECT app_auth.latest_jobber_total_line_id('remote-old-109')$$,
  '42501', NULL, 'anonymous user cannot look up total IDs');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
