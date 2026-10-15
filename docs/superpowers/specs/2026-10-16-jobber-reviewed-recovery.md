# Reviewed Jobber sync recovery

**Model:** GPT-6 Astra high for the explicitly routed implementation and independent review subagents. The main chat's model is not changed by this document.

**Request:** Fix the blocked sync for quote `dd7828b5-b21d-445d-819b-c2a2eeeb8d6a`, explain the cause, and provide recovery inside the app.

**Release state:** The user explicitly approved one production migration, app deployment and local recovery on 16 October after local verification. Jobber write-back is a separate action and is not included in this release approval.

## Incident evidence

- Operation `a49370a2-c6f0-49ac-ab9f-b66b4527edad` started against quote version 1 on 15 October 2026 at 12:53 Sydney time. All 16 journal steps are `applied`: 14 creates, one delete and one reorder. Its full completion result is null.
- The quote is now version 6. The guard records `reconciliation_required / quote_changed`. All current app line IDs are unlinked. Replaying the old operation could create duplicates; applying old positions to current rows could attach the wrong IDs.
- The existing app's read-only Jobber refresh succeeded on 16 October at approximately 09:29 Sydney time. Its snapshot has all 14 confirmed original IDs and a separately added Sliding Door line, for 15 remote rows. Current app rows also number 15. Several descriptions have since changed.
- The original priced Total request explicitly expects `optional: false, recommended: false`; the current Jobber response reports `optional: false, recommended: null`. A regression test reproduces the comparator rejecting this normal mandatory-line representation. The original transient response/log is unavailable, so this verified failure path is not presented as the sole proven historical trigger.
- The executor records the full result only after its last remote readback succeeds. A final-read mismatch/error can therefore leave every mutation applied with no completion record. Existing Check Jobber returns before reading remotely when that record is null, and cannot resolve older quote versions even when a result exists.

## Result and boundaries

The detail status offers **Review sync recovery**. An admin compares the latest saved app rows with a complete fresh Jobber read, explicitly reviews UUID-to-remote-ID associations and saves local recovery. No Jobber mutations occur during preview or recovery. The app keeps saved text, prices, materials, order and price history. A separate **Sync saved quote** action sends the saved quote only when explicitly selected.

The existing read-only Check Jobber path and automatic retry rules remain conservative. Recovery is refused for active leases, `sending` steps, unknown create results, legacy unjournaled operations, another quote's barrier, unsupported description-total mode and another unresolved operation for the same target.

## Connections and deletion preview

- Use current app row UUIDs, never old positional mappings.
- Suggest only unambiguous exact public-text matches among journal-confirmed IDs, or existing confirmed links. Every mapping is reviewed before saving. Remote rows added separately can be selected explicitly; they are never automatically adopted by a name/price guess.
- Require unique row and remote IDs, matching text/priced kinds, and explicit mappings for currently linked visible rows.
- Show the actual pending-removal set: existing pending deletions, known IDs from the old operation and linked hidden rows, minus reviewed mappings. Only present remote rows in this set will be removed on the next sync. Unrelated remote rows are kept unless explicitly linked. Absence of a previously deleted ID is harmless.
- Re-read remotely at confirmation and compare a fingerprint of all public remote values/order, plus the operation ID and quote version. A stale review requires reload and renewed acknowledgment.

## Atomic persistence

The additive migration introduces an admin-read-only recovery audit and the narrow `recover_jobber_sync_operation` RPC. Its transaction rechecks admin authorization, active quote, version, target, lease, journal results, duplicate associations and other blockers using the existing lifecycle advisory lock.

It updates only reviewed line IDs and pending deletion IDs, increments the quote version, resets the compatibility summary to `not_synced`, and retires only the reviewed predecessor as `superseded / recovery_reviewed`. It preserves the immutable operation payload and journal, does not invent a succeeded result, and retains the prior successful-sync timestamp. The same transaction records actor, versions, mappings, observed IDs and deletion candidates. Retired claims cannot resume or record late results.

## Recurrence prevention

For mandatory lines confirmed as `optional: false`, a requested `recommended: false` accepts an explicit remote `null`. Optional lines, missing fields, true recommendations, money, tax, types, IDs, text, ordering and deletion checks remain strict. The fixed comparator is shared by final sync readback and Check Jobber.

## Verification and release

Use real ephemeral PostgreSQL through the installed PGlite harness for migration/RPC rollback, authorization, mappings, history preservation and stale-worker tests. Unit/action/component tests cover normal/null recommendation, reviewed connections, fingerprint/version changes, duplicate selection, hidden/pending removal preview, asynchronous quote navigation and explicit-only sending. Run typecheck, lint, the complete suite and production build; verify the actual component with synthetic actions at desktop/mobile widths and keyboard interaction.

Before approved production rollout, export affected rows and verify migration compatibility. Apply only the reviewed additive migration, deploy the matching app, then use the authenticated UI to review the 15 current rows. Manually associate the separately added Sliding Door row and changed descriptions with their existing confirmed IDs. Preserve current app content and inspect the deletion list before local recovery. Do not send quote emails/messages. Real Jobber write-back remains a separate explicit user action.
