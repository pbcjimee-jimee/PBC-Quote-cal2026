import Decimal from 'decimal.js'
import { z } from 'zod'

import { PROGRESS_INVOICE_TEXT_LIMITS } from './types'

const STRICT_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/

export const decimalStringSchema = z.string().refine((value) => {
  if (!STRICT_DECIMAL_PATTERN.test(value)) return false
  return new Decimal(value).isFinite()
}, { message: 'Expected a canonical non-negative decimal string' })

const moneySchema = decimalStringSchema.refine(
  (value) => new Decimal(value).decimalPlaces() <= 2,
  { message: 'Money must have at most two decimal places' },
)
const positiveMoneySchema = moneySchema.refine(
  (value) => new Decimal(value).isPositive(),
  { message: 'Money must be positive' },
)
const percentageSchema = decimalStringSchema.refine(
  (value) => new Decimal(value).lte(100),
  { message: 'Percentage must be between 0 and 100' },
)
const gstRateSchema = z.literal('0.10')
const uuidSchema = z.string().uuid()
const externalIdSchema = z.string().trim().min(1)
const expectedVersionSchema = z.number().int().positive()
const dateSchema = z.iso.date()

const requiredText = (limit: number) => z.string().trim().min(1).max(limit)
const optionalText = (limit: number) => z.string().trim().max(limit).nullable().optional()

const profileShape = {
  legalName: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.legalName),
  tradingName: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.tradingName),
  contractorLicence: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.contractorLicence),
  abn: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.abn),
  address: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.address),
  email: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.email).email(),
  phone: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.phone),
  bankName: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.bankName),
  bankAccountName: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.bankAccountName),
  bsb: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.bsb),
  accountNumber: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.accountNumber),
  gstRate: gstRateSchema,
  businessTimezone: z.literal('Australia/Sydney'),
  defaultPaymentTermDays: z.number().int().nonnegative(),
}

export const saveBusinessInvoiceProfileSchema = z.strictObject({
  ...profileShape,
  expectedVersion: expectedVersionSchema.optional(),
})

const seriesEditableShape = {
  pbcQuoteId: uuidSchema.nullable().optional(),
  sourceType: z.enum(['pbc_quote', 'jobber_job', 'jobber_invoice']),
  baseContractExGst: positiveMoneySchema,
  gstRate: gstRateSchema,
  recipientName: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.recipientName),
  recipientCompany: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.recipientCompany),
  recipientAddress: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.address),
  recipientEmail: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.email),
  recipientPhone: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.phone),
  recipientAbn: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.abn),
  siteName: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.siteName),
  siteAddress: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.siteAddress),
  defaultDescription: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.description),
  reference: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.reference),
}

export const createProgressInvoiceSeriesSchema = z.strictObject({
  ...seriesEditableShape,
  correlationKey: uuidSchema,
}).superRefine((series, context) => {
  if (series.sourceType === 'pbc_quote' && !series.pbcQuoteId) {
    context.addIssue({
      code: 'custom',
      path: ['pbcQuoteId'],
      message: 'PBC quote series require a quote ID',
    })
  }
  if (series.sourceType !== 'pbc_quote' && series.pbcQuoteId != null) {
    context.addIssue({
      code: 'custom',
      path: ['pbcQuoteId'],
      message: 'Only PBC quote series may include a quote ID',
    })
  }
})

export const updateProgressInvoiceSeriesSchema = z.strictObject({
  seriesId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  baseContractExGst: seriesEditableShape.baseContractExGst.optional(),
  gstRate: seriesEditableShape.gstRate.optional(),
  recipientName: seriesEditableShape.recipientName.optional(),
  recipientCompany: seriesEditableShape.recipientCompany,
  recipientAddress: seriesEditableShape.recipientAddress.optional(),
  recipientEmail: seriesEditableShape.recipientEmail,
  recipientPhone: seriesEditableShape.recipientPhone,
  recipientAbn: seriesEditableShape.recipientAbn,
  siteName: seriesEditableShape.siteName.optional(),
  siteAddress: seriesEditableShape.siteAddress.optional(),
  defaultDescription: seriesEditableShape.defaultDescription.optional(),
  reference: seriesEditableShape.reference,
  correlationKey: uuidSchema,
})

export const progressInvoiceListSchema = z.strictObject({
  query: z.string().max(160),
  statuses: z.array(z.enum([
    'draft',
    'active',
    'completed',
    'reconciliation_required',
    'void',
    'unpaid',
    'part_paid',
    'paid',
    'overdue',
    'credit_balance',
  ])).max(10),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  quoteId: uuidSchema.nullable(),
})

export const progressInvoiceSeriesIdSchema = uuidSchema

export const progressInvoiceCreatePrefillSchema = z.union([
  z.strictObject({ quoteId: uuidSchema }),
  z.strictObject({ standalone: z.literal(true) }),
])

export const linkProgressJobberInvoiceSchema = z.strictObject({
  seriesId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  selectedJobberInvoiceId: externalIdSchema,
  selectedJobberJobId: externalIdSchema.optional(),
  selectedJobberPropertyId: externalIdSchema.optional(),
  observedJobberSnapshotId: uuidSchema,
  correlationKey: uuidSchema,
})

export const refreshProgressJobberInvoiceSchema = z.strictObject({
  seriesId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  selectedJobberJobId: externalIdSchema.optional(),
  selectedJobberPropertyId: externalIdSchema.optional(),
  acknowledgeStaleObservation: z.boolean(),
  idempotencyKey: uuidSchema,
})

export const acceptProgressJobberInvoiceNumberSchema = z.strictObject({
  seriesId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  observedJobberSnapshotId: uuidSchema,
  numberSource: z.enum(['original', 'latest']),
  idempotencyKey: uuidSchema,
})

const adjustmentShape = {
  type: z.enum(['variation', 'credit']),
  effectiveDate: dateSchema,
  description: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.adjustmentDescription),
  amountExGst: positiveMoneySchema,
  gstRate: gstRateSchema,
  pbcQuoteItemId: uuidSchema.nullable().optional(),
}

export const createProgressAdjustmentSchema = z.strictObject({
  seriesId: uuidSchema,
  ...adjustmentShape,
  correlationKey: uuidSchema,
})

export const updateProgressAdjustmentDraftSchema = z.strictObject({
  adjustmentId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  type: adjustmentShape.type.optional(),
  effectiveDate: adjustmentShape.effectiveDate.optional(),
  description: adjustmentShape.description.optional(),
  amountExGst: adjustmentShape.amountExGst.optional(),
  gstRate: adjustmentShape.gstRate.optional(),
  pbcQuoteItemId: adjustmentShape.pbcQuoteItemId,
  correlationKey: uuidSchema,
})

export const approveProgressAdjustmentSchema = z.strictObject({
  adjustmentId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  correlationKey: uuidSchema,
})

export const supersedeProgressAdjustmentSchema = z.strictObject({
  adjustmentId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  reason: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.revisionReason),
  replacement: z.strictObject(adjustmentShape),
  correlationKey: uuidSchema,
})

const claimDraftShape = {
  inputMode: z.enum(['cumulative_percentage', 'current_claim_amount']),
  authoritativeValue: decimalStringSchema,
  issueDate: dateSchema,
  dueDate: dateSchema,
  description: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.description),
  notes: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.notes),
}

type ClaimDraftForValidation = {
  inputMode: 'cumulative_percentage' | 'current_claim_amount'
  authoritativeValue: string
  issueDate: string
  dueDate: string
}

function validateClaimDraft(
  claim: ClaimDraftForValidation,
  context: z.RefinementCtx,
): void {
  if (claim.dueDate < claim.issueDate) {
    context.addIssue({
      code: 'custom',
      path: ['dueDate'],
      message: 'Due date cannot be before issue date',
    })
  }

  const authoritativeSchema = claim.inputMode === 'cumulative_percentage'
    ? percentageSchema
    : moneySchema
  const result = authoritativeSchema.safeParse(claim.authoritativeValue)
  if (!result.success) {
    context.addIssue({
      code: 'custom',
      path: ['authoritativeValue'],
      message: result.error.issues[0]?.message ?? 'Invalid authoritative value',
    })
  }
}

export const createProgressClaimDraftSchema = z.strictObject({
  seriesId: uuidSchema,
  kind: z.enum(['progress', 'final']),
  ...claimDraftShape,
  correlationKey: uuidSchema,
}).superRefine(validateClaimDraft)

export const saveProgressClaimDraftSchema = z.strictObject({
  claimId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  ...claimDraftShape,
  correlationKey: uuidSchema,
}).superRefine(validateClaimDraft)

export const issueProgressClaimSchema = z.strictObject({
  claimId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  acknowledgeStaleJobberObservation: z.boolean(),
  idempotencyKey: uuidSchema,
})

export const reviseIssuedProgressClaimSchema = z.strictObject({
  claimId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  ...claimDraftShape,
  revisionReason: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.revisionReason),
  idempotencyKey: uuidSchema,
}).superRefine(validateClaimDraft)

export const voidProgressClaimSchema = z.strictObject({
  claimId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  reason: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.revisionReason),
  idempotencyKey: uuidSchema,
})

const manualPaymentShape = {
  receivedDate: dateSchema,
  amount: positiveMoneySchema,
  method: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.paymentMethod),
  reference: optionalText(PROGRESS_INVOICE_TEXT_LIMITS.paymentReference),
}

export const createManualProgressPaymentSchema = z.strictObject({
  seriesId: uuidSchema,
  ...manualPaymentShape,
  correlationKey: uuidSchema,
})

export const reviseManualProgressPaymentSchema = z.strictObject({
  paymentId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  ...manualPaymentShape,
  reason: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.revisionReason),
  correlationKey: uuidSchema,
})

export const voidManualProgressPaymentSchema = z.strictObject({
  paymentId: uuidSchema,
  expectedVersion: expectedVersionSchema,
  reason: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.revisionReason),
  correlationKey: uuidSchema,
})

const paymentMatchShape = {
  jobberPaymentId: uuidSchema,
  manualPaymentId: uuidSchema,
  jobberExpectedVersion: expectedVersionSchema,
  manualExpectedVersion: expectedVersionSchema,
  reason: requiredText(PROGRESS_INVOICE_TEXT_LIMITS.revisionReason),
  idempotencyKey: uuidSchema,
}

export const matchProgressPaymentsSchema = z.strictObject(paymentMatchShape)
export const undoProgressPaymentMatchSchema = z.strictObject(paymentMatchShape)

export const progressInvoiceDocumentRequestSchema = z.strictObject({
  seriesId: uuidSchema,
  scope: z.enum(['current_claim', 'series_bundle']),
  format: z.enum(['xlsx', 'pdf']),
  claimRevisionId: uuidSchema.optional(),
  seriesRevisionSetId: uuidSchema.optional(),
  correlationKey: uuidSchema,
}).superRefine((request, context) => {
  if (request.scope === 'current_claim' && !request.claimRevisionId) {
    context.addIssue({
      code: 'custom',
      path: ['claimRevisionId'],
      message: 'Current claim documents require a claim revision ID',
    })
  }
  if (request.scope === 'series_bundle' && !request.seriesRevisionSetId) {
    context.addIssue({
      code: 'custom',
      path: ['seriesRevisionSetId'],
      message: 'Series bundle documents require a revision set ID',
    })
  }
})

export type SaveBusinessInvoiceProfileInput = z.infer<
  typeof saveBusinessInvoiceProfileSchema
>
export type CreateProgressInvoiceSeriesInput = z.infer<
  typeof createProgressInvoiceSeriesSchema
>
export type UpdateProgressInvoiceSeriesInput = z.infer<
  typeof updateProgressInvoiceSeriesSchema
>
export type CreateProgressAdjustmentInput = z.infer<
  typeof createProgressAdjustmentSchema
>
export type UpdateProgressAdjustmentDraftInput = z.infer<
  typeof updateProgressAdjustmentDraftSchema
>
export type ApproveProgressAdjustmentInput = z.infer<
  typeof approveProgressAdjustmentSchema
>
export type SupersedeProgressAdjustmentInput = z.infer<
  typeof supersedeProgressAdjustmentSchema
>
export type CreateProgressClaimDraftInput = z.infer<
  typeof createProgressClaimDraftSchema
>
export type SaveProgressClaimDraftInput = z.infer<
  typeof saveProgressClaimDraftSchema
>
export type CreateManualProgressPaymentInput = z.infer<
  typeof createManualProgressPaymentSchema
>
