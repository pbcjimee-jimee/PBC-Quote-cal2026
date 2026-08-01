# Role / Progress Invoice Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `role` branch deployable as the quote application plus admin/supervisor roles and Job Expenses, with no Progress Invoice runtime or migrations in the final tree.

**Architecture:** Preserve the already-pushed `role` history and create ordinary additive cleanup commits; never rewrite or force-push. Remove Progress Invoice at the application, shared-module, database-migration, test, and documentation boundaries while retaining the Jobber pagination/config/token infrastructure required by Job Expenses. Production remains blocked until the separate Progress Invoice branch owns and verifies its existing database access lock.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Vitest 4, Supabase/Postgres RLS and pgTAP, Zod, decimal.js, PowerShell, Git.

**Source specification:** `docs/superpowers/specs/2026-08-01-role-progress-invoice-separation-design.md`

## Global Constraints

- Work, commits, and pushes stay on `role`; do not modify or merge `main`.
- Do not rewrite `role` history, force-push, or reset the branch.
- Do not apply any production Supabase migration, seed, user mutation, or Vercel production deployment in this plan.
- Do not modify any existing production Progress Invoice table, function, policy, grant, data, or migration-history row.
- Do not add an external dependency, Jobber mutation, OAuth scope, or token manipulation path.
- Keep `Job Expenses` immediately below `New Quote`; supervisor navigation contains only `Job Expenses` and `Inventory`.
- Server authorization derives the user and role from the session and `user_profiles`; client payload roles and user IDs are never trusted.
- Money calculations use decimal.js; native-number arithmetic is not introduced for money.
- TypeScript remains strict and `any` is prohibited.
- Server Actions keep `unknown` input, Zod validation, role guards, and `ActionResult<T>`/`Result<T>` results.
- Every behavior change follows RED → GREEN. Commit only after `npm.cmd run verify` is green.
- Preserve `lib/calculator.ts` at 100% coverage and `lib/actions/**/*.ts` at 80% statement/line/function coverage.
- Update this plan's checkbox with each completed task and include it in that task's commit.

---

## Target file map

### Retained role-owned application

- `app/(app)/jobs/**`, `components/jobs/**`, `lib/actions/jobs.ts`, `lib/jobber/job-{client,gateway,snapshots,types}.ts`: Job Expenses.
- `app/(app)/inventory/page.tsx`, `lib/actions/inventory.ts`: shared inventory with field-level supervisor restrictions.
- `app/(app)/settings/users/page.tsx`, `components/settings/user-management.tsx`, `lib/actions/users.ts`: admin user management.
- `lib/security/require-app-user.ts`, `lib/security/page-role-guard.ts`: session-derived role guards.
- `lib/jobber/config.ts`, `lib/jobber/pagination.ts`, `lib/jobber/tokens.ts`: shared Jobber infrastructure used by Job Expenses.
- `supabase/migrations/20260731010000_add_user_profiles_and_roles.sql`, `20260731011000_tighten_role_rls.sql`, `20260731012000_add_jobber_job_snapshots.sql`: the only new role migrations.

### Removed Progress Invoice ownership

- `app/(app)/progress-invoices/**`
- `app/api/jobber/progress-invoices/**`
- `components/progress-invoices/**`
- `lib/actions/progress-invoice-*.ts`
- `lib/progress-invoices/**`
- `lib/jobber/invoice-{client,contract,gateway,types}.ts`
- Progress Invoice migrations, pgTAP suites, Vitest suites, fixtures, reports, plans, and design docs listed in Tasks 2, 3, and 5.

---

### Task 1: Remove Progress Invoice routes, navigation, and UI

**Model:** Codex 5.6-Sol high

**Files:**
- Create: `tests/role-progress-separation.test.ts`
- Modify: `tests/app-header-ui.test.tsx`
- Modify: `tests/pwa-mobile-ux.test.tsx`
- Modify: `tests/role-route-guards.test.tsx`
- Modify: `tests/supervisor-route-security.test.ts`
- Modify: `components/layout/app-header.tsx`
- Modify: `components/ui/icons.tsx`
- Modify: `app/styles/components.css`
- Delete: `app/(app)/progress-invoices/layout.tsx`
- Delete: `app/(app)/progress-invoices/loading.tsx`
- Delete: `app/(app)/progress-invoices/page.tsx`
- Delete: `app/(app)/progress-invoices/new/page.tsx`
- Delete: `app/api/jobber/progress-invoices/invoices/[invoiceId]/route.ts`
- Delete: `app/api/jobber/progress-invoices/invoices/search/route.ts`
- Delete: `app/api/jobber/progress-invoices/jobs/[jobId]/invoices/route.ts`
- Delete: `components/progress-invoices/progress-invoice-dashboard.tsx`
- Delete: `tests/jobber-progress-invoice-routes.test.ts`
- Delete: `tests/jobber-progress-invoice-search-route.test.ts`
- Delete: `tests/progress-invoice-dashboard-ui.test.tsx`
- Modify: `docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md`

**Interfaces:**
- Consumes: `AppHeader({ userProfile }: { userProfile: UserProfile })`, `requireAdminPage()`.
- Produces: a Next.js application route tree with `/jobs` and `/inventory` for supervisors and no `/progress-invoices` or Progress Invoice Jobber API route.

- [x] **Step 1: Add a failing application-boundary test**

Create `tests/role-progress-separation.test.ts` with the real deployment paths:

```ts
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const forbiddenApplicationPaths = [
  'app/(app)/progress-invoices',
  'app/api/jobber/progress-invoices',
  'components/progress-invoices',
]

describe('role branch Progress Invoice separation', () => {
  it.each(forbiddenApplicationPaths)('does not ship %s', (path) => {
    expect(existsSync(path)).toBe(false)
  })
})
```

Change the admin assertions in `tests/app-header-ui.test.tsx` to require `Job Expenses` after `New Quote` and to reject any `href="/progress-invoices"` or `Progress Invoices` label. Remove the Progress Invoice active-route case from `tests/pwa-mobile-ux.test.tsx`. Restrict `tests/role-route-guards.test.tsx` to the retained Quotes layout, and restrict the Jobber endpoint list in `tests/supervisor-route-security.test.ts` to connect, callback, and quote routes.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd exec vitest run tests/role-progress-separation.test.ts tests/app-header-ui.test.tsx tests/pwa-mobile-ux.test.tsx tests/role-route-guards.test.tsx tests/supervisor-route-security.test.ts
```

Expected: FAIL because the three forbidden application paths exist and the admin header still renders Progress Invoices.

- [x] **Step 3: Remove the routes and UI with the minimum retained navigation**

Delete the route/component files listed above. Make `navItems` exactly:

```ts
const navItems: NavItem[] = [
  { href: '/quotes', label: 'Overview', icon: 'overview', roles: ['admin'] },
  { href: '/quotes/new', label: 'New Quote', mobileLabel: 'New', icon: 'quote', roles: ['admin'] },
  { href: '/jobs', label: 'Job Expenses', mobileLabel: 'Expenses', icon: 'overview', roles: ['admin', 'supervisor'] },
  { href: '/settings', label: 'Settings', icon: 'settings', roles: ['admin'] },
  { href: '/inventory', label: 'Inventory', icon: 'inventory', roles: ['admin', 'supervisor'] },
]
```

Remove `progressInvoice` from `NavItem['icon']`, `NavIcon`, and `Icons`. Delete the `/* Progress Invoices */` CSS block and only its responsive `.pbc-progress-*` rules. Keep the five-column mobile navigation because the retained admin navigation still has five items.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command.

Expected: 5 test files pass; admin order is New Quote → Job Expenses → Settings, supervisor sees only Job Expenses and Inventory, and forbidden application paths are absent.

- [x] **Step 5: Run the full gate**

Run:

```powershell
npm.cmd run verify
```

Expected: PASS; the Next.js build route list contains no `/progress-invoices` and no `/api/jobber/progress-invoices/*` entry.

- [x] **Step 6: Check the task box and commit**

```powershell
git add -- app components tests docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md
git diff --cached --check
git commit -m "refactor: remove progress invoice routes from role"
git push origin role
```

---

### Task 2: Remove Progress Invoice services while retaining generic Jobber pagination

**Model:** Codex 5.6-Sol high

**Files:**
- Modify: `tests/role-progress-separation.test.ts`
- Modify: `lib/jobber/pagination.ts`
- Modify: `lib/jobber/job-client.ts`
- Modify: `lib/jobber/job-gateway.ts`
- Modify: `lib/jobber/job-types.ts`
- Modify: `lib/jobber/config.ts`
- Modify: `lib/jobber/tokens.ts`
- Modify: `lib/actions/types.ts`
- Modify: `tests/actions-types.test.ts`
- Modify: `tests/jobber-tokens.test.ts`
- Modify: `tests/jobber-readonly-regression.test.ts`
- Modify: `vitest.config.ts`
- Delete: `lib/actions/progress-invoice-adjustments.ts`
- Delete: `lib/actions/progress-invoice-jobber.ts`
- Delete: `lib/actions/progress-invoice-series.ts`
- Delete: `lib/progress-invoices/adjustment-service.ts`
- Delete: `lib/progress-invoices/calculation.ts`
- Delete: `lib/progress-invoices/jobber-refresh-service.ts`
- Delete: `lib/progress-invoices/repository.ts`
- Delete: `lib/progress-invoices/series-service.ts`
- Delete: `lib/progress-invoices/types.ts`
- Delete: `lib/progress-invoices/validators.ts`
- Delete: `lib/jobber/invoice-client.ts`
- Delete: `lib/jobber/invoice-contract.ts`
- Delete: `lib/jobber/invoice-gateway.ts`
- Delete: `lib/jobber/invoice-types.ts`
- Delete: `tests/fixtures/jobber-invoice-contract.ts`
- Delete: `tests/fixtures/progress-invoices/jobber-invoice-payments-page-1.json`
- Delete: `tests/fixtures/progress-invoices/jobber-invoice-payments-page-2.json`
- Delete: `tests/fixtures/progress-invoices/jobber-job-invoices-page-1.json`
- Delete: `tests/fixtures/progress-invoices/jobber-job-invoices-page-2.json`
- Delete: `tests/fixtures/progress-invoices/sample-series.json`
- Delete: `tests/jobber-invoice-client.test.ts`
- Delete: `tests/jobber-invoice-contract.test.ts`
- Delete: `tests/jobber-invoice-gateway.test.ts`
- Delete: `tests/progress-invoice-actions-supabase.test.ts`
- Delete: `tests/progress-invoice-actions.test.ts`
- Delete: `tests/progress-invoice-calculation.test.ts`
- Delete: `tests/progress-invoice-jobber-migration.test.ts`
- Delete: `tests/progress-invoice-jobber-refresh.test.ts`
- Delete: `tests/progress-invoice-migration.test.ts`
- Delete: `tests/progress-invoice-repository.test.ts`
- Delete: `tests/progress-invoice-series-migration.test.ts`
- Delete: `tests/progress-invoice-series-service.test.ts`
- Delete: `tests/progress-invoice-validators.test.ts`
- Modify: `docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md`

**Interfaces:**
- Consumes: `fetchAllJobberPages<T>()`, the G1 `PbcTeamUsers`/`PbcUserJobs`/`PbcJobExpenses` contracts.
- Produces: Progress-free Jobber types used by `job-client.ts` and `job-gateway.ts`:
  - `JobberConnectionPage<T extends JobberNodeIdentity>`
  - `JobberPageRequest`
  - `JobberJobClientOptions`

- [x] **Step 1: Extend the separation test and verify RED**

Add these paths to a `forbiddenRuntimePaths` table in `tests/role-progress-separation.test.ts`:

```ts
const forbiddenRuntimePaths = [
  'lib/actions/progress-invoice-adjustments.ts',
  'lib/actions/progress-invoice-jobber.ts',
  'lib/actions/progress-invoice-series.ts',
  'lib/progress-invoices',
  'lib/jobber/invoice-client.ts',
  'lib/jobber/invoice-contract.ts',
  'lib/jobber/invoice-gateway.ts',
  'lib/jobber/invoice-types.ts',
]
```

Run:

```powershell
npm.cmd exec vitest run tests/role-progress-separation.test.ts
```

Expected: FAIL for every existing Progress Invoice service/module path.

- [x] **Step 2: Move generic connection contracts out of `invoice-types.ts`**

Export the pagination-owned contracts at the top of `lib/jobber/pagination.ts`:

```ts
export interface JobberNodeIdentity {
  readonly id: string
}

export interface JobberPageInfo {
  readonly endCursor: string | null
  readonly hasNextPage: boolean
}

export interface JobberConnectionPage<T extends JobberNodeIdentity> {
  readonly nodes: readonly T[]
  readonly pageInfo: JobberPageInfo
}

export interface JobberPageRequest {
  readonly first: number
  readonly after: string | null
}
```

Remove the `invoice-types` import from `pagination.ts`. Import `JobberConnectionPage` and `JobberPageRequest` from `./pagination` in `job-client.ts`.

Define the Job Expenses client configuration directly in `job-types.ts` and import only `JobberConnectionPage` from pagination:

```ts
import type { JobberConnectionPage } from './pagination'

export interface JobberJobClientOptions {
  readonly accessToken: string
  readonly graphqlVersion: string
  readonly maxThrottleRetries?: number
  readonly retryDelayMs?: number
}
```

Restore the shared connection/token boundary to the current `origin/main` behavior: remove the Progress Invoice-only `assertJobberRequiredReadScopes`, `requiredScopes`, and `storedScope` options from `config.ts` and `tokens.ts`. Update `job-gateway.ts` to call:

```ts
token = await refreshSharedJobberConnectionToken(
  token.refreshToken,
  config,
  requireSharedJobberConnectionOwnerId(token),
)
```

Keep `assertJobberReadOnlyScopes` and the narrow existing quote-write exception. Remove invoice-scope-only cases from `tests/jobber-tokens.test.ts`; keep stored malicious write-scope rejection, refresh race, encryption, and reconnect coverage.

Reduce the Progress Invoice-expanded action result to the stable codes the retained role application uses:

```ts
export type ActionErrorCode =
  | 'VALIDATION'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'JOBBER_ERROR'

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: ActionErrorCode }
```

Update `tests/actions-types.test.ts` to cover ordinary success/error values plus `VALIDATION`, `FORBIDDEN`, and `JOBBER_ERROR`; delete the typed Progress conflict/current test.

- [x] **Step 3: Delete Progress Invoice runtime and tests**

Delete every file listed in this task. Remove the Progress Invoice-only coverage threshold from `vitest.config.ts`. In `tests/jobber-readonly-regression.test.ts`, retain quote and Job Expenses read-only checks and remove assertions that enumerate deleted invoice modules/routes.

Do not delete or roll back `lib/jobber/config.ts`, `lib/jobber/pagination.ts`, `lib/jobber/tokens.ts`, or their non-Progress tests; Job Expenses uses them.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm.cmd exec vitest run tests/role-progress-separation.test.ts tests/actions-types.test.ts tests/jobber-pagination.test.ts tests/jobber-job-client.test.ts tests/jobber-job-gateway.test.ts tests/jobber-tokens.test.ts tests/jobber-readonly-regression.test.ts tests/jobs-actions.test.ts
npm.cmd run typecheck
```

Expected: all focused tests and strict TypeScript pass with no import of `invoice-types.ts`.

- [x] **Step 5: Run the full gate**

```powershell
npm.cmd run verify
```

Expected: PASS with no Progress Invoice source in the coverage report.

- [x] **Step 6: Check the task box and commit**

```powershell
git add -- lib tests vitest.config.ts docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md
git diff --cached --check
git commit -m "refactor: remove progress invoice runtime from role"
git push origin role
```

---

### Task 3: Make role migrations independent of the Progress Invoice schema

**Model:** Codex 5.6-Sol high

**Files:**
- Modify: `tests/role-progress-separation.test.ts`
- Modify: `tests/role-rls-migration.test.ts`
- Modify: `tests/rls.test.ts`
- Modify: `tests/rls-local-integration.test.ts`
- Modify: `supabase/tests/data_api_grants_test.sql`
- Create: `supabase/tests/role_rls_test.sql`
- Modify: `supabase/config.toml`
- Modify: `supabase/migrations/20260731011000_tighten_role_rls.sql`
- Modify: `lib/supabase/types.ts`
- Delete: `supabase/migrations/20260714225000_restore_existing_data_api_grants.sql`
- Delete: `supabase/migrations/20260714230000_add_progress_invoice_core.sql`
- Delete: `supabase/migrations/20260714231000_add_progress_invoice_rpc_foundations.sql`
- Delete: `supabase/migrations/20260714231100_add_progress_invoice_series_rpcs.sql`
- Delete: `supabase/migrations/20260714231200_add_progress_invoice_jobber_rpcs.sql`
- Delete: `supabase/tests/progress_invoice_concurrency_test.sql`
- Delete: `supabase/tests/progress_invoice_core_test.sql`
- Delete: `supabase/tests/progress_invoice_series_fix_test.sql`
- Delete: `supabase/tests/progress_invoices_test.sql`
- Modify: `docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md`

**Interfaces:**
- Consumes: `app_auth.current_role()` from `20260731010000_add_user_profiles_and_roles.sql`.
- Produces: a role-only migration chain whose only post-inventory migrations are `20260731010000`, `20260731011000`, and `20260731012000`.

- [x] **Step 1: Add failing migration-boundary and RLS assertions**

Extend `tests/role-progress-separation.test.ts`:

```ts
const forbiddenMigrations = [
  'supabase/migrations/20260714225000_restore_existing_data_api_grants.sql',
  'supabase/migrations/20260714230000_add_progress_invoice_core.sql',
  'supabase/migrations/20260714231000_add_progress_invoice_rpc_foundations.sql',
  'supabase/migrations/20260714231100_add_progress_invoice_series_rpcs.sql',
  'supabase/migrations/20260714231200_add_progress_invoice_jobber_rpcs.sql',
]
```

Change `tests/role-rls-migration.test.ts` so the admin table list ends at `quote_line_template_items`, and add:

```ts
expect(sql).not.toMatch(/progress_invoice|business_invoice_profiles|save_business_invoice_profile/i)
```

Remove Progress Invoice migration/RPC fixtures from `tests/rls.test.ts`. Keep assertions for role policies, Jobber tokens, job snapshots, user profiles, and inventory.

Also import `readFileSync` in `tests/role-progress-separation.test.ts` and add a local-stack ownership assertion:

```ts
it('uses a role-owned local Supabase project id', () => {
  const config = readFileSync('supabase/config.toml', 'utf8')
  expect(config).toContain('project_id = "pbc-quote-cal-role"')
  expect(config).not.toMatch(/progress[-_ ]invoice/i)
})
```

Run:

```powershell
npm.cmd exec vitest run tests/role-progress-separation.test.ts tests/role-rls-migration.test.ts tests/rls.test.ts
```

Expected: FAIL because the five forbidden migrations exist and `tighten_role_rls.sql` references Progress Invoice objects.

- [x] **Step 2: Move required Data API grants into the role RLS migration**

Change the local-only `project_id` in `supabase/config.toml` to `pbc-quote-cal-role` so the role and Progress Invoice branches cannot reuse the same Docker project identity.

At the start of `20260731011000_tighten_role_rls.sql`, before policies are recreated, add an exact table privilege reset for the retained application:

```sql
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'products', 'pricing_settings', 'quotes', 'quote_items', 'quote_areas',
    'quote_options', 'quote_option_items', 'jobber_quote_lines',
    'product_services', 'quote_line_templates', 'quote_line_template_items',
    'quote_memos', 'quote_price_revisions', 'warehouse_inventory'
  ]
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',
      table_name
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated, service_role',
      table_name
    );
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.jobber_tokens FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.jobber_tokens TO service_role;
```

Keep the existing role policies and inventory trigger. Delete everything from the first `DROP POLICY ... business_invoice_profiles` through the Progress Invoice wrapper grants, leaving a final `NOTIFY pgrst, 'reload schema';` immediately after the inventory trigger/function privilege block.

The quote save RPCs remain unchanged: they are `SECURITY INVOKER` and therefore obey these table RLS policies.

- [x] **Step 3: Delete Progress Invoice migrations and rewrite database tests**

Delete all migration and pgTAP files listed in this task. Rewrite `supabase/tests/data_api_grants_test.sql` to query actual privileges for this matrix:

```text
retained app tables: PUBLIC none, anon none, authenticated DML, service_role DML
jobber_tokens:       PUBLIC none, anon none, authenticated none, service_role DML
user_profiles:       PUBLIC none, anon none, authenticated SELECT, service_role DML
jobber_job_snapshots:PUBLIC none, anon none, authenticated none, service_role DML
```

The privilege matrix has 17 tables × 4 grantees, so set `SELECT plan(68);`.

Create `supabase/tests/role_rls_test.sql` with `SELECT plan(22);` and catalog-driven assertions:

```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(22);

WITH admin_tables AS (
  SELECT unnest(ARRAY[
    'products', 'pricing_settings', 'quotes', 'quote_items', 'quote_areas',
    'quote_options', 'quote_option_items', 'jobber_quote_lines',
    'product_services', 'quote_line_templates', 'quote_line_template_items',
    'quote_memos', 'quote_price_revisions'
  ]) AS table_name
)
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = admin_tables.table_name
      AND policyname = admin_tables.table_name || '_admin'
      AND cmd = 'ALL'
      AND qual LIKE '%app_auth.current_role()%admin%'
  ),
  format('public.%I has an admin-only policy', table_name)
)
FROM admin_tables;

SELECT ok(prosecdef, 'app_auth.current_role is SECURITY DEFINER')
FROM pg_proc
WHERE oid = 'app_auth.current_role()'::regprocedure;

SELECT is(
  (SELECT count(*)::INT FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'user_profiles'),
  2,
  'user_profiles has self and admin select policies'
);

WITH expected(policy_name) AS (
  SELECT unnest(ARRAY[
    'warehouse_inventory_app_select',
    'warehouse_inventory_app_update',
    'warehouse_inventory_admin_insert',
    'warehouse_inventory_admin_delete'
  ])
)
SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'warehouse_inventory' AND policyname = expected.policy_name),
  format('%s exists', policy_name)
)
FROM expected;

SELECT is((SELECT count(*)::INT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobber_tokens'), 0, 'jobber_tokens has no client policy');
SELECT is((SELECT count(*)::INT FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobber_job_snapshots'), 0, 'jobber_job_snapshots has no client policy');
SELECT is(
  (SELECT count(*)::INT
   FROM pg_class
   WHERE relnamespace = 'public'::regnamespace
     AND (relname LIKE 'progress_invoice%' OR relname = 'business_invoice_profiles')),
  0,
  'role schema has no Progress Invoice tables'
);

SELECT * FROM finish();
ROLLBACK;
```

In `tests/rls-local-integration.test.ts`, rename `denies supervisors admin tables and Progress Invoice RPCs` to `denies supervisors admin tables`, keep the products select/insert checks, remove Progress Invoice queries, and delete the separate `keeps Progress Invoice tables authenticated read-only` test. The resulting local suite has eight role-only cases.

- [x] **Step 4: Replace stale generated Supabase types**

Create a clean role-only local database, then capture its generated types:

```powershell
npx.cmd supabase start
npx.cmd supabase db reset --local --no-seed
npx.cmd supabase gen types typescript --local
```

Replace `lib/supabase/types.ts` with that generated output through the editing tool, then verify it contains `user_profiles` and `jobber_job_snapshots` and contains no `progress_invoice_*` table or Progress Invoice RPC type.

- [x] **Step 5: Verify the clean role-only database**

Run:

```powershell
npx.cmd supabase test db --local supabase/tests
npm.cmd exec vitest run tests/role-progress-separation.test.ts tests/role-rls-migration.test.ts tests/rls.test.ts
npm.cmd run typecheck
```

Expected: local reset succeeds without a Progress Invoice object; the retained Data API and role RLS pgTAP suites pass; focused Vitest and typecheck pass.

- [x] **Step 6: Run the full gate**

```powershell
npm.cmd run verify
```

Expected: PASS.

- [x] **Step 7: Check the task box and commit**

```powershell
git add -- supabase lib/supabase/types.ts tests docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md
git diff --cached --check
git commit -m "refactor: isolate role database migrations"
git push origin role
```

---

### Task 4: Preserve the current production quote-item price hotfix

**Model:** Codex 5.6-Sol high

**Files:**
- Modify: `tests/quote-actions-supabase.test.ts`
- Modify: `lib/actions/quotes.ts`
- Modify: `docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md`

**Interfaces:**
- Consumes: `updateQuote(input: unknown): Promise<ActionResult<{ id: string }>>` and existing quote item snapshots.
- Produces: edited market/RRP values remain user-edited while existing actual-price snapshots remain immutable.

- [ ] **Step 1: Add the production regression test from `d560b53`**

Port the `persists an edited RRP for an existing catalog item and recalculates formulas from it` case from commit `d560b53` into the current role-aware `tests/quote-actions-supabase.test.ts`. Its hand-derived expectations remain:

```ts
expect(rpc).toHaveBeenCalledWith('update_quote_with_children', {
  payload: expect.objectContaining({
    quote: expect.objectContaining({
      formula1_total: '625.00',
      subtotal: '625.00',
    }),
    items: [expect.objectContaining({
      market_price_snapshot: '125.00',
      actual_price_snapshot: '80.00',
    })],
  }),
})
```

- [ ] **Step 2: Run the regression test and verify RED**

```powershell
npm.cmd exec vitest run tests/quote-actions-supabase.test.ts -t "persists an edited RRP"
```

Expected: FAIL because the current role branch replaces both saved prices with the catalog price.

- [ ] **Step 3: Apply the minimal snapshot fix without replacing role guards**

Update `applySnapshotToItem` in `lib/actions/quotes.ts`:

```ts
if (!('price' in snapshot)) {
  return {
    ...item,
    productNameSnapshot: snapshot.product_name_snapshot,
    actualPriceSnapshot: decimalNumber(snapshot.actual_price_snapshot),
    isCustom: false,
  }
}

return {
  ...item,
  productNameSnapshot: snapshot.name,
  marketPriceSnapshot: decimalNumber(snapshot.price),
  actualPriceSnapshot: decimalNumber(snapshot.price),
  isCustom: false,
}
```

Do not cherry-pick or merge `main`; apply only this reviewed regression behavior to the existing role-aware file.

- [ ] **Step 4: Verify GREEN and run the full gate**

```powershell
npm.cmd exec vitest run tests/quote-actions-supabase.test.ts
npm.cmd run verify
```

Expected: quote action suite and full verification pass.

- [ ] **Step 5: Check the task box and commit**

```powershell
git add -- lib/actions/quotes.ts tests/quote-actions-supabase.test.ts docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md
git diff --cached --check
git commit -m "fix: preserve edited quote prices on role"
git push origin role
```

---

### Task 5: Align documentation with strict branch separation

**Model:** Codex 5.6-Terra high

**Files:**
- Delete: `.superpowers/sdd/task-5-report.md`
- Delete: `docs/jobber/2025-04-16-invoice-read-contract.md`
- Delete: `docs/superpowers/plans/2026-07-14-progress-invoices.md`
- Delete: `docs/superpowers/specs/2026-07-14-progress-invoices-design.md`
- Modify: `docs/superpowers/plans/2026-07-30-user-roles-job-expenses.md`
- Modify: `docs/DECISIONS.md`
- Modify: `docs/DB-SCHEMA.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/UI-PAGES.md`
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md`

**Interfaces:**
- Consumes: the final role-only route, migration, and test evidence from Tasks 1–4.
- Produces: documentation whose source of truth says Progress Invoice is separate, absent from `role`, and not deployed.

- [ ] **Step 1: Remove Progress Invoice-owned reports and source documents**

Delete the four files listed above. Keep the approved separation spec and this plan. Keep `docs/jobber/2026-07-30-role-job-expense-g1.md`, which is the Job Expenses query contract.

- [ ] **Step 2: Correct the role implementation plan**

Update `2026-07-30-user-roles-job-expenses.md` so:

```text
admin: existing quote/settings features + users + Jobs + Inventory
supervisor: Job Expenses + Inventory only
/progress-invoices: absent from this branch and release, not an admin route
role RLS: quote application + inventory only; no Progress Invoice tables or RPCs
G3: blocked until the separate Progress Invoice branch secures its existing remote schema
```

Add completed separation/G2 checkboxes and remove `progress-invoices` from the expected file list and acceptance redirect list. Do not mark any production task complete.

- [ ] **Step 3: Apply the already-approved role decisions without Progress Invoice coupling**

Restore `docs/DECISIONS.md` section 13 to the `origin/main` state, then apply Appendix A's approved role changes with this exact RLS wording:

```text
역할 기반: admin 전용 테이블(견적·가격·제품·설정)과 admin+supervisor 테이블(Inventory)로 분리한다. 역할 판정은 user_profiles + app_auth.current_role()을 사용하고, Jobber token/job snapshot 캐시는 service-role 전용으로 둔다. Progress Invoice는 별도 브랜치·별도 배포 게이트에서 관리하며 role 릴리스에 포함하지 않는다.
```

Keep the approved Jobber read/profit decision: Job Expenses uses `job.total - expenses`, read-only queries only, and no new mutation/scope.

- [ ] **Step 4: Update schema, security, UI, and progress docs**

Make these statements consistent across the four documents:

```text
DB-SCHEMA: exactly three 20260731 role migrations; no Progress Invoice migration entries
SECURITY: admin quote/settings, supervisor Jobs/Inventory; production blocked by separate remote Progress access lock
UI-PAGES: admin nav has Overview, New Quote, Job Expenses, Settings, Inventory; supervisor has Job Expenses, Inventory
PROGRESS: role-only G2 evidence; remove Progress Invoice implementation/deployment claims from this branch
```

Record the quote-price hotfix preservation and the final actual verification counts from Task 6 only after those commands run.

- [ ] **Step 5: Check documentation consistency**

Run:

```powershell
rg -n "Progress Invoice|progress-invoice|progress_invoice" docs PROGRESS.md
git diff --check
npm.cmd run verify
```

Expected: remaining matches occur only in the approved separation spec/plan and explicit statements that the feature is separate and not deployed; full verification passes.

- [ ] **Step 6: Check the task box and commit**

```powershell
git add -- .superpowers docs PROGRESS.md
git diff --cached --check
git commit -m "docs: separate role from progress invoices"
git push origin role
```

---

### Task 6: Re-run role-only G2 and record evidence

**Model:** Codex 5.6-Sol high

**Files:**
- Modify: `docs/superpowers/plans/2026-07-30-user-roles-job-expenses.md`
- Modify: `docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md`
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: the completed role-only source and migrations.
- Produces: final G2 evidence and a clean pushed `role` branch; no G3 mutation.

- [ ] **Step 1: Start/reset the local Supabase stack and run pgTAP**

```powershell
npx.cmd supabase start
npx.cmd supabase db reset --local --no-seed
npx.cmd supabase test db --local supabase/tests
```

Expected: every retained migration applies from a clean database; 2 pgTAP files and 90 assertions pass; no Progress Invoice relation/function is created.

- [ ] **Step 2: Run the real local admin/supervisor RLS integration suite**

Read the local values without printing them into docs or commits:

```powershell
$statusLines = npx.cmd supabase status -o env
function Read-SupabaseLocalValue([string]$name) {
  $line = $statusLines | Where-Object { $_ -match "^${name}=" } | Select-Object -First 1
  if (-not $line) { throw "Missing local Supabase value: $name" }
  return ($line -replace "^${name}=", '').Trim('"')
}
$env:SUPABASE_RLS_TEST_URL = Read-SupabaseLocalValue 'API_URL'
$env:SUPABASE_RLS_TEST_ANON_KEY = Read-SupabaseLocalValue 'ANON_KEY'
$env:SUPABASE_RLS_TEST_SERVICE_ROLE_KEY = Read-SupabaseLocalValue 'SERVICE_ROLE_KEY'
$env:SUPABASE_RLS_TEST_EMAIL = 'admin.rls@example.test'
$env:SUPABASE_RLS_TEST_PASSWORD = 'local-admin-password'
$env:SUPABASE_RLS_TEST_SUPERVISOR_EMAIL = 'supervisor.rls@example.test'
$env:SUPABASE_RLS_TEST_SUPERVISOR_PASSWORD = 'local-supervisor-password'
npm.cmd run test:rls:local
```

Expected: all eight role-only integration cases pass, including supervisor denial on admin tables and field-level inventory restrictions.

- [ ] **Step 3: Run separation checks and the complete verification gate**

```powershell
npm.cmd exec vitest run tests/role-progress-separation.test.ts tests/role-rls-migration.test.ts tests/supervisor-route-security.test.ts
npm.cmd run verify
```

Expected: all tests, coverage thresholds, strict TypeScript, ESLint, Next production build, and production dependency audit pass. Build output contains `/jobs`, `/jobs/[jobberJobId]`, and `/inventory`, and contains no Progress Invoice route or API.

- [ ] **Step 4: Record exact G2 evidence**

Update both plans and `PROGRESS.md` with:

- exact Vitest files/cases passed and skipped;
- exact coverage percentages;
- exact pgTAP files/cases;
- exact local RLS files/cases;
- explicit build evidence that Progress Invoice routes are absent;
- explicit statement that production Supabase, supervisor account creation, and Vercel production deployment remain blocked by the separate Progress Invoice access-lock prerequisite.

- [ ] **Step 5: Verify documentation-only changes and commit**

```powershell
npm.cmd run verify
git add -- PROGRESS.md docs/superpowers/plans/2026-07-30-user-roles-job-expenses.md docs/superpowers/plans/2026-08-01-role-progress-invoice-separation.md
git diff --cached --check
git commit -m "docs: record role-only separation G2"
git push origin role
git status --short --branch
```

Expected: `role...origin/role` with an empty working tree.

---

## G3 waiting list after this plan

The following work is not authorized by this implementation plan and remains pending:

1. Progress Invoice branch: design, test, approve, and apply an access-lock migration for the already-existing remote Progress Invoice schema without deploying the application.
2. Role branch: individually apply the three role migrations after remote-history comparison; do not use blanket `supabase db push` while remote-only migration versions exist.
3. Run the idempotent existing-admin bootstrap and verify both existing admin logins.
4. Create and map the real supervisor account only after item 1 is complete.
5. Perform live Jobber assignment/expense/profit QA with the user's account details.
6. Promote the role-only Vercel build to production and run role canary checks.

Each item requires its own current-state verification and explicit user approval at execution time.
