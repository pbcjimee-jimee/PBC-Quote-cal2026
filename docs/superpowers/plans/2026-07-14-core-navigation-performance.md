# Core Navigation Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make authenticated navigation respond immediately and reduce real ready time without changing Jobber behavior.

**Architecture:** Replace viewport prefetch with shared intent-triggered links, defer Settings collections until their tab is activated, and seed quote detail profiles from the authenticated user. Existing Server Actions, route skeletons, and Jobber boundaries remain in place.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Vitest, Supabase

## Global Constraints

- No new dependency, database migration, Vercel environment/domain change, or production DB action.
- Keep Jobber quote fetch, refresh, snapshot, and write-back paths unchanged.
- Preserve TypeScript strict mode and avoid `any`.
- Use test-first RED→GREEN cycles for every behavior change.
- Complete with `npm.cmd run verify` and browser before/after measurements.

---

### Task 1: Intent-based navigation

**Files:**
- Create: `components/navigation/intent-link.tsx`
- Modify: `components/layout/app-header.tsx`
- Modify: `components/quote-list/quote-card.tsx`
- Modify: `app/globals.css`
- Create: `tests/intent-link.test.tsx`
- Modify: `tests/app-header-ui.test.tsx`
- Modify: `tests/quote-ui.test.tsx`

**Interfaces:**
- Produces: `IntentLink(props: ComponentProps<typeof Link>)`
- Consumes: Next.js `useRouter().prefetch`, `useLinkStatus`, existing Link props

- [x] **Step 1: Write failing navigation tests**

Assert that `IntentLink` renders `prefetch={false}`, repeated pointer/focus intent calls `router.prefetch(href)` only once, and header/overview markup contains the intent-link marker.

- [x] **Step 2: Run tests and confirm RED**

Run: `npm.cmd run test:run -- tests/intent-link.test.tsx tests/app-header-ui.test.tsx tests/quote-ui.test.tsx`

Expected: FAIL because `IntentLink` and its marker do not exist.

- [x] **Step 3: Implement the minimal intent link**

Implement a client component that sets `prefetch={false}`, preserves caller event handlers, manually prefetches string destinations once on pointer enter/focus/touch start, and renders pending status from `useLinkStatus()`.

- [x] **Step 4: Apply the component**

Replace authenticated navigation Links in AppHeader and quote overview/card actions. Add a fixed top progress style that does not affect layout.

- [x] **Step 5: Run focused tests and confirm GREEN**

Run: `npm.cmd run test:run -- tests/intent-link.test.tsx tests/app-header-ui.test.tsx tests/quote-ui.test.tsx`

Expected: all selected tests pass with no warnings.

### Task 2: Lazy Settings collections

**Files:**
- Modify: `app/(app)/settings/page.tsx`
- Modify: `components/settings/settings-form.tsx`
- Modify: `tests/settings-ui.test.tsx`
- Create: `tests/settings-page-performance.test.tsx`

**Interfaces:**
- Consumes: `listProducts({ limit: 200 })`, `listProductServices({ limit: 300 })`, `listQuoteLineTemplates()`, `listAreas()`
- Produces: optional initial collection props and tab-scoped `ensureTabData(tab)` behavior

- [x] **Step 1: Write failing server-page test**

Render `SettingsPage` with mocked actions and assert that only `getPricingSettings()` is called before the Labour Rates UI is returned.

- [x] **Step 2: Write failing tab-loading tests**

Mount `SettingsForm` without initial collections. Click Material and assert only products load; click it again and assert no duplicate call. Cover Template parallel requirements and failed-load Retry.

- [x] **Step 3: Run tests and confirm RED**

Run: `npm.cmd run test:run -- tests/settings-page-performance.test.tsx tests/settings-ui.test.tsx`

Expected: FAIL because Settings currently loads every collection on the server and tabs do not load data.

- [x] **Step 4: Reduce the Settings server page**

Keep the existing safe normalization for pricing settings only. Pass no collection props so `SettingsForm` can distinguish an unloaded resource from a loaded empty array.

- [x] **Step 5: Implement resource state and tab loading**

Track loaded and in-flight resource keys with refs; track loading and error keys in state. Load each tab's exact dependencies, keep successful arrays, and make retry skip already-loaded dependencies.

- [x] **Step 6: Add loading/error UI and tab semantics**

Activate tabs synchronously, render a compact status skeleton while required data loads, render a local alert and Retry on failure, and add `role="tablist"`, `role="tab"`, and `aria-selected`.

- [x] **Step 7: Run focused tests and confirm GREEN**

Run: `npm.cmd run test:run -- tests/settings-page-performance.test.tsx tests/settings-ui.test.tsx`

Expected: all selected tests pass and no inactive collection action is called on initial page render.

### Task 3: Reuse the current user profile on quote detail

**Files:**
- Modify: `lib/actions/quotes.ts`
- Modify: `tests/quote-actions-supabase.test.ts`

**Interfaces:**
- Consumes: `getAuthUserProfile`, `getAuthUserProfilesById`, `allowedUser.user`
- Produces: a profile map seeded with the authenticated user and admin lookups only for missing IDs

- [x] **Step 1: Write failing current-user test**

Return current-user metadata from `requireAllowedUser`, load a quote created/revised by that ID, assert displayed names use that metadata, and assert `createServiceClient` is never called.

- [x] **Step 2: Write different-user coverage**

Add a revision by another user and assert the service-role profile lookup still occurs for that missing ID.

- [x] **Step 3: Run test and confirm RED**

Run: `npm.cmd run test:run -- tests/quote-actions-supabase.test.ts`

Expected: current-user test fails because `getQuote` still calls the Auth Admin path.

- [x] **Step 4: Seed and merge profiles**

Build the current profile from allowed-user metadata, filter it from lookup IDs, fetch remaining profiles, and merge them into the map before `toQuoteRecord`.

- [x] **Step 5: Run test and confirm GREEN**

Run: `npm.cmd run test:run -- tests/quote-actions-supabase.test.ts`

Expected: all quote action tests pass, including the different-user fallback.

### Task 4: Jobber regression and full verification

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/superpowers/plans/2026-07-14-core-navigation-performance.md`

**Interfaces:**
- Consumes: existing Jobber route/UI/write-back tests and project `verify` script
- Produces: verification evidence and final project history entry

- [x] **Step 1: Run Jobber-focused regression tests**

Run: `npm.cmd run test:run -- tests/jobber-quote-route-refresh.test.ts tests/jobber-write-client.test.ts tests/quote-ui.test.tsx tests/quote-actions-supabase.test.ts`

Expected: all selected tests pass; no Jobber production file changed.

- [x] **Step 2: Run full verification**

Run: `npm.cmd run verify`

Expected: diff check, typecheck, ESLint, full tests, coverage thresholds, production build, and high-severity audit all pass.

- [ ] **Step 3: Measure affected transitions**

Use the authenticated production browser after deployment, or a comparable authenticated local production build before deployment, to inspect request fan-out and record navigation timings for Settings, Overview, New Quote, and quote detail.

- [ ] **Step 4: Update project records**

Record completed behavior, exact test counts, build/audit result, measured timings, and any deployment limitation in `PROGRESS.md`. Mark this plan's completed checkboxes only after evidence exists.

- [ ] **Step 5: Commit**

Stage only task files and create a descriptive performance commit. Do not push or deploy unless separately authorized.
