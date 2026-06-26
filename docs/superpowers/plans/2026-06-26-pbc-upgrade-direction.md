# 2026-06-26 PBC Upgrade Direction

## Goal

Document the revised upgrade direction before code implementation.

User decisions:
- No `ADMIN_EMAILS` admin gate or separate role split. The app is used by two admin users.
- No material actual-cost/RRP split. Material quote calculations use consumer price.
- No extra pricing-info/scope-details panel in this upgrade.
- Do not change the existing five formulas or GST calculation.

## Included Scope

### P0 Roof Formula Selection Persistence

- Add planned DB columns: `quotes.roof_selected_min`, `quotes.roof_selected_max`.
- Update quote create/update/get flows to persist and return Roof formula selections.
- Update quote detail to include `roof` in area-scope display.
- Update draft restore, dev data, and regression tests.

### P1 Local Draft Privacy

- Do not store Jobber expense, financial summary, or full raw fetch responses in `localStorage` draft.
- Add saved-at metadata and 7-day expiry.
- Add a clear local drafts action.

### P1 Jobber Sync Operations

- Add sync preview before save: PBC subtotal, Jobber public line total, and difference.
- Add retry action on quote detail when `jobber_sync_status = failed`.

### P2 Duplicate Quote

- Duplicate a prior quote into a new draft/quote.
- Do not copy `jobber_quote_id`.
- Refresh material prices from current consumer-price catalog by default.

### Operations

- Prefer Supabase Pro/PITR for backup.
- Use cron backup only if restore verification is included.

## Explicitly Out Of Scope

- `ADMIN_EMAILS` or separate admin role model.
- Material actual-cost/RRP separation.
- Scope Details or quote-level pricing metadata expansion.
- Discount, fee, deposit, warranty, terms, or contingency formula changes.
- Jobber option line item auto-mapping until the Jobber API shape is confirmed.
- New external dependencies without user approval.

## Test Plan

- Roof persistence: quote create/update/get, detail UI, draft restore, dev-data regression.
- Draft privacy: local draft sanitization, 7-day expiry, clear-drafts behavior.
- Jobber operations: sync preview calculation, failed sync retry action.
- Duplicate quote: no Jobber quote id copy, current consumer price refresh.
- Full verification after code work: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test:run`, `npm.cmd run build`, `npm.cmd audit --audit-level=high`.

## Implementation Execution Plan

This section is the code execution plan to follow before implementation. Execute tasks in order and do not move to the next task until targeted tests for the current task pass.

### 1. Roof Formula Selection Persistence

Files:
- `supabase/migrations/0019_add_roof_formula_selections.sql`
- `lib/supabase/types.ts`
- `lib/dev-data.ts`
- `lib/actions/quotes.ts`
- `components/quote-form/quote-form.tsx`
- `components/quote-detail/quote-detail-view.tsx`
- `tests/quote-actions.test.ts`
- `tests/dev-data.test.ts`
- `tests/quote-ui.test.tsx`

Steps:
- Add nullable `quotes.roof_selected_min` and `quotes.roof_selected_max` with 1..5 checks, backfill from legacy `selected_min`/`selected_max`, then set both columns `NOT NULL`.
- Extend `QuoteRecord` and Supabase manual types with `roofSelectedMin`/`roofSelectedMax`.
- Save and update Roof selections from `areaFormulaSelections.roof`.
- Read Roof selections in `toQuoteRecord`, dev data, edit form initialization, and detail area breakdown.
- Update detail formula scope selection to include `roof` when roof rows or subtotal exist.
- Add/update regression tests for create/get/update/dev-data/detail initialization.

### 2. Local Draft Privacy, Expiry, And Clear Action

Files:
- `components/quote-form/quote-draft.ts`
- `components/quote-form/quote-form.tsx`
- `tests/quote-draft.test.ts`
- `tests/quote-ui.test.tsx`

Steps:
- Introduce draft expiry constant of 7 days.
- Parse drafts as invalid when `updatedAt` is missing, invalid, or older than 7 days.
- Sanitize `jobberQuoteDraft` before localStorage write so draft storage keeps only quote identity/customer/basic public line data needed to restore the form, not job expenses, financial summary, or raw fetch-only financial fields.
- Restore sanitized Jobber drafts without breaking Product / Service line editor state.
- Add a visible clear local drafts action in the quote form draft alert/control area and remove matching `pbc-quote-draft:*` keys.
- Add tests for sanitization, expiry, and clear action behavior.

### 3. Jobber Sync Preview And Failed-Sync Retry

Files:
- `components/quote-form/quote-save-payload.ts`
- `components/quote-form/quote-form.tsx`
- `components/quote-detail/quote-detail-view.tsx`
- `lib/actions/quotes.ts`
- `tests/quote-ui.test.tsx`
- `tests/quote-actions.test.ts`

Steps:
- Add a pure helper that computes PBC subtotal, Jobber public line total, and difference using Decimal.
- Display the preview before save in the quote form near the Product / Service or final summary area.
- Add a server action that retries write-back for a saved quote using persisted `jobber_quote_lines`, `jobber_quote_id`, and `final_total` without changing local quote content.
- Show failed sync status and retry button on quote detail when `jobberSyncStatus === 'failed'`.
- Keep retry limited to existing controlled write-back path and do not introduce new Jobber mutation shapes.

### 4. Duplicate Quote

Files:
- `lib/actions/quotes.ts`
- `components/quote-list/*` or `components/quote-detail/quote-detail-view.tsx`
- `app/(app)/quotes/[id]/duplicate/page.tsx` or an equivalent existing route pattern
- `components/quote-form/quote-record-mappers.ts`
- `tests/quote-actions.test.ts`
- `tests/quote-ui.test.tsx`

Steps:
- Add a duplicate flow that loads an existing quote and opens a new quote draft/form.
- Do not copy `jobber_quote_id`, `jobber_snapshot`, `jobber_line_item_id`, sync status, memos that should not be copied, or price revision history.
- Refresh material prices from the current consumer-price product catalog when `product_id` still exists; keep saved snapshot only for custom/deleted products.
- Save duplicate as a new quote through existing `createQuote` validation.
- Add list/detail entry point and regression tests.

### 5. Verification And Documentation

Files:
- `PROGRESS.md`
- any docs touched by code behavior

Steps:
- Run targeted tests after each task.
- Run final verification: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test:run`, `npm.cmd run build`, `npm.cmd audit --audit-level=high`, and `git diff --check`.
- Update `PROGRESS.md` with implemented items, verification results, and any remaining blockers.

## Implementation Result

Completed on 2026-06-26:
- Roof selections are persisted with `roof_selected_min` and `roof_selected_max`, restored into edit/detail/dev-data flows, and covered by migration/static/action/UI tests.
- Local quote drafts are sanitized before localStorage write, expire after 7 days, reject future/invalid timestamps, and can be cleared from the quote form.
- Jobber sync preview shows PBC subtotal, Jobber public line total, and difference. Failed syncs can be retried from quote detail, and retry returns failure when Jobber/status update fails.
- Duplicate quote uses a POST server-action form, not a GET side-effect route. It creates a new quote without Jobber quote identity/snapshot/sync status/line item IDs and refreshes material prices from current consumer/RRP catalog rows.
- Backup operation remains advisory only: Supabase Pro/PITR preferred; cron backup only with restore verification.

Final verification:
- `npm.cmd run typecheck` passed.
- `npm.cmd run lint` passed.
- `npm.cmd run test:run` passed: 50 files passed / 1 skipped, 380 tests passed / 2 skipped.
- `npm.cmd run build` passed.
- `npm.cmd audit --audit-level=high` passed with 0 vulnerabilities.
- `git diff --check` passed for implementation files with LF/CRLF warnings only.
