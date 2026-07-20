# Task 6B report — Series Claim table and Draft delete-as-Void

## Result

Implemented the Series `Progress Invoices` table, all-state Claim detail navigation, authoritative FIFO receipt allocation fields, and atomic Draft delete-as-Void workflow. Issued and Void Claims remain read-only, and no Production, deployment, environment, dependency, Jobber write-back, document publication, or Issued mutation work was performed.

## RED evidence

1. Command:

   ```powershell
   npm.cmd run test:run -- tests/progress-invoice-workspace-service.test.ts tests/progress-invoice-series-ui.test.tsx tests/progress-invoice-claim-actions.test.ts
   ```

   Expected result: failed with 3 test files failing, 13 tests failing and 51 passing. The failures identified the missing `voidProgressClaimDraft` action, absent all-state row links/table fields, missing allocation/created fields, and missing safe selected Void revision.

2. Command:

   ```powershell
   npm.cmd run test:run -- tests/progress-invoice-claim-ui.test.tsx tests/progress-invoice-claim-detail-ui.test.tsx
   ```

   Expected result: 3 tests failed and 3 passed. The Draft editor had no `Delete draft` workflow, while Issued and Void routes called `notFound()` instead of rendering read-only detail.

3. Commands against the clean local pre-Task-6B schema:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 db reset --local
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 test db --local supabase/tests/progress_invoices_test.sql
   ```

   Expected result: pgTAP stopped at the first new Draft-Void assertion because `public.void_progress_claim_draft(jsonb)` did not exist. This established the database RED before the forward migration was applied.

## Implementation

- Added a clearly titled `Progress Invoices` table immediately after Summary with all required GST/date/collection columns.
- Made every Draft, Issued, and Void row open its Claim detail by mouse, Enter, or Space, with an accessible row label and visible focus treatment.
- Preserved date-only values without local conversion and formatted timestamps in `Australia/Sydney`.
- Extended the strict workspace boundary with Claim creation timestamp, FIFO-collected amount/date, outstanding amount, and a safe selected revision for Draft/Void Claims outside Current.
- Added all-state Claim detail routing: Draft continues through `ClaimEditor`; Issued/Void render a readable, read-only invoice summary and explain the coherent Revision workflow.
- Added Draft `Delete draft` confirmation UI with bounded reason, explicit acknowledgement, retry-key reuse, conflict/error feedback, and successful redirect to the Series.
- Added strict validation, action authorization/revalidation, repository command typing/parsing, and Supabase RPC typing for Draft Void.
- Generated the forward migration through the guarded local CLI. Supabase types were regenerated against the resulting local schema; because raw generation changes the repository's established decimal-as-string contracts across unrelated tables, the existing decimal-safe type surface was retained and the generated new RPC signature was reconciled into it.

## Changed files

- `supabase/migrations/20260720040855_add_progress_claim_table_and_draft_void.sql`
- `supabase/tests/progress_invoices_test.sql`
- `lib/supabase/types.ts`
- `lib/progress-invoices/repository.ts`
- `lib/progress-invoices/workspace-service.ts`
- `lib/progress-invoices/claim-service.ts`
- `lib/progress-invoices/validators.ts`
- `lib/actions/progress-invoice-claims.ts`
- `components/progress-invoices/claim-timeline.tsx`
- `components/progress-invoices/series-detail.tsx`
- `components/progress-invoices/claim-editor.tsx`
- `components/progress-invoices/claim-detail.tsx`
- `components/progress-invoices/claim-draft-void-dialog.tsx`
- `app/(app)/progress-invoices/[seriesId]/claims/[claimId]/page.tsx`
- `app/styles/components.css`
- `tests/progress-invoice-workspace-service.test.ts`
- `tests/progress-invoice-series-ui.test.tsx`
- `tests/progress-invoice-claim-actions.test.ts`
- `tests/progress-invoice-claim-ui.test.tsx`
- `tests/progress-invoice-claim-detail-ui.test.tsx`
- `.superpowers/sdd/task-6b-series-claim-workflow-report.md`

## Migration, RPC, and security notes

- `progress_claim_table_dtos(uuid)` derives the bounded Claim list using the existing workspace guard, safe selected revisions, current active receipt revisions, Jobber plus unmatched Manual receipts, signed net activity, and deterministic FIFO ordering by Current-manifest issue date/sequence/ordinal.
- Collection is clamped per Claim; the collected date is the latest threshold re-crossing date and is null when the final net allocation no longer reaches the threshold. Claims outside Current receive null allocation fields.
- `void_progress_claim_draft(jsonb)` locks Series before Claim, validates an exact payload, enforces independent Series/Claim/set/hash CAS, rejects non-Draft/ever-Issued and invalid Series states, and performs Claim/Series version increments, actor/timestamp updates, audit append, and replay snapshot storage in one transaction.
- Exact correlation key plus exact normalized fingerprint replays; changed fingerprints reject. Claim/Revision/number/snapshots/history are retained, and the existing permanent FINAL reservation check remains unchanged.
- Public functions are `SECURITY DEFINER SET search_path = ''`, schema-qualified, actor-guarded, default execution revoked, and granted only to `authenticated`. Private helpers are revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`.
- No hard-delete action/RPC was added. Existing table ACL and trigger invariants continue to block direct Claim deletion.

## Verification

- Focused GREEN:

  ```powershell
  npm.cmd run test:run -- tests/progress-invoice-workspace-service.test.ts tests/progress-invoice-series-ui.test.tsx tests/progress-invoice-claim-actions.test.ts tests/progress-invoice-claim-ui.test.tsx tests/progress-invoice-claim-detail-ui.test.tsx
  ```

  Result: 5 files passed, 73 tests passed.

- Guarded local migration rebuild:

  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 db reset --local
  ```

  Result: exit 0; all migrations through `20260720040855_add_progress_claim_table_and_draft_void.sql` applied.

- Expanded pgTAP:

  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-supabase.ps1 test db --local supabase/tests/progress_invoices_test.sql
  ```

  Result: 1 file passed, 434 tests passed. Coverage includes created/safe revision fields; no/partial/full/overpayment; matched Manual exclusion; refund/reopen; latest threshold re-cross; Void success/replay/fingerprint mismatch; stale Series/Claim/set/hash; cross-Series, reason, Issued/Void/Series rejection; versions/audit/retention/FINAL rule; hard-delete, ACL, search path, and private-helper grants.

- TypeScript:

  ```powershell
  npm.cmd run typecheck
  ```

  Result: exit 0.

- Changed-file ESLint:

  ```powershell
  npx.cmd eslint "app/(app)/progress-invoices/[seriesId]/claims/[claimId]/page.tsx" components/progress-invoices/claim-detail.tsx components/progress-invoices/claim-draft-void-dialog.tsx components/progress-invoices/claim-editor.tsx components/progress-invoices/claim-timeline.tsx components/progress-invoices/series-detail.tsx lib/actions/progress-invoice-claims.ts lib/progress-invoices/claim-service.ts lib/progress-invoices/repository.ts lib/progress-invoices/validators.ts lib/progress-invoices/workspace-service.ts lib/supabase/types.ts tests/progress-invoice-claim-actions.test.ts tests/progress-invoice-claim-detail-ui.test.tsx tests/progress-invoice-claim-ui.test.tsx tests/progress-invoice-series-ui.test.tsx tests/progress-invoice-workspace-service.test.ts
  ```

  Result: exit 0, no warnings or errors.

- Full Vitest:

  ```powershell
  npm.cmd run test:run
  ```

  Result: 102 files passed and 1 skipped; 1,066 tests passed and 5 skipped.

- Production build:

  ```powershell
  npm.cmd run build
  ```

  Result: exit 0; Next.js production compilation, TypeScript, page-data collection, and 19 static pages completed.

- Whitespace check:

  ```powershell
  git diff --check
  ```

  Result: exit 0; only Git's existing LF-to-CRLF working-copy notices were emitted.

## Self-review

- Confirmed the table source is the selected Claim revision, not Jobber invoice amounts.
- Confirmed allocation excludes matched Manual receipts and does not allocate non-Current Draft/Void Claims.
- Confirmed every mutation path remains authenticated, validated, strict-parsed, idempotent, Series-first locked, auditable, and non-destructive.
- Confirmed no bank fields, raw Jobber JSON, Storage paths, or new unbounded event data were added to the workspace response.
- Confirmed Issued/Void UI contains no mutation control and Draft FINAL remains permanently reserved after Void.
- Confirmed no out-of-scope dependency, Production, deployment, environment, Jobber fetch/write-back, official document, Quote Jobber, or Issued mutation changes.
- No unresolved concerns found.

## Commit

Commit subject: `feat: add progress claim table and draft void`

Commit hash: this report is part of that commit; the immutable hash is recorded in the task handoff because a commit cannot embed its own content-derived hash.
