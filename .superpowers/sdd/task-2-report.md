# Task 2 Report — PWA Release 2 minimal service worker and offline fallback

## Scope implemented

- Added a statically rendered public `/offline` page with PBC branding, an explicit no-offline-data message, and a retry link.
- Added dependency-free `public/sw.js` with cache `pbc-quote-offline-v1`.
- Precache is restricted to `/offline` and the branding asset `/icons/icon-192.png`.
- Navigation requests are network-first and use `/offline` only after a rejected network request.
- Non-navigation requests are not intercepted. There is no runtime cache write path and no quote, API, Supabase, Server Action, RSC, authenticated HTML, or price-data cache.
- Activation deletes only old caches beginning with `pbc-quote-offline-`, preserves unrelated caches, and calls `clients.claim()`.
- Added production-only, capability-guarded `/sw.js` registration and mounted it in the root layout.
- Added the exact `/sw.js` `Cache-Control: public, max-age=0, must-revalidate` header rule.
- No dependencies, DB state, Vercel environment, or domain settings changed.

## TDD evidence

### RED

Command:

```text
npm.cmd run test:run -- tests/pwa-service-worker.test.ts
```

Observed output (exit 1):

```text
Test Files  1 failed (1)
Tests       8 failed | 1 passed (9)
Duration    683ms
```

Expected failures were observed for all missing Release 2 behavior:

- no install, activate, or fetch service-worker handlers;
- no guarded service-worker registration component;
- no root-layout registration mount;
- no offline page;
- no exact `/sw.js` response header.

The one passing assertion confirmed the empty pre-implementation source did not contain a runtime cache write.

### GREEN — new focused tests

Command:

```text
npm.cmd run test:run -- tests/pwa-service-worker.test.ts
```

Observed output (exit 0):

```text
Test Files  1 passed (1)
Tests       9 passed (9)
Duration    667ms
```

### Related focused regression run

Initial command:

```text
npm.cmd run test:run -- tests/pwa-service-worker.test.ts tests/pwa-metadata.test.ts tests/proxy.test.ts tests/security-headers.test.ts
```

Observed output (exit 1):

```text
Test Files  1 failed | 3 passed (4)
Tests       1 failed | 20 passed (21)
```

The existing security-header test expected the headers array to contain exactly one rule. It was updated to keep validating the global security rule while permitting the required exact `/sw.js` rule.

Final focused command:

```text
npm.cmd run test:run -- tests/pwa-service-worker.test.ts tests/pwa-metadata.test.ts tests/proxy.test.ts tests/security-headers.test.ts
```

Observed output (exit 0):

```text
Test Files  4 passed (4)
Tests       21 passed (21)
Duration    950ms
```

## Verification

### TypeScript

```text
npm.cmd run typecheck
Exit code: 0
tsc --noEmit
```

### Lint

The first run found one Next.js navigation rule violation on the offline retry anchor:

```text
app/offline/page.tsx
28:9  error  Do not use an <a> element to navigate to /. Use <Link />
```

The retry action was changed to `next/link`, then lint was rerun:

```text
npm.cmd run lint
Exit code: 0
eslint
```

### Full tests

```text
npm.cmd run test:run
Exit code: 0
Test Files  62 passed | 1 skipped (63)
Tests       522 passed | 2 skipped (524)
Duration    13.37s
```

The skipped file/tests are the existing environment-conditional tests.

### Production build

```text
npm.cmd run build
Exit code: 0
Compiled successfully
Generating static pages (15/15)
/offline: static
```

### Diff hygiene

```text
git diff --check
Exit code: 0
```

`next-env.d.ts` was automatically rewritten by the build and restored to the committed version; it is excluded from this task's commit.

## Files

- `app/layout.tsx` — mounts service-worker registration.
- `app/offline/page.tsx` — static branded offline fallback and retry action.
- `components/pwa/service-worker-register.tsx` — production/support registration guard.
- `next.config.ts` — exact `/sw.js` revalidation header.
- `public/sw.js` — minimal offline-only service worker.
- `tests/pwa-service-worker.test.ts` — cache-policy behavior, registration, offline UI, and header tests.
- `tests/security-headers.test.ts` — preserves the global-header assertion with multiple header rules.
- `.superpowers/sdd/task-2-report.md` — this report.

## Self-review

- Cache names are app-owned by the narrow `pbc-quote-offline-` prefix; activation does not delete unrelated caches.
- The only `caches.open` call is in install. The fetch handler never opens or writes a cache.
- Successful navigation responses, including authenticated quote HTML, are returned directly and never stored.
- API, Supabase, Server Action, and RSC traffic is non-navigation traffic and receives no `respondWith`, cache lookup, or service-worker fetch handling.
- Offline fallback occurs only when `fetch(event.request)` rejects, not for successful HTTP responses.
- The offline document contains no quote or price information and explicitly tells users that such data is not stored offline.
- Registration is skipped outside production and when service workers are unsupported.
- No new dependency or unrelated refactor was introduced.

## Concerns

- Browser-level offline behavior was not exercised against a deployed HTTPS origin in this task. Unit behavior and the production build are verified; deployment/device validation remains part of the later PWA QA release.
- The fallback intentionally precaches only its HTML and one public icon. Next-generated styling/runtime chunks are not service-worker-cached to preserve the strict no-runtime-cache policy, so a first-ever offline render may be minimally styled if the browser has no ordinary HTTP cache.
