# Jobber Quote Write-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let PBC edit Jobber-style Product / Service line items inside `/quotes/new`, save full internal quote data locally, and write approved public line items back to the same Jobber quote without exposing material costs.

**Architecture:** Keep local quote/material calculation as the source of internal pricing truth. Add a separate Jobber public line item model, a narrow Jobber write client with mutation allowlisting, and a sync status layer so local saves survive external API failures.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase Postgres/RLS, Jobber GraphQL, Zod, decimal.js, Vitest.

---

## File Map

- Modify `docs/DECISIONS.md`: change Jobber model from permanent read-only to controlled quote write-back.
- Modify `docs/ARCHITECTURE.md`: update data flow, external API boundary, and Jobber failure handling.
- Modify `docs/SECURITY.md`: add write-scope and mutation allowlist policy.
- Modify `docs/DB-SCHEMA.md`: document planned `jobber_quote_lines` and quote sync fields.
- Modify `docs/UI-QUOTE-FORM.md`: document Jobber Product / Service editor.
- Create `supabase/migrations/0010_add_jobber_quote_lines.sql`: persist public Jobber line items and sync status.
- Modify `lib/validators.ts`: add `jobberQuoteLineSchema` and `jobberSaveMode`.
- Create `lib/jobber/quote-line-payload.ts`: pure mapper from local public Jobber lines to Jobber mutation input.
- Modify `lib/jobber/client.ts`: split read query execution from approved write execution.
- Modify `lib/jobber/config.ts`: replace read-only scope assertion with narrow write-scope policy.
- Create `app/api/jobber/products/route.ts`: search Jobber ProductOrService catalog.
- Create `app/api/jobber/quote/[quoteId]/sync/route.ts`: external Jobber write-back Route Handler, matching existing Jobber API boundary. Deferred; current implementation syncs from `lib/actions/quotes.ts` through the centralized Jobber client.
- Modify `lib/actions/quotes.ts`: save `jobber_quote_lines`, save sync status, preserve local save on Jobber failure.
- Create `components/quote-form/jobber-product-service-editor.tsx`: Jobber-like editor with Add Line Item and Add Text.
- Modify `components/quote-form/quote-form.tsx`: own editor state, draft persistence, save payload.
- Modify `components/quote-form/quote-draft.ts`: persist editor state locally.
- Modify `components/quote-form/types.ts`: add `JobberQuoteLineItemDraft`.
- Add tests:
  - `tests/jobber-quote-line-payload.test.ts`
  - `tests/jobber-write-client.test.ts`
  - `tests/jobber-products-route.test.ts`
  - `tests/quote-actions-jobber-lines.test.ts`
  - update `tests/jobber-readonly-regression.test.ts`
  - update `tests/jobber-route-security.test.ts`

---

## Task 0: Confirm Jobber GraphQL Schema

- [x] Confirm Jobber GraphQL schema through introspection against the connected PBC app token.
- [ ] Confirm ProductOrService query name, searchable fields, and pagination shape.
- [x] Confirm quote line item mutation names and replacement behavior: create new line items first, then delete old line items because Jobber rejects deleting the final remaining line item.
- [x] Confirm public text blocks through `quoteCreateTextLineItems`.
- [x] Confirm tax input behavior for current flow. Default implementation sends GST-exclusive total as taxable so Jobber applies GST.
- [x] Record the confirmed mutation/query names in `lib/jobber/client.ts` through the approved mutation constants.

Expected result: exact Jobber schema names are known before code is written.

---

## Task 1: Write Payload Builder Tests First

**Files:**
- Create `tests/jobber-quote-line-payload.test.ts`
- Create `lib/jobber/quote-line-payload.ts`

- [x] Add failing tests for `priced_line_items`.
- [x] Add a regression assertion that serialized payload does not contain internal material values.
- [x] Add failing tests for `description_total`.
- [x] Implement `buildJobberQuoteLinePayload(input)` using `decimal.js`.

Required assertions:

```ts
expect(JSON.stringify(payload)).not.toContain('actualPrice')
expect(JSON.stringify(payload)).not.toContain('marketPrice')
expect(JSON.stringify(payload)).not.toContain('Dulux material cost')
expect(payload.lineItems.at(-1)).toMatchObject({
  name: 'Total',
  quantity: 1,
  unitPrice: 3145.30,
  taxable: true,
})
```

Acceptance: `npm.cmd run test:run -- tests/jobber-quote-line-payload.test.ts` passes. Completed 2026-05-19.

---

## Task 2: Add Database Persistence

**Files:**
- Create `supabase/migrations/0010_add_jobber_quote_lines.sql`
- Modify `docs/DB-SCHEMA.md`
- Modify `tests/rls.test.ts`

- [x] Write migration for `jobber_quote_lines`.
- [x] Add quote sync columns to `quotes`.
- [x] Enable RLS on `jobber_quote_lines`.
- [x] Add authenticated ALL policy matching existing app table policy.
- [x] Update `tests/rls.test.ts` table list to include `jobber_quote_lines`.

Acceptance: RLS static test includes the new table and migration order. Completed 2026-05-19.

---

## Task 3: Extend Validators And Types

**Files:**
- Modify `lib/validators.ts`
- Modify `components/quote-form/types.ts`
- Modify `components/quote-form/quote-draft.ts`

- [x] Add `jobberSaveModeSchema = z.enum(['priced_line_items','description_total'])`.
- [x] Add `jobberQuoteLineSchema` with `kind`, `name`, `description`, `quantity`, `unitPrice`, `taxable`, `clientVisible`, `linkedProductOrServiceId`, and `position`.
- [x] Add `jobberQuoteLines` and `jobberSaveMode` to `quoteSchema`.
- [x] Add TypeScript UI draft type matching the schema.
- [x] Update local draft parse/restore so Jobber line items survive refresh.

Acceptance: typecheck passes and quote draft tests are updated. Completed 2026-05-19.

---

## Task 4: Replace Read-Only Guard With Narrow Write Guard

**Files:**
- Modify `lib/jobber/client.ts`
- Modify `lib/jobber/config.ts`
- Modify `tests/jobber-readonly-regression.test.ts`
- Modify `tests/jobber-route-security.test.ts`
- Create `tests/jobber-write-client.test.ts`

- [x] Keep query execution centralized in `lib/jobber/client.ts`.
- [x] Add an approved write function for the confirmed quote line item mutations only.
- [x] Reject raw mutation strings outside the approved function.
- [x] Update scope validation to allow only narrow quote write scope and existing read scopes.
- [x] Reject broad `manage`, `delete`, unrelated write scopes.
- [ ] Rename read-only regression tests to narrow-write regression tests.

Acceptance: tests prove only approved quote line item write-back is possible. Completed 2026-05-19 for quote line replacement.

---

## Task 5: Add Jobber Product / Service Search

**Files:**
- Create `app/api/jobber/products/route.ts`
- Modify `lib/jobber/client.ts`
- Add `tests/jobber-products-route.test.ts`

- [ ] Add a ProductOrService search query using the schema confirmed in Task 0.
- [ ] Return normalized records with `id`, `name`, `description`, `defaultUnitCost`, `taxable`, and `category`.
- [ ] Reuse existing Jobber token refresh behavior.
- [ ] Limit results to 20.

Acceptance: route test covers success, unauthenticated user, and Jobber API error.

---

## Task 6: Build Jobber Product / Service Editor UI

**Files:**
- Create `components/quote-form/jobber-product-service-editor.tsx`
- Modify `components/quote-form/quote-form.tsx`
- Modify `components/quote-form/types.ts`

- [x] Render a `Product / Service` section below customer info and above internal materials.
- [x] Add segmented save mode control: `Priced Line Items` and `Description + Total`.
- [x] Add `Add Line Item` button.
- [x] Add `Add Text` button.
- [x] Add editable row fields matching the design doc.
- [ ] Use Jobber product search when linking a line item.
- [x] Do not include Build Option Set, image upload, or notes UI.

Acceptance: UI tests or render tests verify both line kinds and mode labels are present. Partially completed 2026-05-19; ProductOrService search remains blocked by Task 0 schema confirmation.

---

## Task 7: Save Local Quote And Jobber Lines

**Files:**
- Modify `lib/actions/quotes.ts`
- Modify `lib/quote-query-shape.ts`
- Modify `lib/dev-data.ts`
- Add `tests/quote-actions-jobber-lines.test.ts`

- [x] Persist `jobber_quote_lines` with the quote.
- [x] Read quote details with saved Jobber lines.
- [x] On update, replace saved Jobber lines with the new ordered set.
- [x] Store `jobber_save_mode`.
- [x] Keep material persistence unchanged.

Acceptance: quote create/update tests prove material rows and Jobber public lines are stored separately. Completed 2026-05-19 for current action flow; full DB transaction wrapping remains a future hardening item if failures between child inserts become a practical issue.

---

## Task 8: Implement Jobber Write-Back And Retry State

**Files:**
- Create `app/api/jobber/quote/[quoteId]/sync/route.ts`
- Modify `lib/actions/quotes.ts`
- Modify `components/quote-form/quote-form.tsx`
- Add tests for partial failure.

- [x] After local save succeeds, call approved Jobber write-back if `jobberQuoteId` exists and Jobber is connected.
- [x] On Jobber success, set `jobber_sync_status = 'synced'`, `jobber_last_synced_at = now()`, clear error.
- [x] On Jobber failure, keep local quote saved and set `jobber_sync_status = 'failed'` with error.
- [ ] Show Retry button for failed sync.

Acceptance: failing Jobber mock does not roll back local quote save. Completed 2026-05-19 for save-time automatic sync; retry UI remains pending.

---

## Task 9: Verification

- [x] Run `npm.cmd run typecheck`.
- [x] Run `npm.cmd run lint`.
- [x] Run `npm.cmd run test:run`.
- [x] Run `npm.cmd run build`.
- [ ] Browser QA on `http://localhost:3000/quotes/new`:
  - fetch Jobber quote
  - add priced line item
  - add text line
  - save local quote
  - verify Jobber quote receives public Product / Service line items only
  - verify material prices remain only in our app
- [x] Verify connected Jobber quote #3535 receives public Product / Service line items only.
- [x] Update `PROGRESS.md` with final test evidence after implementation.

Acceptance: all automated checks pass and one connected Jobber test quote is manually verified.
