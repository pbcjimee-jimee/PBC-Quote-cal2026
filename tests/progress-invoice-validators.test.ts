import { describe, expect, it } from 'vitest'

import { PROGRESS_INVOICE_TEXT_LIMITS } from '@/lib/progress-invoices/types'
import {
  acceptProgressJobberInvoiceNumberSchema,
  approveProgressAdjustmentSchema,
  createManualProgressInvoiceSeriesSchema,
  createManualProgressPaymentSchema,
  createProgressAdjustmentSchema,
  createProgressClaimDraftSchema,
  createStandaloneProgressInvoiceFromJobberSchema,
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

const manualSeriesInput = {
  acceptedNumberingBase: ' 2906 ',
  baseContractExGst: '17220.50',
  recipientName: 'Manual Builder',
  recipientCompany: null,
  recipientAddress: '1 Billing Street',
  recipientEmail: null,
  recipientPhone: null,
  recipientAbn: null,
  siteName: 'Manual Site',
  siteAddress: '4 Site Street',
  defaultDescription: 'Progress painting works',
  reference: null,
  correlationKey: UUID,
}

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
  abn: '99 000 000 000',
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
  const standaloneJobberInput = {
    selectedJobberInvoiceId: 'invoice-1',
    selectedJobberJobId: 'job-1',
    selectedJobberPropertyId: 'property-1',
    baseContractExGst: '17220.50',
    gstRate: '0.10' as const,
    recipientName: ' Edited Builder ',
    recipientCompany: ' ',
    recipientAddress: 'Edited billing address',
    recipientEmail: null,
    recipientPhone: null,
    recipientAbn: null,
    siteName: 'Edited site',
    siteAddress: 'Edited site address',
    defaultDescription: 'Progress painting works',
    reference: 'Jobber 2906',
    correlationKey: UUID,
  }

  it('strictly validates and normalizes browser Manual series input', () => {
    const parsed = createManualProgressInvoiceSeriesSchema.safeParse(manualSeriesInput)

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.acceptedNumberingBase).toBe('2906')
      expect(parsed.data.baseContractExGst).toBe('17220.50')
      expect(parsed.data).not.toHaveProperty('sourceType')
      expect(parsed.data).not.toHaveProperty('gstRate')
    }
  })

  it.each(['sourceType', 'gstRate', 'jobberInvoiceId', 'pbcQuoteId'])(
    'rejects browser-controlled Manual provenance key %s',
    (key) => {
      expect(createManualProgressInvoiceSeriesSchema.safeParse({
        ...manualSeriesInput,
        [key]: key === 'gstRate' ? '0.10' : 'forbidden',
      }).success).toBe(false)
    },
  )

  it('requires positive two-decimal money and bounded local fields for Manual series', () => {
    expect(createManualProgressInvoiceSeriesSchema.safeParse({
      ...manualSeriesInput,
      baseContractExGst: '0.00',
    }).success).toBe(false)
    expect(createManualProgressInvoiceSeriesSchema.safeParse({
      ...manualSeriesInput,
      baseContractExGst: '1.001',
    }).success).toBe(false)
    expect(createManualProgressInvoiceSeriesSchema.safeParse({
      ...manualSeriesInput,
      recipientName: ' ',
    }).success).toBe(false)
    expect(createManualProgressInvoiceSeriesSchema.safeParse({
      ...manualSeriesInput,
      acceptedNumberingBase: 'x'.repeat(121),
    }).success).toBe(false)
  })

  it('validates optional Manual email and normalizes an eleven-digit ABN', () => {
    const parsed = createManualProgressInvoiceSeriesSchema.safeParse({
      ...manualSeriesInput,
      recipientEmail: ' accounts@example.test ',
      recipientAbn: '11 222 333 444',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.recipientEmail).toBe('accounts@example.test')
      expect(parsed.data.recipientAbn).toBe('11222333444')
    }

    for (const recipientEmail of ['not-an-email', 'missing-tld@example', `${'a'.repeat(245)}@example.test`]) {
      expect(createManualProgressInvoiceSeriesSchema.safeParse({
        ...manualSeriesInput,
        recipientEmail,
      }).success).toBe(false)
    }
    for (const recipientAbn of ['1234567890', '123456789012', '12A45678901', '1 2 3 4 5 6 7 8 9 0 1']) {
      expect(createManualProgressInvoiceSeriesSchema.safeParse({
        ...manualSeriesInput,
        recipientAbn,
      }).success).toBe(false)
    }
  })

  it('strictly validates and normalizes standalone Jobber create input', () => {
    const parsed = createStandaloneProgressInvoiceFromJobberSchema.safeParse(standaloneJobberInput)

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.recipientName).toBe('Edited Builder')
      expect(parsed.data.recipientCompany).toBe('')
    }
    expect(createStandaloneProgressInvoiceFromJobberSchema.safeParse({
      ...standaloneJobberInput,
      accountId: 'forged-account',
    }).success).toBe(false)
    expect(createStandaloneProgressInvoiceFromJobberSchema.safeParse({
      ...standaloneJobberInput,
      selectedJobberInvoiceId: undefined,
    }).success).toBe(false)
    expect(createStandaloneProgressInvoiceFromJobberSchema.safeParse({
      ...standaloneJobberInput,
      baseContractExGst: 17220.5,
    }).success).toBe(false)
    expect(createStandaloneProgressInvoiceFromJobberSchema.safeParse({
      ...standaloneJobberInput,
      baseContractExGst: '0.00',
    }).success).toBe(false)
  })

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

  it('canonicalizes checksum-valid Australian supplier ABNs', () => {
    const formatted = saveBusinessInvoiceProfileSchema.safeParse(businessProfile)
    const canonical = saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      abn: '43123456783',
    })

    expect(formatted.success).toBe(true)
    expect(canonical.success).toBe(true)
    if (formatted.success) expect(formatted.data.abn).toBe('99000000000')
    if (canonical.success) expect(canonical.data.abn).toBe('43123456783')
  })

  it.each([
    ['bad checksum', '99000000001'],
    ['too short', '9900000000'],
    ['too long', '990000000000'],
    ['non-digit', '99 000 000 00A'],
  ])('rejects a supplier ABN with %s', (_case, abn) => {
    expect(saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      abn,
    }).success).toBe(false)
  })

  it('enforces fixed invoice literals and payment terms from 0 through 365', () => {
    for (const defaultPaymentTermDays of [0, 365]) {
      expect(saveBusinessInvoiceProfileSchema.safeParse({
        ...businessProfile,
        defaultPaymentTermDays,
      }).success).toBe(true)
    }
    for (const defaultPaymentTermDays of [-1, 366, 1.5]) {
      expect(saveBusinessInvoiceProfileSchema.safeParse({
        ...businessProfile,
        defaultPaymentTermDays,
      }).success).toBe(false)
    }
    expect(saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      gstRate: '0.11',
    }).success).toBe(false)
    expect(saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      businessTimezone: 'UTC',
    }).success).toBe(false)
  })

  it('requires every approved profile field while allowing bounded optional fields to be blank', () => {
    const optionalBlank = saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      tradingName: ' ',
      contractorLicence: '',
    })
    expect(optionalBlank.success).toBe(true)
    if (optionalBlank.success) {
      expect(optionalBlank.data.tradingName).toBe('')
      expect(optionalBlank.data.contractorLicence).toBe('')
    }

    for (const requiredField of [
      'legalName', 'abn', 'address', 'email', 'phone', 'bankName',
      'bsb', 'bankAccountName', 'accountNumber',
    ] as const) {
      expect(saveBusinessInvoiceProfileSchema.safeParse({
        ...businessProfile,
        [requiredField]: ' ',
      }).success).toBe(false)
    }

    expect(saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      tradingName: 'T'.repeat(PROGRESS_INVOICE_TEXT_LIMITS.tradingName + 1),
    }).success).toBe(false)
    expect(saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      contractorLicence: 'L'.repeat(PROGRESS_INVOICE_TEXT_LIMITS.contractorLicence + 1),
    }).success).toBe(false)
  })

  it('preserves approved BSB punctuation and account-number text without stronger banking rules', () => {
    const parsed = saveBusinessInvoiceProfileSchema.safeParse({
      ...businessProfile,
      bsb: '12-3.A',
      accountNumber: 'ABC 123/9',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.bsb).toBe('12-3.A')
      expect(parsed.data.accountNumber).toBe('ABC 123/9')
    }
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

    expect(createManualProgressInvoiceSeriesSchema.safeParse({
      ...manualSeriesInput,
      defaultDescription: 'D'.repeat(PROGRESS_INVOICE_TEXT_LIMITS.description + 1),
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
