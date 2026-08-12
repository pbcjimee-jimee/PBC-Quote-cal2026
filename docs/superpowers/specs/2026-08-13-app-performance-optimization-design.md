# App Performance Optimization Design

**Date:** 2026-08-13
**Status:** Approved
**Scope:** Login completion, PWA startup, authenticated navigation, quote detail, Jobs, Inventory, Quote Form, Settings, and loading feedback

## Problem

The public login document is already CDN-served and reasonably small, but work after login and most authenticated navigations remain slow. Production and source analysis found several independent costs that stack on the critical path:

1. Vercel Functions execute in `iad1` while Supabase is in Sydney (`ap-southeast-2`). Every authenticated request pays cross-Pacific latency for Auth and database calls.
2. Login and protected routes contain several sequential remote waves. PWA startup adds another document request because `start_url: '/'` authenticates, resolves a role, and redirects before the destination authenticates again.
3. Quote detail overfetches every column and all nested history before enriching missing user names.
4. Jobs repeatedly reads the shared Jobber token and reads/parses all stored snapshots even when only the visible jobs are needed.
5. Inventory sends up to 500 records to one client component and renders desktop and mobile representations of the same data.
6. Quote Form serializes a large draft to `localStorage` synchronously during active editing.
7. Settings keeps all tab implementations in one eager client module even though data loading is already tab-scoped.

Recorded reference timings are approximately 4.09 seconds for first Settings entry, 2.69 seconds for quote detail, and 2.03–2.28 seconds for a warm Jobs load. An unauthenticated dynamic request that stops after Auth already has about 0.67-second median TTFB from Australia.

## Goals

- Put Vercel Functions in Sydney so dynamic compute is colocated with Supabase.
- Reduce PWA startup from two authenticated document requests to one.
- Preserve live active-profile and role checks on every protected request.
- Reduce quote-detail data transfer and eliminate per-user Auth Admin fan-out when a profile row exists.
- Reuse one Jobber token context per top-level operation and bound snapshot reads to visible job IDs.
- Keep initial Inventory payloads at 50 records or fewer and support incremental loading without hiding matching records from search.
- Move Quote Form draft persistence off the keystroke critical path while preserving crash/navigation recovery.
- Load inactive Settings tab code only when selected.
- Provide route-shaped loading fallbacks within 100ms of navigation intent.
- Add no external dependency and do not apply a production DB migration in this branch.

## Non-goals and guarded follow-ups

- Do not cache authenticated HTML, RSC payloads, API responses, sessions, profiles, quotes, jobs, or customer data in the service worker or a public cache.
- Do not change quote calculations, Decimal handling, price snapshots, Jobber write-back, role permissions, or RLS behavior.
- Do not switch page protection from `auth.getUser()` to `auth.getClaims()` in this branch. `getClaims()` can remove an Auth network call with asymmetric signing, but it does not confirm server-side session revocation. That security decision needs operating-policy approval and an expiry/revocation test plan.
- Do not add `pg_trgm`, change RLS policies, normalize Jobber snapshot tables, or move revision allocation into a new RPC without a separately reviewed migration and explicit production-DB approval.
- Do not change Vercel environment variables or domains.

## Design

### 1. Sydney compute and direct PWA landing

Add `"regions": ["syd1"]` to `vercel.json`. Vercel documents `iad1` as the default Function region and recommends placing Functions close to their data source. `syd1` maps to AWS `ap-southeast-2`, matching the Supabase project.

Change the PWA manifest `start_url` from `/` to `/jobs`. `/jobs` is the only useful protected destination shared by both admins and supervisors, so it avoids the role-aware `/` redirect and does not use a client-side role hint for authorization. Admins can still navigate to New Quote from the protected shell. The live server-side profile and role guard remains authoritative.

The root `/` route stays unchanged for normal browser visits and direct links.

### 2. Authentication boundary

Keep the existing request-scoped `React.cache()` guard and `auth.getUser()` semantics. Add regression coverage around PWA startup and protected route access, but do not add a second cross-request cache or store authorization in JWT user metadata.

The active `user_profiles` row remains the source of role, Jobber identity, and access revocation. The route and data actions continue to call `requireAppUser()` or `requireRole()`.

### 3. Quote detail data path

Replace wildcard quote-detail selects with explicit columns for the quote and each nested relation. The selected fields must be derived from the existing `QuoteRecord` mapper and edit/detail consumers, and both the normal and memo-fallback query shapes must remain supported.

Resolve author names in two bounded stages:

1. Seed the current authenticated profile as today.
2. Read all remaining IDs from `user_profiles` in one `.in('id', ids)` request.
3. Use Auth Admin only for legacy IDs missing from `user_profiles`.

Pass the Jobber refresh client a small immutable DTO instead of the complete `QuoteRecord`. The DTO contains only the quote ID, Jobber quote ID, refresh timestamps/status, and the fields rendered by the refresh panel.

### 4. Jobber request context and bounded snapshots

Create a request-scoped Jobber gateway object that acquires the shared token once, supplies client options to all operations, and performs at most one coordinated refresh/retry after a 401. Top-level job actions create one context and pass it through team, list, detail, expense, and assignment-visit operations.

Add `listJobSnapshotsByIds(ids)` using the indexed `jobber_job_id` column. Empty input returns immediately. Jobs list actions first obtain visible Jobber IDs, then fetch only those snapshots. Single-detail paths continue to use `getJobSnapshot()`.

Supervisor authorization stays live and is never inferred only from a cached snapshot.

### 5. Inventory bounded loading

Introduce an `InventoryPageResult` containing `items`, `nextOffset`, and `hasMore`. The initial route requests 50 rows. The client can request the next page and merges by ID.

Search and status/category filters are sent to the server after a short debounce and reset pagination. This prevents a 50-row client subset from silently hiding matches. Mutations continue to update the visible local collection immediately; a refresh of the active query reconciles counts and ordering.

Desktop/mobile duplicate rendering is reduced to the bounded visible page in this release. A single responsive renderer is a later visual redesign because replacing the table and disclosure card markup together has accessibility and pre-hydration tradeoffs.

### 6. Quote Form draft persistence

Extract draft persistence into a hook with a 300ms trailing debounce. Edits update React state immediately; JSON sanitization and `localStorage.setItem()` run after the user pauses. A pending write is flushed on `pagehide` and component unmount, while successful save/explicit clear cancels the timer and removes the stored draft.

The persisted schema and existing recovery prompt stay unchanged. Calculation and save payload creation still use current in-memory state, never the delayed stored copy.

### 7. Settings code splitting and loading feedback

Keep Labour Rates in the initial Settings client chunk. Move Material, Product & Service, Template, and Area tab bodies into separate modules loaded with `next/dynamic` when their tab becomes active. Preserve the existing resource state/in-flight deduplication controller and mount each inactive editor only after its code and required data are ready.

Add route-specific loading files for quote overview/new/detail/edit, job detail, and Inventory. Skeletons must match the final page geometry, avoid customer data, and keep existing accessible `role="status"` behavior.

### 8. Measurement and rollout

Every task uses test-first RED → GREEN verification. Before integration, run diff check, typecheck, lint, the full Vitest suite, coverage, production build, and production dependency audit.

After a preview deployment:

1. Confirm `vercel inspect` lists Function outputs in `syd1`.
2. Compare the same cold/warm public and authenticated routes against the saved baseline.
3. Verify no authenticated RSC/API payload is service-worker cached.
4. Promote only if errors, auth behavior, quote calculations, and Jobber authorization remain unchanged.

## Performance acceptance criteria

- Login click to usable role page: p75 ≤ 1.5s, p95 ≤ 2.5s under the agreed Australian test profile.
- PWA launch: one protected document request before useful content; at least 25% faster than the `/` redirect baseline.
- Warm protected shell/Overview: p75 ≤ 800ms.
- First Settings content: p75 ≤ 1.5s and at least 50% faster than the recorded 4.09s.
- Quote detail core content: p75 ≤ 1.5s or at least 40% faster than the recorded 2.69s.
- Warm Jobs completion: at least 25% faster than the 2.03–2.28s reference; loading shell visible ≤ 300ms.
- Quote Form input commit with 50 materials and 5 options: p95 ≤ 50ms.
- Inventory initial records ≤ 50; server-filter response p95 ≤ 300ms and client filter commit p95 ≤ 100ms.
- Core Web Vitals p75: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.
- No new automatic prefetch fan-out for quote/job detail routes.

## Rollback

- Region and PWA changes are single configuration reversions.
- Each data/client optimization is an independent commit with focused regression tests.
- No schema migration is required to roll back this branch.
- If preview authentication or Jobber authorization regresses, do not promote; revert the responsible commit while retaining the Sydney region change for isolated re-measurement.
