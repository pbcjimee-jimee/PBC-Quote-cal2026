# Standalone Progress Invoice Jobber Import Design

**Date:** 2026-07-17
**Status:** Approved by the user's 2026-07-17 direction
**Parent design:** `docs/superpowers/specs/2026-07-14-progress-invoices-design.md`

## Decision

Standalone Progress Invoice creation uses a Jobber invoice number as a one-time import source.

The user searches by Jobber invoice number, explicitly selects the matching invoice and any required Job or Property, reviews the Jobber values, edits the PBC recipient and site snapshot, enters the base contract Ex GST, and saves. On Save, the server reads the selected Jobber invoice and all current payment records again and stores the resulting immutable observation, payment revisions, and editable PBC series snapshot in one database transaction.

After creation, the series is managed from PBC data only. This flow exposes no Refresh, Sync, polling, or scheduled-import control. Existing refresh backend code may remain dormant for compatibility, but it is not called or presented by the Standalone workspace.

The existing Quote Jobber fetch, Quote routes, Quote actions, Quote snapshots, and write-back behavior remain unchanged.

## Considered Approaches

### Selected: preview plus one atomic import command

- A payment-free selection preview fetches invoice, client, billing address, and all Job and Property candidates.
- Save performs a fresh server-only full observation fetch, including all payment pages and payment detail required by the existing normalization policy.
- One service-role-only RPC creates the series, Jobber snapshot, Jobber payment identities and revisions, read model, and audit event atomically.
- User-edited recipient and site values are stored on the series; original Jobber values remain in the immutable Jobber snapshot.

This prevents orphan series and prevents the current link RPC from overwriting user edits.

### Rejected: create, link, then update

This avoids a new migration but spans three transactions. A failure can leave an unlinked series or a linked series containing Jobber defaults instead of the user's edited snapshot. Recovery UI and compensation logic would be required.

### Rejected: live link with manual refresh

This retains ongoing Jobber synchronization and freshness controls. It conflicts with the user's instruction to import once and continue inside the app.

## User Flow

1. Open `/progress-invoices/new` and choose Standalone.
2. Enter a Jobber Invoice Number and select **Fetch invoice**.
3. Review every returned candidate. No fuzzy result is silently selected.
4. Select the invoice. If it has multiple Jobs or Properties, select each explicitly.
5. Load the preview without reading or exposing payment records.
6. Prefill recipient, billing address, site address, contact details, and reference suggestions.
7. Edit the PBC snapshot fields and enter the base contract Ex GST.
8. Display Jobber subtotal, GST, total, balance, and status as comparison-only values. Never copy the Jobber subtotal into the base contract field automatically.
9. Save. The server re-fetches the full Jobber invoice and current payments and executes the atomic import RPC.
10. Redirect to `/progress-invoices`, where the imported actual receipts appear separately from claimed amounts.

## Components and Boundaries

### Selection preview gateway

Add a Progress-Invoice-only gateway function that fetches invoice detail plus every Job and Property page. It does not fetch payment records. It returns bounded candidates and `selectionRequired` flags so invoices with multiple relations can be completed safely.

The existing `/api/jobber/progress-invoices/invoices/[invoiceId]` route uses this preview. It returns only fields required for the form and never returns payment IDs, payment references, response fingerprints, raw GraphQL, tokens, or stored authority data.

### Standalone import action

Add `createStandaloneProgressInvoiceFromJobber(input: unknown)` to the Progress Invoice Jobber actions. It:

1. validates a strict Zod payload;
2. authorizes with `requireAllowedUser()`;
3. fetches the selected invoice through the strict full observation gateway;
4. normalizes it with the existing bounded Jobber payload builder;
5. calls the service-role-only atomic RPC; and
6. revalidates Progress Invoice routes after success.

The client never supplies Jobber amounts, account ID, client authority, payment data, or a normalized observation.

### Atomic database command

Add `create_progress_invoice_series_from_jobber(payload jsonb)` in a new migration. Only `service_role` can execute it.

The transaction:

- verifies the authenticated actor supplied by the authorized server action;
- validates the editable series payload and normalized Jobber observation;
- applies actor/command/correlation-key idempotency and advisory locking;
- rejects an already-linked non-void Jobber account/invoice identity;
- creates a `jobber_invoice` series with the user-edited recipient, site, description, reference, and base contract;
- stores the original/latest/accepted Jobber invoice number and selected Job/Property identity;
- inserts the immutable Jobber observation;
- imports every currently normalized Jobber payment identity and revision;
- recalculates actual receipts and the series read model;
- records one safe audit event; and
- returns the same result for an exact retry.

Any validation, identity, snapshot, payment, or audit failure rolls back every row.

The idempotency fingerprint is derived from the editable command input and selected external IDs. The immutable observation is still stored, but an upstream `fetched_at` timestamp change cannot turn a response-loss retry into a different command.

## Financial Rules

- Base contract Ex GST is a required user value.
- Jobber invoice amounts are comparison-only because they can include Variations. Invoice 2906 proves this boundary: Jobber subtotal is `39,507.08`, while the original base contract is `17,220.50`.
- Imported Jobber payments are actual receipts, not previous Progress Invoice claims.
- `paymentsTotal` from the invoice header is not used as the receipt ledger total. The normalized payment revisions are the source for actual receipts.
- Existing Decimal.js and Postgres numeric rules remain unchanged.

## Error Handling

- Search and preview responses use bounded safe errors and `no-store` headers.
- Authentication and allowlist checks happen before Jobber or service-role work.
- Missing required Job/Property selection blocks Save.
- Jobber authorization, scope, rate-limit, schema, and not-found failures map to existing safe Jobber codes.
- Duplicate invoice identity and database validation failures return a safe Progress Invoice error.
- The atomic RPC prevents recoverable partial rows; the form retains the entered values and correlation key so the user can retry the same command after a transient failure.

## UI Copy and State

The Standalone form has these states:

- invoice search: idle, searching, candidates, empty, error;
- preview: idle, loading, selection required, ready, error; and
- save: idle, saving, error.

The UI uses **Imported from Jobber** language. It does not show **Refresh**, **Sync**, or freshness controls. Dashboard timestamps may be relabelled from synced to imported without changing the underlying database column in this increment.

## Verification

- Gateway tests cover complete preview pagination, multiple Job/Property candidates, invalid selectors, and absence of payment reads.
- Route tests prove payment identities, references, fingerprints, and raw authority never reach the browser.
- Action tests prove authorization-first execution, authoritative Save-time re-fetch, safe errors, and route revalidation.
- RPC tests prove all-or-nothing creation, exact retry idempotency, duplicate identity rejection, user-edit preservation, immutable Jobber source preservation, and separate actual-receipt totals.
- UI tests and browser QA cover search, explicit selection, editable prefill, comparison-only Jobber amounts, required base contract, successful save, retry state, and absence of Refresh/Sync controls.
- Jobber read-only and Quote regression suites must pass, and no existing Quote Jobber file is modified.

## Out of Scope

- Ongoing Jobber synchronization or manual refresh UI.
- Jobber invoice or payment writes.
- Creating a Progress Invoice without selecting a Jobber invoice in this Standalone path.
- Claim editor, Variation/Credit editor, document rendering, and download UI, which remain separate implementation tasks in the parent plan.
