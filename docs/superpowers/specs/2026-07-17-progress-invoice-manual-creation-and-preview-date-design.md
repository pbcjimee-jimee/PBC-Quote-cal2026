# Progress Invoice Manual Creation and Preview Date Design

**Date:** 2026-07-17
**Status:** Approved
**Scope:** Jobber preview date normalization, removal of PBC Quote creation, and first-class manual Progress Invoice series creation

## Decision

New Progress Invoice series can be created in exactly two ways:

1. import one existing Jobber invoice by invoice-number search; or
2. create a fully local Manual series.

The Existing PBC Quote card, link, copy, and new-series entry path are removed. Existing historical `pbc_quote` rows remain readable so this change does not corrupt or hide prior data, but the application no longer offers or accepts new PBC Quote-based Progress Invoice creation.

This document supersedes the Existing PBC Quote creation portions of:

- `docs/superpowers/specs/2026-07-14-progress-invoices-design.md`;
- `docs/superpowers/specs/2026-07-17-progress-invoice-standalone-import-design.md`; and
- their corresponding implementation-plan sections.

Existing Quote Jobber fetch, snapshot, Save & Sync, write-back, Routes, Actions, DTOs, and tests remain unchanged.

## Creation workspace

`/progress-invoices/new` presents a compact two-mode selector:

- **Import from Jobber** — the default mode and the existing one-time Jobber Invoice import flow;
- **Create manually** — a local-only series with no Jobber identity, observation, snapshot, or imported payments.

Only the selected form is rendered. The page does not display a PBC Quote card or a `Browse PBC Quotes` link. Page copy describes only the two supported sources.

The long Recipient, Site, and Series detail fields are extracted into a controlled presentational component shared by both creation paths. The Jobber mode keeps its search, explicit invoice selection, Job/Property selection, comparison amounts, and local editable snapshot behavior. The Manual mode does not make any Jobber request.

## Jobber preview date normalization

Jobber invoice detail dates can be either date-only strings or timezone-qualified ISO timestamps. The browser response contract intentionally remains date-only.

A pure calendar-date helper is shared by the preview Route and the existing save-time observation mapping. It applies these rules:

- `null` remains `null`;
- a valid `YYYY-MM-DD` remains unchanged;
- a valid ISO timestamp must contain `Z` or an explicit UTC offset;
- timestamps are converted to their `Australia/Sydney` calendar date;
- malformed, timezone-free, or impossible dates are rejected;
- the normalized result is validated again as `YYYY-MM-DD`.

The preview API applies this helper to `issuedDate`, `dueDate`, and `receivedDate` before returning JSON to the browser. The Jobber gateway continues to retain the original timestamp. Save-time observation fingerprints and audit evidence therefore retain their existing meaning.

The browser contract is not widened to accept timestamps, and normalization must not use string slicing or UTC `toISOString()` date truncation because either can disagree with the Sydney business date.

## Manual series data

Manual creation requires:

- Invoice number base;
- Base contract Ex GST;
- Recipient name;
- Billing address;
- Site name;
- Site address; and
- Default description.

It optionally accepts:

- company;
- email;
- phone;
- recipient ABN; and
- reference.

GST is fixed server-side to `0.10`. The browser cannot choose the source type or GST rate. A dedicated authenticated Server Action sets `sourceType: 'manual'` and `gstRate: '0.10'` before calling the service boundary.

The Invoice number base is trimmed, validated, and stored as the accepted numbering base. For example, base `2906` produces future official Tax Invoice numbers `2906-P01`, `2906-P02`, and `2906-FINAL`. A manual series does not require or fabricate a Jobber account, invoice, job, property, web URI, observation, snapshot, or payment identity.

## Database invariants

A new forward-only migration performs the schema and transaction changes. Previously applied migration files are not edited.

The migration must:

- add `manual` to the series source-type constraint;
- preserve the legacy source values for existing rows and reads;
- require a non-empty accepted numbering base for Manual series creation;
- permit that base without a Jobber invoice identity only when `source_type = 'manual'`;
- require all Jobber identity fields to remain null for Manual series;
- prevent duplicate active/non-void accepted numbering bases using the database, not only UI validation;
- keep creation idempotent by actor, command, and correlation key;
- write the normal safe audit event without customer, address, or financial details in logs;
- update claim-revision constraints so a future Manual claim can omit Jobber-only evidence while Jobber-backed claims still require a complete Jobber evidence set;
- preserve direct-write denial, RLS, function ownership, hardened `search_path`, and least-privilege grants.

The generic legacy PBC Quote creation surface is removed. Backward-compatible read parsers continue to recognize historical `pbc_quote` and `jobber_job` rows, while new Manual creation uses its dedicated server-controlled command. Jobber imports continue through the atomic `create_progress_invoice_series_from_jobber` command.

## Manual creation transaction

Manual Save follows one idempotent transaction:

1. validate the strict command and authenticated actor;
2. normalize optional text and the accepted numbering base;
3. reject a conflicting active numbering base;
4. insert the `manual` series with null Quote and Jobber identities;
5. initialize adjusted, unclaimed, claimed, and receipt caches consistently;
6. append one safe creation event; and
7. return the series ID and version.

Retrying the same correlation key and identical request returns the original result. Reusing the key with a different request is rejected. On success, the application revalidates the Progress Invoice dashboard and navigates there.

## Error handling

- A malformed Jobber date produces the existing safe Jobber response error; raw values are not exposed.
- A duplicate Manual numbering base produces a stable conflict result and keeps the form data available.
- Validation failures identify the affected local fields without exposing internal IDs.
- Network or Server Action failures retain the same correlation key for an unchanged retry.
- Jobber mode and Manual mode maintain independent draft and save state.

## Tests

Implementation follows RED-GREEN TDD.

### Date regression

Route tests use actual Jobber timestamp shapes, including:

- `2026-07-01T00:00:00Z` -> `2026-07-01`;
- `2026-07-15T00:00:00+00:00` -> `2026-07-15`; and
- `2026-01-01T13:30:00Z` -> `2026-01-02` in Sydney.

The full preview response must pass the existing browser response parser. Tests also prove that the gateway retains raw timestamps and that date-only values remain unchanged.

### Creation workspace

UI tests prove:

- no Existing PBC Quote copy or link is rendered;
- the two supported modes are accessible by keyboard and pointer;
- Jobber is the default mode;
- switching to Manual performs no Jobber request;
- Manual required-field and money validation works;
- the action receives no browser-controlled source type or GST;
- successful creation navigates to `/progress-invoices`; and
- retry correlation behavior is stable.

### Domain and database

Validator, Action, service, repository, and pgTAP tests prove:

- Manual source and required numbering base;
- no Quote or Jobber identity on Manual rows;
- unique non-void accepted numbering base;
- exact idempotent replay and changed-payload rejection;
- financial cache initialization;
- safe audit event creation;
- RLS/direct-write denial and function grants; and
- historical source rows remain readable.

Focused Progress Invoice tests, existing Quote/Jobber regression tests, typecheck, lint, the full Vitest suite, local database tests, and a production build must pass before completion. Browser QA must reproduce Invoice 2875 successfully and confirm both creation modes visually.

## Out of scope

- Restoring PBC Quote-based creation through another route or hidden action;
- ongoing Jobber Refresh, Sync, polling, or scheduled imports;
- automatic generation of a Manual number base;
- changing the approved claim calculation rules;
- implementing the still-pending claim editor, XLSX renderer, or PDF renderer as part of this increment; and
- modifying existing Quote Jobber behavior.
