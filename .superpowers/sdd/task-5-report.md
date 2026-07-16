# Task 5 report — profiles, series, and adjustment lifecycle

## Outcome

Implemented the authenticated Progress Invoice profile, series, and adjustment lifecycle. The implementation includes purpose-specific read DTOs, thin Server Actions, defensive repository response parsing, six transactional RPCs, owner-global create-series idempotency, immutable creation provenance, approved-adjustment read-model recalculation, atomic over-claimed Credit rejection, adjustment supersession, explicit RPC grants, and local transaction/concurrency coverage.

No remote or production migration was applied. No external dependency was added.

## User-approved decisions applied

- **1A:** approving an over-claimed Credit raises `PROGRESS_RECONCILIATION_REQUIRED` and rolls the complete transaction back. The Credit remains Draft; series status/version/read model, adjustment totals, audit event, and idempotency result remain unchanged.
- **2A:** `source_type` and the original `quote_id` cannot be changed by an update command or a direct RPC payload. The only `quote_id` clearing path is the existing Quote foreign key's `ON DELETE SET NULL`, while `source_type = 'pbc_quote'` remains.
- Create-series idempotency is serialized by authenticated actor + command + correlation key. Identical retries/concurrent requests return the same result, while a different fingerprint returns `IDEMPOTENCY_KEY_REUSED` without duplicate rows/events.

## TDD evidence

### Initial Task 5 RED

Command:

```powershell
npm.cmd run test:run -- tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts
```

Result before production implementation:

- Test Files: **2 failed (2)**
- Tests: **3 failed (3)**
- Failures identified the missing action/service modules and unimplemented repository payload/result paths.

### Task 5 focused GREEN

Same command after implementation:

- Test Files: **2 passed (2)**
- Tests: **13 passed (13)**

### Search-filter injection regression RED/GREEN

Added `tests/progress-invoice-series-service.test.ts` after identifying raw PostgREST `.or(...)` interpolation. The test uses `Builder),owner_id.eq.attacker` and asserts that no raw `.or` filter is called.

Temporarily restoring the vulnerable interpolation and running:

```powershell
npm.cmd run test:run -- tests/progress-invoice-series-service.test.ts
```

produced the expected RED:

- Test Files: **1 failed (1)**
- Tests: **1 failed (1)**
- Captured call: `recipient_name.ilike.%Builder),owner_id.eq.attacker%,...`

After restoring the safe local DTO filter, the same command produced:

- Test Files: **1 passed (1)**
- Tests: **1 passed (1)**

## Database verification

Commands:

```powershell
npx.cmd supabase db reset --local
npx.cmd supabase test db --local supabase/tests
npx.cmd supabase db lint --local --schema public --level warning --fail-on error
npx.cmd supabase db advisors --local --type all --level warn --fail-on error
npx.cmd supabase migration list --local
```

Results:

- Fresh reset applied every migration through `20260714231100` successfully.
- Full pgTAP suite: **4 files, 187 tests, PASS**.
- Task 5 transaction file: **103 tests, PASS**.
- Public-schema DB lint: **no schema errors**.
- Local migration list shows `20260714231100` aligned locally.
- Advisor command exited successfully. It reported no warning for a Task 5 function/table. Existing warnings remain for two legacy Quote functions with mutable search paths and legacy permissive authenticated policies on non-progress tables.
- `npm.cmd run test:rls:local` remained environment-gated and reported **1 file / 5 tests skipped**. The pgTAP suite independently passed explicit grant checks, authenticated RPC bypass checks, direct table-write rejection (`42501`), RLS behavior, helper non-executability, and authenticated-only public RPC execution.

The Task 5 pgTAP coverage includes PBC/standalone creation, Quote snapshot independence, Quote deletion `SET NULL`, direct provenance-key rejection, recipient snapshot editing, positive adjustment/sign rules, rejected/void exclusion, Approved immutability, stale current DTOs, exact retry and key-reuse behavior, 1A rollback assertions, supersession chains/reasons, read-model totals, link lock, and genuine two-session create concurrency through `dblink`.

## Application verification

```text
npm.cmd run typecheck                         PASS
npm.cmd run lint                              PASS
npm.cmd run test:run                          75 passed / 1 skipped files; 658 passed / 5 skipped tests
npm.cmd run build                             PASS (Next.js production build)
git diff --check                              PASS
```

The generated Supabase type surface contains all six Task 5 RPC signatures. To preserve the project's existing hand-refined numeric-string and enum contracts, only the newly generated RPC signatures were applied to `lib/supabase/types.ts`; unrelated generated-type churn was discarded.

## Security and isolation verification

- All actions validate with strict Zod schemas before authorization.
- All services use the request-authenticated Supabase client; no service-role key is used.
- Public RPCs use `SECURITY DEFINER`, `SET search_path = ''`, `auth.uid()` through the existing actor guard, fully qualified objects, and an explicit authenticated-only grant.
- `PUBLIC`, `anon`, and `service_role` execution is revoked for public RPCs; all Task 5 internal helpers are revoked from API roles.
- Progress tables remain SELECT-only to authenticated callers; writes occur through audited RPCs.
- Dashboard/list DTOs keep claimed and received values separate and expose no bank details.
- Search input is filtered in the returned DTO set and is never interpolated into raw PostgREST `.or` syntax.

## Quote integration boundary

The four protected Quote-specific files are blob-identical to merge-base `aa55d71`:

| File | Blob hash | Match |
|---|---|---|
| `app/api/jobber/quote/[quoteId]/route.ts` | `b85b2e63f011a05477d00991405c1b00721e555b` | yes |
| `lib/actions/quotes.ts` | `211c5670e53bb52ab2e640e8cb155d042e4b8d8b` | yes |
| `tests/jobber-quote-route-refresh.test.ts` | `d605ac525d378e31e37f5333b45437be9671be48` | yes |
| `tests/quote-actions-supabase.test.ts` | `0052829c84f21316b7d201384ca35d89967ec50e` | yes |

## Changed files

- `lib/actions/progress-invoice-series.ts`
- `lib/actions/progress-invoice-adjustments.ts`
- `lib/progress-invoices/series-service.ts`
- `lib/progress-invoices/adjustment-service.ts`
- `lib/progress-invoices/repository.ts`
- `lib/progress-invoices/validators.ts`
- `lib/supabase/types.ts`
- `supabase/migrations/20260714231100_add_progress_invoice_series_rpcs.sql`
- `supabase/tests/progress_invoices_test.sql`
- `tests/progress-invoice-actions.test.ts`
- `tests/progress-invoice-actions-supabase.test.ts`
- `tests/progress-invoice-series-service.test.ts`
- `docs/DECISIONS.md`
- `docs/superpowers/specs/2026-07-14-progress-invoices-design.md`

## Remaining concerns

- The local Vitest RLS integration wrapper is skipped unless its existing environment gate is enabled; database-level RLS/grant coverage passed in pgTAP.
- Advisor warnings listed above predate Task 5 and are outside this task's protected Quote boundary.

---

# Review fix round 1 — series lifecycle hardening

## RED evidence

Focused application/static tests were written before production changes:

```powershell
npm.cmd run test:run -- tests/progress-invoice-actions.test.ts tests/progress-invoice-series-service.test.ts tests/progress-invoice-series-migration.test.ts
```

Expected RED result: **3 files failed; 11 failed / 6 passed tests**. Failures proved the old boundary rejected the pagination/filter input, used direct `.from(...)` series reads instead of read RPCs, accepted numeric JSON, lacked audit/date/read SQL, omitted linked Quote revalidation, and leaked internal Quote metadata.

The first database RED fixture used an out-of-range `NUMERIC(14,2)` value and was invalid test setup, so it was corrected and not counted as behavioral evidence. After a fresh reset, the valid database RED failed at the missing authenticated read boundary:

- assertion 1: read RPC privilege was absent (`NULL != true`)
- execution then stopped because `public.list_progress_invoice_series(jsonb)` did not exist
- **1 test run / 1 failed, planned 33**

## GREEN implementation

- Added authenticated-only `list_progress_invoice_series` and `get_progress_invoice_series` RPCs with literal substring search, lifecycle/payment filtering before pagination, deterministic `updated_at DESC, id DESC` ordering, exact matching totals, and canonical decimal-text output.
- Replaced direct series table reads with repository RPC parsing that accepts decimal strings only and rejects numeric JSON.
- Returned the server-resolved linked `quote_id` internally from series/adjustment mutations, revalidated only the linked Quote path, and stripped it from outward action results.
- Added allowlisted before/after audit changes for every mutable series snapshot field and draft-adjustment business field.
- Enforced direct optional-field length parity and exact canonical `YYYY-MM-DD` adjustment dates in create/update/supersede paths.
- Added genuine different-actor correlation-key isolation and transaction-isolated pgTAP fixtures.
- Reformatted changed financial/locking SQL paths for reviewability and marked the ISO-date helper `STABLE` after DB lint correctly rejected an over-strong volatility declaration.

## Verification

```text
Focused action/service/static tests     PASS — 3 files, 17 tests
Focused repository/action regression   PASS — 4 files, 21 tests
Fresh focused pgTAP                     PASS — 1 file, 33 tests
Fresh full pgTAP                        PASS — 5 files, 220 tests
Public-schema DB lint                   PASS — 0 results / no schema errors
TypeScript typecheck                    PASS
ESLint                                  PASS — 0 warnings
Full Vitest                             PASS — 76 passed / 1 skipped files; 665 passed / 5 skipped tests
Next.js production build               PASS
git diff --check                        PASS
```

The first implemented database run exposed one contract mismatch: null `auth.uid()` returned SQLSTATE `42501` instead of the shared actor-guard contract `28000`. It was aligned once and the next fresh run passed 33/33; the same failure did not repeat. The first full pgTAP run then showed the new fixture had left events for a later legacy global-count assertion. Wrapping the new pgTAP file in `BEGIN`/`ROLLBACK` isolated it; the next fresh full run passed 220/220. These were distinct failures, each resolved once.

`npm.cmd run test:rls:local` remained environment-gated and honestly reported **1 file / 5 tests skipped**. The full pgTAP suite independently verifies role grants, authenticated reads, direct-write denial, and rollback behavior.

The advisor command exited successfully. It reported only pre-existing Quote mutable-search-path and legacy non-progress permissive-policy warnings; no Task 5 function or progress table warning was introduced. Local migration `20260714231100` remains aligned.

Generated types now include both read RPCs plus the internal nullable `quote_id` returned by series and adjustment mutation RPCs. No external dependency or remote/production state was used.

## Protected Quote boundary

All protected blobs remain identical to `aa55d71`:

| File | Blob hash |
|---|---|
| `app/api/jobber/quote/[quoteId]/route.ts` | `b85b2e63f011a05477d00991405c1b00721e555b` |
| `lib/actions/quotes.ts` | `211c5670e53bb52ab2e640e8cb155d042e4b8d8b` |
| `tests/jobber-quote-route-refresh.test.ts` | `d605ac525d378e31e37f5333b45437be9671be48` |
| `tests/quote-actions-supabase.test.ts` | `0052829c84f21316b7d201384ca35d89967ec50e` |

## Changed files in review fix

- `lib/actions/progress-invoice-adjustments.ts`
- `lib/actions/progress-invoice-series.ts`
- `lib/progress-invoices/adjustment-service.ts`
- `lib/progress-invoices/repository.ts`
- `lib/progress-invoices/series-service.ts`
- `lib/progress-invoices/validators.ts`
- `lib/supabase/types.ts`
- `supabase/migrations/20260714231100_add_progress_invoice_series_rpcs.sql`
- `supabase/tests/progress_invoice_series_fix_test.sql`
- `tests/progress-invoice-actions.test.ts`
- `tests/progress-invoice-series-migration.test.ts`
- `tests/progress-invoice-series-service.test.ts`
- `.superpowers/sdd/task-5-report.md`

## Self-review

- Search uses a parameter value with `position(...)`; no dynamic SQL, PostgREST filter interpolation, or wildcard semantics are present.
- Every read `NUMERIC` exposed by the new RPC is serialized with `to_char` before PostgREST and checked as a canonical string in the repository.
- Read RPCs are `SECURITY DEFINER` with empty `search_path`, explicit `auth.uid()` rejection, authenticated-only EXECUTE, and no service-role/PUBLIC/anon exposure.
- Audit JSON is bounded to an explicit field allowlist and contains no bank, token, raw Jobber, or arbitrary request payload.
- Quote revalidation uses only database-resolved linkage and never trusts a client Quote ID.
- Optional-field/date failures occur before mutation, and database tests prove row, version, event, status, and replacement rollback invariants.
- No protected Quote file, dependency manifest, remote state, production database, or unrelated backlog/decision record was changed.
