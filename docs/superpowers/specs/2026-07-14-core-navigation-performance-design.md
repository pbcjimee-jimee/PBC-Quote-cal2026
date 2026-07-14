# Core Navigation Performance Design

**Date:** 2026-07-14
**Status:** Approved
**Scope:** Overview, New Quote, Settings, quote detail navigation and perceived response time

## Problem

Production measurements showed that authenticated page transitions are visibly slow even when a loading skeleton appears:

| Transition | First visible feedback | Ready |
|---|---:|---:|
| New Quote → Settings | about 0.5s | about 4.5s |
| Settings → New Quote | about 0.5s | about 2.9s |
| Settings → Overview | about 0.6s | about 2.9s |
| Overview → quote detail | about 0.9s | about 5.1s |

Vercel request logs and code inspection identified three primary causes:

1. Next.js viewport prefetch starts requests for every visible quote detail row and every sidebar destination. These cache-miss requests compete with the route the user actually selects.
2. `/settings` waits for pricing settings, products, Product & Service items, templates, and areas even though the initial Labour Rates tab only needs pricing settings.
3. `getQuote` waits for a service-role Auth Admin profile lookup after the quote query, including when the only referenced user is already available from `requireAllowedUser()`.

## Goals

- Show navigation feedback within 100–200ms of a click.
- Remove quote-detail and sidebar viewport-prefetch request fan-out.
- Load Settings with only the data required by the visible tab.
- Avoid an Auth Admin round trip for quote details owned and revised only by the current user.
- Preserve Jobber quote fetch, refresh, snapshot, and Save & Sync behavior.
- Add no dependency, database migration, environment-variable change, or cross-request data cache.

## Design

### 1. Intent-based navigation

Create a shared `IntentLink` client component around Next.js `Link`.

- Set `prefetch={false}` so viewport visibility does not start authenticated route requests.
- Call `router.prefetch()` once per link after pointer hover, keyboard focus, or touch intent.
- Use `useLinkStatus()` to render a fixed, non-layout-shifting progress indicator while the selected route is pending.
- Apply it to sidebar/mobile navigation, brand links, overview quote rows, and quote card View/Edit actions.

This keeps useful prefetching for genuine user intent while preventing 100 visible quote rows from generating competing serverless and Supabase work.

### 2. Settings tab data boundaries

The Settings server page loads only pricing settings. `SettingsForm` treats other initial collections as optional:

| Tab | Data loaded on first activation |
|---|---|
| Labour Rates | pricing settings from the server page |
| Material | products, limit 200 |
| Product & Service | Product & Service items, limit 300 |
| Template | templates plus Product & Service items if not already loaded |
| Area | reusable areas |

Each resource has `idle`, `loading`, `loaded`, or `error` state. In-flight and loaded resource refs prevent duplicate requests during rapid tab changes. A tab becomes active immediately, then shows a compact skeleton. Errors stay local to that tab and expose Retry. Successful data remains in component state for the rest of the mounted Settings session.

Existing mutation actions continue to update the same component arrays, so add/edit/delete/import behavior does not change after the initial load.

### 3. Quote detail profile reuse

After `requireAllowedUser()` succeeds, convert that user to the existing `UserProfile` shape and seed the detail profile map. Remove the current user ID from the IDs passed to `getAuthUserProfilesById()`.

Only revision authors or creators different from the current user require Auth Admin lookup. The quote query shape and all Jobber snapshot fields remain unchanged.

### 4. Jobber isolation

The optimization does not modify:

- `components/quote-form/quote-form.tsx` Jobber fetch handler;
- `app/api/jobber/quote/[quoteId]/route.ts`;
- Jobber OAuth/token refresh;
- snapshot refresh/diff persistence;
- public Product & Service line write-back or retry.

New Quote still loads areas and quote line templates because those are required by the quote workspace and Jobber public-line editor. Only the Settings management page defers its inactive-tab collections.

## Error and accessibility behavior

- Pending navigation adds a visible top progress bar and an `aria-live` loading announcement without shifting content.
- Settings tab buttons remain immediately operable and expose the selected tab with `aria-selected`.
- Loading content uses `role="status"`; failures use `role="alert"` and a Retry button.
- Existing route-level skeletons remain the fallback for direct navigation and server rendering.

## Verification

### Automated

- Intent links disable automatic prefetch and issue one manual prefetch for repeated intent events.
- Overview rows and app navigation use intent links.
- Settings page does not call inactive-tab list actions during server render.
- First tab activation loads only its required resource, caches success, deduplicates in-flight work, and supports retry.
- Current-user quote details do not create a service-role client; a different revision author still does.
- Existing Jobber quote route, refresh, UI, and write-back tests remain green.
- `npm.cmd run verify` passes.

### Browser/performance

- Opening Overview creates no automatic request for every visible `/quotes/[id]` route.
- First visible click feedback is at most 200ms.
- Settings ready time improves from about 4.5s toward 2.0s or better.
- Quote detail ready time improves from about 5.1s toward 3.0s or better for the current-user path.
- Main affected transitions improve by at least 30% under comparable production conditions, with network variability reported separately.

## Out of scope

- Cross-request caching or cache invalidation tags.
- Supabase schema/index changes.
- Jobber API or sync behavior changes.
- Changes to Vercel environment variables or domains.
- New external packages.
