# Quote Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add separate, calculated optional add-ons to quotes without changing the main quote final total.

**Architecture:** Store options in `quote_options` and `quote_option_items`, map them into `QuoteRecord.options`, and calculate each option with the same calculator functions as the main quote. The quote form owns option state and renders a left-side option editor plus a right-side optional totals summary.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Supabase Postgres migrations, Zod, decimal.js, Vitest.

---

### Task 1: Data Model And Validation

**Files:**
- Create: `supabase/migrations/0009_add_quote_options.sql`
- Modify: `lib/supabase/types.ts`
- Modify: `lib/validators.ts`
- Modify: `lib/dev-data.ts`
- Test: `tests/quote-options-actions.test.ts`

- [ ] **Step 1: Write failing tests for creating and reading quote options**

Add tests that call `createQuote` with one option and assert `getQuote` returns the option title, option total, and option item while the main `finalTotal` remains the main quote amount.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd test -- tests/quote-options-actions.test.ts --run`

- [ ] **Step 3: Add option schemas and record types**

Extend `quoteSchema` with optional `options`, add `QuoteOptionRecord` and `QuoteOptionItemRecord`, and include `options` on `QuoteRecord`.

- [ ] **Step 4: Add migration and manual Supabase types**

Create `quote_options` and `quote_option_items`, enable RLS, and add authenticated-only policies consistent with the existing v1.0 policy.

- [ ] **Step 5: Implement dev store option persistence**

Calculate option totals with the same formula helpers and attach saved options to dev quote records.

- [ ] **Step 6: Run focused tests and verify green**

Run: `npm.cmd test -- tests/quote-options-actions.test.ts --run`

### Task 2: Server Actions Persistence

**Files:**
- Modify: `lib/actions/quotes.ts`
- Test: `tests/quote-actions.test.ts`

- [ ] **Step 1: Add failing mocked Supabase tests for option inserts and reads**

Assert `createQuote` inserts option rows after quote creation and `getQuote` maps nested option rows.

- [ ] **Step 2: Run the action tests and verify they fail for missing option persistence**

Run: `npm.cmd test -- tests/quote-actions.test.ts --run`

- [ ] **Step 3: Implement DB mapping**

Update `toQuoteRecord`, `createQuote`, `updateQuote`, `searchQuotes`, and `getQuote` to select, insert, replace, and map options and option items.

- [ ] **Step 4: Run action tests and verify green**

Run: `npm.cmd test -- tests/quote-actions.test.ts --run`

### Task 3: Quote Form UI

**Files:**
- Modify: `components/quote-form/types.ts`
- Create: `components/quote-form/quote-options-panel.tsx`
- Create: `components/quote-form/option-totals-summary.tsx`
- Modify: `components/quote-form/quote-form.tsx`
- Modify: `components/quote-detail/quote-detail-view.tsx`
- Test: `tests/quote-ui.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Add tests that render an option total separately and assert it is not merged into the main final total.

- [ ] **Step 2: Run UI tests and verify they fail**

Run: `npm.cmd test -- tests/quote-ui.test.tsx --run`

- [ ] **Step 3: Implement option UI components**

Add an options panel below main materials and an optional totals block below the main final summary.

- [ ] **Step 4: Wire option payloads into create/update**

Map option state into the server action payload and map saved option records back into edit state.

- [ ] **Step 5: Run UI tests and verify green**

Run: `npm.cmd test -- tests/quote-ui.test.tsx --run`

### Task 4: Full Verification

**Files:**
- All changed files

- [ ] **Step 1: Run typecheck**

Run: `npm.cmd run typecheck`

- [ ] **Step 2: Run all tests**

Run: `npm.cmd test -- --run`

- [ ] **Step 3: Run lint**

Run: `npm.cmd run lint`

- [ ] **Step 4: Run production build**

Run: `npm.cmd run build`

- [ ] **Step 5: Confirm production DB is untouched**

Only local migration files should be changed. Do not apply migrations to the production Supabase project in this task.
