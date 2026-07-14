# Progress Invoices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a production-gated Progress Invoice module that links one Jobber invoice to one claim series, keeps claimed amounts separate from receipts, supports user-controlled percentage or amount entry, Variation/Credit and partial payments, and generates matching official Tax Invoice XLSX/PDF documents from the approved sample design.

**Architecture:** Supabase owns immutable series, claim, revision-set, payment, Jobber-observation, audit, and document records. Pure Decimal.js services calculate claims and payment positions. A server-only, query-only Jobber gateway normalizes complete paginated observations. A canonical revision snapshot feeds a template-preserving OOXML renderer and an independent A4 PDF renderer; both artifacts must validate and persist before one database transaction can make a new revision set current.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Node.js 20.16 or newer, Supabase/Postgres/RLS/Storage, Decimal.js, Zod, Vitest, Jobber GraphQL at the effective pinned API version, fflate, @xmldom/xmldom, pdf-lib, @pdf-lib/fontkit, pdfjs-dist, and @napi-rs/canvas 0.1.88 for PDF visual verification

## Global Constraints

- The approved source of truth is docs/superpowers/specs/2026-07-14-progress-invoices-design.md.
- All implementation subagents must run with model = "gpt-5.6-sol" and model_reasoning_effort = "high".
- Use a separate codex/progress-invoice-series branch and isolated worktree before implementation. Do not modify the approved design while implementing unless the user approves a decision change.
- This plan does not authorize a production migration, production Storage change, Jobber OAuth scope change, reconnect, Vercel environment change, feature enablement, or deployment.
- Jobber invoice and payment access remains read-only. Do not add an invoice/payment mutation or widen the existing Quote mutation allowlist.
- One non-void Progress Invoice Series can link to only one Jobber account/invoice identity; the pair and accepted numbering base lock when the first Claim draft reserves its number.
- Previous Progress Claims means prior issued claims in the current revision set. Actual Receipts is a separate Jobber/manual payment ledger.
- Retention, automatic Adjustment Notes, Jobber writes, scheduled sync, email delivery, payment collection, multi-currency, and non-Australian GST remain out of scope.
- Store money as Postgres numeric and transport it as decimal strings. Use Decimal.js with ROUND_HALF_UP; do not use Number, parseFloat, or native arithmetic for financial values.
- GST is exactly 0.10 and the business timezone is Australia/Sydney in v1.
- TypeScript strict remains enabled; no any, dangerouslySetInnerHTML, raw customer/payment logging, browser persistence of financial data, or public document/template object.
- Server Actions accept unknown, validate with Zod, call requireAllowedUser(), and return ActionResult. Database actors come from auth.uid(), never from client payloads.
- New financial writes use SECURITY DEFINER RPCs with a fixed search_path, expected version, and idempotency/correlation key. Revoke direct table writes from authenticated clients. Authenticated prepare commands capture auth.uid(); service-only document finalizers read that stored actor and never accept actor IDs.
- Every behavior change follows a RED -> GREEN cycle. Run the focused command after each task and commit only when it is green.
- The original XLSX/PDF and any file containing customer, bank, or payment data must not be committed. Only a verified, cleared, normalized template and non-identifying fixtures may enter the repository.
- Do not mark accountant, font-license, dependency, production, or OAuth gates complete without their own evidence and explicit approval.
- Do not update docs/DECISIONS.md or docs/BACKLOG.md without explicit user approval.

---

## Approval and Evidence Gates

| Gate | Required evidence | Stop condition |
|---|---|---|
| G0 Design | Approved design status and commit | Already approved; record it before implementation |
| G1 Jobber contract | Read-only GraphiQL evidence at getJobberConfig().graphqlVersion, exact queries, pagination, nullability, scope, and payment semantics | Missing scope, ambiguous payment identity/effect, or version mismatch |
| G2 Dependencies | Explicit approval for the five exact runtime packages plus pdfjs-dist's native canvas optional dependency, Node/platform/install-size evidence, and a clean audit | No dependency installation or runtime change without approval |
| G3 Font | Carlito Regular/Bold files, OFL text, hashes, and explicit distribution approval | Use no unlicensed font; visual gate remains blocked |
| G4 Local data platform | Local migration reset, lint, pgTAP, generated types, and RLS integration pass | Never substitute a production project for local verification |
| G5 Tax form | Accountant signs off Tax Invoice fields and post-issue financial-revision/Adjustment Note policy | Production Tax Invoice use remains disabled |
| G6 Production | Explicit approvals for migration, private buckets/policies, OAuth reauthorization if needed, environment flag, and deploy | Keep PROGRESS_INVOICES_ENABLED off in production |

Exact dependency proposal for G2:

~~~powershell
npm.cmd install --save-exact fflate@0.8.3 @xmldom/xmldom@0.9.10 pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1 pdfjs-dist@5.4.624
~~~

Exact visual-test pin included in G2:

~~~powershell
npm.cmd install --save-dev --save-exact @napi-rs/canvas@0.1.88
~~~

The implementation must not run either command until the user approves G2. pdfjs-dist 5.4.624 declares optional @napi-rs/canvas ^0.1.88; pinning 0.1.88 avoids an unreviewed or duplicate native version while making 144-DPI tests reproducible. package.json declares engines.node >=20.16.0. Verify the local and Vercel Node runtimes before installation; a required Vercel runtime change remains a G6 production action. ExcelJS and Office/LibreOffice automation are not used because this design preserves OOXML relationships directly and runs in the existing server environment.

## Stable Interfaces

The following contracts are fixed for this implementation. Changing one is a design change and requires review before code continues.

~~~ts
export type DecimalString = string
export type GstRateV1 = '0.10'
export type ProgressClaimKind = 'progress' | 'final'
export type ProgressClaimInputMode =
  | 'cumulative_percentage'
  | 'current_claim_amount'

export const PROGRESS_INVOICE_TEXT_LIMITS = {
  legalName: 160,
  tradingName: 160,
  contractorLicence: 64,
  abn: 14,
  address: 300,
  recipientName: 160,
  recipientCompany: 160,
  email: 254,
  phone: 40,
  siteName: 160,
  siteAddress: 300,
  description: 1200,
  notes: 2000,
  reference: 120,
  adjustmentDescription: 500,
  revisionReason: 500,
  paymentMethod: 80,
  paymentReference: 120,
  invoiceNumberBase: 64,
  bankName: 120,
  bankAccountName: 120,
  bsb: 16,
  accountNumber: 32,
  jobberWebUri: 2048,
} as const

export interface ProgressClaimCalculationInput {
  kind: ProgressClaimKind
  inputMode: ProgressClaimInputMode
  authoritativeValue: DecimalString
  baseContractExGst: DecimalString
  gstRate: GstRateV1
  approvedAdjustments: readonly {
    id: string
    type: 'variation' | 'credit'
    amountExGst: DecimalString
  }[]
  previousClaims: readonly {
    claimId: string
    sequence: number
    exGst: DecimalString
    gst: DecimalString
    incGst: DecimalString
  }[]
}

export interface ProgressClaimCalculation {
  adjustedContractExGst: DecimalString
  adjustedContractGst: DecimalString
  adjustedContractIncGst: DecimalString
  previousClaimsExGst: DecimalString
  previousClaimsGst: DecimalString
  previousClaimsIncGst: DecimalString
  cumulativeTargetExGst: DecimalString
  cumulativeTargetGst: DecimalString
  cumulativeTargetIncGst: DecimalString
  currentClaimExGst: DecimalString
  currentClaimGst: DecimalString
  currentClaimIncGst: DecimalString
  cumulativePercentage: DecimalString
  remainingExGst: DecimalString
  remainingGst: DecimalString
  remainingIncGst: DecimalString
}
~~~

~~~ts
export interface JobberPageInfo {
  endCursor: string | null
  hasNextPage: boolean
}

export interface JobberConnectionPage<T> {
  nodes: readonly T[]
  pageInfo: JobberPageInfo
}

export interface JobberInvoiceReadContract {
  effectiveGraphqlVersion: string
  requiredReadScopes: readonly string[]
  supportsDirectInvoiceSearch: boolean
  invoiceAmountFields: readonly string[]
  paymentEligibilityPolicyVersion: string
}

export interface NormalizedJobberPaymentObservation {
  jobberPaymentId: string
  receivedAt: string | null
  observedAmount: DecimalString
  effectiveReceiptAmount: DecimalString
  paymentMethod: string | null
  reference: string | null
  externalStatus: string | null
  treatment:
    | 'applied'
    | 'refund'
    | 'reversal'
    | 'excluded'
    | 'ambiguous'
  externalUpdatedAt: string | null
}

export interface NormalizedJobberInvoiceObservation {
  schemaVersion: 1
  effectiveGraphqlVersion: string
  jobberAccountId: string
  jobberInvoiceId: string
  invoiceNumber: string
  jobberWebUri: string
  rawStatus: string
  normalizedStatus:
    | 'draft'
    | 'awaiting_payment'
    | 'part_paid'
    | 'paid'
    | 'past_due'
    | 'unknown'
  jobberJobIds: readonly string[]
  jobberClientId: string
  jobberPropertyIds: readonly string[]
  selectedJobberJobId: string | null
  selectedJobberPropertyId: string | null
  amounts: {
    subtotal: DecimalString | null
    tax: DecimalString | null
    total: DecimalString | null
    balance: DecimalString | null
  }
  issuedAt: string | null
  dueAt: string | null
  receivedAt: string | null
  externalUpdatedAt: string | null
  client: {
    name: string
    companyName: string | null
    email: string | null
    phone: string | null
  }
  addressCandidates: readonly {
    source: 'billing' | 'property'
    jobberPropertyId: string | null
    formattedAddress: string
  }[]
  payments: readonly NormalizedJobberPaymentObservation[]
  fetchedAt: string
  responseFingerprint: string
  warnings: readonly string[]
}
~~~

~~~ts
export type ProgressInvoiceRenderRequest =
  | {
      scope: 'current_claim'
      snapshots: readonly [ProgressInvoiceDocumentSnapshot]
    }
  | {
      scope: 'series'
      revisionSetId: string
      manifestHash: string
      snapshots: readonly ProgressInvoiceDocumentSnapshot[]
    }

export interface RenderedClaimCriticalFields {
  claimId: string
  taxInvoiceNumber: string
  issueDate: string
  dueDate: string
  recipientName: string
  currentClaimExGst: DecimalString
  currentClaimGst: DecimalString
  currentClaimIncGst: DecimalString
  headlineAmount: DecimalString
}

export interface RenderedProgressDocument {
  format: 'xlsx' | 'pdf'
  bytes: Uint8Array
  sha256: string
  pageOrWorksheetCount: number
  criticalFields: readonly RenderedClaimCriticalFields[]
}

export interface ProgressInvoiceRenderer {
  render(
    request: ProgressInvoiceRenderRequest
  ): Promise<RenderedProgressDocument>
}
~~~

Extend the existing Result type without breaking any existing call site:

~~~ts
export type ActionErrorCode =
  | 'VALIDATION'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'RECONCILIATION_REQUIRED'
  | 'JOBBER_ERROR'
  | 'DOCUMENT_ERROR'
  | 'STORAGE_ERROR'

export type ActionResult<T, TCurrent = never> =
  | { ok: true; data: T }
  | {
      ok: false
      error: string
      code?: ActionErrorCode
      current?: TCurrent
    }
~~~

Shared DTOs live in lib/progress-invoices/types.ts and use these names throughout the plan:

~~~ts
export interface VersionedMutationResult {
  id: string
  seriesId: string
  version: number
}

export interface ProgressInvoiceMoneySummary {
  adjustedContractExGst: DecimalString
  adjustedContractGst: DecimalString
  adjustedContractIncGst: DecimalString
  claimedExGst: DecimalString
  claimedGst: DecimalString
  claimedIncGst: DecimalString
  actualReceipts: DecimalString
  outstandingReceivable: DecimalString
  creditBalance: DecimalString
  unclaimedExGst: DecimalString
  unclaimedGst: DecimalString
  unclaimedIncGst: DecimalString
  cumulativePercentage: DecimalString
  paymentState:
    | 'unpaid'
    | 'part_paid'
    | 'paid'
    | 'overdue'
    | 'credit_balance'
}

export interface ProgressInvoiceRecipientSnapshot {
  name: string
  companyName: string | null
  address: string
  email: string | null
  phone: string | null
  abn: string | null
  siteName: string
  siteAddress: string
}

export interface ProgressAdjustmentDto {
  id: string
  seriesId: string
  type: 'variation' | 'credit'
  status: 'draft' | 'approved' | 'rejected' | 'superseded' | 'void'
  effectiveDate: string
  displayOrder: number
  description: string
  amountExGst: DecimalString
  gstRate: GstRateV1
  supersededAdjustmentId: string | null
  reason: string | null
  version: number
}

export interface ProgressClaimTimelineDto {
  id: string
  sequence: number
  kind: ProgressClaimKind
  suffix: string
  taxInvoiceNumber: string
  status: 'draft' | 'issued' | 'void'
  currentRevisionId: string | null
  currentRevisionNumber: number | null
  issueDate: string | null
  dueDate: string | null
  currentClaimIncGst: DecimalString | null
  cumulativePercentage: DecimalString | null
  isCurrentSetRevision: boolean
}

export interface ProgressPaymentDto {
  id: string
  seriesId: string
  source: 'jobber' | 'manual'
  jobberPaymentId: string | null
  matchedManualPaymentId: string | null
  revisionNumber: number
  receivedDate: string
  observedAmount: DecimalString
  effectiveReceiptAmount: DecimalString
  paymentMethod: string | null
  reference: string | null
  externalStatus: string | null
  syncState: string | null
  status: 'active' | 'superseded' | 'unconfirmed' | 'void'
  version: number
}

export interface ProgressPaymentLedgerDto {
  payments: readonly ProgressPaymentDto[]
  suggestedMatches: readonly {
    jobberPaymentId: string
    manualPaymentId: string
    sameAmount: boolean
    dateDistanceDays: number
  }[]
  summary: ProgressInvoiceMoneySummary
}

export interface ProgressInvoiceDocumentDto {
  id: string
  claimRevisionId: string | null
  revisionSetId: string | null
  scope: 'current_claim' | 'series_bundle'
  format: 'xlsx' | 'pdf'
  state: 'pending' | 'generating' | 'ready' | 'failed'
  templateVersion: number
  rendererVersion: string
  sha256: string | null
  pageOrWorksheetCount: number | null
  generatedAt: string | null
  isCurrent: boolean
}

export interface ProgressInvoiceEventDto {
  id: string
  eventType: string
  source: 'user' | 'jobber_sync' | 'system'
  actorDisplayName: string
  occurredAt: string
  priorRevisionId: string | null
  nextRevisionId: string | null
  safeFieldChanges: Readonly<Record<string, string | null>>
}

export interface ProgressInvoiceSeriesDetail {
  id: string
  sourceType: 'pbc_quote' | 'jobber_job' | 'jobber_invoice'
  quoteId: string | null
  status:
    | 'draft'
    | 'active'
    | 'completed'
    | 'reconciliation_required'
    | 'void'
  version: number
  baseContractExGst: DecimalString
  gstRate: GstRateV1
  acceptedNumberingBase: string | null
  jobber: {
    accountId: string | null
    invoiceId: string | null
    originalInvoiceNumber: string | null
    latestObservedInvoiceNumber: string | null
    rawStatus: string | null
    webUri: string | null
    lastAttemptAt: string | null
    lastSuccessfulSyncAt: string | null
    safeErrorCode: string | null
    isStale: boolean
  }
  recipient: ProgressInvoiceRecipientSnapshot
  defaultDescription: string
  reference: string | null
  summary: ProgressInvoiceMoneySummary
  adjustments: readonly ProgressAdjustmentDto[]
  claims: readonly ProgressClaimTimelineDto[]
  paymentLedger: ProgressPaymentLedgerDto
  documents: readonly ProgressInvoiceDocumentDto[]
  events: readonly ProgressInvoiceEventDto[]
}

export interface ProgressInvoiceDashboardItem {
  id: string
  recipientName: string
  siteAddress: string
  quoteId: string | null
  jobberInvoiceNumber: string | null
  status: ProgressInvoiceSeriesDetail['status']
  summary: ProgressInvoiceMoneySummary
  lastSuccessfulJobberSyncAt: string | null
}

export interface ProgressInvoiceDashboardDto {
  items: readonly ProgressInvoiceDashboardItem[]
  page: number
  pageSize: number
  total: number
}

export interface ProgressInvoiceListInput {
  query: string
  statuses: readonly string[]
  page: number
  pageSize: number
  quoteId: string | null
}

export interface ProgressInvoiceCreatePrefill {
  sourceType: 'pbc_quote' | 'standalone'
  quoteId: string | null
  baseContractExGst: DecimalString
  comparisonIncGst: DecimalString | null
  recipient: ProgressInvoiceRecipientSnapshot
  defaultDescription: string
  reference: string | null
}

export interface ClaimMutationResult extends VersionedMutationResult {
  claimId: string
  taxInvoiceNumber: string
}

export interface ClaimRevisionMutationResult extends VersionedMutationResult {
  claimId: string
  revisionId: string
  revisionNumber: number
}

export interface RevisionPublicationResult extends ClaimRevisionMutationResult {
  revisionSetId: string
  revisionSetNumber: number
  currentDocumentIds: readonly string[]
}

export interface PaymentMutationResult extends VersionedMutationResult {
  paymentId: string
  paymentRevisionId: string
}

export interface PaymentReconciliationResult {
  seriesId: string
  jobberPaymentId: string
  manualPaymentId: string
  seriesVersion: number
}
~~~

Revision and document contracts:

~~~ts
export interface ClaimFinancialSnapshot {
  taxInvoiceNumber: string
  issueDate: string
  supplierLegalName: string
  supplierAbn: string
  recipientName: string
  recipientAbn: string | null
  supplyDescription: string
  adjustmentSnapshotHash: string
  inputMode: ProgressClaimInputMode
  authoritativeValue: DecimalString
  calculation: ProgressClaimCalculation
  sequence: number
  voided: boolean
}

export interface RevisionSetPlanningInput {
  seriesId: string
  operation: 'issue' | 'revise' | 'void'
  targetClaimId: string
  proposedTarget: ClaimFinancialSnapshot
  currentClaims: readonly {
    claimId: string
    revisionId: string
    revisionNumber: number
    inputMode: ProgressClaimInputMode
    authoritativeValue: DecimalString
    financialSnapshot: ClaimFinancialSnapshot
  }[]
}

export interface RevisionSetPlan {
  requiresCascade: boolean
  editClassification: 'clerical' | 'financial_tax_affecting'
  proposedRevisions: readonly {
    claimId: string
    sourceRevisionId: string | null
    revisionNumber: number
    financialSnapshot: ClaimFinancialSnapshot
    financialSnapshotHash: string
    predecessorFinancialManifestHash: string
  }[]
  aggregateFinancialManifestHash: string
  validationErrors: readonly string[]
}

export interface ProgressClaimEditorDto {
  seriesId: string
  seriesVersion: number
  claimId: string
  claimVersion: number
  claimStatus: 'draft' | 'issued' | 'void'
  taxInvoiceNumber: string
  currentRevisionId: string | null
  currentRevisionNumber: number | null
  inputMode: ProgressClaimInputMode
  authoritativeValue: DecimalString
  calculation: ProgressClaimCalculation
  issueDate: string
  dueDate: string
  description: string
  notes: string
  revisionReason: string | null
  proposedCascade: RevisionSetPlan | null
}

export interface ProgressInvoiceDocumentSnapshot {
  schemaVersion: 1
  documentState: 'draft' | 'issued'
  seriesId: string
  claimId: string
  claimRevisionId: string
  revisionSetId: string
  revisionNumber: number
  templateVersion: number
  layoutVersion: string
  calculationPolicyVersion: string
  taxInvoiceNumber: string
  suffix: string
  kind: ProgressClaimKind
  issueDate: string
  dueDate: string
  supplier: {
    legalName: string
    tradingName: string
    abn: string
    contractorLicence: string
    address: string
    phone: string
    email: string
    bankName: string
    bankAccountName: string
    bsb: string
    accountNumber: string
    gstRate: GstRateV1
    timezone: 'Australia/Sydney'
  }
  recipient: ProgressInvoiceRecipientSnapshot
  jobber: {
    accountId: string
    invoiceId: string
    originalInvoiceNumber: string
    observedInvoiceNumber: string
  }
  description: string
  notes: string
  reference: string | null
  adjustments: readonly {
    id: string
    type: 'variation' | 'credit'
    effectiveDate: string
    description: string
    amountExGst: DecimalString
    gstRate: GstRateV1
  }[]
  calculation: ProgressClaimCalculation
  financialSnapshotHash: string
  predecessorFinancialManifestHash: string
  aggregateFinancialManifestHash: string
}
~~~

## Target File Map

Domain and application services:

~~~text
lib/progress-invoices/types.ts
lib/progress-invoices/validators.ts
lib/progress-invoices/calculation.ts
lib/progress-invoices/payments.ts
lib/progress-invoices/revisions.ts
lib/progress-invoices/repository.ts
lib/progress-invoices/series-service.ts
lib/progress-invoices/adjustment-service.ts
lib/progress-invoices/claim-service.ts
lib/progress-invoices/payment-service.ts
lib/progress-invoices/revision-set-service.ts
lib/progress-invoices/jobber-refresh-service.ts
lib/progress-invoices/snapshot-builder.ts
lib/progress-invoices/filenames.ts
lib/progress-invoices/feature-flags.ts
~~~

Jobber read gateway:

~~~text
lib/jobber/invoice-contract.ts
lib/jobber/invoice-types.ts
lib/jobber/pagination.ts
lib/jobber/invoice-gateway.ts
lib/jobber/client.ts
lib/jobber/config.ts
lib/jobber/tokens.ts
~~~

Documents:

~~~text
lib/progress-invoices/documents/types.ts
lib/progress-invoices/documents/template-manifest.ts
lib/progress-invoices/documents/template-registration.ts
lib/progress-invoices/documents/ooxml-archive-guard.ts
lib/progress-invoices/documents/ooxml-cell-writer.ts
lib/progress-invoices/documents/xlsx-renderer.ts
lib/progress-invoices/documents/xlsx-validator.ts
lib/progress-invoices/documents/pdf-layout.ts
lib/progress-invoices/documents/pdf-renderer.ts
lib/progress-invoices/documents/pdf-validator.ts
lib/progress-invoices/documents/cross-format-validator.ts
lib/progress-invoices/documents/document-orchestrator.ts
lib/progress-invoices/documents/document-storage.ts
lib/progress-invoices/documents/download-service.ts
~~~

Server Actions:

~~~text
lib/actions/progress-invoice-series.ts
lib/actions/progress-invoice-adjustments.ts
lib/actions/progress-invoice-claims.ts
lib/actions/progress-invoice-payments.ts
lib/actions/progress-invoice-jobber.ts
lib/actions/progress-invoice-documents.ts
~~~

Database:

~~~text
supabase/migrations/20260714230000_add_progress_invoice_core.sql
supabase/migrations/20260714231000_add_progress_invoice_rpc_foundations.sql
supabase/migrations/20260714231100_add_progress_invoice_series_rpcs.sql
supabase/migrations/20260714231200_add_progress_invoice_jobber_rpcs.sql
supabase/migrations/20260714231300_add_progress_invoice_payment_rpcs.sql
supabase/migrations/20260714231400_add_progress_invoice_claim_rpcs.sql
supabase/migrations/20260714231500_add_progress_invoice_document_rpcs.sql
supabase/migrations/20260714232000_add_progress_invoice_storage.sql
supabase/tests/progress_invoices_test.sql
lib/supabase/types.ts
~~~

Template build inputs:

~~~text
assets/progress-invoices/templates/pbc-progress-invoice-v1.normalized.xlsx
assets/progress-invoices/templates/pbc-progress-invoice-v1.manifest.json
assets/progress-invoices/fonts/Carlito-Regular.ttf
assets/progress-invoices/fonts/Carlito-Bold.ttf
assets/progress-invoices/fonts/OFL.txt
scripts/normalize-progress-invoice-template.mjs
scripts/render-progress-invoice-pdf.mjs
~~~

Routes and UI:

~~~text
app/(app)/progress-invoices/page.tsx
app/(app)/progress-invoices/loading.tsx
app/(app)/progress-invoices/new/page.tsx
app/(app)/progress-invoices/[seriesId]/page.tsx
app/(app)/progress-invoices/[seriesId]/loading.tsx
app/(app)/progress-invoices/[seriesId]/claims/[claimId]/page.tsx
app/(app)/settings/invoice/page.tsx
app/(app)/settings/invoice/loading.tsx
app/api/jobber/progress-invoices/jobs/[jobId]/invoices/route.ts
app/api/jobber/progress-invoices/jobs/search/route.ts
app/api/jobber/progress-invoices/invoices/[invoiceId]/route.ts
app/api/progress-invoices/documents/[documentId]/route.ts
components/progress-invoices/progress-invoice-dashboard.tsx
components/progress-invoices/series-create-form.tsx
components/progress-invoices/jobber-invoice-selector.tsx
components/progress-invoices/series-detail.tsx
components/progress-invoices/adjustment-register.tsx
components/progress-invoices/claim-timeline.tsx
components/progress-invoices/claim-editor.tsx
components/progress-invoices/payment-ledger.tsx
components/progress-invoices/document-download-menu.tsx
components/progress-invoices/history-panel.tsx
components/progress-invoices/tax-invoice-preview.tsx
components/progress-invoices/invoice-profile-form.tsx
components/progress-invoices/template-registration-panel.tsx
next.config.ts
~~~

The direct Jobber invoice search route is intentionally absent. Add app/api/jobber/progress-invoices/invoices/search/route.ts only if G1 proves that the effective pinned schema supports it; otherwise the approved job-first flow is the complete implementation.

---

### Task 0: Freeze the approved baseline and open the implementation worktree

**Files:**
- Verify: AGENTS.md
- Verify: PROGRESS.md
- Verify: docs/DECISIONS.md
- Verify: docs/AGENT-MAP.md
- Verify: docs/BACKLOG.md
- Verify: docs/superpowers/specs/2026-07-14-progress-invoices-design.md
- Verify: docs/superpowers/plans/2026-07-14-progress-invoices.md

**Interfaces:**
- Consumes: approved design commit and clean repository state
- Produces: codex/progress-invoice-series worktree with no unrelated edits

- [ ] **Step 1: Re-read the required project documents**

Read the files above in AGENTS.md order. Confirm that the design status is Approved and that this plan is the only implementation authority.

- [ ] **Step 2: Verify the model configuration**

Run:

~~~powershell
Get-Content -Raw C:\Users\kjm12\.codex\agents\default.toml
Get-Content -Raw C:\Users\kjm12\.codex\agents\worker.toml
Get-Content -Raw C:\Users\kjm12\.codex\agents\explorer.toml
~~~

Expected: each applicable agent override contains gpt-5.6-sol and high reasoning. Stop before spawning a worker if it does not.

- [ ] **Step 3: Verify the baseline**

Run:

~~~powershell
git status --short --branch
git log -1 --oneline
git diff --check
~~~

Expected: the approved design and plan are committed, no unrelated worktree changes exist, and main is not rewritten.

- [ ] **Step 4: Create the isolated worktree**

Use superpowers:using-git-worktrees and create branch codex/progress-invoice-series. Confirm that package-lock.json and the supplied private XLSX/PDF are untouched.

- [ ] **Step 5: Commit only if baseline metadata needed correction**

Use commit message:

~~~text
docs: record progress invoice implementation baseline
~~~

### Task 1: Confirm the pinned Jobber invoice/payment read contract

**Files:**
- Create: docs/jobber/2025-04-16-invoice-read-contract.md
- Create: tests/fixtures/jobber-invoice-contract.ts
- Create: lib/jobber/invoice-contract.ts
- Create: tests/jobber-invoice-contract.test.ts
- Modify: lib/jobber/config.ts
- Modify: lib/jobber/tokens.ts
- Modify: tests/jobber-tokens.test.ts

**Interfaces:**
- Produces: getJobberInvoiceReadContract(effectiveGraphqlVersion)
- Produces: assertJobberRequiredReadScopes(scope, requiredScopes)
- Preserves: getJobberConfig().graphqlVersion and all existing quote behavior

- [ ] **Step 1: Capture G1 read-only evidence**

Resolve effectiveVersion = getJobberConfig().graphqlVersion in the same environment used for runtime. This plan's exact contract path is for 2025-04-16; if effectiveVersion differs, stop before code, create a reviewed plan/contract path for that exact version, and do not reuse the 2025-04-16 fixture.

Using the connected Jobber app's GraphiQL with effectiveVersion, inspect and execute read-only operations for:

1. account identity;
2. Job -> invoices connection and pageInfo;
3. invoice identity, number, status, URI, amounts, dates, client, jobs, and properties;
4. invoice -> payments connection and pageInfo; and
5. payment identity, amount, received date, method, reference, status, refund/reversal representation, and updated time.

Record exact query documents, variables, response shapes, nullable fields, enum fallbacks, direct-search availability, required OAuth scope string, and the signed effective receipt rule in docs/jobber/2025-04-16-invoice-read-contract.md. Do not copy real names, addresses, amounts, IDs, tokens, or headers.

Expected: every field required by NormalizedJobberInvoiceObservation has confirmed provenance. If scope or payment semantics are missing, stop and request the corresponding approval; do not write fallback schema guesses.

- [ ] **Step 2: Create sanitized contract fixtures**

Create tests/fixtures/jobber-invoice-contract.ts with invented IDs and amounts but the exact confirmed field nesting, connection shape, nullable cases, enum strings, required scopes, and effective version.

- [ ] **Step 3: Write the failing contract tests**

Assert:

- the fixture's captured effectiveVersion returns the recorded contract;
- every unregistered version fails before network access;
- token scope parsing accepts the exact required scopes;
- a missing scope returns a safe missing-scope error;
- the contract's direct-search flag matches GraphiQL evidence.
- an expired token missing a required scope fails before refreshAccessToken;
- a refresh response that omits scope preserves the previously stored scope;
- a changed refresh scope that fails either generic read-only or invoice-required checks is not saved.

- [ ] **Step 4: Run the contract tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/jobber-invoice-contract.test.ts tests/jobber-tokens.test.ts
~~~

Expected: FAIL because invoice-contract.ts does not exist and StoredJobberToken currently drops scope from returned objects.

- [ ] **Step 5: Implement the contract and retain token scope**

Add the immutable contract object and scope assertion. Extend getUsableSharedJobberConnectionToken(config, options?: { requiredScopes?: readonly string[] }) so invoice callers can require scopes and stored scopes are checked before any refresh; existing Quote callers remain valid without the optional argument. In both getSharedJobberConnectionToken() and refreshSharedJobberConnectionToken(), include scope in the returned StoredJobberToken. On refresh, use effectiveScope = token.scope ?? storedScope, run both generic read-only and requested-scope assertions, and only then persist/return it. Keep the current Quote scope policy unchanged.

- [ ] **Step 6: Run the tests and confirm GREEN**

Run the command from Step 4.

Expected: all selected tests pass; no Jobber request is made for version or scope failure.

- [ ] **Step 7: Commit**

~~~powershell
git add docs/jobber/2025-04-16-invoice-read-contract.md tests/fixtures/jobber-invoice-contract.ts lib/jobber/invoice-contract.ts tests/jobber-invoice-contract.test.ts lib/jobber/config.ts lib/jobber/tokens.ts tests/jobber-tokens.test.ts
git commit -m "feat: lock Jobber invoice read contract"
~~~

### Task 2: Add exact financial calculations and validation

**Files:**
- Create: lib/progress-invoices/types.ts
- Create: lib/progress-invoices/calculation.ts
- Create: lib/progress-invoices/validators.ts
- Create: tests/fixtures/progress-invoices/sample-series.json
- Create: tests/progress-invoice-calculation.test.ts
- Create: tests/progress-invoice-validators.test.ts
- Modify: vitest.config.ts

**Interfaces:**
- Produces: calculateAdjustedContract(input)
- Produces: calculateProgressClaim(input)
- Produces: all Progress Invoice Zod command schemas
- Consumes: Decimal.js only for financial arithmetic

- [ ] **Step 1: Add the sanitized sample regression fixture**

Use invented supplier/customer/site identities and preserve only these approved financial values:

~~~text
P01 current Inc GST: 18942.55
P02 base contract Ex GST: 17220.50
P02 approved Variation Ex GST: 21712.54
P02 adjusted Ex GST: 38933.04
P02 adjusted Inc GST: 42826.34
P02 cumulative target at 90%: 38543.71
P02 current Inc GST: 19601.16
P02 remaining Inc GST: 4282.63
FINAL adjusted Ex GST: 39507.08
FINAL adjusted Inc GST: 43457.79
FINAL current Ex GST: 4467.34
FINAL current GST: 446.74
FINAL current Inc GST: 4914.08
~~~

- [ ] **Step 2: Write failing percentage and amount tests**

Cover cumulative-percentage authority, current-amount authority, switching mode without changing the money, Variation/Credit signs, zero/100 boundaries, over-claim rejection, non-positive contract rejection, and GST 0.10 enforcement.

- [ ] **Step 3: Write failing FINAL and cent-boundary tests**

Assert that normal claims split current Inc GST by Ex = round(Inc / 1.10), GST = Inc - Ex, while FINAL uses Ex and GST residuals independently. Cover one-cent Variation and Credit cases and require all output amounts to have two decimals.

- [ ] **Step 4: Write failing validator tests**

Assert that money and percentage inputs are decimal strings, not numbers; dates use YYYY-MM-DD; due date is not before issue; IDs and idempotency keys are UUIDs; post-issue edit/void/reconciliation reasons are non-empty; and every field uses PROGRESS_INVOICE_TEXT_LIMITS.

- [ ] **Step 5: Run focused tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-calculation.test.ts tests/progress-invoice-validators.test.ts
~~~

Expected: FAIL because the domain modules do not exist.

- [ ] **Step 6: Implement the minimal calculation engine**

Use Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP }). Quantize currency only at the rules in the approved design. Preserve a derived cumulative percentage at six decimal places and never feed it back into amount-authoritative calculations.

- [ ] **Step 7: Implement command schemas**

Create schemas for profile, series, Jobber link/refresh/number acceptance, adjustment lifecycle, claim draft/save/issue/revise/void, manual payment lifecycle, match/undo, and document request. Reuse one strict decimal-string refinement, import PROGRESS_INVOICE_TEXT_LIMITS, and reject unknown keys.

- [ ] **Step 8: Set critical coverage thresholds**

Add a 100% statement/line/function threshold for calculation.ts. Task 8 adds payments.ts and Task 9 adds revisions.ts to the same threshold map when each tested module is created.

- [ ] **Step 9: Run focused tests and confirm GREEN**

Run the command from Step 5.

Expected: all selected tests pass with exact decimal-string assertions.

- [ ] **Step 10: Commit**

~~~powershell
git add lib/progress-invoices/types.ts lib/progress-invoices/calculation.ts lib/progress-invoices/validators.ts tests/fixtures/progress-invoices/sample-series.json tests/progress-invoice-calculation.test.ts tests/progress-invoice-validators.test.ts vitest.config.ts
git commit -m "feat: calculate progress claims exactly"
~~~

### Task 3: Create the core schema, constraints, RLS, and generated types

**Files:**
- Create: supabase/migrations/20260714230000_add_progress_invoice_core.sql
- Create: tests/progress-invoice-migration.test.ts
- Modify: tests/rls.test.ts
- Modify: tests/rls-local-integration.test.ts
- Modify: lib/supabase/types.ts

**Interfaces:**
- Produces: the eleven approved domain tables plus business_invoice_profiles
- Produces: authenticated SELECT-only RLS and immutable-row guards
- Consumes: UUID, numeric text, auth.uid(), and existing quote foreign keys

- [ ] **Step 1: Write failing migration structure tests**

Assert exact table names:

~~~text
business_invoice_profiles
progress_invoice_templates
progress_invoice_series
progress_jobber_invoice_snapshots
progress_adjustments
progress_claims
progress_claim_revisions
progress_invoice_revision_sets
progress_payments
progress_payment_revisions
progress_documents
progress_invoice_events
~~~

Assert RLS is enabled on all tables, authenticated has SELECT only, and no anon/public access or direct authenticated INSERT/UPDATE/DELETE policy exists.

- [ ] **Step 2: Write failing constraint tests**

Statically assert:

- UUID primary/foreign keys;
- numeric(14,2) money, numeric(9,6) percentages, and numeric(5,4) GST;
- GST CHECK equals 0.10;
- globally unique tax_invoice_number;
- exactly one business_invoice_profiles row, including concurrent first-save attempts;
- at most one progress_invoice_templates row with status = active;
- unique series claim sequence and suffix;
- partial unique non-void Jobber account/invoice pair;
- partial unique Jobber payment identity by series;
- partial unique matched_manual_payment_id when non-null;
- matched_manual_payment_id is allowed only on a Jobber-source row and must reference a Manual row in the same series;
- one current revision set per series;
- one non-void FINAL per series;
- positive versions/revision numbers;
- current-pointer same-parent constraints enforced by RPCs/triggers;
- immutable update/delete guards for observations, issued/superseded revisions, payment revisions, ready documents, and audit events.
- partial unique (series_id, command_name, correlation_key) for idempotent commands, plus non-null request_fingerprint and bounded result_refs.

- [ ] **Step 3: Run migration tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-migration.test.ts tests/rls.test.ts
~~~

Expected: FAIL because the migration and table policies do not exist.

- [ ] **Step 4: Implement the table schema**

Use the approved design's columns. Store supplier, recipient, Jobber normalization, adjustment, and document payloads as versioned typed columns plus JSONB only for bounded immutable snapshots/manifests. Template rows include immutable source and normalized SHA-256 values, manifest/layout/font versions, server-generated opaque source-evidence and normalized-master paths, Pending/Active/Failed status, and the authenticated registering actor. Add created_at/updated_at where mutable, creator IDs, optimistic version, and safe enum CHECK constraints. Enforce a singleton business profile with a unique constant-expression index, one active template with a partial unique index, and one-to-one Manual matching with a partial unique index plus a same-series/source-direction trigger.

For idempotent series commands, progress_invoice_events stores command_name, correlation_key, SHA-256 request_fingerprint, and safe result_refs. The unique series/command/key index makes an exact same-payload retry return the recorded refs and rejects the same key with a different fingerprint as IDEMPOTENCY_KEY_REUSED. Never store the financial request payload in the event.

The series status values are draft, active, completed, reconciliation_required, and void. Claim status values are draft, issued, and void. Revision-set states are draft, generating, ready, current, superseded, and failed. Payment revision states are active, superseded, unconfirmed, and void.

- [ ] **Step 5: Implement grants, RLS, and immutability**

Grant authenticated SELECT. Revoke table writes from anon, authenticated, and public. Add trigger functions that reject UPDATE/DELETE on immutable rows and every UPDATE/DELETE on progress_invoice_events.

- [ ] **Step 6: Run migration tests and confirm GREEN**

Run the command from Step 3.

Expected: all static migration and RLS tests pass.

- [ ] **Step 7: Reset and lint the local database**

Run only against local Supabase:

~~~powershell
npx.cmd supabase start
npx.cmd supabase db reset --local
npx.cmd supabase db lint --local --schema public,storage --level warning --fail-on error
~~~

Expected: migrations apply from zero and lint reports no errors.

- [ ] **Step 8: Generate database types**

Run:

~~~powershell
npx.cmd supabase gen types --local --lang typescript --schema public | Out-File -LiteralPath lib/supabase/types.ts -Encoding utf8
npm.cmd run typecheck
~~~

Expected: generated types include every new table and TypeScript passes. Ensure RPCs later return numeric::text at the boundary even if generated numeric columns are typed as number.

- [ ] **Step 9: Commit**

~~~powershell
git add supabase/migrations/20260714230000_add_progress_invoice_core.sql tests/progress-invoice-migration.test.ts tests/rls.test.ts tests/rls-local-integration.test.ts lib/supabase/types.ts
git commit -m "feat: add progress invoice data model"
~~~

### Task 4: Add secure transactional RPC foundations

**Files:**
- Create: supabase/migrations/20260714231000_add_progress_invoice_rpc_foundations.sql
- Create: supabase/tests/progress_invoices_test.sql
- Create: lib/progress-invoices/repository.ts
- Modify: lib/actions/types.ts
- Modify: lib/supabase/types.ts
- Modify: tests/actions-types.test.ts
- Modify: tests/progress-invoice-migration.test.ts

**Interfaces:**
- Produces: ProgressInvoiceRepository.call(command, payload)
- Produces: backward-compatible ActionResult<T, TCurrent>
- Produces: SECURITY DEFINER payload JSONB RPCs

- [ ] **Step 1: Write failing Result compatibility tests**

Assert existing success/error values remain assignable and new conflict errors may include code: VERSION_CONFLICT and current data. Run tests/actions-types.test.ts and confirm RED.

- [ ] **Step 2: Write failing RPC security tests**

Build a reusable static/pgTAP assertion and apply it first to save_business_invoice_profile:

- accepts one payload JSONB argument;
- is SECURITY DEFINER;
- sets search_path to an empty/fixed safe value;
- rejects null auth.uid();
- never accepts actor_id;
- checks expected_version when mutating an existing aggregate;
- revokes EXECUTE from PUBLIC and anon;
- grants EXECUTE only to authenticated.

The series commands named by the approved idempotency policy additionally require correlation_key and request_fingerprint, replay only an identical payload, and reject key reuse with a different fingerprint.

Document finalizers activate_progress_invoice_template, record_progress_document_ready, publish_progress_revision_set, and fail_progress_revision_set are a separate service-only class: revoke them from PUBLIC, anon, and authenticated; grant only service_role; require a DB-created pending registration/revision-set/document correlation; and read actor identity from that pending row created by an authenticated auth.uid() command. They never accept actor_id or an arbitrary storage path.

- [ ] **Step 3: Record the exact target RPC list**

The finished module exposes exactly these names, added only by the owning tasks below:

~~~text
save_business_invoice_profile
register_progress_invoice_template
activate_progress_invoice_template
create_progress_invoice_series
update_progress_invoice_series
link_progress_jobber_invoice
accept_progress_invoice_number
apply_progress_invoice_jobber_refresh
record_progress_jobber_refresh_failure
create_progress_adjustment
update_progress_adjustment_draft
approve_progress_adjustment
supersede_progress_adjustment
create_progress_claim_draft
save_progress_claim_draft
prepare_progress_revision_set
record_progress_document_ready
publish_progress_revision_set
fail_progress_revision_set
create_manual_progress_payment
replace_manual_progress_payment
void_manual_progress_payment
reconcile_progress_payment
undo_progress_payment_reconciliation
~~~

- [ ] **Step 4: Implement Result and repository adapters**

Update ActionResult as specified above. Implement a repository wrapper over the authenticated Supabase client that maps database conflict/error codes to safe ActionResult codes and never logs payloads.

- [ ] **Step 5: Implement RPC common guards and the profile command**

Add shared SQL helpers for authenticated actor, expected version, idempotency lookup/result replay, safe event append, and immutable current-pointer validation. Implement save_business_invoice_profile completely. Do not create unimplemented RPC shells; Tasks 5, 7, 8, 9, and 15 each add their named commands with the same security assertions.

- [ ] **Step 6: Run static tests and confirm GREEN**

Run:

~~~powershell
npm.cmd run test:run -- tests/actions-types.test.ts tests/progress-invoice-migration.test.ts
~~~

Expected: selected tests pass.

- [ ] **Step 7: Add pgTAP transaction tests**

Cover unauthenticated denial, direct-write denial, authenticated profile save, concurrent first-save singleton enforcement, profile version conflict, and rollback on a failed profile command. Tasks 7-9 and 15 test exact-payload idempotent replay plus different-payload key rejection for their commands; Task 9 also tests Claim numbers, link locks, immutable revisions, and audit append behavior.

- [ ] **Step 8: Run local database tests**

Run:

~~~powershell
npx.cmd supabase db reset --local
npx.cmd supabase test db --local supabase/tests/progress_invoices_test.sql
npx.cmd supabase gen types --local --lang typescript --schema public | Out-File -LiteralPath lib/supabase/types.ts -Encoding utf8
npm.cmd run typecheck
~~~

Expected: pgTAP passes, the implemented profile RPC appears in generated types, and typecheck passes. Tasks 5, 7, 8, 9, and 15 regenerate the file after adding their RPC groups.

- [ ] **Step 9: Commit**

~~~powershell
git add supabase/migrations/20260714231000_add_progress_invoice_rpc_foundations.sql supabase/tests/progress_invoices_test.sql lib/progress-invoices/repository.ts lib/actions/types.ts lib/supabase/types.ts tests/actions-types.test.ts tests/progress-invoice-migration.test.ts
git commit -m "feat: add progress invoice transaction boundary"
~~~

### Task 5: Implement profiles, series, and adjustment lifecycle

**Files:**
- Create: lib/progress-invoices/series-service.ts
- Create: lib/progress-invoices/adjustment-service.ts
- Create: lib/actions/progress-invoice-series.ts
- Create: lib/actions/progress-invoice-adjustments.ts
- Create: tests/progress-invoice-actions.test.ts
- Create: tests/progress-invoice-actions-supabase.test.ts
- Create: supabase/migrations/20260714231100_add_progress_invoice_series_rpcs.sql
- Modify: lib/progress-invoices/repository.ts
- Modify: lib/supabase/types.ts

**Interfaces:**
- Produces: getBusinessInvoiceProfile()
- Produces: saveBusinessInvoiceProfile(input: unknown)
- Produces: createProgressInvoiceSeries(input: unknown)
- Produces: updateProgressInvoiceSeries(input: unknown)
- Produces: create/update/approve/supersede adjustment actions
- Consumes: authenticated RPC client and purpose-specific DTOs

- [ ] **Step 1: Write failing profile and series action tests**

Assert Zod-before-auth behavior, requireAllowedUser(), authenticated RPC use, safe error mapping, path revalidation, and these outcomes:

~~~ts
createProgressInvoiceSeries(
  input: unknown
): Promise<ActionResult<{ id: string; version: number }>>

updateProgressInvoiceSeries(
  input: unknown
): Promise<ActionResult<VersionedMutationResult, ProgressInvoiceSeriesDetail>>
~~~

Cover PBC-quote creation and standalone creation. For a quote, offer quote.subtotal as base Ex GST and quote.final_total as a read-only Inc GST comparison; snapshot the accepted values so later Quote edits cannot change the series.

- [ ] **Step 2: Write failing recipient and link-lock tests**

Assert recipient/site/company/ABN/contact fields are explicit editable series snapshots, Jobber candidates are never persisted as raw responses, and the account/invoice/accepted-number fields cannot change after the first claim number is reserved.

- [ ] **Step 3: Write failing adjustment tests**

Cover:

- Draft Variation and Credit use positive Ex GST amounts;
- type determines sign;
- Approved rows are immutable;
- rejected/void rows do not affect totals;
- correction creates a linked reversing or replacement row and marks the original Superseded;
- reason is mandatory;
- a Credit below already issued claims returns RECONCILIATION_REQUIRED;
- stale expectedVersion returns current DTO.

- [ ] **Step 4: Run focused tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts
~~~

Expected: FAIL because the services and actions do not exist.

- [ ] **Step 5: Implement the profile and series services**

Keep reads purpose-specific:

~~~ts
listProgressInvoiceSeries(
  input: ProgressInvoiceListInput
): Promise<ActionResult<ProgressInvoiceDashboardDto>>

getProgressInvoiceSeries(
  seriesId: string
): Promise<ActionResult<ProgressInvoiceSeriesDetail | null>>

getProgressInvoiceCreatePrefill(
  input: { quoteId: string } | { standalone: true }
): Promise<ActionResult<ProgressInvoiceCreatePrefill>>
~~~

Do not return raw rows. Dashboard/search DTOs expose claimed and received separately, current progress, overdue position, safe Jobber freshness, and no bank details.

- [ ] **Step 6: Implement adjustment services and RPC bodies**

In 20260714231100_add_progress_invoice_series_rpcs.sql, implement create/update series and create/update/approve/supersede adjustment RPCs. Recalculate the series read model in the same transaction from Approved adjustments and the Current revision set.

- [ ] **Step 7: Implement thin Server Actions**

Actions validate, authorize, call the service, map safe errors, and revalidate /progress-invoices, the series path, /quotes/[id] where linked, and /settings/invoice only when relevant. Do not duplicate arithmetic in actions.

- [ ] **Step 8: Run focused tests and confirm GREEN**

Run the command from Step 4.

Expected: all selected tests pass, including version conflicts and immutable Approved adjustments.

- [ ] **Step 9: Run local transaction tests**

Add pgTAP cases for series uniqueness, quote snapshot independence, adjustment supersession, read-model update, and over-claimed Credit rollback.

Run:

~~~powershell
npx.cmd supabase db reset --local
npx.cmd supabase test db --local supabase/tests/progress_invoices_test.sql
npx.cmd supabase gen types --local --lang typescript --schema public | Out-File -LiteralPath lib/supabase/types.ts -Encoding utf8
npm.cmd run typecheck
~~~

Expected: migrations apply from zero, all database tests pass, generated types contain the series/adjustment RPCs, and typecheck passes.

- [ ] **Step 10: Commit**

~~~powershell
git add lib/progress-invoices/series-service.ts lib/progress-invoices/adjustment-service.ts lib/actions/progress-invoice-series.ts lib/actions/progress-invoice-adjustments.ts lib/progress-invoices/repository.ts lib/supabase/types.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts supabase/migrations/20260714231100_add_progress_invoice_series_rpcs.sql supabase/tests/progress_invoices_test.sql
git commit -m "feat: manage progress invoice series and adjustments"
~~~

### Task 6: Implement complete Jobber pagination and invoice normalization

**Files:**
- Create: lib/jobber/invoice-types.ts
- Create: lib/jobber/pagination.ts
- Create: lib/jobber/invoice-gateway.ts
- Create: tests/jobber-pagination.test.ts
- Create: tests/jobber-invoice-client.test.ts
- Create: tests/jobber-invoice-gateway.test.ts
- Create: tests/fixtures/progress-invoices/jobber-job-invoices-page-1.json
- Create: tests/fixtures/progress-invoices/jobber-job-invoices-page-2.json
- Create: tests/fixtures/progress-invoices/jobber-invoice-payments-page-1.json
- Create: tests/fixtures/progress-invoices/jobber-invoice-payments-page-2.json
- Modify: lib/jobber/client.ts
- Modify: tests/jobber-readonly-regression.test.ts
- Modify: tests/jobber-write-client.test.ts

**Interfaces:**
- Produces: fetchAllJobberPages(fetchPage, options)
- Produces: listJobberInvoicesForJob(input)
- Produces: fetchJobberInvoiceObservation(input)
- Preserves: centralized transport, version header, throttle retry, and Quote mutation allowlist

- [ ] **Step 1: Write failing pagination tests**

Cover two and three pages, empty connection, cursor loop, hasNextPage with null endCursor, duplicate node IDs, and maxPages overflow. Any incomplete traversal must reject and return no partial nodes.

- [ ] **Step 2: Write failing client query tests**

Using only G1-confirmed documents and fixtures, assert exact variables, first/after values, pinned version header, nullable parsing, unknown enum preservation, amount normalization to decimal strings, nullable method/reference parsing, and no raw response escape.

- [ ] **Step 3: Write failing gateway tests**

Cover:

- shared token acquisition and exact scope check before network;
- account identity plus all job-invoice pages;
- complete invoice and all payment pages;
- explicit multiple-job/property selection;
- direct-search disabled behavior when contract says false;
- unknown invoice status;
- applied/refund/reversal/excluded/ambiguous payment treatments;
- nullable payment method/reference normalization when the G1 contract exposes them;
- response fingerprint stability;
- 401 token refresh followed by restart of the entire operation;
- 429 retry through the existing transport;
- version/schema mismatch before database access.

- [ ] **Step 4: Run focused tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/jobber-pagination.test.ts tests/jobber-invoice-client.test.ts tests/jobber-invoice-gateway.test.ts
~~~

Expected: FAIL because the invoice modules do not exist.

- [ ] **Step 5: Implement the pure paginator**

~~~ts
export async function fetchAllJobberPages<T>(
  fetchPage: (
    after: string | null
  ) => Promise<JobberConnectionPage<T>>,
  options?: { maxPages?: number }
): Promise<readonly T[]>
~~~

Default maxPages to a bounded value recorded in the contract test. Reject repeated cursors and inconsistent pageInfo.

- [ ] **Step 6: Add narrow query functions to the existing client**

Implement only:

~~~ts
fetchJobberAccountIdentity(options)
fetchJobberJobInvoicesPage(jobberJobId, page, options)
fetchJobberInvoiceDetail(jobberInvoiceId, options)
fetchJobberInvoicePaymentsPage(jobberInvoiceId, page, options)
~~~

Each function uses the existing postJobberGraphql transport and query-only document guard. Do not export a generic raw GraphQL escape hatch and do not touch quote mutation documents.

- [ ] **Step 7: Implement the invoice gateway**

The gateway performs token/version/scope checks before refresh/network access, all-page fetch, explicit selection validation, normalized decimal/date/status/payment mapping, warning creation, and SHA-256 fingerprinting. Invoice.receivedAt remains invoice metadata and is never converted into a payment row. Raw GraphQL stays inside the server-only module.

If G1 records supportsDirectInvoiceSearch=true, add the exact confirmed search query to lib/jobber/client.ts, a fully paginated searchJobberInvoiceCandidates() gateway method, app/api/jobber/progress-invoices/invoices/search/route.ts, and positive contract/gateway/route tests. If false, add a regression assertion that the route and query document are absent and expose only the job-first flow.

- [ ] **Step 8: Run focused tests and confirm GREEN**

Run the command from Step 4.

Expected: all selected tests pass and partial pagination never returns an observation.

- [ ] **Step 9: Run existing Jobber regressions**

Run:

~~~powershell
npm.cmd run test:run -- tests/jobber.test.ts tests/jobber-write-client.test.ts tests/jobber-readonly-regression.test.ts tests/jobber-route-security.test.ts tests/jobber-tokens.test.ts tests/jobber-quote-route-refresh.test.ts tests/jobber-quote-line-payload.test.ts
~~~

Expected: all existing Jobber tests pass and the approved Quote write path is unchanged.

- [ ] **Step 10: Commit**

~~~powershell
git add lib/jobber/invoice-types.ts lib/jobber/pagination.ts lib/jobber/invoice-gateway.ts lib/jobber/client.ts tests/jobber-pagination.test.ts tests/jobber-invoice-client.test.ts tests/jobber-invoice-gateway.test.ts tests/fixtures/progress-invoices tests/jobber-readonly-regression.test.ts tests/jobber-write-client.test.ts
git commit -m "feat: read Jobber invoices and payments"
~~~

### Task 7: Link and atomically refresh the Jobber observation

**Files:**
- Create: lib/progress-invoices/jobber-refresh-service.ts
- Create: lib/actions/progress-invoice-jobber.ts
- Create: app/api/jobber/progress-invoices/jobs/[jobId]/invoices/route.ts
- Create: app/api/jobber/progress-invoices/invoices/[invoiceId]/route.ts
- Create: tests/progress-invoice-jobber-refresh.test.ts
- Create: tests/jobber-progress-invoice-routes.test.ts
- Create: supabase/migrations/20260714231200_add_progress_invoice_jobber_rpcs.sql
- Modify: lib/progress-invoices/repository.ts
- Modify: lib/supabase/types.ts
- Modify: supabase/tests/progress_invoices_test.sql

**Interfaces:**
- Produces: linkJobberInvoice(input: unknown)
- Produces: refreshJobberInvoice(input: unknown)
- Produces: acceptObservedJobberInvoiceNumber(input: unknown)
- Produces: apply_progress_invoice_jobber_refresh(payload jsonb)
- Produces: record_progress_jobber_refresh_failure(payload jsonb)

- [ ] **Step 1: Write failing route security tests**

Assert both routes:

- require an allowed authenticated user;
- validate UUID/global ID path values;
- return selector-safe DTOs only;
- never return payment ledgers, access tokens, raw GraphQL, or complete customer snapshots;
- use no-store;
- map authorization, scope, not found, rate limit, and temporary errors safely.

- [ ] **Step 2: Write failing link tests**

Assert link fetches the complete observation again on the server, checks account/invoice uniqueness, requires explicit job/property/address choices, pre-fills editable recipient/site snapshots, and stores original/latest/accepted invoice numbers separately. The link transaction must also persist the first immutable observation and all initial Jobber Payment identities/revisions. Inject failure after each write point and assert the entire link, number, snapshot, payments, sync metadata, and audit event roll back. Before a Claim exists, relink and accepted-base change are audited; afterward both fail.

- [ ] **Step 3: Write failing refresh atomicity tests**

Cover inserted, changed, disappeared, refunded, and reversed Jobber payments; unchanged fingerprint idempotency; same correlation key plus same request fingerprint replay; same key plus different fingerprint rejection; manual-payment preservation; recipient/number diff suggestions; and safe sync timestamps/errors.

For cursor, schema, 401-refresh failure, or any payment-page error, assert apply_progress_invoice_jobber_refresh is never called and the prior snapshot/ledger/last-success time stays current. The service calls record_progress_jobber_refresh_failure once to update only last attempt, a bounded safe error code, and a safe audit event; no partial observation/payment fields enter that payload.

- [ ] **Step 4: Run focused tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/jobber-progress-invoice-routes.test.ts tests/progress-invoice-jobber-refresh.test.ts
~~~

Expected: FAIL because the routes, action, and service do not exist.

- [ ] **Step 5: Implement selector routes**

The job route returns all invoice candidates for one job. The invoice route returns an observation preview with explicit address/job/property candidates but omits the payment ledger. Never auto-select the first job/property when more than one exists.

- [ ] **Step 6: Implement the refresh service and actions**

Use these signatures:

~~~ts
linkJobberInvoice(
  input: unknown
): Promise<ActionResult<{ seriesId: string; version: number }>>

refreshJobberInvoice(
  input: unknown
): Promise<ActionResult<{
  seriesId: string
  snapshotId: string
  seriesVersion: number
  insertedPayments: number
  revisedPayments: number
  unconfirmedPayments: number
}>>

acceptObservedJobberInvoiceNumber(
  input: unknown
): Promise<ActionResult<VersionedMutationResult, ProgressInvoiceSeriesDetail>>
~~~

Client input may identify the selected invoice/job/property and the immutable observation to accept, but never supplies an accepted numbering string, authoritative account, payment, amount, status, or client values. Use:

~~~ts
interface AcceptProgressInvoiceNumberInput {
  seriesId: string
  expectedVersion: number
  observationId: string
  numberSource: 'original' | 'latest'
  idempotencyKey: string
}
~~~

The RPC locks and reads that series-owned observation, rejects a stale/foreign observation, selects its original/latest observed number, and stores the accepted base. Tests reject a forged base string and any change after the first Claim.

- [ ] **Step 7: Implement the all-or-nothing refresh RPC**

For an initial link, link_progress_jobber_invoice performs account/invoice uniqueness, series link, original/latest/accepted number selection, first immutable observation, initial Jobber payment identities/revisions including confirmed nullable method/reference, sync metadata, editable recipient/site snapshot, and audit in one transaction.

For a later refresh, apply_progress_invoice_jobber_refresh inserts the immutable normalized observation, advances the series current snapshot, upserts stable Jobber payment identities, appends only changed payment revisions including method/reference changes, appends Unconfirmed revisions for disappeared payments, preserves manual rows, updates sync metadata, and writes one safe audit event.

record_progress_jobber_refresh_failure updates last_jobber_sync_attempt_at and safe last_jobber_sync_error_code while preserving current snapshot, payments, editable snapshots, and last successful sync. Implement the three link/refresh/accept RPCs plus this failure RPC in 20260714231200_add_progress_invoice_jobber_rpcs.sql; never edit an already committed migration from Tasks 3-5.

- [ ] **Step 8: Run focused tests and confirm GREEN**

Run the command from Step 4.

Expected: all selected tests pass; partial network results cause zero database mutation.

- [ ] **Step 9: Run local and existing Jobber regressions**

Run:

~~~powershell
npx.cmd supabase db reset --local
npx.cmd supabase test db --local supabase/tests/progress_invoices_test.sql
npx.cmd supabase gen types --local --lang typescript --schema public | Out-File -LiteralPath lib/supabase/types.ts -Encoding utf8
npm.cmd run typecheck
npm.cmd run test:run -- tests/jobber-readonly-regression.test.ts tests/jobber-write-client.test.ts tests/jobber-route-security.test.ts tests/jobber-tokens.test.ts
~~~

Expected: all pass.

- [ ] **Step 10: Commit**

~~~powershell
git add lib/progress-invoices/jobber-refresh-service.ts lib/actions/progress-invoice-jobber.ts app/api/jobber/progress-invoices tests/progress-invoice-jobber-refresh.test.ts tests/jobber-progress-invoice-routes.test.ts lib/progress-invoices/repository.ts lib/supabase/types.ts supabase/migrations/20260714231200_add_progress_invoice_jobber_rpcs.sql supabase/tests/progress_invoices_test.sql
git commit -m "feat: link and refresh Jobber invoice observations"
~~~

### Task 8: Implement payments, partial receipts, and reconciliation

**Files:**
- Create: lib/progress-invoices/payments.ts
- Create: lib/progress-invoices/payment-service.ts
- Create: lib/actions/progress-invoice-payments.ts
- Create: tests/progress-invoice-payments.test.ts
- Create: supabase/migrations/20260714231300_add_progress_invoice_payment_rpcs.sql
- Modify: tests/progress-invoice-actions.test.ts
- Modify: tests/progress-invoice-actions-supabase.test.ts
- Modify: vitest.config.ts
- Modify: lib/supabase/types.ts
- Modify: supabase/tests/progress_invoices_test.sql

**Interfaces:**
- Produces: calculatePaymentSummary(input)
- Produces: allocateReceiptsFifo(claims, totalReceipts)
- Produces: manual payment create/replace/void and match/undo actions
- Preserves: payment source and immutable revision history

- [ ] **Step 1: Write failing pure payment tests**

Cover zero, partial, exact, and overpayment; Jobber applied/refund/reversal signed effects; ambiguous/unconfirmed exclusion; manual Active inclusion; credit balance; Australia/Sydney as-of date; two-claim FIFO ageing; and overdue only when an unpaid FIFO remainder exists after due date.

- [ ] **Step 2: Write failing payment action tests**

Assert:

- only Manual rows can be created, edited, or voided;
- editing appends a revision and advances the pointer;
- Jobber rows are read-only;
- matching is Jobber -> Manual, same series, one-to-one, current Active revisions;
- matching keeps Jobber Active and supersedes only Manual;
- undo appends a restored Manual revision;
- amount/date similarity only suggests and never auto-matches;
- reason and expected versions are mandatory;
- a reconciliation retry with the same key/payload returns the first result, while the same key with a changed payload returns IDEMPOTENCY_KEY_REUSED.

- [ ] **Step 3: Run tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-payments.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts
~~~

Expected: FAIL because payments.ts and payment actions do not exist.

- [ ] **Step 4: Implement pure summaries**

Accept asOfDate explicitly as YYYY-MM-DD; do not read the system clock inside the pure module. Sum only current eligible signed revisions. Return unpaid, part_paid, paid, overdue, or credit_balance plus claimed, receipts, outstanding, credit, and per-claim derived FIFO presentation.

- [ ] **Step 5: Implement payment RPCs and services**

In 20260714231300_add_progress_invoice_payment_rpcs.sql, implement create_manual_progress_payment, replace_manual_progress_payment, void_manual_progress_payment, reconcile_progress_payment, and undo_progress_payment_reconciliation with expected-version and idempotency checks. Recompute cached receivable state transactionally; never edit an earlier committed migration.

- [ ] **Step 6: Implement Server Actions**

~~~ts
createManualProgressPayment(input: unknown): Promise<ActionResult<PaymentMutationResult>>
replaceManualProgressPayment(
  input: unknown
): Promise<ActionResult<PaymentMutationResult, ProgressPaymentDto>>
voidManualProgressPayment(
  input: unknown
): Promise<ActionResult<PaymentMutationResult, ProgressPaymentDto>>
reconcileManualWithJobberPayment(
  input: unknown
): Promise<ActionResult<PaymentReconciliationResult, ProgressPaymentLedgerDto>>
undoProgressPaymentReconciliation(
  input: unknown
): Promise<ActionResult<PaymentReconciliationResult, ProgressPaymentLedgerDto>>
~~~

- [ ] **Step 7: Add 100% coverage threshold and run GREEN**

Add payments.ts to the 100% critical-module coverage map.

Run the command from Step 3.

Expected: all selected tests pass.

- [ ] **Step 8: Run database tests**

Add pgTAP coverage for stable Jobber identity, manual revision history, match uniqueness, undo, disappeared payment, refund/reversal, and direct-write denial.

Run:

~~~powershell
npx.cmd supabase db reset --local
npx.cmd supabase test db --local supabase/tests/progress_invoices_test.sql
npx.cmd supabase gen types --local --lang typescript --schema public | Out-File -LiteralPath lib/supabase/types.ts -Encoding utf8
npm.cmd run typecheck
~~~

Expected: migrations apply from zero, all database tests pass, generated types contain the payment RPCs, and typecheck passes.

- [ ] **Step 9: Commit**

~~~powershell
git add lib/progress-invoices/payments.ts lib/progress-invoices/payment-service.ts lib/actions/progress-invoice-payments.ts lib/supabase/types.ts tests/progress-invoice-payments.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts vitest.config.ts supabase/migrations/20260714231300_add_progress_invoice_payment_rpcs.sql supabase/tests/progress_invoices_test.sql
git commit -m "feat: track progress invoice receipts"
~~~

### Task 9: Implement Claim drafts, numbering, and coherent revision-set planning

**Files:**
- Create: lib/progress-invoices/revisions.ts
- Create: lib/progress-invoices/claim-service.ts
- Create: lib/progress-invoices/revision-set-service.ts
- Create: lib/actions/progress-invoice-claims.ts
- Create: tests/progress-invoice-revisions.test.ts
- Create: supabase/migrations/20260714231400_add_progress_invoice_claim_rpcs.sql
- Modify: tests/progress-invoice-actions.test.ts
- Modify: tests/progress-invoice-actions-supabase.test.ts
- Modify: vitest.config.ts
- Modify: lib/supabase/types.ts
- Modify: supabase/tests/progress_invoices_test.sql

**Interfaces:**
- Produces: classifyClaimRevision(previous, next)
- Produces: planRevisionSet(input)
- Produces: createProgressClaim and saveProgressClaimDraft actions
- Produces: internal prepareProgressRevisionSet service/RPC for issue, revision, or Void proposals
- Consumes: calculation engine and immutable adjustment/revision snapshots

- [ ] **Step 1: Write failing number-reservation tests**

Assert first draft requires a verified Jobber account/invoice and accepted base, reserves acceptedBase + "-" + P01 transactionally, increments P02/P03 without reuse, reserves acceptedBase + "-" + FINAL once, and never renumbers/reuses a void Tax Invoice number. Run concurrent-create cases through pgTAP. The same idempotency key and request fingerprint replays the reserved Claim; the same key with a changed request fingerprint is rejected.

- [ ] **Step 2: Write failing revision classification tests**

Classify as financial_tax_affecting when number, issue date, supplier/recipient legal identity or ABN, supply description/extent, adjustment snapshot, claim amount/GST/progress/order, or Void state changes. All other display-only changes are clerical. Compare normalized snapshots, not UI field names.

- [ ] **Step 3: Write failing chain/cascade tests**

Cover:

- adding P02 produces a new set with P01 current revision plus P02;
- clerical P01 revision can replace only P01 when financial hash is unchanged;
- financial P01 edit after P02/FINAL creates cascade revisions for all later claims;
- percentage-authoritative later claims preserve percentage;
- amount-authoritative later claims preserve current amount;
- predecessor manifest hashes must match;
- invalid negative/over-contract chain stays draft and sets reconciliation_required;
- old Current set remains current until every artifact and tax gate passes.

- [ ] **Step 4: Write failing FINAL tests**

Assert FINAL pre-fills exact Ex/GST residuals, reaches 100%, leaves zero on all components, cannot be partial, cannot coexist with another non-void FINAL, and prevents later claims. A partial claim must be the next Pxx.

- [ ] **Step 5: Run focused tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-revisions.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts
~~~

Expected: FAIL because revision services and actions do not exist.

- [ ] **Step 6: Implement revision classification and planning**

~~~ts
classifyClaimRevision(
  previous: ClaimFinancialSnapshot,
  next: ClaimFinancialSnapshot
): 'clerical' | 'financial_tax_affecting'

planRevisionSet(input: RevisionSetPlanningInput): RevisionSetPlan
~~~

Create deterministic financial snapshot and predecessor manifest hashes from canonical JSON. Do not include clerical-only fields in the financial hash.

- [ ] **Step 7: Implement Claim draft/save RPCs**

In 20260714231400_add_progress_invoice_claim_rpcs.sql, create_progress_claim_draft reserves sequence/suffix/Tax Invoice number and locks the Jobber pair/base. save_progress_claim_draft appends or replaces only an unissued draft revision using expectedVersion; issued/superseded revisions remain immutable.

- [ ] **Step 8: Implement internal revision-set preparation**

prepare_progress_revision_set creates immutable proposed revisions and a generating set without moving current pointers. Its operation field accepts issue, revise, or void and applies the same cascade/tax-review planning rules. It never directly changes an issued Claim status and is invoked by public actions only after Task 15 adds document orchestration.

- [ ] **Step 9: Implement actions**

~~~ts
createProgressClaim(
  input: unknown
): Promise<ActionResult<ClaimMutationResult, ProgressInvoiceSeriesDetail>>

saveProgressClaimDraft(
  input: unknown
): Promise<ActionResult<ClaimRevisionMutationResult, ProgressClaimEditorDto>>
~~~

Keep prepareProgressRevisionSet internal and tested. Do not expose an action that can prepare or publish a documentless set.

- [ ] **Step 10: Add 100% coverage threshold and run GREEN**

Add revisions.ts to the critical coverage map. Run the command from Step 5.

Expected: all selected pure/service tests pass and no action can publish a documentless set.

- [ ] **Step 11: Run pgTAP**

Add number concurrency, link lock, one FINAL, current-set uniqueness, manifest mismatch, immutable revision, old-current preservation, and cascade rollback cases.

Run:

~~~powershell
npx.cmd supabase db reset --local
npx.cmd supabase test db --local supabase/tests/progress_invoices_test.sql
npx.cmd supabase gen types --local --lang typescript --schema public | Out-File -LiteralPath lib/supabase/types.ts -Encoding utf8
npm.cmd run typecheck
~~~

Expected: migrations apply from zero, all Claim/revision-set pgTAP cases pass, generated types contain the claim RPCs, and typecheck passes.

- [ ] **Step 12: Commit**

~~~powershell
git add lib/progress-invoices/revisions.ts lib/progress-invoices/claim-service.ts lib/progress-invoices/revision-set-service.ts lib/actions/progress-invoice-claims.ts lib/supabase/types.ts tests/progress-invoice-revisions.test.ts tests/progress-invoice-actions.test.ts tests/progress-invoice-actions-supabase.test.ts vitest.config.ts supabase/migrations/20260714231400_add_progress_invoice_claim_rpcs.sql supabase/tests/progress_invoices_test.sql
git commit -m "feat: version progress invoice claims"
~~~

### Task 10: Approve dependencies and normalize the supplied template

**Files:**
- Create: assets/progress-invoices/templates/pbc-progress-invoice-v1.normalized.xlsx
- Create: assets/progress-invoices/templates/pbc-progress-invoice-v1.manifest.json
- Create: assets/progress-invoices/fonts/Carlito-Regular.ttf
- Create: assets/progress-invoices/fonts/Carlito-Bold.ttf
- Create: assets/progress-invoices/fonts/OFL.txt
- Create: scripts/normalize-progress-invoice-template.mjs
- Create: tests/fixtures/progress-invoices/source-fingerprints.json
- Create: tests/fixtures/progress-invoices/pbc-template-v1.manifest.json
- Create: tests/progress-invoice-template-registration.test.ts
- Modify: package.json
- Modify: package-lock.json
- Modify: .gitignore

**Interfaces:**
- Produces: one sanitized canonical OOXML template and immutable manifest
- Produces: normalize command with source hash enforcement
- Consumes: G2 dependency approval and G3 font approval

- [ ] **Step 1: Stop for G2 approval**

Present the five exact runtime packages plus the pinned native canvas dependency, versions, licenses, Node/platform requirements, install/bundle impact, and npm audit result from a clean temporary install analysis. Do not modify package.json or package-lock.json until the user explicitly approves.

- [ ] **Step 2: Install only the approved exact versions**

After approval, run:

~~~powershell
node --version
npm.cmd view pdfjs-dist@5.4.624 engines
npm.cmd install --save-exact fflate@0.8.3 @xmldom/xmldom@0.9.10 pdf-lib@1.17.1 @pdf-lib/fontkit@1.1.1 pdfjs-dist@5.4.624
npm.cmd install --save-dev --save-exact @napi-rs/canvas@0.1.88
npm.cmd audit --audit-level=high
~~~

Expected: package-lock resolves one @napi-rs/canvas version at 0.1.88, package.json declares engines.node >=20.16.0, the active local/Vercel runtimes satisfy it, the native canvas package supports the development/CI platforms, and audit has no high/critical finding. If any check fails, stop and propose a reviewed version/runtime change rather than overriding it.

- [ ] **Step 3: Stop for G3 font approval**

Verify Carlito Regular/Bold originate from the approved upstream distribution, retain OFL.txt, compute SHA-256 for each file, and record the hashes in the manifest. Do not add or distribute the font files until the user approves the license/evidence.

- [ ] **Step 4: Write failing template forensic tests**

Use the approved source fingerprints:

~~~text
XLSX 7A71A163CBCCDBB7977280A410CC6EBFC17398E4649FFF7B6FB632D6FA86E1A7
PDF  993E137DBEB137F1E4B39096995BDC1A24ECD0173AC711A34EA592FFAF2CA349
~~~

Assert the normalizer rejects any source hash mismatch. Assert the output contains one canonical sheet, one logo anchor, no customer/supplier/bank/sample amounts, no formulas, no calcChain, no G-column residue, dimension/print area A1:F43, A4 portrait, fitToWidth=1, fitToHeight=1, and hidden gridlines.

- [ ] **Step 5: Run tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-template-registration.test.ts
~~~

Expected: FAIL because the assets and scripts do not exist.

- [ ] **Step 6: Implement the normalizer**

The source workbook's physical order is FINAL, Second, Interior; its conceptual order must not be inferred from that. Select Second Progress as the canonical visual sheet because the supplied A4 PDF matches it. Remove:

- every sample/customer/supplier/bank/financial value;
- every worksheet formula element and calcChain.xml;
- rows/columns outside A1:F43;
- the stray won number format;
- duplicate drawing anchors, retaining exactly one reference to the single PNG.

Preserve approved merges, widths, row heights, styles, palette, accounting format, and logo geometry. Apply corrected static labels and deterministic print metadata.

- [ ] **Step 7: Define the exact canonical cell map**

Record these logical targets in the manifest:

| Range | Logical field |
|---|---|
| D1:F2 | supplier legal/trading name |
| D3:F3 | contractor licence |
| D4:F4 | supplier ABN |
| D5:F5 | supplier phone |
| D6:F6 | supplier email |
| D7:F7 | static TAX INVOICE |
| A8 | static Billed to |
| A9:A12 | recipient name/company/address/optional ABN |
| D9/F9 | Tax Invoice Number label/value |
| D10/F10 | Date of Issue label/value |
| D11/F11 | Due Date label/value |
| A15:B16 | Pxx or FINAL Progress Claim label |
| E15:F16 | red This Tax Invoice Inc GST headline |
| A18:F18 | Description heading |
| A20 | static Site / Supply label |
| B20:E20 | merged site address and fully taxable 10% GST statement |
| A21 | static Reference label |
| B21:E21 | merged reference and default description |
| F21 | base contract Ex GST |
| A22 | static Approved Adjustments label |
| B22:E24 | first wrapped adjustment/detail block |
| B25:E28 | second wrapped adjustment/detail block |
| F23:F28 | aggregate net approved adjustments Ex GST |
| E29:F36 | eight financial summary rows |
| A39:B43 | bank heading/name/bank/BSB/account number |

Financial rows E29:F36, in order:

1. Adjusted Contract Ex GST
2. Contract GST
3. Adjusted Contract Inc GST
4. Previous Progress Claims Inc GST
5. This Progress Claim Ex GST
6. GST on This Progress Claim
7. This Tax Invoice Inc GST
8. Remaining Unclaimed Contract Balance

Register B20:E20 and B21:E21 as explicit normalized-template merges. If ordered adjustment descriptions do not fit the two detail blocks at the approved font size, move the overflow to continuation sheets/pages. F23:F28 is one merged aggregate numeric field, not one cell per adjustment.

- [ ] **Step 8: Generate and verify the sanitized asset**

Run the normalizer with the user-supplied source path and expected hash. It must write only the sanitized normalized asset and manifest into assets/progress-invoices. Run a second independent scan that fails if any source string, formula, forbidden part, or unexpected relationship remains.

Expected: manifest contains 64-character source/normalized/logo/font hashes, exact part/relationship allowlists, cell-map/layout versions, merge/style/width hashes, and non-zero security limits. The original XLSX/PDF remain outside Git.

- [ ] **Step 9: Run tests and confirm GREEN**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-template-registration.test.ts
npm.cmd run typecheck
npm.cmd run build
~~~

Expected: all pass, the Next server bundle can import the pinned PDF stack under the declared Node engine, and Git contains no original customer document.

- [ ] **Step 10: Commit**

~~~powershell
git add package.json package-lock.json .gitignore assets/progress-invoices scripts/normalize-progress-invoice-template.mjs tests/fixtures/progress-invoices/source-fingerprints.json tests/fixtures/progress-invoices/pbc-template-v1.manifest.json tests/progress-invoice-template-registration.test.ts
git commit -m "feat: normalize progress invoice template"
~~~

### Task 11: Harden OOXML archive parsing and cell writing

**Files:**
- Create: lib/progress-invoices/documents/types.ts
- Create: lib/progress-invoices/documents/template-manifest.ts
- Create: lib/progress-invoices/documents/ooxml-archive-guard.ts
- Create: lib/progress-invoices/documents/ooxml-cell-writer.ts
- Create: tests/progress-invoice-ooxml-security.test.ts
- Create: tests/fixtures/progress-invoices/ooxml-security-corpus.ts

**Interfaces:**
- Produces: inspectOoxmlArchive(bytes, manifest)
- Produces: writeInlineStringCell(document, ref, value)
- Produces: writeNumericCell(document, ref, decimalString)
- Consumes: immutable template manifest

- [ ] **Step 1: Build the hostile archive corpus**

Programmatically create small fixtures for path traversal, absolute path, backslash, NUL, duplicate raw/normalized part, ZIP bomb ratio, compressed/expanded/part/XML limits, DOCTYPE/entity, macro, externalLink, TargetMode=External, OLE, ActiveX, embeddings, connections, customXml, unexpected relationship/part, ZIP64, multi-disk, encrypted entries, unsupported compression, local-header/central-directory mismatch, duplicate/overlapping offsets, bad CRC, trailing payload, and data-descriptor entries.

- [ ] **Step 2: Write failing archive guard tests**

Use these fixed limits:

~~~text
compressed XLSX: 5 MiB
total expanded: 25 MiB
parts: 128
single XML: 2 MiB
total XML: 10 MiB
single compression ratio: 100:1
PNG: 1 MiB
~~~

Assert each hostile fixture fails with a safe code and no archive content in the error.

The normalized master supports only single-disk, non-ZIP64, non-encrypted ZIP entries using store or deflate. Local and central names/methods/sizes must agree; compressed ranges cannot overlap; CRC must match expanded bytes; EOCD must end the archive; and data-descriptor entries are rejected.

- [ ] **Step 3: Write failing cell writer tests**

Assert strings beginning with =, +, -, or @ are inlineStr text, not formulas; invalid XML C0 controls are rejected; XML entities are escaped; PROGRESS_INVOICE_TEXT_LIMITS values are enforced; numeric cells accept canonical decimal strings only; and generated cells never contain f elements.

- [ ] **Step 4: Run tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-ooxml-security.test.ts
~~~

Expected: FAIL because guard and writers do not exist.

- [ ] **Step 5: Implement the archive guard**

Parse and cross-check EOCD, central directory, and local headers before expansion. Reject unsupported ZIP features, mismatches, overlaps, trailing bytes, duplicate raw/normalized names, paths, ratios, limits, and CRC failures. Reject DTD/entity markers before DOM parse, validate Content_Types and every relationship against the manifest, and allow only the one approved PNG media part.

- [ ] **Step 6: Implement deterministic cell writers**

Never concatenate unescaped XML. Use @xmldom/xmldom only after the archive guard rejects DTD/entities. Remove any existing formula before writing. Import the same PROGRESS_INVOICE_TEXT_LIMITS object used by Zod and require the manifest to contain those exact values. Preserve the manifest-approved style index and numeric accounting format.

- [ ] **Step 7: Run tests and confirm GREEN**

Run the command from Step 4.

Expected: every hostile case is rejected and every formula-prefix string remains inert text.

- [ ] **Step 8: Commit**

~~~powershell
git add lib/progress-invoices/documents/types.ts lib/progress-invoices/documents/template-manifest.ts lib/progress-invoices/documents/ooxml-archive-guard.ts lib/progress-invoices/documents/ooxml-cell-writer.ts tests/progress-invoice-ooxml-security.test.ts tests/fixtures/progress-invoices/ooxml-security-corpus.ts
git commit -m "feat: secure progress invoice OOXML"
~~~

### Task 12: Build immutable document snapshots and continuation plans

**Files:**
- Create: lib/progress-invoices/snapshot-builder.ts
- Create: lib/progress-invoices/filenames.ts
- Create: lib/progress-invoices/documents/pdf-layout.ts
- Create: tests/progress-invoice-snapshot-builder.test.ts
- Create: tests/progress-invoice-layout.test.ts

**Interfaces:**
- Produces: buildProgressInvoiceDocumentSnapshot(input)
- Produces: paginateProgressInvoiceSnapshot(snapshot, metrics)
- Produces: sanitizeProgressInvoiceFilename(input)
- Consumes: one immutable Claim Revision and its exact revision-set predecessors

- [ ] **Step 1: Write failing snapshot tests**

Assert the snapshot contains:

- supplier/profile snapshot including ABN, licence, contact, bank, GST and timezone;
- recipient/company/address/contact/optional ABN and site snapshot;
- Jobber account/invoice/original-number/current-observation reference;
- Tax Invoice number, dates, suffix/kind/revision reason;
- approved adjustment snapshot;
- adjusted contract, previous claims, current Ex/GST/Inc, cumulative percentage, and remaining components;
- calculation/template/layout policy versions;
- revision-set/financial/predecessor hashes.

Assert it cannot read current mutable profile, series, adjustment, Jobber, or payment data after creation.

- [ ] **Step 2: Write failing Tax Invoice validation tests**

Block a snapshot missing TAX INVOICE label, supplier name/ABN, issue number/date, recipient name/address, site/supply extent, fully taxable 10% statement, current Ex/GST/Inc, due date, or bank details. For amounts at least AUD 1,000, require clear recipient identity/address and retain optional ABN.

- [ ] **Step 3: Write failing continuation tests**

Cover six first-page adjustment/detail lines, overflow to immediate continuation pages, wrapped description, repeated invoice number/suffix/page count, stable order, approved minimum font size, and no truncation. Sheet names must be unique and at most 31 characters:

~~~text
P01 Progress
P01 Cont 1
P02 Progress
P02 Cont 1
FINAL Progress
FINAL Cont 1
~~~

- [ ] **Step 4: Write failing filename tests**

Assert current and series examples resolve to:

~~~text
PBCinv2906-P02.xlsx
PBCinv2906-P02.pdf
PBCinv2906-PROGRESS-SERIES.xlsx
PBCinv2906-PROGRESS-SERIES.pdf
~~~

Reject path separators, reserved Windows names, control characters, trailing dots/spaces, and overlong names without changing the visible Tax Invoice number stored in the document.

- [ ] **Step 5: Run tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-snapshot-builder.test.ts tests/progress-invoice-layout.test.ts
~~~

Expected: FAIL because snapshot and layout modules do not exist.

- [ ] **Step 6: Implement the immutable snapshot builder**

Read one database transaction/view DTO, convert every numeric to canonical decimal text, deep-freeze the result in tests, and hash canonical key-sorted JSON. Payments are excluded from Tax Invoice previous-claim calculations and document financial labels.

- [ ] **Step 7: Implement deterministic pagination and filenames**

Use the approved Carlito metrics and fixed layout boxes. A first page never shrinks below the approved font size; overflow creates continuation content. Filename sanitation affects only download metadata, never invoice identity.

- [ ] **Step 8: Run tests and confirm GREEN**

Run the command from Step 5.

Expected: all pass with deterministic hashes and page plans.

- [ ] **Step 9: Commit**

~~~powershell
git add lib/progress-invoices/snapshot-builder.ts lib/progress-invoices/filenames.ts lib/progress-invoices/documents/pdf-layout.ts tests/progress-invoice-snapshot-builder.test.ts tests/progress-invoice-layout.test.ts
git commit -m "feat: snapshot progress invoice documents"
~~~

### Task 13: Render and structurally validate XLSX exports

**Files:**
- Create: lib/progress-invoices/documents/xlsx-renderer.ts
- Create: lib/progress-invoices/documents/xlsx-validator.ts
- Create: tests/progress-invoice-xlsx-renderer.test.ts
- Create: tests/fixtures/progress-invoices/golden/series-structure.json

**Interfaces:**
- Produces: XlsxProgressInvoiceRenderer implements ProgressInvoiceRenderer
- Produces: validateProgressInvoiceXlsx(bytes, request, manifest)
- Consumes: normalized template, page plans, and immutable snapshots

- [ ] **Step 1: Write failing current-claim renderer tests**

Unzip output and assert one P02 Progress sheet plus continuations, exact critical values, numeric money cells, inline user text, retained merges/styles/widths/logo relationship, one logo anchor, accounting formats, corrected labels, A4/print area, no formulas/calcChain/sample data, and output reopening/recalculation cannot change values.

- [ ] **Step 2: Write failing series renderer tests**

Assert ordered current revision-set sheets P01, P02, FINAL with each continuation immediately after its claim. Void/superseded revisions are absent. Worksheet names are unique and workbook relationships/content types remain valid.

- [ ] **Step 3: Write failing validator tests**

The validator must re-open generated bytes through the archive guard, extract invoice number/dates/recipient/current Ex/GST/Inc/headline and count/order, compare them to the request, and return RenderedClaimCriticalFields. Corrupt a cell, style, relation, formula, and print setting to prove failure.

- [ ] **Step 4: Run tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-xlsx-renderer.test.ts tests/progress-invoice-ooxml-security.test.ts
~~~

Expected: FAIL because the renderer and validator do not exist.

- [ ] **Step 5: Implement template cloning and sheet duplication**

Clone only manifest-approved package parts. Duplicate canonical sheet XML/drawing relationships deterministically, assign fresh relationship/sheet IDs, patch cells through ooxml-cell-writer, and update workbook ordering/names. Do not implement financial calculations in the renderer.

- [ ] **Step 6: Implement structural validation**

Validate package security and critical fields from the final serialized bytes, not in-memory inputs. Compute SHA-256 over the final bytes and report worksheet count.

- [ ] **Step 7: Run tests and confirm GREEN**

Run the command from Step 4.

Expected: all pass and altered output bytes fail validation.

- [ ] **Step 8: Perform manual Excel QA**

Open the sanitized P02 and full-series outputs in Microsoft Excel, force recalculation, save a copy, and verify displayed financial values remain unchanged, logo/style/print preview match, and each normal sheet prints as one A4 page. Record screenshots and hashes outside the repository if they contain identities.

- [ ] **Step 9: Commit**

~~~powershell
git add lib/progress-invoices/documents/xlsx-renderer.ts lib/progress-invoices/documents/xlsx-validator.ts tests/progress-invoice-xlsx-renderer.test.ts tests/fixtures/progress-invoices/golden/series-structure.json
git commit -m "feat: render progress invoice workbooks"
~~~

### Task 14: Render and validate matching A4 PDF exports

**Files:**
- Create: lib/progress-invoices/documents/pdf-renderer.ts
- Create: lib/progress-invoices/documents/pdf-validator.ts
- Create: tests/progress-invoice-pdf-renderer.test.ts
- Create: tests/progress-invoice-pdf-visual.test.ts
- Create: tests/fixtures/progress-invoices/golden/p02-layout.json
- Create: tests/fixtures/progress-invoices/golden/p02-page-1.png
- Create: tests/fixtures/progress-invoices/golden/p02-provenance.json
- Create: scripts/render-progress-invoice-pdf.mjs

**Interfaces:**
- Produces: PdfProgressInvoiceRenderer implements ProgressInvoiceRenderer
- Produces: validateProgressInvoicePdf(bytes, request, layout)
- Consumes: exact A4 draw plan, logo, approved fonts, and immutable snapshots

- [ ] **Step 1: Write failing semantic PDF tests**

Assert A4 595.32 x 841.92 pt, page count/order, Tax Invoice number, supplier/recipient/site/dates, taxable statement, eight financial labels, exact Ex/GST/Inc/headline values, continuation headers, and no DRAFT mark on issued documents.

- [ ] **Step 2: Write failing active-content tests**

Assert generated PDFs contain no JavaScript, attachments, AcroForm, launch action, URI action, or external file reference. Corrupt/inject each catalog entry and prove the validator rejects it.

- [ ] **Step 3: Write failing visual-layout tests**

Before implementing the renderer, use pdfjs-dist plus @napi-rs/canvas to rasterize the supplied source PDF at 144 DPI. Derive p02-layout.json, logo/rule/palette masks, and a text-region-redacted p02-page-1.png from that source, never from the new renderer. Record:

~~~json
{
  "sourcePdfSha256": "993E137DBEB137F1E4B39096995BDC1A24ECD0173AC711A34EA592FFAF2CA349",
  "dpi": 144,
  "width": 1191,
  "height": 1684,
  "page": 1,
  "baseline": "supplied-second-progress-pdf",
  "textRegionsRedacted": true
}
~~~

At 144 DPI, compare a sanitized P02 render against that independently derived baseline:

- image size 1191 x 1684;
- non-text rules and block anchors within 4 pixels;
- logo bounding box within 4 pixels;
- palette RGB exact;
- text bounding boxes inside approved regions;
- glyph-level pixel equality excluded.

The script must never write unredacted source text into the repository. Regenerating or changing the golden baseline requires separate visual approval. G2 must include the native canvas evidence before this automated visual test can be marked green.

- [ ] **Step 4: Run tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-pdf-renderer.test.ts tests/progress-invoice-pdf-visual.test.ts
~~~

Expected: FAIL because renderer and validator do not exist.

- [ ] **Step 5: Implement the fixed-coordinate renderer**

Register @pdf-lib/fontkit, embed approved Carlito Regular/Bold, embed the single approved PNG, draw from pdf-layout.ts, and add continuation pages without truncating. The renderer consumes final decimals and never recalculates them.

- [ ] **Step 6: Implement final-byte PDF validation**

Use pdfjs-dist 5.4.624 in the server runtime to extract text and positions from final bytes. Validate critical fields, page order/count, A4 geometry, prohibited catalog features, and SHA-256.

- [ ] **Step 7: Run tests and confirm GREEN**

Run the command from Step 4.

Expected: semantic, security, and 144-DPI layout tests pass.

- [ ] **Step 8: Compare against the supplied visual baseline**

Render a sanitized equivalent of the supplied Second Progress page. Confirm the approved A4/logo/colour/amount-block tolerances. Minor font rasterization differences are acceptable only when text boxes remain within their regions.

- [ ] **Step 9: Commit**

~~~powershell
git add lib/progress-invoices/documents/pdf-renderer.ts lib/progress-invoices/documents/pdf-validator.ts tests/progress-invoice-pdf-renderer.test.ts tests/progress-invoice-pdf-visual.test.ts tests/fixtures/progress-invoices/golden/p02-layout.json tests/fixtures/progress-invoices/golden/p02-page-1.png tests/fixtures/progress-invoices/golden/p02-provenance.json scripts/render-progress-invoice-pdf.mjs
git commit -m "feat: render progress invoice PDFs"
~~~

### Task 15: Orchestrate dual rendering, private storage, and atomic publication

**Files:**
- Create: lib/progress-invoices/documents/cross-format-validator.ts
- Create: lib/progress-invoices/documents/template-registration.ts
- Create: lib/progress-invoices/documents/document-storage.ts
- Create: lib/progress-invoices/documents/document-orchestrator.ts
- Create: lib/progress-invoices/documents/download-service.ts
- Create: lib/actions/progress-invoice-documents.ts
- Create: app/api/progress-invoices/documents/[documentId]/route.ts
- Create: tests/progress-invoice-cross-format.test.ts
- Create: tests/progress-invoice-document-orchestrator.test.ts
- Create: tests/progress-invoice-template-admin.test.ts
- Create: tests/progress-invoice-download-route.test.ts
- Create: supabase/migrations/20260714231500_add_progress_invoice_document_rpcs.sql
- Create: supabase/migrations/20260714232000_add_progress_invoice_storage.sql
- Modify: next.config.ts
- Modify: lib/actions/progress-invoice-claims.ts
- Modify: lib/progress-invoices/revision-set-service.ts
- Modify: lib/supabase/types.ts
- Modify: tests/progress-invoice-actions-supabase.test.ts
- Modify: supabase/tests/progress_invoices_test.sql

**Interfaces:**
- Produces: generateProgressInvoiceDocuments(input)
- Produces: registerBundledProgressInvoiceTemplate(input: unknown)
- Produces: generateProgressInvoiceDownload(input: unknown)
- Produces: issueProgressClaim, reviseIssuedProgressClaim, and voidProgressClaim actions
- Produces: one authorized download route that alone issues 60-second signed URLs
- Consumes: both validated renderers and proposed revision sets

- [ ] **Step 1: Write failing cross-format tests**

Compare ordered criticalFields arrays from final XLSX and PDF bytes. Require identical claim IDs/order, Tax Invoice number, dates, recipient, current Ex/GST/Inc, and headline amounts. Mutate one cent, one date, and one order independently to prove failure.

- [ ] **Step 2: Write failing orchestration and bounded template-registration tests**

Assert:

1. prepare_progress_revision_set creates a generating proposal without changing Current;
2. every new/cascade Claim Revision receives both current_claim XLSX and PDF;
3. renderer or validator failure calls fail_progress_revision_set and exposes no Ready file;
4. both objects upload to opaque paths and are read back for SHA-256 verification;
5. record_progress_document_ready stores hash/count/template/renderer/snapshot metadata;
6. publish_progress_revision_set succeeds only when every required pair is Ready and tax-review requirements are satisfied;
7. the pointer swap, Claim states, series status/read model, supersession, and audit event occur in one transaction;
8. idempotent retry with the same request fingerprint returns the first result without duplicate files/claims, while the same key with a changed fingerprint returns IDEMPOTENCY_KEY_REUSED.
9. authenticated clients cannot call record-ready/publish/fail directly, and service-only calls cannot substitute an actor/path outside the DB-created pending correlation.

For registerBundledProgressInvoiceTemplate, assert the Action first calls requireAllowedUser(), accepts only a sourceWorkbook File, verifies the approved source byte length 73,157 and SHA-256 before parsing, and loads the normalized workbook/manifest/fonts from the reviewed server bundle. Reject any upload above the narrow 256 KiB request-file cap, which remains safely below Next.js's default 1 MiB Server Action body limit even with multipart overhead; do not increase the global body limit. It must reject an arbitrary version, manifest, path, or expected hash supplied by the caller. Assert the authenticated registration RPC creates the Pending row and opaque source/master paths before any Service Role upload; uploaded source and normalized bytes are re-read and rehashed; activation derives actor/paths/expected hashes from the locked Pending row; and every failure leaves no Active template or partially trusted object. The original workbook remains private evidence and never enters Git or logs.

- [ ] **Step 3: Write failing series-bundle cache tests**

Assert current-claim scope returns one revision; series scope uses the ordered Current manifest; a matching manifest hash reuses the Ready bundle; a changed set creates a new pair; Void/superseded revisions are excluded; and historical downloads resolve their explicit revision rather than latest.

- [ ] **Step 4: Write failing storage/download security tests**

Assert:

- buckets progress-invoice-templates and progress-invoice-documents are private;
- no anon/authenticated direct object policy exists;
- Service Role is used only after requireAllowedUser and DB authorization;
- prepare_progress_revision_set creates Pending document IDs/opaque paths and stores auth.uid() before Service Role is used;
- paths contain UUID/hash only, never names/invoice numbers;
- only Ready rows can download;
- storage bytes rehash to the DB hash;
- URL expires in 60 seconds and uses the sanitized download filename;
- response is 303 with Cache-Control: private, no-store;
- a document from another/unknown series is denied.

- [ ] **Step 5: Run tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-cross-format.test.ts tests/progress-invoice-document-orchestrator.test.ts tests/progress-invoice-template-admin.test.ts tests/progress-invoice-download-route.test.ts tests/progress-invoice-actions-supabase.test.ts
~~~

Expected: FAIL because orchestration, storage, and route do not exist.

- [ ] **Step 6: Implement local Storage migration and bounded registration**

Create private buckets with XLSX/PDF MIME and size limits. Do not create owner-based policies because Service Role uploads may lack owner_id. The authenticated register_progress_invoice_template RPC creates a Pending template row with the approved source/normalized hashes, opaque source-evidence/master paths, and actor from auth.uid(). Only then may the authorized server upload/re-read/hash both the exact supplied source workbook and sanitized master and invoke service-only activate_progress_invoice_template, which reads the stored actor, paths, and expected hashes before atomically activating it.

Implement the only registration entry point as:

~~~ts
registerBundledProgressInvoiceTemplate(
  input: unknown
): Promise<ActionResult<{
  templateId: string
  version: number
  normalizedSha256: string
}>>
~~~

The Action accepts FormData containing only sourceWorkbook, calls requireAllowedUser(), rejects files above 256 KiB, requires the manifest's exact 73,157-byte source length, and hashes before parsing or using Service Role. It loads the reviewed v1 manifest, normalized workbook, and font evidence from assets/progress-invoices; the caller cannot select or override them. Keep the global Server Action body limit at Next.js's 1 MiB default. Configure next.config.ts with the narrow outputFileTracingIncludes global entry `{'/*': ['./assets/progress-invoices/**/*']}` and add tests that lock the 256 KiB application cap, the exact source length/hash, the unchanged framework limit, and production server-trace access to every bundled asset. The action may operate while the feature is disabled solely as the bounded administrative setup exception defined in Task 16. Do not create a CLI that consumes SUPABASE_SERVICE_ROLE_KEY or exposes template paths.

Applying this migration to production remains blocked by G6.

- [ ] **Step 7: Implement cross-format and document orchestration**

Implement authenticated register template plus service-only activate template and record-ready/publish/fail revision-set RPCs in 20260714231500_add_progress_invoice_document_rpcs.sql. publish_progress_revision_set applies an approved Void proposal atomically with the pointer/status changes. Service-only functions accept only pending IDs and verified metadata, derive storage paths/actor from locked rows, and reject any missing/mismatched correlation. A failed template upload/verification marks the Pending row Failed and quarantines or removes only its opaque partial objects; it never displaces the existing Active template. Never revise the committed foundation/series/Jobber/payment/claim migrations.

For issue/revision/void, generate only the pair for every changed/cascade Claim Revision required by the proposed set. Process one Claim Revision pair at a time: render, validate, upload, re-read/hash, record Ready, release its byte buffers, then continue. A full-series bundle is generated lazily on download and is not required for issue publication.

On failure, keep the prior Current set, mark the proposal/documents Failed with a safe code, and move partial objects under a quarantine prefix. Do not return partially validated URLs.

- [ ] **Step 8: Implement tax-review publication gate**

Clerical replacements with unchanged financial hash may publish after document validation. Financial/tax-affecting revision or issued Void must remain Pending Tax Review until the accountant-approved policy requirement is met and the action includes either the recorded approval reference or required external Adjustment Note reference.

- [ ] **Step 9: Implement download action and route**

~~~ts
generateProgressInvoiceDownload(
  input: unknown
): Promise<ActionResult<{
  documentId: string
  fileName: string
  downloadHref: string
}>>
~~~

downloadHref is always /api/progress-invoices/documents/{documentId}. The Action/service never calls createSignedUrl. The route independently authenticates/authorizes a Ready document, re-reads and hashes Storage bytes, and 303 redirects to a 60-second signed URL using the exact sanitized filename. Never put bank/customer data in the path or logs.

- [ ] **Step 10: Connect issue/revise/void actions**

Implement:

~~~ts
issueProgressClaim(
  input: unknown
): Promise<ActionResult<RevisionPublicationResult, ProgressClaimEditorDto>>

reviseIssuedProgressClaim(
  input: unknown
): Promise<ActionResult<RevisionPublicationResult, ProgressClaimEditorDto>>

voidProgressClaim(
  input: unknown
): Promise<ActionResult<RevisionPublicationResult, ProgressClaimEditorDto>>
~~~

Each calls the internal preparation service, renderer/orchestrator, and atomic publish path. Ensure stale Jobber acknowledgement is required for later issues when the last good observation is stale; first issue still requires a successful verified observation.

- [ ] **Step 11: Run focused tests and confirm GREEN**

Run the command from Step 5.

Expected: all selected tests pass and a one-byte mismatch prevents publication.

- [ ] **Step 12: Run local Storage/database tests and regenerate types**

Run:

~~~powershell
npx.cmd supabase db reset --local
npx.cmd supabase test db --local supabase/tests/progress_invoices_test.sql
npx.cmd supabase gen types --local --lang typescript --schema public | Out-File -LiteralPath lib/supabase/types.ts -Encoding utf8
npm.cmd run typecheck
npm.cmd run build
~~~

Expected: buckets, grants, RPCs, and atomic publication all pass locally, and the production server trace can load the exact normalized template/manifest/font assets.

- [ ] **Step 13: Commit**

~~~powershell
git add lib/progress-invoices/documents lib/actions/progress-invoice-documents.ts app/api/progress-invoices/documents next.config.ts lib/actions/progress-invoice-claims.ts lib/progress-invoices/revision-set-service.ts supabase/migrations/20260714231500_add_progress_invoice_document_rpcs.sql supabase/migrations/20260714232000_add_progress_invoice_storage.sql lib/supabase/types.ts tests/progress-invoice-cross-format.test.ts tests/progress-invoice-document-orchestrator.test.ts tests/progress-invoice-template-admin.test.ts tests/progress-invoice-download-route.test.ts tests/progress-invoice-actions-supabase.test.ts supabase/tests/progress_invoices_test.sql
git commit -m "feat: publish progress invoice documents atomically"
~~~

### Task 16: Add the server-only feature gate and invoice profile Settings

**Files:**
- Create: lib/progress-invoices/feature-flags.ts
- Create: app/(app)/settings/invoice/page.tsx
- Create: app/(app)/settings/invoice/loading.tsx
- Create: components/progress-invoices/invoice-profile-form.tsx
- Create: components/progress-invoices/template-registration-panel.tsx
- Create: tests/progress-invoice-feature-flag.test.ts
- Create: tests/progress-invoice-settings-ui.test.tsx
- Modify: app/(app)/settings/page.tsx
- Modify: components/settings/settings-form.tsx
- Modify: lib/actions/progress-invoice-series.ts
- Modify: lib/actions/progress-invoice-adjustments.ts
- Modify: lib/actions/progress-invoice-claims.ts
- Modify: lib/actions/progress-invoice-payments.ts
- Modify: lib/actions/progress-invoice-jobber.ts
- Modify: lib/actions/progress-invoice-documents.ts
- Modify: app/api/jobber/progress-invoices/jobs/[jobId]/invoices/route.ts
- Modify: app/api/jobber/progress-invoices/invoices/[invoiceId]/route.ts
- Modify: app/api/progress-invoices/documents/[documentId]/route.ts
- Modify: tests/progress-invoice-actions.test.ts
- Modify: tests/jobber-progress-invoice-routes.test.ts
- Modify: tests/progress-invoice-download-route.test.ts
- Modify: .env.example

**Interfaces:**
- Produces: isProgressInvoicesEnabled()
- Produces: dedicated /settings/invoice profile and bounded template setup surface
- Consumes: get/save business profile and registerBundledProgressInvoiceTemplate actions

- [ ] **Step 1: Write failing feature-flag tests**

Assert:

- production default is false;
- PROGRESS_INVOICES_ENABLED=true enables server routes/navigation;
- explicit false disables it in every environment;
- the value is server-only and no NEXT_PUBLIC key is added;
- disabled operational pages call notFound(), every operational Progress Server Action returns FORBIDDEN before state access, and every operational Progress API route returns 404 after its authentication gate;
- /settings/invoice, get/save business profile, and the exact-hash bundled-template registration remain available to an allowed user as the only setup exceptions while disabled.

- [ ] **Step 2: Write failing invoice profile UI tests**

Cover legal/trading name, ABN checksum/format, contractor licence, address, phone, email, bank/account details, fixed GST 10%, fixed Australia/Sydney, payment terms, version conflict, validation summary, successful save, and no browser storage/logging.

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-feature-flag.test.ts tests/progress-invoice-settings-ui.test.tsx tests/settings-ui.test.tsx
~~~

Expected: FAIL because the flag and invoice profile route do not exist.

- [ ] **Step 4: Implement the server-only flag and centralized guard**

Add PROGRESS_INVOICES_ENABLED=false to .env.example. Read it only on the server. Export isProgressInvoicesEnabled(), requireProgressInvoicesEnabled(), and a shared disabled ActionResult mapper. Apply the operational guard to every series, adjustment, claim, payment, Jobber, generation, download, and document route/action, including the conditional direct-invoice search route if G1 created it. Within progress-invoice-documents.ts, only registerBundledProgressInvoiceTemplate is setup-exempt; its exact file/hash/bundle checks and requireAllowedUser() remain mandatory. The invoice-profile get/save actions are the other setup exception. Every page/route created in Tasks 17-19 calls the same guard before its read, while authenticated /settings/invoice remains reachable for setup. Pass only a boolean from authenticated layout/page code into client components; never expose the raw environment value.

- [ ] **Step 5: Implement dedicated Invoice Settings**

Keep the existing Settings tabs stable and add a clear link/card to /settings/invoice. The form never stores values locally, never logs them, posts unknown input to the existing validated action, and shows optimistic conflict data without overwriting. Add a separate setup panel that shows the reviewed bundled template version/hash, accepts only the original workbook File for exact-hash evidence, reports Pending/Active/Failed without revealing object paths, and calls registerBundledProgressInvoiceTemplate. It cannot accept an arbitrary manifest/template/version and is hidden after the expected version is Active except for an explicit future rotation workflow.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run the command from Step 3.

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

~~~powershell
git add -- lib/progress-invoices/feature-flags.ts 'app/(app)/settings/invoice' components/progress-invoices/invoice-profile-form.tsx components/progress-invoices/template-registration-panel.tsx tests/progress-invoice-feature-flag.test.ts tests/progress-invoice-settings-ui.test.tsx tests/progress-invoice-actions.test.ts tests/jobber-progress-invoice-routes.test.ts tests/progress-invoice-download-route.test.ts 'app/(app)/settings/page.tsx' components/settings/settings-form.tsx lib/actions/progress-invoice-series.ts lib/actions/progress-invoice-adjustments.ts lib/actions/progress-invoice-claims.ts lib/actions/progress-invoice-payments.ts lib/actions/progress-invoice-jobber.ts lib/actions/progress-invoice-documents.ts app/api/jobber/progress-invoices app/api/progress-invoices/documents .env.example
git commit -m "feat: configure progress invoice business profile"
~~~

### Task 17: Add dashboard, creation flow, navigation, and Quote entry points

**Files:**
- Create: app/(app)/progress-invoices/page.tsx
- Create: app/(app)/progress-invoices/loading.tsx
- Create: app/(app)/progress-invoices/new/page.tsx
- Create: components/progress-invoices/progress-invoice-dashboard.tsx
- Create: components/progress-invoices/series-create-form.tsx
- Create: components/progress-invoices/jobber-invoice-selector.tsx
- Create: components/progress-invoices/progress-invoices.module.css
- Create: app/api/jobber/progress-invoices/jobs/search/route.ts
- Create: tests/progress-invoice-dashboard-ui.test.tsx
- Create: tests/progress-invoice-create-ui.test.tsx
- Create: tests/progress-invoice-jobber-selector.test.tsx
- Modify: app/(app)/layout.tsx
- Modify: components/layout/app-header.tsx
- Modify: components/ui/icons.tsx
- Modify: tests/app-header-ui.test.tsx
- Modify: app/(app)/quotes/[id]/page.tsx
- Modify: components/quote-detail/quote-detail-view.tsx
- Modify: tests/quote-ui.test.tsx
- Modify: lib/jobber/client.ts
- Modify: lib/jobber/invoice-gateway.ts

**Interfaces:**
- Produces: top-level Progress Invoices destination
- Produces: Existing PBC Quote or Standalone guided creation
- Produces: explicit Jobber job/invoice/property/address selection
- Consumes: dashboard/read DTOs and Jobber selector routes

- [ ] **Step 1: Write failing navigation tests**

Assert desktop/mobile navigation shows Progress Invoices only when enabled, active-route behavior covers all nested routes, mobile short label is Progress, and existing Overview/New Quote/Settings/Inventory behavior remains unchanged.

- [ ] **Step 2: Write failing dashboard tests**

Cover search by builder/recipient/site/quote/Jobber number; status filters draft/active/completed/reconciliation required/overdue/part paid/paid/void; cards for adjusted contract, cumulative claims, actual receipts, outstanding, cumulative progress, Jobber freshness; and quick actions.

Assert Claimed and Received are never merged into one label or figure.

- [ ] **Step 3: Write failing creation-flow tests**

Cover:

1. choose Existing PBC Quote or Standalone;
2. quote prefill is editable and snapshotted;
3. standalone requires base contract Ex GST;
4. Jobber job lookup returns explicit candidates, never the first fuzzy result;
5. selecting one job loads every invoice page;
6. selecting one invoice with multiple jobs/properties requires explicit choice;
7. billing and property addresses remain separate choices;
8. editable recipient/site snapshot is saved;
9. Jobber amounts are comparison-only;
10. draft may save without an invoice, but Claim creation remains blocked;
11. when supportsDirectInvoiceSearch is true, the form exposes Direct Invoice Search, consumes every paginated result, and requires an explicit invoice choice before the same job/property/address review;
12. when supportsDirectInvoiceSearch is false, the direct-search control and route call are absent and job-first is the only link path.

- [ ] **Step 4: Write failing Quote CTA tests**

When enabled:

- zero linked series -> Create Progress Invoice with quoteId;
- one linked series -> Open Progress Invoice;
- multiple linked series -> View Progress Invoices filtered by quote.

When disabled, no CTA or extra read query appears.

- [ ] **Step 5: Run focused tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/app-header-ui.test.tsx tests/progress-invoice-dashboard-ui.test.tsx tests/progress-invoice-create-ui.test.tsx tests/progress-invoice-jobber-selector.test.tsx tests/quote-ui.test.tsx
~~~

Expected: FAIL because the routes/components do not exist.

- [ ] **Step 6: Implement safe Jobber job candidate discovery**

Add a new query-only function that returns all exact/fuzzy Job candidates with IDs/numbers/titles, preserving the existing searchJobberJob behavior for Quote fetch. The new route requires auth, calls requireProgressInvoicesEnabled(), validates bounded search text, returns no raw GraphQL, and forces the user to choose one candidate. Add a disabled-route regression test here because this route is created after Task 16.

- [ ] **Step 7: Implement dashboard and query-state filters**

Server page reads validated searchParams and passes a purpose-specific paginated DTO. Keep financial values on the server except the rows/cards needed for display. Add loading state and empty/error states using existing design tokens.

- [ ] **Step 8: Implement the guided creation form**

Use explicit steps with a persistent review summary. Pass supportsDirectInvoiceSearch from the server-side registered contract. If true, offer Job-first and Direct Invoice Search choices; the latter uses the conditional authenticated search route, fully paginates, never auto-selects, and then applies the same explicit job/property/address review. If false, do not render or call that route. Server re-fetches selected Jobber data on Save in both paths, so client previews are never authoritative. Preserve user edits when the Jobber preview refreshes and display proposed changes rather than overwriting.

- [ ] **Step 9: Integrate navigation and Quote detail**

Pass the server feature boolean through app/(app)/layout.tsx to AppHeader. Query linked series only when enabled. Use IntentLink for every new navigation target.

- [ ] **Step 10: Run focused tests and confirm GREEN**

Run the command from Step 5.

Expected: all selected tests pass with no console warnings.

- [ ] **Step 11: Run Jobber and Quote regressions**

Run:

~~~powershell
npm.cmd run test:run -- tests/jobber-invoice-gateway.test.ts tests/jobber-readonly-regression.test.ts tests/jobber-write-client.test.ts tests/quote-actions.test.ts tests/quote-actions-supabase.test.ts
~~~

Expected: all pass.

- [ ] **Step 12: Commit**

~~~powershell
git add -- 'app/(app)/progress-invoices' components/progress-invoices app/api/jobber/progress-invoices/jobs/search lib/jobber/client.ts lib/jobber/invoice-gateway.ts 'app/(app)/layout.tsx' components/layout/app-header.tsx components/ui/icons.tsx 'app/(app)/quotes/[id]/page.tsx' components/quote-detail/quote-detail-view.tsx tests/app-header-ui.test.tsx tests/progress-invoice-dashboard-ui.test.tsx tests/progress-invoice-create-ui.test.tsx tests/progress-invoice-jobber-selector.test.tsx tests/quote-ui.test.tsx
git commit -m "feat: add progress invoice creation workspace"
~~~

### Task 18: Build the series detail, adjustments, payments, and audit UI

**Files:**
- Create: app/(app)/progress-invoices/[seriesId]/page.tsx
- Create: app/(app)/progress-invoices/[seriesId]/loading.tsx
- Create: components/progress-invoices/series-detail.tsx
- Create: components/progress-invoices/adjustment-register.tsx
- Create: components/progress-invoices/claim-timeline.tsx
- Create: components/progress-invoices/payment-ledger.tsx
- Create: components/progress-invoices/history-panel.tsx
- Create: tests/progress-invoice-series-ui.test.tsx
- Create: tests/progress-invoice-payment-ui.test.tsx
- Modify: components/progress-invoices/progress-invoices.module.css

**Interfaces:**
- Produces: one reconciled contract/claim/receipt workspace
- Consumes: series detail, payment ledger, Jobber diff, and audit DTOs

- [ ] **Step 1: Write failing series summary tests**

Assert separate cards for adjusted contract, issued claims, actual receipts, outstanding receivable, unclaimed contract, and progress percentage. Cover active/completed/reconciliation/void, stale Jobber warning, raw Jobber status/amount/date/reference, and safe last-sync errors.

- [ ] **Step 2: Write failing adjustment register tests**

Cover Draft edit, approve confirmation, immutable Approved display, Variation/Credit sign labels, superseding correction with reason, reconciliation warning, version conflict, and no Retention control.

- [ ] **Step 3: Write failing payment ledger tests**

Cover source/status badges Jobber, Manual, Matched/Superseded, Unconfirmed, Void; manual create/edit/void; Jobber read-only rows; partial/full/credit-balance summaries; candidate comparison; Confirm Match; Undo Match; and required reason.

- [ ] **Step 4: Write failing timeline/audit tests**

Assert claim sequence/status/revision/current markers, event actor/time/source/safe field diff, current vs historical document links, and no bank details or full snapshots inside audit JSON display.

- [ ] **Step 5: Run focused tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-series-ui.test.tsx tests/progress-invoice-payment-ui.test.tsx
~~~

Expected: FAIL because the detail components do not exist.

- [ ] **Step 6: Implement the server detail page**

Fetch one purpose-specific detail DTO after feature/auth checks. Keep independent sections resilient: a Jobber refresh failure does not hide local claims/payments/downloads. Use server-rendered headline figures and client islands only for mutations.

- [ ] **Step 7: Implement adjustment and payment interactions**

Disable controls during action, carry expectedVersion/idempotency keys, show safe conflict refresh, and never optimistically alter financial totals before server confirmation. Suggested matches require explicit comparison and confirmation.

- [ ] **Step 8: Implement history and Jobber diffs**

Expose Apply for recipient/site candidate changes without changing the accepted numbering base. History identifies current/superseded/failed revisions and preserves downloadable prior official documents.

- [ ] **Step 9: Run focused tests and confirm GREEN**

Run the command from Step 5.

Expected: all selected tests pass.

- [ ] **Step 10: Commit**

~~~powershell
git add -- 'app/(app)/progress-invoices/[seriesId]' components/progress-invoices/series-detail.tsx components/progress-invoices/adjustment-register.tsx components/progress-invoices/claim-timeline.tsx components/progress-invoices/payment-ledger.tsx components/progress-invoices/history-panel.tsx components/progress-invoices/progress-invoices.module.css tests/progress-invoice-series-ui.test.tsx tests/progress-invoice-payment-ui.test.tsx
git commit -m "feat: add progress invoice series ledger"
~~~

### Task 19: Build the Claim editor, live calculations, preview, and downloads

**Files:**
- Create: app/(app)/progress-invoices/[seriesId]/claims/[claimId]/page.tsx
- Create: components/progress-invoices/claim-editor.tsx
- Create: components/progress-invoices/tax-invoice-preview.tsx
- Create: components/progress-invoices/document-download-menu.tsx
- Create: tests/progress-invoice-claim-ui.test.tsx
- Create: tests/progress-invoice-download-ui.test.tsx
- Modify: components/progress-invoices/progress-invoices.module.css
- Modify: components/progress-invoices/claim-timeline.tsx
- Modify: components/progress-invoices/history-panel.tsx

**Interfaces:**
- Produces: one editor for Draft and Issued Claim identities
- Produces: authoritative input mode switching and derived values
- Produces: current-claim/series XLSX/PDF choices
- Consumes: exact pure calculator and issue/revision orchestrator

- [ ] **Step 1: Write failing authoritative-input tests**

Assert the user selects Cumulative Progress % or This Claim Amount, only the selected field is editable, and the other is derived. Switching modes preserves the current Inc GST result as the starting authoritative value. Cover 90%, exact sample P02, cent boundary, validation warning, and no floating-point drift.

- [ ] **Step 2: Write failing FINAL editor tests**

Assert FINAL displays locked residual Ex/GST/Inc, 100%, zero remaining, and cannot save/issue a partial amount. When residual should be another partial claim, direct the user to create Pxx.

- [ ] **Step 3: Write failing Issued-edit tests**

Assert Issued opens in the same editor/Claim/Tax Invoice identity, requires a reason, labels clerical vs financial/tax-affecting, retains prior revision, shows Pending Tax Review when needed, requires external reference according to the recorded policy, and previews cascade differences before publish.

- [ ] **Step 4: Write failing Tax Invoice preview tests**

Assert the HTML preview mirrors the document snapshot's A4 regions and labels, includes DRAFT for unissued/pending content, includes Tax Invoice/supplier ABN/recipient/site/dates/taxable statement/current Ex/GST/Inc/bank details, and does not substitute actual receipts for previous claims.

- [ ] **Step 5: Write failing download tests**

The menu must ask:

1. Current Claim or Entire Series;
2. Excel or PDF.

Assert it displays revision, generation time, template version, current marker; obtains only the authenticated downloadHref from the Action; follows the route that alone issues a signed URL; handles generation/retry/failure; and routes historical downloads through History.

- [ ] **Step 6: Run focused tests and confirm RED**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-claim-ui.test.tsx tests/progress-invoice-download-ui.test.tsx
~~~

Expected: FAIL because editor/preview/download components do not exist.

- [ ] **Step 7: Implement the editor with the shared calculator**

Import calculateProgressClaim directly; do not reimplement formulas in React. Serialize action payloads as decimal strings, dates, snapshots, expectedVersion, and UUID idempotency key. Show all Ex/GST/Inc/cumulative/remaining values before Save Draft or Issue.

- [ ] **Step 8: Implement Issued revision and cascade review**

Display every changed later Claim and preserved authoritative mode. Keep the previous Current set visible until publication succeeds. On tax-review block, preserve the draft proposal and explain the exact missing approval/reference.

- [ ] **Step 9: Implement preview and downloads**

The preview is an HTML representation of the immutable candidate snapshot with DRAFT marker; it is not the official file. Official download always resolves a Ready XLSX/PDF generated by the orchestrator.

- [ ] **Step 10: Run focused tests and confirm GREEN**

Run the command from Step 6.

Expected: all selected tests pass with exact sample amounts.

- [ ] **Step 11: Commit**

~~~powershell
git add -- 'app/(app)/progress-invoices/[seriesId]/claims' components/progress-invoices/claim-editor.tsx components/progress-invoices/tax-invoice-preview.tsx components/progress-invoices/document-download-menu.tsx components/progress-invoices/progress-invoices.module.css components/progress-invoices/claim-timeline.tsx components/progress-invoices/history-panel.tsx tests/progress-invoice-claim-ui.test.tsx tests/progress-invoice-download-ui.test.tsx
git commit -m "feat: edit and download progress invoice claims"
~~~

### Task 20: Complete security, RLS, browser, and end-to-end verification

**Files:**
- Create: tests/progress-invoice-security.test.ts
- Create: tests/progress-invoice-e2e-scenarios.test.ts
- Create: tests/progress-invoice-local-e2e.test.ts
- Create: tests/progress-invoice-rls-local-integration.test.ts
- Create: tests/progress-invoice-renderer-performance.test.ts
- Create: scripts/run-local-supabase-tests.mjs
- Create: scripts/benchmark-progress-invoice-renderers.mjs
- Modify: tests/security-static.test.ts
- Modify: tests/rls.test.ts
- Modify: tests/rls-local-integration.test.ts
- Modify: tests/package-scripts.test.ts
- Modify: package.json

**Interfaces:**
- Consumes: all module boundaries
- Produces: repeatable release evidence without a new browser-test dependency

- [ ] **Step 1: Write the fast integrated business scenario test**

Use in-memory/service/database doubles for a fast deterministic pass over:

1. create from PBC Quote;
2. link one Jobber invoice;
3. approve Variation and issue P01;
4. approve Credit and issue P02 at cumulative 90%;
5. import a Jobber partial payment and enter a missing Manual payment;
6. match the Manual row when Jobber later returns it;
7. issue exact residual FINAL;
8. block partial FINAL and post-FINAL Claim;
9. download current and series in XLSX/PDF;
10. clerically revise Issued P02 and retain history;
11. financially revise P01, preview cascades, and keep old Current until tax/doc gates pass;
12. survive Jobber outage with stale acknowledgement for later issue;
13. reject hostile workbook text and unauthorized download.

- [ ] **Step 2: Add one real local end-to-end scenario**

In tests/progress-invoice-local-e2e.test.ts, run the PBC Quote -> Jobber link -> Variation -> P01 -> partial Jobber/Manual payments -> match -> 90% P02 -> residual FINAL -> current/series XLSX/PDF -> authorized download flow through the actual Server Action/service, local Postgres RPCs/RLS, local private Storage, and download Route. Mock only Jobber HTTP responses and Next cache/cookie adapters required to supply the real authenticated local Supabase client.

Assert the final Storage bytes rehash to progress_documents, the signed local URL returns those bytes, current pointers reference one coherent set, and teardown removes the temporary user/objects/rows.

- [ ] **Step 3: Extend static security tests**

Assert no Progress Invoice module contains:

- Jobber mutation documents or direct Jobber fetch endpoint literals;
- dangerouslySetInnerHTML;
- localStorage/sessionStorage/indexedDB financial persistence;
- actual_price/full snapshot logging;
- public bucket or customer-derived object path;
- service-role use before authorization;
- Number/parseFloat in calculation/payment/revision modules;
- formula creation for user strings.

- [ ] **Step 4: Add a hard-fail local Supabase runner and RLS integration**

Against local Supabase only, verify anon sees no rows/objects; authenticated can SELECT but cannot direct-write; authorized RPC writes succeed; immutable rows reject update/delete; events are append-only; ready document authorization is required; and Service Role can upload/re-read private objects.

Implement scripts/run-local-supabase-tests.mjs to read local URL/keys from supabase status --output env, reject every non-local hostname, set REQUIRE_LOCAL_RLS_TESTS=1, create a temporary authenticated user, and spawn Vitest. When REQUIRE_LOCAL_RLS_TESTS=1, missing configuration or any describe.skip path throws before tests; the runner also fails if zero local tests execute.

Map API_URL -> SUPABASE_RLS_TEST_URL, ANON_KEY -> SUPABASE_RLS_TEST_ANON_KEY, and SERVICE_ROLE_KEY -> SUPABASE_RLS_TEST_SERVICE_ROLE_KEY in the child process only. Generate SUPABASE_RLS_TEST_EMAIL/PASSWORD per run, set ALLOWED_LOGIN_EMAILS to that email, and never print keys/passwords.

Set the exact package scripts:

~~~json
{
  "test:rls:local": "node scripts/run-local-supabase-tests.mjs rls",
  "test:progress-invoices:local": "node scripts/run-local-supabase-tests.mjs progress-invoices"
}
~~~

Mode rls runs tests/rls-local-integration.test.ts and tests/progress-invoice-rls-local-integration.test.ts. Mode progress-invoices runs tests/progress-invoice-local-e2e.test.ts. Update tests/package-scripts.test.ts to lock both scripts.

- [ ] **Step 5: Run focused and real local tests**

Run:

~~~powershell
npm.cmd run test:run -- tests/progress-invoice-e2e-scenarios.test.ts tests/progress-invoice-security.test.ts tests/security-static.test.ts tests/rls.test.ts
npm.cmd run test:rls:local
npm.cmd run test:progress-invoices:local
~~~

Expected: all selected tests pass, both local commands report non-zero executed test counts, and neither can silently skip.

- [ ] **Step 6: Run full local database verification**

Run:

~~~powershell
npx.cmd supabase db reset --local
npx.cmd supabase db lint --local --schema public,storage --level warning --fail-on error
npx.cmd supabase test db --local supabase/tests/progress_invoices_test.sql
npm.cmd run test:rls:local
~~~

Expected: clean reset/lint and all DB/RLS tests pass.

- [ ] **Step 7: Benchmark representative renderer load**

Create a deterministic sanitized series containing twelve Pxx Claims, FINAL, and enough adjustments/descriptions to produce at least 24 A4 pages. The orchestrator must render/validate/upload changed current-claim pairs sequentially with max in-flight pair count 1; it must not retain all cascade pair bytes simultaneously.

Run one unmeasured warm-up followed by at least 30 measured iterations under the target Node major. Sort measured wall times ascending and define nearest-rank p95 as sample `ceil(0.95 * n) - 1` using a zero-based array; report the observation count, median, that p95, peak RSS delta, XLSX/PDF byte sizes, page/sheet counts, and platform. The performance test must reject fewer than 30 measured observations and verify the percentile calculation against a fixed sample. G6 requires:

~~~text
p95 full-series render + validation: <= 12 seconds
peak RSS delta: <= 384 MiB
XLSX output: <= 10 MiB
PDF output: <= 10 MiB
max current-claim pairs in flight: 1
~~~

Run:

~~~powershell
node scripts/benchmark-progress-invoice-renderers.mjs
npm.cmd run test:run -- tests/progress-invoice-renderer-performance.test.ts
~~~

Expected: all hard limits pass on a deployment-equivalent Node/platform. Store the JSON result as release evidence outside Git if it contains environment metadata.

- [ ] **Step 8: Run authenticated browser QA**

Use the existing browser tooling; do not add Playwright without separate dependency approval. Test at 390, 768, and 1440 CSS pixels:

- keyboard-only dashboard/create/detail/editor/download;
- accessible labels, error summary, focus return, dialogs, status announcements;
- mobile navigation and no horizontal overflow;
- stale Jobber, network failure, renderer retry, version conflict, and tax-review block;
- no console errors or financial data in browser storage/cache;
- successful signed download and expiration;
- print/PDF/XLSX visual checks.

- [ ] **Step 9: Run Jobber and Quote non-regression suite**

Run:

~~~powershell
npm.cmd run test:run -- tests/jobber.test.ts tests/jobber-invoice-contract.test.ts tests/jobber-pagination.test.ts tests/jobber-invoice-client.test.ts tests/jobber-invoice-gateway.test.ts tests/jobber-progress-invoice-routes.test.ts tests/jobber-write-client.test.ts tests/jobber-readonly-regression.test.ts tests/jobber-route-security.test.ts tests/jobber-tokens.test.ts tests/jobber-quote-route-refresh.test.ts tests/jobber-quote-line-payload.test.ts tests/quote-actions.test.ts tests/quote-actions-supabase.test.ts tests/quote-ui.test.tsx
~~~

Expected: all pass.

- [ ] **Step 10: Run full repository verification**

Run:

~~~powershell
npm.cmd run verify
~~~

Expected: diff check, typecheck, ESLint, full Vitest, coverage thresholds, production build, and high-severity audit all pass.

- [ ] **Step 11: Commit**

~~~powershell
git add tests/progress-invoice-security.test.ts tests/progress-invoice-e2e-scenarios.test.ts tests/progress-invoice-local-e2e.test.ts tests/progress-invoice-rls-local-integration.test.ts tests/progress-invoice-renderer-performance.test.ts scripts/run-local-supabase-tests.mjs scripts/benchmark-progress-invoice-renderers.mjs tests/security-static.test.ts tests/rls.test.ts tests/rls-local-integration.test.ts tests/package-scripts.test.ts package.json
git commit -m "test: verify progress invoice workflow"
~~~

### Task 21: Record documentation, accountant evidence, and production rollout gates

**Files:**
- Create: docs/PROGRESS-INVOICES-RUNBOOK.md
- Create: docs/PROGRESS-INVOICES-ACCOUNTANT-REVIEW.md
- Modify: docs/ARCHITECTURE.md
- Modify: docs/DB-SCHEMA.md
- Modify: docs/SECURITY.md
- Modify: docs/UI-PAGES.md
- Modify: docs/DEPLOY.md
- Modify: PROGRESS.md
- Modify: docs/superpowers/plans/2026-07-14-progress-invoices.md

**Interfaces:**
- Produces: operating/recovery/rollout evidence
- Consumes: final verified implementation and external approvals

- [ ] **Step 1: Document the delivered architecture**

Record module boundaries, read-only Jobber contract/version/scope, schema/RPC/RLS, calculation policy, template/renderer versions, storage paths, feature flag, stale-observation policy, revision-set publication, and recovery/quarantine flow.

- [ ] **Step 2: Record accountant review without overstating it**

The accountant review record must state the reviewed Tax Invoice fields and post-issue financial-revision/Adjustment Note policy, review date, outcome, and a non-sensitive external evidence reference. Bind the reviewed non-production XLSX/PDF pair to its source/normalized-template/logo/font/layout and output-content hashes, renderer version, reviewed source commit, and build digest so production can later prove it uses the same approved form and code. Until that exact evidence is signed off, mark G5 blocked and keep production feature disabled.

- [ ] **Step 3: Write the runbook**

Cover:

- register/activate a normalized template;
- rotate a template without changing old revisions;
- retry/inspect failed generation without exposing payloads;
- reconcile disappeared/ambiguous Jobber payments;
- handle Jobber scope/version failure;
- restore from last Current revision set;
- verify signed downloads;
- inspect audit history;
- rollback the feature flag without deleting data.

- [ ] **Step 4: Record exact verification evidence**

Update PROGRESS.md with test counts, coverage, build/audit, local DB/pgTAP/RLS/E2E non-skip evidence, browser viewports, visual/Excel checks, representative renderer time/RSS/size results, Jobber G1 result, dependency/font hashes, and every still-blocked production gate. Do not edit docs/DECISIONS.md unless the user separately approves a core decision change.

- [ ] **Step 5: Complete G5, then request the applicable G6 approvals**

First present the locally/staging-generated representative Tax Invoice pair and its bound hashes for G5 accountant sign-off. Do not apply production migrations/buckets/policies, OAuth changes, Vercel env, feature flag, deploy, or production template registration until G5 is recorded and the user then explicitly approves each applicable G6 action after reviewing the evidence.

After G5 and the applicable G6 approvals, preserve this rollout order and stop after any failed verification: (1) apply the approved migrations and private buckets/policies while PROGRESS_INVOICES_ENABLED remains false; (2) deploy the verified code with the flag false; (3) through authenticated /settings/invoice, save the production business profile and register the exact-hash bundled template using the bounded setup actions; (4) compare the Active template row and immutable manifest's source/normalized-template/logo/font/layout hashes to the G5 evidence, and separately compare the deployed renderer version, source commit, and build digest to that evidence; this setup verification must work with the flag false and must not generate an operational Claim; and only then (5) obtain a separate explicit approval to enable the flag. OAuth reconnect/scope change, Vercel runtime/environment mutation, and deployment each remain their own G6 approval when applicable.

- [ ] **Step 6: Run final verification after documentation**

Run:

~~~powershell
git diff --check
npm.cmd run verify
~~~

Expected: both pass and production remains unchanged.

- [ ] **Step 7: Request an independent code/security review**

Use superpowers:requesting-code-review with a gpt-5.6-sol high subagent. Resolve every P0/P1 finding, rerun focused/full verification, and record the reviewed commit.

- [ ] **Step 8: Commit the verified documentation**

~~~powershell
git add docs/PROGRESS-INVOICES-RUNBOOK.md docs/PROGRESS-INVOICES-ACCOUNTANT-REVIEW.md docs/ARCHITECTURE.md docs/DB-SCHEMA.md docs/SECURITY.md docs/UI-PAGES.md docs/DEPLOY.md PROGRESS.md docs/superpowers/plans/2026-07-14-progress-invoices.md
git commit -m "docs: record progress invoice release gates"
~~~

## Specification Traceability

| Approved requirement | Owning tasks |
|---|---|
| PBC Quote or standalone creation; one Jobber invoice per series; explicit job/property/address selection | 5, 7, 17 |
| Pinned Jobber schema/scope, complete pagination, read-only link/refresh, nullable/unknown fields, atomic failure behavior | 1, 6, 7, 20 |
| Editable Jobber Client prefill stored as PBC series snapshot | 5, 7, 17, 18 |
| Variation, Credit, no Retention, immutable adjustment corrections | 2, 5, 18 |
| Percentage or current-amount authority, exact GST cents, 90% and residual FINAL | 2, 9, 19, 20 |
| Previous Claims separate from Jobber/manual Actual Receipts; partial/refund/reversal/match/undo | 7, 8, 18, 20 |
| Jobber-number P01/P02/FINAL identity, locked base, no reuse, coherent cascade sets | 7, 9, 15 |
| Same Issued Claim editor with immutable revision/audit history and tax-review gate | 9, 15, 19, 21 |
| Official Tax Invoice supplier/recipient/progress/current Ex/GST/Inc fields | 10, 12, 13, 14, 15 |
| Same A4/logo/colours/placement/accounting format with corrected wording | 10-14 |
| Current Claim or Entire Series in XLSX/PDF; current and historical downloads | 13-15, 18, 19 |
| RLS, private Storage, signed route, actor attribution, locking, idempotency, feature gate | 3, 4, 15, 16, 20 |
| Existing Jobber Quote behavior unchanged | 1, 6, 7, 17, 20 |
| Accountant approval and explicit production mutations | 21 |

## Completion Definition

Implementation is complete only when all Task checkboxes through local verification are checked, all focused and full commands pass, the approved sample values match exactly, the current/series XLSX and PDF outputs pass structural/semantic/visual validation, and an independent review has no unresolved P0/P1 findings.

Production readiness is a separate state. It additionally requires G5 accountant sign-off and explicit G6 approval for every production mutation. A locally complete implementation must still report itself as production-disabled while either gate is open.

## Execution Handoff

Choose one execution mode after approving G2/G3 and arranging G1 access:

1. **Subagent-driven (recommended):** Use superpowers:subagent-driven-development in this task, one task/review cycle at a time. Every worker and reviewer must be gpt-5.6-sol with high reasoning.
2. **Inline plan execution:** Use superpowers:executing-plans in this task, run tasks sequentially with the same RED/GREEN/commit checkpoints and gpt-5.6-sol high reviewers.
