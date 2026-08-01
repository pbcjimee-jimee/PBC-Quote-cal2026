# Role / Progress Invoice Separation Design

**Date:** 2026-08-01

**Branch:** `role`

**Status:** Approved

## Goal

Ship the admin/supervisor role split and Job Expenses without shipping any Progress Invoice application feature. The `role` branch must have a deployable final tree containing the existing quote application plus roles, users, inventory permissions, and Job Expenses only.

## Confirmed boundary

### Included in `role`

- `user_profiles` with `admin` and `supervisor` roles
- session-derived server authorization and route guards
- admin user management under `/settings/users`
- supervisor inventory access under `/inventory`
- admin/supervisor Job Expenses under `/jobs`
- `Job Expenses` navigation immediately below `New Quote`
- Jobber read-only job, expense, and profit retrieval
- service-role-only `jobber_job_snapshots`
- the current production `main` quote behavior, including the quote-item price hotfix

### Excluded from `role`

- `/progress-invoices` routes and navigation
- Progress Invoice Server Actions, services, components, Jobber routes, and UI
- Progress Invoice database migrations and pgTAP suites
- Progress Invoice runtime dependencies that are not required by roles or Job Expenses
- any production mutation of existing Progress Invoice tables, functions, policies, grants, or migration history

Progress Invoice remains owned by its separate feature branch and is not part of the `role` deployment artifact.

## Git strategy

The existing `role` history already contains Progress Invoice ancestors and has been pushed. Rewriting that history would require a prohibited force push. Separation will therefore be enforced at the branch's final tree, build output, migration set, and deployment artifact through normal additive commits.

The target tree is conceptually:

```text
origin/main
  + role/profile authorization
  + role-scoped inventory and admin settings
  + Job Expenses
  + role-specific tests and documentation
  - Progress Invoice application and migration files
```

The implementation must preserve the `role` branch name, avoid changes to `main`, and use ordinary commits and pushes only.

## Application architecture

### Navigation and routes

Admin navigation contains the existing quote and settings features plus `Job Expenses`. Supervisor navigation contains only `Job Expenses` and `Inventory`. Neither role sees a Progress Invoice navigation item, and the production Next.js route manifest contains no `/progress-invoices` route.

The route guards remain:

- admin: all existing quote/settings routes, `/jobs`, and `/inventory`
- supervisor: `/jobs` and `/inventory` only
- missing or inactive profile: rejected and signed out through the existing authorization flow

### Server Actions

Role guards are applied only to actions present in the target application. Quote, price, product, template, and settings actions require admin. Inventory reads and movement-field updates allow either role; inventory identity changes and lifecycle actions require admin. Job Expenses actions authorize from the session profile and never trust a client-supplied role or user identifier.

No Progress Invoice action or Jobber Progress Invoice route is compiled into the `role` application.

### Jobber boundary

The Job Expenses implementation keeps the G1 read contract:

- `PbcTeamUsers`
- `PbcUserJobs`
- `PbcJobExpenses`

No new Jobber mutation or OAuth scope is introduced. Supervisor assignment continues to use the server-side `user_profiles.jobber_user_id` mapping.

## Database boundary

The `role` branch owns exactly three new database changes:

1. `user_profiles` and `app_auth.current_role()`
2. role RLS for the quote application and inventory
3. service-role-only `jobber_job_snapshots`

The role RLS migration must not reference any Progress Invoice table or function. It protects the quote application's admin-only tables, permits the documented inventory operations, and leaves Jobber token/snapshot tables service-role-only.

The production Supabase project already contains unapplied-to-`role` Progress Invoice schema objects. Those objects are out of scope and must not be altered, dropped, renamed, wrapped, granted, revoked, seeded, or recorded as `role` migrations.

Because those existing objects currently allow authenticated access through permissive policies and `SECURITY DEFINER` RPCs, a supervisor account must not be created and the `role` application must not be promoted to production until the separate Progress Invoice branch supplies and verifies its own access-lock migration. This is a deployment prerequisite owned outside `role`, not an implementation dependency copied into `role`.

Role migrations will be applied individually after checking remote migration history. A blanket `supabase db push` from `role` is not allowed while the remote project has Progress Invoice-only migration versions absent from this branch.

## Test strategy

Implementation follows RED → GREEN and keeps the existing verification gate.

### Role behavior

- admin/supervisor route and navigation matrix
- supervisor access limited to `/jobs` and `/inventory`
- admin-only Server Action rejection for supervisor sessions
- inventory field-level restrictions
- `user_profiles` and service-role cache policies
- Job Expenses assignment, pagination, refresh, and profit calculations

### Separation boundary

- focused route/build verification confirms `/progress-invoices` is absent from the Next.js output
- dependency and import checks confirm no Progress Invoice runtime module is reachable from the role application
- migration validation applies the `role` migration set to a clean quote-schema baseline without requiring Progress Invoice objects
- the role RLS migration has no dependency on Progress Invoice tables or functions

### Full verification

- `npm.cmd run verify`
- fresh local Supabase reset using the role-only migration history
- pgTAP role matrix
- local anon/authenticated integration checks
- supervisor security tests

## Deployment gates

### Role G2

G2 can complete locally once the role-only tree, migrations, and tests are green. The evidence report must state that Progress Invoice is absent from the build and local migration set.

### Production prerequisite outside `role`

Before any supervisor is created or `role` is promoted:

1. the separate Progress Invoice branch locks its existing tables and privileged RPCs against supervisor access;
2. that branch verifies the lock against the production-shaped schema;
3. the user separately approves that Progress Invoice security migration;
4. the migration is applied without deploying the Progress Invoice application.

Only after this prerequisite may the `role` migrations, admin bootstrap, supervisor mapping, and Vercel production deployment proceed.

## Non-goals

- deploying or exposing Progress Invoice
- merging the Progress Invoice feature branch into `role`
- modifying `main`
- rewriting `role` history
- removing existing Progress Invoice production data or schema
- changing Jobber OAuth scopes or adding mutations
- adding dependencies

## Acceptance criteria

- `role` HEAD contains no Progress Invoice runtime routes, components, actions, services, or migrations.
- `Job Expenses` appears immediately below `New Quote` for admin and supervisor.
- supervisor navigation and route access are limited to Job Expenses and Inventory.
- the role-only migration chain can be validated without Progress Invoice schema objects.
- all role, RLS, supervisor security, Jobber fixture, build, lint, typecheck, and coverage gates pass.
- no production Supabase or Vercel change occurs before the separate Progress Invoice access-lock prerequisite is approved and verified.
