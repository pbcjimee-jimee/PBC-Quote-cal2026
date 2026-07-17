# Progress Invoice Manual Creation and Preview Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Jobber Invoice previews accept real timezone-qualified Jobber dates, remove PBC Quote-based creation, and add a first-class local Manual Progress Invoice series flow.

**Architecture:** Keep raw Jobber timestamps in the dedicated read gateway and normalize only calendar-date DTOs through one pure Australia/Sydney helper shared with save-time observation mapping. Rework generic local series creation into a server-controlled Manual command with a required accepted numbering base, while Jobber imports continue through the existing atomic Jobber import RPC. Replace the PBC Quote card with an accessible two-mode Jobber/Manual workspace that shares local series fields.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zod, decimal.js, Supabase/PostgreSQL RPC and RLS, Vitest/React DOM, pgTAP.

## Global Constraints

- New series creation has exactly two entry paths: one-time Jobber Invoice import or Manual local creation.
- No Existing PBC Quote card, link, copy, Action, or accepted new-create command may remain.
- Historical `pbc_quote` and `jobber_job` rows remain readable.
- Existing Quote Jobber fetch, snapshot, Save & Sync, write-back, Routes, Actions, DTOs, and tests remain unchanged.
- Manual series use `source_type = 'manual'`, have no Quote or Jobber identity, and require an accepted Invoice number base.
- Manual GST is fixed server-side to decimal string `0.10`; the browser cannot select source type or GST.
- Jobber preview dates are returned as `YYYY-MM-DD` using `Australia/Sydney`; raw gateway observation timestamps and fingerprints remain unchanged.
- Jobber import remains one-time Save-time import with no Refresh, Sync, polling, timer, or scheduled-import UI.
- Money remains decimal strings and uses decimal.js where arithmetic is required; native number arithmetic is not allowed for money.
- Server mutations return the project `ActionResult<T>` union, strictly validate unknown input with Zod, and retain a stable correlation key for an unchanged retry.
- Previously applied migrations are immutable. Add a new forward-only migration.
- RLS, direct-write denial, hardened function `search_path`, least-privilege grants, safe audit events, and idempotency must remain intact.
- No new external dependency.

---

### Task 1: Normalize Jobber preview calendar dates at the API boundary

**Files:**
- Create: `lib/progress-invoices/jobber-calendar-date.ts`
- Modify: `lib/progress-invoices/jobber-refresh-service.ts:101-145`
- Modify: `app/api/jobber/progress-invoices/invoices/[invoiceId]/route.ts:53-88`
- Test: `tests/progress-invoice-jobber-refresh.test.ts`
- Test: `tests/jobber-progress-invoice-routes.test.ts`

**Interfaces:**
- Produces: `toSydneyCalendarDate(value: string): string`
- Produces: `optionalSydneyCalendarDate(value: string | null): string | null`
- Preserves: `toSydneyCalendarDate` re-export from `jobber-refresh-service.ts` for existing callers.
- Consumes: raw `issuedDate`, `dueDate`, and `receivedDate` from `JobberInvoiceSelectionPreview`.

- [ ] **Step 1: Write the RED pure-helper and route regression tests**

Move the existing date assertions into a dedicated helper describe block and add exact timezone cases:

```ts
expect(toSydneyCalendarDate('2026-01-01')).toBe('2026-01-01')
expect(toSydneyCalendarDate('2026-01-01T13:30:00Z')).toBe('2026-01-02')
expect(toSydneyCalendarDate('2026-07-15T00:00:00+00:00')).toBe('2026-07-15')
expect(() => toSydneyCalendarDate('2026-07-01T14:30:00')).toThrow('PROGRESS_JOBBER_ERROR')
expect(() => toSydneyCalendarDate('2026-02-30')).toThrow('PROGRESS_JOBBER_ERROR')
expect(() => toSydneyCalendarDate('2026-02-30T00:00:00Z')).toThrow('PROGRESS_JOBBER_ERROR')
```

In the preview Route test, return these raw gateway values:

```ts
issuedDate: '2026-07-01T00:00:00Z',
dueDate: '2026-07-15T00:00:00+00:00',
receivedDate: '2026-01-01T13:30:00Z',
```

Assert the response contains:

```ts
issuedDate: '2026-07-01',
dueDate: '2026-07-15',
receivedDate: '2026-01-02',
```

and call `parseJobberInvoicePreviewResponse(body)` to prove the complete browser contract accepts it. Also assert the mocked gateway object is unchanged.

- [ ] **Step 2: Run the date tests and verify RED**

Run:

```powershell
npx.cmd vitest run tests/progress-invoice-jobber-refresh.test.ts tests/jobber-progress-invoice-routes.test.ts --reporter=verbose
```

Expected: the route regression fails because the response still contains timestamps. Existing save-time helper tests may pass; the new shared-module import must fail until Step 3.

- [ ] **Step 3: Extract the pure helper and use it in both boundaries**

Create a dependency-free module with this public shape:

```ts
const SYDNEY_TIME_ZONE = 'Australia/Sydney'

function progressJobberError(): Error {
  return new Error('PROGRESS_JOBBER_ERROR')
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function requireOffsetTimestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw progressJobberError()
  }
  if (!validDateOnly(value.slice(0, 10))) throw progressJobberError()
  if (!Number.isFinite(Date.parse(value))) throw progressJobberError()
  return value
}

export function toSydneyCalendarDate(value: string): string {
  if (validDateOnly(value)) return value
  requireOffsetTimestamp(value)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value))
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]))
  const result = `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`
  if (!validDateOnly(result)) throw progressJobberError()
  return result
}

export function optionalSydneyCalendarDate(value: string | null): string | null {
  return value === null ? null : toSydneyCalendarDate(value)
}
```

Import these functions into `jobber-refresh-service.ts`, delete the duplicated implementation, and re-export `toSydneyCalendarDate`. In the preview Route, map all three nullable dates through `optionalSydneyCalendarDate` inside the existing `try` block. Do not change `invoice-client.ts`, `invoice-gateway.ts`, or observation fingerprint construction.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command. Expected: both files pass with no warnings, and the parser accepts the full normalized response.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- lib/progress-invoices/jobber-calendar-date.ts lib/progress-invoices/jobber-refresh-service.ts 'app/api/jobber/progress-invoices/invoices/[invoiceId]/route.ts' tests/progress-invoice-jobber-refresh.test.ts tests/jobber-progress-invoice-routes.test.ts
git diff --cached --check
git commit -m "fix: normalize Jobber invoice preview dates"
```

---

### Task 2: Add the Manual series transaction and domain source

**Files:**
- Create: `supabase/migrations/20260717102000_add_manual_progress_invoice_series.sql`
- Modify: `lib/progress-invoices/validators.ts:56-110,361-370`
- Modify: `lib/progress-invoices/repository.ts:60-108,347-390,719-825`
- Modify: `lib/progress-invoices/series-service.ts:40-118,140-171,210-230`
- Modify: `lib/actions/progress-invoice-series.ts:1-105`
- Modify: `lib/supabase/types.ts`
- Modify: `components/progress-invoices/progress-invoice-dashboard.tsx:45-70`
- Test: `tests/progress-invoice-validators.test.ts`
- Test: `tests/progress-invoice-actions.test.ts`
- Test: `tests/progress-invoice-actions-supabase.test.ts`
- Test: `tests/progress-invoice-series-service.test.ts`
- Test: `tests/progress-invoice-repository.test.ts`
- Test: `tests/progress-invoice-dashboard-ui.test.tsx`
- Test: `tests/progress-invoice-migration.test.ts`
- Test: `tests/progress-invoice-series-migration.test.ts`
- Test: `supabase/tests/progress_invoice_series_fix_test.sql`
- Test: `supabase/tests/progress_invoice_core_test.sql`
- Test: `supabase/tests/progress_invoices_test.sql`
- Test: `supabase/tests/data_api_grants_test.sql`

**Interfaces:**
- Produces: `createManualProgressInvoiceSeriesSchema`
- Produces: browser `CreateManualProgressInvoiceSeriesInput` without provenance/GST.
- Produces: internal `ManualProgressInvoiceSeriesCommand` with literal `sourceType: 'manual'` and `gstRate: '0.10'`.
- Produces: `createManualProgressInvoiceSeries(input: unknown): Promise<ActionResult<VersionedMutationRpcResult>>`
- Produces repository command: `create_manual_progress_invoice_series`
- Produces DB RPC: `public.create_manual_progress_invoice_series(payload JSONB)` returning `(id UUID, version INT)`.
- Manual browser input keys: `acceptedNumberingBase`, local recipient/site/series fields, and `correlationKey`; no `sourceType` or `gstRate`.

- [ ] **Step 1: Write RED validator, Action, service, parser, and dashboard tests**

Add a strict command fixture:

```ts
const manualSeriesInput = {
  acceptedNumberingBase: ' 2906 ',
  baseContractExGst: '17220.50',
  recipientName: 'Manual Builder',
  recipientCompany: null,
  recipientAddress: '1 Billing Street',
  recipientEmail: null,
  recipientPhone: null,
  recipientAbn: null,
  siteName: 'Manual Site',
  siteAddress: '4 Site Street',
  defaultDescription: 'Progress painting works',
  reference: null,
  correlationKey: UUID,
}
```

Assert trimming of the base, strict unknown-key rejection for `sourceType`, `gstRate`, `jobberInvoiceId`, and `pbcQuoteId`, positive two-decimal money, field limits, and required local fields. Assert the Action authorizes before delegation, constructs the internal command with literal `sourceType: 'manual'` and `gstRate: '0.10'`, passes normalized data to the service, revalidates `/progress-invoices`, and returns validation/auth/RPC errors through `ActionResult`.

Add read-boundary fixtures with `source_type: 'manual'` and assert both detail and dashboard parsers return `sourceType: 'manual'`. Keep historical `pbc_quote` and `jobber_job` parser tests. Add dashboard markup expectation `Manual` and no Jobber import timestamp for a Manual row.

Add removal/authorization regressions proving the application no longer exports or delegates `createProgressInvoiceSeries` or `getProgressInvoiceCreatePrefill`, and that authenticated/Public/anon/service-role callers cannot execute the legacy `create_progress_invoice_series(JSONB)` or `get_progress_invoice_quote_prefill(JSONB)` RPCs after the forward migration. The old functions may remain as inert migration history/privileged test-fixture helpers, but no application role may execute them.

- [ ] **Step 2: Write RED migration and pgTAP assertions**

Static migration tests must require the new file to contain:

```sql
ADD CONSTRAINT progress_invoice_series_source_type_check
  CHECK (source_type IN ('pbc_quote', 'jobber_job', 'jobber_invoice', 'manual'));

CREATE UNIQUE INDEX uq_progress_invoice_series_numbering_base
  ON public.progress_invoice_series (lower(btrim(accepted_numbering_base)))
  WHERE accepted_numbering_base IS NOT NULL AND status <> 'void';

CREATE OR REPLACE FUNCTION public.create_manual_progress_invoice_series(payload JSONB)
RETURNS TABLE (id UUID, version INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';
```

pgTAP must prove:

- valid Manual creation stores `manual`, `quote_id = NULL`, all Jobber identity/current snapshot fields null, accepted base `2906`, and GST `0.1000`;
- calculated adjusted/unclaimed Ex GST, GST, and Inc GST caches are correct and claimed/receipts remain zero;
- same actor/key/payload replays the same ID, changed payload raises `IDEMPOTENCY_KEY_REUSED`, and another actor may reuse the key;
- two concurrent sessions using the same actor/key cannot create two rows, and a concurrent changed payload cannot bypass `IDEMPOTENCY_KEY_REUSED`;
- an active duplicate base is rejected with the stable `PROGRESS_UNIQUE_CONFLICT` application result, including a concurrent unique-index race, while a void-series base may be reused according to the partial unique predicate;
- direct insert/update remains denied to authenticated clients;
- public/anon/service_role cannot execute the authenticated Manual command and authenticated can;
- public/anon/authenticated/service_role cannot execute the legacy Quote-based `create_progress_invoice_series` or Quote prefill RPC;
- old `pbc_quote` and `jobber_job` rows remain readable;
- Manual rows cannot contain Quote or Jobber identity values;
- claim revision Jobber evidence is either all present for Jobber-backed evidence or all null for Manual evidence, while `accepted_numbering_base` remains required.
- exactly one safe creation event is written for a new Manual series and exact replay does not append another event.

Run static tests first and verify they fail because the migration and Manual interfaces do not exist.

- [ ] **Step 3: Run the RED application tests**

```powershell
npx.cmd vitest run tests/progress-invoice-validators.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts tests/progress-invoice-series-service.test.ts tests/progress-invoice-repository.test.ts tests/progress-invoice-dashboard-ui.test.tsx tests/progress-invoice-migration.test.ts tests/progress-invoice-series-migration.test.ts --reporter=verbose
```

Expected: failures specifically report missing Manual schema/Action/command/source and migration.

- [ ] **Step 4: Implement the Manual Zod, Action, service, and repository boundary**

Define the browser schema without provenance fields:

```ts
export const createManualProgressInvoiceSeriesSchema = z.strictObject({
  acceptedNumberingBase: requiredText(120),
  baseContractExGst: positiveMoneySchema,
  recipientName: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.recipientName),
  recipientCompany: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.recipientCompany),
  recipientAddress: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.address),
  recipientEmail: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.email),
  recipientPhone: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.phone),
  recipientAbn: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.abn),
  siteName: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.siteName),
  siteAddress: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.siteAddress),
  defaultDescription: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.description),
  reference: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.reference),
  correlationKey: uuidSchema,
})
```

Create the dedicated Action. It must not accept a source or GST from the browser; after authentication and browser-schema parsing it constructs the internal command with the two server literals. The service rejects any non-literal internal provenance/GST and calls the repository with snake-case payload including `source_type`, `gst_rate`, `accepted_numbering_base`, all local fields, and correlation key. The DB validator independently requires the same literal values. The repository command parser returns the existing versioned result. Add `manual` to read DTO unions/parsers only; retain historical source variants.

Remove the obsolete Progress Invoice Quote-create application boundary end-to-end: `createProgressInvoiceSeriesSchema`, `progressInvoiceCreatePrefillSchema`, `createProgressInvoiceSeries`, `getProgressInvoiceCreatePrefill`, their service methods, and the corresponding repository command/result branches. Remove or rewrite their application tests instead of leaving unused callable exports. This removal is scoped only to Progress Invoice series creation and must not touch Quote Jobber fetch/write-back modules.

- [ ] **Step 5: Implement the forward-only Manual migration**

The migration must perform these exact logical changes in one transaction:

1. preflight for duplicate non-void normalized accepted bases and abort before index creation if any exist;
2. replace the source-type check with the four-value list;
3. replace the accepted-base/identity check so Manual requires a base and null Quote/Jobber identity, while non-Manual historical rows keep the prior rule;
4. create the partial unique normalized numbering-base index and a Manual-command partial unique event index on `(actor_id, command_name, correlation_key)`;
5. drop `NOT NULL` from the four Jobber-only claim revision evidence columns, add an all-null-or-all-present row constraint, and add a hardened source-aware trigger that follows `claim_id -> progress_claims.series_id -> progress_invoice_series.source_type`: Manual requires all four values null, every non-Manual source requires all four present. Cover insert, `claim_id` changes, and evidence-field updates; revoke direct function execution from application roles;
6. add strict `progress_validate_manual_series_create_payload(JSONB)` and the idempotent `create_manual_progress_invoice_series(JSONB)` RPC;
7. serialize by actor/command/correlation key before replay lookup, then insert the Manual series with `source_type = 'manual'`, `quote_id = NULL`, all Jobber fields null, accepted base stored at creation, fixed `gst_rate = 0.10`, and call `progress_recalculate_series_read_model`;
8. append exactly one safe `series_created` event whose safe changes contain only source type and whose result refs contain only ID/version;
9. revoke helper access from all roles, revoke the Manual command from PUBLIC/anon/service_role, grant it only to authenticated, and revoke both legacy Progress Invoice Quote-create/prefill functions from PUBLIC/anon/authenticated/service_role;
10. retain established function ownership and hardened empty `search_path`, then notify PostgREST.

Do not alter any earlier migration. Do not log recipient, address, contract amount, numbering base, or correlation key.

- [ ] **Step 6: Run local DB reset and pgTAP GREEN**

Use the repository's established Docker/local Supabase test flow. Rewrite the legacy create/prefill privilege and fixture portions of `supabase/tests/progress_invoices_test.sql` so the revoked authenticated path is expected and Manual RPC or privileged table setup supplies fixtures without weakening application grants. Add a two-session concurrency harness for the Manual correlation key. The expected proof is a successful reset plus every `supabase/tests/*.sql` file passing. If local Supabase CLI profile parsing is unavailable, use the configured Docker database commands documented for this repository; do not apply production yet.

- [ ] **Step 7: Run focused application GREEN tests**

Run the Step 3 command. Expected: all listed files pass, historical source fixtures still parse, and Manual Action/repository contracts are strict.

- [ ] **Step 8: Commit Task 2**

```powershell
git add -- supabase/migrations/20260717102000_add_manual_progress_invoice_series.sql lib/progress-invoices/validators.ts lib/progress-invoices/repository.ts lib/progress-invoices/series-service.ts lib/actions/progress-invoice-series.ts lib/supabase/types.ts components/progress-invoices/progress-invoice-dashboard.tsx tests/progress-invoice-validators.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts tests/progress-invoice-series-service.test.ts tests/progress-invoice-repository.test.ts tests/progress-invoice-dashboard-ui.test.tsx tests/progress-invoice-migration.test.ts tests/progress-invoice-series-migration.test.ts supabase/tests/progress_invoice_series_fix_test.sql supabase/tests/progress_invoice_core_test.sql supabase/tests/progress_invoices_test.sql supabase/tests/data_api_grants_test.sql
git diff --cached --check
git commit -m "feat: add manual progress invoice series"
```

---

### Task 3: Replace PBC Quote creation with the Jobber/Manual workspace

**Files:**
- Create: `components/progress-invoices/progress-invoice-series-fields.tsx`
- Create: `components/progress-invoices/manual-progress-invoice-form.tsx`
- Create: `components/progress-invoices/progress-invoice-create-workspace.tsx`
- Modify: `components/progress-invoices/standalone-progress-invoice-form.tsx`
- Modify: `app/(app)/progress-invoices/new/page.tsx`
- Modify: `app/globals.css` only for mode selector/full-width responsive layout selectors already owned by Progress Invoice UI
- Test: `tests/progress-invoice-standalone-ui.test.tsx`
- Test: `tests/progress-invoice-dashboard-ui.test.tsx`

**Interfaces:**
- Produces: `ProgressInvoiceSeriesDraft` with all local editable fields plus `baseContractExGst` and `acceptedNumberingBase`.
- Produces: controlled `ProgressInvoiceSeriesFields` that receives `draft`, `disabled`, `showAcceptedNumberingBase`, and `onChange`.
- Produces: controlled `ManualProgressInvoiceForm` calling only `createManualProgressInvoiceSeries`.
- Produces: `ProgressInvoiceCreateWorkspace` with mode union `'jobber' | 'manual'`, default `'jobber'`, and independent Jobber/Manual draft plus retry state preserved across mode switches.

- [ ] **Step 1: Write RED UI tests**

Update the page-render test to assert:

```ts
expect(markup).toContain('Import from Jobber')
expect(markup).toContain('Create manually')
expect(markup).not.toContain('Existing PBC Quote')
expect(markup).not.toContain('Browse PBC Quotes')
expect(markup).not.toContain('Start from a PBC Quote')
```

Mount the workspace and prove:

- Jobber is selected by default;
- the mode controls have tab semantics and correct `aria-selected`/panel association;
- selecting Manual hides Jobber search and renders `acceptedNumberingBase` plus shared fields;
- selecting Manual does not call `fetch`;
- entering distinct Jobber and Manual drafts, switching both directions, and returning to each mode preserves its own values without copying them into the other mode;
- switching modes while a Jobber preview or either Save is pending cannot route a late result/error into the other mode, reset the inactive mode, or change its retry key;
- incomplete Manual input and invalid money do not call the Action;
- local validation marks each affected field with `aria-invalid` and an associated field message while preserving all entered values;
- a valid submit calls the Manual Action with local fields and correlation key only;
- no `sourceType`, `gstRate`, Quote ID, Jobber ID, observation, payment, or comparison amount is submitted;
- an unchanged retry reuses correlation key, while an edited command receives a new key;
- success pushes `/progress-invoices` and refreshes;
- duplicate numbering conflict displays a stable local error without clearing entered fields.

Keep existing Jobber candidate, relation-selection, async race, comparison-only, and save-time import tests.

- [ ] **Step 2: Run the UI tests and verify RED**

```powershell
npx.cmd vitest run tests/progress-invoice-standalone-ui.test.tsx tests/progress-invoice-dashboard-ui.test.tsx --reporter=verbose
```

Expected: failures show the old PBC Quote card and missing Manual mode/form.

- [ ] **Step 3: Extract shared controlled fields**

Move only the Recipient, Site, Base contract, Reference, and Default description markup into `progress-invoice-series-fields.tsx`. Add Invoice number base only when `showAcceptedNumberingBase` is true. Keep all labels, max lengths, required attributes, input modes, and Tax Invoice recipient/site copy. Jobber form passes `showAcceptedNumberingBase={false}`; Manual passes `true`.

Do not move Jobber search, candidate, relation selection, comparison amounts, request-generation race guards, or Save correlation logic into the shared component.

- [ ] **Step 4: Implement the Manual form and mode workspace**

The Manual form starts with empty local fields, default description `Progress painting works`, and no external fetch. It uses the same positive two-decimal validation as the Jobber form and keeps an unchanged `SaveAttempt` correlation key across transient errors.

The workspace owns separate controlled view-models for both modes. The Jobber view-model includes search/candidates/selection/preview request generation, local draft, submit status, and retry attempt; the Manual view-model includes its local draft, field errors, submit status, and retry attempt. Only the active form is mounted/rendered, but every state transition is lifted or reported to the workspace before unmount so switching modes does not reset or cross-populate data or an unchanged retry correlation key. Pending requests use mode-scoped generation/abort guards so late completions cannot mutate the active other mode. Update page copy to:

```text
Create a Progress Invoice series from an existing Jobber invoice or enter the series manually.
```

Remove `Icons.quote`, the PBC Quote section, and `/quotes` link. Keep the back link to `/progress-invoices`. Make the active form full-width at desktop and mobile; do not introduce a new visual design system.

- [ ] **Step 5: Run UI GREEN and focused Jobber non-regression tests**

```powershell
npx.cmd vitest run tests/progress-invoice-standalone-ui.test.tsx tests/progress-invoice-dashboard-ui.test.tsx tests/jobber-readonly-regression.test.ts tests/jobber-progress-invoice-routes.test.ts tests/jobber-progress-invoice-search-route.test.ts --reporter=verbose
```

Expected: all pass; Quote Jobber modules remain byte-for-byte outside the diff.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- components/progress-invoices/progress-invoice-series-fields.tsx components/progress-invoices/manual-progress-invoice-form.tsx components/progress-invoices/progress-invoice-create-workspace.tsx components/progress-invoices/standalone-progress-invoice-form.tsx 'app/(app)/progress-invoices/new/page.tsx' app/globals.css tests/progress-invoice-standalone-ui.test.tsx tests/progress-invoice-dashboard-ui.test.tsx
git diff --cached --check
git commit -m "feat: add manual progress invoice workspace"
```

---

### Task 4: Apply, verify, and document the completed increment

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/specs/2026-07-14-progress-invoices-design.md` only to add the approved superseding amendment link
- Modify: `docs/superpowers/specs/2026-07-17-progress-invoice-standalone-import-design.md` only to add the approved superseding amendment link
- Modify: this plan's checkboxes
- Delete: `tests/live-progress-invoice-jobber-smoke.test.ts`
- Delete: `.codex/tmp/progress-sample-inspect/` temporary inspection artifacts, after resolving and verifying the junction target is outside the delete target

**Interfaces:**
- Consumes: Tasks 1-3 commits and migration `20260717102000`.
- Produces: production Supabase schema parity, browser evidence for Invoice 2875 and Manual mode, clean verification evidence, and final documentation.

- [ ] **Step 1: Run the complete local verification gate**

Run fresh commands and retain counts/exit codes:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- --run
npm.cmd run build
```

Run the complete local pgTAP suite through the established Docker/Supabase test flow. Every command must exit zero. Do not treat a focused suite as proof of the full gate.

- [ ] **Step 2: Perform an independent whole-branch review**

Generate a review package from `git merge-base main HEAD` through `HEAD`. The reviewer must verify spec compliance and code quality, with special attention to:

- Sydney date conversion versus UTC truncation;
- raw observation/fingerprint preservation;
- Manual source and numbering constraints;
- source-aware Manual-null versus non-Manual-complete Claim Jobber evidence enforcement;
- Manual actor/command/correlation uniqueness and concurrent replay behavior;
- PBC Quote new-create removal without historical read breakage;
- legacy Progress Invoice Quote-create/prefill RPC privilege revocation for every application role;
- idempotency and duplicate numbering races;
- Action-controlled provenance/GST;
- RLS/function grants and safe audit fields;
- no changes to existing Quote Jobber behavior; and
- mode-switch async state/correlation behavior.

Fix all Critical and Important findings with focused RED/GREEN tests, then re-review.

- [ ] **Step 3: Apply the new migration through the connected Supabase DB API**

Use the connected project `ojcrfgguhbxhtlgdflzp`; do not use Supabase CLI. Before applying, query migration history and target constraints/index/function. Apply the exact repository migration through the migration API in one transaction. Then verify:

- migration history contains exact version/name;
- source constraint includes `manual`;
- Manual RPC is SECURITY DEFINER with empty `search_path`;
- PUBLIC/anon/service_role are denied and authenticated is allowed;
- legacy Progress Invoice Quote-create and Quote-prefill RPCs are denied to PUBLIC/anon/authenticated/service_role;
- numbering-base index is unique, valid, ready, and has the non-void predicate;
- no duplicate existing base groups;
- unrelated security/performance advisor findings are not changed.

Do not create a production Manual series during migration verification.

- [ ] **Step 4: Browser QA the reported failure and both modes**

At `http://localhost:3000/progress-invoices/new`:

1. confirm no Existing PBC Quote card/link/copy;
2. confirm Jobber mode is default;
3. fetch Invoice 2875, select the explicit candidate, and confirm preview/client/site/comparison fields load without the generic error;
4. confirm no Sync/Refresh control exists;
5. switch to Manual and confirm no network request is issued to a Jobber Progress Invoice Route;
6. verify required fields, Invoice number base, decimal input, responsive layout, keyboard mode selection, visible focus, and no console errors;
7. do not submit Invoice 2875 or create a disposable production Manual series.

- [ ] **Step 5: Clean temporary live artifacts safely**

Remove the untracked live test. Before removing `.codex/tmp/progress-sample-inspect`, resolve every junction/symlink target and prove the resolved delete root remains inside `.codex/tmp/progress-sample-inspect`; remove the junction itself, never its external target. Re-run `git status --short` and confirm no secret, token, customer, or payment artifact is staged/untracked.

- [ ] **Step 6: Update documentation and run the final verification**

Record the new creation rule, migration/API application, exact test counts, and remaining claim/document scope in `PROGRESS.md`. Add one-line superseding-amendment links to the two earlier specs without rewriting their history. Re-run typecheck, lint, full Vitest, build, and `git diff --check` after documentation edits.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- PROGRESS.md docs/superpowers/specs/2026-07-14-progress-invoices-design.md docs/superpowers/specs/2026-07-17-progress-invoice-standalone-import-design.md docs/superpowers/plans/2026-07-17-progress-invoice-manual-creation-and-preview-date.md
git diff --cached --check
git commit -m "test: verify manual progress invoice creation"
```

## Completion Criteria

This increment is complete when Invoice 2875 previews successfully with Sydney date-only DTOs; `/progress-invoices/new` contains only Jobber import and Manual creation; an authenticated user can atomically create an idempotent Manual series with a unique accepted numbering base and no Quote/Jobber identity; historical source rows remain readable; production migration parity is verified through the connected DB API; existing Quote Jobber code is unchanged; and all focused, full application, database, build, browser, and independent-review gates pass.
