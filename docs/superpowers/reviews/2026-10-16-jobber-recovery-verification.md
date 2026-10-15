# Jobber recovery verification — 16 October 2026

**Status:** User-approved production migration, deployment and actual quote recovery are complete. The quote is version 7, all 15 public rows are linked, and the old blocking operation is retired with an audit. No Jobber mutations or quote messages were performed.

## Changes

- Treat explicit `recommended: null` as requested false only on a confirmed mandatory (`optional: false`) remote line. Other recommendation/optional mismatches still fail.
- Add admin **Review sync recovery**, full remote re-read/fingerprint, current row UUID mapping, exact deletion preview and fresh-review acknowledgment. Local recovery preserves quote content and is followed by a separate explicit **Sync saved quote** action.
- Add `20261016092708_add_reviewed_jobber_sync_recovery.sql`: narrow RPC and admin-read-only audit table. Retire only the reviewed predecessor, revoke its claim, preserve immutable history, increment quote version and retain pending deletes atomically.
- Refuse sending/unknown-create evidence, active leases, legacy records, different quotes/targets, other unresolved operations, unsupported save modes and stale versions/reviews.

## Root cause and live observations

Direct production SELECT verified 16 applied steps (14 creates, delete, reorder), no sending step, no full result and a version-1 operation blocking version 6. The existing authenticated production app successfully refreshed Jobber on 16 October at approximately 09:29 Sydney time. All 14 created IDs remain present; Jobber and the app now have 15 public rows, including a later Sliding Door row. The app's remote IDs are null, so blind retry or old position mapping is unsafe.

The stored original Total request expects `recommended: false` while the current Jobber snapshot returns null for that mandatory line. Tests reproduce both the strict-comparator failure and successful fixed full transport readback. This establishes a concrete recurrence path; the original failing response/log was not retained, so an additional initial network/readback failure cannot be ruled out. Later description changes also mean the old snapshot cannot simply become the current quote's successful result.

## Automated verification

- Failing regression observed before the nullable-recommendation fix; related transport/reconciliation tests subsequently passed.
- Final full suite with coverage: **1,329 passed, 19 environment skips; 131 passing files and 3 skipped files**.
- Coverage thresholds pass: statements 86.61%, branches 75.96%, functions 94.68%, lines 91.36%. New recovery action statements/lines/functions 100%; recovery domain lines 100%.
- Real ephemeral PostgreSQL (installed PGlite) applies the migration chain and passes 27 recovery tests, including rollback, authorization, explicit live-only associations, hidden/pending deletions, current edits/material/history preservation, stale-worker rejection and unsupported modes.
- Whole-project TypeScript, ESLint, production build (19/19 routes) and `git diff --check` pass.
- Impeccable detector reported no findings for the changed component/CSS files. Existing project tokens and design were preserved.
- Independent read-only review found deletion-preview divergence and a missing SQL save-mode guard; both were fixed with regressions and re-reviewed. No remaining confirmed P0–P2 findings in the reviewed change.

## Browser verification

Used a separate local Next.js 16.3.8 fixture with the production component/CSS and only the action/router boundaries replaced by synthetic responses. No live API is used by that fixture. The source is mirrored with those import substitutions because a direct webpack alias did not replace Next's transformed Server Action reference.

- 360px and 390px: no horizontal overflow; long Korean/English content wraps; selects use 16px text and 45px height; buttons are at least 44px.
- 1280px: two aligned comparison columns, no overflow. Also checked the completion state at intermediate viewport sizing; restored the browser's original viewport afterward.
- Native select keyboard/Tab movement and Space acknowledgment work. Duplicate connections block submission; any mapping change resets acknowledgment.
- Explicit manual association for the separately added row removes the duplicate-creation warning. Unrelated unselected remote rows remain visible as kept.
- Local recovery reaches “Nothing has been sent to Jobber” with a separate Sync saved quote button. No automatic sync occurs. Browser console errors: zero in the inspected fixture.

These are desktop-browser viewport tests, not physical mobile/touch tests. Real authenticated production recovery subsequently passed as recorded below. Multi-session concurrency and live Jobber write-back have not run.

## Approved release scope

The user approved one additive production migration, deployment of the matching app and local recovery of this quote after reviewing its 15 associations. The approved scope preserves current app text/prices/materials, including the three changed descriptions, and explicitly associates the separately added Sliding Door item. Jobber write-back remains the separate in-app Sync saved quote action.

Approval is required by `AGENTS.md` and `docs/SECURITY.md` for production DB migrations. The existing 17 September design excluded manual recovery from that release; the user requested this additive recovery flow on 16 October. The implementation and release scope are described in `docs/superpowers/specs/2026-10-16-jobber-reviewed-recovery.md`.

## Production result

- Code commit/main: `619294e1a5da99827b5f627d2443b452551ad347`. GitHub PR creation returned integration permission 403; the reviewed branch was fast-forwarded and pushed through the configured project SSH account. No force push, reset or environment/domain setting changes.
- Isolated Preview migration `20261015224423`; production migration `20261015224635`. Preview has no Jobber tokens. RLS enabled, anon RPC denied, authenticated direct audit insertion denied; authenticated rollback smoke passes in both databases with zero retained test rows.
- Relevant data/journal backup: `.codex/tmp/jobber-recovery-release-backup.json`, SHA-256 `6c2cbae63a6d32facbcf5a34670b6f6630c1b070d7c1183c11f12474d12903ca`. Operations 39/steps 364 were backed up. Quote, lines, operations and steps have identical checksums immediately before/after migration. Running/active transactions were zero and old-deployment runtime logs showed no recent invocations in the inspected window.
- Preview `dpl_FQZ28HDsXMSyk8D1kyLzNCeUd7AN` is READY/syd1; protected login fetch returned 200 and its CSP restricts Supabase connections to isolated `wzntbkdkessgbgoyekir`.
- Production `dpl_DkbdTZVHjQaHzM2JQ3cCvN1qUw9x` is READY/syd1 with the existing production aliases. Login, manifest, offline page and service worker return 200; service-worker revalidation header is preserved. No error/fatal runtime logs appeared in the inspected new-deployment window.
- The actual authenticated production recovery screen read the complete live quote successfully. Eleven associations were unambiguous suggestions; Bedroom 1, Master Bedroom, the separately added Sliding Door, and Total were reviewed and explicitly selected. All 15 mappings were unique, with zero present remote rows marked for creation/removal.
- **Actual local recovery committed at 16 October 09:51:26 Sydney time.** The quote advanced 6→7; operation `a49370a2-c6f0-49ac-ab9f-b66b4527edad` became `superseded / recovery_reviewed`, preserving its null result and immutable history. The audit records the active admin and all 15 associations.
- Byte-equivalent canonical comparisons against the backup confirm parent content (excluding expected metadata), all public row contents (excluding the new links), materials and price history unchanged. All 15 rows now have remote IDs. Operations/steps remain 39/364, with no new sync operation, mutation step or Jobber write. One already-absent deletion tombstone remains safely pending.
- The live browser displays “Recovery complete. Your saved edits are preserved. Nothing has been sent to Jobber.” and the separate **Sync saved quote** button. That button was not clicked. Current app/Jobber descriptions intentionally remain independently preserved until an explicit subsequent sync.
