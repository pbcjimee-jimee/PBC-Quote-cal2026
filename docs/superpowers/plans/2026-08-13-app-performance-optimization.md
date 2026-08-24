# App Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce login completion, startup, data loading, and interaction latency across the deployed app without weakening authentication, quote correctness, or Jobber authorization.

**Architecture:** First colocate Vercel compute with the Sydney Supabase project and remove the PWA redirect request. Then narrow the largest server payloads and shared-service calls, bound Inventory loading, move draft persistence off the input path, split inactive Settings UI code, and verify every stage against the saved production baseline.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Vitest, Supabase Auth/PostgREST, Vercel Functions, Jobber GraphQL

**Spec:** `docs/superpowers/specs/2026-08-13-app-performance-optimization-design.md`

> **Inventory update (2026-08-25):** The user explicitly superseded this plan's 50-row pagination and `Load more` task. Inventory now batch-loads the complete matching result, defaults to excluding only `out`, and exposes all out rows through the `Out` filter. The Inventory steps below are retained as historical implementation context; follow `docs/ARCHITECTURE.md` and `docs/UI-PAGES.md` for the current contract.

## Global Constraints

- No new external dependency.
- No production database migration, RLS change, Vercel environment-variable change, or domain change.
- Keep `auth.getUser()` and the live active `user_profiles` lookup as the authorization boundary.
- Do not cache authenticated HTML, RSC, API, session, profile, quote, job, or customer data in the service worker or a public cache.
- Preserve all Decimal calculations, price snapshots, quote save/sync behavior, Jobber supervisor authorization, and existing Result shapes.
- TypeScript strict; do not add `any`.
- Every behavior change follows RED → GREEN with a focused test before production code.
- Implementers commit only their task files and include the exact test command/output in their report.
- Do not push, merge, or deploy until the finishing workflow presents the integration choice.

---

### Task 1: Pin Sydney compute and remove the PWA redirect launch

**Files:**
- Create: `tests/deployment-performance-config.test.ts`
- Modify: `vercel.json`
- Modify: `app/manifest.ts`

**Interfaces:**
- Consumes: Vercel project configuration and `MetadataRoute.Manifest`
- Produces: project-level `regions: ['syd1']` and `manifest().start_url === '/jobs'`

- [x] **Step 1: Write the failing configuration tests**

Create `tests/deployment-performance-config.test.ts` with artifact-level assertions:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '@/app/manifest'

describe('deployment performance configuration', () => {
  it('runs Vercel Functions beside the Sydney Supabase database', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      regions?: string[]
    }
    expect(config.regions).toEqual(['syd1'])
  })

  it('launches the PWA on a route shared by both app roles', () => {
    expect(manifest().start_url).toBe('/jobs')
  })
})
```

- [x] **Step 2: Run RED**

Run: `npm.cmd run test:run -- tests/deployment-performance-config.test.ts`

Expected: two failed assertions because `regions` is absent and `start_url` is `/`.

- [x] **Step 3: Add the minimum configuration**

Set the Vercel artifact to:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "regions": ["syd1"]
}
```

Set only `start_url` to `/jobs`; keep every other manifest field unchanged.

- [x] **Step 4: Run GREEN and related auth/PWA tests**

Run: `npm.cmd run test:run -- tests/deployment-performance-config.test.ts tests/pwa-metadata.test.ts tests/proxy.test.ts tests/supervisor-route-security.test.ts`

Expected: selected tests pass with no authorization or manifest regression.

- [x] **Step 5: Commit**

```powershell
git add tests/deployment-performance-config.test.ts vercel.json app/manifest.ts
git commit -m "perf: colocate functions and streamline PWA startup"
```

### Task 2: Narrow quote detail data and batch profile enrichment

**Files:**
- Modify: `lib/quote-query-shape.ts`
- Modify: `lib/user-profiles.ts`
- Modify: `lib/actions/quotes.ts`
- Modify: `components/quote-detail/jobber-refresh-panel.tsx`
- Modify: `components/quote-detail/quote-detail-view.tsx`
- Modify: `tests/quote-actions-supabase.test.ts`
- Create: `tests/user-profiles.test.ts`
- Modify: `tests/quote-ui.test.tsx`

**Interfaces:**
- Produces: `getUserProfilesById(userIds: readonly string[]): Promise<Map<string, UserProfile>>`
- Produces: `JobberRefreshQuote` with `id`, `jobberQuoteId`, `jobberSnapshotRefreshedAt`, `jobberSnapshotRefreshError`, `jobberSnapshotChangeStatus`, and `jobberSnapshotChangeSummary`
- Consumes: existing `QuoteWithItemsRow` and `toQuoteRecord()` without changing the public `getQuote()` result

- [x] **Step 1: Add a failing profile batch test**

In `tests/user-profiles.test.ts`, mock the authenticated Supabase client and assert that duplicate IDs become one `.in('id', ['user-2', 'user-3'])` query, returned rows map to `UserProfile`, and an empty input does not create a client. The production change that must break this test is replacing the batch with per-user requests.

- [x] **Step 2: Add failing quote-detail enrichment coverage**

In `tests/quote-actions-supabase.test.ts`, load a quote with two non-current revision users. Assert:

```ts
expect(profileQuery.in).toHaveBeenCalledWith('id', ['user-2', 'user-3'])
expect(mocks.createServiceClient).not.toHaveBeenCalled()
```

Add a second case where `user-3` is absent from `user_profiles`; only that ID may use the legacy Auth Admin fallback.

- [x] **Step 3: Add failing thin-client-prop coverage**

In `tests/quote-ui.test.tsx`, render quote detail and assert the refresh panel receives/renders the refresh fields without requiring material, option, memo, or full snapshot fields in its prop fixture.

- [x] **Step 4: Run RED**

Run: `npm.cmd run test:run -- tests/user-profiles.test.ts tests/quote-actions-supabase.test.ts tests/quote-ui.test.tsx`

Expected: failures for the missing batch helper and the `QuoteRecord`-wide refresh prop.

- [x] **Step 5: Implement the authenticated profile batch**

Use `createClient()`, select `id, email, display_name, role` from `user_profiles`, filter `is_active = true`, and query the deduplicated IDs with `.in('id', uniqueIds)`. Convert rows without consulting user metadata. Keep `getAuthUserProfilesById()` as the legacy fallback for IDs not returned by the database batch.

- [x] **Step 6: Replace wildcard detail selects**

Build `QUOTE_DETAIL_SELECT` and `QUOTE_DETAIL_WITHOUT_MEMOS_SELECT` from explicit quote/relation column arrays. Include every field read by `toQuoteRecord()`, edit-page bootstrap, Jobber snapshot display, memos, and revision history. Preserve the missing-memo and legacy-relation fallbacks.

- [x] **Step 7: Bound profile enrichment**

Seed the current profile, batch all remaining IDs through `getUserProfilesById()`, compute the still-missing IDs, and call `getAuthUserProfilesById()` only for that remainder. Merge in current → database → legacy order without changing display-name precedence.

- [x] **Step 8: Introduce the thin refresh DTO**

Export `JobberRefreshQuote` from the refresh panel module and pass an object containing only its declared fields from `quote-detail-view.tsx`. Do not pass the full saved Jobber snapshot or customer/price fields into the client component.

- [x] **Step 9: Run GREEN**

Run: `npm.cmd run test:run -- tests/user-profiles.test.ts tests/quote-actions-supabase.test.ts tests/quote-ui.test.tsx`

Expected: selected tests pass; quotes still map every existing detail field.

- [x] **Step 10: Commit**

```powershell
git add lib/quote-query-shape.ts lib/user-profiles.ts lib/actions/quotes.ts components/quote-detail/jobber-refresh-panel.tsx components/quote-detail/quote-detail-view.tsx tests/user-profiles.test.ts tests/quote-actions-supabase.test.ts tests/quote-ui.test.tsx
git commit -m "perf: narrow quote detail loading"
```

### Task 3: Reuse one Jobber token context and bound snapshot reads

**Files:**
- Modify: `lib/jobber/job-gateway.ts`
- Modify: `lib/jobber/job-snapshots.ts`
- Modify: `lib/actions/jobs.ts`
- Modify: `tests/jobber-job-gateway.test.ts`
- Modify: `tests/jobber-job-snapshots.test.ts`
- Modify: `tests/jobs-actions.test.ts`

**Interfaces:**
- Produces: `createJobberGateway(): Promise<JobberGateway>`
- `JobberGateway` methods: `listTeamUsers()`, `listJobs(jobberUserId, visitRange?)`, `fetchJobDetail(jobId)`, `fetchJobAssignmentVisits(jobId)`
- Produces: `listJobSnapshotsByIds(jobberJobIds: readonly string[]): Promise<readonly StoredJobSnapshot[]>`
- Consumes: existing Jobber client/page functions and one shared token with one possible 401 refresh

- [x] **Step 1: Write failing gateway reuse tests**

Create a gateway, call two methods, and assert `getUsableSharedJobberConnectionToken()` was called once. Simulate concurrent method calls that both receive 401 and assert `refreshSharedJobberConnectionToken()` is called once and both operations retry with the refreshed token.

- [x] **Step 2: Write failing bounded snapshot tests**

Cover literal behavior:

```ts
expect(await listJobSnapshotsByIds([])).toEqual([])
expect(snapshotQuery.in).toHaveBeenCalledWith('jobber_job_id', ['job-1', 'job-2'])
```

Returned payload parsing must remain identical to `listJobSnapshots()`.

- [x] **Step 3: Write failing action integration test**

For an admin list with visible Jobber IDs `job-1` and `job-2`, assert the action calls `listJobSnapshotsByIds(['job-1', 'job-2'])` and never calls unbounded `listJobSnapshots()`.

- [x] **Step 4: Run RED**

Run: `npm.cmd run test:run -- tests/jobber-job-gateway.test.ts tests/jobber-job-snapshots.test.ts tests/jobs-actions.test.ts`

Expected: failures because the gateway factory and bounded snapshot function do not exist.

- [x] **Step 5: Implement the gateway object**

Acquire config/token once in `createJobberGateway()`. Keep the current pagination functions. Store a single in-flight refresh promise so simultaneous 401 responses await the same refresh. Do not cache the gateway across top-level actions or requests.

- [x] **Step 6: Implement bounded snapshot loading**

Deduplicate trimmed IDs, return before creating a service client when empty, select the same three columns as today, filter with `.in('jobber_job_id', ids)`, and order by `refreshed_at` descending.

- [x] **Step 7: Thread the context through Jobs actions**

Create one gateway in each top-level action after authorization. Pass it through `resolveJobberFilter`, admin/supervisor list loaders, batch detail loading, and authorized detail fetching. Fetch live summaries first, then request only their snapshot IDs. Keep live supervisor assignment checks and `synchronizeJobSnapshotScope()` unchanged.

- [x] **Step 8: Run GREEN and authorization regressions**

Run: `npm.cmd run test:run -- tests/jobber-job-gateway.test.ts tests/jobber-job-snapshots.test.ts tests/jobs-actions.test.ts tests/jobber-route-security.test.ts tests/supervisor-route-security.test.ts`

Expected: selected tests pass; one token acquisition per top-level Jobber action and no unbounded list read in normal Jobs list paths.

- [x] **Step 9: Commit**

```powershell
git add lib/jobber/job-gateway.ts lib/jobber/job-snapshots.ts lib/actions/jobs.ts tests/jobber-job-gateway.test.ts tests/jobber-job-snapshots.test.ts tests/jobs-actions.test.ts
git commit -m "perf: reuse Jobber context and bound snapshots"
```

### Task 4: Add server-backed Inventory pagination and search

**Files:**
- Modify: `lib/validators.ts`
- Modify: `lib/actions/inventory.ts`
- Modify: `lib/dev-data.ts`
- Modify: `app/(app)/inventory/page.tsx`
- Modify: `components/inventory/inventory-manager.tsx`
- Modify: `tests/inventory-actions.test.ts`
- Modify: `tests/inventory-actions-supabase.test.ts`
- Modify: `tests/inventory-ui.test.tsx`
- Modify: `tests/inventory-hydration.test.tsx`

**Interfaces:**
- Produces: `InventoryPageResult = { items: InventoryItemRecord[]; nextOffset: number | null; hasMore: boolean }`
- `listInventory(input)` accepts existing filters plus `offset` defaulting to `0` and `limit` capped at `50`
- `InventoryManager` consumes `initialPage: InventoryPageResult` and `role`

- [x] **Step 1: Write failing pagination action tests**

Request `{ offset: 50, limit: 50 }` and assert the Supabase builder receives `.range(50, 100)`. The action intentionally asks for `limit + 1` rows, returns the first 50, `hasMore: true`, and `nextOffset: 100`. With 20 rows it returns `hasMore: false` and `nextOffset: null`.

- [x] **Step 2: Write failing server-filter UI tests**

Use fake timers. Type a query, advance 300ms, and assert `listInventory({ query, status, category, offset: 0, limit: 50 })` replaces visible results. Click Load more and assert the next page is merged by unique ID. Changing a filter must reset pagination.

- [x] **Step 3: Run RED**

Run: `npm.cmd run test:run -- tests/inventory-actions.test.ts tests/inventory-actions-supabase.test.ts tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx`

Expected: failures because list results are arrays and the client only filters its initial list.

- [x] **Step 4: Extend validation and the action**

Add `offset: z.number().int().min(0).default(0)` and cap `limit` at 50. Use `.range(offset, offset + limit)` after filters/order, then normalize `limit + 1` rows into `InventoryPageResult`. Match the same behavior in dev data.

- [x] **Step 5: Update the route and client**

Load `{ limit: 50, offset: 0 }` on the server. In the client, keep immediate input state and separate committed server-filter state. After 300ms, start a transition, replace the result page, and ignore stale responses using a monotonically increasing request sequence. Load more appends unique IDs and retains mutation updates.

- [x] **Step 6: Preserve export semantics**

Label export as exporting the currently loaded filtered rows; do not silently imply that unloaded server rows are included. Keep the CSV template unchanged.

- [x] **Step 7: Run GREEN**

Run: `npm.cmd run test:run -- tests/inventory-actions.test.ts tests/inventory-actions-supabase.test.ts tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx tests/supervisor-route-security.test.ts`

Expected: selected tests pass; initial and subsequent page sizes are bounded at 50.

- [x] **Step 8: Commit**

```powershell
git add lib/validators.ts lib/actions/inventory.ts lib/dev-data.ts 'app/(app)/inventory/page.tsx' components/inventory/inventory-manager.tsx tests/inventory-actions.test.ts tests/inventory-actions-supabase.test.ts tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx
git commit -m "perf: paginate inventory from the server"
```

### Task 5: Debounce Quote Form draft persistence

**Files:**
- Create: `components/quote-form/use-quote-draft-persistence.ts`
- Modify: `components/quote-form/quote-form.tsx`
- Create: `tests/quote-draft-persistence.test.tsx`
- Modify: `tests/quote-draft.test.ts`

**Interfaces:**
- Produces: `useQuoteDraftPersistence({ storageKey, draft, enabled, delayMs, sanitize })`
- Hook returns `flushDraft()`, `clearDraft()`, and `readDraft()`
- Consumes: current quote draft storage schema and `sanitizeQuoteFormDraftForStorage()`

- [x] **Step 1: Write failing timing tests**

With fake timers, render a harness, update the draft three times within 300ms, and assert `storage.setItem` is zero before the deadline and exactly one afterward with the final literal payload. Add a `pagehide` case that flushes once immediately and a clear case that cancels pending writes before `removeItem`.

- [x] **Step 2: Run RED**

Run: `npm.cmd run test:run -- tests/quote-draft-persistence.test.tsx tests/quote-draft.test.ts`

Expected: missing-hook failure.

- [x] **Step 3: Implement the hook**

Use refs for the latest draft and timer. Schedule a 300ms trailing write only while enabled. Register `pagehide`, flush on cleanup, and ensure `clearDraft()` cancels before removing. Catch storage errors as the existing form does; do not surface or log quote contents.

- [x] **Step 4: Integrate the form**

Replace the current immediate persistence callback/effect with the hook. Keep recovery parsing, saved-draft comparison, successful-save clearing, and manual clear messages unchanged. Do not delay calculations or save payloads.

- [x] **Step 5: Run GREEN and calculation regressions**

Run: `npm.cmd run test:run -- tests/quote-draft-persistence.test.tsx tests/quote-draft.test.ts tests/quote-ui.test.tsx tests/quote-calculation-totals.test.ts tests/quote-actions.test.ts`

Expected: selected tests pass and storage receives only the latest paused draft.

- [x] **Step 6: Commit**

```powershell
git add components/quote-form/use-quote-draft-persistence.ts components/quote-form/quote-form.tsx tests/quote-draft-persistence.test.tsx tests/quote-draft.test.ts
git commit -m "perf: debounce quote draft persistence"
```

### Task 6: Split inactive Settings code and add route-shaped loading

**Files:**
- Create: `components/settings/tabs/material-settings-tab.tsx`
- Create: `components/settings/tabs/product-service-settings-tab.tsx`
- Create: `components/settings/tabs/template-settings-tab.tsx`
- Create: `components/settings/tabs/area-settings-tab.tsx`
- Modify: `components/settings/settings-form.tsx`
- Create: `app/(app)/quotes/new/loading.tsx`
- Create: `app/(app)/quotes/[id]/loading.tsx`
- Create: `app/(app)/quotes/[id]/edit/loading.tsx`
- Create: `app/(app)/jobs/[jobberJobId]/loading.tsx`
- Create: `app/(app)/inventory/loading.tsx`
- Modify: `tests/settings-ui.test.tsx`
- Create: `tests/route-loading-ui.test.tsx`

**Interfaces:**
- Tab modules receive explicit values/callbacks from the existing Settings controller; they do not own server fetching.
- `SettingsForm` keeps Labour Rates synchronous and dynamically imports the other four tab modules with accessible loading fallbacks.

- [x] **Step 1: Write failing lazy-module behavior tests**

Mock the four dynamic module loaders. Render Labour Rates and assert no inactive module is requested. Activate Material and assert only the Material module is requested/mounted after its resource is ready. Repeat for each tab and keep the existing retry/in-flight tests.

- [x] **Step 2: Write failing loading-route tests**

Render each loading component directly and assert a unique route label plus `role="status"`: New Quote workspace, quote detail, quote edit workspace, Job financial detail, and Inventory rows/filters.

- [x] **Step 3: Run RED**

Run: `npm.cmd run test:run -- tests/settings-ui.test.tsx tests/route-loading-ui.test.tsx`

Expected: missing loading modules and eager Settings implementation failures.

- [x] **Step 4: Extract tab views without moving controller state**

Move only each tab's JSX and its pure local view types into the new modules. Keep actions, resource cache refs, mutations, and tab selection in `settings-form.tsx`. Export narrow prop interfaces and stable callbacks; do not duplicate business logic between shell and tab modules.

- [x] **Step 5: Add dynamic imports**

Use `next/dynamic` for the four inactive tab modules. Mount a module only when its tab is active. Use compact, non-layout-shifting `role="status"` fallbacks. Labour Rates remains in the initial component.

- [x] **Step 6: Add route-shaped loading files**

Use existing design-system classes and static skeleton blocks. Do not include real names, prices, IDs, or random content. The job detail skeleton must not reuse the calendar layout.

- [x] **Step 7: Run GREEN**

Run: `npm.cmd run test:run -- tests/settings-ui.test.tsx tests/settings-page-performance.test.tsx tests/route-loading-ui.test.tsx tests/app-loading.test.tsx tests/jobs-page.test.tsx`

Expected: selected tests pass and inactive tab modules are not loaded on Labour Rates.

- [x] **Step 8: Commit**

```powershell
git add components/settings/settings-form.tsx components/settings/tabs 'app/(app)/quotes/new/loading.tsx' 'app/(app)/quotes/[id]/loading.tsx' 'app/(app)/quotes/[id]/edit/loading.tsx' 'app/(app)/jobs/[jobberJobId]/loading.tsx' 'app/(app)/inventory/loading.tsx' tests/settings-ui.test.tsx tests/route-loading-ui.test.tsx
git commit -m "perf: defer settings tabs and shape loading states"
```

### Task 7: Verify budgets, record rollout evidence, and prepare integration

**Files:**
- Modify: `PROGRESS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DEPLOY.md`
- Modify: `docs/superpowers/plans/2026-08-13-app-performance-optimization.md`
- Create: `.gstack/benchmark-reports/2026-08-13-app-performance-optimization.md` (ignored local artifact)

**Interfaces:**
- Consumes: baseline report `.gstack/benchmark-reports/2026-08-12-benchmark.md`
- Produces: verified branch test/build evidence, bundle comparison, and preview rollout checklist

- [x] **Step 1: Run focused security and behavior suites**

Run:

```powershell
npm.cmd run test:run -- tests/require-app-user.test.ts tests/app-layout-auth.test.tsx tests/proxy.test.ts tests/pwa-service-worker.test.ts tests/supervisor-route-security.test.ts tests/quote-actions-supabase.test.ts tests/jobs-actions.test.ts tests/inventory-actions-supabase.test.ts
```

Expected: all selected tests pass; no protected payload is added to the service-worker cache.

- [x] **Step 2: Run complete verification**

Run each command separately and record its exit code:

```powershell
git diff --check
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:run
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run audit:production
```

Expected: all commands pass. If the audit reports an existing advisory, record the exact package/advisory and do not auto-upgrade dependencies in this performance branch.

- [x] **Step 3: Compare deterministic bundles**

Read `.next` build manifests and record gzip sizes for shared JS/CSS, Login, Overview, New/Edit Quote, Settings, Inventory, Quote Detail, and Jobs. Flag any route with >10% JS/CSS growth from the saved baseline and fix accidental growth before final review.

- [x] **Step 4: Prepare preview verification**

Document these post-push commands without executing a production promotion:

```powershell
npx.cmd vercel inspect <preview-url>
```

The preview gate requires Function output in `[syd1]`, zero auth/runtime errors, and before/after cold/warm measurements for Login, PWA launch, Settings, quote detail, Jobs, Inventory search, and Quote Form input.

- [x] **Step 5: Update project records**

Record behavior changes, exact test counts, build/audit results, bundle deltas, guarded follow-ups (`getClaims`, DB indexes/RLS/RPC), and the preview/production measurement procedure. Do not claim live latency improvement before the Sydney preview is measured.

- [x] **Step 6: Commit**

```powershell
git add PROGRESS.md docs/ARCHITECTURE.md docs/DEPLOY.md docs/superpowers/plans/2026-08-13-app-performance-optimization.md
git commit -m "docs: record app performance optimization rollout"
```

#### Task 7 verification evidence

- Final integrated focused binding suite: 8 files, 140 tests passed; exit 0.
- `git diff --check`, typecheck, lint, full Vitest, coverage, and production build (18/18 static pages): exit 0. Full/coverage runs recorded 92 passed files and 789 passed tests, with the environment-conditioned local RLS file (9 tests) skipped.
- Coverage: statements 84.47% (3,205/3,794), branches 70.99% (2,301/3,241), functions 94.36% (704/746), lines 89.88% (2,914/3,242).
- `next-env.d.ts` retained the branch import `./.next/types/routes.d.ts` and the same SHA-256 before/after build.
- Production audit: exit 1 for existing `nanoid <3.3.17`, high `GHSA-2v37-7h3g-55p8`; `npm audit fix` is available. No dependency or lockfile change was made.
- Deterministic manifests remained stable while measured: baseline BUILD_ID `7GGZvnV9XHYRkWgZpzvCX`, final branch BUILD_ID `NMa2CWX7zOx7yZRB0vRq0`. Assets were deduplicated, gzip-compressed per response, and nomodule polyfills excluded.
- Settings route-owned JS: 12,181→7,741 bytes (-36.450%); initial JS: 166,572→162,172 bytes (-2.642%). Four deferred chunks total 8,982 bytes and are excluded from initial loading.
- Inventory route-owned JS: +9.209%; initial JS: +0.411%. No route initial JS/CSS total exceeded 10% growth. New/Edit Quote and Jobs list/detail retained identical client asset sets within each pair.
- Final review P2 fix preflights unlinked filters before gateway creation and hardens refresh/retry failure paths; the final scoped rereview passed.
- These are branch/build results, not live latency results. The post-push Sydney preview gate in `docs/DEPLOY.md` remains required before promotion or a live performance claim.
