# Progress Invoice Series Permanent Purge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Every worker and reviewer must use `gpt-5.6-sol` with `model_reasoning_effort = "high"`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separately confirmed, audited permanent-delete path for a local Progress Invoice Series only when the database proves that the Series has never contained a Claim or any inconsistent official Claim evidence, while preserving the existing non-destructive Void workflow.

**Architecture:** One authenticated Postgres `SECURITY DEFINER` RPC owns the entire purge transaction. It locks the Series first, checks the expected version and lifetime evidence, opens a private transaction-bound trigger context, deletes only Series-owned local data in foreign-key-safe order, deletes the Series last, and leaves one minimal append-only receipt. Next.js exposes this through a strict Zod → Server Action → service → typed repository boundary. The dashboard receives advisory server-derived capabilities and renders separate Void and permanent-delete controls outside the card link. The mutation-time database checks remain authoritative.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Zod, Supabase/Postgres/RLS, Vitest, pgTAP, the existing local Docker Supabase guard, and existing PBC dialog/button CSS. No new dependency is added.

**Approved source of truth:** `docs/superpowers/specs/2026-07-22-progress-invoice-series-permanent-purge-design.md`.

## Global Constraints

- The approved 2026-07-22 design supersedes only the earlier blanket “no Series hard-delete” clauses in `docs/superpowers/plans/2026-07-18-progress-invoice-series-detail-and-documents.md`. A Series with any Claim row, revision set, document, or Claim command result remains permanently non-deletable through this feature.
- Keep existing non-destructive Series Void and Claim Void behavior. Void retains the Series, Claims, files, numbering, and audit history.
- Never delete or change a linked Quote, Quote item, Jobber invoice/payment/token, user, template, business profile, or Storage object. The purge path must import no Jobber or Quote mutation client and make no Jobber request.
- Never add an application `.delete()` sequence. All business-row deletion belongs to one authenticated `purge_progress_invoice_series(jsonb)` transaction.
- Never disable triggers, change `session_replication_role`, grant direct table deletion, rely only on a client-set GUC, or add broad `ON DELETE CASCADE`.
- The RPC payload is exactly `series_id`, `expected_version`, `reason_code`, `confirmation`, and `correlation_key`. Confirmation is the exact case-sensitive, untrimmed literal `DELETE`.
- Allowed reason codes are exactly `created_in_error`, `duplicate`, `test_data`, and `other_administrative_cleanup`. No free-text purge reason is stored.
- Every new function is postgres-owned, uses `SET search_path = ''`, revokes `PUBLIC`, `anon`, `service_role`, and unintended roles, and grants only the minimum required access. The public RPC grants execution only to `authenticated`.
- New private tables have RLS enabled, no API policies, no API grants, and no exposure through application-generated Supabase types. The receipt contains no PII, financial value, invoice/numbering value, Quote ID, or Jobber identity.
- All supported Series-owned mutations must use Series-first lock order. The current `update_progress_adjustment_draft`, `approve_progress_adjustment`, and `supersede_progress_adjustment` implementations lock the Adjustment before the Series; the purge migration must replace those three functions so they resolve the parent identity without a row lock, lock the Series, then lock/recheck the Adjustment. Parent foreign keys prevent an unlocked child insert from surviving a concurrent parent delete.
- Use RED-GREEN TDD. Record the failing test before adding production code, then make the smallest correct change.
- Use only `scripts/run-local-supabase.ps1` for local Supabase start/status/reset/test/type generation. Do not use linked/remote commands, `db push`, or a production environment.
- Applying the migration to Production, deleting an existing user Series, deploying, or changing environment variables is out of scope and still requires separate explicit approval.
- Destructive browser QA uses only a disposable local Claim-free fixture created for this feature, never an imported user/example Series.
- Preserve existing Quote Jobber fetch/write-back behavior and Progress Invoice read-only Jobber behavior.

## File Map

**Database and security**

- Create through the guarded CLI: `supabase/migrations/*_add_progress_invoice_series_permanent_purge.sql` (the CLI supplies the timestamped prefix)
- Create: `supabase/tests/progress_invoice_series_purge_test.sql`
- Modify: `supabase/tests/progress_invoice_concurrency_test.sql`
- Create: `tests/progress-invoice-series-purge-migration.test.ts`
- Modify after local reset: `lib/supabase/types.ts`

**Application boundary**

- Modify: `lib/progress-invoices/validators.ts`
- Modify: `lib/progress-invoices/repository.ts`
- Modify: `lib/progress-invoices/series-service.ts`
- Modify: `lib/actions/progress-invoice-series.ts`
- Create: `tests/progress-invoice-series-purge.test.ts`
- Modify: `tests/progress-invoice-repository.test.ts`
- Modify: `tests/progress-invoice-series-service.test.ts`
- Modify: `tests/progress-invoice-actions.test.ts`
- Modify: `tests/progress-invoice-actions-supabase.test.ts`
- Modify: `tests/progress-invoice-series-lifecycle.test.ts`

**Dashboard and dialogs**

- Modify: `components/progress-invoices/progress-invoice-dashboard.tsx`
- Create: `components/progress-invoices/series-card-actions.tsx`
- Create: `components/progress-invoices/series-permanent-delete-dialog.tsx`
- Modify: `components/progress-invoices/series-void-dialog.tsx`
- Create: `components/ui/use-dialog-focus-management.ts`
- Create: `lib/progress-invoices/dashboard-href.ts`
- Modify: `app/styles/components.css`
- Modify only as needed for real interaction coverage: `tests/helpers/test-dom.ts`
- Create: `tests/progress-invoice-series-purge-ui.test.tsx`
- Modify: `tests/progress-invoice-dashboard-ui.test.tsx`
- Modify: `tests/progress-invoice-series-ui.test.tsx`

**Documentation and durable state**

- Modify: `docs/DECISIONS.md`
- Modify: `docs/DB-SCHEMA.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/superpowers/specs/2026-07-22-progress-invoice-series-permanent-purge-design.md`
- Modify: `docs/superpowers/plans/2026-07-18-progress-invoice-series-detail-and-documents.md`
- Modify: `PROGRESS.md`
- Append locally: `.superpowers/sdd/progress.md`

---

### Task 1: Build the atomic database purge and advisory capabilities

**Model:** Codex 5.6-Sol high

**Files:**

- Create: `supabase/tests/progress_invoice_series_purge_test.sql`
- Modify: `supabase/tests/progress_invoice_concurrency_test.sql`
- Create: `tests/progress-invoice-series-purge-migration.test.ts`
- Create through CLI: `supabase/migrations/*_add_progress_invoice_series_permanent_purge.sql` (the CLI supplies the timestamped prefix)
- Modify: `lib/supabase/types.ts`

**Interfaces produced:** `public.purge_progress_invoice_series(jsonb)` and the six new dashboard item fields. No TypeScript application caller is added in this task.

- [ ] **Step 1: Write the RED static migration contract test**

Create `tests/progress-invoice-series-purge-migration.test.ts`. Locate exactly one file ending `_add_progress_invoice_series_permanent_purge.sql` and assert that it contains:

```ts
expect(sql).toMatch(/CREATE\s+FUNCTION\s+public\.purge_progress_invoice_series\s*\(payload JSONB\)/i)
expect(sql).toMatch(/SECURITY DEFINER[\s\S]*SET search_path = ''/i)
expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.purge_progress_invoice_series\(JSONB\) TO authenticated/i)
expect(sql).not.toMatch(/session_replication_role|DISABLE\s+TRIGGER|ON\s+DELETE\s+CASCADE/i)
```

Also assert receipt/context no-API grants, the six narrow guard replacements, Series-first forward replacements for the three Adjustment commands, strict five-key validation, exact `DELETE`, all four reason codes, Claim/evidence blockers, Series-first `FOR UPDATE`, the documented delete order, the safe result keys, and the six dashboard fields. The test must reject a raw application-table grant to `authenticated`, `anon`, or `service_role`.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd run test:run -- tests/progress-invoice-series-purge-migration.test.ts
```

Expected: fail because no purge migration exists.

- [ ] **Step 3: Create the forward-only migration through the guarded CLI**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 migration new add_progress_invoice_series_permanent_purge
```

Do not rename or edit any previously applied migration.

- [ ] **Step 4: Add private context and append-only receipt structures**

Create a non-exposed `private` schema if absent, then create:

```sql
private.progress_invoice_series_purge_contexts(
  series_id uuid primary key,
  transaction_id bigint not null,
  backend_pid integer not null,
  actor_id uuid not null,
  nonce uuid not null unique,
  created_at timestamptz not null default now()
)
```

and:

```sql
private.progress_invoice_series_purge_receipts(
  id uuid primary key default gen_random_uuid(),
  deleted_series_id uuid not null unique,
  actor_id uuid not null,
  correlation_key uuid not null unique,
  request_fingerprint char(64) not null,
  reason_code text not null check (reason_code in (
    'created_in_error','duplicate','test_data','other_administrative_cleanup'
  )),
  purged_at timestamptz not null,
  result_snapshot jsonb not null
)
```

Enable RLS on both; create no API policy; revoke schema/table/function access from `PUBLIC`, `anon`, `authenticated`, and `service_role`. The receipt has no Series FK and no customer, site, financial, numbering, Quote, Jobber, or free-text columns. Add an owner-level `BEFORE UPDATE OR DELETE` trigger that always raises `PROGRESS_SERIES_PURGE_RECEIPT_IMMUTABLE`.

The RPC generates a nonce, stores it in the context row, and sets the same nonce through transaction-local `set_config`. Create a private helper that returns true only when the exact Series context matches `txid_current()`, `pg_backend_pid()`, `auth.uid()`, the transaction-local nonce, and effective owner `postgres`. The GUC is never sufficient by itself: the inaccessible context row and every bound field must also match. Revoke the helper from every API role. Do not add a receipt-maintenance bypass.

- [ ] **Step 5: Add only the six trigger exceptions required by the transaction**

Use `CREATE OR REPLACE` for:

1. `protect_progress_series_locked_link()` — allow only target Series DELETE under active context; otherwise retain every current rule.
2. `reject_progress_row_mutation()` — under active context allow target snapshot/event DELETE and the exact target payment-revision predecessor clear/delete; otherwise retain current rejection.
3. `protect_progress_payment_identity()` — under active context allow only target payment pointer clears and DELETE.
4. `protect_progress_adjustment()` — under active context allow only target supersession-pointer clear and DELETE.
5. `protect_progress_numbering_base_reservation()` — under active context allow only target reservation DELETE.
6. `progress_reject_void_series_ledger_mutation()` — allow only the purge pointer clears for the target context, including a Claim-free Void Series.

The exception must compare rows so no identity, amount, status, recipient, or other business field can change. Keep `reject_progress_row_delete()`, Claim/revision/document guards, and all direct-delete errors unchanged.

- [ ] **Step 6: Implement the strict transactional RPC**

The function validates `jsonb_typeof(payload) = 'object'`, exact keys, UUIDs, positive `expected_version`, reason enum, and exact untrimmed `confirmation = 'DELETE'` before mutation. A missing or non-exact confirmation raises `PROGRESS_SERIES_PURGE_CONFIRMATION_REQUIRED`; other malformed/unknown payload data raises the existing safe validation error. Use `progress_require_actor()`. Fingerprint the normalized full request.

Replay order:

1. Lookup `correlation_key`; same fingerprint returns the stored original result, changed fingerprint raises `PROGRESS_IDEMPOTENCY_KEY_REUSED`.
2. Lock the Series `FOR UPDATE`.
3. If absent after waiting, recheck correlation receipt, then `deleted_series_id`; exact replay returns `purged`, a different key returns `already_purged`, otherwise raise `PROGRESS_NOT_FOUND`.
4. Check version and lifetime evidence under the lock.

Eligibility SQL must inspect all rows, not the current manifest:

```sql
IF EXISTS (SELECT 1 FROM public.progress_claims WHERE series_id = requested_series_id) THEN
  RAISE EXCEPTION 'PROGRESS_SERIES_PURGE_CLAIM_EXISTS' USING ERRCODE = 'P0001';
END IF;
IF EXISTS (SELECT 1 FROM public.progress_invoice_revision_sets WHERE series_id = requested_series_id)
   OR EXISTS (SELECT 1 FROM public.progress_documents WHERE series_id = requested_series_id)
   OR EXISTS (SELECT 1 FROM public.progress_claim_command_results WHERE series_id = requested_series_id) THEN
  RAISE EXCEPTION 'PROGRESS_SERIES_PURGE_OFFICIAL_EVIDENCE' USING ERRCODE = 'P0001';
END IF;
```

After context insertion, perform exactly:

1. delete target `progress_invoice_events`;
2. clear target `progress_payments.matched_manual_payment_id` and `current_revision_id`;
3. clear target `progress_payment_revisions.predecessor_revision_id`;
4. delete target payment revisions, then payments;
5. clear target `progress_adjustments.superseded_adjustment_id`, then delete adjustments;
6. explicitly defer `fk_progress_series_current_jobber_snapshot`, then delete target `progress_jobber_invoice_snapshots`;
7. delete every target `progress_invoice_numbering_base_reservations` row in every state;
8. delete the Series last;
9. insert one minimal receipt with server-built `result_snapshot` containing only `status`, `series_id`, and `purged_at`;
10. delete the exact private context.

Return exact snake-case JSON fields `status`, `series_id`, `purged_at`. Do not catch-and-continue; any failure rolls back all changes.

- [ ] **Step 7: Correct the three inverse Adjustment lock orders**

Forward-replace `update_progress_adjustment_draft(jsonb)`, `approve_progress_adjustment(jsonb)`, and `supersede_progress_adjustment(jsonb)` without changing payloads, idempotency, validation, results, audit events, financial logic, or grants. Each function must:

1. read only the target Adjustment's `series_id` without `FOR UPDATE`;
2. lock that Series row `FOR UPDATE`;
3. lock the target Adjustment row `FOR UPDATE` with the same `series_id` and recheck it exists;
4. perform all existing version/state/idempotency checks and mutation logic.

If purge commits between steps 1 and 2, the Series lookup returns not found and no child mutation succeeds. If the command locks the Series first, purge waits and later observes the command's committed state/version. Add static assertions that the first `FOR UPDATE` in each replacement targets `progress_invoice_series`, and a dblink purge-versus-each-command race.

- [ ] **Step 8: Extend the dashboard RPC with lifetime capabilities**

In the forward replacement for `list_progress_invoice_series(jsonb)`, derive:

```sql
has_claim_history := EXISTS (SELECT 1 FROM public.progress_claims WHERE series_id = series.id);
has_issued_claim_history := EXISTS (
  SELECT 1 FROM public.progress_claims
  WHERE series_id = series.id AND (status = 'issued' OR original_issued_at IS NOT NULL)
);
has_official_evidence := EXISTS (revision set) OR EXISTS (document) OR EXISTS (claim command result);
```

Return `can_void_series_directly`, `requires_claim_void_workflow`, `can_delete_permanently`, blocker precedence `claim_history` → `official_evidence` → `not_available`, plus `accepted_numbering_base` and `original_jobber_invoice_number`. The blocker is null only when `can_delete_permanently` is true.

Use these exact formulas:

```sql
can_void_series_directly := series.status <> 'void' AND NOT has_issued_claim_history;
requires_claim_void_workflow := series.status <> 'void' AND has_issued_claim_history;
can_delete_permanently := NOT has_claim_history AND NOT has_official_evidence;
permanent_delete_blocked_reason := CASE
  WHEN can_delete_permanently THEN NULL
  WHEN has_claim_history THEN 'claim_history'
  WHEN has_official_evidence THEN 'official_evidence'
  ELSE 'not_available'
END;
```

An already Void Series has both Void capability booleans false but remains permanently deletable when it is Claim-free and has no official evidence.

- [ ] **Step 9: Write RED/GREEN pgTAP and race coverage**

Create `supabase/tests/progress_invoice_series_purge_test.sql` using `BEGIN`, `pg_temp.capture_sqlstate`, `no_plan()`, and `ROLLBACK`. Prove:

- owner/search path/grants/RLS/no API access and no direct deletes;
- strict payload, exact confirmation, reason enum, safe error codes, stale version;
- successful deletion of a disposable Claim-free Series with multiple snapshots, Manual/Jobber payments and revisions, all relevant pointers, adjustments, events, and active/released reservations;
- unrelated Series, linked Quote/items, templates, profile, users, Jobber tokens remain;
- Draft, Void, Issued, and historically Issued Claim rows each block with zero changes;
- each official-evidence table blocks with zero changes;
- receipt schema contains no forbidden columns and owner UPDATE/DELETE fails;
- exact replay, changed payload, cross-Series correlation reuse, and different-key already-purged semantics;
- a test-only RESTRICT FK failure after child deletion rolls back every row/context/receipt;
- freed Jobber identity and unused numbering base can be reused;
- existing Void still behaves unchanged.

Extend `supabase/tests/progress_invoice_concurrency_test.sql` with dblink races proving one winner for same-key purge, different-key purge, Claim create, Series update, Adjustment create, each of Adjustment update/approve/supersede, Manual payment, Jobber refresh, and numbering-base reuse. Assert one receipt and no orphan row. Do not add production test hooks.

- [ ] **Step 10: Run guarded local GREEN and regenerate public types**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 env guard
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 db reset --local
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 test db --local supabase/tests/progress_invoice_series_purge_test.sql
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 test db --local supabase/tests/progress_invoice_concurrency_test.sql
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 test db --local
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 gen types --local --lang typescript --schema public | Out-File -LiteralPath lib/supabase/types.ts -Encoding utf8
npm.cmd run test:run -- tests/progress-invoice-series-purge-migration.test.ts tests/local-supabase-boundary.test.ts
npm.cmd run typecheck
```

Expected: all pgTAP, concurrency, focused Vitest, and typecheck pass; generated types expose the public RPC but neither private table.

- [ ] **Step 11: Commit**

```powershell
git add supabase/migrations supabase/tests/progress_invoice_series_purge_test.sql supabase/tests/progress_invoice_concurrency_test.sql tests/progress-invoice-series-purge-migration.test.ts lib/supabase/types.ts
git commit -m "feat: purge claim-free progress invoice series atomically"
```

---

### Task 2: Add the strict TypeScript lifecycle boundary

**Model:** Codex 5.6-Sol high

**Files:** application boundary and tests listed in File Map.

**Interfaces consumed:** Task 1 snake-case RPC payload/result and dashboard fields.

- [ ] **Step 1: Write RED validator, repository, service, and Action tests**

Create `tests/progress-invoice-series-purge.test.ts` and extend existing focused tests. Cover:

- strict valid purge input and rejection of extra/actor/Quote/Jobber keys;
- rejection of `delete`, `DELETE `, ` DELETE`, empty, and non-string confirmations;
- closed reason enum, UUIDs, and positive version;
- card Void input rejects current-set/manifest fields from the browser;
- exact camel-case → snake-case payload;
- strict results for both `purged` and `already_purged`, rejecting extra keys, bad status, UUID, or timestamp;
- stable mappings for all purge domain errors with raw DB detail hidden;
- dashboard booleans, safe nullable blocker enum, accepted base, and original Jobber number;
- purge authorizes before persistence and revalidates dashboard/detail only after success;
- purge performs no post-delete Series fetch and no Quote/Jobber revalidation;
- card Void reloads workspace server-side, derives Current-set evidence, and uses the pre-mutation Quote ID;
- lifecycle static regression allows only the dedicated purge RPC and still forbids raw `.delete()`.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd run test:run -- tests/progress-invoice-series-purge.test.ts tests/progress-invoice-repository.test.ts tests/progress-invoice-series-service.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts tests/progress-invoice-series-lifecycle.test.ts
```

Expected: fail on missing validator/command/result/capability fields.

- [ ] **Step 3: Add strict validators**

Add exactly:

```ts
export const progressInvoiceSeriesPurgeReasonCodeSchema = z.enum([
  'created_in_error',
  'duplicate',
  'test_data',
  'other_administrative_cleanup',
])

export const purgeProgressInvoiceSeriesSchema = z.strictObject({
  seriesId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  reasonCode: progressInvoiceSeriesPurgeReasonCodeSchema,
  confirmation: z.literal('DELETE'),
  correlationKey: uuidSchema,
})

export const voidProgressInvoiceSeriesFromCardSchema = z.strictObject({
  seriesId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  reason: requiredText(500),
  correlationKey: uuidSchema,
})
```

Export inferred input types. Do not trim or transform purge confirmation.

- [ ] **Step 4: Add repository payload/result and strict parser**

Add `purge_progress_invoice_series` to `ProgressInvoiceCommandMap` using the authenticated repository. Its parser must use `singleton`, `hasExactKeys(['status','series_id','purged_at'])`, UUID validation, existing timestamp validation, and the two exact statuses.

Add domain mappings for:

```text
PROGRESS_SERIES_PURGE_CONFIRMATION_REQUIRED
PROGRESS_SERIES_PURGE_CLAIM_EXISTS
PROGRESS_SERIES_PURGE_OFFICIAL_EVIDENCE
PROGRESS_IDEMPOTENCY_KEY_REUSED
```

All map to safe validation failures; retain current version/not-found mappings.

Extend `ProgressInvoiceDashboardRpcItem` and `parseDashboardItem()` with required booleans, nullable closed blocker enum, nullable accepted base, and nullable original Jobber number. Reject arbitrary blocker strings and inconsistent `can_delete_permanently=true` with a non-null blocker.

- [ ] **Step 5: Add service mapping and server Actions**

Service result:

```ts
export interface PurgeProgressInvoiceSeriesResult {
  status: 'purged' | 'already_purged'
  seriesId: string
  purgedAt: string
}
```

The purge service maps only the five allowed fields into the RPC and returns only the three safe result fields.

The purge Action strictly parses, authorizes, calls the service, then revalidates `/progress-invoices` and `/progress-invoices/${seriesId}` only on success. It does not fetch the deleted row or revalidate a Quote.

Refactor the public card Void Action to accept only card fields. After authorization it calls `getSeriesWorkspace(seriesId)`, derives `expectedCurrentRevisionSetId` and `expectedCurrentManifestHash`, passes `preparedRevisionSetId: null` to the existing strict service, and revalidates using the pre-mutation workspace Quote ID. Missing workspace returns `PROGRESS_NOT_FOUND`; failed workspace read or Void produces no revalidation.

- [ ] **Step 6: Map dashboard capabilities through the service**

Add camel-case fields:

```ts
canVoidSeriesDirectly: boolean
requiresClaimVoidWorkflow: boolean
canDeletePermanently: boolean
permanentDeleteBlockedReason: 'claim_history' | 'official_evidence' | 'not_available' | null
acceptedNumberingBase: string | null
originalJobberInvoiceNumber: string | null
```

Update all typed fixtures in the focused tests in the same commit.

- [ ] **Step 7: Run GREEN and commit**

```powershell
npm.cmd run test:run -- tests/progress-invoice-series-purge.test.ts tests/progress-invoice-repository.test.ts tests/progress-invoice-series-service.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts tests/progress-invoice-series-lifecycle.test.ts
npm.cmd run typecheck
npm.cmd run lint -- lib/progress-invoices/validators.ts lib/progress-invoices/repository.ts lib/progress-invoices/series-service.ts lib/actions/progress-invoice-series.ts tests/progress-invoice-series-purge.test.ts
git diff --check
git add lib/progress-invoices/validators.ts lib/progress-invoices/repository.ts lib/progress-invoices/series-service.ts lib/actions/progress-invoice-series.ts tests/progress-invoice-series-purge.test.ts tests/progress-invoice-repository.test.ts tests/progress-invoice-series-service.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts tests/progress-invoice-series-lifecycle.test.ts
git commit -m "feat: expose progress invoice series lifecycle commands"
```

---

### Task 3: Add safe dashboard actions and destructive dialogs

**Model:** Codex 5.6-Sol high

**Files:** dashboard/dialog/style/test files listed in File Map.

**Interfaces consumed:** Task 2 dashboard DTO, purge Action, and card-safe Void Action.

- [ ] **Step 1: Write RED dashboard and interaction tests**

Add the new capability fields to dashboard fixtures. Cover eligible, Claim-blocked, evidence-blocked, unclassified-blocked, issued-Claim workflow, and already-Void states. Assert action group label/order and that every action remains outside `.pbc-progress-series__primary`.

Create `tests/progress-invoice-series-purge-ui.test.tsx` and test:

- unique `useId()` IDs across multiple cards/dialogs;
- `alertdialog`, labelled/described semantics, and fixed warnings;
- identity discriminator priority: accepted base → original Jobber number → reference → shortened Series ID;
- four reason options, required recovery checkbox, exact DELETE field, `autocomplete=off`, and spellcheck disabled;
- Cancel initial focus, Tab/Shift+Tab trap, focus return, Escape idle-only, inert backdrop;
- incomplete Enter is inert, all gates enable once, and pending double-submit is blocked;
- safe focused failure, stale Claim/evidence/version reload state, raw error suppression;
- same failed payload reuses the correlation key and any changed request field rotates it;
- `router.replace(returnHref)` only when the normalized return URL changes, otherwise `router.refresh()` only;
- only one Series dialog can be open across the page.

If the custom DOM cannot prove focus behavior, minimally add `focus()`, `KeyboardEvent`, enabled-element selection, and `activeElement` support to `tests/helpers/test-dom.ts`; do not simulate success with assertions that never exercise the hook.

- [ ] **Step 2: Run RED**

```powershell
npm.cmd run test:run -- tests/progress-invoice-dashboard-ui.test.tsx tests/progress-invoice-series-purge-ui.test.tsx tests/progress-invoice-series-ui.test.tsx
```

Expected: fail because actions, dialogs, href helper, and focus helper do not exist.

- [ ] **Step 3: Extract a normalized dashboard href helper**

Create `lib/progress-invoices/dashboard-href.ts` with a pure `buildProgressInvoiceDashboardHref(filters, page)` that preserves normalized `q`, repeated `status`, `quoteId`, and omits `page=1`.

For purge return:

```ts
const returnPage = data.items.length === 1 && data.page > 1
  ? data.page - 1
  : data.page
const returnHref = buildProgressInvoiceDashboardHref(filters, returnPage)
```

Use the service-returned `data.page`, not the raw requested page.

- [ ] **Step 4: Add one shared focus-management hook**

Create `components/ui/use-dialog-focus-management.ts`. When open, it focuses Cancel, traps Tab/Shift+Tab among enabled focusable descendants, closes on Escape only while idle, and restores the trigger on close. It exposes no global listener after unmount. Both Series dialogs must use it. Async errors are focused separately through an alert ref.

- [ ] **Step 5: Refactor the existing Void dialog**

Use the shared dialog shell and `useId()` for heading, description, controls, and error. Use a ghost `Void series` card trigger. Explain retained PBC/Tax Invoice history and that Jobber is unchanged. Send only Series ID, expected version, reason, and correlation key. Preserve reason/checkbox gates, pending protection, safe error focus, retry-key reuse, reload-on-stale behavior, inert backdrop, and router navigation without `window.location.assign`.

- [ ] **Step 6: Implement permanent-delete alert dialog**

Use `role="alertdialog"`, `aria-modal`, `useId()` labels/descriptions, existing danger button, trash icon, and the exact warnings from the approved design. No `window.confirm`.

Failure policy:

- version, Claim, or official-evidence error keeps the dialog open, focuses a fixed safe alert, disables repeat, and shows `Reload dashboard`;
- retryable request failure preserves all gates and the current correlation key;
- success uses only one of `router.replace(returnHref)` or `router.refresh()`.

- [ ] **Step 7: Render coordinated card actions outside the primary link**

Add `series-card-actions.tsx` with page-level coordinated dialog state so only one dialog is open. Render in order:

1. `Open quote` when applicable;
2. active `Void series` only when `canVoidSeriesDirectly` and not already Void;
3. a focusable detail link `Void issued Claims first` when required;
4. visual separator;
5. active `Delete permanently` when eligible, otherwise a noninteractive status chip with fixed local blocker copy and a detail link.

Wrap with `role="group" aria-label="Progress Invoice series actions"`. Never nest a button or secondary link inside the card’s primary link.

- [ ] **Step 8: Add shared-token CSS and responsive behavior**

Build only on `pbc-dialogbackdrop`, `pbc-dialog`, `pbc-dialog__actions`, `pbc-btn--danger`, existing tokens, and `.pbc-progress-series__secondary`. Provide wrapping actions, visible separation, a noninteractive blocker chip, alert-dialog identity/warning spacing, and 44×44 mobile destructive controls without horizontal overflow.

- [ ] **Step 9: Run GREEN and commit**

```powershell
npm.cmd run test:run -- tests/progress-invoice-dashboard-ui.test.tsx tests/progress-invoice-series-purge-ui.test.tsx tests/progress-invoice-series-ui.test.tsx
npm.cmd run typecheck
npm.cmd run lint -- components/progress-invoices/progress-invoice-dashboard.tsx components/progress-invoices/series-card-actions.tsx components/progress-invoices/series-permanent-delete-dialog.tsx components/progress-invoices/series-void-dialog.tsx components/ui/use-dialog-focus-management.ts lib/progress-invoices/dashboard-href.ts tests/progress-invoice-dashboard-ui.test.tsx tests/progress-invoice-series-purge-ui.test.tsx
git diff --check
git add components/progress-invoices/progress-invoice-dashboard.tsx components/progress-invoices/series-card-actions.tsx components/progress-invoices/series-permanent-delete-dialog.tsx components/progress-invoices/series-void-dialog.tsx components/ui/use-dialog-focus-management.ts lib/progress-invoices/dashboard-href.ts app/styles/components.css tests/helpers/test-dom.ts tests/progress-invoice-series-purge-ui.test.tsx tests/progress-invoice-dashboard-ui.test.tsx tests/progress-invoice-series-ui.test.tsx
git commit -m "feat: add claim-free series permanent delete UI"
```

---

### Task 4: Reconcile documentation and run the full local release gate

**Model:** Codex 5.6-Sol high

**Files:** documentation listed in File Map; no new production behavior.

- [ ] **Step 1: Update approved documentation without broadening scope**

- Mark the 2026-07-22 purge design approved/implemented locally.
- Add the Claim-free purge decision to `docs/DECISIONS.md`, explicitly preserving Void and permanent Claim/document retention.
- Document private context/receipt, RPC ownership/grants, delete order, and local-only rollout status in `docs/DB-SCHEMA.md` and `docs/SECURITY.md`.
- Amend only the contradictory no-hard-delete clauses/DoD in the 2026-07-18 plan to point at the approved narrow exception; do not rewrite unrelated historical tasks.
- Add exact commits/tests and “Production migration not applied” to `PROGRESS.md`.

- [ ] **Step 2: Run database and Data API security gates**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 env guard
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 db reset --local
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 test db --local
npm.cmd run test:rls:local
```

If `test:rls:local` reports a skip because disposable local credentials are absent, configure only ignored local `SUPABASE_RLS_TEST_*` values and rerun; do not report a skipped suite as a pass.

- [ ] **Step 3: Run focused application and Jobber/Quote non-regression**

```powershell
npm.cmd run test:run -- tests/progress-invoice-series-purge-migration.test.ts tests/progress-invoice-series-purge.test.ts tests/progress-invoice-series-purge-ui.test.tsx tests/progress-invoice-repository.test.ts tests/progress-invoice-series-service.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts tests/progress-invoice-dashboard-ui.test.tsx tests/progress-invoice-series-ui.test.tsx tests/progress-invoice-series-lifecycle.test.ts tests/local-supabase-boundary.test.ts
npm.cmd run test:run -- tests/jobber-invoice-gateway.test.ts tests/jobber-progress-invoice-routes.test.ts tests/progress-invoice-jobber-refresh.test.ts tests/progress-invoice-standalone-import.test.ts tests/jobber-readonly-regression.test.ts tests/jobber-write-client.test.ts tests/quote-actions.test.ts tests/quote-actions-supabase.test.ts
```

- [ ] **Step 4: Run full static/build verification**

```powershell
git diff --check
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:run
npm.cmd run test:coverage
npm.cmd run build
npm.cmd audit --audit-level=high
```

- [ ] **Step 5: Run authenticated browser QA against disposable local data**

At desktop and one narrow mobile viewport, verify:

- eligible Claim-free card → alert dialog → Cancel/focus return;
- exact gates and permanent deletion → filtered dashboard, last-item previous-page fallback, and no stale card;
- receipt exists while all Series-owned business rows are gone;
- blocked Claim/evidence Series has no active purge action;
- Void remains non-destructive and retained under the Void filter;
- keyboard Tab/Shift+Tab/Escape/Enter behavior and no horizontal overflow;
- no console error and no Jobber network mutation.

Use only a newly created local fixture. Do not purge any existing user/imported example.

- [ ] **Step 6: Independent final whole-branch review**

Generate a review package from the feature merge base to HEAD. A fresh `gpt-5.6-sol` high reviewer checks the approved design, security/lock ordering, TypeScript boundary, accessibility, tests, and Quote/Jobber non-regression. Resolve every Critical/Important finding and rerun its covering tests before completion.

- [ ] **Step 7: Commit documentation and verification record**

```powershell
git add docs/DECISIONS.md docs/DB-SCHEMA.md docs/SECURITY.md docs/superpowers/specs/2026-07-22-progress-invoice-series-permanent-purge-design.md docs/superpowers/plans/2026-07-18-progress-invoice-series-detail-and-documents.md PROGRESS.md
git commit -m "docs: record progress invoice purge verification"
```

Do not include `.env.local`, private credentials, disposable fixture PII, private SDD reports, or generated review packages.

---

## Definition of Done

- A dashboard card exposes separate Void and permanent-delete lifecycle actions outside the primary card link.
- The permanent action is active only from explicit server-derived advisory eligibility and the database rechecks all eligibility under lock.
- Any Claim row or inconsistent official evidence blocks permanent deletion with zero changes.
- Eligible Series-owned snapshots, payments/revisions, adjustments, events, reservations, and the Series are removed atomically; unrelated/global/Quote/Jobber data is unchanged.
- The minimal receipt is append-only, inaccessible to API roles, unique per Series and correlation key, and contains no PII/financial/numbering/external identity.
- Exact replay, changed-payload reuse, different-key retry, rollback, and concurrent mutation outcomes are deterministic.
- Direct table deletes remain denied before and after the feature.
- Void still retains history and uses server-reloaded Current-set concurrency evidence.
- The alert dialog requires reason + recovery checkbox + exact `DELETE`, traps/restores focus, handles Escape/pending safely, and never uses `window.confirm`.
- Filtered return navigation and last-item page fallback work without double navigation.
- No Jobber or Quote mutation is introduced.
- Local pgTAP/concurrency/RLS, focused/full Vitest, coverage, typecheck, lint, audit, build, browser QA, and independent review pass.
- The migration is committed but not applied to Production without a new explicit approval.
