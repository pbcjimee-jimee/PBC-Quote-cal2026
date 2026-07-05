# Project Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current PBC Quote Calculator into a safer production tool by closing authorization, data integrity, validation, operational backup, performance, and QA gaps found in the project audit.

**Architecture:** Keep the existing Next.js App Router + Server Actions + Supabase architecture. Prioritize DB-level guarantees for authorization and quote persistence, then align application validation, UI feedback, tests, and operations docs around those guarantees. Production Supabase changes require explicit user approval before applying.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Supabase Postgres/Auth/RLS, Zod, decimal.js, Vitest, Vercel.

---

## Scope And Priority

### P0 - Must Fix Before More Feature Work

1. Authorization/RLS is currently authentication-only for most app tables.
2. Quote update is not atomic and can partially delete child rows on failure.

### P1 - Fix Before Production Process Expansion

1. Settings margin validation conflicts with calculator behavior.
2. Jobber token storage model is now aligned as a shared company-level connection using the latest owner row.
3. Real Supabase data backup policy is unresolved.

### P2 - Hardening And Scale

1. Input length, CSV size, quote row count, and search pagination limits are incomplete.
2. `npm run test:coverage` currently fails because `lib/calculator.ts` branch coverage is below the project threshold.
3. CSP allows `script-src 'unsafe-inline'`.

### P3 - Cleanup

1. Jobber OAuth connect route can start without auth.
2. Supabase session refresh helper exists but is not wired into the Next.js proxy flow.

---

## Role-Based Implementation Ownership

### Project Manager

- Treat this as four releases, not one large release.
- Require explicit approval before any production Supabase migration, Vercel env/domain change, destructive data action, or change to `docs/DECISIONS.md`.
- Track each release with a go/no-go checklist: local tests, migration review, rollback path, production smoke, and backup status.

### Planner

- Split work into independently shippable phases:
  1. P0 security and atomic persistence design decision.
  2. P0/P1 implementation.
  3. P2 reliability and performance.
  4. P3 cleanup plus UX polish.
- Keep documentation synchronized after each phase: `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/DB-SCHEMA.md`, `docs/DEPLOY.md`, and `PROGRESS.md`.

### Developer

- Use TDD for each risk area.
- Do not add new external dependencies unless the user explicitly approves.
- Use Supabase migrations for schema/RLS changes, generated through the project CLI workflow.
- Keep Server Actions returning the existing `{ ok: true, data } | { ok: false, error }` pattern.

### Designer

- For security/backup/sync states, prefer clear operational states over explanatory text blocks.
- Add compact status chips, disabled states, confirmation dialogs, and error recovery actions where user action is needed.
- Keep the app as an internal operations tool: dense, readable, and task-oriented.

### Security Reviewer

- Validate that direct Supabase Data API access cannot bypass app-level allowlist checks.
- Check that no service role key reaches client bundles.
- Confirm Jobber tokens remain encrypted, server-only, and scoped to the chosen access model.
- Confirm material price snapshots and internal memos are never sent to Jobber payloads.

### DevOps / Operations

- Choose and document the real backup model before applying RLS/transaction migrations to production.
- Run restore verification, not just backup creation.
- Keep migration rollback scripts and pre-migration export artifacts for production changes.

---

## Release 1: Authorization And Access Control

### Decision Gate 1: Access Model

**Current conflict:** `docs/DECISIONS.md` says the app keeps the simple authenticated-user model because only two admins should have Supabase Auth accounts. The audit found that this is fragile if signup, invite, or direct JWT access is possible.

**Recommended decision:** Use DB-level allowed-user authorization in RLS while keeping no separate admin role split. This changes the access model from "any authenticated user" to "authenticated user whose email/id is in the allowed app user table".

**Requires explicit user approval before implementation because it changes a core security decision.**

### Task 1.1: Add Central App Authorization Helper

**Files:**
- Modify: `lib/security/auth-policy.ts`
- Create: `lib/security/require-allowed-user.ts`
- Test: `tests/require-allowed-user.test.ts`

- [ ] Add a single `requireAllowedUser()` helper for Server Actions and Route Handlers.
- [ ] Helper must call Supabase `auth.getUser()`, reject missing users, then call existing allowlist logic.
- [ ] Return a typed result compatible with Server Actions.

Expected helper shape:

```ts
export type AllowedUser = {
  id: string;
  email: string | null;
};

export type RequireAllowedUserResult =
  | { ok: true; user: AllowedUser }
  | { ok: false; error: string };

export async function requireAllowedUser(): Promise<RequireAllowedUserResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { ok: false, error: "Authentication required" };
  }

  if (!isAuthenticatedUserAllowed(data.user)) {
    return { ok: false, error: "User is not allowed to access this app" };
  }

  return {
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
    },
  };
}
```

Verification:

```bash
npm.cmd run test:run -- tests/require-allowed-user.test.ts
npm.cmd run typecheck
```

### Task 1.2: Apply Helper To All Mutating Server Actions

**Files:**
- Modify: `lib/actions/products.ts`
- Modify: `lib/actions/product-services.ts`
- Modify: `lib/actions/areas.ts`
- Modify: `lib/actions/quote-line-templates.ts`
- Modify: `lib/actions/settings.ts`
- Modify: `lib/actions/quotes.ts`
- Test: existing action tests plus focused auth-denial cases

- [ ] Add `requireAllowedUser()` at the top of every create/update/delete/import action.
- [ ] Add it to sensitive reads that expose internal prices, settings, templates, or quote contents.
- [ ] Keep public login/logout actions unchanged.
- [ ] Ensure every denied result returns `{ ok: false, error: "User is not allowed to access this app" }`.

Regression commands:

```bash
npm.cmd run test:run -- tests/products-actions.test.ts tests/settings-actions.test.ts tests/areas-actions.test.ts
npm.cmd run test:run -- tests/quote-actions.test.ts tests/product-services-actions.test.ts
npm.cmd run lint
```

### Task 1.3: Add DB-Level Allowed Users RLS

**Files:**
- Create: `supabase/migrations/<generated>_add_allowed_app_users_rls.sql`
- Modify: `docs/DB-SCHEMA.md`
- Modify: `docs/SECURITY.md`
- Test: `tests/rls.test.ts`
- Optional integration: `tests/rls-local-integration.test.ts`

- [ ] Generate migration with `supabase migration new add_allowed_app_users_rls`.
- [ ] Create `app_allowed_users` table keyed by `user_id uuid` and/or normalized email.
- [ ] Enable RLS on `app_allowed_users`.
- [ ] Create a stable helper function only if needed; avoid `SECURITY DEFINER` unless reviewed and locked down.
- [ ] Replace broad `USING (true) WITH CHECK (true)` authenticated policies on app tables with allowed-user checks.
- [ ] Keep `jobber_tokens` service-role-only unless the chosen Jobber token model requires a different policy.

Recommended SQL intent:

```sql
create table if not exists public.app_allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text generated always as (lower(nullif(trim(email_raw), ''))) stored,
  email_raw text not null,
  created_at timestamptz not null default now()
);

alter table public.app_allowed_users enable row level security;

create policy "allowed users can read self"
on public.app_allowed_users
for select
to authenticated
using ((select auth.uid()) = user_id);
```

Policy target for app tables:

```sql
using (
  exists (
    select 1
    from public.app_allowed_users au
    where au.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.app_allowed_users au
    where au.user_id = (select auth.uid())
  )
)
```

Verification:

```bash
npm.cmd run test:run -- tests/rls.test.ts
npm.cmd run test:run -- tests/rls-local-integration.test.ts
npm.cmd run build
```

Production rollout:

- Export current production data before applying.
- Insert the two approved user IDs into `app_allowed_users`.
- Apply migration only after user approval.
- Verify allowed user can read/write, non-allowed authenticated user cannot read/write, anon cannot read.

---

## Release 2: Atomic Quote Persistence

### Task 2.1: Move Quote Save/Update Into Postgres Transaction RPC

**Files:**
- Create: `supabase/migrations/<generated>_quote_save_transaction_rpc.sql`
- Modify: `lib/actions/quotes.ts`
- Create or modify: `tests/quote-save-transaction.test.ts`
- Modify: `docs/DB-SCHEMA.md`

- [ ] Define a single RPC for quote create/update child-row replacement.
- [ ] RPC must update quote header, `quote_items`, `quote_options`, `quote_option_items`, `jobber_quote_lines`, `quote_memos`, and price revisions in one transaction.
- [ ] RPC must reject if the caller is not an allowed user under the Release 1 policy.
- [ ] Server Action should validate with existing Zod schemas, then call the RPC once.
- [ ] Remove multi-step delete-and-reinsert logic from direct application code after RPC coverage is complete.

RPC contract:

```ts
type SaveQuotePayload = {
  quote: Record<string, unknown>;
  items: Record<string, unknown>[];
  options: Record<string, unknown>[];
  optionItems: Record<string, unknown>[];
  jobberLines: Record<string, unknown>[];
  memos: Record<string, unknown>[];
  mode: "create" | "update";
  quoteId?: string;
};
```

Test cases:

- update success preserves all child rows with new values.
- injected child insert failure leaves previous quote children unchanged.
- create failure leaves no orphan quote.
- unauthorized user cannot invoke RPC.
- Jobber sync failure still leaves local quote saved only if the current product decision keeps that behavior.

Verification:

```bash
npm.cmd run test:run -- tests/quote-save-transaction.test.ts tests/quote-actions.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

### Task 2.2: Preserve Jobber Write-Back Boundary

**Files:**
- Modify: `lib/actions/quotes.ts`
- Modify: `lib/jobber/quote-line-sync.ts` or current sync module
- Test: `tests/jobber-quote-line-payload.test.ts`
- Test: `tests/quote-actions.test.ts`

- [ ] Keep DB save transaction separate from external Jobber API call.
- [ ] If local quote save succeeds and Jobber write-back fails, persist `jobber_sync_status = failed`.
- [ ] Do not wrap Jobber API call inside DB transaction.
- [ ] Confirm material prices, internal memos, and material details are not serialized to Jobber payload.

Verification:

```bash
npm.cmd run test:run -- tests/jobber-quote-line-payload.test.ts tests/quote-actions.test.ts
```

---

## Release 3: Validation And Data Model Alignment

### Task 3.1: Fix Margin Validation Mismatch

**Files:**
- Modify: `lib/validators.ts`
- Modify: `components/settings/settings-form.tsx`
- Create migration: `supabase/migrations/<generated>_tighten_pricing_margin_checks.sql`
- Modify: `docs/CALCULATION.md`
- Test: `tests/settings-actions.test.ts`
- Test: `tests/settings-ui.test.tsx`
- Test: `tests/calculator.test.ts`

- [ ] Decide the app rule as `0 <= margin < 1` because `lib/calculator.ts` throws when margin is `>= 1`.
- [ ] Reject UI percent inputs `100` or higher.
- [ ] Add Zod `.lt(1, "Margin must be less than 100%")` to `f2Margin` through `f5Margin`.
- [ ] Add DB CHECK constraints for `< 1`.
- [ ] Update docs that currently imply margins above 100% are allowed or warning-only.

Expected Zod shape:

```ts
const marginSchema = z
  .number()
  .nonnegative("Margin must be at least 0%")
  .lt(1, "Margin must be less than 100%");
```

Verification:

```bash
npm.cmd run test:run -- tests/settings-actions.test.ts tests/settings-ui.test.tsx tests/calculator.test.ts
npm.cmd run test:coverage
```

### Task 3.2: Resolve Jobber Token Model

**Files:**
- Modify: `lib/jobber/tokens.ts`
- Modify: `app/api/jobber/quote/[quoteId]/route.ts`
- Modify: `lib/actions/quotes.ts`
- Modify: `tests/jobber-tokens.test.ts`
- Modify: `tests/jobber-quote-route-refresh.test.ts`
- Modify: `tests/quote-actions-supabase.test.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DB-SCHEMA.md`
- Modify: `docs/SECURITY.md`

**Product decision:** Treat Jobber as a shared company connection because the current tests and code already select the latest shared connection.

- [x] Rename docs to "company-scoped shared Jobber connection owned by the connecting user row".
- [x] Rename code variables and helpers to make the shared behavior explicit.
- [x] Add `getSharedJobberConnectionToken()` and remove the unused `userId` read argument.
- [ ] Restrict reconnect/replace-token action to allowed users.
- [ ] Keep encryption with AES-256-GCM.
- [ ] Add startup validation that `JOBBER_TOKEN_ENCRYPTION_KEY` is high entropy and decodable according to the chosen format.

Alternative rejected for Release 3.2:

- Query `jobber_tokens` by the current app user's `user_id`.
- Update tests that currently expect the latest shared token.
- Decide how two admin users share or duplicate the same Jobber connection.

Verification:

```bash
npm.cmd run test:run -- tests/jobber-tokens.test.ts tests/jobber-token-encryption.test.ts
npm.cmd run typecheck
```

---

## Release 4: Operations Backup

### Task 4.1: Decide Backup Policy

**Files:**
- Modify: `docs/DEPLOY.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `README.md`
- Modify: `PROGRESS.md`

**Recommended policy:** Supabase Pro + PITR if the production quote database is business-critical. Use scheduled `pg_dump` only as a secondary export or if Pro/PITR is rejected.

- [ ] Choose RPO and RTO.
- [ ] Record who owns backup checks.
- [ ] Record restore drill frequency.
- [ ] Record where encrypted exports are stored if using dump exports.

Concrete policy proposal:

```md
RPO: 24 hours maximum data loss.
RTO: 4 hours to restore app access.
Primary: Supabase Pro daily backups + PITR.
Secondary: monthly logical export retained outside Supabase.
Restore drill: quarterly restore into a non-production project.
Owner: PBC app operator.
```

### Task 4.2: Add Backup Verification Runbook

**Files:**
- Create: `docs/ops/backup-restore-runbook.md`
- Modify: `docs/AGENT-MAP.md`

- [ ] Document pre-migration backup steps.
- [ ] Document restore-to-staging steps.
- [ ] Document smoke queries: quote count, quote item count, latest quote timestamp, settings row count, Jobber token row count without exposing token values.
- [ ] Document rollback decision criteria.

Verification:

```bash
npm.cmd run lint
```

---

## Release 5: Input Limits, Pagination, And Performance

### Task 5.1: Add Server-Side Input Limits

**Files:**
- Modify: `lib/validators.ts`
- Modify: quote form components that display validation errors
- Test: `tests/validators.test.ts`
- Test: existing quote action tests

- [ ] Add max lengths for customer name, address, work type, Jobber quote ID, memo body, line item title, and line item description.
- [ ] Add array caps for quote items, options, option items, Jobber lines, memos, and Jobber snapshot line arrays.
- [ ] Add CSV import row and byte-size caps before parsing.

Initial limits:

```ts
const LIMITS = {
  customerName: 120,
  address: 300,
  workType: 120,
  jobberQuoteId: 80,
  memoBody: 2_000,
  quoteItems: 200,
  quoteOptions: 20,
  optionItems: 200,
  jobberLines: 100,
  memos: 50,
  csvRows: 5_000,
  csvBytes: 2_000_000,
} as const;
```

Verification:

```bash
npm.cmd run test:run -- tests/validators.test.ts tests/quote-actions.test.ts tests/products-actions.test.ts
```

### Task 5.2: Add Quote List Pagination And Server Filtering

**Files:**
- Modify: `lib/actions/quotes.ts`
- Modify: `app/(app)/quotes/page.tsx`
- Modify: `components/quote-list/*`
- Test: `tests/quote-actions.test.ts`
- Test: `tests/quote-ui.test.tsx`

- [ ] Replace fetch-all quote list behavior with `limit`, `offset`, and server-side month/year filters.
- [ ] Limit search results to a fixed page size.
- [ ] Preserve URL query sync for search/month/year/page.
- [ ] Show total count or "next page" based on Supabase count result.

Action signature:

```ts
export type ListQuotesParams = {
  query?: string;
  year?: number;
  month?: number;
  page?: number;
  pageSize?: number;
};
```

Verification:

```bash
npm.cmd run test:run -- tests/quote-actions.test.ts tests/quote-ui.test.tsx
npm.cmd run build
```

---

## Release 6: QA, CSP, OAuth Cleanup

### Task 6.1: Restore Coverage Gate

**Files:**
- Modify: `tests/calculator.test.ts`

- [ ] Add branch coverage for `toPricingSettings` fallback branches in `lib/calculator.ts`.
- [ ] Keep `vitest.config.ts` threshold at 100% for calculator unless the user explicitly approves weakening it.

Verification:

```bash
npm.cmd run test:coverage
```

### Task 6.2: Tighten CSP

**Files:**
- Modify: `next.config.ts`
- Modify: `tests/security-headers.test.ts`

- [ ] Remove production `script-src 'unsafe-inline'` if Next.js runtime and current UI allow it.
- [ ] If inline script cannot be removed immediately, document the exact blocker and keep a test that prevents adding broader sources.
- [ ] Keep `style-src 'unsafe-inline'` only if Tailwind/shadcn runtime needs it.

Verification:

```bash
npm.cmd run test:run -- tests/security-headers.test.ts
npm.cmd run build
```

### Task 6.3: Require Auth Before Jobber OAuth Connect

**Files:**
- Modify: `app/api/jobber/connect/route.ts`
- Test: `tests/jobber-route-security.test.ts`

- [ ] Call `requireAllowedUser()` before generating OAuth state and redirecting to Jobber.
- [ ] Redirect unauthenticated users to `/login`.
- [ ] Redirect disallowed users to signout/not-allowed flow.
- [ ] Keep callback state validation unchanged.

Verification:

```bash
npm.cmd run test:run -- tests/jobber-route-security.test.ts
```

### Task 6.4: Decide Supabase Session Refresh Proxy Behavior

**Files:**
- Modify if needed: `proxy.ts`
- Modify if needed: `lib/supabase/middleware.ts`
- Modify: `docs/ARCHITECTURE.md`
- Test: auth middleware/proxy tests

- [ ] Confirm whether Next.js 16 proxy runtime supports the current Supabase SSR session refresh helper.
- [ ] If compatible, wire `updateSession()` into `proxy.ts`.
- [ ] If not compatible, document why layout-level `auth.getUser()` is the authoritative verification point.

Verification:

```bash
npm.cmd run test:run -- tests/app-layout-auth.test.tsx tests/supabase-server.test.ts
npm.cmd run build
```

---

## Designer-Focused UX Additions

### Backup And Security Status

- Add a compact internal operations panel only if the user wants visibility in the app.
- Suggested location: Settings bottom section.
- Display: last backup verification date, Jobber connection state, last Jobber sync failure, and current app version.
- Do not expose secrets, token values, raw customer lists, or debug payloads.

### Quote Save Failure Recovery

- On transaction failure, show one clear error toast or inline alert.
- Keep the user on the edit screen with current unsaved form state intact.
- For Jobber write-back failure, show "Local quote saved, Jobber sync failed" and a retry action.

### Pagination UX

- Add compact previous/next controls at the top and bottom of quote list.
- Preserve filters in the URL.
- Avoid infinite scroll for this internal tool because exact quote retrieval and predictable navigation matter more.

---

## Global Verification Checklist

Run after each release:

```bash
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:run
npm.cmd run build
npm.cmd audit --audit-level=high
git diff --check
```

Run before production DB migration:

```bash
npm.cmd run test:coverage
supabase --version
supabase migration list
```

Manual smoke after deployment:

- Login with allowed user.
- Confirm disallowed authenticated user cannot enter the app or use Data API.
- Create quote with materials, Product / Service lines, options, memos, and Roof selections.
- Edit the quote and confirm no child rows are lost.
- Trigger Jobber preview, save, and retry path.
- Confirm quote list search/month/year/page filters.
- Confirm Settings rejects `100%` margin.

---

## Recommended Execution Order

1. Get explicit user approval for the DB-level allowed-user RLS direction.
2. Implement Release 1 app-level helper and action guards.
3. Implement Release 1 DB RLS migration locally and verify with RLS tests.
4. Decide and document backup policy before production DB changes.
5. Implement Release 2 transaction RPC.
6. Implement Release 3 margin and Jobber token model alignment.
7. Implement Release 5 input limits and pagination.
8. Implement Release 6 coverage/CSP/OAuth/session cleanup.
9. Update docs and run full verification.
10. Apply production migrations only after explicit approval and backup verification.

---

## Open Approval Items

These are not blockers for writing tests or local design, but they are blockers for final production rollout:

- Approve changing the RLS access model from "any authenticated user" to "allowed authenticated users only".
- Approve the actual production backup policy.
- Approve production Supabase migrations after local verification.
- Jobber token connection decision is shared company-level; remaining work is limited to any separate reconnect/replace-token authorization hardening.
