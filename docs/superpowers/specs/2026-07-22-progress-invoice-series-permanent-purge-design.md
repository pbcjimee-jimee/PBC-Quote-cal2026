# Progress Invoice Series Permanent Purge Design

**Date:** 2026-07-22
**Status:** Draft for final review; Scope A direction approved
**Scope:** Separate non-destructive Series Void from permanent deletion of a Claim-free Progress Invoice Series

## Decision

Progress Invoice Series will have two clearly separate lifecycle actions:

1. **Void series** keeps the existing audited, non-destructive workflow. The Series, claims, snapshots, payments, documents, numbering evidence, and history remain in PBC. Jobber is unchanged.
2. **Delete permanently** removes a local PBC Series and all Series-owned business data only when the Series has never had a Claim row.

The permanent path is approved as **Scope A**:

- the Series is eligible only when `progress_claims` contains zero rows for that Series;
- a Draft, Void, Issued, or historically Issued Claim row blocks permanent deletion;
- a revision set, document, or claim-command result without a Claim row is treated as inconsistent Claim evidence and also blocks permanent deletion;
- payments, payment revisions, Jobber observation snapshots, Variations, Credits, events, and an active numbering reservation do not block deletion because they are local Series-owned data and are deleted atomically;
- a linked PBC Quote, Quote items, Jobber invoice, Jobber payment, Jobber token, user, template, and business invoice profile are not Series-owned and are never deleted or changed.

This design narrows the existing no-hard-delete invariant only for a transactionally verified Claim-free Series. All raw table deletion remains forbidden. Any Series with Claim history continues to use Void and Claim Void workflows.

## Why this boundary exists

Every Progress Claim can become an official Tax Invoice. Its number, revisions, PDF/XLSX evidence, and audit history must not be erased through the Series card. The database already makes Claim identity permanent and retains Void Claims, so checking for any Claim row is a lifetime-history check under the supported write paths.

A Claim-free Series has never produced a Progress Tax Invoice. Permanently removing one therefore supports cleaning up duplicates, imports created in error, and test Series without weakening issued-document retention.

## Approaches considered

### Keep Void as the only action

This preserves the strongest audit history and requires no new database command. It does not satisfy the approved need to remove accidental, duplicate, or test Series from the database.

### Orchestrate multiple deletes in the application

This would require several client-visible mutations and could leave partial data when one operation fails. It would also require weakening table grants or child-table delete guards. This approach is rejected.

### Use one dedicated transactional purge command

A single authenticated database RPC locks the Series, verifies eligibility, deletes only the expected local children in foreign-key-safe order, deletes the Series last, and returns one safe result. Existing table grants and direct-delete guards stay in place. This is the approved approach.

## Eligibility contract

The database is the final authority. Dashboard capability fields are advisory and must never replace the mutation-time checks.

A Series is permanently deletable when all of the following are true after the Series row is locked:

- the authenticated actor passes the existing Progress Invoice actor gate;
- the request contains the exact expected Series version;
- the operator supplied the exact confirmation text `DELETE`;
- a valid non-PII reason code was selected;
- no row exists in `progress_claims` for the Series;
- no row exists in `progress_invoice_revision_sets` for the Series;
- no row exists in `progress_documents` for the Series; and
- no row exists in `progress_claim_command_results` for the Series.

Eligible source types are `manual`, `jobber_invoice`, `jobber_job`, and `pbc_quote`. Source type does not change eligibility, and no linked Quote or Jobber record is mutated. An eligible Series may be Draft, Active, Completed, Reconciliation Required, or Void. A Claim-free Void Series can therefore be permanently removed later without changing the meaning of Void for all other Series.

Stable safe failures include:

- `PROGRESS_SERIES_PURGE_CONFIRMATION_REQUIRED`;
- `PROGRESS_SERIES_PURGE_CLAIM_EXISTS`;
- `PROGRESS_SERIES_PURGE_OFFICIAL_EVIDENCE`;
- `PROGRESS_VERSION_CONFLICT`;
- `PROGRESS_IDEMPOTENCY_KEY_REUSED`;
- `PROGRESS_NOT_FOUND`.

The UI maps these codes to plain safe messages and never exposes SQL, raw database messages, Jobber payloads, or internal evidence.

A successful result has `status: 'purged'`. An exact replay returns the stored original result. A different correlation key for a Series that already has a receipt returns `{ status: 'already_purged', seriesId, purgedAt }` as a safe success without writing a second receipt. `PROGRESS_NOT_FOUND` is reserved for an absent Series with no receipt.

## User experience

### Dashboard card actions

The whole-card detail link remains unchanged. Actions are rendered in the existing sibling secondary-action area so buttons are never nested inside the card link.

The actions are wrapped in a group labelled `Progress Invoice series actions`. Void keeps the ghost-button treatment. A visual separator and spacing distinguish the danger-treated permanent action so the consequences are not visually interchangeable. The action order is:

1. `Open quote`, when the historical Series has a linked Quote;
2. `Void series`; and
3. `Delete permanently` with the existing trash icon and danger-button treatment.

The dashboard read model supplies explicit server-derived fields:

- `canVoidSeriesDirectly`;
- `requiresClaimVoidWorkflow`;
- `canDeletePermanently`; and
- `permanentDeleteBlockedReason`.

The browser does not infer permanent-delete eligibility from the current manifest count. A Series can have zero current Claims while still retaining historical or Void Claim rows.

`permanentDeleteBlockedReason` is a closed DTO enum, never arbitrary database text:

- `claim_history` when any Claim row exists;
- `official_evidence` when a revision set, document, or claim-command result exists without a Claim row; or
- `not_available` for a safe unclassified server-side restriction.

Blocker precedence is `claim_history`, then `official_evidence`, then `not_available`. `canDeletePermanently` is true only when every advisory evidence check is clear. The UI maps each enum value to fixed local copy.

Presentation rules:

- a non-Void Series with no Issued Claim history has an active `Void series` action;
- a Series requiring issued-Claim Void omits the active Void button and shows a focusable `Void issued Claims first` explanation linked to its detail page;
- an already Void Series does not show Void again;
- an eligible Claim-free Series has an active `Delete permanently` action, including when it is already Void;
- an ineligible Series shows a noninteractive disabled-status chip with a visible fixed reason and detail link instead of an unreachable disabled button.

### Void confirmation

The existing Series Void dialog is retained and refactored only where needed for card reuse. It explains that PBC records and Tax Invoice history remain, requires a reason and confirmation checkbox, and states that Jobber is unchanged.

Its fixed DOM IDs are replaced with `useId()`-derived IDs before more than one card instance is rendered. It retains current version/current-set concurrency checks, focus entry and return, Escape handling while idle, pending-state protection, and safe errors.

The card-safe Void Server Action accepts only Series identity, expected version, reason, and correlation key from the browser. It reloads the authorized workspace server-side to derive the exact current revision-set ID and manifest hash before invoking the existing strict Void command. Card data is not trusted for hidden concurrency evidence.

### Permanent-delete confirmation

A Progress Invoice-specific alert dialog reuses the existing dialog shell, spacing, danger button, checkbox, focus, and error patterns. It explicitly uses `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`, and `aria-describedby`. Both destructive dialogs use `useId()`-derived IDs for headings, descriptions, controls, and errors, and only one dialog is open at a time.

It displays:

- recipient/company and site identity;
- accepted numbering base, then original Jobber invoice number, then reference, or finally a shortened opaque Series ID as the deterministic discriminator;
- `This Claim-free Series and its local setup, payment, adjustment, Jobber observation, and history records will be permanently removed. No Progress Tax Invoice Claim exists for this Series.`;
- `It cannot be restored in PBC. Recovery would require an external database backup.`;
- `Jobber invoices and Jobber payments will not be changed.`;
- a required reason selector using `created_in_error` -> `Created in error`, `duplicate` -> `Duplicate`, `test_data` -> `Test data`, or `other_administrative_cleanup` -> `Other administrative cleanup`, with no free-text Other field;
- a required checkbox confirming the data cannot be recovered; and
- a required `Type DELETE to confirm` input whose value must exactly equal `DELETE`, without trimming or case normalization, with autocomplete and spellcheck disabled.

The destructive button stays disabled until all confirmation gates pass and while a request is pending. Enter cannot submit while a gate is incomplete. Cancel receives initial focus, Escape closes only while idle, backdrop clicks never close either destructive dialog, Tab focus remains inside the active dialog, focus returns to the originating card action, and failures are announced and focused with `role="alert"`. A small reusable focus-management helper is added and used by both dialogs because the current CSS shell does not itself trap focus. `window.confirm` is not used.

After success the server-rendered dashboard constructs `returnHref` from normalized active `q`, repeated `status`, `quoteId`, and page filters. If `items.length === 1` and `page > 1`, it uses `page - 1`; otherwise it keeps the current page. The client uses `router.replace(returnHref)` to avoid an extra history entry and uses `router.refresh()` only when the return URL equals the current URL. On failure it stays in the current modal and preserves the entered gates.

If eligibility became stale after rendering, Claim/evidence/version errors keep the dialog open, focus the safe alert, prevent an invalid repeat, and offer `Reload dashboard`. Retryable transport failures retain the current correlation key; changing any request field creates a new key.

## Database design

### Forward-only migration

Implementation uses one new forward-only migration. Previously applied migration files are not edited. The migration adds:

- a postgres-owned `purge_progress_invoice_series(jsonb)` RPC;
- a private transaction-scoped purge-context table with no API-role grants;
- a minimal append-only purge-receipt table outside the Series foreign-key graph;
- narrow trigger changes that recognize only an active internal purge context for the exact Series; and
- backward-compatible dashboard capability fields.

Applying the migration to production remains a separate destructive-enablement step and requires explicit approval after local database and browser verification.

### RPC boundary

The strict payload contains exactly:

- `series_id` as UUID;
- `expected_version` as a positive integer;
- `reason_code` as one approved enum value;
- `confirmation` as the exact string `DELETE`; and
- `correlation_key` as UUID.

The RPC is `SECURITY DEFINER`, owned by `postgres`, and sets `search_path = ''`. It calls the existing authenticated actor gate. Execute privileges are revoked from `PUBLIC`, `anon`, and `service_role`, then granted only to `authenticated`. All table mutation rights remain revoked from API roles.

Unknown keys, malformed values, empty values, client-supplied actor data, and changed idempotency payloads are rejected before mutation.

### Locking and concurrency

The command checks for an exact purge-receipt replay, then locks the Series row with `SELECT ... FOR UPDATE`. It rechecks version and all eligibility conditions under that lock. If the row is absent after waiting for a concurrent transaction, it rechecks the receipt so same-key concurrent retries resolve deterministically.

Claim creation already acquires the same Series-first row lock. The implementation audit must enumerate Series update, adjustment, payment/reconciliation, Jobber refresh, and every other supported Series-owned mutation and prove that each either takes the same Series-first lock or is made safe by the parent foreign-key lock before purge is enabled. Therefore:

- if Claim creation commits first, purge observes the Claim and fails without changes;
- if purge commits first, the waiting Claim command observes that the Series no longer exists;
- both commands can never succeed for the same Series; and
- no child row can be recreated after the parent is removed through supported commands.

All new and existing Series-owned mutation commands must keep the verified Series-first lock order to avoid deadlocks.

### Controlled trigger authorization

The RPC inserts an unexposed purge-context row only after authentication, row locking, version validation, and evidence checks. The context is bound to the exact Series, database transaction, backend, actor, and a server-created nonce.

Affected immutable triggers permit a delete or required pointer clear only when a private helper confirms that exact context and the effective database owner. The narrow review surface includes the Series identity guard, snapshot/event/payment-revision mutation guard, payment identity guard, adjustment immutability guard, numbering-reservation guard, and the Void-Series ledger-mutation guard. Each exception is limited to the exact operation and pointer columns required below. The Series DELETE branch returns `OLD` immediately after successful context validation and never falls through into UPDATE-only logic. Otherwise all guards return the same existing direct-delete errors. The RPC removes the context before returning; rollback removes every context and business-data change together.

The implementation must not:

- disable triggers;
- change `session_replication_role`;
- grant direct table `DELETE`;
- rely on a user-settable custom GUC as the only authorization signal;
- add broad `ON DELETE CASCADE`; or
- expose the context helper to API roles.

### Atomic deletion order

After all checks pass, the transaction:

1. creates the private purge context;
2. deletes target Series events, including Series-command idempotency rows stored in those events;
3. clears only the target Series payment match/current-revision pointers and the target payment-revision predecessor pointers;
4. deletes target payment revisions, then target payments;
5. clears target adjustment supersession pointers and deletes target adjustments;
6. explicitly defers `fk_progress_series_current_jobber_snapshot` and deletes target Jobber invoice observation snapshots, with the locked Series deleted in the same transaction;
7. deletes every numbering-base reservation whose `series_id` matches the target, including released and current reservations;
8. deletes the Series row last;
9. writes the minimal purge receipt; and
10. removes the private context.

The target Series must have no Claims, Claim revisions, revision sets, documents, or Claim command results, so no official document storage object is deleted. Any such evidence causes the whole command to fail before step 1. Claim command results are blocking evidence and are never part of step 2.

Foreign-key cycles are handled only for rows owned by the locked Series. Unrelated Series are never updated. The linked Quote and all global profile/template rows remain untouched.

### Minimal purge receipt

Permanent deletion removes every customer, site, financial, Jobber observation, payment, adjustment, event, numbering, and Series business row. A minimal administrative receipt remains so an exact network retry is idempotent and an authorized destructive action can be audited.

The receipt contains only:

- an independent receipt UUID;
- the opaque deleted Series UUID;
- actor UUID;
- correlation key;
- request fingerprint;
- approved reason code;
- purge timestamp; and
- a safe result snapshot containing the deleted Series UUID and timestamp.

It contains no recipient/company name, address, email, phone, ABN, site, Quote ID, Jobber account/invoice/payment ID, invoice number base, reference, description, amount, percentage, free-text reason, document path, or raw payload. It has no foreign key back to the deleted Series, has no API-role table access, and has an owner-level BEFORE UPDATE OR DELETE guard that makes it append-only even when ordinary table grants are bypassed.

There is exactly one receipt per deleted Series, enforced by a unique `deleted_series_id`. The stored correlation key and fingerprint distinguish exact replay, changed-key replay, and changed-payload misuse without creating duplicate receipts.

An exact same-key/same-fingerprint retry returns the stored success result. Reusing the same key with changed input fails. A different key after deletion returns a safe already-purged result when the receipt exists.

## Application boundaries

The implementation adds one strict validator, Server Action, service command, repository RPC call, and result parser. It follows the existing `{ ok: true, data } | { ok: false, error }` pattern and never performs a raw Supabase `.delete()`.

The successful action revalidates the Progress Invoice dashboard and the removed Series detail path. It does not fetch the deleted Series after the RPC. Any required return metadata is part of the safe RPC result.

Neither Void nor permanent deletion calls a Jobber gateway. Quote Jobber fetch/write-back code, Jobber OAuth, Jobber invoice/payment read behavior, and Quote persistence are unchanged.

## Test strategy

Implementation follows RED-GREEN TDD.

### Database and security

pgTAP tests prove:

- the RPC ownership, hardened search path, exact grants, RLS, and revoked table writes;
- strict payload validation and safe error codes;
- successful purge of a zero-Claim fixture containing multiple Jobber snapshots, Manual and Jobber payments/revisions, current/match/predecessor pointers, Draft/Approved/Superseded adjustments, events, and multiple released/current numbering reservations;
- all target business rows are gone while unrelated Series, linked Quote data, templates, profile, users, and Jobber tokens remain unchanged;
- Draft, Void, Issued, and historically Issued Claim rows each block purge with zero changes;
- revision-set, document, and claim-command evidence each blocks purge with zero changes;
- stale version and incomplete confirmation produce zero changes and no receipt;
- direct deletes still fail before and after a successful RPC;
- the internal context and receipt cannot be read or mutated by API roles, and the receipt's append-only trigger rejects owner-level UPDATE/DELETE outside a specifically tested migration-maintenance context;
- the receipt has no PII, financial, numbering, or external Jobber columns;
- exact replay succeeds, changed-payload replay fails, and a second-key retry is safe;
- an injected mid-command failure rolls back every deletion and receipt write;
- the released Jobber identity and unused numbering base can be used by a newly created Series; and
- the existing Series Void behavior remains unchanged.

Concurrency tests prove:

- two same-key purges produce one receipt and the same success result;
- two different-key purges remove the Series only once;
- purge versus Claim creation has exactly one winner;
- purge versus Series update, adjustment mutation, Manual payment, or Jobber refresh has exactly one winner with no orphan rows; and
- numbering-base reuse cannot create two active owners.

### TypeScript and UI

Tests cover:

- validator rejection of extra/forged keys and malformed confirmation data;
- exact camel-case to snake-case repository payload mapping and strict result parsing;
- stable safe service error mapping with no raw database text;
- authorization before persistence and revalidation only after success;
- dashboard capability parsing and eligible/blocked action states;
- both card actions remaining outside the primary link;
- unique dialog IDs across multiple cards;
- confirmation gates, Cancel, Escape, focus trap/return, pending double-submit protection, safe error focus, and retry-key reuse;
- filtered dashboard return URLs and last-item page fallback; and
- no Jobber or Quote mutation client import or request from the purge path.

Focused Progress Invoice tests, Quote/Jobber read-only regressions, typecheck, lint, the full test suite, local database tests, production build, and browser QA with a disposable Claim-free fixture must pass before handoff.

Permanent-delete QA must never use an existing user Series or Jobber invoice such as the currently imported examples. It uses only a disposable local test fixture created for deletion verification.

## Rollout and recovery

The implementation and migration can be committed without applying them to production. Rollout order is:

1. apply the migration to a reset local Supabase database;
2. run pgTAP and concurrency tests;
3. run TypeScript, UI, Quote/Jobber regression, lint, and build checks;
4. verify Void and permanent-delete UI locally with disposable fixtures;
5. obtain explicit approval for production database migration;
6. apply the backward-compatible database migration;
7. deploy the application; and
8. verify grants, direct-delete denial, and one disposable production-safe fixture only if explicitly authorized.

Disabling or rolling back the UI prevents future purge calls, but data already permanently deleted cannot be recovered by application rollback. Recovery requires an external database backup. The confirmation dialog states this plainly.

## Out of scope

- Permanently deleting any Series that has or has ever had a Claim;
- deleting Draft, Void, Issued, or Superseded Claim evidence;
- deleting PDF/XLSX storage objects;
- deleting or modifying Jobber data;
- deleting linked PBC Quotes or Quote items;
- restoring purged data;
- bulk permanent deletion;
- automatic retention or scheduled cleanup; and
- changing Progress Invoice calculations, payment semantics, document rendering, or Quote Jobber behavior.
