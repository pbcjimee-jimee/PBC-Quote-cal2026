# Preview isolation — 2026-09-25

[태스크] Jobber 없는 테스트 Preview 분리

**Model:** Codex (coordination); GPT-5.6 Sol high (implementation/review subagents, latest user instruction)

**Input docs:** AGENTS.md, PROGRESS.md, DECISIONS.md, AGENT-MAP.md, BACKLOG.md, SECURITY.md, CODING-STYLE.md, ARCHITECTURE.md, DEPLOY.md, CLI-ACCESS.md, DB-SCHEMA.md.

## Approved scope

User approved a separate Preview DB with all server-side Jobber connection, reads, token refresh and writes disabled. Materials, options, calculation, local public-line editing, authentication and ordinary quote Save remain available. Production DB, environment values and Jobber connection remain unchanged. User separately approved an isolated worktree.

Base: clean local main/origin/main `19d705109ba0f097d995041db650c5db17ea24e9`. Work branch: `codex/preview-isolation`.

## Implementation

- Server authority uses `VERCEL_ENV === 'preview'`, not `NODE_ENV` or a client-controllable flag.
- Guard OAuth routes, token reads/refresh, GraphQL query/mutation boundaries, Jobs gateway/actions, quote sync/import/refresh/check/retry and durable operation requests/claims. Reject Sync before saving or enqueueing, without silently converting it to ordinary Save.
- Server-derived UI availability disables Jobber-only controls and provides an explanation. Local stored-snapshot option copying and manual public-line editing stay available.
- Build validation and server Supabase clients reject a Preview configured with anything other than `wzntbkdkessgbgoyekir`, missing/mismatched keys, auth bypass or Jobber credentials/callbacks. Legacy JWT project/role checks are configuration checks, not signature verification; live test-key validation is also required. Opaque modern keys are verified against the test endpoint during provisioning.
- Preview CSP permits browser connections only to itself and the test Supabase endpoint. Production CSP is unchanged.
- `.vercelignore` excludes local environment files, credentials, backups and agent work folders. A real CLI dry-run caught ignored Git files still appearing in the deployment input; after the fix the input contained 424 files and zero private files. No upload took place during either dry-run.

## Environment procedure

1. Obtain keys only for the explicitly named test project; verify test Auth and RLS reads before configuration changes.
2. Preserve existing Production environment records and values. Send only a target change to Production, then create five Preview-only Supabase/auth configuration records.
3. Verify record IDs/types/ciphertext preservation and scopes, no Preview Jobber variables, and unchanged Production deployment/health.
4. Build/deploy the reviewed branch as Preview, then verify authenticated local Save and Jobber rejection. Never promote a Preview-built artifact to Production because browser Supabase variables are inlined at build time; rebuild main with Production configuration.

Existing immutable Preview deployments do not receive new environment values. They must not be used as evidence of isolation, and must be separately inspected before reuse. This task does not delete old deployments or rotate Production keys.

## Evidence (in progress)

- Fresh isolated baseline: 119 test files / 1,040 tests passed; 3 files / 19 tests skipped.
- Production dependencies: npm audit --omit=dev reports zero vulnerabilities.
- Test project: synthetic admin `97063916-aec6-424d-9896-629999c70dd3`, three synthetic Areas, successful password login and authenticated Area reads, Jobber tokens zero. No Production customer data or tokens copied.
- Supabase CLI login refreshed; keys and generated test credentials remain outside tracked files and are not printed.
- Full `npm run verify`: typecheck, lint, 1,094 passing tests (19 environment-dependent skips), coverage thresholds, production build and production dependency audit passed. The added CSP regression subsequently passed in the 22-test environment suite. Preview-mode build also passed.
- Independent final source/UI review: no Critical, Important or Minor findings; focused reviewer run 452 tests passed.
- Final test:run after CSP regression: 1,095 passed / 19 skipped.
- Vercel scope switch complete: 10 original Production-only record IDs/types/returned value representations unchanged; zero Production value fields sent. Five Preview-only test variables; zero Preview Jobber variables. Resumable script/inventory recovery reviewed independently before execution. Sensitive values are not decryptable and no plaintext-hash comparison is claimed.
- Authenticated local production-build HTTP Server Actions passed create/update Save, material/option snapshot preservation and rejected Sync with unchanged version/data and zero operations. Test quote `26401694-6bb5-4b33-8826-3eb48653596a` reached version 2. An earlier harness decode failure happened after another synthetic create; test records remain in the isolated test DB for inspection, not in Production.
- Local Preview routes: login HTTP200; Jobber connect/callback/quote HTTP503 with the fixed disable response.
- Deployed Preview checks: pending.

## Out of scope / limits

No new schema migration, Production DB write, Production credential rotation, live Jobber mutation, paid resource or unrelated backlog implementation. This restricted Preview cannot establish live Jobber end-to-end correctness without a separate authorized Jobber test account.
