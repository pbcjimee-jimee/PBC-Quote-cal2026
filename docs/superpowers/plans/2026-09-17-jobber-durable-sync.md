# Jobber Durable Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist sync intent, serialize remote changes, and block duplicate sends after uncertain outcomes.

**Architecture:** Transactional outbox and step journal in Supabase; claimed server executor wraps the existing Jobber transport. Recovery reads known remote IDs, never infers a missing create ID from text/price. Detail UI reads authoritative operation state.

**Tech Stack:** Existing Next.js/TypeScript, Supabase Postgres, decimal.js, Vitest, pgTAP; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-jobber-durable-sync-design.md`

## Global Constraints

- Newly dispatched implementation/review agents: `gpt-5.6-sol`, reasoning `high`, following the latest direct user instruction. Already-running work may finish on its original model.
- Local implementation only; no production migration, deployment or live Jobber mutations.
- Preserve pre-existing dirty work and item 1 loading guards.
- Active-admin-only RPCs; RLS plus explicit grants; no client DML to journal tables.
- Five-minute lease; expired/ambiguous execution is reconciliation-only.
- Unknown create IDs are never adopted using fingerprints.
- No new dependencies, calculation changes or core decision/backlog changes.
- No commit of unrelated work; keep this remediation local until reviewed.

## Ownership and interfaces

**2026-09-18 completed local status:** Tasks1–3 and the whole-branch final review are complete. One combined final fix wave resolved2 Important and1 Minor findings, and the original reviewer approved the scoped re-review with no new breakage. Controller final standard verify992/19 gated skips, coverage85.34/72.88/93.56/90.34, build19/audit0 passed. Dedicated DB123 and migration/concurrency8 passed separately; the optional all-in-one Docker stress run had two5-second test timeouts and is not claimed as passing. On subsequent user approval, the work was committed and merged into local main at cd080bb, based on freshly fetched origin/main a48bab8. A fresh full verify also passed992/19 skips. The user then approved disabling Git automatic Preview only for codex/audit-priority-remediation before feature-branch push/Draft PR. vercel.json now contains that exact branch-only rule; other branches and environment variables are unchanged. This does not resolve Preview isolation or authorize remote main merge, production migration, live Jobber writes or deployment. See PROGRESS.md for the actual delivery outcome and fresh verification. The09-17 handoff remains historical. Authoritative local implementation evidence: `.superpowers/sdd/2026-09-17-jobber-durable-sync/progress.md`.

Task 1 owns one CLI-created migration, `lib/supabase/types.ts`, `supabase/tests/jobber_sync_test.sql`, `tests/jobber-sync-concurrency.test.ts`, `tests/jobber-sync-migration.test.ts`.
Task 2 owns `lib/jobber/client.ts`, `lib/jobber/quote-line-payload.ts`, new `lib/jobber/sync-execution.ts`, `lib/jobber/sync-reconciliation.ts`, `lib/jobber/sync-types.ts`, and transport/executor tests.
Task 3 owns quote action integration, new `lib/actions/jobber-sync.ts`, detail status component and tests, and documentation. It consumes Task 1 RPCs and Task 2 executor.
Task 3 also owns a narrow sequential integration follow-up in the pending durable-sync migration and pgTAP tests: status reads classify expired running operations without claiming work. Task 1 files are no longer being edited concurrently.

### Task 1: Durable database boundary

**Model:** GPT-6 Astra high.
**Input docs:** AGENTS, PROGRESS, DECISIONS, AGENT-MAP, BACKLOG, DB-SCHEMA, SECURITY, CODING-STYLE, spec.
**Out of scope:** external API/UI, production DB, changing existing applied migrations.

**Interfaces:** Exact RPC names/arguments and JSON shapes are in the spec. DB derives `desired_payload` from saved public rows, not a caller-supplied workflow payload. Existing quote status union is unchanged. All application saves use wrappers, `payload.sync_requested` controls enqueue; pending removed IDs persist in `quotes.jobber_pending_deleted_line_item_ids` even for plain Save. Capture a legacy failed predecessor before plain Save clears the compatibility status.

- [x] Write pgTAP transitions/RLS tests and local-container two-session tests first. Critical assertion:

```sql
select is((select count(*) from public.jobber_sync_operations where quote_id = :'quote_id'), 1::bigint, 'one immutable operation per version');
select ok(not has_table_privilege('authenticated','public.jobber_sync_steps','insert,update,delete'), 'journal is RPC-only');
```

```ts
expect([left.claimed, right.claimed].filter(Boolean)).toHaveLength(1)
expect(retryAfterExpiredLease.claimed).toBe(false)
expect(retryAfterExpiredLease.operation.status).toBe('reconciliation_required')
```

- [x] Run focused tests and record RED from missing schema/contract, not setup errors.
- [x] Run `npm exec -- supabase migration new add_jobber_durable_sync`; implement tables, fixed-search-path private helpers and public invoker RPCs. Use global lifecycle advisory lock before quote/operation row locks. Compose save + enqueue inside the transaction:

```sql
perform pg_catalog.pg_advisory_xact_lock(814253321);
saved_id := public.create_quote_with_children(payload);
if coalesce((payload->>'sync_requested')::boolean, false) then
  perform app_auth.enqueue_jobber_sync(saved_id, 1, coalesce(payload->'deleted_jobber_line_item_ids','[]'::jsonb));
end if;
return saved_id;
```

- [x] Ensure predecessor blocks survive plain saves and restore; current version checks occur before each step, but already-sent results remain recordable. Reject legacy failed blind retry and malformed/private payloads. Keep wrapper rollback atomic.
- [x] Retain the user-approved preflight type-mismatch explanation through the optional allowlisted `failure_code` argument on finish (exact contract in spec), without weakening expiry/step/version barriers. Test invalid codes and uncertain-state precedence.
- [x] Derive optional `desired_payload.totalLineItemId` from the latest same-remote succeeded operation across all modes (only if that operation was description_total). On switch to priced mode, persist it as a deletion tombstone. Legacy synced description_total with no proven durable ID is blocked with `legacy_total_unjournaled` before compatibility status resets.
- [x] Run pgTAP and actual two-session tests in a verified dedicated local container, plus migration contract Vitest. No reset of existing local data. Review advisors/grants. Update Supabase types from the actual contract.
- [x] Self-review and report exact files/tests/limitations; no unrelated commit.

### Task 2: Journaled transport and conservative executor

**Model:** GPT-5.6 Sol high (latest direct user instruction).
**Input docs:** spec, ARCHITECTURE, SECURITY, CODING-STYLE, existing Jobber transport tests.
**Out of scope:** save routes, UI, actual Jobber requests.

**Interfaces:** `runDurableJobberSync(store, operationId, transport): Promise<SyncRunResult>`; store methods mirror Task 1 claim/begin/complete/record/finish/resolve, plus `read(operationId): Promise<SyncOperation>` for authoritative post-finalization state. `checkDurableJobberSync(store, operation, transport): Promise<SyncRunResult>` performs no remote mutation. Types live in `lib/jobber/sync-types.ts`. Transport callback contract extends `syncJobberQuoteLineItems` with optional journal hooks; old non-durable tests continue to work.

- [x] Add failing tests for: begin persistence before fetch, durable returned IDs before next fetch, complete-step persistence failure, crash after create, missing create IDs, mutation 401/throttle no resend, no claim/no mutation, preflight failure safe retry, lease loss, readback failure, partial/unknown create remains blocked.

```ts
expect(events).toEqual(['claim', 'begin:create:0', 'remote:create:0', 'complete:create:0', 'begin:create:1'])
expect(remoteMutation).not.toHaveBeenCalled()
```

- [x] Run focused Vitest and record RED.
- [x] Implement durable callback path with automatic mutation retries disabled; persist each public request and known result. Full completion includes expected ordered public line items/IDs. Never swallow a journal persistence failure and continue.

  Full completion `deletedLineItemIds` must cover the entire desired deletion/absence set, including IDs already absent at complete preflight, whereas step results list actual dispatched deletions. Final complete readback verifies all desired IDs absent before success; the DB validates this completion against the immutable snapshot.

  Durable reads must reject missing `data.quote.lineItems.nodes`, malformed/duplicate IDs and non-finite numeric values instead of interpreting a malformed response as an empty quote. An edit result must confirm the expected ID set; map each edited line to its explicit ID rather than relying on response-array order. Create requires exactly one non-empty new ID per one-item request. GraphQL/user errors, even with partial data, keep the step uncertain and must not trigger replay.

```ts
await journal.beforeMutation(step)
const result = await sendMutation({ maxThrottleRetries: 0 })
await journal.afterMutation(step.key, result)
```

- [x] Implement claim-based orchestration and read-only recovery. Read preflight/token failures can be retried only before a step starts. After mutation ambiguity, finish uncertain; failed finish leaves the running claim to expire safely. Only a recorded full completion and exact known-ID readback can call resolve; otherwise keep blocked.
  Re-read the exact operation after finish/resolve; a void RPC response alone is not a success proof because the quote may have changed between verification and finalization. Report succeeded only when the persisted operation says succeeded.
- [x] Extend `BuildJobberQuoteLinePayloadInput` with optional `totalLineItemId?: string|null`; apply it only to the generated Total mutation item. Test two sequential saved versions in description_total reuse the confirmed Total ID; no fingerprint lookup.
- [x] A line read at the 100-item cap is not proof of completeness: fail closed before sending or resolving unless complete pagination is available. Preserve unrelated remote items and verify intended relative order.
  Prefer the existing `fetchAllJobberPages` helper with strict pageInfo/node validation for a durable-only query. An explicit ID absent from that read must fail before mutation, rather than use the legacy name/price/position relink path. No-ID fresh items alone may be created.
- [x] User-confirmed preflight guard: block the entire workflow before any mutation if a known remote ID has a different priced/text kind than intended. Return a safe typed mismatch reason for Task 3 to explain; no automatic delete/recreate or guessed conversion. Cover both conversion directions and ensure an earlier valid row is not mutated before discovering a later mismatch.
- [x] Run focused transport/executor tests and typecheck; report evidence and remaining limitations.

### Task 3: Save, Retry and status UI integration

**Model:** GPT-5.6 Sol high (latest direct user instruction).
**Input docs:** spec, UI-DESIGN-SYSTEM, UI-QUOTE-FORM, CODING-STYLE, Next local server-action/after docs.
**Out of scope:** production delivery, legacy price normalization, audit items 3–8.

**Interfaces:** `getJobberSyncState(quoteId): ActionResult<SyncState|null>`, `checkJobberQuoteSync(quoteId): ActionResult<{id:string}>` in `lib/actions/jobber-sync.ts`. `SyncState` is `{ operationId: string; status: SyncOperation['status']; failureCode: string|null; isCurrentVersion: boolean; canRetry: boolean }`; full journal/token is server-only. `retryJobberQuoteSync` remains the existing exported action, delegates to durable request/claim executor. All saves use the new wrappers; `payload.sync_requested` is true only for Save & Sync. Durable worker reads DB snapshot rather than closure-captured input.

- [x] Add failing action tests for transactional wrapper use, scheduling never runs, duplicate request no remote write, legacy failed/no journal blocked, immutable deleted-ID snapshot; UI tests for queued/running/uncertain/lookup failure.

```ts
expect(rpc).toHaveBeenCalledWith('create_quote_with_jobber_sync', expect.objectContaining({payload: expect.any(Object)}))
expect(markup).toContain('Check Jobber')
expect(markup).not.toContain('Retry sync')
```

- [x] Run focused action/UI tests and record RED.
- [x] Replace old ad-hoc sync route with store adapter + Task 2 executor. Require active admin and Zod UUID validation on new actions. Use generic error messages; no raw API/DB errors/tokens.
  Show a safe specific explanation when Task 2 reports the user-confirmed priced/text kind mismatch. State that nothing was sent and the types must be aligned before retrying, without exposing raw API details.
- [x] Add independent detail `JobberSyncStatus` component, loading/failure fail-closed state, buttons disabled while pending. Check Jobber can inspect blocked predecessor without creating a new mutation. Do not use cached quote `failed` to authorize retries.
  A legacy failed quote with no operation must still show a conservative warning and no Retry button. Do not fabricate an operation ID; any explicit recovery must first obtain the DB's legacy barrier and must not send. Regular status lookup must not enqueue a new ordinary sync as a side effect.
  Compute `isCurrentVersion` using both local quote identity and version, not the version number alone: the blocking predecessor can belong to another saved quote targeting the same remote Jobber quote. Test that this predecessor is shown as a blocker and never presented as the current quote's successful/retryable sync.
- [x] Integration follow-up: status/recovery reads must classify expired running operations as reconciliation-required without claiming work. Update the pending migration's safe status path using the existing expiry helper under the lifecycle lock, and add pgTAP coverage for a lost worker after a full completion marker: status read expires it, retains evidence, emits no token, and permits read-only reconciliation. Also cover expired/no-completion remaining blocked and unchanged quote version. Do not use a new execution claim as a status refresh; that can accidentally claim a concurrently retryable operation.
- [x] Update existing tests/mocks to assert real new behavior, not suppress new checks. Run typecheck, lint, full Vitest/coverage, build/audit (`npm run verify`). Run dedicated local database tests separately; skipped tests are not passes.
- [x] Update PROGRESS, ARCHITECTURE, DB-SCHEMA, UI-QUOTE-FORM and audit P0-02 to distinguish local completion from main/production delivery. Perform independent scoped review and fix findings before marking complete.

## Plan self-review

- Scope coverage: Task 1 covers atomic intent/claims/auth/lifecycle; Task 2 covers mutation ambiguity/reconciliation; Task 3 covers real save/retry/status paths and regression verification.
- Shared interfaces: Task 1 JSON/RPC names are authoritative; Task 2 types mirror them; Task 3 supplies the adapter only. No worker changes another task's files concurrently.
- Preserve optional old transport signature while routing all application mutations through journaled execution.
- Docker is installed but daemon availability must be verified before DB execution; never substitute production for unavailable local tests.
