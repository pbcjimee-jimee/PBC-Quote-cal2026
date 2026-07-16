# Progress Invoice Standalone Jobber Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized user create a Standalone Progress Invoice series by searching a Jobber invoice number, reviewing and editing its client/site prefill, and atomically importing the invoice snapshot and current payments once.

**Architecture:** A payment-free Progress-Invoice-only preview gateway supplies explicit invoice, Job, and Property choices. Save re-fetches the full observation on the server and calls one service-role-only Postgres RPC that atomically creates the local series, immutable Jobber snapshot, payment ledger, read model, and audit event. The resulting series is app-owned and exposes no ongoing Refresh or Sync UI.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zod 4, Decimal.js, Supabase/Postgres/RLS, Vitest, existing Jobber GraphQL query transport

## Global Constraints

- The approved source of truth is `docs/superpowers/specs/2026-07-17-progress-invoice-standalone-import-design.md`.
- All implementation and review subagents use `gpt-5.6-sol` with `model_reasoning_effort = "high"`.
- Do not modify the existing Quote Jobber routes, actions, components, query client behavior, snapshots, or write-back behavior.
- Jobber invoice and payment access remains read-only; add no Jobber mutation.
- Standalone Save imports Jobber once. Add no Refresh, Sync, polling, timer, or scheduled-import UI or call.
- Save must re-fetch the selected Jobber invoice and current payment records on the server; browser preview data is never authoritative.
- The browser must never receive Jobber payment IDs, payment references, normalized observation fingerprints, raw GraphQL, OAuth tokens, or service-role data.
- The Jobber invoice subtotal is comparison-only. The base contract Ex GST remains a required user input and is never auto-copied from Jobber.
- User-edited recipient, site, description, reference, and base contract values are the local series snapshot. Original Jobber values remain in the immutable Jobber observation.
- The atomic RPC is executable by `service_role` only and rolls back every row on any failure.
- Money remains decimal strings in TypeScript and Postgres numeric in the database. No native financial arithmetic.
- No new external dependency is authorized or required.
- Every behavior change follows RED -> GREEN. Run the focused command after each task and commit only after the task reviewer approves spec compliance and code quality.
- Do not commit the supplied customer workbook/PDF, live Jobber responses, credentials, raw customer contact data, or temporary smoke-test output.

---

### Task 1: Add a payment-free Jobber invoice selection preview

**Files:**
- Modify: `lib/jobber/invoice-types.ts`
- Modify: `lib/jobber/invoice-gateway.ts`
- Modify: `app/api/jobber/progress-invoices/invoices/[invoiceId]/route.ts`
- Modify: `tests/jobber-invoice-gateway.test.ts`
- Modify: `tests/jobber-progress-invoice-routes.test.ts`

**Interfaces:**
- Produces:

```ts
export interface JobberInvoiceSelectionPreview {
  readonly invoiceId: string
  readonly invoiceNumber: string
  readonly rawStatus: string
  readonly normalizedStatus: NormalizedJobberInvoiceStatus
  readonly jobberWebUri: string
  readonly amounts: JobberInvoiceAmounts | null
  readonly issuedDate: string | null
  readonly dueDate: string | null
  readonly receivedDate: string | null
  readonly client: JobberInvoiceDetail['client']
  readonly billingAddress: JobberAddress | null
  readonly jobs: readonly JobberInvoiceJob[]
  readonly properties: readonly JobberInvoiceProperty[]
  readonly selectedJobberJobId: string | null
  readonly selectedJobberPropertyId: string | null
  readonly jobSelectionRequired: boolean
  readonly propertySelectionRequired: boolean
}

export async function fetchJobberInvoiceSelectionPreview(input: {
  readonly jobberInvoiceId: string
  readonly selectedJobberJobId?: string
  readonly selectedJobberPropertyId?: string
}): Promise<JobberInvoiceSelectionPreview>
```

- Consumes the existing token/version/scope transport and complete pagination helper.
- Does not call `fetchJobberInvoicePaymentsPage`, `fetchJobberPaymentDetail`, or `fetchJobberPaymentRefundsPage`.

- [ ] **Step 1: Write failing gateway tests**

Add tests that return two Jobs and two Properties and assert the preview returns all candidates with both `selectionRequired` flags true instead of throwing. Add tests that one candidate auto-resolves, a valid supplied selector resolves, an invalid selector throws, every Job/Property page is consumed, and no payment GraphQL query is issued.

```ts
const preview = await fetchJobberInvoiceSelectionPreview({
  jobberInvoiceId: 'invoice-1',
})

expect(preview.jobs.map(({ id }) => id)).toEqual(['job-1', 'job-2'])
expect(preview.properties.map(({ id }) => id)).toEqual(['property-1', 'property-2'])
expect(preview.jobSelectionRequired).toBe(true)
expect(preview.propertySelectionRequired).toBe(true)
expect(preview.selectedJobberJobId).toBeNull()
expect(preview.selectedJobberPropertyId).toBeNull()
expect(fetchMock.mock.calls.some(([request]) => String(request).includes('JobberInvoicePayments'))).toBe(false)
```

- [ ] **Step 2: Write failing route tests**

Replace the route mock with `fetchJobberInvoiceSelectionPreview`. Assert multiple candidate preview returns HTTP 200, `private, no-store, max-age=0`, selection flags, bounded client/address candidates, and no serialized payment/fingerprint/account authority fields.

```ts
expect(body.data).toMatchObject({
  invoiceId: 'invoice-1',
  invoiceNumber: 'INV-100',
  selectionRequired: { job: true, property: true },
})
for (const forbidden of ['payments', 'payment-secret', 'responseFingerprint', 'accountId']) {
  expect(JSON.stringify(body)).not.toContain(forbidden)
}
```

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```powershell
npm.cmd run test:run -- tests/jobber-invoice-gateway.test.ts tests/jobber-progress-invoice-routes.test.ts
```

Expected: FAIL because the selection-preview gateway does not exist and the route still calls the strict full observation gateway.

- [ ] **Step 4: Implement the preview gateway**

Use `withRestartableToken`, `requireAccountId`, `fetchJobberInvoiceDetail`, `fetchAllJobberPages(fetchJobberInvoiceJobsPage)`, and `fetchAllJobberPages(fetchJobberInvoicePropertiesPage)`. Resolve selectors with this exact behavior:

```ts
function previewSelection(ids: readonly string[], suppliedId: string | undefined): {
  selectedId: string | null
  selectionRequired: boolean
} {
  const selectedId = suppliedId?.trim()
  if (selectedId && !ids.includes(selectedId)) throw new Error('Selected Jobber relation was not found on the invoice')
  if (selectedId) return { selectedId, selectionRequired: false }
  if (ids.length === 1) return { selectedId: ids[0]!, selectionRequired: false }
  return { selectedId: null, selectionRequired: ids.length > 1 }
}
```

Return immutable sorted Job and Property arrays. Normalize only invoice status; do not normalize payments or compute a response fingerprint.

- [ ] **Step 5: Update the preview route**

Call the new gateway and return only:

```ts
{
  invoiceId,
  invoiceNumber,
  rawStatus,
  normalizedStatus,
  jobberWebUri,
  amounts,
  issuedDate,
  dueDate,
  receivedDate,
  client: client === null ? null : {
    name: client.name,
    companyName: client.companyName,
    emails: [...client.defaultEmails],
    phones: client.phones.map((phone) => ({ ...phone })),
  },
  billingAddress,
  jobs: jobs.map(({ id }) => ({ id })),
  properties: properties.map(({ id, address }) => ({ id, address })),
  selectedJobberJobId,
  selectedJobberPropertyId,
  selectionRequired: {
    job: jobSelectionRequired,
    property: propertySelectionRequired,
  },
}
```

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run the command from Step 3. Expected: all selected tests pass.

- [ ] **Step 7: Commit after task review**

```powershell
git add -- lib/jobber/invoice-types.ts lib/jobber/invoice-gateway.ts 'app/api/jobber/progress-invoices/invoices/[invoiceId]/route.ts' tests/jobber-invoice-gateway.test.ts tests/jobber-progress-invoice-routes.test.ts
git commit -m "feat: preview Jobber invoice selections"
```

### Task 2: Create the atomic Standalone import command

**Files:**
- Create: `supabase/migrations/20260717082000_add_progress_invoice_standalone_jobber_import.sql`
- Create: `lib/progress-invoices/standalone-import-service.ts`
- Create: `tests/progress-invoice-standalone-import.test.ts`
- Create: `tests/progress-invoice-standalone-import-migration.test.ts`
- Modify: `lib/progress-invoices/validators.ts`
- Modify: `lib/progress-invoices/repository.ts`
- Modify: `lib/actions/progress-invoice-jobber.ts`
- Modify: `lib/supabase/types.ts`
- Modify: `tests/progress-invoice-repository.test.ts`
- Modify: `tests/progress-invoice-actions.test.ts`
- Modify: `supabase/tests/progress_invoices_test.sql`

**Interfaces:**
- Produces:

```ts
export const createStandaloneProgressInvoiceFromJobberSchema = z.strictObject({
  selectedJobberInvoiceId: progressJobberExternalIdSchema,
  selectedJobberJobId: progressJobberExternalIdSchema.optional(),
  selectedJobberPropertyId: progressJobberExternalIdSchema.optional(),
  baseContractExGst: positiveMoneySchema,
  gstRate: z.literal('0.10'),
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
  correlationKey: z.string().uuid(),
})

export async function createStandaloneProgressInvoiceFromJobber(
  input: unknown,
): Promise<ActionResult<{ seriesId: string; version: number; importedPayments: number }>>
```

- Produces service RPC `create_progress_invoice_series_from_jobber(payload jsonb)`.
- The action supplies no `sourceType`, `quoteId`, Jobber account ID, Jobber amount, payment, or observation from the browser.

- [ ] **Step 1: Write failing validator and action tests**

Cover strict unknown-key rejection, missing invoice ID, missing/invalid contract amount, optional contact normalization, authorization before gateway work, full Save-time observation fetch, safe Jobber error mapping, service failure mapping, success revalidation, and exact result mapping.

```ts
const input = {
  selectedJobberInvoiceId: 'invoice-1',
  selectedJobberJobId: 'job-1',
  selectedJobberPropertyId: 'property-1',
  baseContractExGst: '17220.50',
  gstRate: '0.10',
  recipientName: 'Edited Builder',
  recipientCompany: 'Edited Company',
  recipientAddress: 'Edited billing address',
  recipientEmail: null,
  recipientPhone: null,
  recipientAbn: null,
  siteName: 'Edited site',
  siteAddress: 'Edited site address',
  defaultDescription: 'Progress painting works',
  reference: 'Jobber 2906',
  correlationKey: '32670000-2906-4000-8000-000000000001',
}

expect(await createStandaloneProgressInvoiceFromJobber(input)).toEqual({
  ok: true,
  data: { seriesId: 'series-1', version: 1, importedPayments: 3 },
})
```

- [ ] **Step 2: Write failing repository tests**

Add the new service command payload/result types and assert the service repository invokes exactly `create_progress_invoice_series_from_jobber` and parses:

```ts
{
  series_id: 'series-1',
  version: 1,
  snapshot_id: 'snapshot-1',
  imported_payments: 3,
}
```

Reject malformed, missing, negative, or non-integer result fields as `PROGRESS_RESPONSE_INVALID`.

- [ ] **Step 3: Write failing migration tests**

Static tests must assert the new migration contains:

```text
CREATE UNIQUE INDEX uq_progress_events_standalone_jobber_correlation
CREATE FUNCTION public.create_progress_invoice_series_from_jobber(payload JSONB)
PERFORM public.progress_validate_series_create_payload(series_payload)
PERFORM public.progress_validate_jobber_observation(observation)
public.progress_insert_jobber_snapshot
public.progress_apply_jobber_payments
public.progress_recalculate_series_read_model_as
public.progress_append_service_event
REVOKE ALL ... FROM PUBLIC, anon, authenticated
GRANT EXECUTE ... TO service_role
```

Assert no grant to `authenticated`, no raw Jobber JSON persistence, and no update/delete of existing series on duplicate identity.

- [ ] **Step 4: Run focused tests and confirm RED**

Run:

```powershell
npm.cmd run test:run -- tests/progress-invoice-validators.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-repository.test.ts tests/progress-invoice-standalone-import.test.ts tests/progress-invoice-standalone-import-migration.test.ts
```

Expected: FAIL because the schema, service command, action, and migration do not exist.

- [ ] **Step 5: Implement the strict input and service orchestration**

`standalone-import-service.ts` performs:

```ts
const observation = await fetchJobberInvoiceObservation({
  jobberInvoiceId: input.selectedJobberInvoiceId,
  ...(input.selectedJobberJobId ? { selectedJobberJobId: input.selectedJobberJobId } : {}),
  ...(input.selectedJobberPropertyId ? { selectedJobberPropertyId: input.selectedJobberPropertyId } : {}),
})
const normalized = buildProgressJobberObservationPayload(observation)
const repository = await createProgressInvoiceJobberPersistenceRepository()
return repository.call('create_progress_invoice_series_from_jobber', {
  actor_id: actorId,
  correlation_key: input.correlationKey,
  request_fingerprint: fingerprintCommand(input),
  series: mapEditableSeries(input),
  observation: normalized as unknown as Json,
})
```

`fingerprintCommand` hashes canonical editable input plus selected external IDs, not `fetched_at` or raw observation bytes. The action validates, authorizes, delegates, maps safe Jobber errors, and revalidates `/progress-invoices` and the new series path only on success.

- [ ] **Step 6: Implement the atomic migration**

The function payload is exactly:

```json
{
  "actor_id": "uuid",
  "correlation_key": "uuid",
  "request_fingerprint": "64 lowercase hex",
  "series": {
    "source_type": "jobber_invoice",
    "quote_id": null,
    "base_contract_ex_gst": "17220.50",
    "gst_rate": "0.10",
    "recipient_name": "Edited Builder",
    "recipient_company": null,
    "recipient_address": "Edited billing address",
    "recipient_email": null,
    "recipient_phone": null,
    "recipient_abn": null,
    "site_name": "Edited site",
    "site_address": "Edited site address",
    "default_description": "Progress painting works",
    "reference": "Jobber 2906",
    "correlation_key": "uuid"
  },
  "observation": {}
}
```

The PL/pgSQL command must:

1. validate exact outer keys and required types;
2. call `progress_require_service_actor`, `progress_validate_series_create_payload`, and `progress_validate_jobber_observation`;
3. require `source_type = 'jobber_invoice'` and null `quote_id`;
4. take an actor/command/correlation advisory lock;
5. return the prior event result for the same fingerprint or raise `IDEMPOTENCY_KEY_REUSED` for a different fingerprint;
6. take an account/invoice advisory lock and reject an existing non-void identity with `PROGRESS_JOBBER_ERROR`;
7. insert the series with Jobber identity and the user-edited snapshot fields;
8. insert the immutable snapshot and apply Jobber payments through existing helpers;
9. set the current snapshot/import timestamps without replacing the edited recipient/site fields;
10. recalculate the read model, append one safe event, and return `series_id`, `version`, `snapshot_id`, and `imported_payments`.

Every step runs in the single function transaction. Add a partial unique actor/command/correlation index for the new command and service-role-only grants.

- [ ] **Step 7: Add local pgTAP coverage**

Extend `supabase/tests/progress_invoices_test.sql` to assert:

- valid import creates one series, one snapshot, and expected payment identities/revisions;
- final series recipient/site fields equal the edited command, while snapshot client/address equal Jobber observation values;
- exact retry returns the same series with no extra rows;
- same key plus different editable input is rejected;
- duplicate non-void Jobber identity is rejected with no second series;
- invalid payment/observation rolls back the series; and
- `authenticated` cannot execute the service RPC directly.

- [ ] **Step 8: Update generated TypeScript function metadata**

Add this entry to `lib/supabase/types.ts` without changing unrelated generated definitions:

```ts
create_progress_invoice_series_from_jobber: {
  Args: { payload: Json }
  Returns: {
    imported_payments: number
    series_id: string
    snapshot_id: string
    version: number
  }[]
}
```

- [ ] **Step 9: Run focused tests and local database verification**

Run:

```powershell
npm.cmd run test:run -- tests/progress-invoice-validators.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-repository.test.ts tests/progress-invoice-standalone-import.test.ts tests/progress-invoice-standalone-import-migration.test.ts
npx.cmd supabase db reset --local
npx.cmd supabase test db --local supabase/tests/progress_invoices_test.sql
```

Expected: selected Vitest and pgTAP tests pass. If local Supabase is unavailable, repair/start Docker and rerun; do not substitute production for the local database test.

- [ ] **Step 10: Commit after task review**

```powershell
git add -- supabase/migrations/20260717082000_add_progress_invoice_standalone_jobber_import.sql lib/progress-invoices/standalone-import-service.ts lib/progress-invoices/validators.ts lib/progress-invoices/repository.ts lib/actions/progress-invoice-jobber.ts lib/supabase/types.ts tests/progress-invoice-standalone-import.test.ts tests/progress-invoice-standalone-import-migration.test.ts tests/progress-invoice-validators.test.ts tests/progress-invoice-repository.test.ts tests/progress-invoice-actions.test.ts supabase/tests/progress_invoices_test.sql
git commit -m "feat: atomically import standalone Jobber invoices"
```

### Task 3: Build the Standalone creation workspace

**Files:**
- Create: `lib/progress-invoices/standalone-import-contract.ts`
- Create: `components/progress-invoices/standalone-progress-invoice-form.tsx`
- Create: `tests/progress-invoice-standalone-ui.test.tsx`
- Modify: `app/(app)/progress-invoices/new/page.tsx`
- Modify: `components/progress-invoices/progress-invoice-dashboard.tsx`
- Modify: `app/styles/components.css`
- Modify: `tests/progress-invoice-dashboard-ui.test.tsx`

**Interfaces:**
- Produces strict browser parsers for search and preview responses.
- Produces an interactive client form that calls only Progress Invoice routes and `createStandaloneProgressInvoiceFromJobber`.
- Consumes Task 1 preview DTO and Task 2 action.

- [ ] **Step 1: Write failing contract tests**

Test valid and malformed search/preview payload parsing, AU address formatting, default editable prefill, and the rule that `baseContractExGst` stays empty after preview.

```ts
const draft = buildStandaloneDraft(preview)
expect(draft).toMatchObject({
  recipientName: 'Example Builder',
  recipientAddress: '1 Billing Street, Sydney NSW 2000, Australia',
  siteAddress: '4 Curra Close, Frenchs Forest NSW 2086, Australia',
  baseContractExGst: '',
})
```

- [ ] **Step 2: Write failing static-render UI tests**

Assert the new page contains accessible labels and copy for:

```text
Jobber Invoice Number
Fetch invoice
Base contract Ex GST
Jobber amounts are for comparison only
Recipient
Site
Create Progress Invoice series
```

Assert the old read-only and next-step placeholder copy is absent. Assert no button or copy contains `Refresh Jobber`, `Sync Jobber`, or `Auto sync`.

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```powershell
npm.cmd run test:run -- tests/progress-invoice-standalone-ui.test.tsx tests/progress-invoice-dashboard-ui.test.tsx
```

Expected: FAIL because the form and response contract do not exist.

- [ ] **Step 4: Implement the browser response contract**

Use strict Zod discriminated response schemas. Export:

```ts
export function parseJobberInvoiceSearchResponse(value: unknown): JobberInvoiceSearchResponse
export function parseJobberInvoicePreviewResponse(value: unknown): JobberInvoicePreviewResponse
export function formatJobberAddress(address: JobberAddressDto | null): string
export function buildStandaloneDraft(preview: JobberInvoicePreviewDto): StandaloneEditableDraft
```

`buildStandaloneDraft` chooses the single/primary contact only when unambiguous, keeps billing and site addresses separate, uses the selected Property address for site, suggests `Jobber <invoiceNumber>` as reference, and always sets `baseContractExGst: ''`.

- [ ] **Step 5: Implement the client form**

The form state is explicit:

```ts
type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'ready'; candidates: readonly JobberInvoiceCandidateDto[] }
  | { status: 'empty' }
  | { status: 'error'; message: string }

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; preview: JobberInvoicePreviewDto }
  | { status: 'error'; message: string }
```

Search `GET /api/jobber/progress-invoices/invoices/search?term=${encodeURIComponent(term)}`. Render every candidate as an explicit selection button. Preview the selected invoice, render Job/Property selects when required, and re-fetch preview after a selector changes. Do not send payment or amount fields to the Save action.

Render editable recipient, company, billing address, email, phone, ABN, site name, site address, description, reference, and required base contract Ex GST fields. Render Jobber subtotal/GST/total/balance/status in a separate read-only comparison panel.

Generate one `crypto.randomUUID()` correlation key per new Save attempt and retain it across transient retries until success or the user changes the selected invoice. On success use `router.push('/progress-invoices')` and `router.refresh()`.

- [ ] **Step 6: Replace the read-only page and adjust dashboard wording**

Keep the Existing PBC Quote card/link. Replace the Standalone placeholder with the form. Change dashboard presentation strings only:

```text
Jobber synced ...       -> Imported from Jobber ...
Jobber not synced       -> Jobber not imported
Jobber sync needs attention -> Jobber import needs attention
```

Do not rename database columns or add a refresh control.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run the command from Step 3. Expected: all selected tests pass with no React render warning.

- [ ] **Step 8: Run authenticated browser QA**

At `http://localhost:3000/progress-invoices/new`, verify at 390px and 1440px:

1. search invoice `2906`;
2. select the exact candidate;
3. load client/site/amount comparison;
4. verify base contract remains blank;
5. enter `17220.50` and edit at least one recipient/site field;
6. verify no Refresh/Sync control or follow-up request appears; and
7. submit only after Task 4 applies the new RPC to the target database.

Record console and network errors; fix any app error before proceeding.

- [ ] **Step 9: Commit after task review**

```powershell
git add -- lib/progress-invoices/standalone-import-contract.ts components/progress-invoices/standalone-progress-invoice-form.tsx 'app/(app)/progress-invoices/new/page.tsx' components/progress-invoices/progress-invoice-dashboard.tsx app/styles/components.css tests/progress-invoice-standalone-ui.test.tsx tests/progress-invoice-dashboard-ui.test.tsx
git commit -m "feat: add standalone progress invoice workspace"
```

### Task 4: Apply the database change and verify invoice 2906 end to end

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/plans/2026-07-17-progress-invoice-standalone-import.md`
- Remove: `tests/live-progress-invoice-jobber-smoke.test.ts`
- Remove generated inspection artifacts under `.codex/tmp/progress-sample-inspect/`

**Interfaces:**
- Consumes the verified migration, action, and UI.
- Produces database and browser evidence without committing customer data.

- [ ] **Step 1: Audit the interrupted sample insertion before any write**

Read the target database for the fixed create correlation key `32670000-2906-4000-8000-000000000001` across series, events, adjustments, Jobber snapshots, payments, and payment revisions.

```text
0 matching series: retry the fixed command
1 matching series: verify its fingerprint and continue only missing idempotent steps
2 or more matching series: stop and investigate; do not link or delete
event without referenced row: stop as an integrity fault
same correlation with a different fingerprint: stop
```

- [ ] **Step 2: Apply only the new verified migration**

Because the remote project contains legacy migration-history drift, do not run an unrestricted `supabase db push`. Apply the exact contents of `20260717082000_add_progress_invoice_standalone_jobber_import.sql` through the previously verified targeted Supabase Management API transaction and record the exact version/name/statements in migration history atomically. Re-query the function definition, grants, and migration row afterward.

- [ ] **Step 3: Create or reuse the sample series through the official one-time import path**

Use the authenticated app flow with:

```text
Jobber invoice: 2906
Base contract Ex GST: 17,220.50
Source type: jobber_invoice
GST: 10%
```

Preserve user-edited recipient/site fields as the series snapshot. Verify the immutable observation contains Jobber subtotal/GST/total `39,507.08 / 3,950.71 / 43,457.79` and three normalized receipts dated `2025-12-22`, `2026-03-09`, and `2026-07-08` totaling `43,457.79`. Do not treat invoice-header `paymentsTotal=4,914.08` as the cumulative receipt total.

- [ ] **Step 4: Complete the idempotent sample adjustments if missing**

Audit and create/approve only missing Variation rows so the approved increments are:

```text
2025-12-16  19,714.68
2026-02-24   1,997.86
2026-06-30     574.04
Total        22,286.58
```

Use the fixed correlation keys already assigned by the interrupted script. Re-running the same operation must return the same row; do not create replacements for an already completed step.

- [ ] **Step 5: Verify saved financial separation**

Assert:

```text
base contract Ex GST       17,220.50
approved Variations        22,286.58
adjusted contract Ex GST   39,507.08
GST                         3,950.71
adjusted contract Inc GST  43,457.79
actual receipts            43,457.79
claimed amount                  0.00 until claims are created
```

The sample's prior Progress Invoice claim amounts remain conceptually separate from the receipt ledger even when the numbers match.

- [ ] **Step 6: Remove temporary live-test and inspection artifacts safely**

Remove `tests/live-progress-invoice-jobber-smoke.test.ts`. Verify `.codex/tmp/progress-sample-inspect/node_modules` is a link/junction inside the workspace and remove the link itself, not its external target. Remove the generated script and renders only after resolving every target path inside `.codex/tmp/progress-sample-inspect`.

- [ ] **Step 7: Run non-regression and full verification**

Run:

```powershell
npm.cmd run test:run -- tests/jobber.test.ts tests/jobber-invoice-contract.test.ts tests/jobber-pagination.test.ts tests/jobber-invoice-client.test.ts tests/jobber-invoice-gateway.test.ts tests/jobber-progress-invoice-search-route.test.ts tests/jobber-progress-invoice-routes.test.ts tests/jobber-write-client.test.ts tests/jobber-readonly-regression.test.ts tests/jobber-route-security.test.ts tests/jobber-tokens.test.ts tests/jobber-quote-route-refresh.test.ts tests/jobber-quote-line-payload.test.ts tests/progress-invoice-standalone-import.test.ts tests/progress-invoice-standalone-ui.test.tsx tests/progress-invoice-dashboard-ui.test.tsx
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:run
npm.cmd run build
git diff --check
```

Expected: every command exits 0, no live network smoke test runs in the full suite, and the production build contains `/progress-invoices/new`.

- [ ] **Step 8: Run final independent review**

Dispatch one `gpt-5.6-sol` high reviewer over the complete feature diff. Resolve every Critical or Important finding, rerun its covering tests, rerun the reviewer, then rerun the full commands from Step 7.

- [ ] **Step 9: Record evidence and commit**

Update `PROGRESS.md` with the migration version, focused/full test counts, browser viewports, imported-payment count, sample financial reconciliation, and any remaining Claim/document feature gaps. Check the completed plan boxes based on evidence.

```powershell
git add -- PROGRESS.md docs/superpowers/plans/2026-07-17-progress-invoice-standalone-import.md
git add -u -- tests/live-progress-invoice-jobber-smoke.test.ts
git commit -m "test: verify standalone progress invoice import"
```

## Completion Definition

This increment is complete when an authorized user can search and explicitly select Jobber invoice 2906, edit the local recipient/site snapshot, enter base contract `17,220.50`, save exactly one atomic local series, observe three imported Jobber receipts separately from claims, and return to the Progress Invoice dashboard without any ongoing Jobber Refresh/Sync UI. All focused, database, Quote/Jobber regression, full test, typecheck, lint, build, browser, and independent-review gates must pass.
