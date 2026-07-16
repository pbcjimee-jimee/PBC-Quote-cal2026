import { describe, expect, it } from 'vitest'

import { PROGRESS_INVOICE_TEXT_LIMITS } from '@/lib/progress-invoices/types'
import {
  acceptProgressJobberInvoiceNumberSchema,
  approveProgressAdjustmentSchema,
  createManualProgressPaymentSchema,
  createProgressAdjustmentSchema,
  createProgressClaimDraftSchema,
  createProgressInvoiceSeriesSchema,
  linkProgressJobberInvoiceSchema,
  matchProgressPaymentsSchema,
  progressInvoiceDocumentRequestSchema,
  refreshProgressJobberInvoiceSchema,
  reviseManualProgressPaymentSchema,
  reviseIssuedProgressClaimSchema,
  saveBusinessInvoiceProfileSchema,
  saveProgressClaimDraftSchema,
  supersedeProgressAdjustmentSchema,
  undoProgressPaymentMatchSchema,
  updateProgressAdjustmentDraftSchema,
  updateProgressInvoiceSeriesSchema,
  voidManualProgressPaymentSchema,
  voidProgressClaimSchema,
} from '@/lib/progress-invoices/validators'

const UUID = '11111111-1111-4111-8111-111111111111'
const UUID_2 = '22222222-2222-4222-8222-222222222222'

const claimDraft = {
  inputMode: 'current_claim_amount' as const,
  authoritativeValue: '100.00',
  issueDate: '2026-07-14',
  dueDate: '2026-07-28',
  description: 'Completed painting works',
  notes: 'Sample note',
}

const businessProfile = {
  legalName: 'Harbour Example Co Pty Ltd',
  abn: '11 222 333 444',
  address: '1 Sample Street',
  email: 'accounts@example.test',
  phone: '0400000000',
  bankName: 'Sample Bank',
  bankAccountName: 'Harbour Example Co',
  bsb: '000-000',
  accountNumber: '12345678',
  gstRate: '0.10' as const,
  businessTimezone: 'Australia/Sydney' as const,
  defaultPaymentTermDays: 14,
}

describe('Progress Invoice command schemas', () => {
  it('accepts decimal strings and rejects numbers for money and percentages', () => {
    expect(createProgressAdjustmentSchema.safeParse({
      seriesId: UUID,
      type: 'variation',
      effectiveDate: '2026-07-14',
      description: 'Approved scope change',
      amountExGst: '0.01',
      gstRate: '0.10',
      correlationKey: UUID_2,
    }).success).toBe(true)
    expect(createProgressAdjustmentSchema.safeParse({
      seriesId: UUID,
      type: 'variation',
      effectiveDate: '2026-07-14',
      description: 'Approved scope change',
      amountExGst: 0.01,
      gstRate: '0.10',
      correlationKey: UUID_2,
    }).success).toBe(false)
    expect(createProgressClaimDraftSchema.safeParse({
      seriesId: UUID,
      kind: 'progress',
      ...claimDraft,
      authoritativeValue: 50,
      correlationKey: UUID_2,
    }).success).toBe(false)
  })

  it('enforces exact calendar dates and due date ordering', () => {
    expect(createProgressClaimDraftSchema.safeParse({
      seriesId: UUID,
      kind: 'progress',
      ...claimDraft,
      issueDate: '14/07/2026',
      correlationKey: UUID_2,
    }).success).toBe(false)
    expect(createProgressClaimDraftSchema.safeParse({
      seriesId: UUID,
      kind: 'progress',
      ...claimDraft,
      issueDate: '2026-02-30',
      dueDate: '2026-03-01',
      correlationKey: UUID_2,
    }).success).toBe(false)
    expect(createProgressClaimDraftSchema.safeParse({
      seriesId: UUID,
      kind: 'progress',
      ...claimDraft,
      dueDate: '2026-07-13',
      correlationKey: UUID_2,
    }).success).toBe(false)
  })

  it('requires UUID local IDs, correlation keys, and idempotency keys', () => {
    expect(linkProgressJobberInvoiceSchema.safeParse({
      seriesId: 'not-a-uuid',
      expectedVersion: 1,
      selectedJobberInvoiceId: 'invoice-node',
      correlationKey: UUID_2,
    }).success).toBe(false)
    expect(refreshProgressJobberInvoiceSchema.safeParse({
      seriesId: UUID,
      expectedVersion: 1,
      idempotencyKey: 'not-a-uuid',
    }).success).toBe(false)
  })

  it('derives Jobber account, client, and numbering values from an observation', () => {
    expect(linkProgressJobberInvoiceSchema.safeParse({
      seriesId: UUID,
      expectedVersion: 1,
      selectedJobberInvoiceId: 'invoice-node',
      selectedJobberJobId: 'job-node',
      selectedJobberPropertyId: 'property-node',
      correlationKey: '33333333-3333-4333-8333-333333333333',
    }).success).toBe(true)

    expect(linkProgressJobberInvoiceSchema.safeParse({
      seriesId: UUID,
      expectedVersion: 1,
      jobberAccountId: 'client-authoritative-account',
      jobberInvoiceId: 'invoice-node',
      jobberClientId: 'client-authoritative-client',
      originalObservedInvoiceNumber: 'INV-100',
      acceptedInvoiceNumberBase: 'INV-100',
      correlationKey: '33333333-3333-4333-8333-333333333333',
    }).success).toBe(false)

    expect(acceptProgressJobberInvoiceNumberSchema.safeParse({
      seriesId: UUID,
      expectedVersion: 1,
      observationId: UUID_2,
      numberSource: 'original',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    }).success).toBe(true)
    expect(acceptProgressJobberInvoiceNumberSchema.safeParse({
      seriesId: UUID,
      expectedVersion: 1,
      observationId: UUID_2,
      acceptedInvoiceNumberBase: 'INV-100',
      numberSource: 'latest',
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    }).success).toBe(false)
  })

  it('bounds external Jobber IDs and keeps refresh free of selector or authority fields', () => {
    expect(linkProgressJobberInvoiceSchema.safeParse({
      seriesId: UUID,
      expectedVersion: 1,
      selectedJobberInvoiceId: 'i'.repeat(513),
      correlationKey: UUID_2,
    }).success).toBe(false)

    expect(refreshProgressJobberInvoiceSchema.safeParse({
      seriesId: UUID,
      expectedVersion: 1,
      idempotencyKey: UUID_2,
    }).success).toBe(true)

    for (const forged of [
      { selectedJobberJobId: 'job-node' },
      { selectedJobberPropertyId: 'property-node' },
      { acknowledgeStaleObservation: true },
      { payments: [] },
      { accountId: 'account-node' },
    ]) {
      expect(refreshProgressJobberInvoiceSchema.safeParse({
        seriesId: UUID,
        expectedVersion: 1,
        idempotencyKey: UUID_2,
        ...forged,
      }).success).toBe(false)
    }
  })

  it('omits expectedVersion for first profile creation and requires it when supplied', () => {
    expect(saveBusinessInvoiceProfileSchema.safeParse(businessProfile).success).toBe(true)
    expect(saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      expectedVersion: 1,
    }).success).toBe(true)
    expect(saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      expectedVersion: 0,
    }).success).toBe(false)
    expect(saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      expectedVersion: null,
    }).success).toBe(false)
  })

  it('requires non-empty reasons for post-issue, void, and reconciliation commands', () => {
    const cases = [
      reviseIssuedProgressClaimSchema.safeParse({
        claimId: UUID,
        expectedVersion: 1,
        ...claimDraft,
        revisionReason: '  ',
        idempotencyKey: UUID_2,
      }),
      voidProgressClaimSchema.safeParse({
        claimId: UUID,
        expectedVersion: 1,
        reason: '',
        idempotencyKey: UUID_2,
      }),
      matchProgressPaymentsSchema.safeParse({
        jobberPaymentId: UUID,
        manualPaymentId: UUID_2,
        jobberExpectedVersion: 1,
        manualExpectedVersion: 1,
        reason: '',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
      }),
      undoProgressPaymentMatchSchema.safeParse({
        jobberPaymentId: UUID,
        manualPaymentId: UUID_2,
        jobberExpectedVersion: 1,
        manualExpectedVersion: 1,
        reason: ' ',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
      }),
    ]
    expect(cases.every((result) => !result.success)).toBe(true)
  })

  it('uses the shared text limits for profile, series, claim, adjustment, payment, and number fields', () => {
    expect(saveBusinessInvoiceProfileSchema.safeParse({
      legalName: 'L'.repeat(PROGRESS_INVOICE_TEXT_LIMITS.legalName + 1),
      abn: '11 222 333 444',
      address: '1 Sample Street',
      email: 'accounts@example.test',
      phone: '0400000000',
      bankName: 'Sample Bank',
      bankAccountName: 'Harbour Example Co',
      bsb: '000-000',
      accountNumber: '12345678',
      gstRate: '0.10',
      businessTimezone: 'Australia/Sydney',
      defaultPaymentTermDays: 14,
      expectedVersion: 1,
    }).success).toBe(false)

    expect(createProgressInvoiceSeriesSchema.safeParse({
      sourceType: 'jobber_invoice',
      baseContractExGst: '1000.00',
      gstRate: '0.10',
      recipientName: 'Recipient',
      recipientAddress: '1 Recipient Street',
      siteName: 'Sample Site',
      siteAddress: '2 Site Street',
      defaultDescription: 'D'.repeat(PROGRESS_INVOICE_TEXT_LIMITS.description + 1),
      reference: 'Ref',
      correlationKey: UUID,
    }).success).toBe(false)

    expect(saveProgressClaimDraftSchema.safeParse({
      claimId: UUID,
      expectedVersion: 1,
      ...claimDraft,
      notes: 'N'.repeat(PROGRESS_INVOICE_TEXT_LIMITS.notes + 1),
      correlationKey: UUID_2,
    }).success).toBe(false)

    expect(supersedeProgressAdjustmentSchema.safeParse({
      adjustmentId: UUID,
      expectedVersion: 1,
      reason: 'R'.repeat(PROGRESS_INVOICE_TEXT_LIMITS.revisionReason + 1),
      replacement: {
        type: 'credit',
        effectiveDate: '2026-07-14',
        description: 'Replacement credit',
        amountExGst: '1.00',
        gstRate: '0.10',
      },
      correlationKey: UUID_2,
    }).success).toBe(false)

    expect(createManualProgressPaymentSchema.safeParse({
      seriesId: UUID,
      receivedDate: '2026-07-14',
      amount: '100.00',
      method: 'M'.repeat(PROGRESS_INVOICE_TEXT_LIMITS.paymentMethod + 1),
      reference: 'Receipt 1',
      correlationKey: UUID_2,
    }).success).toBe(false)

  })

  it('rejects unknown keys on every command envelope and nested object', () => {
    expect(createManualProgressPaymentSchema.safeParse({
      seriesId: UUID,
      receivedDate: '2026-07-14',
      amount: '100.00',
      method: 'EFT',
      correlationKey: UUID_2,
      unexpected: true,
    }).success).toBe(false)
    expect(supersedeProgressAdjustmentSchema.safeParse({
      adjustmentId: UUID,
      expectedVersion: 1,
      reason: 'Correct approved amount',
      replacement: {
        type: 'variation',
        effectiveDate: '2026-07-14',
        description: 'Replacement variation',
        amountExGst: '10.00',
        gstRate: '0.10',
        unexpected: true,
      },
      correlationKey: UUID_2,
    }).success).toBe(false)
  })

  it('covers update, lifecycle, payment revision, and document request envelopes', () => {
    const validCommands = [
      updateProgressInvoiceSeriesSchema.safeParse({
        seriesId: UUID,
        expectedVersion: 1,
        recipientName: 'Updated Recipient',
        correlationKey: UUID_2,
      }),
      updateProgressAdjustmentDraftSchema.safeParse({
        adjustmentId: UUID,
        expectedVersion: 1,
        description: 'Updated draft adjustment',
        correlationKey: UUID_2,
      }),
      approveProgressAdjustmentSchema.safeParse({
        adjustmentId: UUID,
        expectedVersion: 1,
        correlationKey: UUID_2,
      }),
      reviseManualProgressPaymentSchema.safeParse({
        paymentId: UUID,
        expectedVersion: 1,
        receivedDate: '2026-07-14',
        amount: '100.00',
        method: 'EFT',
        reason: 'Correct payment reference',
        correlationKey: UUID_2,
      }),
      voidManualProgressPaymentSchema.safeParse({
        paymentId: UUID,
        expectedVersion: 1,
        reason: 'Entered twice',
        correlationKey: UUID_2,
      }),
      progressInvoiceDocumentRequestSchema.safeParse({
        seriesId: UUID,
        scope: 'current_claim',
        format: 'pdf',
        claimRevisionId: UUID_2,
        correlationKey: '33333333-3333-4333-8333-333333333333',
      }),
    ]
    expect(validCommands.every((result) => result.success)).toBe(true)
  })
})
