# Progress Invoice Series Design

**Date:** 2026-07-14
**Status:** Awaiting written-spec review
**Product:** PBC Quote Calculator
**Scope:** Jobber-linked Progress Invoice series, claims, payments, Tax Invoice XLSX/PDF generation, history, and reporting

## Executive Summary

Add a top-level Progress Invoices module to the existing Next.js and Supabase application.

A Progress Invoice Series represents one construction contract or job. Each series:

- may start from an existing PBC quote or from a Jobber job/invoice without a PBC quote;
- links to at most one Jobber invoice, reused for every progress claim in the series;
- contains ordered claims such as P01, P02, and FINAL;
- stores approved Variations and Credits, but does not support Retention;
- treats previous progress claims and actual receipts as different financial concepts;
- reads Jobber invoice and payment information without creating or editing Jobber invoices;
- generates official Tax Invoice Excel and PDF documents from the same revision snapshot;
- preserves the supplied Excel layout, logo, colours, amount placement, and formatting;
- permits edits after issue while retaining every prior revision and audit event; and
- lets users download the current claim or the complete series in either format.

The selected document architecture is template-preserving dual rendering:

1. Clone and patch a normalized copy of the supplied XLSX template.
2. Render the same immutable document snapshot into a matching A4 PDF.
3. Validate that invoice number, dates, totals, and GST agree before an issue or revision becomes current.

Jobber remains a read-only source of linked identity, status, amount, dates, client details, and payment records. PBC data remains authoritative for progress calculations and generated Tax Invoices.

## Evidence and Source Material

### Supplied files

- Excel: inv2906 _Timbaworx-4 Curra Close Frenchs Forest_quote3267.xlsx
- PDF: inv2906 _Timbaworx-4 Curra Close Frenchs Forest_quote3267.pdf

Source integrity fingerprints:

- XLSX SHA-256: 7A71A163CBCCDBB7977280A410CC6EBFC17398E4649FFF7B6FB632D6FA86E1A7
- PDF SHA-256: 993E137DBEB137F1E4B39096995BDC1A24ECD0173AC711A34EA592FFAF2CA349

The Excel workbook contains three worksheets for the same invoice series:

1. Interior progress
2. Second progress
3. Final progress

The supplied PDF is a one-page A4 rendering of the second progress worksheet.

The sample establishes the required visual baseline:

- A4 portrait layout;
- Paint Buddy & Co logo at the upper left;
- company details at the upper right;
- blue-grey and red accent colours;
- recipient and invoice metadata below the header;
- a red current-claim amount;
- cumulative contract and claim calculations on the lower right;
- bank details at the lower left; and
- accounting-style Australian dollar formatting.

The workbook contains inconsistent print metadata and several wording errors. Generated workbooks will preserve the visual baseline while applying deterministic A4 print settings and corrected labels.

The inspected source contains one embedded PNG logo and no macros, external links, OLE objects, or data connections. Template registration treats that structure as the active-content allowlist and rejects unexpected additions.

### Existing application

The repository already provides:

- Next.js App Router, React, and strict TypeScript;
- Supabase authentication, Postgres, RLS, and Storage patterns;
- Decimal.js for financial calculations;
- Zod validation and Result-style Server Actions;
- Jobber OAuth, token encryption/refresh, GraphQL quote and job lookup; and
- versioned quote saves using transactional RPC and optimistic concurrency.

There is currently no Jobber invoice gateway, progress-invoice schema, document generator, or invoice UI.

## Confirmed Product Decisions

| Topic | Decision |
|---|---|
| Jobber access | Lookup and linking only; no Jobber invoice create, edit, or payment write |
| Jobber cardinality | One Jobber invoice per Progress Invoice Series |
| Series contents | Multiple P01, P02, and FINAL claims under the linked invoice |
| Previous claim meaning | Previously issued progress claim amount, not actual cash received |
| Payments | Jobber receipts plus manual missing receipts, with source preserved |
| Partial payments | Supported |
| Progress meaning | Cumulative construction progress; the sample reaches 90%, with the remaining 10% normally claimed at FINAL |
| Claim input | User chooses cumulative percentage or current claim amount; the other is derived |
| Adjustments | Approved Variation and Credit supported |
| Retention | Excluded |
| Creation source | Existing PBC quote or standalone Jobber job/invoice |
| Recipient | Prefill from Jobber Client, editable, stored as a series snapshot |
| Downloads | Current claim or whole series, in Excel or PDF |
| Visual fidelity | Preserve A4 layout, logo, colours, amount placement, content, and money format; minor font-rendering differences allowed |
| Wording | Correct sample typos and misleading Paid labels |
| Legal document | Generated XLSX and PDF are the official Tax Invoice |
| Issued edits | Edit the same claim identity; create and retain an internal revision and change history |
| Numbering | Jobber invoice number plus P01, P02, or FINAL suffix; original Jobber number stored separately |

## Goals

- Make builder progress billing a first-class application workflow.
- Keep contract progress, claims, receipts, and outstanding amounts reconcilable.
- Make either cumulative progress percentage or current claim amount an authoritative input.
- Preserve historical financial truth when later adjustments or edits occur.
- Produce Excel and PDF Tax Invoices with the sample’s visual identity.
- Keep the existing Jobber authorization boundary read-only for invoices and payments.
- Support safe post-issue corrections without losing the previous issued document.
- Give users clear current, cumulative, paid, and outstanding views.

## Non-Goals

- Creating, editing, sending, or voiding invoices in Jobber.
- Writing payment records to Jobber.
- Retention or security-of-payment retention calculations.
- Statutory Adjustment Note or Credit Note document generation.
- Automatic background or scheduled Jobber synchronization.
- Online payment collection.
- Email delivery, e-signatures, or customer portals.
- Multi-currency or non-Australian tax regimes.
- Automated accounting advice or substitution for accountant review.
- Changes to existing Jobber quote fetch, quote snapshots, Save & Sync, approved quote-line writes, or quote sync status.

## Architecture Decision

### Selected: template-preserving dual rendering

The application database owns a canonical Progress Invoice document snapshot. The snapshot is passed to two isolated renderers:

- the XLSX renderer clones the registered template and patches only mapped workbook parts;
- the PDF renderer draws the same content into a matching A4 layout.

Both outputs are validated against the same snapshot and stored privately.

~~~text
PBC Quote or Jobber Job/Invoice
              |
              v
Progress Invoice Series
  |-- recipient and contract snapshot
  |-- Variations and Credits
  |-- ordered Claims
  |-- Jobber and manual Payments
              |
              v
Immutable Claim Revision
       |                 |
       v                 v
Template XLSX         A4 PDF
       |                 |
       +--------+--------+
                v
       Cross-format validation
                |
                v
        Private document storage
~~~

### Rejected alternatives

#### Excel-to-PDF conversion

Generating Excel first and converting it through Microsoft Office or LibreOffice would align the two formats closely, but it requires a conversion worker, installed fonts, process isolation, and additional operational infrastructure that is unsuitable for the current Vercel application.

#### Full workbook and PDF reconstruction

Rebuilding both documents entirely through generic libraries is easier for arbitrary layouts but is more likely to drift from the supplied workbook’s merges, logo anchoring, accounting formats, and amount placement.

## Module Boundaries

### Progress Invoice domain

Owns series, adjustments, claims, revisions, payments, lifecycle transitions, validation, and derived summaries. It does not call Jobber or generate files directly.

### Calculation engine

Accepts decimal strings and returns a fully reconciled financial snapshot. It has no database, UI, Jobber, or document dependency.

### Jobber invoice gateway

Owns read-only GraphQL queries, pagination, normalization, and OAuth error mapping. It returns stable internal DTOs rather than exposing raw GraphQL shapes to the domain or UI.

### Document snapshot builder

Converts an issued or draft Claim Revision, series snapshot, business profile, and adjustment list into one immutable render model.

### XLSX renderer

Clones the registered master template, duplicates the canonical worksheet as needed, replaces mapped text and numeric cells, retains styles and drawings, and applies deterministic print settings.

### PDF renderer

Renders the document snapshot into A4 pages using fixed layout coordinates, the supplied logo, and an approved embedded font.

### Document orchestration

Creates both outputs, validates them, stores them, and advances the proposed Claim and series-revision-set pointers only after successful completion.

## Data Model

All new tables use UUID primary keys, created and updated timestamps where appropriate, RLS, and authenticated-user access consistent with the application’s current two-admin model. Monetary columns use Postgres numeric values serialized as strings to Decimal.js.

### business_invoice_profiles

Stores the current supplier defaults used to prepare a new claim:

- legal and trading name;
- ABN and contractor licence;
- business address;
- phone and email;
- bank name, BSB, account name, and account number;
- GST rate, fixed at 10% for v1;
- business timezone, fixed to Australia/Sydney for v1;
- default payment-term days; and
- version number.

Every Claim Revision snapshots these fields. Editing Settings never alters an issued document.

### progress_invoice_templates

Registers the private master template:

- version and status;
- source storage path;
- source SHA-256 hash;
- normalized template storage path and hash;
- logical cell-map version;
- page-layout version; and
- activation timestamp.

Only one template version is active for new revisions. Existing revisions retain their original template version.

### progress_invoice_series

Represents one contract and Progress Invoice sequence:

- optional PBC quote ID;
- source type: PBC quote, Jobber job, or Jobber invoice;
- optional Jobber account ID before link;
- optional Jobber invoice ID before first issue;
- optional selected Jobber job ID;
- optional Jobber client ID before link;
- optional selected Jobber property ID;
- original observed Jobber invoice number;
- accepted Tax Invoice numbering base;
- current Jobber snapshot ID;
- current series-revision-set ID;
- base contract amount Ex GST;
- GST rate snapshot;
- recipient name, company, address, email, phone, and optional ABN snapshot;
- site name and site address;
- default description and reference;
- last Jobber sync attempt timestamp;
- last successful Jobber sync timestamp;
- safe last Jobber sync error code;
- lifecycle status;
- optimistic version; and
- current totals cached only as a transactionally maintained read model.

A series may be drafted before a Jobber invoice exists, but a Claim draft cannot be created until exactly one Jobber account/invoice identity and accepted numbering base are linked.

Jobber account ID, invoice ID, and the accepted numbering base become permanently locked when the first Claim draft reserves its Tax Invoice number. Before any Claim exists, the link may be changed. After the lock, correcting a wrong link requires voiding and recreating the series or a separately approved reconciliation procedure.

Cached claimed, unclaimed, and receivable totals are derived only from the Current series-revision set and current eligible Payment Revisions.

### progress_jobber_invoice_snapshots

Stores immutable normalized Jobber observations separately from user-edited PBC snapshots:

- series ID;
- Jobber account, invoice, selected job, client, and selected property IDs;
- original raw status and normalized display status;
- latest observed invoice number and Jobber web URI;
- only the confirmed invoice amount fields, serialized as decimal strings;
- only the confirmed issued, due, received, and updated dates;
- normalized client, billing-address, property-address, and site candidates;
- effective GraphQL API version;
- fetched timestamp;
- response fingerprint; and
- safe normalization warnings.

Raw GraphQL responses are never persisted. Refresh updates the latest observed value through a new snapshot; it never changes the accepted Tax Invoice numbering base or the editable recipient/site snapshot.

If an invoice relates to multiple jobs or properties, the user explicitly selects the series job and site. The gateway never chooses the first returned node.

### progress_adjustments

Stores contract adjustments:

- series ID;
- type: Variation or Credit;
- status: Draft, Approved, Rejected, Superseded, or Void;
- effective date;
- display order;
- description;
- Ex GST amount stored as a positive value;
- GST rate snapshot;
- optional superseded-adjustment ID and required reason;
- optional PBC quote item reference; and
- optimistic version.

The type determines whether the amount increases or decreases the adjusted contract. Only Approved adjustments participate in calculations.

Draft adjustments may be edited. Once Approved, the dated description, type, amount, and GST rate are immutable. A correction creates a new reversing or replacement adjustment with a reason and marks the old row Superseded; issued Claim Revisions continue to reference the original immutable snapshot.

### progress_claims

Provides the stable identity of a progress claim:

- series ID;
- numeric sequence;
- kind: Progress or Final;
- suffix such as P01, P02, or FINAL;
- globally unique Tax Invoice number;
- lifecycle status: Draft, Issued, or Void;
- current revision ID;
- original issued timestamp;
- latest revised timestamp; and
- optimistic version.

The Tax Invoice number is never reused, even after Void.

### progress_claim_revisions

Stores immutable draft or issued content:

- claim ID and revision number;
- revision state: Draft, Issued, or Superseded;
- input mode: Cumulative Percentage or Current Claim Amount;
- authoritative decimal input;
- issue date and due date;
- description and notes;
- supplier and recipient snapshots;
- Jobber link and invoice-number snapshot;
- adjusted contract Ex GST, GST, and Inc GST;
- cumulative approved Variation and Credit amounts;
- previous claims Ex GST, GST, and Inc GST;
- cumulative target Ex GST, GST, and Inc GST;
- current claim Ex GST, GST, and Inc GST;
- cumulative percentage at high precision;
- remaining unclaimed Ex GST, GST, and Inc GST balances;
- calculation-policy version;
- template version;
- edit classification: Clerical or Financial/Tax Affecting;
- financial-snapshot hash;
- predecessor financial-manifest hash;
- tax-review state and external reference when required;
- creator, creation time, and revision reason; and
- complete adjustment snapshot used for the document.

Revision rows are never updated after they become Issued or Superseded.

### progress_invoice_revision_sets

Maintains one coherent, ordered series chain:

- series ID and monotonically increasing set number;
- predecessor set ID;
- ordered manifest of Claim IDs and selected Revision IDs;
- state: Draft, Generating, Ready, Current, Superseded, or Failed;
- aggregate financial-manifest hash;
- whether a financial cascade is required;
- actor, reason, and timestamps; and
- publication correlation key.

Only one set is Current. Adding a claim creates a new set containing the prior current revisions plus the new claim. A clerical revision with an unchanged financial-snapshot hash can replace one document revision without recalculating later claims.

Changing the amount, GST, progress, issue sequence, adjustment snapshot, or Void state of an earlier claim starts a draft reconciliation set. Every later claim receives an explicit cascade revision with a predecessor financial-manifest that matches the revised chain. The existing set remains Current until all affected Excel/PDF documents validate, after which all claim pointers and the series set swap atomically.

Cascade calculation preserves each later claim’s recorded authoritative input. A percentage-authoritative claim keeps its cumulative percentage and derives a new current amount; an amount-authoritative claim keeps its current amount and derives a new percentage. The user reviews every resulting difference. A negative, over-contract, or otherwise invalid cascade cannot publish and remains Reconciliation Required.

### progress_payments

Stores stable receipt identities independently from claims:

- series ID;
- source: Jobber or Manual;
- Jobber payment ID, required only for Jobber rows;
- current Payment Revision ID;
- optional matched Manual payment ID on a Jobber row;
- optimistic version; and
- creator and created timestamp.

There is a partial unique constraint on series ID plus Jobber payment ID for Jobber rows. A Manual row has no Jobber payment ID. Manual and Jobber payments are never automatically merged.

### progress_payment_revisions

Stores immutable observed or user-entered payment values:

- payment ID and monotonically increasing revision number;
- received date;
- observed receipt amount;
- signed effective receipt amount used in totals after confirmed Jobber status/type mapping;
- payment method and reference when available;
- external status and updated timestamp when exposed;
- Jobber synchronization state;
- status: Active, Superseded, Unconfirmed, or Void;
- predecessor revision ID;
- creator, reason, and source observation timestamp; and
- created timestamp.

Editing or voiding a Manual payment appends a revision and atomically advances the current pointer. A Jobber refresh also appends a revision when amount, date, status, or effective receipt treatment changes. Historical payment positions remain reconstructable.

Only current Payment Revisions whose confirmed semantics represent an applied receipt contribute to Actual Receipts. Refunded, reversed, ambiguous, or disappeared records use their confirmed signed effect or remain Unconfirmed and excluded until reconciled. Invoice.receivedDate is invoice metadata and is never treated as an individual payment.

### progress_documents

Tracks generated artifacts:

- series, optional claim-revision ID, and optional series-revision-set ID;
- scope: Current Claim or Series Bundle;
- format: XLSX or PDF;
- generation state: Pending, Generating, Ready, or Failed;
- template and renderer versions;
- private storage path;
- SHA-256 content hash;
- page or worksheet count;
- revision-manifest hash for series bundles;
- failure code without sensitive financial payloads; and
- creator and timestamps.

Series bundles may be cached by the Current series-revision-set manifest. A changed set produces a different bundle.

### progress_invoice_events

Append-only audit events include:

- series and optional claim ID;
- actor from auth.uid();
- event type;
- timestamp;
- prior and next revision references;
- safe structured field changes;
- correlation or idempotency key; and
- source: User, Jobber Sync, or System.

Bank details and complete document payloads are referenced by version and are not duplicated into audit JSON.

## Database Constraints and Transaction Rules

- At most one non-void series may link to the same Jobber account and invoice ID pair. Invoice number is never used as external identity.
- Relinking is prohibited in normal application flows after the first Claim draft is created.
- A claim sequence and suffix are unique within its series.
- Tax Invoice numbers are globally unique and permanent.
- A Tax Invoice number is transactionally reserved when the Claim draft is first created and is never renumbered or reused.
- The series accepted numbering base is immutable after its first Claim is created.
- Revision numbers increase monotonically per claim.
- Current revision must belong to the same claim.
- A series has exactly one Current revision set once its first claim is issued.
- Every revision set contains at most one revision per non-void Claim in sequence order.
- A Claim Revision’s predecessor financial-manifest must match the preceding revisions in its proposed set.
- A financial edit or Void of an earlier claim cannot become Current without validated cascade revisions for every later claim.
- Jobber payment IDs are unique within a series for Jobber-source rows.
- A Payment’s current revision must belong to that Payment, and issued Payment Revisions are immutable.
- One Manual payment may be superseded by at most one Jobber payment, and both rows must belong to the same series.
- A successful payment match keeps the Jobber current Payment Revision Active and appends a Superseded revision only for the Manual payment.
- Approved adjustments are immutable; corrections require a linked superseding adjustment and reason.
- The business profile, series, and every approved adjustment must use the v1 GST policy rate of 0.10. Zod and database checks reject any other rate.
- Current claim amounts cannot be negative.
- Cumulative percentage must be greater than 0 and no greater than 100.
- Due date cannot precede issue date.
- A new issue cannot exceed the adjusted contract total.
- A Credit that reduces the adjusted contract below already issued claims places the series in Reconciliation Required and blocks another issue.
- At most one non-void FINAL may exist, it must consume the full residual Ex GST and GST balances, and no later Claim may be created.
- Financial writes use transactional RPCs with an expected version.
- Actor identity is obtained from auth.uid(), never trusted from client input.
- Issue and sync commands use idempotency keys.

## Financial Model

### Terms

~~~text
Adjusted Contract Ex GST
  = Base Contract Ex GST
  + Approved Variations Ex GST
  - Approved Credits Ex GST

Adjusted Contract GST
  = round(Adjusted Contract Ex GST × GST Rate)

Adjusted Contract Inc GST
  = Adjusted Contract Ex GST + Adjusted Contract GST

Previous Progress Claims
  = Sum of predecessor Claim Revisions in the same series-revision set

Actual Receipts
  = Eligible signed Jobber receipt effects + Active manual receipts

Series Receivable
  = Current series-revision-set Claim totals - Actual Receipts
~~~

Previous Progress Claims never means paid or received.

### Supplied sample interpretation

The supplied workbook becomes a named financial regression fixture:

| Stage | Snapshot calculation | Expected result |
|---|---|---:|
| P01 | First current progress claim | $18,942.55 Inc GST |
| P02 contract | $17,220.50 base Ex GST + $21,712.54 approved Variation Ex GST | $38,933.04 Ex GST |
| P02 90% target | $42,826.34 adjusted Inc GST × 90% | $38,543.71 cumulative |
| P02 current claim | $38,543.71 target − $18,942.55 prior claim | $19,601.16 Inc GST |
| P02 remaining | $42,826.34 adjusted total − $38,543.71 cumulative | $4,282.63 Inc GST |
| FINAL contract | Later Variation raises adjusted contract to $39,507.08 Ex GST | $43,457.79 Inc GST |
| FINAL current claim | $43,457.79 adjusted total − $38,543.71 prior claims | $4,914.08 Inc GST |
| FINAL remaining | Full remaining balance claimed | $0.00 |

The later Variation changes the FINAL contract snapshot but does not retroactively recalculate P01 or P02. The sample’s Paid wording supplies no reliable evidence of actual receipts, so no payment is inferred during migration or template registration.

### Cumulative-percentage input

When cumulative percentage is authoritative:

~~~text
Target cumulative Inc GST
  = round(Adjusted Contract Inc GST × percentage ÷ 100)

Current Claim Inc GST
  = Target cumulative Inc GST - Previous Progress Claims Inc GST
~~~

The target cumulative amount is rounded to cents before subtracting previous claims. This avoids round-off drift across claim periods.

### Current-claim-amount input

The user enters the current claim as an Inc GST amount:

~~~text
Target cumulative Inc GST
  = Previous Progress Claims Inc GST + Current Claim Inc GST

Derived cumulative percentage
  = Target cumulative Inc GST ÷ Adjusted Contract Inc GST × 100
~~~

The derived percentage is stored at high precision and rounded only for display. It is not fed back into the authoritative amount.

### Current-claim GST split

~~~text
Current Claim Ex GST
  = round(Current Claim Inc GST ÷ (1 + GST Rate))

Current Claim GST
  = Current Claim Inc GST - Current Claim Ex GST
~~~

Computing GST as the residual guarantees that Ex GST plus GST equals the displayed amount payable to the cent.

### FINAL behavior

Creating FINAL pre-fills and requires the full remaining unclaimed balance. If another partial claim is needed, the user creates the next Pxx claim instead. A series has at most one non-void FINAL, FINAL must reach 100% cumulative progress, and no later claim may follow it.

For a full-balance FINAL, each tax component is calculated as a residual rather than splitting the remaining Inc GST again:

~~~text
FINAL Ex GST
  = Adjusted Contract Ex GST - Prior Claims Ex GST

FINAL GST
  = Adjusted Contract GST - Prior Claims GST

FINAL Inc GST
  = FINAL Ex GST + FINAL GST
~~~

This makes cumulative Ex GST, GST, and Inc GST all reconcile to the adjusted contract to the cent. In the supplied fixture, FINAL is $4,467.34 Ex GST plus $446.74 GST, equalling $4,914.08 Inc GST.

### Payment and overdue status

The primary payment position is always series-level because one Jobber invoice is shared across all claims.

For ageing and an explanatory per-claim view, eligible receipts are applied oldest-issued Claim first, then by sequence, as a derived FIFO presentation. This is not persisted as an accounting allocation and is labelled as calculated.

The as-of date is the current calendar date in the business profile timezone, fixed to Australia/Sydney for v1. Overdue amount is the unpaid FIFO remainder of Claims whose due date is earlier than the as-of date. The series is Overdue when that amount is positive.

Derived receivable states are:

- Unpaid: no receipts and a positive outstanding amount;
- Part Paid: receipts are positive but less than issued claims;
- Paid: receipts equal issued claims;
- Overdue: a positive derived outstanding amount remains after its due date; and
- Credit Balance: receipts exceed cumulative issued claims.

An overpayment is displayed as a credit balance and is not discarded or capped.

## Jobber Integration

### Read-only boundary

The invoice gateway may query:

- Jobber account identity;
- job identity and display fields;
- client identity and available billing/property address;
- invoice ID and invoice number;
- invoice status and Jobber web URI;
- invoice amounts;
- issued, due, received, and updated dates where exposed; and
- paginated payment records.

No invoice or payment mutation is added to the allowed Jobber operation set.

The invoice gateway is a server-only normalization layer over the repository’s existing centralized Jobber query transport in lib/jobber/client.ts. It does not call Jobber with a separate fetch implementation, accept raw GraphQL from UI/Routes/Actions, or invoke the existing approved quote-line mutation path. Existing quote DTOs, quote snapshots, quote IDs, and the narrow quote mutation allowlist remain unchanged.

Jobber’s public schema describes invoices with identity, amounts, status, dates, jobs, and payment records. Exact query arguments, search capabilities, amount shapes, payment semantics, enum values, pagination, and OAuth scope names must be verified in the connected application’s GraphiQL schema at the effective pinned API version before implementation. [Jobber Developer Center](https://developer.getjobber.com/docs/)

### Link flow

1. Select a saved PBC quote or choose Standalone.
2. Select the relevant Jobber job through the confirmed existing discovery path.
3. Query that job’s invoices with complete cursor pagination.
4. Let the user select exactly one invoice.
5. If the invoice has multiple jobs or properties, require explicit job and site selection.
6. Check uniqueness by Jobber account ID plus invoice ID.
7. Fetch the complete client, site, invoice, and payment result.
8. Prefill the PBC snapshots without making Jobber financial amounts authoritative.
9. Save the normalized Jobber observation, editable PBC snapshots, and last-successful-sync timestamp separately.

Direct invoice lookup or search is exposed only if the effective pinned GraphiQL schema confirms a supported query and filters. The design does not assume a top-level invoice search exists.

Recipient candidates come from the confirmed invoice client and billing fields. Site candidates come from the explicitly selected job and property. One address is never silently substituted for the other, and ambiguous candidates require user selection.

### Snapshot refresh

Jobber refresh is explicit in v1. The gateway first fetches the invoice and every payment page into a complete in-memory normalized result. No database state changes until all pagination and normalization succeeds.

A successful refresh applies one transaction that:

- inserts a new immutable Jobber observation;
- upserts stable Jobber payment identities and appends immutable Payment Revisions when observed values change;
- records external amount, date, status, and updated-field changes in the audit trail;
- appends Unconfirmed revisions for previously observed but now absent Jobber records without deleting them;
- preserves manual receipts;
- records last success time and clears the safe error code;
- emits a safe audit event; and
- returns a diff for recipient or invoice-number changes.

A partial, rate-limited, authorization-failed, or schema-failed refresh leaves both the prior Jobber snapshot and Payment Ledger unchanged.

User-edited recipient data is never overwritten automatically. The UI presents Jobber changes and an Apply action.

The series separately stores:

- the original observed Jobber invoice number;
- the latest observed Jobber invoice number in the current observation; and
- the accepted Tax Invoice numbering base.

Refresh changes only the observed value. Before any Claim exists, changing the accepted base is an explicit audited command. The accepted base becomes immutable when the first Claim draft reserves its Tax Invoice number. After the lock, later Jobber number changes are shown as reference mismatches only, so existing claims are never renumbered and one series cannot contain mixed numbering bases.

If an imported Jobber payment resembles a manual payment by date and amount, the UI suggests candidates only. Confirm Match is a version-checked transaction that verifies the same series, Jobber-to-Manual source direction, Active current revisions, and one-to-one constraint; it leaves the Jobber payment Active, appends a Superseded revision for only the Manual payment, and writes an audit event with reason. An audited Undo Match action appends a restored Active Manual revision after an incorrect match.

Date and amount similarity never serves as identity and never changes totals without confirmation.

### OAuth and API version gates

Adding OAuth scopes to a published Jobber app requires connected users to reauthorize and therefore requires explicit user approval before configuration changes. [Editing a Published Jobber App](https://developer.getjobber.com/docs/publishing_your_app/editing_a_published_app)

The effective version is getJobberConfig().graphqlVersion, currently defaulting to 2025-04-16. The same effective value must be used for GraphiQL confirmation, checked-in contract fixtures, and runtime requests. The confirmed contract records exact query documents, cursor/pageInfo shapes, nullable fields, enum fallback behavior, payment eligibility semantics, and the exact OAuth scope string. Exact support is never inferred from the latest public field list. [Jobber API Versioning](https://developer.getjobber.com/docs/using_jobbers_api/api_versioning/)

If the shared connection lacks the confirmed invoice/payment read scope, discovery stops before implementation. No scope configuration or reconnect occurs without explicit approval.

### Jobber failure behavior

- Preserve the last successful snapshot.
- Mark linked information stale and show the last successful time.
- Return separate errors for authorization, missing scope, not found, rate limit, and temporary service failure.
- Continue to allow local draft editing and download of already generated documents.
- Do not silently unlink a series or delete a payment.

The first issue requires a successfully verified Jobber account and invoice link. For later claims, a Jobber outage does not block issue when a prior successful immutable observation exists and the accepted account, invoice ID, and numbering base are unchanged; the user must acknowledge the stale-link warning and the event is audited.

## Official Tax Invoice Document Design

### Tax Invoice requirements

The current-claim page clearly displays:

- the words Tax Invoice;
- supplier identity and ABN;
- issue date;
- unique Tax Invoice number;
- recipient identity and address;
- site and supply description;
- the claim period or cumulative progress percentage as the extent of services supplied;
- a statement that the current claim is a fully taxable supply at the snapshotted 10% GST rate;
- current claim Ex GST;
- GST on the current claim;
- current claim Inc GST and amount payable; and
- payment due date and bank details.

For invoices of at least $1,000, recipient identity or ABN must be clear. The design stores and displays recipient name and address, with an optional recipient ABN. [GST Act section 29-70](https://www.ato.gov.au/law/view/document?LocID=%22PAC%2F19990055%2F29-70%282%29%22), [ATO GSTR 2013/1](https://www.ato.gov.au/law/view/document?LocID=%22GST%2FGSTR20131%2FNAT%2FATO%2Ffp66%22&PiT=20220701000001)

The contract-status figures are labelled informationally so they cannot be confused with the amount payable on the current Tax Invoice.

This design is a software specification, not tax advice. Accountant sign-off on the final form and the post-issue revision policy is a mandatory production gate.

### Preserved visual structure

- Same A4 portrait proportions.
- Same logo, company header position, blue-grey and red palette.
- Same recipient and invoice metadata regions.
- Same red current-claim amount placement.
- Same lower-right financial summary and lower-left bank-details placement.
- Same accounting-style dollar formatting.
- Minor font rasterization differences allowed.

Corrected wording includes:

- Final Progress instead of Fianl Progress;
- Due Date instead of Due recived;
- Previously instead of previsouly; and
- Previous Progress Claims instead of Paid for prior claimed amounts.

### Financial labels

The lower-right block contains:

1. Adjusted Contract Ex GST
2. Contract GST
3. Adjusted Contract Inc GST
4. Previous Progress Claims Inc GST
5. This Progress Claim Ex GST
6. GST on This Progress Claim
7. This Tax Invoice Inc GST
8. Remaining Unclaimed Contract Balance

The red headline amount equals This Tax Invoice Inc GST.

Actual receipts are managed and reported in the application, not substituted into the Tax Invoice’s previous-claim calculation.

### Excel template strategy

The source workbook is retained unchanged as evidence. Template registration produces a normalized app master derived from the sample:

- one canonical worksheet retains the sample styles, merges, column widths, logo, and drawing relationships;
- sample customer and financial values are cleared;
- corrected static labels are applied;
- A4 portrait paper size, fit-to-width, margins, print area, and gridline visibility are deterministic; and
- the normalized workbook receives a new immutable template hash.

Current-claim export clones the canonical worksheet once. Series export clones it once per included Claim Revision and names sheets P01 Progress, P02 Progress, and FINAL Progress.

The renderer patches explicit logical fields rather than recalculating business logic in Excel. Numeric cells receive final decimal values and preserved number formats. Sample financial formulas are removed from generated documents so opening or recalculating the workbook cannot change an issued amount.

Long descriptions are wrapped within the available area. If content cannot fit at the approved minimum font size, a continuation worksheet/page is added rather than truncating text or shrinking it to an unreadable size.

### PDF strategy

The PDF renderer uses the same logo and layout measurements to draw A4 pages from the immutable snapshot. It does not automate Microsoft Excel or LibreOffice.

Normal claims produce one page. Overflow creates numbered continuation pages with the Tax Invoice number and claim suffix repeated.

### Generation state and atomic publication

~~~text
Build immutable Document Snapshot
  -> validate mandatory tax and financial fields
  -> generate XLSX
  -> generate PDF
  -> extract and compare critical fields
  -> store both in private Storage
  -> atomically publish the new current series-revision set
~~~

If either renderer, validator, or upload fails:

- the prior Current series-revision set remains authoritative;
- the new generation is Failed with a safe error code;
- partial files are not exposed; and
- the user may retry with the same idempotency key.

### Drafts and post-issue edits

- Draft previews display a DRAFT mark.
- First successful issue creates Revision 1.
- Editing an Issued claim creates the next revision under the same claim and Tax Invoice number.
- Clerical edits are changes that do not alter Tax Invoice number, issue date, supplier or recipient legal identity/ABN, supply description or extent, contract/claim amounts, GST, progress, or claim order.
- Financial or tax-affecting edits are labelled Pending Tax Review. They may be entered directly in the same editor, but cannot replace the official current revision until the accountant-approved revision policy is satisfied and an approval or external Adjustment Note reference is recorded.
- A financial edit or Void affecting an earlier claim creates cascade revisions for every later claim so their Previous Progress Claims and GST snapshots remain coherent.
- The existing series-revision set stays current until every required replacement file passes validation and any tax-review gate is satisfied.
- The replacement shows a small Revised date.
- Prior revisions become Superseded, remain immutable, and remain downloadable from History.
- Default download always resolves to the latest current revision.

Automated Adjustment Note generation is out of scope. When the approved tax treatment requires one, the external reference is mandatory before publication. This preserves the requested same-document edit workflow and history without claiming that a replacement Tax Invoice alone resolves every adjustment event. [ATO GSTR 2000/1 — Adjustment Notes](https://www.ato.gov.au/law/view/pdf?DocId=GST%2FGSTR20001%2FNAT%2FATO%2F00001&PiT=20000322000001&filename=law%2Fview%2Fpdf%2Fpbr%2Fgstr2000-001.pdf)

### Download scopes

| User choice | Excel result | PDF result |
|---|---|---|
| Current claim | One claim worksheet plus any continuation sheet | Current Tax Invoice pages |
| Entire series | Ordered workbook containing the Current series-revision set | Ordered multi-page PDF containing the same set |

Void claims and superseded revisions are excluded from the standard series bundle and remain available through Audit History.

Example filenames:

- PBCinv2906-P02.xlsx
- PBCinv2906-P02.pdf
- PBCinv2906-PROGRESS-SERIES.xlsx
- PBCinv2906-PROGRESS-SERIES.pdf

Filenames are sanitized for the filesystem without changing the visible Tax Invoice number.

## User Experience Design

### Navigation

Add Progress Invoices as a top-level application destination rather than hiding it inside Quotes.

Routes:

- /progress-invoices
- /progress-invoices/new
- /progress-invoices/[seriesId]
- /progress-invoices/[seriesId]/claims/[claimId]

Quote detail also provides Create Progress Invoice or Open Progress Invoice when relevant.

### Dashboard

The dashboard supports:

- search by builder, recipient, site, PBC quote, or Jobber invoice number;
- filters for Draft, Active, Completed, Reconciliation Required, Overdue, Part Paid, Paid, and Void;
- adjusted contract value;
- cumulative claims;
- actual receipts;
- outstanding receivable;
- cumulative progress percentage;
- last Jobber sync time; and
- quick actions for open, refresh, new claim, and download.

Financial cards always label Claimed and Received separately.

### Series creation

The creation flow is a short guided sequence:

1. Choose Existing PBC Quote or Standalone.
2. Select the Jobber job, or use direct invoice lookup only if confirmed by the schema gate.
3. Select one invoice from the job’s fully paginated invoice list, or save a draft to link it later.
4. Resolve any multiple-job, billing-address, or property choices explicitly.
5. Review Jobber Client, recipient, and site candidates.
6. Edit and save the recipient and site snapshots.
7. Confirm base contract Ex GST and default description.
8. Save the series.

For a PBC quote, the quote total and details are offered as a prefill and then snapshotted. Later quote edits do not rewrite the series.

For standalone creation, the user enters the base contract amount. A Jobber invoice amount may be displayed beside it for comparison but is not silently copied as the contract value.

### Series detail

The page contains:

- contract summary and cumulative progress bar;
- Jobber link card with raw status, amounts, dates, stale indicator, and Refresh;
- recipient and site snapshot;
- Variation and Credit register;
- chronological Claim timeline;
- separate Payment Ledger;
- claimed, received, outstanding, and unclaimed summary;
- document download controls; and
- audit history.

### New or edited claim

The claim editor:

1. shows the adjusted contract and prior claims;
2. lets the user choose Cumulative Progress % or This Claim Amount;
3. exposes only the authoritative input;
4. recalculates the other value immediately;
5. shows Ex GST, GST, Inc GST, cumulative total, remaining balance, and warnings;
6. accepts issue date, due date, description, and revision reason;
7. previews the Tax Invoice; and
8. saves Draft or Issues.

An Issued claim opens in the same editor and retains the same Claim and Tax Invoice identity. Revision-set and tax-review mechanics appear in History and validation messaging rather than forcing the user to duplicate the invoice manually.

Switching input mode preserves the current financial result as the starting value but clearly changes which field is authoritative.

FINAL is terminal: it starts with the residual Ex GST and GST balances, reaches 100%, and cannot be issued with a non-zero remainder. A user who needs another partial claim creates the next Pxx claim before FINAL.

### Payments

The Payment Ledger shows source badges:

- Jobber
- Manual
- Matched/Superseded
- Unconfirmed
- Void

Users may add, edit, or void only Manual payments. An edit appends an immutable Payment Revision while presenting as a normal edit in the UI. Imported Jobber payments are read-only. A suspected duplicate exposes Compare and Confirm Match rather than automatic mutation.

Matched records expose Undo Match with a required reason. Refunded, reversed, disappeared, or schema-ambiguous Jobber records are shown as reconciliation items and are not silently counted.

### Downloads

A single Download control asks:

1. Current Claim or Entire Series
2. Excel or PDF

The UI displays document revision, generated time, template version, and whether the file is current. Historical revision downloads are located in History to avoid accidental use.

## State Transitions

### Series

| From | Action | To |
|---|---|---|
| Draft | First claim successfully issued | Active |
| Active | FINAL leaves zero unclaimed balance | Completed |
| Completed | Later adjustment or proposed financial revision reopens a balance | Reconciliation Required |
| Draft or Active | Credit makes prior claims exceed contract | Reconciliation Required |
| Reconciliation Required | Revision chain restores validity before FINAL | Active |
| Reconciliation Required | Revised FINAL chain restores zero balance | Completed |
| Any non-void | Explicit void with reason | Void |

### Claim

| From | Action | To |
|---|---|---|
| Draft | Both documents generate and validate | Issued |
| Issued | Edit and replacement generation succeeds | Issued with new current revision |
| Draft or Issued | Explicit void with reason | Void |

Voiding an Issued claim is a financial chain change. The Void becomes effective only when the replacement series-revision set, later cascade revisions, document checks, and tax-review requirements all pass.

Document generation has its own Pending, Generating, Ready, and Failed state and never uses a claim status to represent a transient renderer failure.

## Server and Data Flow

All writes pass through Zod-validated Server Actions that return the repository Result type.

Conceptual commands:

- createProgressInvoiceSeries
- updateProgressInvoiceSeries
- linkJobberInvoice
- refreshJobberInvoice
- acceptObservedJobberInvoiceNumber
- createProgressAdjustment
- updateDraftProgressAdjustment
- approveProgressAdjustment
- supersedeProgressAdjustment
- createProgressClaim
- saveProgressClaimDraft
- issueProgressClaim
- reviseIssuedProgressClaim
- voidProgressClaim
- createManualProgressPayment
- replaceManualProgressPayment
- voidManualProgressPayment
- reconcileManualWithJobberPayment
- undoProgressPaymentReconciliation
- generateProgressInvoiceDownload

Each financial command delegates to a focused domain service and transactional RPC. Server Actions do not contain duplicate calculation logic.

Read paths return purpose-specific DTOs for dashboard, series detail, editor, Jobber selector, payments, and history. Raw table rows and raw GraphQL responses are not passed directly to client components.

## Security and Privacy

- Enable RLS on every new table.
- Restrict access to authenticated allowed users, matching current app policy.
- Use auth.uid() inside database transactions for actor identity.
- Keep service-role credentials server-only.
- Store template and generated documents in private Supabase Storage buckets.
- Issue short-lived signed download URLs only after authorization.
- Do not store documents, bank details, recipient data, or payment details in public assets, localStorage, logs, analytics payloads, or service-worker caches.
- Never log actual_price or full financial document payloads.
- Escape all XLSX XML and PDF text inputs and enforce field-length limits.
- Write every user-controlled workbook value as an explicit text cell; content beginning with =, +, -, or @ is never emitted as a formula.
- Reject templates containing macros, external links, OLE objects, data connections, or relationships outside the approved workbook/image/style allowlist.
- Enforce compressed size, uncompressed size, part-count, and XML-size limits before expanding or patching an XLSX.
- Do not render user text with dangerouslySetInnerHTML.
- Use opaque storage paths rather than customer names or invoice numbers.
- Revoke UPDATE and DELETE grants/policies for audit events; ordinary authenticated users may append only through authorized transactional functions.
- Require a reason for post-issue revision, Void, and payment reconciliation actions.

The recommended private buckets are:

- progress-invoice-templates
- progress-invoice-documents

Production bucket creation, storage policies, and database migrations require explicit approval.

## Concurrency, Idempotency, and Error Handling

### Optimistic concurrency

Series, adjustments, claims, and settings use version numbers. A stale edit returns a conflict with current server data instead of overwriting another user’s change.

### Idempotency

Issue, revision generation, Jobber refresh, accepted-number changes, and payment reconciliation use idempotency keys so retries cannot create duplicate claims, documents, or payments.

### Validation failures

Issuing is blocked when:

- no linked Jobber invoice or number exists;
- the first issue has no successfully verified Jobber account/invoice observation;
- supplier identity or ABN is missing;
- recipient identity or address is missing;
- issue or due date is invalid;
- adjusted contract is not positive;
- current claim is not positive;
- cumulative percentage is outside 0 to 100;
- the claim exceeds the remaining contract value;
- a Credit creates an over-claimed contract;
- GST figures do not reconcile;
- the Tax Invoice number is duplicated; or
- the template hash or required logo/cell map is invalid.

A later issue based on a prior successful but stale Jobber observation requires explicit acknowledgement. It remains blocked if account or invoice identity is ambiguous or changed.

### Renderer failures

Render failures retain the last valid current document, expose a retryable error, and never issue a partially generated Tax Invoice.

### Storage failures

Both files must be stored and re-read for hash verification before publication. Orphaned failed-generation objects are quarantined for safe cleanup and never exposed as Ready.

### Jobber failures

The last good snapshot remains visible with a stale warning. Draft edits and existing downloads remain available. Later issue follows the explicit stale-observation acknowledgement policy; first issue never does.

## Verification Strategy

### Financial unit tests

Cover:

- percentage-authoritative claims;
- amount-authoritative claims;
- multiple claims and cumulative rounding;
- 90% followed by remaining FINAL;
- Variation before and after prior claims;
- Credit before and after prior claims;
- over-claimed reconciliation blocking;
- current-claim GST cent reconciliation;
- FINAL residual reconciliation for cumulative Ex GST, GST, and Inc GST;
- v1 GST-rate enforcement and cent-boundary Variation/Credit cases;
- zero and boundary validation;
- partial payment, full payment, overpayment, and overdue summaries;
- FIFO ageing across two Claims with different due dates; and
- switching input mode without changing the current monetary result.

All expected values use decimal strings and exact cents.

### Database and RLS tests

Verify:

- authenticated access and unauthenticated denial;
- series uniqueness by Jobber account and invoice ID;
- global Tax Invoice number uniqueness;
- transactionally reserved and never-reused Claim numbers;
- immutable issued revisions;
- coherent series revision sets when P01 is revised or voided after P02 or FINAL;
- immutable normalized Jobber observations separated from editable PBC snapshots;
- immutable Approved adjustments and superseding correction chains;
- reconstructable Manual and Jobber payment revision history;
- append-only audit events;
- expected-version conflicts;
- atomic issue/current-revision publication;
- all-or-nothing Jobber invoice/payment refresh;
- Jobber payment deduplication and disappeared-record handling;
- one-to-one Manual/Jobber matching;
- audited Undo Match; and
- manual payment Void and Superseded behavior.

### Jobber contract tests

Use mocked GraphQL responses for:

- job invoice pagination;
- absence of direct invoice search and job-first fallback;
- multiple job/property selection;
- invoice and client normalization;
- multiple payment pages;
- payment amount/date/status changes;
- disappeared, refunded, reversed, and ambiguous payment records;
- incomplete pagination causing no database mutation;
- missing optional fields;
- token refresh;
- missing scope;
- exact effective version and pagination contract;
- version or schema mismatch;
- rate limit; and
- temporary failure.

Before implementation, run an authorized read-only GraphiQL smoke check using the same effective Jobber API version as runtime and record the exact query documents, pagination shape, nullable fields, enum fallbacks, payment eligibility semantics, direct-search availability, and OAuth scope.

Existing quote integration regression tests remain required, including Jobber transport, read-only enforcement, quote-write allowlisting, route security, token refresh, and quote refresh behavior. The Progress Invoice gateway must not alter existing quote fetch, snapshot, Save & Sync, or approved quote-line mutation behavior.

### XLSX tests

Unzip generated workbooks and assert:

- expected worksheet names and order;
- critical cell values and numeric types;
- retained merges, styles, logo relationship, and image;
- accounting number formats;
- no financial formulas in generated claim cells;
- user-controlled strings remain text even when beginning with =, +, -, or @;
- macros, external links, OLE, data connections, unexpected relationships, and oversized ZIP/XML parts are rejected;
- A4 portrait print settings and print area;
- no sample customer data remains;
- current-claim and whole-series scope behavior; and
- template and content hashes are recorded.

Open representative current-claim and full-series outputs in Microsoft Excel, force recalculation, and confirm every displayed financial value remains unchanged.

### PDF tests

Assert:

- A4 page dimensions;
- expected page count;
- Tax Invoice number and required text;
- recipient, dates, Ex GST, GST, and Inc GST values;
- current-claim and series ordering;
- continuation-page headers; and
- no Draft mark on issued documents.

Render the supplied sample and representative outputs at 144 DPI, producing a 1191 × 1684 pixel image for each normal A4 page. Non-text rules and block anchors must be within 4 pixels of their approved coordinates; the logo bounding box must be within 4 pixels; the approved palette RGB values must match exactly; and extracted financial values must match to the cent. Font glyph pixels are excluded from whole-page pixel equality, but text bounding boxes must remain within their approved regions.

### End-to-end scenarios

1. Create from PBC quote, link Jobber invoice, add Variation, issue P01.
2. Add Credit, enter cumulative 90%, issue P02.
3. Record a Jobber partial payment and a missing manual payment.
4. Reconcile the manual payment when Jobber later returns the same receipt.
5. Issue FINAL for the remaining balance.
6. Confirm a partial FINAL and a post-FINAL Claim are blocked.
7. Download current claim and full Current revision set in both formats.
8. Apply a clerical Issued edit and confirm the prior revision remains available.
9. Propose a financial P01 edit after P02, confirm the old set stays current, then publish the validated cascade only after the tax-review gate.
10. Simulate Jobber outage and confirm local history/download remains available under the stale-observation policy.
11. Confirm hostile spreadsheet text and unauthorized table/storage access are denied.

The repository verification command, TypeScript compilation, ESLint, unit tests, integration tests, and affected browser tests must pass.

## Implementation Sequence

The detailed implementation plan will decompose this design into test-first tasks. The intended delivery sequence is:

1. Confirm the exact Jobber invoice/payment queries, pagination, payment semantics, direct-search availability, and OAuth scope at the effective runtime version. Stop if usable invoice or payment identity/amount semantics cannot be confirmed.
2. Obtain approval for the minimal XLSX/PDF dependencies.
3. Add schema, RPCs, RLS, Storage policies, and generated TypeScript types in a local migration.
4. Implement the pure calculation engine and financial tests.
5. Implement the read-only Jobber invoice gateway and contract tests.
6. Implement series, adjustments, claims, revisions, payments, and audit services.
7. Register and normalize the supplied workbook template.
8. Implement XLSX rendering and structural verification.
9. Implement PDF rendering and cross-format verification.
10. Implement dashboard, create flow, series detail, claim editor, payments, history, and download UI.
11. Update the approved project documentation set: ARCHITECTURE, DB-SCHEMA, SECURITY, relevant UI documentation, and PROGRESS.
12. Complete end-to-end, security, accessibility, and visual QA.
13. Record accountant sign-off on the Tax Invoice form and post-issue financial-revision policy.
14. Obtain explicit approval before applying production migrations, Storage policies, OAuth changes, environment changes, or the production feature flag.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Workbook changes lose logo or styling | Clone mapped OOXML parts, hash the template, and structurally test relationships and styles |
| Excel and PDF show different totals | Render from one immutable snapshot and cross-check extracted critical fields |
| Later Variation changes old claims | Snapshot all financial inputs per revision |
| Previous claims are mistaken for cash receipts | Separate labels, tables, calculations, and UI cards |
| Manual payment later appears in Jobber | Suggest user-confirmed reconciliation; never auto-merge |
| Jobber schema or scopes differ | Verify GraphiQL at pinned version before implementation |
| Issued edit destroys evidence | Immutable superseded revisions and append-only events |
| Earlier-claim edit makes later claims inconsistent | Publish only a validated atomic series-revision set with cascade revisions |
| Credit causes over-claim | Enter Reconciliation Required and block another issue |
| Long descriptions break A4 | Add continuation pages instead of truncation or unreadable fonts |
| Spreadsheet content becomes executable | Force user values to text and reject active or unexpected workbook content |
| Private financial files leak | Private buckets, authorization, signed URLs, opaque paths, and no client caching |
| Vercel renderer resource limits | Keep renderers deterministic and lightweight; benchmark representative full-series bundles before release |
| Tax wording is incomplete | Validate required fields and obtain accountant review before production use |

## Approval Gates

The following gates are not satisfied by this design document alone:

- adding external XLSX, ZIP/XML, font, or PDF dependencies;
- embedding or distributing a font before its licence is verified and approved;
- changing Jobber OAuth scopes or requiring reauthorization;
- applying a production database migration;
- creating or changing production Storage buckets and policies;
- changing Vercel environment variables or domains;
- enabling a production feature flag;
- treating the generated form and financial-revision workflow as production Tax Invoices before accountant sign-off; or
- changing the core project scope or decisions in docs/DECISIONS.md without explicit user approval.

State-changing project actions require explicit user approval at the relevant implementation step. Accountant sign-off and font-licence evidence must also be recorded before their corresponding production gate passes.

## Acceptance Criteria

- A series can be created from a PBC quote or as a standalone Jobber-linked record.
- Exactly one Jobber account/invoice identity can be linked to a series and reused across its claims.
- Multiple Jobber jobs/properties require explicit user selection and are never resolved by taking the first result.
- After the GraphiQL gate records the confirmed schema and scope, every confirmed invoice, client, date, amount, and payment field can be atomically refreshed without a Jobber write.
- Optional or unavailable Jobber fields remain explicitly null or unknown and are never inferred or fabricated.
- Partial Jobber pagination or refresh failure changes neither the last observation nor the Payment Ledger.
- Recipient Jobber prefill is editable and preserved as a series snapshot.
- Approved Variations increase and approved Credits reduce the adjusted contract.
- Retention is absent from calculations and UI.
- Users can select cumulative progress percentage or current claim amount as the authoritative input.
- The derived value and cumulative Ex GST, GST, and Inc GST figures reconcile to cents using Decimal.js, including residual FINAL handling.
- FINAL is unique, terminal, reaches 100%, and consumes the complete remaining balance.
- Previous Progress Claims and Actual Receipts remain separate everywhere.
- Approved adjustments and all payment changes retain reconstructable immutable history.
- Jobber and manual payments are distinguishable, partial payments work, and duplicates can be reconciled and unlinked without deletion.
- P01, P02, and FINAL Tax Invoice numbers use the linked Jobber invoice number plus suffix.
- One accepted numbering base is locked for the whole series when its first Claim is created.
- The generated Excel preserves the supplied layout, logo, colours, placement, and accounting formats.
- The generated PDF matches the same A4 design, allowing minor font-rendering differences.
- Both formats clearly show the current claim Ex GST, GST, Inc GST, supplier, recipient, dates, Tax Invoice number, and extent of services/progress.
- Users can download the current claim or complete Current series-revision set in Excel or PDF.
- Editing an Issued claim replaces the current series-revision set only after all required cascade documents validate and any tax-review requirement is satisfied.
- Every earlier revision remains immutable, audited, and downloadable.
- Financial edits to earlier Claims cannot produce a bundle whose later Claims reference a different predecessor financial chain.
- RLS, private Storage, signed downloads, actor attribution, optimistic locking, and idempotency are verified.
- Existing Jobber quote read/write behavior and its narrow mutation allowlist remain unchanged.
- Accountant approval of the form and financial-revision policy is recorded before production enablement.
- Representative financial, Jobber, workbook, PDF, database, security, and end-to-end tests pass.

## References

- [Jobber Developer Center](https://developer.getjobber.com/docs/)
- [Jobber Getting Started and GraphiQL](https://developer.getjobber.com/docs/getting_started/)
- [Jobber App Authorization](https://developer.getjobber.com/docs/building_your_app/app_authorization/)
- [Editing a Published Jobber App](https://developer.getjobber.com/docs/publishing_your_app/editing_a_published_app)
- [Jobber API Versioning](https://developer.getjobber.com/docs/using_jobbers_api/api_versioning/)
- [Jobber API Rate Limits](https://developer.getjobber.com/docs/using_jobbers_api/api_rate_limits/)
- [GST Act section 29-70](https://www.ato.gov.au/law/view/document?LocID=%22PAC%2F19990055%2F29-70%282%29%22)
- [ATO GSTR 2013/1](https://www.ato.gov.au/law/view/document?LocID=%22GST%2FGSTR20131%2FNAT%2FATO%2Ffp66%22&PiT=20220701000001)
- [ATO GSTR 2000/1 — Adjustment Notes](https://www.ato.gov.au/law/view/pdf?DocId=GST%2FGSTR20001%2FNAT%2FATO%2F00001&PiT=20000322000001&filename=law%2Fview%2Fpdf%2Fpbr%2Fgstr2000-001.pdf)
