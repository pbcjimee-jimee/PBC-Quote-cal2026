# Jobber durable sync and conservative recovery

**Model:** GPT-6 Astra max (design), GPT-6 Astra high (implementation/review).
**Approval:** User approved local implementation on 2026-09-17 ("진행"). Production migration, deployment and live Jobber mutations are not approved.

## Outcome

Save & Sync saves a durable synchronization intent in the same database transaction as the quote. Only one worker may send changes for a Jobber quote. A lost response, interrupted worker or uncertain database acknowledgment must never cause an automatic resend. Exactly-once delivery cannot be promised without an external idempotency primitive.

## Scope and invariants

- Existing quote lifecycle, calculation, role boundaries and plain Save semantics remain unchanged.
- Operations are immutable snapshots of saved, customer-visible Product / Service lines, selected save mode, final total and explicit deletion IDs. Materials, internal costs, tokens and raw errors are excluded.
- One operation per local quote/version. An unresolved operation blocks later work for both its local quote and remote Jobber quote, including across edits, archive/restore and relinking.
- A pending operation survives a missing `after()` callback. `after()` is only a best-effort kick; no new queue provider, cron or dependency.
- Atomic claims use the existing quote lifecycle lock order, a random token and a five-minute lease. An expired claim becomes `reconciliation_required`; it is never automatically reclaimed for sending.
- A status/recovery read must also classify an expired running claim as `reconciliation_required` without claiming execution or sending anything. Otherwise a worker lost after the full completion marker would remain displayed as running and `Check Jobber` could never resolve it. Preserve the recorded completion and known IDs while expiring the lease.
- Before every external mutation, persist its `sending` step and recheck the claim, lease, quote version and active state. Persist returned IDs and `applied` before sending the next mutation.
- Any begun mutation makes a failed/abandoned attempt uncertain, even if some earlier steps succeeded. A preflight failure with no begun steps is retryable.
- No automatic mutation-level retries in the durable path. In particular, no whole-workflow retry after a 401 once a mutation may have begun.
- A stale worker may record the outcome of an already-sent step with its original token, but cannot begin another step or overwrite a newer/archived quote.
- Only fully recorded completion plus read-only verification of known remote IDs/public values can resolve an uncertain operation. Unknown create IDs are never adopted using a name/price fingerprint. Partial/ambiguous results stay blocked.
- In the durable path, an explicit remote line ID missing from the complete preflight read fails closed before mutation; do not relink it to a different line by name, price or position. Fresh lines without a remote ID are the only create candidates. Keep the old transport behavior only for compatibility tests/non-durable callers; the application must use the durable path.
- User confirmed on 2026-09-17: a known remote ID whose priced/text kind differs from the intended kind is blocked during preflight, before any mutation, with a clear safe explanation. Do not automatically delete/recreate it or assume editing text fields converts its type. It remains a retryable preflight failure after the user corrects the mismatch; no remote writes occurred.
- A legacy failed sync has no trustworthy journal: its first recovery request must be reconciliation-only, not a blind resend.
- In `description_total`, the generated Total line must reuse its confirmed ID from the latest succeeded operation for the same remote quote. Select the latest successful operation across all modes first; only if that operation used `description_total` may its single synthetic expected line provide `desired_payload.totalLineItemId`. Switching to priced lines adds that confirmed Total ID to deletion tombstones. An already-synced legacy description-total quote without a proven journal ID becomes `legacy_total_unjournaled` reconciliation-only before any save resets its old status; do not guess a Total ID by name/price.
- Every application save uses the wrapper RPC, with `payload.sync_requested` controlling enqueue. Plain Save sends nothing; it persists pending deleted IDs in `quotes.jobber_pending_deleted_line_item_ids` so a later Retry does not forget removed lines. Capture a legacy failed/no-journal barrier before a plain save clears the old compatibility status.
- If an operation completes after its quote version changed or entered Trash, retain `reconciliation_required` with `quote_changed`; known IDs stay in the journal. Read-only recovery must not clear this barrier or map old positions onto new rows. Manual mapping/override is outside this release.
- RLS enabled on new tables; active admins can read; direct client DML is revoked. Narrow authenticated RPCs enforce active admin checks; private definer helpers pin `search_path = ''`.

## Storage and interface

`jobber_sync_operations`: UUID id, quote_id FK, quote_version, jobber_quote_id, desired_payload JSONB, status (`queued`, `running`, `retryable`, `reconciliation_required`, `succeeded`, `superseded`), claim_token, lease_expires_at, attempt_count, failure_code, result JSONB, created_by, timestamps. Unique `(quote_id, quote_version)`; index `(jobber_quote_id,status)` and quote/status.

`jobber_sync_steps`: operation_id, step_key, sequence, kind (`edit`, `create`, `delete`, `reorder`), request_payload JSONB, status (`sending`, `applied`), result_payload JSONB, timestamps. Unique `(operation_id, step_key)`. Never overwrite a prior request/result with a different request.

Step request shape is `{ lineItems: NormalizedMutationItem[], lineItemIds?: string[] }`. Each normalized item permits only `sourcePosition`, `kind`, `name`, `description`, `quantity`, `unitPrice`, `totalPrice`, `taxable`, `productOrServiceId`, `jobberLineItemId`, `sortOrder`. Step result permits only `createdLineItemIds`, `editedLineItemIds`, `deletedLineItemIds`, `syncedLineItems` (each ID array or sourcePosition/ID mapping). Normal operation reads use DB snake_case keys and omit claim_token; the winning claim is the sole token-bearing response.

Keep the existing quote sync status union; the operation is authoritative. A separate status action supplies the current or blocking predecessor operation to the detail UI. Existing `failed` status remains a compatibility summary, not permission to retry.

Public RPCs (all active-admin-only):

- `create_quote_with_jobber_sync(payload jsonb) -> uuid` and `update_quote_with_jobber_sync(payload jsonb) -> table(id uuid, version int)`: compose existing saves and optional private enqueue in one transaction (`payload.sync_requested = true`); `payload.deleted_jobber_line_item_ids` is sanitized. Update captures removed/hidden old IDs before replacing children and persists the union with pending IDs even on plain Save.
- `request_jobber_sync(target_quote_id uuid, expected_version int) -> jsonb`: reuse immutable operation or enqueue from saved rows; preserve prior tombstones; classify legacy failed work as uncertain.
- `get_jobber_sync_operation(target_quote_id uuid) -> jsonb`: current operation or unresolved blocking predecessor, including its steps. No secrets.
- `claim_jobber_sync_operation(operation_id uuid) -> jsonb`: `{ claimed: boolean, operation: operation-row }`; only a successful claimant receives the claim token.
- `begin_jobber_sync_step(operation_id uuid, claim_token uuid, step_key text, step_kind text, request_payload jsonb) -> void`.
- `complete_jobber_sync_step(operation_id uuid, claim_token uuid, step_key text, result_payload jsonb) -> void`.
- `record_jobber_sync_completion(operation_id uuid, claim_token uuid, result_payload jsonb) -> void`: durable full-workflow completion marker; every step must be applied.
- `finish_jobber_sync_operation(operation_id uuid, claim_token uuid, outcome text, failure_code text DEFAULT NULL) -> void`: `succeeded`, `retryable`, or `reconciliation_required`; DB refuses unsafe retryable/succeeded transitions. Success requires a recorded completion and applies known line IDs only to the same active quote version. The optional code accepts only `line_kind_mismatch` with requested outcome `retryable`; reject arbitrary/raw codes and incompatible combinations. Persist it only for a genuine unexpired, zero-begun-step preflight retryable transition, defaulting to `preflight_failed`. Never replace an uncertainty/lease/version barrier code with it.
- `resolve_jobber_sync_operation(operation_id uuid) -> void`: active-admin local completion after read-only reconciliation, requiring a recorded completion and no sending steps; no new remote write or guessed IDs.

Result payload is `{ syncedLineItems, expectedLineItems, deletedLineItemIds }`. Expected items contain only the normalized public mutation fields plus confirmed `jobberLineItemId`, ordered exactly as intended. The executor verifies these IDs/values/order against a complete remote read; a capped or incomplete read cannot authorize completion.

Durable line reads select the quote-line `taxable` and `textOnly` fields and require boolean values. Recovery compares priced-line `taxable` exactly, not a linked product's default or an aggregate tax amount. Missing/malformed fields and tax mismatches fail closed.

The completion's `deletedLineItemIds` is the entire intended deletion/absence set from the immutable desired payload, including IDs already absent in the complete preflight read. Per-step deletion results contain only actually dispatched deletions. Final readback must prove the full intended set absent. The database binds completion mappings, normalized public values/order and deletion coverage to the immutable operation before local success can attach IDs or clear tombstones.

## UI

Detail view displays durable status separately from compatibility status. Queued/retryable: `Retry sync`; running: in-progress message and `Check Jobber` (refresh/check only); uncertain: warning that resending is blocked and `Check Jobber`; succeeded: no retry. Status-fetch failure fails closed. A blocked predecessor is identified even if the current quote was saved again. Existing refresh-snapshot remains read-only and cannot clear the journal.

The client-facing status action returns a minimal summary (operation ID, status, safe failure code, current-version flag, retry permission); full payloads/journal and claim tokens remain in server-only execution code.

## Reference checks (2026-09-17)

- Supabase changelog and current function/RLS docs checked: explicit grants, private fixed-search-path definer helpers, and separate policy tests retained. No extension version pinning or new dependency.
- [Jobber queries and mutations](https://developer.getjobber.com/docs/using_jobbers_api/api_queries_and_mutations/) and [pagination/rate limits](https://developer.getjobber.com/docs/using_jobbers_api/api_rate_limits/) checked. No external idempotency primitive was verified; no guarantee is inferred from absence of documentation.
- Installed Next.js `after` and `use server` references checked. `after` has platform lifetime limits, so durable intent must precede scheduling; authenticate/validate server actions and return minimal DTOs.
- 2026-09-18 taxable clarification: the [Jobber-owned immutable schema](https://github.com/GetJobber/Jobber-AppTemplate-RailsAPI/blob/0456ed1cbc5343b3adb8f2949829f52bd8ab9a1f/db/schema.json) defines `QuoteLineItem.taxable: Boolean!` separately from `ProductOrService.taxable`, and `textOnly: Boolean!`. Compatibility with the configured `2025-04-16` version is inferred from the official [versioning policy](https://developer.getjobber.com/docs/using_jobbers_api/api_versioning/) and [breaking-change history](https://developer.getjobber.com/docs/changelog/), which records other quote-line removals but no taxable removal. No authenticated schema or live account verification was performed; that remains a rollout check. A rejected query fails before mutations rather than dropping the field.

## Verification and delivery

TDD for database claims/transitions, transport hooks, executor interruption and UI states. Run pgTAP and two-session concurrency tests only in a dedicated local container. Run typecheck, lint, Vitest coverage, production build and dependency audit. Mock all Jobber requests. Main/push/deployment and production DB application remain separate delivery decisions.

Production rollout must apply the additive schema before deploying the new application. Old application instances bypass the new journal, so coordinate a sync maintenance window and drain old in-flight callbacks before enabling new writes. An application rollback must not re-enable the old blind-retry path while unresolved operations exist.
